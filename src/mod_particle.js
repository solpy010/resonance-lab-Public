'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as eng from './engine.js';
import * as registry from './core/registry.js';
// PARTICLE — CPU 결정적 파티클 (컬 노이즈 난류, 깊이별 크기·속도·밝기 차등, 팬라이트 그리드)

registry.modules.particle = {
  label: '파티클', icon: '∴', blend: 'add',
  schema: [
    { id: 'emitOn', label: '상시 방출', type: 'bool', default: true, group: '형태', hint: '끄면 계속 생성되던 파티클이 멈춤(마커 폭발만 남음)' },
    { id: 'burstOn', label: '마커 때 폭발', type: 'bool', default: true, group: '형태', hint: '끄면 마커(타격) 때 터지는 파티클이 멈춤' },
    { id: 'max', label: '최대 개수', type: 'range', min: 100, max: 60000, step: 100, default: 6000, group: '형태' },
    { id: 'rate', label: '초당 방출', type: 'range', min: 0, max: 8000, step: 10, default: 600, group: '형태', key: true },
    { id: 'emitter', label: '방출 위치', type: 'select', options: [['bottom', '아래 가장자리'], ['top', '위 가장자리'], ['area', '화면 전체'], ['faces', '면 중심'], ['band', '수평 띠'], ['grid', '객석 그리드(팬라이트)']], default: 'bottom', group: '형태' },
    { id: 'band', label: '띠 높이 / 그리드 상단', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '형태' },
    { id: 'life', label: '수명(초)', type: 'range', min: 0.2, max: 30, step: 0.1, default: 6, group: '움직임' },
    { id: 'lifeVar', label: '수명 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '움직임' },
    { id: 'speed', label: '초기 속도', type: 'range', min: 0, max: 2, step: 0.01, default: 0.12, group: '움직임', key: true },
    { id: 'direction', label: '방향(도, 90=위)', type: 'range', min: -180, max: 180, step: 1, default: 90, group: '움직임' },
    { id: 'spread', label: '퍼짐 각도', type: 'range', min: 0, max: 360, step: 1, default: 40, group: '움직임' },
    { id: 'buoyancy', label: '부력(+위 / −아래)', type: 'range', min: -2, max: 2, step: 0.01, default: 0.05, group: '움직임', key: true },
    { id: 'turbulence', label: '난류', type: 'range', min: 0, max: 2, step: 0.01, default: 0.25, group: '움직임', key: true },
    { id: 'noiseScale', label: '난류 크기', type: 'range', min: 0.2, max: 20, step: 0.1, default: 3, group: '움직임' },
    { id: 'drag', label: '저항', type: 'range', min: 0, max: 5, step: 0.01, default: 0.6, group: '움직임' },
    { id: 'swirl', label: '회오리', type: 'range', min: -3, max: 3, step: 0.01, default: 0, group: '움직임', key: true },
    { id: 'swirlFaces', label: '회오리 중심 면(비우면 화면 중앙)', type: 'text', default: '', group: '움직임' },
    { id: 'size', label: '크기(px)', type: 'range', min: 1, max: 120, step: 0.5, default: 6, group: '형태', key: true },
    { id: 'sizeVar', label: '크기 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, group: '형태' },
    { id: 'sizeLife', label: '수명에 따른 크기', type: 'select', options: [['const', '일정'], ['shrink', '줄어듦'], ['grow', '커짐'], ['pulse', '맥동']], default: 'shrink', group: '형태' },
    { id: 'shape', label: '모양', type: 'select', options: [['disc', '원'], ['square', '사각']], default: 'disc', group: '물성' },
    { id: 'softness', label: '부드러움', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '물성' },
    { id: 'glow', label: '광채', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '물성' },
    { id: 'depthRange', label: '깊이 분포', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, group: '물성', hint: '먼 입자일수록 작고 느리고 어둡고 흐림' },
    { id: 'twinkle', label: '반짝임', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, group: '물성' },
    { id: 'colors', label: '팔레트', type: 'colors', default: ['#ffe9c2', '#ffb36b', '#9ac8ff', '#ffffff'], group: '색상' },
    { id: 'colorBy', label: '색 지정', type: 'select', options: [['random', '무작위'], ['life', '수명 따라'], ['depth', '깊이 따라'], ['x', '가로 위치 따라']], default: 'random', group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'trail', label: '잔상', type: 'range', min: 0, max: 0.98, step: 0.01, default: 0, group: '물성' },
    { id: 'gridRows', label: '그리드 줄 수', type: 'range', min: 2, max: 40, step: 1, default: 12, group: '그리드' },
    { id: 'gridCols', label: '그리드 칸 수(면당)', type: 'range', min: 2, max: 120, step: 1, default: 36, group: '그리드' },
    { id: 'reveal', label: '점등 진행(앞→뒤)', type: 'range', min: 0, max: 1.2, step: 0.01, default: 1, group: '그리드', key: true },
    { id: 'faceLag', label: '면별 점등 시차', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.12, group: '그리드' },
    { id: 'burst', label: '이벤트 폭발 개수', type: 'range', min: 0, max: 2000, step: 10, default: 120, group: '반응' },
    { id: 'burstSpeed', label: '폭발 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.5, group: '반응' },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const fadeProg = engine.prog.fade;
    let N = 0, x, y, vx, vy, age, life, dep, sz, ci, ph;
    function alloc(n) {
      N = n; x = new Float32Array(n); y = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
      age = new Float32Array(n); life = new Float32Array(n).fill(-1); dep = new Float32Array(n); sz = new Float32Array(n); ci = new Float32Array(n); ph = new Float32Array(n);
    }
    const inst = {
      reset(rng, P) { this.rng = rng; alloc(Math.round(P.max)); this.cursor = 0; this.acc = 0; this.time = 0; this.cleared = false; },
      spawn(P, px, py, sp, ang, sprd) {
        const r = this.rng;
        let i = this.cursor, tries = 0;
        while (life[i] >= 0 && age[i] < life[i] && tries < N) { i = (i + 1) % N; tries++; }
        if (tries >= N) i = this.cursor;              // recycle oldest slot
        this.cursor = (i + 1) % N;
        const a = (ang + (r() - 0.5) * sprd) * Math.PI / 180;
        const d = r() * P.depthRange;
        const s = sp * (0.5 + r()) * (1.3 - d * 0.9);
        x[i] = px; y[i] = py; vx[i] = Math.cos(a) * s; vy[i] = Math.sin(a) * s;
        age[i] = 0; life[i] = P.life * (1 - P.lifeVar * r() * 0.8); dep[i] = d;
        sz[i] = 1 - P.sizeVar * r(); ci[i] = r(); ph[i] = r() * 6.283;
      },
      emitPos(P) {
        const r = this.rng, n = engine.project.faces;
        switch (P.emitter) {
          case 'top': return [r(), 1.02];
          case 'area': return [r(), r()];
          case 'faces': { const f = r.int(n); return [(f + 0.5 + (r() - 0.5) * 0.2) / n, P.band + (r() - 0.5) * 0.1]; }
          case 'band': return [r(), P.band + (r() - 0.5) * 0.08];
          default: return [r(), -0.02];
        }
      },
      step(dt, t, evs, P) {
        if (Math.round(P.max) !== N) alloc(Math.round(P.max));
        if (dt <= 0) return;
        this.time += dt;
        const A = engine.aspect;
        if (P.emitter !== 'grid') {
          if (P.emitOn !== false) {
            this.acc += P.rate * dt;
            let k = Math.floor(this.acc); this.acc -= k; k = Math.min(k, N);
            for (let j = 0; j < k; j++) { const [px, py] = this.emitPos(P); this.spawn(P, px, py, P.speed, P.direction, P.spread); }
          }
          if (P.burstOn !== false) for (const e of evs) for (let j = 0; j < P.burst * e.s; j++) this.spawn(P, e.u, e.v, P.burstSpeed * e.s, 0, 360);
        }
        const sc = P.noiseScale, tz = this.time * 0.15;
        const centers = eng.parseFaces(P.swirlFaces, engine.project.faces).map(f => (f + 0.5) / engine.project.faces);
        if (!centers.length) centers.push(0.5);
        const drag = Math.exp(-P.drag * dt), WR = !!engine.project.wrap;
        for (let i = 0; i < N; i++) {
          if (life[i] < 0 || age[i] >= life[i]) continue;
          age[i] += dt;
          const sp = 1.25 - dep[i] * 0.85;
          let ax = 0, ay = P.buoyancy * 0.1;
          if (P.turbulence > 0) { const c = webgl.noise.curl(x[i] * sc * A, y[i] * sc, tz + dep[i] * 3); ax += c[0] * P.turbulence * 0.2; ay += c[1] * P.turbulence * 0.2; }
          if (P.swirl !== 0) {
            let best = centers[0], bd = 9;
            for (const c of centers) { let d = Math.abs(x[i] - c); if (WR) d = Math.min(d, 1 - d); if (d < bd) { bd = d; best = c; } }
            let ddx = x[i] - best; if (WR) ddx -= Math.round(ddx);
            const dx = ddx * A, dy = y[i] - 0.5, r2 = dx * dx + dy * dy + 0.02;
            ax += -dy / r2 * P.swirl * 0.22 - dx * 0.12 * Math.abs(P.swirl); ay += dx / r2 * P.swirl * 0.22 - dy * 0.12 * Math.abs(P.swirl);
          }
          vx[i] = (vx[i] + ax * dt) * drag; vy[i] = (vy[i] + ay * dt) * drag;
          x[i] += vx[i] * sp * dt / A; y[i] += vy[i] * sp * dt;
          if (WR) x[i] -= Math.floor(x[i]);
          if (y[i] < -0.2 || y[i] > 1.2 || (!WR && (x[i] < -0.1 || x[i] > 1.1))) life[i] = -1;
        }
      },
      render(target, P) {
        const sb = engine.sprites, cols = (P.colors || ['#ffffff']).map(webgl.hexToRgb);
        if (P.trail > 0 && this.cleared) webgl.draw(gl, fadeProg, target, { k: 1 - P.trail }, 'mult');
        else webgl.clear(gl, target);
        this.cleared = true;
        sb.begin();
        const shape = P.shape === 'square' ? 0 : 1, T = this.time, WR = !!engine.project.wrap;
        const pick = (f) => { const n = cols.length; const p = Math.min(n - 1.0001, Math.max(0, f * (n - 1))); const i = Math.floor(p), w = p - i; const a = cols[i], b = cols[Math.min(n - 1, i + 1)]; return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]; };
        if (P.emitter === 'grid') {
          const rows = Math.round(P.gridRows), nf = engine.project.faces, cpf = Math.round(P.gridCols);
          const r = webgl.rng(webgl.hashSeed(engine.project.seed, L.id, 'grid'));
          for (let f = 0; f < nf; f++) {
            const lag = r() * P.faceLag;
            for (let row = 0; row < rows; row++) {
              const fr = row / Math.max(1, rows - 1);            // 0 front(bottom) → 1 back(top)
              const yy = 0.03 + Math.pow(fr, 0.85) * (P.band - 0.03);
              const scl = 1.15 - fr * 0.75, cnt = Math.round(cpf * (0.7 + fr * 0.5));
              const on = Math.min(1, Math.max(0, (P.reveal - lag - fr * 0.8) * 6));
              if (on <= 0) continue;
              for (let c = 0; c < cnt; c++) {
                const jitter = (r() - 0.5) * 0.6;
                const xx = (f + (c + 0.5 + jitter * 0.4) / cnt) / nf, k = r(), tw = 1 - P.twinkle * 0.5 * (1 + Math.sin(T * (2 + k * 4) + k * 30));
                const col = P.colorBy === 'x' ? pick(xx) : P.colorBy === 'depth' ? pick(fr) : cols[Math.floor(k * cols.length) % cols.length];
                const s = P.size * scl * (1 - P.sizeVar * r() * 0.5);
                const sway = Math.sin(T * (1.4 + k) + k * 40 + xx * 9) * 0.006 * (1 - fr * 0.5);
                sb.push(xx + sway / engine.aspect, yy + (r() - 0.5) * 0.01 + Math.abs(sway) * 0.6, s, s, 0, col[0], col[1], col[2], on * tw * P.intensity * (1 - fr * 0.45), shape, Math.max(P.softness, fr * 0.6), P.glow);
              }
            }
          }
        } else {
          for (let i = 0; i < N; i++) {
            if (life[i] < 0 || age[i] >= life[i]) continue;
            const lt = age[i] / life[i];
            let s = P.size * sz[i] * (1.4 - dep[i] * 1.0);
            if (P.sizeLife === 'shrink') s *= 1 - lt * 0.85; else if (P.sizeLife === 'grow') s *= 0.3 + lt; else if (P.sizeLife === 'pulse') s *= 0.6 + 0.4 * Math.sin(lt * 12 + ph[i]);
            let a = Math.min(1, lt * 8) * Math.min(1, (1 - lt) * 4) * (1 - dep[i] * 0.6) * P.intensity;
            if (P.twinkle > 0) a *= 1 - P.twinkle * 0.5 * (1 + Math.sin(T * 7 + ph[i] * 9));
            const col = P.colorBy === 'life' ? pick(lt) : P.colorBy === 'depth' ? pick(dep[i]) : P.colorBy === 'x' ? pick(x[i]) : cols[Math.floor(ci[i] * cols.length) % cols.length];
            const sf = Math.max(P.softness, dep[i] * 0.8);
            sb.push(x[i], y[i], s, s, 0, col[0], col[1], col[2], a, shape, sf, P.glow);
            if (WR) { const m = s * (1 + P.glow * 2) / engine.docW; if (x[i] < m) sb.push(x[i] + 1, y[i], s, s, 0, col[0], col[1], col[2], a, shape, sf, P.glow); else if (x[i] > 1 - m) sb.push(x[i] - 1, y[i], s, s, 0, col[0], col[1], col[2], a, shape, sf, P.glow); }
          }
        }
        sb.flush(target, engine.docW, 'over');
      },
      dispose() {},
    };
    return inst;
  },
};
