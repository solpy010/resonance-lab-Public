'use strict';
import { RL } from './core/rl.js';
// SHAPES — 중력·반발·마찰에 반응하는 기하 도형 물리 (도형 간 충돌 + 다른 레이어 라인아트와 충돌)

RL.SHAPE_NAMES = { '원': 1, '사각': 0, '삼각': 2, '고리': 3, '육각': 4, '십자': 5, '마름모': 6, circle: 1, square: 0, triangle: 2, ring: 3, hex: 4, cross: 5, diamond: 6 };

RL.modules.shapes = {
  label: '기하 물리', icon: '◆', blend: 'over',
  schema: [
    { id: 'spawn', label: '생성 방식', type: 'select', options: [['rain', '위에서 떨어짐'], ['fountain', '아래에서 솟음'], ['faces', '면 상단에서'], ['fill', '시작 시 채움'], ['burst', '마커 때만(리듬 이펙트)']], default: 'rain', group: '형태' },
    { id: 'shapeList', label: '도형 종류', type: 'text', default: '원,사각,삼각,고리', group: '형태', hint: '원, 사각, 삼각, 고리, 육각, 십자, 마름모 중 쉼표로' },
    { id: 'rate', label: '초당 생성', type: 'range', min: 0, max: 200, step: 0.5, default: 6, group: '형태', key: true },
    { id: 'max', label: '최대 개수', type: 'range', min: 1, max: 2000, step: 1, default: 300, group: '형태' },
    { id: 'fillCount', label: '시작 개수(채움)', type: 'range', min: 0, max: 2000, step: 1, default: 80, group: '형태' },
    { id: 'spawnFaces', label: '생성 면(비우면 전체)', type: 'text', default: '', group: '형태' },
    { id: 'size', label: '크기(px)', type: 'range', min: 4, max: 300, step: 1, default: 46, group: '형태', key: true },
    { id: 'sizeVar', label: '크기 편차', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.45, group: '형태' },
    { id: 'life', label: '수명(초, 0=무한)', type: 'range', min: 0, max: 60, step: 0.1, default: 0, group: '형태' },
    { id: 'gravity', label: '중력(+아래 / −위)', type: 'range', min: -3, max: 3, step: 0.01, default: 1, group: '물리', key: true },
    { id: 'wind', label: '바람(+오른쪽)', type: 'range', min: -3, max: 3, step: 0.01, default: 0, group: '물리', key: true },
    { id: 'bounce', label: '반발(탄성)', type: 'range', min: 0, max: 1.2, step: 0.01, default: 0.55, group: '물리', key: true },
    { id: 'friction', label: '마찰', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '물리' },
    { id: 'drag', label: '공기 저항', type: 'range', min: 0, max: 5, step: 0.01, default: 0.15, group: '물리' },
    { id: 'spin', label: '초기 회전', type: 'range', min: 0, max: 20, step: 0.1, default: 2, group: '물리' },
    { id: 'speed', label: '초기 속도', type: 'range', min: 0, max: 4, step: 0.01, default: 0.2, group: '물리' },
    { id: 'spread', label: '방출 퍼짐(도)', type: 'range', min: 0, max: 360, step: 1, default: 40, group: '물리' },
    { id: 'collideShapes', label: '도형끼리 충돌', type: 'bool', default: true, group: '물리' },
    { id: 'lineCollide', label: '라인아트와 충돌', type: 'bool', default: true, group: '물리', hint: '라인 레이어(리듬선·가로지르기·스크래치)에 부딪혀 튕김' },
    { id: 'lineBounce', label: '라인 반발', type: 'range', min: 0, max: 2, step: 0.01, default: 0.9, group: '물리' },
    { id: 'lineKick', label: '라인 움직임 전달', type: 'range', min: 0, max: 2, step: 0.01, default: 1, group: '물리', hint: '움직이는 선이 도형을 밀어 올리는 정도' },
    { id: 'floor', label: '바닥', type: 'select', options: [['bounce', '튕김'], ['open', '없음(떨어져 사라짐)']], default: 'bounce', group: '물리' },
    { id: 'sides', label: '좌우 끝', type: 'select', options: [['wall', '벽'], ['wrap', '반대편으로'], ['open', '없음']], default: 'wall', group: '물리' },
    { id: 'ceiling', label: '천장', type: 'bool', default: false, group: '물리' },
    { id: 'style', label: '표현', type: 'select', options: [['fill', '채움'], ['outline', '외곽선'], ['mix', '섞기']], default: 'fill', group: '물성' },
    { id: 'outline', label: '외곽선 두께', type: 'range', min: 0.02, max: 0.6, step: 0.01, default: 0.14, group: '물성' },
    { id: 'softness', label: '가장자리', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.03, group: '물성' },
    { id: 'glow', label: '광채', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, group: '물성' },
    { id: 'colors', label: '팔레트', type: 'colors', default: ['#ff5d5d', '#ffc542', '#3fd2a0', '#5aa9ff'], group: '색상' },
    { id: 'colorBy', label: '색 지정', type: 'select', options: [['shape', '도형별 색'], ['random', '무작위'], ['x', '가로 위치']], default: 'shape', group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'burst', label: '마커당 생성', type: 'range', min: 0, max: 200, step: 1, default: 12, group: '반응' },
    { id: 'burstSpeed', label: '폭발 속도', type: 'range', min: 0, max: 5, step: 0.01, default: 1.2, group: '반응' },
    { id: 'kickAll', label: '마커 때 기존 도형 튕기기', type: 'range', min: 0, max: 5, step: 0.01, default: 0.6, group: '반응' },
    { id: 'kickRadius', label: '튕김 반경', type: 'range', min: 0.02, max: 2, step: 0.01, default: 0.35, group: '반응' },
  ],
  create(engine, L) {
    let N = 0, x, y, vx, vy, ang, av, rad, typ, ci, age, life, alive;
    function alloc(n) {
      N = n; x = new Float32Array(n); y = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
      ang = new Float32Array(n); av = new Float32Array(n); rad = new Float32Array(n); typ = new Int8Array(n); ci = new Float32Array(n);
      age = new Float32Array(n); life = new Float32Array(n); alive = new Uint8Array(n);
    }
    const kinds = (P) => { const k = String(P.shapeList).split(/[\s,]+/).map(s => RL.SHAPE_NAMES[s]).filter(v => v !== undefined); return k.length ? k : [1]; };
    const inst = {
      reset(rng, P) {
        this.rng = rng; alloc(Math.round(P.max)); this.cursor = 0; this.acc = 0; this.time = 0;
        if (P.spawn === 'fill') for (let i = 0; i < Math.min(N, P.fillCount); i++) this.spawn(P, rng() * engine.aspect, 0.15 + rng() * 0.8, 0, 0);
      },
      spawn(P, px, py, svx, svy) {
        const r = this.rng;
        let i = -1;
        for (let k = 0; k < N; k++) { const j = (this.cursor + k) % N; if (!alive[j]) { i = j; break; } }
        if (i < 0) { let oldest = 0; for (let j = 1; j < N; j++) if (age[j] > age[oldest]) oldest = j; i = oldest; }
        this.cursor = (i + 1) % N;
        const ks = kinds(P), ki = r.int(ks.length);
        x[i] = px; y[i] = py; vx[i] = svx; vy[i] = svy;
        rad[i] = P.size * (1 - P.sizeVar * r()) * 0.5 / engine.docH;
        typ[i] = ks[ki]; ci[i] = P.colorBy === 'shape' ? ki : r() * 1000;
        ang[i] = r() * Math.PI * 2; av[i] = (r() - 0.5) * 2 * P.spin;
        age[i] = 0; life[i] = P.life; alive[i] = 1;
      },
      spawnPos(P) {
        const r = this.rng, A = engine.aspect, n = engine.project.faces;
        const faces = RL.parseFaces(P.spawnFaces, n);
        const fx = () => faces.length ? (faces[r.int(faces.length)] + 0.1 + r() * 0.8) / n * A : r() * A;
        const ang = (base) => (base + (r() - 0.5) * P.spread) * Math.PI / 180;
        if (P.spawn === 'fountain') { const a = ang(90), s = P.speed * (0.6 + r() * 0.8) + 0.8; return [fx(), -0.05, Math.cos(a) * s, Math.sin(a) * s]; }
        if (P.spawn === 'faces') { const f = faces.length ? faces[r.int(faces.length)] : r.int(n); return [(f + 0.5) / n * A + (r() - 0.5) * 0.05, 1.08, (r() - 0.5) * P.speed, -P.speed]; }
        const a = ang(-90), s = P.speed * r();
        return [fx(), 1.08, Math.cos(a) * s, Math.sin(a) * s];
      },
      step(dt, t, evs, P) {
        if (Math.round(P.max) !== N) alloc(Math.round(P.max));
        if (dt <= 0) return;
        this.time += dt;
        const A = engine.aspect, r = this.rng;
        if (P.spawn === 'rain' || P.spawn === 'fountain' || P.spawn === 'faces') {
          this.acc += P.rate * dt; let k = Math.floor(this.acc); this.acc -= k;
          while (k-- > 0) { const s = this.spawnPos(P); this.spawn(P, s[0], s[1], s[2], s[3]); }
        }
        for (const e of evs) {
          const ex = e.u * A, ey = e.v;
          for (let j = 0; j < P.burst * e.s; j++) { const a = r() * Math.PI * 2, s = P.burstSpeed * (0.4 + r() * 0.8) * e.s; this.spawn(P, ex, ey, Math.cos(a) * s, Math.sin(a) * s + 0.3 * s); }
          if (P.kickAll > 0) for (let i = 0; i < N; i++) if (alive[i]) {
            let dx = x[i] - ex; if (engine.project.wrap) dx -= A * Math.round(dx / A);
            const dy = y[i] - ey, d = Math.hypot(dx, dy);
            if (d < P.kickRadius) { const f = P.kickAll * e.s * (1 - d / P.kickRadius); vx[i] += dx / (d + 1e-4) * f * 0.6; vy[i] += (dy / (d + 1e-4) * 0.6 + 0.8) * f; av[i] += (r() - 0.5) * f * 10; }
          }
        }
        // line colliders (built once per frame)
        let grid = null, segs = null;
        const CS = 0.05;
        if (P.lineCollide && engine.colliders.size) {
          grid = new Map(); segs = [];
          for (const [id, c] of engine.colliders) {
            if (id === L.id) continue;
            const base = segs.length; segs.push(c);
            for (let s = 0; s < c.n; s++) {
              const o = s * 6, a0 = c.segs[o], b0 = c.segs[o + 1], a1 = c.segs[o + 2], b1 = c.segs[o + 3];
              const ix0 = Math.floor(Math.min(a0, a1) / CS), ix1 = Math.floor(Math.max(a0, a1) / CS), iy0 = Math.floor(Math.min(b0, b1) / CS), iy1 = Math.floor(Math.max(b0, b1) / CS);
              for (let gx = ix0; gx <= ix1; gx++) for (let gy = iy0; gy <= iy1; gy++) {
                const key = gx * 100003 + gy; let cell = grid.get(key); if (!cell) grid.set(key, cell = []); cell.push(base, s);
              }
            }
          }
        }
        const sub = 3, h = dt / sub, e = P.bounce, fr = P.friction, dragF = Math.exp(-P.drag * h);
        const WR = !!engine.project.wrap, sides = WR ? 'wrap' : P.sides;
        for (let st = 0; st < sub; st++) {
          for (let i = 0; i < N; i++) {
            if (!alive[i]) continue;
            vy[i] -= P.gravity * h; vx[i] += P.wind * h * 0.5;
            vx[i] *= dragF; vy[i] *= dragF;
            x[i] += vx[i] * h; y[i] += vy[i] * h; ang[i] += av[i] * h; av[i] *= Math.exp(-0.3 * h);
            const R = rad[i];
            if (P.floor === 'bounce' && y[i] < R) { y[i] = R; if (vy[i] < 0) { vy[i] = -vy[i] * e; vx[i] *= 1 - fr * 0.5; av[i] = av[i] * 0.6 - vx[i] / R * fr * 0.5; } }
            if (P.ceiling && y[i] > 1 - R) { y[i] = 1 - R; if (vy[i] > 0) vy[i] = -vy[i] * e; }
            if (sides === 'wall') { if (x[i] < R) { x[i] = R; if (vx[i] < 0) vx[i] = -vx[i] * e; } if (x[i] > A - R) { x[i] = A - R; if (vx[i] > 0) vx[i] = -vx[i] * e; } }
            else if (sides === 'wrap') { if (WR) { if (x[i] < 0) x[i] += A; else if (x[i] >= A) x[i] -= A; } else if (x[i] < -R) x[i] += A + 2 * R; else if (x[i] > A + R) x[i] -= A + 2 * R; }
            // line collisions (with ghost copies across the 360° seam)
            if (grid) {
              const offs = WR && (x[i] < R + CS || x[i] > A - R - CS) ? [0, A, -A] : [0];
              for (const off of offs) {
              const xi = x[i] + off;
              const ix0 = Math.floor((xi - R) / CS), ix1 = Math.floor((xi + R) / CS), iy0 = Math.floor((y[i] - R) / CS), iy1 = Math.floor((y[i] + R) / CS);
              for (let gx = ix0; gx <= ix1; gx++) for (let gy = iy0; gy <= iy1; gy++) {
                const cell = grid.get(gx * 100003 + gy); if (!cell) continue;
                for (let k = 0; k < cell.length; k += 2) {
                  const c = segs[cell[k]], o = cell[k + 1] * 6, S = c.segs;
                  const ax = S[o], ay = S[o + 1], bx = S[o + 2], by = S[o + 3];
                  const ex2 = bx - ax, ey2 = by - ay, L2 = ex2 * ex2 + ey2 * ey2 || 1e-9;
                  const cx = x[i] + off;
                  const tt = Math.max(0, Math.min(1, ((cx - ax) * ex2 + (y[i] - ay) * ey2) / L2));
                  const px = ax + ex2 * tt, py = ay + ey2 * tt, dx = cx - px, dy = y[i] - py, d = Math.hypot(dx, dy);
                  const thick = (c.thick || 0) + R;
                  if (d < thick && d > 1e-7) {
                    const nx = dx / d, ny = dy / d;
                    x[i] = px + nx * thick - off; y[i] = py + ny * thick;
                    const svx = S[o + 4] * P.lineKick, svy = S[o + 5] * P.lineKick;
                    const rvx = vx[i] - svx, rvy = vy[i] - svy, vn = rvx * nx + rvy * ny;
                    if (vn < 0) {
                      const j = -(1 + e * P.lineBounce) * vn;
                      vx[i] += j * nx; vy[i] += j * ny;
                      const tx = rvx - vn * nx, ty = rvy - vn * ny;
                      vx[i] -= tx * fr * 0.3; vy[i] -= ty * fr * 0.3;
                      av[i] += (nx * ty - ny * tx) / R * fr * 0.4;
                    }
                  }
                }
              }
              }
            }
          }
          // shape-shape
          if (P.collideShapes) {
            let maxR = 0; for (let i = 0; i < N; i++) if (alive[i] && rad[i] > maxR) maxR = rad[i];
            const cs = Math.max(0.01, maxR * 2), hash = new Map(), ncx = Math.max(1, Math.floor(A / cs));
            const cellX = (xv) => { let g = Math.floor(xv / cs); if (WR) g = ((g % ncx) + ncx) % ncx; return g; };
            for (let i = 0; i < N; i++) { if (!alive[i]) continue; const key = cellX(x[i]) * 100003 + Math.floor(y[i] / cs); let c = hash.get(key); if (!c) hash.set(key, c = []); c.push(i); }
            for (let i = 0; i < N; i++) {
              if (!alive[i]) continue;
              const gx = cellX(x[i]), gy = Math.floor(y[i] / cs);
              const seen = WR && ncx < 3 ? new Set() : null;
              for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                let cx2 = gx + ox; if (WR) cx2 = ((cx2 % ncx) + ncx) % ncx;
                const c = hash.get(cx2 * 100003 + gy + oy); if (!c) continue;
                for (const j of c) {
                  if (j <= i) continue;
                  if (seen) { if (seen.has(j)) continue; seen.add(j); }
                  let dx = x[j] - x[i]; if (WR) dx -= A * Math.round(dx / A);
                  const dy = y[j] - y[i], rr = rad[i] + rad[j], d2 = dx * dx + dy * dy;
                  if (d2 >= rr * rr || d2 < 1e-12) continue;
                  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
                  const mi = rad[i] * rad[i], mj = rad[j] * rad[j], tot = mi + mj;
                  x[i] -= nx * pen * mj / tot; y[i] -= ny * pen * mj / tot; x[j] += nx * pen * mi / tot; y[j] += ny * pen * mi / tot;
                  const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
                  if (rv < 0) {
                    const jimp = -(1 + e) * rv / (1 / mi + 1 / mj);
                    vx[i] -= jimp * nx / mi; vy[i] -= jimp * ny / mi; vx[j] += jimp * nx / mj; vy[j] += jimp * ny / mj;
                    const tv = (vx[j] - vx[i]) * -ny + (vy[j] - vy[i]) * nx;
                    av[i] += tv / rad[i] * fr * 0.3; av[j] += tv / rad[j] * fr * 0.3;
                  }
                }
              }
            }
          }
        }
        for (let i = 0; i < N; i++) {
          if (!alive[i]) continue;
          age[i] += dt;
          if ((life[i] > 0 && age[i] > life[i]) || y[i] < -0.4 || y[i] > 2 || (!WR && (x[i] < -0.5 || x[i] > A + 0.5))) alive[i] = 0;
        }
      },
      render(target, P) {
        const gl = engine.gl;
        RL.clear(gl, target);
        const sb = engine.sprites, cols = (P.colors && P.colors.length ? P.colors : ['#ffffff']).map(RL.hexToRgb), A = engine.aspect, WR = !!engine.project.wrap;
        sb.begin();
        for (let i = 0; i < N; i++) {
          if (!alive[i]) continue;
          let a = Math.min(1, age[i] / 0.12) * P.intensity;
          if (life[i] > 0) a *= Math.min(1, (life[i] - age[i]) / 0.5);
          const c = P.colorBy === 'x' ? cols[Math.min(cols.length - 1, Math.floor(x[i] / A * cols.length))] : cols[Math.floor(ci[i]) % cols.length];
          const s = rad[i] * 2 * engine.docH;
          const ol = P.style === 'outline' || (P.style === 'mix' && i % 2) ? P.outline : 0;
          sb.push(x[i] / A, y[i], s, s, ang[i], c[0], c[1], c[2], a, typ[i], P.softness, P.glow, ol);
          if (WR) { const m = rad[i] * (1 + P.glow * 2); if (x[i] < m) sb.push(x[i] / A + 1, y[i], s, s, ang[i], c[0], c[1], c[2], a, typ[i], P.softness, P.glow, ol); else if (x[i] > A - m) sb.push(x[i] / A - 1, y[i], s, s, ang[i], c[0], c[1], c[2], a, typ[i], P.softness, P.glow, ol); }
        }
        sb.flush(target, engine.docW, 'over');
      },
      get debug() { return { y, alive, rad, N }; },
      dispose() {},
    };
    return inst;
  },
};
