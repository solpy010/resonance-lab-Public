import { RL } from '../core/rl.js';
import { FXN, FX_GLSL } from './fx_glsl.js';
import * as webgl from '../gl.js';
import * as fxlib from '../fx.js';
// RHYTHM — 리듬게임 인게임: 마커 시점에 노트가 심벌에 '닿고', 그때 이펙트가 터지며, 누적될수록 심벌이 화려해짐.
// 전부 시간의 함수(무상태) → 어느 프레임을 다시 렌더해도 동일. 노트 도착/이펙트 시점은 각각 싱크 슬라이더로 조정.
// 셰이더 이펙트 14종(6 카테고리) + 다중참여 이펙트(참여 인원·빈도·통일↔무분별·크기 편차·퍼짐 반경·시드).

// 이펙트 카탈로그 — pal: [하이라이트, 주색, 보조색] (첨부 레퍼런스의 색감)
const FX_CATS = [['burst', '① 섬광·방사'], ['spin', '② 회전·궤도'], ['petal', '③ 꽃잎·날개'], ['round', '④ 원·버블'], ['energy', '⑤ 에너지·유체'], ['confetti', '⑥ 조각·컨페티']];
const FX_STYLES = [
  { id: 'sun', cat: 'burst', name: '태양 섬광', pal: ['#fffbe8', '#ffb347', '#ff5f8a'] },
  { id: 'spike', cat: 'burst', name: '스파이크 파편', pal: ['#ffffff', '#3fc4ff', '#ffc65c'] },
  { id: 'impact', cat: 'burst', name: '충격 별', pal: ['#fffdf0', '#ffb23e', '#ff3d8b'] },
  { id: 'vortex', cat: 'spin', name: '소용돌이', pal: ['#fff4d6', '#36c8ff', '#ffb55a'] },
  { id: 'atom', cat: 'spin', name: '원자 궤도', pal: ['#ffffff', '#4a9dff', '#ff9a3c'] },
  { id: 'blade', cat: 'petal', name: '4엽 블레이드', pal: ['#fff0e0', '#a04dff', '#ff9a3d'] },
  { id: 'petal', cat: 'petal', name: '꽃잎 회오리', pal: ['#fff0f6', '#c45cff', '#ff9a4a'] },
  { id: 'bubble', cat: 'round', name: '버블', pal: ['#ffffff', '#2ec8ff', '#e8f04a'] },
  { id: 'rings', cat: 'round', name: '링 군집', pal: ['#ffffff', '#ff5fd2', '#6a7dff'] },
  { id: 'ember', cat: 'round', name: '불씨 점', pal: ['#fff6e6', '#ff7a2e', '#ff2e4d'] },
  { id: 'plasma', cat: 'energy', name: '플라즈마 구체', pal: ['#ffffff', '#ff4fb4', '#b04dff'] },
  { id: 'ink', cat: 'energy', name: '잉크 확산', pal: ['#ffffff', '#2fb6ff', '#d9a35c'] },
  { id: 'ribbon', cat: 'energy', name: '리본 실타래', pal: ['#ffffff', '#4fd6d6', '#d8b48a'] },
  { id: 'confetti', cat: 'confetti', name: '사각 컨페티', pal: ['#ffd166', '#4fe3d1', '#ff6fb5'] },
];
const FX_IDX = {}; FX_STYLES.forEach((s, i) => FX_IDX[s.id] = i);
const isShader = (P) => P.effectType === 'shader';
const styleSchema = FX_CATS.map(([c, cn]) => ({
  id: 'fxStyle_' + c, when: (P) => isShader(P) && P.fxCat === c, label: cn + ' — 종류', type: 'select',
  options: (FX_STYLES.filter(s => s.cat === c).length > 1 ? [['mix', '이 카테고리 안에서 섞기']] : []).concat(FX_STYLES.filter(s => s.cat === c).map(s => [s.id, s.name])),
  default: FX_STYLES.filter(s => s.cat === c).length > 1 ? 'mix' : FX_STYLES.find(s => s.cat === c).id, group: '이펙트', rerender: true,
}));

// 색 유틸: 색조 회전(YIQ)
function hueRot(c, deg) {
  if (!deg) return c;
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], i = 0.596 * c[0] - 0.274 * c[1] - 0.322 * c[2], q = 0.211 * c[0] - 0.523 * c[1] + 0.312 * c[2];
  const i2 = i * cs - q * sn, q2 = i * sn + q * cs;
  return [y + 0.956 * i2 + 0.621 * q2, y - 0.272 * i2 - 0.647 * q2, y - 1.106 * i2 + 1.703 * q2].map(v => Math.max(0, Math.min(1, v)));
}

RL.modules.rhythm = {
  label: '리듬게임', icon: '♪', blend: 'over',
  schema: [
    { id: 'showSymbol', label: '심벌 표시', type: 'bool', default: true, group: '표시' },
    { id: 'showNotes', label: '노트 표시', type: 'bool', default: true, group: '표시' },
    { id: 'showEffects', label: '이펙트 표시', type: 'bool', default: true, group: '표시' },
    { id: 'showLanes', label: '노트 길(레인) 표시', type: 'bool', default: false, group: '표시' },
    // sync
    { id: 'noteOffset', label: '노트 도착 싱크(ms)', type: 'range', min: -1000, max: 1000, step: 1, default: 0, group: '동기화', hint: '마커(소리) 시점 대비 노트가 심벌에 닿는 시점. −는 더 일찍, +는 더 늦게' },
    { id: 'effectOffset', label: '이펙트 터짐 싱크(ms)', type: 'range', min: -1000, max: 1000, step: 1, default: 0, group: '동기화', hint: '마커 시점 대비 이펙트가 터지는 시점' },
    { id: 'fallTime', label: '노트 낙하 시간(초)', type: 'range', min: 0.2, max: 5, step: 0.01, default: 1.2, group: '동기화', hint: '화면 위에서 심벌까지 걸리는 시간 = 노트는 마커보다 이만큼 먼저 출발' },
    { id: 'minGap', label: '마커 최소 간격(ms)', type: 'range', min: 0, max: 1000, step: 1, default: 0, group: '동기화', hint: '너무 촘촘한 마커를 건너뜀' },
    { id: 'minStrength', label: '약한 마커 무시', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0, group: '동기화' },
    // symbol
    { id: 'symbolFaces', label: '심벌 위치 면(비우면 가로 위치값)', type: 'text', default: '', group: '심벌' },
    { id: 'symbolX', label: '심벌 가로 위치', type: 'range', min: 0, max: 1, step: 0.001, default: 0.5, group: '심벌', key: true },
    { id: 'symbolY', label: '심벌 높이', type: 'range', min: 0, max: 1, step: 0.001, default: 0.36, group: '심벌', key: true },
    { id: 'symbolSize', label: '심벌 크기(px)', type: 'range', min: 20, max: 2000, step: 1, default: 420, group: '심벌', key: true },
    { id: 'symbolAsset', label: '심벌 이미지/영상', type: 'asset', default: '', group: '심벌', hint: '비우면 기본 베이스(기타) 라인아트' },
    { id: 'symbolColor', label: '기본 색', type: 'color', default: '#b98cff', group: '심벌' },
    { id: 'symbolHot', label: '누적 최고조 색', type: 'color', default: '#ff5fd2', group: '심벌' },
    { id: 'tintAsset', label: '이미지에 색 입히기', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '심벌', hint: '첨부 이미지는 0이면 원본색' },
    { id: 'symbolGlow', label: '심벌 글로우', type: 'range', min: 0, max: 2, step: 0.01, default: 0.7, group: '심벌', key: true },
    { id: 'pulse', label: '타격 시 튕김', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.08, group: '심벌' },
    { id: 'energyGain', label: '누적 증가(타격당)', type: 'range', min: 0, max: 1, step: 0.005, default: 0.05, group: '심벌', hint: '타격이 쌓일수록 심벌이 화려해지는 속도' },
    { id: 'energyDecay', label: '누적 감소(초당)', type: 'range', min: 0, max: 2, step: 0.005, default: 0.01, group: '심벌' },
    { id: 'energyBase', label: '시작 화려함', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '심벌', key: true },
    { id: 'aura', label: '오라 고리 최대 수', type: 'range', min: 0, max: 12, step: 1, default: 5, group: '심벌' },
    { id: 'orbit', label: '맴도는 반짝임 최대 수', type: 'range', min: 0, max: 120, step: 1, default: 40, group: '심벌' },
    // notes
    { id: 'noteShape', label: '노트 모양', type: 'select', options: [['tri', '삼각(빈)'], ['triFill', '삼각(채움)'], ['diamond', '마름모'], ['circle', '원'], ['ring', '고리'], ['bar', '막대'], ['image', '첨부 이미지']], default: 'tri', group: '노트' },
    { id: 'noteAsset', label: '노트 이미지/영상', type: 'asset', default: '', group: '노트' },
    { id: 'noteSize', label: '노트 크기(px)', type: 'range', min: 4, max: 400, step: 1, default: 72, group: '노트', key: true },
    { id: 'noteColor', label: '노트 색', type: 'color', default: '#ffffff', group: '노트' },
    { id: 'lanes', label: '레인 수', type: 'range', min: 1, max: 9, step: 1, default: 3, group: '노트' },
    { id: 'laneSpread', label: '레인 간격(위쪽)', type: 'range', min: 0, max: 1, step: 0.005, default: 0.16, group: '노트' },
    { id: 'converge', label: '심벌로 모임', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, group: '노트' },
    { id: 'startY', label: '노트 출발 높이', type: 'range', min: 0.5, max: 1.4, step: 0.01, default: 1.08, group: '노트' },
    { id: 'hitY', label: '닿는 지점(심벌 기준 위쪽)', type: 'range', min: -0.5, max: 0.5, step: 0.005, default: 0.08, group: '노트' },
    { id: 'trail', label: '노트 꼬리', type: 'range', min: 0, max: 1, step: 0.01, default: 0.22, group: '노트' },
    { id: 'noteGlow', label: '노트 광채', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '노트' },
    // effects
    { id: 'effectType', label: '이펙트 방식', type: 'select', rerender: true, options: [['shader', '셰이더 이펙트 (카테고리 14종)'], ['random', '기본 — 랜덤 조합'], ['ring', '기본 — 고리'], ['rays', '기본 — 방사광'], ['shards', '기본 — 파편'], ['sparks', '기본 — 스파크'], ['flash', '기본 — 섬광'], ['image', '첨부 이미지/영상']], default: 'shader', group: '이펙트', hint: '셰이더 이펙트: 섬광·방사 / 회전·궤도 / 꽃잎·날개 / 원·버블 / 에너지·유체 / 조각·컨페티' },
    { id: 'fxCat', when: isShader, label: '이펙트 카테고리', type: 'select', rerender: true, options: [['all', '전체 섞기 (14종 모두)']].concat(FX_CATS), default: 'burst', group: '이펙트' },
    ...styleSchema,
    { id: 'fxPick', when: isShader, label: '섞을 때 고르는 순서', type: 'select', options: [['random', '마커마다 무작위'], ['cycle', '순서대로 돌아가며']], default: 'random', group: '이펙트' },
    { id: 'effectAsset', when: (P) => P.effectType === 'image', label: '이펙트 이미지/영상', type: 'asset', default: '', group: '이펙트' },
    { id: 'effectSize', label: '이펙트 크기(px)', type: 'range', min: 20, max: 3000, step: 1, default: 420, group: '이펙트', key: true },
    { id: 'effectLife', label: '이펙트 지속(초)', type: 'range', min: 0.1, max: 4, step: 0.01, default: 0.75, group: '이펙트' },
    { id: 'effectCount', when: (P) => !isShader(P), label: '파편·스파크 수', type: 'range', min: 2, max: 120, step: 1, default: 22, group: '이펙트' },
    { id: 'energyScale', label: '누적될수록 이펙트 커짐', type: 'range', min: 0, max: 3, step: 0.01, default: 0.6, group: '이펙트' },
    { id: 'fxSpin', when: isShader, label: '회전 속도·방향', type: 'range', min: -3, max: 3, step: 0.01, default: 1, group: '이펙트', hint: '소용돌이·궤도·꽃잎·플라즈마의 회전. −면 반대 방향' },
    { id: 'fxDensity', when: isShader, label: '요소 수(밀도)', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, group: '이펙트', hint: '버블·링·불씨·리본·컨페티 개수' },
    { id: 'fxThick', when: isShader, label: '선 굵기', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1, group: '이펙트' },
    { id: 'fxGlow', when: isShader, label: '광채', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '이펙트' },
    { id: 'fxBlend', when: isShader, label: '합성 방식', type: 'select', options: [['add', '더하기 (빛)'], ['screen', '스크린'], ['over', '덮기 (불투명)']], default: 'add', group: '이펙트' },
    { id: 'keepInside', label: '화면 밖으로 안 나가게', type: 'bool', default: true, group: '이펙트', hint: '이펙트가 화면 가장자리에 닿으면 안쪽으로 밀고, 너무 크면 줄임' },
    { id: 'insideMargin', when: (P) => P.keepInside, label: '가장자리 여백(px)', type: 'range', min: 0, max: 300, step: 1, default: 12, group: '이펙트' },
    // colours
    { id: 'fxColorMode', when: isShader, label: '이펙트 색', type: 'select', rerender: true, options: [['preset', '레퍼런스 원본 색감'], ['palette', '이펙트 팔레트 사용'], ['mono', '단색 (팔레트 첫 색)']], default: 'preset', group: '이펙트' },
    { id: 'effectColors', when: (P) => !isShader(P) || P.fxColorMode !== 'preset', label: '이펙트 팔레트', type: 'colors', default: ['#ffffff', '#c9a8ff', '#ff7ad9', '#8fe9ff'], group: '이펙트' },
    { id: 'fxHue', when: isShader, label: '색조 회전(°)', type: 'range', min: -180, max: 180, step: 1, default: 0, group: '이펙트', key: true },
    { id: 'fxColorVar', when: isShader, label: '터질 때마다 색 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, group: '이펙트' },
    // multi-participation
    { id: 'crowdOn', label: '다중참여 이펙트 켜기', type: 'bool', default: true, group: '다중참여', rerender: true, hint: '체험 참여자들이 함께 칠 때 심벌 주변에서 추가로 터지는 이펙트' },
    { id: 'crowd', when: (P) => P.crowdOn, label: '참여 인원(명)', type: 'range', min: 0, max: 200, step: 1, default: 12, group: '다중참여', key: true, hint: '키프레임으로 참여자가 늘고 줄어드는 흐름을 연출' },
    { id: 'crowdRate', when: (P) => P.crowdOn, label: '1인당 참여 빈도(마커마다)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '다중참여', key: true, hint: '마커(노트)마다 한 사람이 같이 칠 확률' },
    { id: 'crowdFree', when: (P) => P.crowdOn, label: '박자 사이 자유 참여(초당/인)', type: 'range', min: 0, max: 2, step: 0.01, default: 0.05, group: '다중참여', key: true, hint: '노트와 상관없이 제멋대로 치는 빈도' },
    { id: 'crowdSync', when: (P) => P.crowdOn, label: '터지는 방식 (0 무분별 ↔ 1 통일)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '다중참여', key: true, hint: '1: 마커 순간 함께, 같은 종류·같은 방향으로 고르게 배치. 0: 시간·종류·위치·방향이 제각각' },
    { id: 'crowdStyle', when: (P) => P.crowdOn, label: '참여 이펙트 종류', type: 'select', options: [['main', '메인 이펙트와 같은 종류'], ['cat', '같은 카테고리 안에서 섞기'], ['all', '14종 전체에서 섞기']], default: 'cat', group: '다중참여' },
    { id: 'crowdSize', when: (P) => P.crowdOn, label: '크기(메인 이펙트 대비)', type: 'range', min: 0.05, max: 1.5, step: 0.01, default: 0.4, group: '다중참여', key: true },
    { id: 'sizeRand', when: (P) => P.crowdOn, label: '크기 무작위 적용', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '다중참여', hint: '0이면 모두 같은 크기' },
    { id: 'sizeVar', when: (P) => P.crowdOn, label: '크기 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '다중참여', hint: '1에 가까울수록 아주 작은 것과 아주 큰 것이 섞임' },
    { id: 'crowdSpread', when: (P) => P.crowdOn, label: '퍼짐 반경(심벌 크기 배)', type: 'range', min: 0, max: 4, step: 0.01, default: 1.1, group: '다중참여', key: true, hint: '심벌 중심에서 얼마나 멀리까지 퍼지는지' },
    { id: 'crowdInner', when: (P) => P.crowdOn, label: '중심 비움', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0.3, group: '다중참여', hint: '심벌 바로 위는 비워 두는 비율' },
    { id: 'crowdLife', when: (P) => P.crowdOn, label: '지속(메인 대비)', type: 'range', min: 0.2, max: 2, step: 0.01, default: 0.85, group: '다중참여' },
    { id: 'crowdBright', when: (P) => P.crowdOn, label: '밝기', type: 'range', min: 0, max: 2, step: 0.01, default: 0.8, group: '다중참여', key: true },
    { id: 'crowdSeed', when: (P) => P.crowdOn, label: '시드', type: 'range', min: 0, max: 9999, step: 1, default: 1, group: '다중참여', hint: '같은 설정에서 위치·종류·타이밍 배열만 바꿈' },
    { id: 'crowdMax', when: (P) => P.crowdOn, label: '동시에 보이는 최대 수', type: 'range', min: 4, max: 240, step: 1, default: 96, group: '다중참여', hint: '많을수록 무거워짐' },
    { id: 'intensity', label: '전체 밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
  ],
  create(engine, L) {
    const gl = engine.gl;
    let fxProg = null;
    const getProg = () => fxProg || (fxProg = webgl.program(gl, FX_GLSL));
    const B = { d0: new Float32Array(FXN * 4), d1: new Float32Array(FXN * 4), d2: new Float32Array(FXN * 4), c0: new Float32Array(FXN * 3), c1: new Float32Array(FXN * 3), c2: new Float32Array(FXN * 3) };
    const kv = (id, t, P) => (L.keys && L.keys[id] && L.keys[id].length) ? RL.evalKeys(L.keys[id], t, P[id]) : P[id];
    const inst = {
      reset(rng, P) { this.now = 0; this.cacheKey = ''; },
      step(dt, t, evs, P, rawDt) { this.now = t + (rawDt || dt); },
      hits(P) {
        const ms = engine.project.markers || [];
        const key = ms.length + ':' + (ms.length ? ms[ms.length - 1].t : 0) + ':' + P.minGap + ':' + P.minStrength + ':' + P.lanes + ':' + engine.project.seed;
        if (key === this.cacheKey) return this.cache;
        const out = []; let last = -1e9;
        ms.forEach((m, i) => {
          const s = m.s ?? 1;
          if (s < P.minStrength) return;
          if ((m.t - last) * 1000 < P.minGap) return;
          last = m.t;
          const r = webgl.rng(webgl.hashSeed(engine.project.seed, L.id, 'hit', i));
          out.push({ t: m.t, s, lane: r.int(Math.max(1, Math.round(P.lanes))), seed: webgl.hashSeed(engine.project.seed, L.id, 'fx', i), i });
        });
        out.forEach((h, k) => h.k = k);
        this.cache = out; this.cacheKey = key; return out;
      },
      symbols(P) {
        const n = engine.project.faces, f = RL.parseFaces(P.symbolFaces, n);
        return f.length ? f.map(i => (i + 0.5) / n) : [P.symbolX];
      },
      // ---- 셰이더 이펙트: 종류 고르기 / 색 / 화면 안 제한
      pool(P) {
        if (P.fxCat === 'all' || !P.fxCat) return FX_STYLES.map((s, i) => i);
        const v = P['fxStyle_' + P.fxCat];
        if (v && v !== 'mix' && FX_IDX[v] != null) return [FX_IDX[v]];
        return FX_STYLES.map((s, i) => i).filter(i => FX_STYLES[i].cat === P.fxCat);
      },
      mainStyle(P, h, pool) {
        if (pool.length === 1) return pool[0];
        if (P.fxPick === 'cycle') return pool[h.k % pool.length];
        return pool[webgl.rng(webgl.hashSeed(h.seed, 'style')).int(pool.length)];
      },
      colors(P, st, r) {
        let c;
        if (P.fxColorMode === 'palette' || P.fxColorMode === 'mono') {
          const pal = (P.effectColors && P.effectColors.length ? P.effectColors : ['#ffffff']).map(webgl.hexToRgb);
          if (P.fxColorMode === 'mono') { const b = pal[0]; c = [b.map(v => v + (1 - v) * 0.65), b, b.map(v => v * 0.7)]; }
          else { const o = Math.floor(r() * pal.length); c = [pal[o % pal.length], pal[(o + 1) % pal.length], pal[(o + 2) % pal.length]]; }
        } else c = FX_STYLES[st].pal.map(webgl.hexToRgb);
        const hue = (P.fxHue || 0) + (r() - 0.5) * 120 * (P.fxColorVar || 0);
        return c.map(x => hueRot(x, hue));
      },
      fit(P, x, y, R) {       // px 단위. 이펙트 전체(반지름 R 원)가 화면 안에 들도록
        if (!P.keepInside) return [x, y, R];
        const W = engine.docW, H = engine.docH, m = Math.max(0, P.insideMargin || 0);
        R = Math.max(2, Math.min(R, W / 2 - m, H / 2 - m));
        return [Math.min(Math.max(x, R + m), W - R - m), Math.min(Math.max(y, R + m), H - R - m), R];
      },
      shaderFx(P, hits, syms, eOff, hitY, T, energyAt) {
        const W = engine.docW, H = engine.docH, list = [], pool = this.pool(P);
        const life = Math.max(0.05, P.effectLife);
        // 메인 타격 이펙트
        for (const h of hits) {
          const te = h.t + eOff, age = (T - te) / life;
          if (age < 0 || age >= 1) continue;
          const st = this.mainStyle(P, h, pool), r = webgl.rng(webgl.hashSeed(h.seed, 'main'));
          const size = P.effectSize * (1 + P.energyScale * energyAt(te)) * (0.7 + 0.3 * Math.min(1.5, h.s));
          syms.forEach((sx, si) => {
            const [x, y, R] = this.fit(P, sx * W + (r() - 0.5) * 0.02 * H, (hitY - P.hitY * 0.5) * H, size * 0.5);
            list.push({ x, y, R, age, st, s: r(), rot: r() * 6.283, int: P.intensity, cols: this.colors(P, st, r), main: 1 });
          });
        }
        // 다중참여 이펙트
        if (P.crowdOn) {
          const crowd = [], lifeC = life * Math.max(0.05, P.crowdLife), seed = Math.round(P.crowdSeed || 0);
          const sync = Math.max(0, Math.min(1, P.crowdSync)), jMax = 0.45;
          const symY = P.symbolY * H, spread = Math.max(0, P.crowdSpread) * P.symbolSize, inner = spread * Math.max(0, Math.min(0.95, P.crowdInner));
          const spawn = (r, t0, j, nC, mainSt, hitSeed, hitRot, sx, si) => {
            const age = (T - t0) / lifeC;
            if (age < 0 || age >= 1) return;
            let st;
            if (P.crowdStyle === 'main' || r() < sync) st = mainSt;
            else if (P.crowdStyle === 'all') st = r.int(FX_STYLES.length);
            else { const cp = FX_STYLES.map((s, i) => i).filter(i => FX_STYLES[i].cat === FX_STYLES[mainSt].cat); st = cp[r.int(cp.length)]; }
            let ang, rad;
            if (r() < sync) { ang = hitRot + (j + 0.5) / Math.max(1, nC) * 6.2832; rad = inner + (spread - inner) * (0.55 + 0.35 * ((j * 0.618) % 1)); }
            else { ang = r() * 6.2832; rad = inner + (spread - inner) * Math.sqrt(r()); }
            const v = r(), f = Math.exp((v * 2 - 1) * Math.max(0, P.sizeVar) * 1.6);
            const size = P.effectSize * P.crowdSize * (1 + (f - 1) * Math.max(0, Math.min(1, P.sizeRand)));
            const uni = r() < sync;
            // 퍼짐이 화면보다 크면 경계에 붙이지 않고 화면 비율대로 눌러 담음(타원)
            let dx = Math.cos(ang) * rad, dy = Math.sin(ang) * rad;
            if (P.keepInside && spread > 0) {
              const m = Math.max(0, P.insideMargin || 0), Rr = Math.min(size * 0.5, H / 2 - m), cx = sx * W;
              const ay = Math.max(0, (dy > 0 ? H - symY : symY) - m - Rr), ax = Math.max(0, (dx > 0 ? W - cx : cx) - m - Rr);
              dy *= Math.min(1, ay / spread); dx *= Math.min(1, ax / spread);
            }
            const [x, y, R] = this.fit(P, sx * W + dx, symY + dy, size * 0.5);
            crowd.push({ x, y, R, age, st, s: uni ? hitSeed : r(), rot: uni ? hitRot : r() * 6.283, int: P.intensity * P.crowdBright, cols: this.colors(P, st, r) });
          };
          for (const h of hits) {
            const te = h.t + eOff;
            if (te > T || te + jMax + lifeC < T) continue;
            const nC = Math.max(0, Math.round(kv('crowd', h.t, P))), rate = kv('crowdRate', h.t, P);
            const mainSt = this.mainStyle(P, h, pool), hr = webgl.rng(webgl.hashSeed(seed, L.id, 'hit', h.i));
            const hitSeed = hr(), hitRot = hr() * 6.2832;
            syms.forEach((sx, si) => {
              for (let j = 0; j < nC; j++) {
                const r = webgl.rng(webgl.hashSeed(seed, L.id, 'c', h.i, j, si));
                if (r() >= rate) continue;
                spawn(r, te + (1 - sync) * r() * jMax, j, nC, mainSt, hitSeed, hitRot, sx, si);
              }
            });
          }
          const wnd = 0.25, w0 = Math.floor((T - lifeC) / wnd), w1 = Math.floor(T / wnd);
          for (let w = w0; w <= w1; w++) {
            const tw = w * wnd; if (tw + wnd < 0) continue;
            const nC = Math.max(0, Math.round(kv('crowd', tw, P))), fr = kv('crowdFree', tw, P) * wnd;
            if (fr <= 0) continue;
            const wr = webgl.rng(webgl.hashSeed(seed, L.id, 'w', w));
            const mainSt = pool[wr.int(pool.length)], wSeed = wr(), wRot = wr() * 6.2832;
            syms.forEach((sx, si) => {
              for (let j = 0; j < nC; j++) {
                const r = webgl.rng(webgl.hashSeed(seed, L.id, 'f', w, j, si));
                if (r() >= fr) continue;
                spawn(r, tw + r() * wnd, j, nC, mainSt, wSeed, wRot, sx, si);
              }
            });
          }
          crowd.sort((a, b) => a.age - b.age);
          crowd.length = Math.min(crowd.length, Math.round(P.crowdMax || 96));
          list.unshift(...crowd);
        }
        return list;
      },
      drawShader(target, P, list) {
        if (!list.length) return;
        const prog = getProg(), W = engine.docW, H = engine.docH;
        const spin = P.fxSpin ?? 1, dens = P.fxDensity ?? 1;
        for (let o = 0; o < list.length; o += FXN) {
          const n = Math.min(FXN, list.length - o);
          for (let k = 0; k < n; k++) {
            const e = list[o + k];
            B.d0.set([e.x, e.y, e.R, e.age], k * 4);
            B.d1.set([FX_IDX[FX_STYLES[e.st].id], e.s, e.rot, e.int], k * 4);
            B.d2.set([spin, dens, 0, 0], k * 4);
            B.c0.set(e.cols[0], k * 3); B.c1.set(e.cols[1], k * 3); B.c2.set(e.cols[2], k * 3);
          }
          webgl.draw(gl, prog, target, { N: n, THK: P.fxThick ?? 1, GLW: P.fxGlow ?? 1, RES: [W, H], d0: B.d0, d1: B.d1, d2: B.d2, c0: B.c0, c1: B.c1, c2: B.c2 }, P.fxBlend || 'add');
        }
      },
      render(target, P) {
        webgl.clear(gl, target);
        const T = this.now, A = engine.aspect, docH = engine.docH;
        const hits = this.hits(P), syms = this.symbols(P);
        const nOff = P.noteOffset / 1000, eOff = P.effectOffset / 1000;
        // accumulated energy + last hit age (effect timeline)
        let E = P.energyBase, lastAge = 1e9;
        for (const h of hits) { const te = h.t + eOff; if (te <= T) { E += P.energyGain * h.s * Math.exp(-(T - te) * P.energyDecay); lastAge = Math.min(lastAge, T - te); } }
        E = Math.min(1, Math.max(0, E));
        const energyAt = (te) => { let Eh = P.energyBase; for (const g of hits) { const tg = g.t + eOff; if (tg < te) Eh += P.energyGain * g.s * Math.exp(-(te - tg) * P.energyDecay); else break; } return Math.min(1, Eh); };
        const sb = engine.sprites, sg = engine.segs, tb = engine.texb;
        const nc = webgl.hexToRgb(P.noteColor), fxCols = (P.effectColors && P.effectColors.length ? P.effectColors : ['#ffffff']).map(webgl.hexToRgb);
        const lanes = Math.max(1, Math.round(P.lanes));
        const symY = P.symbolY, hitY = symY + P.hitY;
        const laneX = (sx, lane, p) => { const off = (lane - (lanes - 1) / 2) * P.laneSpread / A; return sx + off * (1 - P.converge * p); };
        // ---------- lanes
        if (P.showLanes) {
          sg.begin();
          for (const sx of syms) for (let l = 0; l < lanes; l++) sg.push(laneX(sx, l, 0), P.startY, laneX(sx, l, 1), hitY, 1.5, 8, nc[0], nc[1], nc[2], 0.12 * P.intensity, 0, 0, 0, 0);
          sg.flush(target, engine.docW, 'screen');
        }
        // ---------- notes
        if (P.showNotes) {
          const noteAsset = P.noteShape === 'image' ? engine.asset(P.noteAsset) : null;
          sg.begin(); sb.begin(); tb.begin();
          for (const h of hits) {
            const ta = h.t + nOff, t0 = ta - P.fallTime;
            if (T < t0 || T > ta) continue;
            const p = (T - t0) / P.fallTime;
            for (const sx of syms) {
              const x = laneX(sx, h.lane, p), y = P.startY + (hitY - P.startY) * p;
              const a = Math.min(1, p * 6) * P.intensity;
              if (P.trail > 0) {
                const p2 = Math.max(0, p - P.trail), x2 = laneX(sx, h.lane, p2), y2 = P.startY + (hitY - P.startY) * p2;
                const segs = 8;
                for (let k = 0; k < segs; k++) {
                  const q0 = k / segs, q1 = (k + 1) / segs;
                  sg.push(x2 + (x - x2) * q0, y2 + (y - y2) * q0, x2 + (x - x2) * q1, y2 + (y - y2) * q1, P.noteSize * 0.08, P.noteSize * 0.12, nc[0], nc[1], nc[2], a * q1 * 0.6, 0.5, 0, 0, 0);
                }
              }
              if (noteAsset) {
                const fr = noteAsset.frames > 1 ? Math.floor(T * (noteAsset.fps || 24)) : 0, [u0, v0, u1, v1] = webgl.atlasUV(noteAsset, fr);
                const asp = (noteAsset.w / noteAsset.cols) / (noteAsset.h / noteAsset.rows);
                tb.push(x, y, P.noteSize * asp, P.noteSize, 0, 1, 1, 1, a, u0, v0, u1, v1, noteAsset.luma);
              } else {
                const shape = { tri: 2, triFill: 2, diamond: 6, circle: 1, ring: 3, bar: 0 }[P.noteShape] ?? 2;
                const ol = P.noteShape === 'tri' ? 0.22 : 0;
                const w = P.noteShape === 'bar' ? P.noteSize * 1.6 : P.noteSize, hh = P.noteShape === 'bar' ? P.noteSize * 0.35 : P.noteSize;
                sb.push(x, y, w, hh, (shape === 2 ? Math.PI : 0), nc[0], nc[1], nc[2], a, shape, 0.04, P.noteGlow, ol);
              }
            }
          }
          sg.flush(target, engine.docW, 'screen'); sb.flush(target, engine.docW, 'over');
          if (noteAsset) tb.flush(target, engine.docW, noteAsset.tex, 'over');
        }
        // ---------- symbol
        if (P.showSymbol) {
          const a0 = engine.asset(P.symbolAsset);
          const base = webgl.hexToRgb(P.symbolColor), hot = webgl.hexToRgb(P.symbolHot);
          const col = [base[0] + (hot[0] - base[0]) * E, base[1] + (hot[1] - base[1]) * E, base[2] + (hot[2] - base[2]) * E];
          const kick = 1 + P.pulse * Math.exp(-lastAge * 9) * (0.6 + E);
          for (const sx of syms) {
            const S = P.symbolSize * kick;
            // aura rings
            sb.begin();
            const nA = Math.round(P.aura * E);
            for (let k = 0; k < nA; k++) {
              const ph = ((T * 0.35 + k / Math.max(1, nA)) % 1);
              const rad = S * (0.55 + ph * 0.9);
              sb.push(sx, symY, rad, rad, 0, col[0], col[1], col[2], (1 - ph) * 0.4 * E * P.intensity, 1, 0.01, 0.3, 0.012);
            }
            // orbit sparkles
            const nO = Math.round(P.orbit * E);
            for (let k = 0; k < nO; k++) {
              const r = webgl.rng(webgl.hashSeed(L.id, 'orb', k)); const sp = 0.3 + r() * 0.9, rr = S * (0.42 + r() * 0.38), ang = r() * 6.283 + T * sp * (r() < 0.5 ? -1 : 1);
              const c = fxCols[k % fxCols.length], tw = 0.5 + 0.5 * Math.sin(T * (3 + r() * 5) + k);
              sb.push(sx + Math.cos(ang) * rr / docH / A, symY + Math.sin(ang) * rr * 0.62 / docH, S * 0.018 * (0.6 + r()), S * 0.018 * (0.6 + r()), 0, c[0], c[1], c[2], tw * E * P.intensity, 1, 0.5, 0.8, 0);
            }
            sb.flush(target, engine.docW, 'add');
            tb.begin();
            if (a0) {
              const fr = a0.frames > 1 ? Math.floor(T * (a0.fps || 24)) : 0, [u0, v0, u1, v1] = webgl.atlasUV(a0, fr);
              const asp = (a0.w / a0.cols) / (a0.h / a0.rows);
              const tint = P.tintAsset, tc = [1 + (col[0] - 1) * tint, 1 + (col[1] - 1) * tint, 1 + (col[2] - 1) * tint];
              tb.push(sx, symY, S * asp * 1.12, S * 1.12, 0, col[0], col[1], col[2], P.symbolGlow * (0.15 + E * 0.6) * P.intensity, u0, v0, u1, v1, a0.luma);
              tb.flush(target, engine.docW, a0.tex, 'add');
              tb.push(sx, symY, S * asp, S, 0, tc[0], tc[1], tc[2], P.intensity, u0, v0, u1, v1, a0.luma);
              tb.flush(target, engine.docW, a0.tex, 'over');
            } else {
              const g = engine.builtin('guitarGlow'), c = engine.builtin('guitar');
              tb.push(sx, symY, S * 1.06, S * 1.06, 0, col[0], col[1], col[2], P.symbolGlow * (0.35 + E * 1.3) * P.intensity, 0, 0, 1, 1, 0);
              tb.flush(target, engine.docW, g.tex, 'add');
              tb.push(sx, symY, S, S, 0, col[0], col[1], col[2], P.intensity, 0, 0, 1, 1, 0);
              if (E > 0.35) { const th = (E - 0.35) * 0.012; tb.push(sx + th, symY, S, S, 0, col[0], col[1], col[2], P.intensity * (E - 0.35), 0, 0, 1, 1, 0); tb.push(sx - th, symY, S, S, 0, col[0], col[1], col[2], P.intensity * (E - 0.35), 0, 0, 1, 1, 0); }
              tb.flush(target, engine.docW, c.tex, 'add');
              tb.push(sx, symY, S, S, 0, 1, 1, 1, Math.max(0, E - 0.6) * 0.8 * P.intensity, 0, 0, 1, 1, 0);   // white-hot at high energy
              tb.flush(target, engine.docW, c.tex, 'add');
            }
          }
        }
        // ---------- effects
        if (P.showEffects) {
          if (isShader(P)) {
            this.drawShader(target, P, this.shaderFx(P, hits, syms, eOff, hitY, T, energyAt));
          } else {
            const imgA = P.effectType === 'image' ? engine.asset(P.effectAsset) : null;
            sb.begin(); sg.begin(); tb.begin();
            for (const h of hits) {
              const te = h.t + eOff, age = (T - te) / P.effectLife;
              if (age < 0 || age > 1) continue;
              const Eh = energyAt(te);
              const r = webgl.rng(h.seed);
              let types = [P.effectType];
              if (P.effectType === 'random') { const all = fxlib.FX_TYPES; types = [all[r.int(all.length)], all[r.int(all.length)], 'flash']; }
              for (const sx of syms) {
                const e = { x: sx + (r() - 0.5) * 0.02 / A, y: hitY - P.hitY * 0.5, age01: age, size: P.effectSize * (1 + P.energyScale * Eh) * (0.7 + 0.3 * Math.min(1.5, h.s)), seed: h.seed, colors: fxCols, count: Math.round(P.effectCount), types, intensity: P.intensity };
                if (imgA) fxlib.drawImageBurst(engine, imgA, e); else fxlib.drawBurst(engine, e);
              }
            }
            sg.flush(target, engine.docW, 'add'); sb.flush(target, engine.docW, 'add');
            if (imgA) tb.flush(target, engine.docW, imgA.tex, imgA.luma ? 'add' : 'over');
            // 기본 이펙트에서도 다중참여는 셰이더 이펙트로 (선택한 카테고리 기준)
            if (P.crowdOn) { const lst = this.shaderFx(P, hits, syms, eOff, hitY, T, energyAt).filter(e => !e.main); this.drawShader(target, P, lst); }
          }
        }
      },
      dispose() { if (fxProg) { try { gl.deleteProgram(fxProg.p); } catch (e) { } fxProg = null; } },
    };
    return inst;
  },
};
