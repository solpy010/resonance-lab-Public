'use strict';
// DOT — 스프링 격자 도트 (이웃 결합으로 파동이 실제로 전파). 도트 융기·기둥 돌출

RL.modules.dot = {
  label: '도트', icon: '⠿', blend: 'over',
  schema: [
    { id: 'rows', label: '줄 수', type: 'range', min: 4, max: 120, step: 1, default: 28, group: '형태' },
    { id: 'layout', label: '배열', type: 'select', rerender: true, options: [['square', '사각 격자'], ['hex', '육각 격자'], ['sea', '해수면 표면']], default: 'hex', group: '형태' },
    { id: 'area', label: '세로 영역(0~1)', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.7, group: '형태' },
    { id: 'baseY', label: '바닥 위치', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.05, group: '형태' },
    { id: 'dotSize', label: '도트 크기(px)', type: 'range', min: 1, max: 60, step: 0.5, default: 9, group: '형태', key: true },
    { id: 'sizeByHeight', when: (P) => P.layout !== 'sea', label: '높이에 따른 크기 변화', type: 'range', min: -1, max: 3, step: 0.01, default: 0, group: '형태', key: true, hint: '+면 높이 솟은 도트가 커지고, −면 작아짐(−1이면 꼭대기에서 거의 사라짐). 0=변화 없음' },
    { id: 'sizeCurve', when: (P) => P.layout !== 'sea', label: '크기 변화 곡선', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1, group: '형태', hint: '1=높이에 비례, 1보다 크면 꼭대기 근처에서만 급격히, 작으면 조금만 솟아도 바로 변함' },
    { id: 'shape', label: '모양', type: 'select', options: [['disc', '원'], ['square', '사각']], default: 'square', group: '형태' },
    { id: 'pillar', when: (P) => P.layout !== 'sea', label: '기둥 표현', type: 'bool', default: true, group: '형태' },
    { id: 'heightScale', when: (P) => P.layout !== 'sea', label: '돌출 높이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.22, group: '형태', key: true },
    { id: 'extrudeAngle', when: (P) => P.layout !== 'sea', label: '돌출 방향(°, 0=위 · 180=아래)', type: 'range', min: -180, max: 180, step: 1, default: 0, group: '돌출 각도', key: true, hint: '화면 평면에서 도트가 솟는 방향. 90=오른쪽, −90=왼쪽, ±180=아래로 튕김. 키프레임으로 회전 가능' },
    { id: 'extrudeZ', when: (P) => P.layout !== 'sea', label: 'Z축 기울기(°, 90=관객 쪽)', type: 'range', min: -90, max: 90, step: 1, default: 0, group: '돌출 각도', key: true, hint: '0=화면 평면 안에서만 솟음, 90=완전히 관객 쪽으로 튀어나옴(Z축), −90=화면 안쪽으로 꺼짐' },
    { id: 'zPersp', when: (P) => P.layout !== 'sea', label: 'Z 원근 강도', type: 'range', min: 0, max: 3, step: 0.01, default: 1.2, group: '돌출 각도', key: true, hint: 'Z로 나올수록 커지고 소실점에서 멀어지는 정도' },
    { id: 'vpMode', when: (P) => P.layout !== 'sea', label: 'Z 소실점', type: 'select', options: [['none', '없음(제자리에서 커짐)'], ['face', '면마다 중심'], ['center', '화면 중앙']], default: 'face', group: '돌출 각도' },
    { id: 'vpY', when: (P) => P.layout !== 'sea', label: '소실점 높이', type: 'range', min: -0.5, max: 1.5, step: 0.01, default: 0.45, group: '돌출 각도' },
    { id: 'bipolar', when: (P) => P.layout !== 'sea', label: '반대쪽(음수)으로도 튕김', type: 'bool', default: false, group: '돌출 각도', hint: '스프링 반동이 돌출 반대 방향으로도 넘어감. 끄면 기존처럼 한쪽만' },
    { id: 'hitDir', when: (P) => P.layout !== 'sea', label: '타격 방향', type: 'select', options: [['push', '돌출 방향으로 밀기'], ['pull', '반대로 꺼트리기'], ['alt', '번갈아']], default: 'push', group: '돌출 각도' },
    { id: 'seaSwell', label: '잔물결 높이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '해수면', key: true, when: (P) => P.layout === 'sea', hint: '해수면의 완만한 일렁임 세기' },
    { id: 'seaScale', label: '물결 촘촘함', type: 'range', min: 0.3, max: 8, step: 0.1, default: 2.2, group: '해수면', when: (P) => P.layout === 'sea' },
    { id: 'seaSpeed', label: '흐름 속도', type: 'range', min: 0, max: 2, step: 0.01, default: 0.35, group: '해수면', key: true, when: (P) => P.layout === 'sea', hint: '달이 흘러가는 바다처럼 수면이 흐르는 속도' },
    { id: 'seaGlint', label: '윤슬 반짝임', type: 'range', min: 0, max: 2, step: 0.01, default: 0.8, group: '해수면', key: true, when: (P) => P.layout === 'sea', hint: '수면에 반사되는 반짝이는 빛(윤슬)' },
    { id: 'seaGlintSize', label: '반짝임 알갱이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '해수면', when: (P) => P.layout === 'sea', hint: '클수록 반짝임이 작고 또렷, 작을수록 넓게 번짐' },
    { id: 'seaHorizon', label: '수평선 원근', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '해수면', when: (P) => P.layout === 'sea', hint: '먼 수면이 수평선으로 모이는 원근 정도' },
    { id: 'seaFade', label: '먼 곳 흐려짐', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '해수면', when: (P) => P.layout === 'sea' },
    { id: 'tilt', label: '원근(뒤쪽 줄 축소)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '물성', when: (P) => P.layout !== 'sea' },
    { id: 'stiffness', label: '복원력', type: 'range', min: 0.5, max: 60, step: 0.5, default: 14, group: '움직임' },
    { id: 'damping', label: '반동 감쇠', type: 'range', min: 0, max: 10, step: 0.05, default: 1.6, group: '움직임' },
    { id: 'coupling', label: '이웃 전파', type: 'range', min: 0, max: 200, step: 1, default: 70, group: '움직임', hint: '높을수록 타격이 파동처럼 멀리 번짐' },
    { id: 'noiseAmp', when: (P) => P.layout !== 'sea', label: '산맥 높낮이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '움직임', key: true },
    { id: 'noiseScale', when: (P) => P.layout !== 'sea', label: '산맥 크기', type: 'range', min: 0.2, max: 12, step: 0.1, default: 2.2, group: '움직임' },
    { id: 'noiseSpeed', when: (P) => P.layout !== 'sea', label: '산맥 이동 속도', type: 'range', min: 0, max: 2, step: 0.01, default: 0.25, group: '움직임' },
    { id: 'hit', label: '이벤트 타격 세기', type: 'range', min: 0, max: 5, step: 0.01, default: 1.6, group: '반응' },
    { id: 'hitRadius', label: '타격 반경', type: 'range', min: 0.01, max: 0.5, step: 0.01, default: 0.07, group: '반응' },
    { id: 'autoEvery', label: '자동 타격 간격(초, 0=끔)', type: 'range', min: 0, max: 5, step: 0.05, default: 0, group: '반응' },
    { id: 'colorLow', label: '낮은 곳 색', type: 'color', default: '#5a2a12', group: '색상' },
    { id: 'colorHigh', label: '높은 곳 색', type: 'color', default: '#ffb35c', group: '색상' },
    { id: 'restAlpha', label: '잔잔할 때 밝기', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '색상', key: true },
    { id: 'glow', label: '광채', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, group: '물성' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
  ],
  create(engine, L) {
    const gl = engine.gl;
    let cols = 0, rows = 0, h, v;
    const inst = {
      layout(P) {
        const r = Math.round(P.rows);
        const spacingY = P.area / r;
        const c = Math.max(2, Math.round(engine.aspect / spacingY));
        if (r !== rows || c !== cols) { rows = r; cols = c; h = new Float32Array(r * c); v = new Float32Array(r * c); }
      },
      reset(rng, P) { this.rng = rng; rows = 0; this.layout(P); this.time = 0; this.nextAuto = P.autoEvery > 0 ? 0.2 : Infinity; this.nHit = 0; },
      hit(u, vv, s, P) {
        const R = P.hitRadius, A = engine.aspect, WR = !!engine.project.wrap;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) / cols, y = j / rows;
          let ddx = x - u; if (WR) ddx -= Math.round(ddx);
          const dx = ddx * A, dy = (y - (vv - P.baseY) / P.area) * P.area;
          const d2 = (dx * dx + dy * dy) / (R * R);
          if (d2 < 9) v[j * cols + i] += s * P.hit * 4 * Math.exp(-d2);
        }
      },
      step(dt, t, evs, P) {
        this.layout(P);
        if (dt <= 0) return;
        this.time += dt;
        for (const e of evs) { this.nHit = (this.nHit || 0) + 1; const sg = P.hitDir === 'pull' ? -1 : P.hitDir === 'alt' && this.nHit % 2 === 0 ? -1 : 1; this.hit(e.u, P.baseY + P.area * 0.3, e.s * sg, P); }
        if (P.autoEvery > 0 && this.time >= this.nextAuto) { this.hit(this.rng(), P.baseY + P.area * 0.3, 1, P); this.nextAuto = this.time + P.autoEvery; }
        const sub = 3, h2 = dt / sub, k = P.stiffness, c = P.damping, cp = P.coupling, A = engine.aspect, WR = !!engine.project.wrap;
        const tz = this.time * P.noiseSpeed;
        const target = new Float32Array(rows * cols);
        if (P.noiseAmp > 0 && P.layout !== 'sea') for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          let nv;
          if (WR) { const th = (i / cols) * Math.PI * 2, R = A * P.noiseScale / (Math.PI * 2); nv = RL.noise.n3(Math.cos(th) * R, Math.sin(th) * R + j / rows * P.noiseScale * 0.5, tz); }
          else nv = RL.noise.n3((i / cols) * A * P.noiseScale, j / rows * P.noiseScale * 0.5, tz);
          target[j * cols + i] = Math.max(0, nv * 1.8 - 0.05) * P.noiseAmp * 1.6;
        }
        for (let s = 0; s < sub; s++) {
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const id = j * cols + i;
            const l = i > 0 ? h[id - 1] : (WR ? h[id + cols - 1] : h[id]), r = i < cols - 1 ? h[id + 1] : (WR ? h[id - cols + 1] : h[id]);
            const d = j > 0 ? h[id - cols] : h[id], u = j < rows - 1 ? h[id + cols] : h[id];
            const lap = l + r + d + u - 4 * h[id];
            v[id] += (-(h[id] - target[id]) * k + lap * cp - v[id] * c) * h2;
          }
          for (let id = 0; id < h.length; id++) h[id] += v[id] * h2;
        }
      },
      render(target, P) {
        RL.clear(gl, target);
        if (P.layout === 'sea') { this.renderSea(target, P); return; }
        const sb = engine.sprites, A = engine.aspect, docH = engine.docH, WR = !!engine.project.wrap, nF = engine.project.faces;
        sb.begin();
        const lo = RL.hexToRgb(P.colorLow), hi = RL.hexToRgb(P.colorHigh), shape = P.shape === 'square' ? 0 : 1;
        const ang = P.extrudeAngle * Math.PI / 180, za = P.extrudeZ * Math.PI / 180;
        const ux = Math.sin(ang), uy = Math.cos(ang), cp = Math.cos(za), sz = Math.sin(za);
        const items = [];
        const proj = (x, y, z) => {      // z: toward viewer, in height units
          const f = Math.max(0.15, 1 + z * P.zPersp * 3);
          if (P.vpMode === 'none' || Math.abs(z) < 1e-6) return [x, y, f];
          const vx = P.vpMode === 'center' ? 0.5 : (Math.floor(Math.min(0.9999, Math.max(0, x)) * nF) + 0.5) / nF;
          return [vx + (x - vx) * f, P.vpY + (y - P.vpY) * f, f];
        };
        for (let j = rows - 1; j >= 0; j--) {
          const fr = j / Math.max(1, rows - 1);
          const scl = 1 - P.tilt * fr * 0.7;
          const yb = P.baseY + P.area * (P.tilt > 0 ? Math.pow(fr, 1 + P.tilt * 0.6) : fr);
          const off = P.layout === 'hex' && j % 2 ? 0.5 : 0;
          for (let i = 0; i < cols; i++) {
            const id = j * cols + i, hv0 = h[id], hv = P.bipolar ? hv0 : Math.max(0, hv0);
            let x = (i + 0.5 + off) / cols; if (x > 1) { if (WR) x -= 1; else continue; }
            const e = Math.min(1, Math.abs(hv) / 0.7);
            const d = hv * P.heightScale * scl;                 // displacement length (height units)
            const dp = d * cp, dz = d * sz;
            const [tx, ty, tf] = proj(x + ux * dp / A, yb + uy * dp, dz);
            const col = [lo[0] + (hi[0] - lo[0]) * e, lo[1] + (hi[1] - lo[1]) * e, lo[2] + (hi[2] - lo[2]) * e];
            const a = Math.min(1, (P.restAlpha + e * (1 - P.restAlpha)) * (1 - fr * P.tilt * 0.5)) * P.intensity;
            const sk = Math.max(0.03, 1 + P.sizeByHeight * Math.pow(e, P.sizeCurve));
            items.push({ k: -fr + dz * 2, x, yb, tx, ty, tf, col, a, e, s: P.dotSize * scl * sk, hv });
          }
        }
        if (Math.abs(sz) > 0.01) items.sort((p, q) => p.k - q.k);
        const put = (x, y, w, hh, rot, c, a, sh, soft, glow) => {
          if (WR) { x = ((x % 1) + 1) % 1; const m = w / engine.docW; sb.push(x, y, w, hh, rot, c[0], c[1], c[2], a, sh, soft, glow); if (x < m) sb.push(x + 1, y, w, hh, rot, c[0], c[1], c[2], a, sh, soft, glow); else if (x > 1 - m) sb.push(x - 1, y, w, hh, rot, c[0], c[1], c[2], a, sh, soft, glow); }
          else sb.push(x, y, w, hh, rot, c[0], c[1], c[2], a, sh, soft, glow);
        };
        for (const it of items) {
          if (P.pillar && Math.abs(it.hv) > 0.18) {
            const dxp = (it.tx - it.x) * engine.docW, dyp = (it.ty - it.yb) * docH, len = Math.hypot(dxp, dyp);
            if (len > 0.5) put((it.x + it.tx) / 2, (it.yb + it.ty) / 2, it.s * 0.4 * Math.sqrt(it.tf), len, Math.atan2(dyp, dxp) - Math.PI / 2, it.col, it.a * 0.35 * Math.min(1, (Math.abs(it.hv) - 0.18) * 3), 0, 0.1, 0);
          }
          put(it.tx, it.ty, it.s * it.tf, it.s * it.tf, 0, it.col, Math.min(1.5, it.a * (0.8 + 0.2 * it.tf)), shape, 0.25, P.glow * it.e);
        }
        sb.flush(target, engine.docW, 'over');
      },
      // 해수면 표면: 원근으로 모이는 도트 바다 + 완만한 일렁임 + 윤슬(반짝임). 달·밤하늘은 렌더하지 않음.
      renderSea(target, P) {
        const sb = engine.sprites, A = engine.aspect, WR = !!engine.project.wrap, docW = engine.docW;
        const lo = RL.hexToRgb(P.colorLow), hi = RL.hexToRgb(P.colorHigh), shape = P.shape === 'square' ? 0 : 1;
        const T = this.time, flow = T * (P.seaSpeed ?? 0.35);
        const hpow = 1 + (P.seaHorizon ?? 0.6) * 3.5;         // perspective compression toward horizon
        const glints = [];
        sb.begin();
        for (let j = 0; j < rows; j++) {
          const t = j / Math.max(1, rows - 1);                // 0 near(bottom) → 1 far(horizon)
          const yb = P.baseY + P.area * (1 - Math.pow(1 - t, hpow));
          const depth = (1 - t) * (1 - t) * 0.85 + 0.15;      // near bigger/brighter, far smaller/fainter
          const fade = 1 - (P.seaFade ?? 0.55) * t * t;
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5) / cols, px = x * A;
            // gentle swell (a few flowing octaves) + beat ripples from the spring field
            let wv = Math.sin(px * P.seaScale * 1.3 + t * 1.6 - flow * 1.3) * 0.5
                   + Math.sin(px * P.seaScale * 0.6 - t * 1.0 + flow * 0.8) * 0.3
                   + RL.noise.n3(px * P.seaScale * 0.6, t * 1.4 + flow * 0.4, 3.1) * 0.9;
            const id = j * cols + i, ripple = h ? h[id] : 0;
            const yy = yb + (wv * (P.seaSwell ?? 0.3) * 0.18 + ripple * 0.18) * depth;
            // 윤슬: fast high-freq crest highlights broken into sparkles
            let g = Math.pow(Math.max(0, 0.5 + 0.5 * Math.sin(px * P.seaScale * 6.0 + t * 9.0 - flow * 5.0 + wv * 3.0)), (P.seaGlintSize ?? 0.5) * 22 + 5);
            g *= (0.4 + 0.6 * RL.noise.n2(px * 4.0 + flow * 0.9, t * 9.0 + 5.0)) * (P.seaGlint ?? 0.8);
            g = Math.min(1.5, g * depth);
            const base = (0.18 + Math.max(0, wv * 0.5 + 0.5) * 0.5) + Math.max(0, ripple) * 0.3;
            const e = Math.min(1, base + g);
            const col = [lo[0] + (hi[0] - lo[0]) * e, lo[1] + (hi[1] - lo[1]) * e, lo[2] + (hi[2] - lo[2]) * e];
            const a = Math.min(1.4, (P.restAlpha * 0.7 + e * (1 - P.restAlpha * 0.7)) * fade) * P.intensity;
            const size = Math.max(0.5, P.dotSize * depth);
            this.seaPut(sb, x, yy, size, col, a, shape, P.glow * e, WR, docW);
            if (g > 0.35) glints.push([x, yy, size * 1.5, g * fade * P.intensity]);
          }
        }
        sb.flush(target, docW, 'over');
        if (glints.length) {                                  // bright 윤슬 additively on top
          sb.begin();
          for (const [x, y, sz, a] of glints) this.seaPut(sb, x, y, sz, hi, Math.min(1.4, a * 1.2), 1, 1.0, WR, docW);
          sb.flush(target, docW, 'add');
        }
      },
      seaPut(sb, x, y, sz, c, a, shape, glow, WR, docW) {
        if (WR) { x = ((x % 1) + 1) % 1; const m = sz / docW; sb.push(x, y, sz, sz, 0, c[0], c[1], c[2], a, shape, 0.3, glow); if (x < m) sb.push(x + 1, y, sz, sz, 0, c[0], c[1], c[2], a, shape, 0.3, glow); else if (x > 1 - m) sb.push(x - 1, y, sz, sz, 0, c[0], c[1], c[2], a, shape, 0.3, glow); }
        else sb.push(x, y, sz, sz, 0, c[0], c[1], c[2], a, shape, 0.3, glow);
      },
      dispose() {},
    };
    return inst;
  },
};
