'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as batches from './batch.js';
import * as eng from './engine.js';
import * as registry from './core/registry.js';
// NEONGEO — 네온 입체 기하: 입방체·다면체·기하무늬가 제자리에서 회전. 외곽선만 / 보이는 모서리 / 모든 모서리 / 면+모서리 / 솔리드

(function () {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const poly = (n, r, z, rot) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + (rot || 0); return [Math.cos(a) * r, Math.sin(a) * r, z]; });
  function convexFaces(V) { // brute-force hull faces for small convex vertex sets (planes through 3 pts with all others behind)
    const F = [], seen = new Set(), n = V.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = V[i], b = V[j], c = V[k];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (Math.hypot(...nn) < 1e-9) continue; nn = norm(nn);
      let d = nn[0] * a[0] + nn[1] * a[1] + nn[2] * a[2];
      let pos = 0, neg = 0; const on = [];
      for (let m = 0; m < n; m++) { const s = nn[0] * V[m][0] + nn[1] * V[m][1] + nn[2] * V[m][2] - d; if (s > 1e-6) pos++; else if (s < -1e-6) neg++; else on.push(m); }
      if (pos && neg) continue;
      if (pos) { nn = nn.map(x => -x); d = -d; }
      const key = on.slice().sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue; seen.add(key);
      // order 'on' points around the face centroid
      const cen = [0, 0, 0]; for (const m of on) for (let q = 0; q < 3; q++) cen[q] += V[m][q] / on.length;
      const ax = norm([V[on[0]][0] - cen[0], V[on[0]][1] - cen[1], V[on[0]][2] - cen[2]]);
      const ay = [nn[1] * ax[2] - nn[2] * ax[1], nn[2] * ax[0] - nn[0] * ax[2], nn[0] * ax[1] - nn[1] * ax[0]];
      on.sort((p, q) => { const P = V[p], Q = V[q]; const pa = Math.atan2((P[0] - cen[0]) * ay[0] + (P[1] - cen[1]) * ay[1] + (P[2] - cen[2]) * ay[2], (P[0] - cen[0]) * ax[0] + (P[1] - cen[1]) * ax[1] + (P[2] - cen[2]) * ax[2]);
        const qa = Math.atan2((Q[0] - cen[0]) * ay[0] + (Q[1] - cen[1]) * ay[1] + (Q[2] - cen[2]) * ay[2], (Q[0] - cen[0]) * ax[0] + (Q[1] - cen[1]) * ax[1] + (Q[2] - cen[2]) * ax[2]); return pa - qa; });
      F.push(on);
    }
    return F;
  }
  const fit = (V) => { const r = Math.max(...V.map(v => Math.hypot(...v))); return V.map(v => v.map(x => x / r)); };
  const S3 = (V) => ({ v: fit(V), f: convexFaces(fit(V)), solid: true });
  const SHAPES = {
    cube: { label: '입방체', make: () => { const V = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]); return S3(V); } },
    tetra: { label: '정사면체', make: () => S3([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) },
    octa: { label: '정팔면체', make: () => S3([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) },
    diamond: { label: '다이아몬드 (긴 팔면체)', make: () => S3([[0.62, 0, 0], [-0.62, 0, 0], [0, 0, 0.62], [0, 0, -0.62], [0, 1, 0], [0, -1, 0]]) },
    icosa: { label: '정이십면체', make: () => { const V = []; for (const a of [-1, 1]) for (const b of [-PHI, PHI]) V.push([0, a, b], [a, b, 0], [b, 0, a]); return S3(V); } },
    dodeca: { label: '정십이면체', make: () => { const V = [], ip = 1 / PHI; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]); for (const a of [-1, 1]) for (const b of [-1, 1]) V.push([0, a * ip, b * PHI], [a * ip, b * PHI, 0], [b * PHI, 0, a * ip]); return S3(V); } },
    prism3: { label: '삼각기둥', make: () => S3([...poly(3, 1, -0.8, Math.PI / 2), ...poly(3, 1, 0.8, Math.PI / 2)]) },
    prism6: { label: '육각기둥', make: () => S3([...poly(6, 1, -0.55), ...poly(6, 1, 0.55)]) },
    pyramid: { label: '사각뿔', make: () => S3([...poly(4, 1, -0.6, Math.PI / 4), [0, 0, 1]]) },
    // planar patterns (기하무늬): faces = one polygon, extra lines inside
    star: { label: '무늬 · 별', make: () => { const V = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.42 : 1; V.push([Math.cos(a) * r, Math.sin(a) * r, 0]); } return { v: V, f: [V.map((_, i) => i)], solid: false }; } },
    hexring: { label: '무늬 · 겹 육각', make: () => { const V = [...poly(6, 1, 0, Math.PI / 6), ...poly(6, 0.62, 0, 0), ...poly(6, 0.3, 0, Math.PI / 6)]; const f = [[0, 1, 2, 3, 4, 5]]; const lines = []; for (const o of [6, 12]) for (let i = 0; i < 6; i++) lines.push([o + i, o + (i + 1) % 6]); for (let i = 0; i < 6; i++) lines.push([i, 6 + i], [6 + i, 12 + i]); return { v: V, f, lines, solid: false }; } },
    sqnest: { label: '무늬 · 회전 사각', make: () => { const V = []; const lines = []; for (let k = 0; k < 4; k++) { const r = 1 - k * 0.22; const p = poly(4, r, 0, Math.PI / 4 + k * 0.32); const o = V.length; V.push(...p); for (let i = 0; i < 4; i++) lines.push([o + i, o + (i + 1) % 4]); } return { v: V, f: [[0, 1, 2, 3]], lines: lines.slice(4), solid: false }; } },
    circle: { label: '무늬 · 원환', make: () => { const V = [...poly(48, 1, 0), ...poly(48, 0.78, 0)]; const lines = []; for (let i = 0; i < 48; i++) lines.push([48 + i, 48 + (i + 1) % 48]); return { v: V, f: [V.slice(0, 48).map((_, i) => i)], lines, solid: false }; } },
    tri: { label: '무늬 · 삼각 격자', make: () => { const V = poly(3, 1, 0, Math.PI / 2); const m = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => [(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, 0]); V.push(...m); return { v: V, f: [[0, 1, 2]], lines: [[3, 4], [4, 5], [5, 3]], solid: false }; } },
  };
  const SOLIDS = ['cube', 'icosa', 'octa', 'dodeca', 'tetra', 'prism6', 'diamond', 'pyramid', 'prism3'];
  const PATTERNS = ['star', 'hexring', 'sqnest', 'circle', 'tri'];
  const cache = {};
  function shape(k) {
    if (cache[k]) return cache[k];
    const s = SHAPES[k].make();
    const ek = new Map();
    s.f.forEach((f, fi) => f.forEach((a, i) => { const b = f[(i + 1) % f.length]; const key = a < b ? a + '_' + b : b + '_' + a; if (!ek.has(key)) ek.set(key, { a, b, faces: [] }); ek.get(key).faces.push(fi); }));
    s.edges = [...ek.values()];
    for (const [a, b] of (s.lines || [])) s.edges.push({ a, b, faces: [], inner: true });
    return (cache[k] = s);
  }

  const shapeOpts = Object.keys(SHAPES).map(k => [k, SHAPES[k].label]);
  registry.modules.neongeo = {
    label: '네온 입체 기하', icon: '◇', blend: 'add',
    schema: [
      { id: 'shape', label: '도형', type: 'select', default: 'cube', group: '형태', options: [['mixSolid', '입체 섞기 (순서대로)'], ['mixPattern', '무늬 섞기 (순서대로)'], ['mixAll', '모두 섞기'], ...shapeOpts] },
      { id: 'count', label: '개수', type: 'range', min: 1, max: 48, step: 1, default: 6, group: '형태' },
      { id: 'layout', label: '배치', type: 'select', default: 'faces', group: '형태', options: [['faces', '면마다 (A~F 중앙)'], ['even', '좌우 균등'], ['list', '지정 면'], ['random', '무작위']] },
      { id: 'list', label: '지정 면 (예: A,C,E)', type: 'text', default: 'A,C,E', group: '형태' },
      { id: 'posX', label: '위치 X (좌우)', type: 'range', min: -1, max: 1, step: 0.001, default: 0, group: '형태', key: true },
      { id: 'posY', label: '위치 Y (높이)', type: 'range', min: -0.3, max: 1.3, step: 0.005, default: 0.62, group: '형태', key: true },
      { id: 'jitterY', label: '높이 흩어짐', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.12, group: '형태' },
      { id: 'jitterX', label: '좌우 흩어짐', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.02, group: '형태' },
      { id: 'size', label: '크기 (화면 높이 비율)', type: 'range', min: 0.02, max: 1.5, step: 0.005, default: 0.22, group: '형태', key: true },
      { id: 'sizeVar', label: '크기 편차', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.25, group: '형태' },
      { id: 'depthVar', label: '앞뒤 깊이 차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '형태', hint: '뒤에 있는 도형은 작고 어둡게' },
      { id: 'inner', label: '안쪽 겹 도형', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '형태', key: true, hint: '0보다 크면 안쪽에 같은 도형이 반대로 회전' },
      { id: 'persp', label: '원근 강도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '형태' },
      { id: 'reveal', label: '그려짐 정도 (0→1 드로잉)', type: 'range', min: 0, max: 1, step: 0.001, default: 1, group: '형태', key: true },
      // 회전
      { id: 'axis', label: '회전 축', type: 'select', default: 'x', group: '회전', options: [['x', 'X축 (앞뒤로 넘어가며)'], ['y', 'Y축 (좌우로 돌며)'], ['z', 'Z축 (평면 회전)'], ['xy', 'X+Y'], ['xyz', 'X+Y+Z'], ['random', '도형마다 무작위']] },
      { id: 'rotSpeed', label: '회전 속도 (도/초)', type: 'range', min: -360, max: 360, step: 1, default: 40, group: '회전', key: true },
      { id: 'rotVar', label: '속도 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, group: '회전' },
      { id: 'alternate', label: '이웃끼리 반대 방향', type: 'bool', default: true, group: '회전' },
      { id: 'tiltX', label: '기본 기울기 X(도)', type: 'range', min: -90, max: 90, step: 1, default: 18, group: '회전', key: true },
      { id: 'tiltY', label: '기본 기울기 Y(도)', type: 'range', min: -90, max: 90, step: 1, default: 28, group: '회전', key: true },
      { id: 'wobble', label: '흔들림', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, group: '회전', key: true },
      { id: 'bpm', label: '박자 BPM', type: 'range', min: 40, max: 200, step: 1, default: 124, group: '회전' },
      { id: 'pulse', label: '박자 맥동 (크기)', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.06, group: '회전', key: true },
      // 선 스타일
      { id: 'mode', label: '표시 방식', type: 'select', default: 'visible', group: '선 스타일', options: [['outline', '외곽선만 (실루엣)'], ['visible', '보이는 모서리만'], ['all', '모든 모서리 (투시)'], ['faces', '반투명 면 + 모서리'], ['solid', '네온 솔리드 (면 채움)']] },
      { id: 'style', label: '라인 재질', type: 'select', default: 'neon', group: '선 스타일', options: [['neon', '네온'], ['tube', '튜브(입체)'], ['ribbon', '리본'], ['flat', '평면'], ['beads', '구슬']] },
      { id: 'core', label: '선 두께(px)', type: 'range', min: 0.5, max: 30, step: 0.1, default: 3, group: '선 스타일', key: true },
      { id: 'halo', label: '번짐(px)', type: 'range', min: 0, max: 40, step: 0.1, default: 6, group: '선 스타일', key: true },
      { id: 'white', label: '흰 심', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '선 스타일' },
      { id: 'faceAlpha', label: '면 불투명도', type: 'range', min: 0, max: 1, step: 0.01, default: 0.18, group: '선 스타일', key: true },
      { id: 'dots', label: '꼭짓점 점', type: 'range', min: 0, max: 3, step: 0.01, default: 0, group: '선 스타일' },
      // 색상
      { id: 'colorMode', label: '색 배치', type: 'select', default: 'perShape', group: '색상', options: [['single', '단색'], ['perShape', '도형마다'], ['flow', '색 흐름 (좌↔우)'], ['random', '랜덤 흐름'], ['perEdge', '모서리마다 그라데이션']] },
      { id: 'colors', label: '팔레트', type: 'colors', default: ['#ff3fd0', '#5a7dff', '#ffe23a', '#2ff0ff', '#ff4a6e'], group: '색상' },
      { id: 'flowSpeed', label: '색 흐름 속도', type: 'range', min: -2, max: 2, step: 0.01, default: 0.2, group: '색상', key: true },
      { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 4, step: 0.01, default: 1.2, group: '색상', key: true },
      // 반응
      { id: 'kick', label: '마커 회전 킥(도)', type: 'range', min: 0, max: 360, step: 1, default: 90, group: '반응' },
      { id: 'pop', label: '마커 크기 팝', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '반응' },
      { id: 'flash', label: '마커 발광', type: 'range', min: 0, max: 4, step: 0.01, default: 1.5, group: '반응' },
      { id: 'decay', label: '잔향(초)', type: 'range', min: 0.05, max: 2, step: 0.01, default: 0.4, group: '반응' },
    ],
    create(engine, L) {
      const gl = engine.gl;
      // simple premultiplied triangle batch for face fills
      const MAXV = 60000, tri = new Float32Array(MAXV * 6);
      const tvs = `#version 300 es
        layout(location=0) in vec2 p; layout(location=1) in vec4 c; out vec4 vc;
        void main(){ vc = c; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
      const tfs = `#version 300 es
        precision highp float; in vec4 vc; out vec4 frag; void main(){ frag = vc; }`;
      const tprog = webgl.program(gl, tfs, tvs);
      const tvao = gl.createVertexArray(); gl.bindVertexArray(tvao);
      const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, tri.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
      gl.bindVertexArray(null);
      let nt = 0;
      const pushV = (x, y, r, g, b, a) => { if (nt >= MAXV) return; tri.set([x, y, r * a, g * a, b * a, a], nt * 6); nt++; };

      const rot3 = (v, ax, ay, az) => {
        let [x, y, z] = v;
        let c = Math.cos(ax), s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
        c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
        c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c];
        return [x, y, z];
      };

      return {
        reset(rng, P) { this.time = 0; this.beat = 0; this.ang = []; this.hits = []; },
        step(dt, t, evs, P) {
          this.time += dt; this.beat += dt * P.bpm / 60;
          const n = Math.round(P.count);
          while (this.ang.length < 48) this.ang.push(0);
          const r = webgl.rng(webgl.hashSeed(engine.project.seed, L.id, 'spd'));
          for (let i = 0; i < 48; i++) { const v = 1 + (r() * 2 - 1) * P.rotVar; const dir = P.alternate && i % 2 ? -1 : 1; this.ang[i] += dt * P.rotSpeed * v * dir; }
          for (const e of evs) this.hits.push({ t: this.time, u: e.u, s: e.s });
          this.hits = this.hits.filter(h => this.time - h.t < P.decay * 6).slice(-48);
          this.n = n;
        },
        render(target, P) {
          webgl.clear(gl, target);
          const proj = engine.project, A = engine.aspect, docW = engine.docW, docH = engine.docH, fc = Math.max(1, proj.faces | 0);
          const n = Math.round(P.count), r = webgl.rng(webgl.hashSeed(proj.seed, L.id, 'geo'));
          const cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).map(webgl.hexToRgb);
          const samp = (x) => { const k = cols.length; x = ((x % 1) + 1) % 1 * k; const i = Math.floor(x), f = x - i; const a = cols[i % k], b = cols[(i + 1) % k]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
          const listF = eng.parseFaces(P.list, fc);
          const sg = engine.segs, sb = engine.sprites; sg.begin(); sb.begin(); nt = 0;
          const style = batches.LINE_STYLES[P.style] ?? 0;
          const ph = ((this.beat % 1) + 1) % 1, pulseB = Math.exp(-ph * 6);
          const items = [];
          for (let i = 0; i < n; i++) {
            const rr = [r(), r(), r(), r(), r(), r()];
            let u;
            if (P.layout === 'faces') u = ((i % fc) + 0.5) / fc + (Math.floor(i / fc)) * 0.37 / fc;
            else if (P.layout === 'list') { const L2 = listF.length ? listF : [0]; u = (L2[i % L2.length] + 0.5) / fc + Math.floor(i / L2.length) * 0.37 / fc; }
            else if (P.layout === 'random') u = rr[0];
            else u = (i + 0.5) / n;
            u += P.posX + (rr[1] * 2 - 1) * P.jitterX;
            const v = P.posY + (rr[2] * 2 - 1) * P.jitterY;
            const z = rr[3] * P.depthVar;
            let key = P.shape;
            if (key === 'mixSolid') key = SOLIDS[i % SOLIDS.length]; else if (key === 'mixPattern') key = PATTERNS[i % PATTERNS.length]; else if (key === 'mixAll') { const all = [...SOLIDS, ...PATTERNS]; key = all[i % all.length]; }
            if (!SHAPES[key]) key = 'cube';
            items.push({ i, u, v, z, rr, key });
          }
          items.sort((a, b) => b.z - a.z);
          for (const it of items) {
            const { i, rr } = it, sh = shape(it.key);
            let hit = 0, kick = 0;
            for (const h of this.hits) { const age = this.time - h.t; const du = (it.u - h.u) * fc; const w = Math.exp(-du * du * 1.5) * h.s; hit += w * Math.exp(-age / P.decay); kick += w * (1 - Math.exp(-age / (P.decay * 0.5))); }
            const depthK = 1 - it.z * 0.5;
            const S = P.size * docH * 0.5 * (1 + (rr[4] * 2 - 1) * P.sizeVar) * depthK * (1 + P.pulse * pulseB + P.pop * hit);
            const a = (this.ang[i] || 0) * Math.PI / 180 + kick * P.kick * Math.PI / 180 * (P.alternate && i % 2 ? -1 : 1);
            const wob = P.wobble * Math.sin(this.time * 1.3 + i * 2.1) * 0.5;
            let ax = P.tiltX * Math.PI / 180 + wob, ay = P.tiltY * Math.PI / 180 + wob * 0.7, az = 0;
            let axis = P.axis; if (axis === 'random') axis = ['x', 'y', 'z', 'xy', 'xyz'][Math.floor(rr[5] * 5)];
            if (axis.includes('x')) ax += a; if (axis.includes('y')) ay += a * (axis === 'xy' ? 0.7 : axis === 'xyz' ? 0.6 : 1); if (axis.includes('z')) az += a * (axis === 'xyz' ? 0.4 : 1);
            if (axis === 'z' && !sh.solid) { /* planar spin */ }
            const fade = (1 - it.z * 0.55) * P.intensity * (1 + hit * P.flash);
            let col;
            if (P.colorMode === 'single') col = cols[0];
            else if (P.colorMode === 'flow' || P.colorMode === 'perEdge') col = samp(it.u - this.time * P.flowSpeed * 0.25);
            else if (P.colorMode === 'random') col = samp(i * 0.31 + webgl.noise.n2(this.time * Math.abs(P.flowSpeed) + i * 3.7, i) * 1.5);
            else col = cols[i % cols.length];
            const layers = [[1, 1]]; if (P.inner > 0.001) layers.push([0.5, -1]);
            const xs = [it.u]; if (proj.wrap) { const rad = S * 1.2 / docW; if (it.u < rad) xs.push(it.u + 1); if (it.u > 1 - rad) xs.push(it.u - 1); }
            for (const [scl, dir] of layers) {
              const sc = scl === 1 ? 1 : 0.35 + 0.4 * P.inner;
              const al = scl === 1 ? 1 : P.inner;
              const R = sh.v.map(p => rot3(p, ax * dir, ay * dir, az * dir));
              const Dd = 1.5 + (1 - P.persp) * 30;
              const pts = R.map(p => { const k = Dd / (Dd - p[2]); return [p[0] * k * S * sc / docW, p[1] * k * S * sc / docH, p[2]]; });
              // face visibility (view along -z)
              const front = sh.f.map(f => { if (!sh.solid) return true; const a0 = pts[f[0]], a1 = pts[f[1]], a2 = pts[f[2]]; return ((a1[0] - a0[0]) * A * (a2[1] - a0[1]) - (a1[1] - a0[1]) * (a2[0] - a0[0]) * A) > 0; });
              const faceN = sh.f.map(f => { const a0 = R[f[0]], a1 = R[f[1]], a2 = R[f[2]]; const u1 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]], u2 = [a2[0] - a0[0], a2[1] - a0[1], a2[2] - a0[2]]; return norm([u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]]); });
              for (const cx of xs) {
                const X = (p) => cx + p[0], Y = (p) => it.v + p[1];
                // faces
                if ((P.mode === 'faces' || P.mode === 'solid') && P.faceAlpha > 0) {
                  const order = sh.f.map((f, fi) => [fi, f.reduce((s, k) => s + pts[k][2], 0) / f.length]).sort((a, b) => a[1] - b[1]);
                  for (const [fi] of order) {
                    if (P.mode === 'solid' && !front[fi]) continue;
                    const f = sh.f[fi], nz = Math.abs(faceN[fi][2]);
                    const lit = P.mode === 'solid' ? (0.25 + 0.75 * nz) : 1;
                    const fa = Math.min(1, P.faceAlpha * (P.mode === 'solid' ? 4 : 1)) * Math.min(1, P.reveal * 1.5) * al * (P.mode === 'solid' ? 1 : 0.6 + 0.4 * nz) * Math.min(1, fade);
                    for (let k = 1; k < f.length - 1; k++) for (const vi of [f[0], f[k], f[k + 1]]) pushV(X(pts[vi]), Y(pts[vi]), col[0] * lit * fade * 0.6, col[1] * lit * fade * 0.6, col[2] * lit * fade * 0.6, fa);
                  }
                }
                // edges
                const E = sh.edges, nE = E.length;
                for (let k = 0; k < nE; k++) {
                  const e = E[k];
                  let show;
                  if (!sh.solid) show = P.mode !== 'outline' || !e.inner;
                  else if (P.mode === 'all' || P.mode === 'faces') show = true;
                  else if (P.mode === 'outline') show = e.faces.length === 2 ? front[e.faces[0]] !== front[e.faces[1]] : true;
                  else show = e.faces.some(fi => front[fi]);
                  if (!show) continue;
                  const prog = Math.max(0, Math.min(1, P.reveal * nE - k)); if (prog <= 0) continue;
                  const pa = pts[e.a], pb = pts[e.b];
                  const bx = pa[0] + (pb[0] - pa[0]) * prog, by = pa[1] + (pb[1] - pa[1]) * prog;
                  let c = col;
                  if (P.colorMode === 'perEdge') c = samp(it.u + k / nE - this.time * P.flowSpeed * 0.25);
                  const hidden = sh.solid && !e.faces.some(fi => front[fi]);
                  const ea = al * (hidden ? 0.35 : 1);
                  sg.push(X(pa), Y(pa), cx + bx, it.v + by, P.core * (scl === 1 ? 1 : 0.7), P.halo, c[0] * fade, c[1] * fade, c[2] * fade, Math.min(1, ea), P.white, style, k * 37, 0.3);
                }
                if (P.dots > 0 && P.reveal > 0.5) for (const p of pts) sb.push(X(p), Y(p), P.core * 2.2 * P.dots, P.core * 2.2 * P.dots, 0, col[0] * fade, col[1] * fade, col[2] * fade, al, 1, 0.5, 0.6, 0);
              }
            }
          }
          if (nt) {
            webgl.bindTarget(gl, target); gl.useProgram(tprog.p); webgl.setBlend(gl, 'over');
            gl.bindVertexArray(tvao); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tri, 0, nt * 6);
            gl.drawArrays(gl.TRIANGLES, 0, nt); gl.bindVertexArray(null);
          }
          sg.flush(target, docW, 'screen');
          sb.flush(target, docW, 'add');
        },
        dispose() { gl.deleteVertexArray(tvao); gl.deleteBuffer(tb); },
      };
    },
  };
})();
