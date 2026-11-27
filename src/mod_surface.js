'use strict';
import { RL } from './core/rl.js';
// SURFACE — 그라데이션 흐름 면 / 세로 그라데이션 면들의 커브 댄스 (씬 1_5)

RL.modules.surface = {
  label: '면', icon: '▥', blend: 'over',
  schema: [
    { id: 'mode', label: '방식', type: 'select', options: [['flow', '그라데이션 흐름 면'], ['strips', '세로 면 — 고무줄 너울 + 컬러 흐름'], ['stripsOld', '세로 면 — 구버전(진동)']], default: 'strips', group: '형태', rerender: true, hint: '세로 면: 위·아래 끝은 고정, 가운데가 고무줄처럼 늘었다 줄며 너울거림. 커브 춤 정도 0이면 곧은 세로 면에 컬러만 흐름' },
    { id: 'colors', label: '팔레트 (면들이 이 중에서 색을 배정받음)', type: 'colors', default: ['#2a1b5e', '#6a3df0', '#ff7ac8', '#ffd27a', '#3fd0c9'], group: '색상' },
    { id: 'opacity2', label: '면 불투명도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, group: '색상', key: true },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'contrast', label: '대비', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, group: '색상' },
    // flow
    { id: 'angle', when: (P) => P.mode === 'flow', label: '흐름 방향(도)', type: 'range', min: -180, max: 180, step: 1, default: 20, group: '흐름 면', key: true },
    { id: 'scale', when: (P) => P.mode === 'flow', label: '그라데이션 크기', type: 'range', min: 0.1, max: 6, step: 0.01, default: 0.9, group: '흐름 면', key: true },
    { id: 'flowSpeed', when: (P) => P.mode === 'flow', label: '흐름 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.35, group: '흐름 면', key: true },
    { id: 'warp', when: (P) => P.mode === 'flow', label: '일렁임(왜곡)', type: 'range', min: 0, max: 3, step: 0.01, default: 0.8, group: '흐름 면', key: true },
    { id: 'warpScale', when: (P) => P.mode === 'flow', label: '일렁임 크기', type: 'range', min: 0.2, max: 8, step: 0.01, default: 1.0, group: '흐름 면' },
    { id: 'bands', when: (P) => P.mode === 'flow', label: '색 띠 나누기(0=연속)', type: 'range', min: 0, max: 24, step: 1, default: 0, group: '흐름 면' },
    { id: 'bandSoft', when: (P) => P.mode === 'flow', label: '색 띠 경계 부드러움', type: 'range', min: 0.01, max: 0.5, step: 0.01, default: 0.15, group: '흐름 면' },
    { id: 'edgeFade', when: (P) => P.mode === 'flow', label: '위아래 페이드', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.08, group: '흐름 면' },
    // strips
    { id: 'count', when: (P) => P.mode !== 'flow', label: '면 개수', type: 'range', min: 1, max: 64, step: 1, default: 24, group: '세로 면' },
    { id: 'width', when: (P) => P.mode !== 'flow', label: '면 폭(간격 대비)', type: 'range', min: 0.05, max: 3, step: 0.01, default: 0.7, group: '세로 면', key: true },
    { id: 'spanL', when: (P) => P.mode !== 'flow', label: '배치 시작(가로 0~1)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '세로 면' },
    { id: 'spanR', when: (P) => P.mode !== 'flow', label: '배치 끝(가로 0~1)', type: 'range', min: 0, max: 1, step: 0.01, default: 1, group: '세로 면' },
    { id: 'bottom', when: (P) => P.mode !== 'flow', label: '면 하단', type: 'range', min: -0.2, max: 1, step: 0.01, default: 0.02, group: '세로 면', key: true },
    { id: 'top', when: (P) => P.mode !== 'flow', label: '면 상단', type: 'range', min: 0, max: 1.2, step: 0.01, default: 0.98, group: '세로 면', key: true },
    { id: 'dance', when: (P) => P.mode !== 'flow', label: '커브 춤 정도(0=직선)', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0, group: '세로 면', key: true, hint: '0이면 곧은 세로 면, 올리면 커브로 춤추기 시작. 키프레임으로 전개' },
    { id: 'amp', when: (P) => P.mode !== 'flow', label: '커브 폭', type: 'range', min: 0, max: 1, step: 0.005, default: 0.12, group: '세로 면', key: true },
    { id: 'freq', when: (P) => P.mode === 'stripsOld', label: '커브 굴곡 수', type: 'range', min: 0.1, max: 6, step: 0.01, default: 1.2, group: '세로 면', key: true },
    { id: 'danceSpeed', when: (P) => P.mode !== 'flow', label: '춤 속도', type: 'range', min: 0, max: 4, step: 0.01, default: 0.8, group: '세로 면', key: true },
    { id: 'phaseStep', when: (P) => P.mode === 'stripsOld', label: '면 간 위상차', type: 'range', min: 0, max: 3.14, step: 0.01, default: 0.35, group: '세로 면' },
    { id: 'twist', when: (P) => P.mode === 'stripsOld', label: '비틀림(리본)', type: 'range', min: 0, max: 3, step: 0.01, default: 0.6, group: '세로 면', key: true },
    { id: 'wobble', when: (P) => P.mode === 'stripsOld', label: '불규칙 흔들림', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '세로 면' },
    { id: 'depthVar', when: (P) => P.mode !== 'flow', label: '앞뒤 깊이 차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, group: '세로 면', hint: '홀수 면을 뒤로 보내 어둡고 좁게 — 겹침으로 깊이' },
    { id: 'gradDir', when: (P) => P.mode !== 'flow', label: '면 그라데이션 방향', type: 'select', options: [['v', '세로(위→아래)'], ['h', '가로(면 폭)'], ['x', '전체 가로 위치']], default: 'v', group: '세로 면' },
    { id: 'bpm', when: (P) => P.mode === 'strips', label: 'BPM (큐시트 템포)', type: 'range', min: 40, max: 200, step: 1, default: 120, group: '너울·컬러', key: true },
    { id: 'swayBeats', when: (P) => P.mode === 'strips', label: '방향 바뀌는 주기(박)', type: 'range', min: 1, max: 32, step: 0.5, default: 8, group: '너울·컬러', key: true, hint: '커브가 한쪽으로 휘었다가 반대로 넘어가는 데 걸리는 박자 수' },
    { id: 'breathBeats', when: (P) => P.mode === 'strips', label: '늘었다 줄어드는 주기(박)', type: 'range', min: 2, max: 64, step: 1, default: 16, group: '너울·컬러', hint: '커브 폭(고무줄 늘어남)이 커졌다 작아지는 한 주기' },
    { id: 'breath', when: (P) => P.mode === 'strips', label: '늘었다 줄어듦 정도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '너울·컬러', key: true },
    { id: 'beatSwell', when: (P) => P.mode === 'strips', label: '박자 부풂', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '너울·컬러', key: true, hint: '박자마다 커브가 부드럽게 한 번 더 부풀었다 돌아옴(움찔거림 없이)' },
    { id: 'waveX', when: (P) => P.mode === 'strips', label: '가로 물결 수(면 전체)', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.2, group: '너울·컬러', key: true, hint: '이웃 면들이 같은 방향으로 휘는 묶음의 크기. 작을수록 넓은 덩어리로 함께 너울' },
    { id: 'curveShape', when: (P) => P.mode === 'strips', label: '커브 모양(0 한 번 휨 ↔ 1 S자)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '너울·컬러', key: true },
    { id: 'drift', when: (P) => P.mode === 'strips', label: '물결 옆 흐름', type: 'range', min: -1, max: 1, step: 0.01, default: 0.15, group: '너울·컬러', key: true, hint: '휘는 묶음이 옆 면으로 천천히 옮겨 감' },
    { id: 'colorFlow', when: (P) => P.mode !== 'flow', label: '컬러 흐름 속도', type: 'range', min: -2, max: 2, step: 0.01, default: 0.12, group: '너울·컬러', key: true, hint: '그라데이션 색이 면을 따라 흘러감(초당 팔레트 바퀴). 0이면 정지' },
    { id: 'colorBeat', when: (P) => P.mode !== 'flow', label: '컬러 흐름 박자 가속', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6, group: '너울·컬러', key: true, hint: '박자마다 컬러가 한 번씩 밀려 흐름' },
    { id: 'colorScale', when: (P) => P.mode !== 'flow', label: '컬러 그라데이션 길이', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1, group: '너울·컬러' },
    { id: 'stripColors', when: (P) => P.mode === 'strips', label: '면 하나에 배정될 색상', type: 'select', options: [['1', '1색 — 한 톤 (시간 따라 다른 색으로 바뀜)'], ['2', '2색 흐름'], ['3', '3색 흐름'], ['grad', '팔레트 전체 그라데이션(이전 방식)']], default: '1', group: '너울·컬러', rerender: true, hint: '면마다 팔레트에서 서로 다른 색을 배정. 1색은 면 전체가 한 톤으로 머물다가 다음 색으로 천천히 바뀜(보라→민트, 오렌지→마젠타처럼)' },
    { id: 'colorHold', when: (P) => P.mode === 'strips' && P.stripColors !== 'grad', label: '한 톤에 머무는 정도', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0.7, group: '너울·컬러', key: true, hint: '높을수록 한 색에 오래 머물다 짧게 바뀜, 낮을수록 계속 섞이며 흐름' },
    { id: 'toneDepth', when: (P) => P.mode === 'strips' && P.stripColors !== 'grad', label: '같은 색 안의 명암 깊이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '너울·컬러', hint: '한 면 안에서 같은 색이 어두운 톤↔밝은 톤으로 흐르는 정도' },
    { id: 'colorSpread', when: (P) => P.mode === 'strips' && P.stripColors === 'grad', label: '면별 컬러 분포(0 같은 톤 ↔ 1 제각각)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '너울·컬러', key: true, hint: '0이면 이웃 면이 비슷한 톤으로 함께 흐르고, 올릴수록 면마다 팔레트의 다른 색에서 시작해 제각각의 컬러로 퍼짐' },
    { id: 'colorFlowVar', when: (P) => P.mode === 'strips', label: '면별 흐름 속도 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '너울·컬러', key: true, hint: '면마다 컬러가 흐르는 속도를 다르게 → 같은 박자 안에서도 색이 엇갈리며 섞임' },
    { id: 'colorReverse', when: (P) => P.mode === 'strips', label: '반대로 흐르는 면 비율', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '너울·컬러', key: true, hint: '일부 면은 컬러가 반대 방향으로 흐름(0=모두 같은 방향)' },
    { id: 'colorScaleVar', when: (P) => P.mode === 'strips' && P.stripColors !== '1', label: '면별 그라데이션 길이 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, group: '너울·컬러', hint: '어떤 면은 색이 길게, 어떤 면은 촘촘하게 바뀜' },
    { id: 'widthVar', when: (P) => P.mode === 'strips', label: '면 폭 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '세로 면' },
    { id: 'rim', when: (P) => P.mode !== 'flow', label: '가장자리 빛(유리)', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6, group: '물성' },
    { id: 'sheen', when: (P) => P.mode !== 'flow', label: '흐르는 광택', type: 'range', min: 0, max: 2, step: 0.01, default: 0.4, group: '물성' },
    { id: 'kick', label: '이벤트 춤 증폭', hint: '마커 때 커브가 부드럽게 더 부풂(고무줄 모드는 0.3초에 걸쳐 차오름)', type: 'range', min: 0, max: 2, step: 0.01, default: 0.5, group: '반응' },
    { id: 'kickDecay', label: '증폭 잔향(초)', type: 'range', min: 0.05, max: 4, step: 0.01, default: 0.8, group: '반응' },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const COMMON = RL.GLSL_NOISE + `
      uniform vec3 pal[6]; uniform float nPal, opacity, intensity, contrast, aspect, T, wrap;
      vec3 ramp(float t, float cyclic){ float n = nPal; float x = cyclic > 0.5 ? fract(t)*n : clamp(t,0.0,1.0)*(n-1.0);
        float i = floor(x), f = x - i; f = f*f*(3.0-2.0*f);
        int a = int(mod(i, n)), b = int(mod(i + 1.0, n)); vec3 A = pal[0], B = pal[0];
        for (int k = 0; k < 6; k++) { if (k == a) A = pal[k]; if (k == b) B = pal[k]; }
        return mix(A, B, f); }
      vec3 grade(vec3 c){ return max((c - 0.5)*contrast + 0.5, 0.0) * intensity; }
    `;
    const flow = RL.program(gl, COMMON + `
      uniform float angle, scale, warp, warpScale, bands, bandSoft, edgeFade, kick;
      float sm(vec2 p){ return vnoise(p) * 0.68 + vnoise(p * 2.07 + 3.1) * 0.32; }
      float smP(vec2 p, float per){ return vnoiseP(p, per) * 0.68 + vnoiseP(p * 2.0 + vec2(0.0, 3.1), per * 2.0) * 0.32; }
      void main(){
        vec2 p = vec2(uv.x*aspect, uv.y);
        vec2 dir = vec2(cos(angle), sin(angle));
        vec2 w; float lin;
        if (wrap > 0.5) {
          float per = max(1.0, floor(aspect*warpScale + 0.5));
          vec2 q = vec2(uv.x * per, uv.y * warpScale);
          w = vec2(smP(q + vec2(0.0, T*0.17), per), smP(q + vec2(0.0, 1.3 - T*0.29), per));
          float kx = floor(dir.x * scale * 0.25 * aspect + 0.5);            // whole cycles around the ring
          lin = kx * uv.x + dir.y * scale * 0.25 * uv.y;
        } else {
          vec2 q = p * warpScale;
          w = vec2(sm(q + vec2(T*0.31, T*0.17)), sm(q + vec2(5.2, 1.3) - vec2(T*0.23, T*0.29)));
          lin = dot(p, dir) * scale * 0.25;
        }
        float f = lin + (w.x - 0.5) * warp * (1.0 + kick) + (w.y - 0.5) * warp * 0.5 - T * 0.08;
        float t = f;
        if (bands > 0.5) { float x = fract(t) * bands; t = (floor(x) + smoothstep(0.5 - bandSoft, 0.5 + bandSoft, fract(x))) / bands; }
        vec3 c = grade(ramp(t, 1.0));
        float a = opacity * smoothstep(0.0, edgeFade + 1e-4, uv.y) * smoothstep(0.0, edgeFade + 1e-4, 1.0 - uv.y);
        frag = vec4(c * a, a); }`);
    const strips = RL.program(gl, COMMON + `
      uniform float n, width, spanL, spanR, bottom, top, dance, amp, freq, phaseStep, twist, wobble, depthVar, gradDir, rim, sheen, cflow;
      void main(){
        vec4 acc = vec4(0.0);
        float span = spanR - spanL; if (top <= bottom || span <= 0.0) { frag = acc; return; }
        float ys = (uv.y - bottom) / (top - bottom);
        if (ys < -0.02 || ys > 1.02) { frag = acc; return; }
        float yfade = smoothstep(-0.02, 0.03, ys) * smoothstep(-0.02, 0.03, 1.0 - ys);
        float aaw = fwidth(uv.x);
        for (int ii = 0; ii < 64; ii++) {
          float i = float(ii); if (i >= n) break;
          float back = mod(i, 2.0) * depthVar;
          float x0 = spanL + (i + 0.5) / n * span;
          float ph = T + i * phaseStep;
          float off = (sin(ys * freq * 6.2832 + ph) + 0.35 * sin(ys * freq * 13.2 - ph * 1.3 + i)) * amp * dance;
          off += (vnoise(vec2(i * 3.1, ys * 3.0 + T * 0.6)) - 0.5) * 0.25 * wobble * dance;
          float cx = x0 + off / aspect;
          float tw = cos(ys * freq * 3.1416 * twist + ph * 0.7 + i);
          float face = twist > 0.001 ? mix(1.0, abs(tw) * 0.85 + 0.15, min(twist, 1.0)) : 1.0;
          float wi = max(width / n * span * 0.5 * face * (1.0 - back * 0.35), 1e-5);
          float d = abs(wrapDx(uv.x - cx, wrap)) / wi;
          if (d > 1.0 + aaw / wi * 2.0) continue;
          vec3 c = gradDir < 0.5 ? ramp(i / n + (1.0 - ys) * 0.6 - cflow, 1.0)
                 : gradDir < 1.5 ? ramp(i / n + d * 0.18 - cflow, 1.0)
                 : ramp(uv.x - cflow, 1.0);
          c *= mix(0.55, 1.0, face) * (1.0 - back * 0.45);
          c += vec3(1.0) * rim * smoothstep(0.72, 1.0, d) * 0.6 * (1.0 - back * 0.5);
          float sh = ys - fract(T * 0.07 * (0.7 + hash12(vec2(i, 3.7))) + hash12(vec2(i, 9.1))); c += vec3(1.0) * sheen * exp(-sh*sh*90.0) * 0.5 * face;
          c = grade(c);
          float a = opacity * (1.0 - smoothstep(1.0 - aaw / wi * 1.5, 1.0, d)) * yfade * (1.0 - back * 0.25);
          acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a);
        }
        frag = acc; }`);
    // 고무줄 너울: a smooth, order-preserving horizontal displacement field — strips can never cross.
    // pixel x → undeformed x0 by fixed-point inversion of x = x0 + D(x0, y)
    const elastic = RL.program(gl, COMMON + `
      uniform float n, width, widthVar, spanL, spanR, bottom, top, depthVar, gradDir, rim, sheen, kx, drift, cflow, cscale, cspread, cfvar, crev, csvar, ncol, hold, tdepth;
      vec3 palAt(float k){ int a = int(mod(k, nPal)); vec3 A = pal[0]; for (int j = 0; j < 6; j++) if (j == a) A = pal[j]; return A; }
      uniform vec3 c1, c2;   // coefficients (amplitudes in uv.x) for vertical modes 1..3, for the sin and cos horizontal components
      float D(float x0, float ys){
        float e1 = sin(3.14159265 * ys), e2 = sin(6.2831853 * ys), e3 = sin(9.424778 * ys);
        float a = 6.2831853 * (kx * x0 - drift);
        float sa = sin(a), ca = cos(a);
        return (c1.x * e1 + c1.y * e2 + c1.z * e3) * sa + (c2.x * e1 + c2.y * e2 + c2.z * e3) * ca; }
      void main(){
        float span = spanR - spanL; if (top <= bottom || span <= 0.0) { frag = vec4(0.0); return; }
        float ys = (uv.y - bottom) / (top - bottom);
        if (ys < -0.02 || ys > 1.02) { frag = vec4(0.0); return; }
        float yc = clamp(ys, 0.0, 1.0);
        float yfade = smoothstep(-0.02, 0.03, ys) * smoothstep(-0.02, 0.03, 1.0 - ys);
        float x0 = uv.x;
        for (int it = 0; it < 7; it++) x0 = uv.x - D(x0, yc);
        float q = (x0 - spanL) / span * n;
        bool full = wrap > 0.5 && span > 0.999;
        if (full) q = mod(q, n); else if (q < 0.0 || q >= n) { frag = vec4(0.0); return; }
        float i = floor(q), f = fract(q);
        float back = mod(i, 2.0) * depthVar;
        float wv = 1.0 - widthVar * hash12(vec2(i, 5.3)) * 0.8;
        float wi = clamp(width, 0.05, 1.0) * wv * (1.0 - back * 0.3);
        float s = (f - 0.5) * 2.0;                 // -1..1 across the slot
        float d = abs(s) / wi;
        float aa = fwidth(q) * 2.0 / wi + 1e-4;
        if (d > 1.0 + aa * 2.0) { frag = vec4(0.0); return; }
        // per-strip colour character: start offset, speed, direction, gradient length
        float hO = hash12(vec2(i, 7.7)), hS = hash12(vec2(i, 4.4)), hR = hash12(vec2(i, 8.8)), hL = hash12(vec2(i, 6.1));
        float spd = (1.0 + cfvar * (hS * 2.0 - 1.0) * 0.9) * (hR < crev ? -1.0 : 1.0);
        float flow = -cflow * spd;
        float sc = cscale * (1.0 + csvar * (hL * 2.0 - 1.0) * 0.7);
        float off = mix(i / n * 0.35, hO, cspread);
        float t = gradDir < 0.5 ? off + (1.0 - yc) * 0.75 * sc + flow
                : gradDir < 1.5 ? mix(i / n * sc, hO, cspread) + s * 0.08 + flow
                : mix((spanL + (i + 0.5) / n * span) * sc, hO, cspread) + yc * 0.15 * sc + flow;
        vec3 c;
        if (ncol < 0.5) c = ramp(t, 1.0);
        else {
          // each strip owns its colour sequence: start colour + its own stride through the palette (so neighbours differ)
          float base = floor(hO * nPal), stride = 1.0 + floor(hash12(vec2(i, 1.9)) * max(nPal - 1.0, 1.0));
          float along = ncol > 1.5 ? (1.0 - yc) * (ncol - 1.0) * sc * 0.9 : 0.0;
          float pos = hO * 3.0 - cflow * spd * 4.0 + along;                  // whole numbers = pure tone
          float k = floor(pos), fr = fract(pos);
          float e = ncol > 1.5 ? smoothstep(hold * 0.5, 1.0 - hold * 0.15, fr) : smoothstep(hold, 1.0, fr);
          c = mix(palAt(base + k * stride), palAt(base + (k + 1.0) * stride), e * e * (3.0 - 2.0 * e));
          // tonal depth inside the same colour (dark ↔ light along the strip, drifting slowly)
          float tw = 0.5 + 0.5 * sin(yc * 3.3 + hL * 6.283 + T * 0.25 * (0.6 + hS));
          c *= mix(1.0, 0.45 + 0.85 * tw, tdepth);
        }
        float shade = 1.0 - 0.35 * s * s;            // soft cylindrical body
        c *= shade * (1.0 - back * 0.45) * (0.85 + 0.3 * hash12(vec2(i, 2.1)));
        c += vec3(1.0) * rim * smoothstep(0.78, 0.98, d) * 0.55 * (1.0 - back * 0.5);
        float sh = yc - fract(T * 0.05 * (0.7 + hash12(vec2(i, 3.7))) + hash12(vec2(i, 9.1)));
        c += vec3(1.0) * sheen * exp(-sh * sh * 90.0) * 0.4;
        c = grade(c);
        float a = opacity * (1.0 - smoothstep(1.0 - aa * 1.5, 1.0 + aa * 0.5, d)) * yfade * (1.0 - back * 0.2);
        frag = vec4(c * a, a); }`);
    const inst = {
      reset(rng, P) { this.rng = rng; this.time = 0; this.kicks = []; this.flowT = 0; this.danceT = 0; this.colT = 0; this.kickEnv = 0; this.kickTgt = 0; this.drT = 0; },
      step(dt, t, evs, P) {
        this.time += dt;
        for (const e of evs) this.kicks.push({ s: e.s, age: 0 });
        for (const k of this.kicks) k.age += dt;
        this.kicks = this.kicks.filter(k => k.age < P.kickDecay * 5);
        this.flowT = (this.flowT || 0) + dt * P.flowSpeed;
        this.danceT = (this.danceT || 0) + dt * P.danceSpeed;
        // beat clock (BPM) for the elastic strips — colour advances with a soft push on each beat
        const beat = 60 / Math.max(1, P.bpm || 120), bp = (this.time / beat) % 1;
        const push = Math.pow(1 - bp, 3) * 3.2;                                      // integrates to ~0.8 per beat
        this.colT += dt * (P.colorFlow ?? 0) * (1 + (P.colorBeat ?? 0) * (push - 0.8));
        this.drT += dt * (P.drift ?? 0) * 0.05 * Math.max(0, P.danceSpeed);
        // event swell: smooth follower (no instant jump → no twitch)
        let tgt = 0; for (const k of this.kicks) tgt += k.s * Math.exp(-k.age / Math.max(0.05, P.kickDecay));
        this.kickEnv += (tgt - this.kickEnv) * Math.min(1, dt / 0.3);
      },
      render(target, P) {
        RL.clear(gl, target);
        const cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).slice(0, 6);
        const pal = new Float32Array(18); cols.forEach((c, i) => pal.set(RL.hexToRgb(c), i * 3));
        let kick = 0; for (const k of this.kicks) kick += k.s * Math.exp(-k.age / P.kickDecay);
        kick *= P.kick;
        const common = { pal, nPal: cols.length, opacity: P.opacity2, intensity: P.intensity, contrast: P.contrast, aspect: engine.aspect, wrap: engine.project.wrap ? 1 : 0 };
        if (P.mode === 'flow') {
          RL.draw(gl, flow, target, Object.assign(common, { T: this.flowT || 0, angle: P.angle * Math.PI / 180, scale: P.scale, warp: P.warp, warpScale: P.warpScale, bands: P.bands, bandSoft: P.bandSoft, edgeFade: P.edgeFade, kick }));
        } else if (P.mode === 'strips') {
          const A = engine.aspect, beat = 60 / Math.max(1, P.bpm || 120);
          const bt = this.time / beat * Math.max(0, P.danceSpeed) / 0.8;             // 춤 속도 0.8 = 원래 템포
          const sw = 2 * Math.PI * bt / Math.max(0.5, P.swayBeats || 8);
          const bp = bt - Math.floor(bt), rise = Math.min(1, bp / 0.2);
          const swell = (1 - (1 - rise) * (1 - rise)) * Math.pow(1 - bp, 2);
          const br = 1 - (P.breath ?? 0.6) * (0.5 + 0.5 * Math.cos(2 * Math.PI * bt / Math.max(2, P.breathBeats || 16)));
          const mag = P.amp * Math.max(0, P.dance) * (0.25 + 0.75 * br) * (1 + (P.beatSwell ?? 0) * 0.5 * swell) * (1 + this.kickEnv * P.kick) / A;
          const cs = P.curveShape ?? 0.45;
          const w1 = 1 - cs * 0.6, w2 = cs, w3 = cs * cs * 0.45;
          // time-varying mode coefficients → curve bends one way, flattens, then bends the other way; S-curves come and go
          const m = [[w1, sw, 0.0], [w2, sw * 0.618, 1.7], [w3, sw * 1.37, 4.1]];
          let c1 = [0, 0, 0], c2 = [0, 0, 0], sum = 0;
          m.forEach(([w, ph, o], j) => { c1[j] = w * Math.cos(ph + o); c2[j] = w * Math.sin(ph * 0.83 + o + 0.9) * 0.6; sum += w * (Math.abs(Math.cos(ph + o)) + 0.6 * Math.abs(Math.sin(ph * 0.83 + o + 0.9))); });
          let kx = Math.max(0.25, P.waveX ?? 1.5); const span = Math.max(1e-3, P.spanR - P.spanL);
          if (engine.project.wrap && span > 0.999) kx = Math.max(1, Math.round(kx));
          // no-collision guarantee: |dD/dx0| <= 0.8  (order preserved, strips squeeze but never cross)
          const gmax = 2 * Math.PI * kx * mag * Math.max(sum, 1e-6);
          const k = gmax > 0.8 ? 0.8 / gmax : 1;
          RL.draw(gl, elastic, target, Object.assign(common, {
            T: this.time, n: Math.round(P.count), width: Math.min(1, P.width), widthVar: P.widthVar ?? 0.35, spanL: P.spanL, spanR: P.spanR, bottom: P.bottom, top: P.top,
            depthVar: P.depthVar, gradDir: P.gradDir === 'v' ? 0 : P.gradDir === 'h' ? 1 : 2, rim: P.rim, sheen: P.sheen,
            kx, drift: this.drT, cflow: this.colT, cscale: P.colorScale ?? 1, cspread: P.colorSpread ?? 0.6, cfvar: P.colorFlowVar ?? 0.45, crev: P.colorReverse ?? 0.25, csvar: P.colorScaleVar ?? 0.4, ncol: P.stripColors === 'grad' ? 0 : +(P.stripColors || 1), hold: P.colorHold ?? 0.7, tdepth: P.toneDepth ?? 0.55,
            c1: c1.map(v => v * mag * k), c2: c2.map(v => v * mag * k),
          }));
        } else {
          RL.draw(gl, strips, target, Object.assign(common, {
            T: this.danceT || 0, n: Math.round(P.count), width: P.width, spanL: P.spanL, spanR: P.spanR, bottom: P.bottom, top: P.top,
            dance: Math.min(2, P.dance + kick), amp: P.amp, freq: P.freq, phaseStep: P.phaseStep, twist: P.twist, wobble: P.wobble,
            depthVar: P.depthVar, gradDir: P.gradDir === 'v' ? 0 : P.gradDir === 'h' ? 1 : 2, rim: P.rim, sheen: P.sheen, cflow: this.colT || 0,
          }));
        }
      },
      dispose() {},
    };
    return inst;
  },
};
