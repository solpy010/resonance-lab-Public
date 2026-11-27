'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as batches from './batch.js';
import * as eng from './engine.js';
// LINE — 리듬선(가로 요동) / 가로지르기(시작 면→끝 면, 속도) / 낙하 스크래치. 네온 관 모델 렌더.
// 선의 현재 위치·속도를 engine.colliders에 공개 → 기하 물리 도형이 부딪혀 튕긴다.

RL.modules.line = {
  label: '라인', icon: '∿', blend: 'add',
  schema: [
    { id: 'mode', rerender: true, label: '방식', type: 'select', options: [['eq', '리듬선(진폭·진동)'], ['streak', '가로지르기(속도)'], ['rain', '선운동 스크래치(가로·세로)']], default: 'eq', group: '형태' },
    { id: 'eqStyle', rerender: true, when: (P) => P.mode === 'eq', label: '리듬선 움직임', type: 'select', options: [['dance', '너울 춤 (BPM에 맞춰 흐름)'], ['classic', '면별 진동 (구버전)']], default: 'dance', group: '형태', hint: '너울 춤: 부드러운 물결 언덕이 박자에 맞춰 부풀고 흘러가며 춤춤. 구버전: 면마다 정해진 횟수로 위아래 진동' },
    { id: 'count', when: (P) => P.mode === 'eq', label: '선 수', type: 'range', min: 1, max: 80, step: 1, default: 3, group: '형태' },
    { id: 'baseY', when: (P) => P.mode === 'eq', label: '기준 높이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '형태', key: true },
    { id: 'spacing', when: (P) => P.mode === 'eq', label: '선 간격', type: 'range', min: 0, max: 0.4, step: 0.005, default: 0.04, group: '형태', key: true },
    { id: 'amp', when: (P) => P.mode === 'eq', label: '진폭', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.12, group: '움직임', key: true },
    { id: 'faceCounts', when: (P) => P.mode === 'eq' && P.eqStyle === 'classic', label: '면별 요동 횟수 (A,B,C…)', type: 'text', default: '5,3,1,5,3,1', group: '움직임', hint: '연출안 1_4: A 5회·B 3회·C 1회' },
    { id: 'oscSpeed', when: (P) => P.mode === 'eq' && P.eqStyle === 'classic', label: '요동 속도(Hz)', type: 'range', min: 0, max: 6, step: 0.01, default: 0.8, group: '움직임', key: true },
    { id: 'bpm', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: 'BPM (큐시트 템포)', type: 'range', min: 40, max: 200, step: 1, default: 120, group: '움직임', key: true, hint: '박자마다 물결이 부풀고, 박자 흐름에 맞춰 언덕이 좌우로 너울거림' },
    { id: 'waves', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '물결 언덕 수(전체 폭)', type: 'range', min: 0.5, max: 16, step: 0.1, default: 3, group: '움직임', key: true, hint: '360° 연결이면 정수로 맞춰 이음새 없이 이어짐' },
    { id: 'travel', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '흐름 속도(언덕/박자)', type: 'range', min: -1, max: 1, step: 0.005, default: 0.06, group: '움직임', key: true, hint: '물결이 옆으로 흘러가는 속도. 0이면 제자리에서 너울만' },
    { id: 'beatAmt', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '박자 부풂', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '움직임', key: true, hint: '박자마다 언덕이 부드럽게 솟았다 가라앉는 정도' },
    { id: 'groove', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '그루브(좌우 흔들림)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '움직임', key: true, hint: '2박마다 물결이 좌우로 몸을 흔드는 정도' },
    { id: 'morph', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '모양 변화', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '움직임', key: true, hint: '언덕 높이·간격이 천천히 바뀌며 같은 모양이 반복되지 않게' },
    { id: 'morphBeats', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '모양 변화 주기(박)', type: 'range', min: 2, max: 64, step: 1, default: 16, group: '움직임' },
    { id: 'bell', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '언덕 모양(0 사인 ↔ 1 종 모양)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '움직임', key: true, hint: '1에 가까울수록 바닥은 평평하고 언덕만 솟는 종 모양' },
    { id: 'fan', when: (P) => P.mode === 'eq' && P.eqStyle !== 'classic', label: '언덕에서 선 벌어짐', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '움직임', key: true, hint: '여러 가닥이 언덕 꼭대기에서 부채처럼 벌어지고 골에서 모임' },
    { id: 'phaseStep', when: (P) => P.mode === 'eq', label: '선 간 위상차', type: 'range', min: 0, max: 3.14, step: 0.01, default: 0.6, group: '움직임' },
    { id: 'noise', when: (P) => P.mode === 'eq', label: '거칠기', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.2, group: '움직임', key: true },
    { id: 'noiseSpeed', when: (P) => P.mode === 'eq', label: '거칠기 흐름 속도', type: 'range', min: 0, max: 6, step: 0.01, default: 0.8, group: '움직임', key: true },
    { id: 'sync', when: (P) => P.mode !== 'rain', label: '흐름 싱크(0 따로 ↔ 1 통일)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '움직임', key: true, hint: '0=선들이 완전히 따로, 1=하나의 중심 운동으로 밀집. 가로지르기·리듬선에 적용' },
    { id: 'pulseSpeed', when: (P) => P.mode === 'eq', label: '이벤트 펄스 전파 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.9, group: '반응' },
    { id: 'pulseAmp', when: (P) => P.mode === 'eq', label: '이벤트 펄스 높이', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.15, group: '반응' },
    { id: 'pulseWidth', when: (P) => P.mode === 'eq', label: '이벤트 펄스 폭', type: 'range', min: 0.005, max: 0.3, step: 0.005, default: 0.04, group: '반응' },
    // streak
    { id: 'from', when: (P) => P.mode === 'streak', label: '시작 면 (A~F / 랜덤)', type: 'text', default: 'A', group: '가로지르기', hint: '여러 개 쓰면 그중 무작위: 예) A,B  ·  "랜덤"은 모든 면' },
    { id: 'to', when: (P) => P.mode === 'streak', label: '끝 면 (A~F / 랜덤)', type: 'text', default: 'F', group: '가로지르기' },
    { id: 'streakRate', when: (P) => P.mode === 'streak', label: '초당 발사', type: 'range', min: 0, max: 60, step: 0.1, default: 3, group: '가로지르기', key: true },
    { id: 'streakSpeed', when: (P) => P.mode === 'streak', label: '속도(화면 폭/초)', type: 'range', min: 0.02, max: 6, step: 0.01, default: 0.9, group: '가로지르기', key: true },
    { id: 'speedVar', when: (P) => P.mode === 'streak', label: '속도 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '가로지르기' },
    { id: 'streakLen', when: (P) => P.mode === 'streak', label: '꼬리 길이(화면 폭 대비)', type: 'range', min: 0.01, max: 1, step: 0.005, default: 0.18, group: '가로지르기', key: true },
    { id: 'yMin', when: (P) => P.mode === 'streak', label: '높이 범위 아래', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, group: '가로지르기' },
    { id: 'yMax', when: (P) => P.mode === 'streak', label: '높이 범위 위', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, group: '가로지르기' },
    { id: 'arc', when: (P) => P.mode === 'streak', label: '궤적 휘어짐', type: 'range', min: -0.6, max: 0.6, step: 0.005, default: 0.08, group: '가로지르기', key: true },
    { id: 'wave', when: (P) => P.mode === 'streak', label: '궤적 물결', type: 'range', min: 0, max: 0.3, step: 0.002, default: 0.02, group: '가로지르기', key: true },
    { id: 'waveFreq', when: (P) => P.mode === 'streak', label: '물결 수', type: 'range', min: 0.1, max: 20, step: 0.1, default: 3, group: '가로지르기' },
    { id: 'taper', when: (P) => P.mode === 'streak', label: '꼬리 페이드', type: 'range', min: 0, max: 3, step: 0.01, default: 1.2, group: '가로지르기' },
    { id: 'headGlow', when: (P) => P.mode === 'streak', label: '머리 광채', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '가로지르기' },
    { id: 'finish', when: (P) => P.mode === 'streak', label: '도착 머리 페이드', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '가로지르기', hint: '끝 면 랜덤 위치에 도달하면 광채 머리가 이만큼 부드럽게 페이드아웃되며 마무리(0=툭 꺼짐, 1=길게 사라짐)' },
    { id: 'startMargin', when: (P) => P.mode === 'streak', label: '면 안쪽 랜덤 여백', type: 'range', min: 0, max: 0.45, step: 0.01, default: 0.12, group: '가로지르기', hint: '시작·끝 면 영역 안에서 가장자리를 피해 무작위 출발/도달하는 여백' },
    { id: 'streakBurst', when: (P) => P.mode === 'streak', label: '마커당 발사', type: 'range', min: 0, max: 40, step: 1, default: 4, group: '가로지르기' },
    // scratch (line-motion: any direction)
    { id: 'flowDir', rerender: true, when: (P) => P.mode === 'rain', label: '흐름 방향', type: 'select', options: [['down', '아래로 ↓'], ['up', '위로 ↑'], ['right', '오른쪽 →'], ['left', '왼쪽 ←']], default: 'down', group: '스크래치', hint: '선운동 스크래치가 흐르는 방향 — 세로(위/아래)·가로(좌/우) 모두 가능' },
    { id: 'rainRate', when: (P) => P.mode === 'rain', label: '스크래치 생성(초당)', type: 'range', min: 0, max: 400, step: 1, default: 40, group: '스크래치' },
    { id: 'rainLen', when: (P) => P.mode === 'rain', label: '스크래치 길이', type: 'range', min: 0.02, max: 1.5, step: 0.01, default: 0.35, group: '스크래치' },
    { id: 'rainSpeed', when: (P) => P.mode === 'rain', label: '흐름 속도', type: 'range', min: 0.05, max: 5, step: 0.01, default: 1.4, group: '스크래치' },
    { id: 'rainAngle', when: (P) => P.mode === 'rain', label: '선 기울기(도)', type: 'range', min: -60, max: 60, step: 1, default: 0, group: '스크래치', hint: '스크래치 선 자체의 기울기(흐름 방향과 별개)' },
    { id: 'rainSpread', when: (P) => P.mode === 'rain', label: '퍼짐 범위', type: 'range', min: 0, max: 1, step: 0.01, default: 1, group: '스크래치', hint: '생성 위치가 퍼지는 폭(흐름과 수직 방향)' },
    { id: 'rainBurst', when: (P) => P.mode === 'rain', label: '이벤트당 생성', type: 'range', min: 0, max: 200, step: 1, default: 20, group: '스크래치' },
    // material
    { id: 'style', label: '선 재질', type: 'select', options: [['neon', '네온(빛)'], ['tube', '튜브(입체 원통)'], ['ribbon', '리본(납작한 띠)'], ['brush', '붓 터치'], ['flat', '평면(매트)'], ['beads', '구슬 연결']], default: 'neon', group: '물성', hint: '빛 이외의 입체·평면 재질. 레이어 합성(곱하기·하드라이트 등)과 함께 쓰면 효과적' },
    { id: 'core', label: '선 두께(px)', type: 'range', min: 0.5, max: 80, step: 0.1, default: 3, group: '물성', key: true },
    { id: 'coreVar', label: '두께 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '물성', hint: '선마다 두께를 무작위로 가감(0=모두 같은 두께)' },
    { id: 'halo', label: '확산(px)', type: 'range', min: 0, max: 80, step: 0.5, default: 10, group: '물성', key: true },
    { id: 'white', label: '코어 백열 / 하이라이트', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '물성' },
    { id: 'bloom', label: '재질 선 주변 빛', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '물성', hint: '튜브·리본 등 빛이 아닌 재질에 은은한 발광 추가' },
    { id: 'shadow', label: '그림자', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '물성', key: true, hint: '선 아래 어두운 그림자 → 바닥에서 떠 있는 깊이감(일반 합성일 때 잘 보임)' },
    { id: 'shadowX', label: '그림자 거리 X(px)', type: 'range', min: -80, max: 80, step: 1, default: 6, group: '물성' },
    { id: 'shadowY', label: '그림자 거리 Y(px)', type: 'range', min: -80, max: 80, step: 1, default: -10, group: '물성' },
    { id: 'shadowBlur', label: '그림자 번짐(px)', type: 'range', min: 0, max: 80, step: 0.5, default: 14, group: '물성' },
    { id: 'echo', label: '시간 잔상 개수', type: 'range', min: 0, max: 8, step: 1, default: 0, group: '물성', hint: '지나간 모양을 겹겹이 남겨 층을 만듦(리듬선)' },
    { id: 'echoGap', label: '잔상 간격(프레임)', type: 'range', min: 1, max: 20, step: 1, default: 4, group: '물성' },
    { id: 'echoFade', label: '잔상 감쇠', type: 'range', min: 0.1, max: 0.95, step: 0.01, default: 0.55, group: '물성' },
    { id: 'echoShift', label: '잔상 밀림 Y', type: 'range', min: -0.1, max: 0.1, step: 0.001, default: 0, group: '물성' },
    { id: 'colorMode', label: '색 배치', type: 'select', options: [['line', '선마다 팔레트'], ['x', '가로 위치 그라데이션'], ['depth', '잔상 깊이 따라']], default: 'line', group: '색상' },
    { id: 'colors', label: '팔레트', type: 'colors', default: ['#ff4fd8', '#5cf0ff', '#ffd23f'], group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'collider', label: '물리 도형과 충돌', type: 'bool', default: true, group: '반응' },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const inst = {
      reset(rng, P) { this.rng = rng; this.time = 0; this.nt = 0; this.pulses = []; this.drops = []; this.streaks = []; this.acc = 0; this.sacc = 0; this.polys = []; this.hist = []; this.prevY = []; this.seeds = Array.from({ length: 80 }, () => rng() * 100); },
      pickFace(str, n) {
        const s = String(str || '').trim();
        if (!s || /랜덤|random|\*/i.test(s)) return this.rng.int(n);
        const list = eng.parseFaces(s, n);
        return list.length ? list[this.rng.int(list.length)] : 0;
      },
      spawnStreak(P, sNow) {
        const n = engine.project.faces, r = this.rng, WR = !!engine.project.wrap;
        const f = this.pickFace(P.from, n), t = this.pickFace(P.to, n);
        const m = Math.min(0.49, P.startMargin ?? 0.12), rx = () => m + r() * (1 - 2 * m);
        // random position WITHIN each face (not the face edge) → no boundary banding, natural scatter
        let x0 = (f + rx()) / n, x1 = (t + rx()) / n, dir, span;
        if (WR) { let d = x1 - x0; d -= Math.round(d); if (Math.abs(d) < 0.3 / n) d += (d < 0 ? -1 : 1) * 0.5 / n; dir = Math.sign(d) || 1; span = Math.abs(d); x1 = x0 + d; }
        else { if (Math.abs(x1 - x0) < 0.3 / n) x1 += (x1 < x0 ? -1 : 1) * 0.5 / n; dir = Math.sign(x1 - x0) || 1; span = Math.abs(x1 - x0); }
        // flow sync: blend each streak's path/speed/phase toward a shared drifting centre (1 = dense bundle)
        const sync = P.sync || 0, cen = this.central || { y: (P.yMin + P.yMax) / 2, v: P.streakSpeed, ph: 0 };
        const yr0 = P.yMin + r() * Math.max(0, P.yMax - P.yMin), yr1 = P.yMin + r() * Math.max(0, P.yMax - P.yMin);
        const y0 = yr0 * (1 - sync) + (cen.y + (r() - 0.5) * 0.05) * sync;
        const y1 = yr1 * (1 - sync) + (cen.y + (r() - 0.5) * 0.05) * sync;
        const v = (P.streakSpeed * (1 + (r() - 0.5) * 2 * P.speedVar)) * (1 - sync) + cen.v * sync;
        const ph = (r() * 6.283) * (1 - sync) + cen.ph * sync;
        const w = Math.max(0.05, 1 + (r() - 0.5) * 2 * (P.coreVar ?? 0));
        this.streaks.push({ x0, x1, y0, y1, dir, span, trav: 0, len: P.streakLen * (0.7 + r() * 0.6), v, c: r(), ph, w, s: sNow || 1, arrived: false, fadeT: 0 });
      },
      step(dt, t, evs, P) {
        this.time += dt; this.nt += dt * P.noiseSpeed;
        const n = engine.project.faces;
        for (const e of evs) {
          this.pulses.push({ u: e.u, age: 0, s: e.s });
          if (P.mode === 'rain') { const vert = (P.flowDir || 'down') === 'down' || (P.flowDir || 'down') === 'up'; for (let k = 0; k < P.rainBurst * e.s; k++) this.spawnDrop(P, vert ? e.u + (this.rng() - 0.5) / n : this.rng()); }
          if (P.mode === 'streak') for (let k = 0; k < P.streakBurst; k++) this.spawnStreak(P, e.s);
        }
        for (const p of this.pulses) p.age += dt;
        this.pulses = this.pulses.filter(p => p.age * P.pulseSpeed < 1.2);
        if (P.mode === 'rain') {
          this.acc += P.rainRate * dt; let k = Math.floor(this.acc); this.acc -= k;
          while (k-- > 0) this.spawnDrop(P, this.rng());
          const dir = P.flowDir || 'down';
          for (const d of this.drops) { const dist = d.v * dt; if (dir === 'down') d.y -= dist; else if (dir === 'up') d.y += dist; else if (dir === 'right') d.x += dist; else d.x -= dist; }
          this.drops = this.drops.filter(d => d.x > -0.4 && d.x < 1.4 && d.y > -0.4 && d.y < 1.4);
        }
        if (P.mode === 'streak') {
          const ym = (P.yMin + P.yMax) / 2, yr = Math.max(0, P.yMax - P.yMin);
          this.central = { y: ym + webgl.noise.n2(this.time * 0.25, 11.3) * yr * 0.4, v: P.streakSpeed * (1 + webgl.noise.n2(this.time * 0.3, 5.1) * 0.3), ph: this.time * 2 };
          this.sacc += P.streakRate * dt; let k = Math.floor(this.sacc); this.sacc -= k;
          while (k-- > 0) this.spawnStreak(P);
          const fadeTime = 0.05 + (P.finish ?? 0.5) * 0.75;
          for (const s of this.streaks) { s.trav += s.v * dt; if (!s.arrived && s.trav >= s.span) { s.arrived = true; s.trav = s.span; } if (s.arrived) s.fadeT += dt; }
          this.streaks = this.streaks.filter(s => !s.arrived || s.fadeT < fadeTime);
        }
        this.buildGeometry(P, dt);
      },
      spawnDrop(P, pos) {
        const r = this.rng, dir = P.flowDir || 'down';
        const sp = P.rainSpread ?? 1, a = 0.5 + (pos - 0.5) * sp;      // position along the entry edge
        const w = Math.max(0.05, 1 + (r() - 0.5) * 2 * (P.coreVar ?? 0));
        const base = { len: P.rainLen * (0.4 + r()), v: P.rainSpeed * (0.6 + r() * 0.8), c: r(), w, dir };
        if (dir === 'down') this.drops.push(Object.assign({ x: a, y: 1.05 + r() * 0.2 }, base));
        else if (dir === 'up') this.drops.push(Object.assign({ x: a, y: -0.05 - r() * 0.2 }, base));
        else if (dir === 'right') this.drops.push(Object.assign({ x: -0.05 - r() * 0.2, y: a }, base));
        else this.drops.push(Object.assign({ x: 1.05 + r() * 0.2, y: a }, base));
      },
      // 너울 춤: smooth humps that swell on each beat, sway with the groove and slowly morph — never sharp
      buildDance(P, dt, polys, col) {
        const A = engine.aspect, WR = !!engine.project.wrap;
        const M = Math.min(900, Math.max(160, Math.round(140 * A)));
        const T = this.time, beat = 60 / Math.max(1, P.bpm || 120), bt = T / beat, bp = bt - Math.floor(bt);
        // beat swell: quick soft rise, long ease-out; continuous across beat boundaries
        const rise = Math.min(1, bp / 0.14), env = (1 - (1 - rise) * (1 - rise)) * Math.pow(1 - bp, 2.2);
        const Aamp = P.amp * (1 - P.beatAmt * 0.45 + P.beatAmt * 0.9 * env);
        let k1 = P.waves; if (WR) k1 = Math.max(1, Math.round(k1));
        const mb = Math.max(1, P.morphBeats || 16);
        const m2 = P.morph * Math.sin(2 * Math.PI * bt / mb), m3 = P.morph * Math.cos(2 * Math.PI * bt / (mb * 1.618) + 0.7);
        const norm = 1 + 0.55 * Math.abs(m2) + 0.35 * Math.abs(m3);
        const phi = 2 * Math.PI * (P.travel * bt) + P.groove * 0.9 * Math.sin(Math.PI * bt) + P.groove * 0.25 * Math.sin(2 * Math.PI * bt / 4 + 1.3);
        const ex = 1 + 3.2 * P.bell, sync = P.sync || 0, cnt = Math.max(1, P.count), mid = (cnt - 1) / 2;
        const kE = WR ? 1 : 0.7, lean = P.groove * 0.11 / k1 * Math.sin(Math.PI * bt + 0.4);
        const wave = (u) => {
          u += lean * Math.sin(2 * Math.PI * k1 * u - phi);      // humps lean left/right with the groove
          let s = Math.sin(2 * Math.PI * k1 * u - phi) + 0.55 * m2 * Math.sin(2 * Math.PI * 2 * k1 * u + phi * 1.3 + 1.1) + 0.35 * m3 * Math.sin(2 * Math.PI * (WR ? 1 : 0.5) * k1 * u - phi * 0.6 + 2.3);
          s /= norm; const b = Math.max(0, (s + 1) * 0.5);
          const hv = 1 - 0.55 * P.morph * (0.5 + 0.5 * Math.sin(2 * Math.PI * kE * u + 2 * Math.PI * bt / mb * 0.75 + 1.9));   // humps differ in height
          const pb = Math.pow(b, ex);
          return { h: (2 * pb - 1) * hv - (1 - hv), b: pb * hv };    // h in [-1,1], b in [0,1]
        };
        for (let li = 0; li < cnt; li++) {
          const c = cnt > 1 ? (li - mid) / mid : 0;                 // -1..1 across the bundle
          const lw = Math.max(0.05, 1 + ((this.seeds[li % 80] * 7.13 % 1) - 0.5) * 2 * (P.coreVar ?? 0));
          const du = c * (P.phaseStep / (2 * Math.PI * k1)) * 0.25 * (1 - sync);   // small strand lag → not parallel copies
          const ampMul = 1 + c * 0.12 * (1 - sync);
          const pts = new Float32Array((M + 1) * 2), prev = this.prevY[li];
          for (let k = 0; k <= M; k++) {
            const u = k / M, w = wave(u + du);
            let y = w.h * Aamp * ampMul;
            const spread = (li - mid) * P.spacing * (1 - sync * 0.85) * (1 + P.fan * 3 * w.b);
            if (P.noise > 0) {
              let nz;
              if (WR) { const th = u * Math.PI * 2, R1 = A * 1.5 / (Math.PI * 2); nz = webgl.noise.n3(Math.cos(th) * R1 + this.seeds[li % 80], Math.sin(th) * R1, this.nt * 0.5 + li * 0.3); }
              else nz = webgl.noise.n2(u * A * 1.5 + this.seeds[li % 80], this.nt * 0.5 + li * 0.3);
              y += nz * P.noise * 0.35 * Math.max(P.amp, 0.05);
            }
            for (const p of this.pulses) {
              let dd = u - p.u; if (WR) dd -= Math.round(dd);
              const front = p.age * P.pulseSpeed, d = Math.abs(dd * A) - front, pw = Math.max(P.pulseWidth * 2.5, 0.14);
              y += Math.exp(-(d * d) / (pw * pw)) * P.pulseAmp * p.s * Math.exp(-p.age * 0.9);
            }
            pts[k * 2] = u; pts[k * 2 + 1] = P.baseY + y + spread;
          }
          polys.push({ pts, ci: li, alpha: null, w: lw });
          if (P.collider) for (let k = 0; k < M; k++) {
            const vy = prev && dt > 0 ? (pts[k * 2 + 1] - prev[k * 2 + 1]) / dt : 0;
            col.push(pts[k * 2] * A, pts[k * 2 + 1], pts[k * 2 + 2] * A, pts[k * 2 + 3], 0, vy);
          }
          this.prevY[li] = pts;
        }
      },
      // geometry for rendering + colliders (normalized coords; colliders in physical units x*aspect)
      buildGeometry(P, dt) {
        const A = engine.aspect, n = engine.project.faces, WR = !!engine.project.wrap;
        const polys = [];   // {pts:[x,y,...], ci, alpha:[...] or null, w}
        const col = [];      // collider segs
        if (P.mode === 'eq' && P.eqStyle !== 'classic') {
          this.buildDance(P, dt, polys, col);
        } else if (P.mode === 'eq') {
          const counts = String(P.faceCounts).split(/[\s,]+/).map(Number).filter(v => !isNaN(v));
          const M = Math.min(900, Math.max(120, Math.round(120 * A)));
          const T = this.time;
          for (let li = 0; li < P.count; li++) {
            const yb = P.baseY + (li - (P.count - 1) / 2) * P.spacing;
            const sync = P.sync || 0, ph = li * P.phaseStep * (1 - sync), sd = this.seeds[(sync > 0.995 ? 0 : li) % 80];
            const lw = Math.max(0.05, 1 + ((this.seeds[li % 80] * 7.13 % 1) - 0.5) * 2 * (P.coreVar ?? 0));
            const pts = new Float32Array((M + 1) * 2);
            const prev = this.prevY[li];
            for (let k = 0; k <= M; k++) {
              const u = k / M;
              const f = Math.min(n - 1, Math.floor(u * n)), lu = u * n - f;
              const cnt = counts.length ? counts[f % counts.length] : 1;
              let y = Math.sin(Math.PI * cnt * lu) * Math.sin(T * Math.PI * 2 * P.oscSpeed + ph + f * 0.7 * (1 - sync)) * P.amp;
              if (P.noise > 0) {
                let nz;
                if (WR) { const th = u * Math.PI * 2, R1 = A * 3 / (Math.PI * 2), R2 = A * 9 / (Math.PI * 2);
                  nz = webgl.noise.n3(Math.cos(th) * R1 + sd, Math.sin(th) * R1, this.nt + li) + 0.5 * webgl.noise.n3(Math.cos(th) * R2 + sd, Math.sin(th) * R2, this.nt * 1.7 + li); }
                else nz = webgl.noise.n2(u * A * 3 + sd, this.nt + li) + 0.5 * webgl.noise.n2(u * A * 9 + sd, this.nt * 1.7 + li);
                y += nz * P.noise * Math.max(P.amp, 0.05);
              }
              for (const p of this.pulses) {
                let du = u - p.u; if (WR) du -= Math.round(du);
                const front = p.age * P.pulseSpeed, d = Math.abs(du * A) - front;
                y += Math.exp(-(d * d) / (P.pulseWidth * P.pulseWidth)) * P.pulseAmp * p.s * Math.exp(-p.age * 0.9) * Math.sin(li + 1.3);
              }
              pts[k * 2] = u; pts[k * 2 + 1] = yb + y;
            }
            polys.push({ pts, ci: li, alpha: null, w: lw });
            if (P.collider) for (let k = 0; k < M; k++) {
              const vy = prev && dt > 0 ? (pts[k * 2 + 1] - prev[k * 2 + 1]) / dt : 0;
              col.push(pts[k * 2] * A, pts[k * 2 + 1], pts[k * 2 + 2] * A, pts[k * 2 + 3], 0, vy);
            }
            this.prevY[li] = pts;
          }
        } else if (P.mode === 'streak') {
          const fadeTime = 0.05 + (P.finish ?? 0.5) * 0.75;
          for (const s of this.streaks) {
            const span = s.span;
            const head = Math.min(s.trav, span + s.len), tail = Math.max(0, s.trav - s.len);
            const hd = Math.min(head, span), tl = Math.min(tail, span);
            if (hd - tl <= 1e-5) continue;
            const fadeMul = s.arrived ? Math.max(0, 1 - s.fadeT / fadeTime) : 1;
            if (fadeMul <= 0.002) continue;
            const segN = Math.max(6, Math.round((hd - tl) * A * 40));
            const pts = new Float32Array((segN + 1) * 2), al = new Float32Array(segN + 1);
            for (let k = 0; k <= segN; k++) {
              const d = tl + (hd - tl) * k / segN, u = d / span;
              let xx = s.x0 + s.dir * d; if (WR) xx -= Math.floor(xx);
              const yy = s.y0 + (s.y1 - s.y0) * u + P.arc * Math.sin(Math.PI * u) + P.wave * Math.sin(xx * P.waveFreq * Math.PI * 2 * A / 3 + s.ph + this.time * 2);
              pts[k * 2] = xx; pts[k * 2 + 1] = yy;
              al[k] = Math.pow(k / segN, P.taper) * fadeMul;
            }
            polys.push({ pts, ci: s.c, alpha: al, w: s.w, head: true, s: s.s * fadeMul });
            if (P.collider) for (let k = 0; k < segN; k++) { if (Math.abs(pts[k * 2 + 2] - pts[k * 2]) > 0.5) continue; col.push(pts[k * 2] * A, pts[k * 2 + 1], pts[k * 2 + 2] * A, pts[k * 2 + 3], s.dir * s.v * A, 0); }
          }
        } else {
          const ang = P.rainAngle * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang), dir = P.flowDir || 'down';
          for (const d of this.drops) {
            let x1, y1, vx = 0, vy = 0;
            if (dir === 'down') { x1 = d.x + sn * d.len / A; y1 = d.y + c * d.len; vy = -d.v; }
            else if (dir === 'up') { x1 = d.x + sn * d.len / A; y1 = d.y - c * d.len; vy = d.v; }
            else if (dir === 'right') { x1 = d.x - c * d.len / A; y1 = d.y + sn * d.len; vx = d.v; }
            else { x1 = d.x + c * d.len / A; y1 = d.y + sn * d.len; vx = -d.v; }
            polys.push({ pts: new Float32Array([d.x, d.y, x1, y1]), ci: d.c, alpha: null, w: d.w });
            if (P.collider) col.push(d.x * A, d.y, x1 * A, y1, vx * A, vy);
          }
        }
        this.polys = polys;
        if (P.echo > 0 && P.mode === 'eq') {
          this.hist.unshift(polys);
          const keep = Math.round(P.echo) * Math.round(P.echoGap) + 1;
          if (this.hist.length > keep) this.hist.length = keep;
        } else this.hist.length = 0;
        if (P.collider && col.length) engine.colliders.set(L.id, { segs: new Float32Array(col), n: col.length / 6, thick: P.core * 0.5 / engine.docH });
        else engine.colliders.delete(L.id);
      },
      render(target, P) {
        webgl.clear(gl, target);
        if (!L.def.enabled) return;
        const sg = engine.segs, cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).map(webgl.hexToRgb);
        const style = batches.LINE_STYLES[P.style] ?? 0, docW = engine.docW, docH = engine.docH;
        sg.begin();
        const ramp = (f) => { const n = cols.length; if (n === 1) return cols[0]; const p = Math.min(n - 1.0001, Math.max(0, f * (n - 1))); const i = Math.floor(p), w = p - i, a = cols[i], b = cols[i + 1]; return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]; };
        const colorOf = (p, u, depthF) => P.colorMode === 'x' ? ramp(u) : P.colorMode === 'depth' ? ramp(depthF) : (P.mode === 'eq' ? cols[p.ci % cols.length] : cols[Math.floor(p.ci * cols.length) % cols.length]);
        // draw one polyline set. kind: 'main' | 'shadow'
        const drawPolys = (polys, alphaMul, dy, depthF, kind) => {
          const sx = kind === 'shadow' ? P.shadowX / docW : 0, sy = kind === 'shadow' ? P.shadowY / docH : 0;
          for (const p of polys) {
            const pts = p.pts, m = pts.length / 2;
            let along = 0;
            for (let k = 0; k < m - 1; k++) {
              const x0 = pts[k * 2], y0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], y1 = pts[k * 2 + 3];
              const segLen = Math.hypot((x1 - x0) * docW, (y1 - y0) * docH);
              if (Math.abs(x1 - x0) > 0.5) { along += segLen; continue; }              // seam jump (360° wrap)
              const a = (p.alpha ? p.alpha[k + 1] : 1) * P.intensity * alphaMul;
              if (a < 0.003) { along += segLen; continue; }
              if (kind === 'shadow') sg.push(x0 + sx, y0 + sy + dy, x1 + sx, y1 + sy + dy, P.core * p.w, P.shadowBlur, 0, 0, 0, a * P.shadow, 0, 6, along, 0);
              else {
                const c = colorOf(p, (x0 + x1) * 0.5, depthF);
                sg.push(x0, y0 + dy, x1, y1 + dy, P.core * p.w, P.halo * p.w, c[0], c[1], c[2], a, P.white, style, along, P.bloom);
              }
              along += segLen;
            }
            if (kind === 'main' && p.head && P.headGlow > 0 && m > 1) {
              const hx = pts[(m - 1) * 2], hy = pts[(m - 1) * 2 + 1], c = colorOf(p, hx, depthF);
              sg.push(hx, hy + dy, hx + 1e-4, hy + dy, P.core * p.w * (1 + P.headGlow), P.halo * p.w * (1 + P.headGlow * 1.5) + P.core, c[0], c[1], c[2], Math.min(1.5, P.intensity * p.s), 1, 0, 0, 0);
            }
          }
        };
        const layers = [];   // [polys, alphaMul, dy, depthF] back→front
        if (P.echo > 0 && P.mode === 'eq' && this.hist.length > 1) {
          const gap = Math.round(P.echoGap);
          for (let e = Math.round(P.echo); e >= 1; e--) { const h = this.hist[e * gap]; if (h) layers.push([h, Math.pow(P.echoFade, e), P.echoShift * e, e / (P.echo + 1)]); }
        }
        layers.push([this.polys, 1, 0, 0]);
        const solid = style !== 0;
        if (P.shadow > 0) { for (const [pl, am, dy] of layers) drawPolys(pl, am, dy, 0, 'shadow'); sg.flush(target, docW, 'over'); }
        for (const [pl, am, dy, df] of layers) { drawPolys(pl, am, dy, df, 'main'); if (solid) sg.flush(target, docW, 'over'); }
        sg.flush(target, docW, solid ? 'over' : 'screen');
      },
      dispose() { engine.colliders.delete(L.id); },
    };
    return inst;
  },
};
