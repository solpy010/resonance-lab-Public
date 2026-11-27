'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
// ROBOT — RB20-1900ES 로봇팔 군무 (3D 메시, 6축 관절, 구부정 기본 자세, 스타일·템포·다양성·재질·색 흐름)
// 뿌리(베이스)는 바닥에 고정, 모든 움직임은 관절 회전으로만. 위로 곧게 뻗는 자세는 관절 제한으로 막는다.

(function () {
  const D2R = Math.PI / 180;
  // ---- motion vocabulary per style: [weight, cycle(beats), envelope]  env: s=부드러움 k=날카로움 p=박자 펄스 t=끊어 멈춤
  const STYLES = {
    techno:   { label: '테크노',       v: { bob: [1, 1, 'p'], sway: [0.6, 4, 'k'], wrist: [0.7, 0.5, 't'], ripple: [0.25, 4, 's'], circle: [0.2, 8, 's'], lean: [0.3, 8, 's'], hit: [0.35, 2, 't'], spin: [0, 16, 's'] } },
    edm:      { label: 'EDM',          v: { bob: [1.2, 1, 'p'], sway: [0.9, 4, 's'], wrist: [0.6, 1, 'k'], ripple: [0.35, 2, 's'], circle: [0.6, 4, 's'], lean: [0.6, 8, 's'], hit: [0.5, 4, 't'], spin: [0.25, 16, 's'] } },
    waltz:    { label: '왈츠 (3/4)',   v: { bob: [0.45, 3, 's'], sway: [0.8, 6, 's'], wrist: [0.4, 3, 's'], ripple: [0.55, 3, 's'], circle: [1, 3, 's'], lean: [0.5, 6, 's'], hit: [0, 3, 't'], spin: [0, 24, 's'] } },
    ballad:   { label: '발라드',       v: { bob: [0.2, 4, 's'], sway: [1, 16, 's'], wrist: [0.5, 8, 's'], ripple: [0.8, 8, 's'], circle: [0.45, 16, 's'], lean: [0.8, 16, 's'], hit: [0, 8, 't'], spin: [0, 32, 's'] } },
    breaking: { label: '브레이크 댄스', v: { bob: [0.8, 1, 'p'], sway: [0.5, 2, 'k'], wrist: [1, 0.5, 'k'], ripple: [0.3, 2, 'k'], circle: [0.5, 2, 'k'], lean: [0.4, 4, 'k'], hit: [1, 2, 't'], spin: [1, 8, 'k'] } },
    wave:     { label: '너울 춤',      v: { bob: [0.2, 2, 's'], sway: [0.6, 8, 's'], wrist: [0.6, 4, 's'], ripple: [1.3, 4, 's'], circle: [0.3, 8, 's'], lean: [0.5, 8, 's'], hit: [0, 4, 't'], spin: [0, 32, 's'] } },
    popping:  { label: '팝핀 (끊어 멈춤)', v: { bob: [0.5, 1, 'p'], sway: [0.5, 2, 't'], wrist: [0.8, 0.5, 't'], ripple: [0.3, 2, 't'], circle: [0, 4, 's'], lean: [0.3, 4, 't'], hit: [1.2, 1, 't'], spin: [0, 16, 's'] } },
    hiphop:   { label: '힙합 바운스',  v: { bob: [1.1, 1, 'p'], sway: [0.6, 2, 'k'], wrist: [0.6, 1, 'k'], ripple: [0.3, 4, 's'], circle: [0.3, 4, 's'], lean: [0.7, 4, 's'], hit: [0.3, 4, 't'], spin: [0, 16, 's'] } },
  };
  const VOCAB = ['sway', 'bob', 'ripple', 'wrist', 'circle', 'lean', 'hit', 'spin'];
  const MATS = { plastic: 0, neon: 1, solid: 2, chrome: 3, holo: 4 };

  const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (t) => t * t * (3 - 2 * t);
  // envelope: x in cycles → -1..1 (or 0..1 for pulse); en = energy 0..1; key = per-arm seed
  function env(kind, x, en, key) {
    if (kind === 's') return Math.sin(x * 2 * Math.PI);
    if (kind === 'k') { const s = Math.sin(x * 2 * Math.PI); return Math.sign(s) * Math.pow(Math.abs(s), 1 - 0.8 * en); }
    if (kind === 'p') { const f = x - Math.floor(x); const k = 3 + en * 9; return Math.exp(-f * k) * 2 - 0.35; }
    // t: random hold, quick move at each step
    const seg = Math.floor(x * 2), f = x * 2 - seg, a = hash(seg, key) * 2 - 1, b = hash(seg - 1, key) * 2 - 1;
    const mv = 0.08 + (1 - en) * 0.3;
    return b + (a - b) * smooth(Math.min(1, f / mv));
  }

  // ---- column-major 4x4 helpers
  const M = {
    I: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    rz(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    ry(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rx(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    tr(x, y, z) { const m = M.I(); m[12] = x; m[13] = y; m[14] = z; return m; },
    about(R, x, y, z) { return M.mul(M.tr(x, y, z), M.mul(R, M.tr(-x, -y, -z))); },
  };
  // world (Z up, viewer at −Y) → view (x right, y up, z toward viewer)
  const W2V = new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);

  function decodeMesh() {
    const b = (s, T) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
    const P = [], N = [], T = [], Lk = [], E = [], EL = [];
    RL.ROBOT_MESH.forEach((l, li) => {
      const p = b(l.p, Int16Array), n = b(l.n, Int8Array), t = b(l.t, Uint8Array), e = b(l.e, Int16Array);
      for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); }
      for (let i = 0; i < t.length; i++) { T.push(t[i]); Lk.push(li); }
      for (let i = 0; i < e.length; i += 6) { for (let k = 0; k < 6; k++) E.push(e[i + k]); EL.push(li); }
    });
    return { P: new Int16Array(P), N: new Int8Array(N), T: new Uint8Array(T), L: new Uint8Array(Lk), E: new Int16Array(E), EL: new Uint8Array(EL), nv: T.length, ne: EL.length };
  }
  let MESH = null;

  const schema = [
    // 배치
    { id: 'count', label: '로봇팔 수', type: 'range', min: 1, max: 24, step: 1, default: 6, group: '배치' },
    { id: 'layout', label: '배치 방식', type: 'select', default: 'row', group: '배치', options: [['row', '일렬 (좌우 균등)'], ['faces', '면마다 (A~F 중앙)'], ['zigzag', '앞뒤 지그재그 2열'], ['arc', '원호 (가운데 뒤로)'], ['vee', 'V자 (가운데 앞으로)'], ['scatter', '무작위 흩뿌림']] },
    { id: 'spanStart', label: '배치 범위 시작(좌)', type: 'range', min: -0.2, max: 1.2, step: 0.005, default: 0.05, group: '배치', key: true },
    { id: 'spanEnd', label: '배치 범위 끝(우)', type: 'range', min: -0.2, max: 1.2, step: 0.005, default: 0.85, group: '배치', key: true },
    { id: 'posX', label: '위치 X (좌우 이동)', type: 'range', min: -1, max: 1, step: 0.001, default: 0, group: '배치', key: true, hint: '전체 로봇팔을 화면 폭 기준으로 좌우 이동 (0.1 = 폭의 10%)' },
    { id: 'posY', label: '위치 Y (바닥 높이)', type: 'range', min: -0.6, max: 1, step: 0.001, default: 0.06, group: '배치', key: true, hint: '베이스가 놓이는 높이 (0 = 화면 바닥)' },
    { id: 'posZ', label: '위치 Z (앞뒤)', type: 'range', min: -1, max: 1, step: 0.01, default: 0, group: '배치', key: true, hint: '−는 관객 쪽 앞으로(커짐), +는 뒤로(작아지고 위로)' },
    { id: 'depthSpread', label: '앞뒤 간격', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '배치', key: true, hint: '지그재그·원호·V자·무작위 배치에서 앞뒤로 벌어지는 정도' },
    { id: 'scale', label: '스케일', type: 'range', min: 0.1, max: 3, step: 0.01, default: 1, group: '배치', key: true },
    { id: 'sizeVar', label: '크기 편차', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, group: '배치' },
    { id: 'gather', label: '집결 (한곳으로 모이기)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '배치', key: true },
    { id: 'gatherX', label: '집결 위치 X', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5, group: '배치', key: true },
    { id: 'facing', label: '바라보는 방향(도)', type: 'range', min: -180, max: 180, step: 1, default: 0, group: '배치', key: true, hint: '0=오른쪽으로 숙임, 180=왼쪽으로 숙임' },
    { id: 'facingMode', label: '방향 배치', type: 'select', default: 'same', group: '배치', options: [['same', '모두 같은 방향'], ['alt', '번갈아 마주보기'], ['center', '가운데를 향해'], ['out', '바깥을 향해'], ['random', '무작위']] },
    { id: 'offsets', label: '개별 위치 (번호:x,y,z,스케일; …)', type: 'text', default: '', group: '배치', hint: '예) 1:0.05,0,0.3,1.2; 4:-0.03,0.02,-0.4  → 1번을 오른쪽·뒤·1.2배, 4번을 왼쪽·위·앞. 번호는 왼쪽부터 1' },
    { id: 'depthFade', label: '뒤쪽 어둡게', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '배치' },
    // 시점
    { id: 'camYaw', label: '시점 방위(도)', type: 'range', min: -180, max: 180, step: 1, default: 18, group: '시점', key: true, hint: '0=정측면(숙인 실루엣이 가장 잘 보임), 90=정면' },
    { id: 'camPitch', label: '시점 높이(도)', type: 'range', min: -30, max: 70, step: 1, default: 6, group: '시점', key: true, hint: '+는 위에서 내려다봄, −는 아래에서 올려다봄' },
    { id: 'persp', label: '원근 강도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '시점' },
    // 움직임 (템포)
    { id: 'style', label: '춤 스타일', type: 'select', default: 'edm', group: '움직임', options: Object.keys(STYLES).map(k => [k, STYLES[k].label]) },
    { id: 'bpm', label: '큐시트 템포 (BPM)', type: 'range', min: 40, max: 200, step: 1, default: 124, group: '움직임' },
    { id: 'tempo', label: '동작 속도 (느리게↔빠르게)', type: 'range', min: 0.05, max: 3, step: 0.01, default: 1, group: '움직임', key: true, hint: '1 = BPM 그대로. 0.5 = 반 박자 느낌으로 서서히, 2 = 두 배 빠르게. 키프레임으로 가속·감속' },
    { id: 'beatOffset', label: '박자 시작 오프셋(초)', type: 'range', min: -2, max: 2, step: 0.01, default: 0, group: '움직임' },
    // 동작
    { id: 'amount', label: '동작 크기', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작', key: true },
    { id: 'energy', label: '동작 에너지 (부드러움↔절도)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '동작', key: true },
    { id: 'diversity', label: '동작 다양성 (통일↔제각각)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, group: '동작', key: true, hint: '0 = 모두 같은 군무, 1 = 로봇마다 다른 박자·크기·동작 조합' },
    { id: 'phaseFlow', label: '위상 흐름 (차례로 따라하기)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '동작', key: true, hint: '0 = 동시에, 올리면 한 대씩 박자를 늦게 따라 해 파도처럼 번짐' },
    { id: 'flowDir', label: '흐름 방향', type: 'select', default: 'lr', group: '동작', options: [['lr', '좌 → 우 (A→F)'], ['rl', '우 → 좌 (F→A)'], ['co', '가운데 → 바깥'], ['oc', '바깥 → 가운데']] },
    { id: 'crouch', label: '구부정함 (기본 자세)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, group: '동작', key: true, hint: '높을수록 몸을 깊게 숙인 자세. 팔이 위로 곧게 펴지는 자세는 항상 제한됩니다' },
    // 동작 어휘
    { id: 'wSway', label: '좌우 회전 (몸통)', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wBob', label: '박자 바운스 (숙였다 펴기)', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wRipple', label: '관절 물결 (어깨→팔꿈치→손목)', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wWrist', label: '손목 꺾기·비틀기', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wCircle', label: '원 그리기', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wLean', label: '앞뒤로 기울이기', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wHit', label: '포즈 끊어 멈추기', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    { id: 'wSpin', label: '크게 돌기 (회전)', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '동작 어휘', key: true },
    // 재질
    { id: 'material', label: '재질', type: 'select', default: 'neon', group: '재질', options: [['plastic', '원본 플라스틱'], ['neon', '디지털 네온'], ['solid', '솔리드 2D (평면 단색)'], ['chrome', '크롬 메탈'], ['holo', '홀로그램 와이어']] },
    { id: 'rim', label: '가장자리 발광 (네온·홀로)', type: 'range', min: 0, max: 4, step: 0.01, default: 1.1, group: '재질', key: true },
    { id: 'bodyDark', label: '몸체 밝기 (네온)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.22, group: '재질', key: true },
    { id: 'bodyAlpha', label: '몸체 불투명도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.92, group: '재질', key: true },
    { id: 'gloss', label: '광택', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '재질' },
    { id: 'edge', label: '모서리 라인', type: 'range', min: 0, max: 2, step: 0.01, default: 0.7, group: '재질', key: true },
    { id: 'edgeWidth', label: '라인 두께(px)', type: 'range', min: 0.5, max: 12, step: 0.1, default: 1.6, group: '재질' },
    { id: 'edgeHalo', label: '라인 번짐', type: 'range', min: 0, max: 20, step: 0.1, default: 2.5, group: '재질' },
    { id: 'edgeWhite', label: '라인 흰 심', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '재질' },
    { id: 'xray', label: '뒤쪽 라인도 보이기 (투시)', type: 'bool', default: false, group: '재질' },
    // 색상
    { id: 'colorMode', label: '색 배치', type: 'select', default: 'flow', group: '색상', options: [['original', '재질 원색'], ['single', '단색 (첫 색)'], ['perArm', '로봇마다 순서대로'], ['flow', '색 흐름 (위치 따라 이동)'], ['random', '랜덤 흐름']] },
    { id: 'colors', label: '팔레트', type: 'colors', default: ['#ff2fb3', '#7a3cff', '#22d8ff', '#2f6bff', '#ffe03a', '#2dff9b'], group: '색상' },
    { id: 'flowSpeed', label: '색 흐름 속도', type: 'range', min: -2, max: 2, step: 0.01, default: 0.25, group: '색상', key: true, hint: '+ = 좌→우, − = 우→좌' },
    { id: 'flowScale', label: '색 흐름 폭', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1, group: '색상', hint: '화면 폭 안에 팔레트가 몇 바퀴 들어가는지' },
    { id: 'randomFlow', label: '랜덤 움직임 섞기', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, group: '색상', key: true },
    { id: 'accent', label: '관절 캡·베이스 색', type: 'color', default: '#c9d2dc', group: '색상' },
    { id: 'accentMix', label: '관절 캡 색 분리', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 4, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'beatFlash', label: '박자 발광', type: 'range', min: 0, max: 2, step: 0.01, default: 0.25, group: '색상', key: true },
    // 반응
    { id: 'hitPose', label: '마커 타격 포즈', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '반응' },
    { id: 'hitFlash', label: '마커 발광', type: 'range', min: 0, max: 4, step: 0.01, default: 1.2, group: '반응' },
    { id: 'hitDecay', label: '타격 잔향(초)', type: 'range', min: 0.05, max: 2, step: 0.01, default: 0.45, group: '반응' },
  ];

  RL.modules.robot = {
    label: '로봇팔 군무', icon: '⊾', blend: 'over', schema,
    styles: STYLES,
    create(engine, L) {
      const gl = engine.gl;
      if (!MESH) MESH = decodeMesh();
      const VS = `#version 300 es
        layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in float aT; layout(location=3) in float aL;
        uniform mat4 uL[7]; uniform vec2 uBase, res; uniform float uPx, uD, uZ;
        out vec3 vN; out float vT; out vec3 vV;
        void main(){
          int li = int(aL + 0.5);
          vec4 w = uL[li] * vec4(aP * 0.1, 1.0);
          vN = mat3(uL[li]) * aN; vT = aT; vV = w.xyz;
          float s = uD / max(uD - w.z, 1.0);
          vec2 sp = uBase + w.xy * s * uPx;
          gl_Position = vec4(sp / res * 2.0 - 1.0, clamp(uZ - w.z / 30000.0, -0.999, 0.999), 1.0);
        }`;
      const FS = `#version 300 es
        precision highp float;
        in vec3 vN; in float vT; in vec3 vV; out vec4 frag;
        uniform float uMat, uRim, uDark, uAlpha, uGloss, uEmis, uInt, uAccMix, uFade;
        uniform vec3 uCol, uAcc;
        void main(){
          vec3 n = normalize(vN); if (n.z < 0.0) n = -n;
          vec3 L = normalize(vec3(-0.45, 0.75, 0.55)), V = vec3(0.0, 0.0, 1.0);
          float dif = max(dot(n, L), 0.0), hemi = 0.5 + 0.5 * n.y;
          float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);
          vec3 base = mix(uCol, uAcc, vT * uAccMix);
          float spec = pow(max(dot(reflect(-L, n), V), 0.0), mix(8.0, 64.0, uGloss)) * uGloss;
          vec3 rgb; float a = 1.0;
          if (uMat < 0.5) {                 // plastic
            rgb = base * (0.22 + 0.25 * hemi + 0.7 * dif) + vec3(spec) * 0.7;
            rgb *= uInt;
          } else if (uMat < 1.5) {          // neon
            rgb = base * uDark * (0.35 + 0.65 * dif) + vec3(spec) * 0.25 * uDark;
            rgb += uCol * fres * uRim * (1.0 + uEmis) * uInt;
            a = clamp(uAlpha + fres * uRim * 0.4, 0.0, 1.0);
          } else if (uMat < 2.5) {          // solid 2D
            rgb = base * uInt * (1.0 + uEmis * 0.5);
          } else if (uMat < 3.5) {          // chrome
            vec3 r = reflect(-V, n);
            float sky = smoothstep(-0.2, 0.6, r.y), band = exp(-pow((r.y - 0.15) * 7.0, 2.0));
            vec3 envc = mix(vec3(0.04, 0.045, 0.06), vec3(0.85, 0.9, 1.0), sky) + vec3(1.2) * band;
            rgb = envc * mix(vec3(1.0), base, 0.65) * uInt + vec3(spec) * 1.2 + uCol * fres * uRim * 0.25 * (1.0 + uEmis);
          } else {                          // hologram
            float scan = 0.6 + 0.4 * sin(vV.y * 0.12);
            rgb = uCol * (fres * uRim * 0.55 + 0.05) * scan * (1.0 + uEmis * 0.5) * uInt;
            a = clamp((fres * 0.8 + 0.06) * uAlpha, 0.0, 1.0);
          }
          rgb *= uFade;
          frag = vec4(rgb * a, a);
        }`;
      const EVS = `#version 300 es
        layout(location=0) in vec2 q; layout(location=1) in vec3 e0; layout(location=2) in vec3 e1; layout(location=3) in float eL;
        uniform mat4 uL[7]; uniform vec2 uBase, res; uniform float uPx, uD, uZ, uW, uH;
        out vec2 d; out float len; out float ext;
        vec3 proj(vec3 p, int li){ vec4 w = uL[li] * vec4(p * 0.1, 1.0); float s = uD / max(uD - w.z, 1.0);
          return vec3(uBase + w.xy * s * uPx, clamp(uZ - w.z / 30000.0, -0.999, 0.999)); }
        void main(){
          int li = int(eL + 0.5);
          vec3 a = proj(e0, li), b = proj(e1, li);
          vec2 dir = b.xy - a.xy; float l = max(length(dir), 1e-3); dir /= l;
          vec2 nrm = vec2(-dir.y, dir.x);
          float x = uW * 0.5 + uH * 3.0 + 1.0;
          vec2 pos = mix(a.xy - dir * x, b.xy + dir * x, q.x) + nrm * q.y * x;
          d = vec2(mix(-x, l + x, q.x), q.y * x); len = l; ext = x;
          gl_Position = vec4(pos / res * 2.0 - 1.0, mix(a.z, b.z, q.x) - 0.0004, 1.0);
        }`;
      const EFS = `#version 300 es
        precision highp float;
        in vec2 d; in float len; in float ext; out vec4 frag;
        uniform float uW, uH, uWhite, uA, uGlow; uniform vec3 uCol;
        void main(){
          float al = clamp(d.x, 0.0, len); float dist = length(vec2(d.x - al, d.y));
          float hw = max(uW * 0.5, 0.5);
          float core = 1.0 - smoothstep(hw - 0.5, hw + 0.5, dist);
          float halo = uH > 0.01 ? exp(-max(dist - hw, 0.0) / uH) * (1.0 - smoothstep(ext * 0.75, ext, abs(d.y))) : 0.0;
          vec3 c = mix(uCol, vec3(1.0), uWhite * core);
          float a = clamp(core + halo * 0.8 * uGlow, 0.0, 1.0) * uA;
          frag = uGlow > 0.5 ? vec4(c * a, a * 0.6) : vec4(uCol * a, a);
        }`;
      const prog = webgl.program(gl, FS, VS), eprog = webgl.program(gl, EFS, EVS);
      for (const p of [prog, eprog]) { /* attribute locations are explicit */ }
      // mesh VAO
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = (data, loc, n, type, norm) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, type, norm, 0, 0); return b; };
      const bufs = [buf(MESH.P, 0, 3, gl.SHORT, false), buf(MESH.N, 1, 3, gl.BYTE, true), buf(MESH.T, 2, 1, gl.UNSIGNED_BYTE, false), buf(MESH.L, 3, 1, gl.UNSIGNED_BYTE, false)];
      gl.bindVertexArray(null);
      // edge VAO (instanced)
      const evao = gl.createVertexArray(); gl.bindVertexArray(evao);
      const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const eb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, eb); gl.bufferData(gl.ARRAY_BUFFER, MESH.E, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.SHORT, false, 12, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.SHORT, false, 12, 6); gl.vertexAttribDivisor(2, 1);
      const elb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, elb); gl.bufferData(gl.ARRAY_BUFFER, MESH.EL, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 0, 0); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);

      // render targets: MSAA (preferred) or direct with depth
      const W = L.target.w, H = L.target.h;
      let fb = null, rbs = [];
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
      try {
        if (samples < 2) throw 0;
        const c = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, c); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, W, H);
        const dz = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, dz); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
        fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dz);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw 0;
        rbs = [c, dz]; fb.msaa = true;
      } catch (e) {
        for (const r of rbs) gl.deleteRenderbuffer(r); rbs = [];
        const dz = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, dz); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
        fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.target.tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dz);
        rbs = [dz]; fb.msaa = false;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const inst = {
        reset(rng, P) { this.time = 0; this.beat = 0; this.hits = []; },
        step(dt, t, evs, P) {
          this.time += dt;
          this.beat += dt * (P.bpm / 60) * P.tempo;
          for (const e of evs) this.hits.push({ t: this.time, u: e.u, s: e.s, r: e.r });
          const keep = P.hitDecay * 6;
          if (this.hits.length > 64 || (this.hits.length && this.time - this.hits[0].t > keep)) this.hits = this.hits.filter(h => this.time - h.t < keep).slice(-64);
        },

        // ---------------- layout: [{u, y, z, s, face, order}]
        layout(P) {
          const n = Math.max(1, Math.round(P.count)), fc = Math.max(1, engine.project.faces | 0);
          const r = webgl.rng(webgl.hashSeed(engine.project.seed, L.id, 'layout'));
          const rs = Array.from({ length: n }, () => [r(), r(), r(), r()]);
          const a0 = P.spanStart, a1 = P.spanEnd, ds = P.depthSpread;
          const offs = {};
          String(P.offsets || '').split(';').forEach(seg => { const m = seg.split(':'); if (m.length < 2) return; const k = parseInt(m[0]); const v = m[1].split(',').map(Number); if (k >= 1) offs[k - 1] = v; });
          const out = [];
          for (let i = 0; i < n; i++) {
            const tt = n === 1 ? 0.5 : i / (n - 1);
            let u = a0 + (a1 - a0) * tt, z = 0;
            if (P.layout === 'faces') { const per = Math.ceil(n / fc), f = Math.floor(i / per) % fc, k = i % per; const w = Math.min(0.8, 0.25 * per) / fc; u = (f + 0.5) / fc + (per > 1 ? (k / (per - 1) - 0.5) * w : 0); }
            else if (P.layout === 'zigzag') z = (i % 2 ? 1 : -1) * ds * 0.6;
            else if (P.layout === 'arc') z = ds * (1 - Math.pow(2 * tt - 1, 2)) - ds * 0.4;
            else if (P.layout === 'vee') z = -ds * (1 - Math.pow(2 * tt - 1, 2)) + ds * 0.4;
            else if (P.layout === 'scatter') { u = a0 + (a1 - a0) * rs[i][0]; z = (rs[i][1] * 2 - 1) * ds; }
            let s = 1 + (rs[i][2] * 2 - 1) * P.sizeVar, y = P.posY;
            u = u + P.posX; z = z + P.posZ;
            u = u + (P.gatherX - u) * P.gather; z = z * (1 - P.gather * 0.7);
            const o = offs[i]; if (o) { u += o[0] || 0; y += o[1] || 0; z += o[2] || 0; if (o[3]) s *= o[3]; }
            z = Math.max(-1, Math.min(1, z));
            out.push({ u, y, z, s, i, r: rs[i] });
          }
          // flow order 0..1
          const us = out.map(a => a.u), mn = Math.min(...us), mx = Math.max(...us), rg = Math.max(1e-6, mx - mn), mid = (mn + mx) / 2;
          for (const a of out) {
            const x = (a.u - mn) / rg;
            a.order = P.flowDir === 'rl' ? 1 - x : P.flowDir === 'co' ? Math.abs(a.u - mid) / (rg / 2 || 1) : P.flowDir === 'oc' ? 1 - Math.abs(a.u - mid) / (rg / 2 || 1) : x;
          }
          return out;
        },

        // ---------------- pose: 6 joint angles (deg)
        pose(P, a, n) {
          const st = STYLES[P.style] || STYLES.edm, d = P.diversity, en = P.energy, amt = P.amount;
          const key = a.i * 7919 + 13;
          const delay = n > 1 ? P.phaseFlow * 3 * a.order : 0;
          const b = this.beat + (P.beatOffset * P.bpm / 60) - delay;
          const W = { sway: P.wSway, bob: P.wBob, ripple: P.wRipple, wrist: P.wWrist, circle: P.wCircle, lean: P.wLean, hit: P.wHit, spin: P.wSpin };
          const c = P.crouch;
          let q1 = 0, q2 = 18 + 24 * c, q3 = 46 + 48 * c, q4 = 0, q5 = 44 + 46 * c, q6 = 0;
          const v = {};
          for (const k of VOCAB) {
            const sv = st.v[k] || [0, 4, 's'];
            const rr = hash(a.i + 1, VOCAB.indexOf(k) + 31);
            const mulPick = rr < d * 0.25 ? 0.5 : rr > 1 - d * 0.25 ? 2 : 1;
            const cyc = sv[1] * mulPick;
            const ph = d * hash(a.i + 7, VOCAB.indexOf(k) + 3) * cyc;
            const w = sv[0] * W[k] * amt * (1 + d * (hash(a.i + 3, VOCAB.indexOf(k)) * 1.6 - 0.8));
            const sign = d > 0.5 && hash(a.i, VOCAB.indexOf(k) + 99) < (d - 0.5) ? -1 : 1;
            v[k] = { w: w * sign, x: (b + ph) / Math.max(0.125, cyc), env: sv[2] };
          }
          const E = (o, off) => env(o.env, o.x + (off || 0), en, key);
          q1 += 26 * v.sway.w * E(v.sway);
          const bb = E(v.bob); q2 += 7 * v.bob.w * bb; q3 += 15 * v.bob.w * bb; q5 -= 10 * v.bob.w * bb;
          q2 += 10 * v.ripple.w * Math.sin(v.ripple.x * 6.283); q3 += 18 * v.ripple.w * Math.sin((v.ripple.x - 0.13) * 6.283); q5 += 28 * v.ripple.w * Math.sin((v.ripple.x - 0.27) * 6.283);
          q4 += 30 * v.ripple.w * Math.sin((v.ripple.x - 0.4) * 6.283) * 0.4;
          q5 += 26 * v.wrist.w * E(v.wrist); q4 += 32 * v.wrist.w * E(v.wrist, 0.25); q6 += 70 * v.wrist.w * E(v.wrist, 0.5);
          q1 += 20 * v.circle.w * Math.cos(v.circle.x * 6.283); q2 += 9 * v.circle.w * Math.sin(v.circle.x * 6.283); q3 += 8 * v.circle.w * Math.sin(v.circle.x * 6.283 + 1.2);
          const ln = E(v.lean); q2 += 14 * v.lean.w * ln; q3 += 6 * v.lean.w * ln;
          if (v.hit.w) { const hk = key + 5; q1 += 22 * v.hit.w * env('t', v.hit.x, en, hk); q2 += 9 * v.hit.w * env('t', v.hit.x, en, hk + 1); q3 += 16 * v.hit.w * env('t', v.hit.x, en, hk + 2); q5 += 32 * v.hit.w * env('t', v.hit.x, en, hk + 3); q4 += 25 * v.hit.w * env('t', v.hit.x, en, hk + 4); }
          if (v.spin.w) { // turn a full circle during the 2nd half of each cycle, eased
            const x = v.spin.x, f = x - Math.floor(x), seg = Math.floor(x);
            const turn = f < 0.5 ? 0 : smooth((f - 0.5) / 0.5);
            q1 += 360 * Math.min(1, Math.abs(v.spin.w)) * Math.sign(v.spin.w) * (seg + turn) * (hash(a.i, 5) < 0.5 ? 1 : -1);
            q6 += 180 * v.spin.w * (seg + turn);
          }
          // marker hits
          let hit = 0;
          const fc = engine.project.faces || 6;
          for (const h of this.hits) {
            const age = this.time - h.t; if (age < 0) continue;
            const du = (a.u - h.u) * fc; const w = Math.exp(-du * du * 1.2);
            hit += h.s * w * Math.exp(-age / Math.max(0.02, P.hitDecay)) * Math.min(1, age / 0.04 + 0.2);
          }
          hit = Math.min(1.6, hit);
          q2 += 10 * hit * P.hitPose; q3 -= 14 * hit * P.hitPose; q5 += 34 * hit * P.hitPose; q1 += 12 * hit * P.hitPose * (a.r[3] < 0.5 ? 1 : -1);
          // ---- constraints: stay bent, never straight up, never through the floor
          const minBend = 28 + 30 * c;
          q2 = Math.max(-35, Math.min(78, q2));
          q3 = Math.max(minBend, Math.min(150, q3));
          if (q2 + q3 < 62) q3 = 62 - q2;                           // forearm never near vertical
          const ez = 241 + 885 * Math.cos(q2 * D2R), lim = Math.acos(Math.max(-1, Math.min(1, (260 - ez) / 885))) / D2R;
          if (q2 + q3 > lim) q3 = Math.max(minBend * 0.6, lim - q2);   // wrist stays above the floor
          q5 = Math.max(-120, Math.min(130, q5));
          return { q: [q1, q2, q3, q4, q5, q6], hit, beat: b };
        },

        linkMats(q, view) {
          const [q1, q2, q3, q4, q5, q6] = q.map(x => x * D2R);
          const T1 = M.rz(q1);
          const T2 = M.mul(T1, M.about(M.ry(q2), 0, 0, 241));
          const T3 = M.mul(T2, M.about(M.ry(q3), 0, 0, 1126));
          const T4 = M.mul(T3, M.about(M.rz(q4), 0, -67, 0));
          const T5 = M.mul(T4, M.about(M.ry(q5), 0, 0, 2011));
          const T6 = M.mul(T5, M.about(M.rz(q6), 0, -67, 0));
          const out = new Float32Array(16 * 7);
          [M.I(), T1, T2, T3, T4, T5, T6].forEach((m, i) => out.set(M.mul(view, m), i * 16));
          return out;
        },

        armColor(P, a, cols, n) {
          const m = P.colorMode;
          const samp = (x) => { const k = cols.length; x = ((x % 1) + 1) % 1 * k; const i = Math.floor(x), f = smooth(x - i); const A = cols[i % k], B = cols[(i + 1) % k]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; };
          if (m === 'original') return P.material === 'plastic' || P.material === 'chrome' ? [0.9, 0.92, 0.95] : cols[0];
          if (m === 'single') return cols[0];
          let x;
          if (m === 'perArm') x = a.i / cols.length;
          else if (m === 'random') x = a.i * 0.37 + webgl.noise.n2(this.time * Math.abs(P.flowSpeed) * 0.6 + a.i * 3.1, a.i * 7.7) * 1.4;
          else x = a.u * P.flowScale - this.time * P.flowSpeed * 0.25;
          if (P.randomFlow > 0 && m !== 'random') x += P.randomFlow * webgl.noise.n2(this.time * 0.35 + a.i * 4.3, a.i * 1.9) * 1.2;
          return m === 'perArm' && P.randomFlow === 0 ? cols[a.i % cols.length] : samp(x);
        },

        render(target, P) {
          const tw = target.w, th = target.h, docH = engine.docH;
          webgl.bindTarget(gl, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, tw, th);
          gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.depthMask(true);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
          const arms = this.layout(P), n = arms.length;
          const cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).map(webgl.hexToRgb);
          const acc = webgl.hexToRgb(P.accent);
          const cam = M.mul(M.rx(P.camPitch * D2R), M.mul(W2V, M.rz(-P.camYaw * D2R)));
          const Dp = 2600 + (1 - P.persp) * 30000;
          const mat = MATS[P.material] ?? 1;
          const glowEdges = mat === 1 || mat === 4;
          const pxS = tw / engine.docW;
          // back-to-front so translucent bodies blend sensibly
          const order = arms.slice().sort((x, y) => y.z - x.z);
          const wrap = !!engine.project.wrap;
          for (const a of order) {
            const pz = 1 - 0.38 * a.z;                     // depth perspective: front bigger
            const pxPerMm = P.scale * a.s * pz * docH * 0.0006 * pxS;
            const by = (a.y + a.z * 0.11) * th;
            let face = P.facing;
            const fm = P.facingMode;
            if (fm === 'alt') face += (a.i % 2) * 180;
            else if (fm === 'center') face += a.u > (P.gatherX * P.gather + 0.5 * (1 - P.gather)) ? 180 : 0;
            else if (fm === 'out') face += a.u > 0.5 ? 0 : 180;
            else if (fm === 'random') face += a.r[1] * 360;
            const ps = this.pose(P, a, n);
            const view = M.mul(cam, M.rz(face * D2R));
            const mats = this.linkMats(ps.q, view);
            const c = this.armColor(P, a, cols, n);
            const pulse = Math.exp(-((ps.beat % 1 + 1) % 1) * 5);
            const emis = P.beatFlash * pulse + ps.hit * P.hitFlash;
            const fade = 1 - P.depthFade * Math.max(0, (a.z + 1) / 2) * 0.85;
            const uZ = a.z * 0.55 - a.i * 0.0001;
            const xs = [a.u * tw];
            if (wrap) { const reach = 2300 * pxPerMm; if (a.u * tw < reach) xs.push(a.u * tw + tw); if (a.u * tw > tw - reach) xs.push(a.u * tw - tw); }
            for (const bx of xs) {
              const common = { uL: mats, uBase: [bx, by], res: [tw, th], uPx: pxPerMm, uD: Dp, uZ };
              // body
              if (mat !== 4 || P.bodyAlpha > 0.01) {
                gl.useProgram(prog.p);
                webgl.setUniforms(gl, prog, Object.assign({}, common, {
                  uMat: mat, uRim: P.rim, uDark: P.bodyDark, uAlpha: P.bodyAlpha, uGloss: P.gloss, uEmis: emis, uInt: P.intensity, uAccMix: P.accentMix, uFade: fade, uCol: c, uAcc: acc,
                }));
                webgl.setBlend(gl, (mat === 1 && P.bodyAlpha < 0.999) || mat === 4 ? 'over' : null);
                gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 2);
                gl.depthMask(mat !== 4);
                gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, MESH.nv);
                gl.disable(gl.POLYGON_OFFSET_FILL);
              }
              // edges
              if (P.edge > 0.001) {
                gl.useProgram(eprog.p);
                const ec = glowEdges ? c.map(x => x * P.intensity * (1 + emis) * fade) : (mat === 2 ? c.map(x => x * 0.35 * fade) : c.map(x => x * 0.8 * P.intensity * fade));
                webgl.setUniforms(gl, eprog, Object.assign({}, common, {
                  uW: P.edgeWidth * pxS * 2, uH: glowEdges ? P.edgeHalo * pxS * 2 : 0, uWhite: glowEdges ? P.edgeWhite : 0, uA: Math.min(1, P.edge) * (P.edge > 1 ? P.edge : 1) * (mat === 4 ? 0.55 : 1), uGlow: glowEdges ? 1 : 0, uCol: ec,
                }));
                webgl.setBlend(gl, glowEdges ? 'add' : 'over');
                gl.depthMask(false);
                if (P.xray) gl.disable(gl.DEPTH_TEST);
                gl.bindVertexArray(evao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MESH.ne);
                gl.enable(gl.DEPTH_TEST);
                gl.depthMask(true);
              }
            }
          }
          gl.bindVertexArray(null);
          gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
          if (fb.msaa) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.fbo);
            gl.blitFramebuffer(0, 0, tw, th, 0, 0, tw, th, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        },
        dispose() {
          gl.deleteFramebuffer(fb); for (const r of rbs) gl.deleteRenderbuffer(r);
          gl.deleteVertexArray(vao); gl.deleteVertexArray(evao); for (const b of bufs) gl.deleteBuffer(b); gl.deleteBuffer(qb); gl.deleteBuffer(eb); gl.deleteBuffer(elb);
        },
      };
      return inst;
    },
  };
})();
