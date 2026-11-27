'use strict';
// LASER — 레이저 아트: 가는 고휘도 빔(흰 심 + 색 번짐) · 안개 산란 · BPM 동기 패턴 · 레이저 그래픽(리사주·원·별·물결)

(function () {
  const MAXB = 64;
  const PATTERNS = [['fan', '부채꼴 (펼쳐 흔들기)'], ['sweep', '평행 스캔'], ['cross', '교차 X'], ['rain', '위에서 내리꽂기'], ['tunnel', '방사 터널 (회전)'], ['sheet', '라이트 시트 (빽빽한 면)'], ['horizon', '가로 확산 빔'], ['graphic', '레이저 그래픽 (도형 그리기)']];
  RL.modules.laser = {
    label: '레이저 아트', icon: '⚡', blend: 'add',
    schema: [
      { id: 'pattern', label: '패턴', type: 'select', default: 'fan', group: '패턴', options: PATTERNS },
      { id: 'sources', label: '광원 면 (예: A,C,E)', type: 'text', default: 'B,D,F', group: '패턴' },
      { id: 'sourceY', label: '광원 높이', type: 'range', min: -0.2, max: 1.2, step: 0.005, default: 1.0, group: '패턴', key: true, hint: '1 = 화면 위 가장자리, 0 = 바닥' },
      { id: 'sourceX', label: '광원 좌우 이동', type: 'range', min: -0.5, max: 0.5, step: 0.001, default: 0, group: '패턴', key: true },
      { id: 'beams', label: '광원당 빔 수', type: 'range', min: 1, max: 24, step: 1, default: 7, group: '패턴' },
      { id: 'angle', label: '기본 방향(도, 0=아래)', type: 'range', min: -180, max: 180, step: 1, default: 0, group: '패턴', key: true },
      { id: 'fan', label: '펼침 각도', type: 'range', min: 0, max: 180, step: 0.5, default: 70, group: '패턴', key: true },
      { id: 'length', label: '빔 길이', type: 'range', min: 0, max: 2, step: 0.01, default: 1.4, group: '패턴', key: true, hint: '0에서 키프레임으로 올리면 빔이 뻗어 나감' },
      { id: 'endFade', label: '끝부분 페이드', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '패턴', key: true, hint: '빔 길이 중 끝쪽 몇 %에서 서서히 사라질지. 0이면 칼처럼 끊김' },
      { id: 'lengthVar', label: '빔 길이 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '패턴', hint: '빔마다 길이를 다르게 해 끝이 한 줄로 맞춰지지 않게' },
      // 움직임
      { id: 'bpm', label: '큐시트 템포 (BPM)', type: 'range', min: 40, max: 200, step: 1, default: 124, group: '움직임' },
      { id: 'tempo', label: '움직임 속도 (느리게↔빠르게)', type: 'range', min: 0.05, max: 4, step: 0.01, default: 1, group: '움직임', key: true },
      { id: 'sweep', label: '흔들림 각도', type: 'range', min: 0, max: 90, step: 0.5, default: 22, group: '움직임', key: true },
      { id: 'sweepBeats', label: '흔들림 주기(박)', type: 'range', min: 0.25, max: 32, step: 0.25, default: 4, group: '움직임' },
      { id: 'phaseStep', label: '광원 간 위상차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '움직임', hint: '0 = 모든 광원이 같이, 0.5 = 엇갈려 반대로' },
      { id: 'rotate', label: '회전 속도 (터널·그래픽)', type: 'range', min: -2, max: 2, step: 0.01, default: 0.25, group: '움직임', key: true },
      { id: 'chase', label: '순차 점멸 (체이스)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '움직임', key: true, hint: '빔이 박자마다 한 줄씩 차례로 켜짐' },
      { id: 'chaseBeats', label: '체이스 한 칸(박)', type: 'range', min: 0.125, max: 4, step: 0.125, default: 0.5, group: '움직임' },
      { id: 'strobe', label: '스트로브', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '움직임', key: true },
      { id: 'strobeRate', label: '스트로브 속도(박당)', type: 'range', min: 0.5, max: 8, step: 0.5, default: 2, group: '움직임' },
      // 레이저 (물성)
      { id: 'core', label: '빔 심 두께(px)', type: 'range', min: 0.3, max: 12, step: 0.1, default: 1.6, group: '레이저' },
      { id: 'halo', label: '빔 번짐(px)', type: 'range', min: 0, max: 60, step: 0.5, default: 9, group: '레이저' },
      { id: 'white', label: '흰 심', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.7, group: '레이저' },
      { id: 'falloff', label: '거리 감쇠', type: 'range', min: 0, max: 4, step: 0.01, default: 0.35, group: '레이저' },
      { id: 'fog', label: '안개 산란', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '레이저', key: true },
      { id: 'fogScale', label: '안개 결 크기', type: 'range', min: 0.5, max: 30, step: 0.1, default: 6, group: '레이저' },
      { id: 'fogSpeed', label: '안개 흐름', type: 'range', min: 0, max: 2, step: 0.01, default: 0.25, group: '레이저' },
      { id: 'hotspot', label: '광원 헤드 밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 0.9, group: '레이저' },
      { id: 'endDot', label: '끝점 맺힘 (페이드 0.2 미만일 때)', type: 'range', min: 0, max: 3, step: 0.01, default: 0.4, group: '레이저' },
      // 그래픽
      { id: 'figure', label: '그래픽 도형', type: 'select', default: 'lissajous', group: '그래픽', options: [['lissajous', '리사주'], ['circle', '원'], ['star', '별'], ['wave', '물결선'], ['spiral', '나선'], ['flower', '꽃잎']] },
      { id: 'figSize', label: '그래픽 크기', type: 'range', min: 0.05, max: 1.5, step: 0.005, default: 0.35, group: '그래픽', key: true },
      { id: 'figY', label: '그래픽 높이', type: 'range', min: 0, max: 1, step: 0.005, default: 0.55, group: '그래픽', key: true },
      { id: 'figA', label: '리사주 주파수 a', type: 'range', min: 1, max: 9, step: 1, default: 3, group: '그래픽' },
      { id: 'figB', label: '리사주 주파수 b', type: 'range', min: 1, max: 9, step: 1, default: 2, group: '그래픽' },
      { id: 'figMorph', label: '모양 변형 속도', type: 'range', min: 0, max: 2, step: 0.01, default: 0.3, group: '그래픽', key: true },
      { id: 'figDraw', label: '그려짐 정도', type: 'range', min: 0, max: 1, step: 0.001, default: 1, group: '그래픽', key: true },
      // 색상
      { id: 'colorMode', label: '색 배치', type: 'select', default: 'perSource', group: '색상', options: [['single', '단색'], ['perSource', '광원마다'], ['perBeam', '빔마다'], ['flow', '색 흐름 (좌↔우)']] },
      { id: 'colors', label: '팔레트', type: 'colors', default: ['#ff2a6d', '#21e6ff', '#ffe14a', '#3dff7a', '#b44dff'], group: '색상' },
      { id: 'flowSpeed', label: '색 흐름 속도', type: 'range', min: -2, max: 2, step: 0.01, default: 0.3, group: '색상', key: true },
      { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 5, step: 0.01, default: 1.3, group: '색상', key: true },
      // 반응
      { id: 'flash', label: '마커 점멸', type: 'range', min: 0, max: 4, step: 0.01, default: 1.4, group: '반응' },
      { id: 'burst', label: '마커 때 펼쳐짐', type: 'range', min: 0, max: 2, step: 0.01, default: 0.5, group: '반응' },
      { id: 'decay', label: '잔향(초)', type: 'range', min: 0.03, max: 2, step: 0.01, default: 0.3, group: '반응' },
    ],
    create(engine, L) {
      const gl = engine.gl;
      const prog = RL.program(gl, RL.GLSL_NOISE + `
        uniform vec4 bm[${MAXB}]; uniform vec4 bc[${MAXB}]; uniform float nb, aspect, coreW, haloW, white, fog, fogScale, T, falloff, hot, endDot, endFade, wrap;
        void main(){
          vec2 p = vec2(uv.x * aspect, uv.y);
          float per = max(1.0, floor(aspect * fogScale + 0.5));
          float fn = wrap > 0.5 ? fbmP(vec2(uv.x * per + T * 0.5 * per / (aspect * fogScale), uv.y * fogScale - T * 0.7), per) : fbm(p * fogScale + vec2(T * 0.5, -T * 0.7));
          float fg = mix(1.0, 0.25 + 1.35 * fn, fog);
          vec3 col = vec3(0.0); float wh = 0.0;
          for (int i = 0; i < ${MAXB}; i++) { if (float(i) >= nb) break;
            vec4 b = bm[i]; if (b.w <= 0.0) continue;
            vec2 s = vec2(b.x * aspect, b.y); vec2 dir = vec2(sin(b.z), -cos(b.z));
            vec2 d0 = p - s; if (wrap > 0.5) d0.x -= aspect * floor(d0.x / aspect + 0.5);
            float len = bc[i].w;
            // head glow (nearest image only)
            float hr = length(d0);
            float head = hot * b.w * exp(-hr * hr / (coreW * coreW * 60.0 + 1e-6));
            col += bc[i].rgb * head; wh += head * 0.5;
            // beam body: in 360 wrap mode also test the neighbouring source images, so a beam longer than
            // half the wall keeps going instead of being cut where the wrap folds
            for (int k = -1; k <= 1; k++) {
              if (wrap < 0.5 && k != 0) continue;
              vec2 d = d0 + vec2(float(k) * aspect, 0.0);
              float along = dot(d, dir); if (along < 0.0 || along > len) continue;
              float perp = abs(d.x * dir.y - d.y * dir.x);
              float t = along / max(len, 1e-4);
              float lm = 1.0 - smoothstep(1.0 - endFade, 1.0, t);      // soft opacity fade toward the tip
              lm *= lm;
              lm *= smoothstep(0.0, 0.015, along) * 0.6 + 0.4;
              float fall = exp(-along * falloff);
              float core = exp(-perp * perp / (coreW * coreW + 1e-7));
              float halo = haloW > 0.0 ? exp(-perp / haloW) * 0.32 : 0.0;
              float v = b.w * lm * fall;
              col += bc[i].rgb * v * (core * (0.55 + 0.45 * fg) + halo * fg);
              wh += v * core * white;
              if (endDot > 0.0 && endFade < 0.2) { vec2 e = d - dir * len; float er = dot(e, e); col += bc[i].rgb * endDot * (1.0 - endFade * 5.0) * b.w * fall * exp(-er / (coreW * coreW * 30.0 + 1e-6)); }
            }
          }
          col += vec3(wh);
          float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
          frag = vec4(col, a); }`);
      return {
        reset(rng, P) { this.time = 0; this.beat = 0; this.hits = []; },
        step(dt, t, evs, P) {
          this.time += dt; this.beat += dt * P.bpm / 60 * P.tempo;
          for (const e of evs) this.hits.push({ t: this.time, u: e.u, s: e.s, face: e.face });
          this.hits = this.hits.filter(h => this.time - h.t < P.decay * 6).slice(-48);
        },
        hitAt(u, P) { let h = 0; const fc = engine.project.faces || 6; for (const x of this.hits) { const age = this.time - x.t; const du = (u - x.u) * fc; h += x.s * Math.exp(-du * du * 1.2) * Math.exp(-age / P.decay); } return Math.min(2, h); },
        render(target, P) {
          RL.clear(gl, target);
          const proj = engine.project, fc = Math.max(1, proj.faces | 0), A = engine.aspect;
          let faces = RL.parseFaces(P.sources, fc); if (!faces.length) faces = [Math.floor(fc / 2)];
          const cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).map(RL.hexToRgb);
          const samp = (x) => { const k = cols.length; x = ((x % 1) + 1) % 1 * k; const i = Math.floor(x), f = x - i; const a = cols[i % k], b = cols[(i + 1) % k]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
          const B = this.beat, D = Math.PI / 180, k = Math.round(P.beams);
          const strobeOn = P.strobe > 0 ? (((B * P.strobeRate) % 1) < 0.5 ? 1 : 1 - P.strobe) : 1;
          const bm = new Float32Array(MAXB * 4), bc = new Float32Array(MAXB * 4);
          let nb = 0, gid = 0;
          const add = (u, v, ang, inten, c, len) => {
            if (nb >= MAXB) return;
            let ch = 1;
            if (P.chase > 0) { const step = Math.floor(B / P.chaseBeats), on = ((gid % k) === (step % k)) || (((gid + 1) % k) === (step % k) ? 0.35 : 0); ch = 1 - P.chase + P.chase * on; }
            gid++;
            const lv = 1 - P.lengthVar * (0.15 + 0.85 * (((Math.sin((gid + 1) * 12.9898 + 78.233) * 43758.5453) % 1) + 1) % 1);
            bm.set([u, v, ang, inten * ch * strobeOn], nb * 4); bc.set([c[0], c[1], c[2], len * lv], nb * 4); nb++;
          };
          const colFor = (si, j, u) => P.colorMode === 'single' ? cols[0] : P.colorMode === 'perBeam' ? cols[(si * k + j) % cols.length] : P.colorMode === 'flow' ? samp(u - this.time * P.flowSpeed * 0.25 + j * 0.02) : cols[si % cols.length];
          const len = P.length, I = P.intensity, sw = (si, off) => Math.sin(((B / P.sweepBeats) + si * P.phaseStep + (off || 0)) * Math.PI * 2);
          if (P.pattern === 'graphic') { this.drawGraphic(target, P, faces, fc, colFor, strobeOn); return; }
          faces.forEach((f, si) => {
            const u = (f + 0.5) / fc + P.sourceX, v = P.sourceY;
            const h = this.hitAt(u, P), inten = I * (1 + h * P.flash);
            const fanE = P.fan * (1 + P.burst * h);
            const kk = k;
            if (P.pattern === 'fan') {
              for (let j = 0; j < kk; j++) { const t = kk > 1 ? j / (kk - 1) - 0.5 : 0; add(u, v, (P.angle + t * fanE + P.sweep * sw(si)) * D, inten, colFor(si, j, u), len); }
            } else if (P.pattern === 'sweep') {
              for (let j = 0; j < kk; j++) { const off = (kk > 1 ? j / (kk - 1) - 0.5 : 0) * 0.6 / fc; add(u + off, v, (P.angle + P.sweep * sw(si)) * D, inten, colFor(si, j, u + off), len); }
            } else if (P.pattern === 'cross') {
              const half = Math.max(1, Math.floor(kk / 2));
              for (let j = 0; j < half; j++) { const t = half > 1 ? j / (half - 1) : 0.5; const a = fanE * 0.5 * (0.35 + 0.65 * t) + P.sweep * sw(si);
                add(u, v, (P.angle + a) * D, inten, colFor(si, j, u), len); add(u, v, (P.angle - a) * D, inten, colFor(si, j + half, u), len); }
            } else if (P.pattern === 'rain') {
              for (let j = 0; j < kk; j++) { const ph = (j / kk + B / P.sweepBeats * 0.25) % 1; const uu = (f + ph) / fc + P.sourceX; const tilt = P.angle + P.sweep * 0.3 * Math.sin((B / P.sweepBeats + j * 0.37) * Math.PI * 2);
                const drop = Math.min(1, ((B * 2 + j * 0.61) % 2)); add(uu, v, tilt * D, inten * (0.6 + 0.4 * Math.sin(j * 2.3 + B * 3.1)), colFor(si, j, uu), len * (0.3 + 0.7 * RL.ease.expoOut(drop))); }
            } else if (P.pattern === 'tunnel') {
              const vv = P.sourceY > 0.95 ? 0.5 : v;
              for (let j = 0; j < kk; j++) add(u, vv, (j / kk * 360 + this.time * P.rotate * 120 * P.tempo + P.angle + (si % 2 ? 180 / kk : 0)) * D, inten, colFor(si, j, u), len);
            } else if (P.pattern === 'sheet') {
              const n2 = Math.min(MAXB, kk * 2);
              for (let j = 0; j < n2; j++) { const t = n2 > 1 ? j / (n2 - 1) - 0.5 : 0; add(u, v, (P.angle + t * fanE * 0.25 + P.sweep * 1.5 * sw(si)) * D, inten * 0.55, colFor(si, j, u), len); }
            } else if (P.pattern === 'horizon') {
              const vv = P.sourceY > 0.95 ? 0.45 : v;
              for (let j = 0; j < kk; j++) { const t = kk > 1 ? j / (kk - 1) - 0.5 : 0; const side = j % 2 ? 1 : -1; const reach = len * (1 + P.burst * h);
                add(u, vv + t * 0.25, (side * (90 - t * fanE * 0.15) + P.sweep * 0.25 * sw(si, j * 0.1)) * D, inten, colFor(si, j, u), reach * A * 0.5); }
            }
          });
          RL.draw(gl, prog, target, {
            bm, bc, nb, aspect: A, coreW: P.core / engine.docH, haloW: P.halo / engine.docH, white: P.white, fog: P.fog, fogScale: P.fogScale,
            T: this.time * P.fogSpeed, falloff: P.falloff, hot: P.hotspot, endDot: P.endDot, endFade: P.endFade, wrap: proj.wrap ? 1 : 0,
          });
        },
        drawGraphic(target, P, faces, fc, colFor, strobeOn) {
          const sg = engine.segs, A = engine.aspect; sg.begin();
          const N = 220, T = this.time, B = this.beat;
          faces.forEach((f, si) => {
            const cu = (f + 0.5) / fc + P.sourceX, cv = P.figY;
            const h = this.hitAt(cu, P), sz = P.figSize * 0.5 * (1 + P.burst * 0.5 * h), inten = P.intensity * (1 + h * P.flash) * strobeOn;
            const rot = T * P.rotate * P.tempo * 2 + si * 0.7, m = T * P.figMorph;
            const pts = [];
            const draw = Math.max(0, Math.min(1, P.figDraw)), nDraw = Math.floor(N * draw);
            for (let i = 0; i <= N; i++) {
              const t = i / N * Math.PI * 2; let x = 0, y = 0;
              if (P.figure === 'lissajous') { x = Math.sin(P.figA * t + m); y = Math.sin(P.figB * t); }
              else if (P.figure === 'circle') { const r = 1 + 0.06 * Math.sin(t * 6 + m * 3); x = Math.cos(t) * r; y = Math.sin(t) * r; }
              else if (P.figure === 'star') { const r = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(t * 2.5 + m * 0.2)), 3); x = Math.cos(t) * r; y = Math.sin(t) * r; }
              else if (P.figure === 'wave') { x = (i / N) * 2 - 1; y = Math.sin(x * 3 * Math.PI + m * 3) * 0.45 * Math.sin((i / N) * Math.PI); }
              else if (P.figure === 'spiral') { const r = i / N; x = Math.cos(t * 4 + m) * r; y = Math.sin(t * 4 + m) * r; }
              else { const r = Math.cos(P.figA * t + m * 0.3); x = Math.cos(t) * r; y = Math.sin(t) * r; }
              const c = Math.cos(rot), s = Math.sin(rot);
              pts.push([x * c - y * s, x * s + y * c]);
            }
            for (let i = 0; i < Math.min(N, nDraw); i++) {
              const a = pts[i], b = pts[i + 1];
              const col = colFor(si, i % Math.max(1, Math.round(P.beams)), cu + a[0] * sz / A);
              const flick = 0.85 + 0.15 * Math.sin(i * 0.7 + B * 40);
              sg.push(cu + a[0] * sz / A, cv + a[1] * sz, cu + b[0] * sz / A, cv + b[1] * sz, P.core * 1.6, P.halo * 0.7, col[0] * inten * flick, col[1] * inten * flick, col[2] * inten * flick, 1, Math.min(1, P.white), 0, i * 9, 0.3);
            }
          });
          sg.flush(target, engine.docW, 'screen');
        },
        dispose() {},
      };
    },
  };
})();
