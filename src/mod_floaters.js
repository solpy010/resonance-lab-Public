'use strict';
// FLOATERS — 오브젝트 유영: 화면 하단 바깥에서 태어나 부력·중력·저항을 받아 위로 떠오르고, 마커 타이밍에 '팡' 터지며 사라짐.
// 결정론: 레이어 rng + 고정 dt → 같은 프레임은 언제나 같은 결과.

RL.modules.floaters = {
  label: '오브젝트 유영', icon: '◎', blend: 'over',
  schema: [
    { id: 'useDefault', label: '기본 악기 아이콘 사용', type: 'bool', default: true, group: '오브젝트', hint: '징·북·장구·꽹과리·기타 라인아트. 끄면 첨부한 이미지/영상만 사용' },
    { id: 'assets', label: '오브젝트 이미지/영상(여러 개)', type: 'assetList', default: [], group: '오브젝트' },
    { id: 'size', label: '크기(px)', type: 'range', min: 10, max: 1200, step: 1, default: 150, group: '오브젝트', key: true },
    { id: 'sizeVar', label: '크기 편차', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '오브젝트' },
    { id: 'depthVar', label: '원근감(멀수록 작고 느림)', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.45, group: '오브젝트', hint: '오브젝트마다 깊이를 주어 입체감' },
    { id: 'tint', label: '색 입히기', type: 'range', min: 0, max: 1, step: 0.01, default: 1, group: '오브젝트', hint: '기본 아이콘(흰 라인)은 1 권장, 사진·영상은 0=원본색' },
    { id: 'colors', label: '오브젝트 팔레트', type: 'colors', default: ['#8fe9ff', '#ff7ad9', '#c9a8ff', '#ffd27a', '#7dffb2'], group: '오브젝트' },
    { id: 'glow', label: '글로우', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6, group: '오브젝트', key: true },
    { id: 'spin', label: '회전 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.25, group: '오브젝트' },
    { id: 'tilt', label: '기울기 흔들림(°)', type: 'range', min: 0, max: 60, step: 0.5, default: 12, group: '오브젝트' },
    // spawn
    { id: 'rate', label: '생성량(초당)', type: 'range', min: 0, max: 40, step: 0.05, default: 3, group: '생성', key: true },
    { id: 'maxCount', label: '최대 개수', type: 'range', min: 1, max: 400, step: 1, default: 60, group: '생성' },
    { id: 'spawnFaces', label: '생성 면(비우면 전체)', type: 'text', default: '', group: '생성' },
    { id: 'spawnMin', label: '생성 가로 범위 시작', type: 'range', min: 0, max: 1, step: 0.001, default: 0, group: '생성' },
    { id: 'spawnMax', label: '생성 가로 범위 끝', type: 'range', min: 0, max: 1, step: 0.001, default: 1, group: '생성' },
    { id: 'prefill', label: '시작부터 화면에 채워두기', type: 'bool', default: false, group: '생성' },
    { id: 'burstOnMarker', label: '마커 때 추가 생성 수', type: 'range', min: 0, max: 30, step: 1, default: 0, group: '생성' },
    // physics
    { id: 'buoyancy', label: '부력(위로 미는 힘)', type: 'range', min: -2, max: 4, step: 0.01, default: 0.55, group: '물리', key: true, hint: '−면 가라앉음(중력 우세)' },
    { id: 'gravity', label: '중력', type: 'range', min: 0, max: 3, step: 0.01, default: 0.25, group: '물리' },
    { id: 'drag', label: '공기 저항', type: 'range', min: 0, max: 6, step: 0.01, default: 1.1, group: '물리' },
    { id: 'startSpeed', label: '초기 상승 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.35, group: '물리' },
    { id: 'sway', label: '좌우 운동 폭', type: 'range', min: 0, max: 0.5, step: 0.001, default: 0.06, group: '물리', key: true },
    { id: 'swayFreq', label: '좌우 운동 빈도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.45, group: '물리' },
    { id: 'drift', label: '바람(+우 / −좌)', type: 'range', min: -1, max: 1, step: 0.005, default: 0, group: '물리', key: true },
    { id: 'collide', label: '서로 부딪힘', type: 'bool', default: true, group: '물리' },
    { id: 'bounce', label: '부딪힘 탄성', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, group: '물리' },
    // pop
    { id: 'popOn', label: '마커 때 터짐', type: 'bool', default: true, group: '터짐' },
    { id: 'popRatio', label: '터지는 비율(일부 ↔ 전체)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '터짐', hint: '마커마다 화면에 보이는 오브젝트 중 이 비율만큼 터짐. 1=전부' },
    { id: 'popByFace', label: '반응한 면의 것만 터짐', type: 'bool', default: false, group: '터짐', hint: '켜면 레이어 \'마커 반응 위치\' 면 안의 오브젝트만' },
    { id: 'popMinY', label: '터질 수 있는 최소 높이', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05, group: '터짐' },
    { id: 'popHeight', label: '이 높이 넘으면 자동 터짐(0=끔)', type: 'range', min: 0, max: 1.2, step: 0.01, default: 0, group: '터짐' },
    { id: 'popOffset', label: '터짐 싱크(ms)', type: 'range', min: -500, max: 500, step: 1, default: 0, group: '터짐' },
    { id: 'popEffect', label: '터짐 이펙트', type: 'select', options: [['random', '랜덤 조합'], ['ring', '고리'], ['rays', '방사광'], ['shards', '파편'], ['sparks', '스파크'], ['flash', '섬광'], ['image', '첨부 이미지/영상'], ['none', '없음(사라지기만)']], default: 'random', group: '터짐' },
    { id: 'popAsset', label: '터짐 이미지/영상', type: 'asset', default: '', group: '터짐' },
    { id: 'popSize', label: '이펙트 크기(오브젝트 대비)', type: 'range', min: 0.3, max: 8, step: 0.01, default: 2.6, group: '터짐' },
    { id: 'popLife', label: '이펙트 지속(초)', type: 'range', min: 0.1, max: 3, step: 0.01, default: 0.7, group: '터짐' },
    { id: 'popCount', label: '파티클 수', type: 'range', min: 2, max: 100, step: 1, default: 20, group: '터짐' },
    { id: 'popUseColor', label: '이펙트에 오브젝트 색 사용', type: 'bool', default: true, group: '터짐' },
    { id: 'popColors', label: '이펙트 팔레트', type: 'colors', default: ['#ffffff', '#ffe7a8', '#ff9be0'], group: '터짐' },
    { id: 'intensity', label: '전체 밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const inst = {
      reset(rng, P) {
        this.rng = rng; this.obj = []; this.fx = []; this.acc = 0; this.now = 0; this.pend = []; this.nextId = 0;
        if (P.prefill) for (let i = 0; i < Math.min(P.maxCount, Math.round(P.rate * 4)); i++) this.spawn(P, rng() * 1.1 - 0.1);
      },
      kinds(P) {
        const out = [];
        if (P.useDefault) for (let k = 0; k < 5; k++) out.push({ b: 'instruments', k });
        for (const id of (P.assets || [])) out.push({ a: id });
        return out.length ? out : [{ b: 'instruments', k: 0 }];
      },
      spawnX(P) {
        const n = engine.project.faces, f = RL.parseFaces(P.spawnFaces, n), r = this.rng;
        if (f.length) return (f[r.int(f.length)] + r()) / n;
        const a = Math.min(P.spawnMin, P.spawnMax), b = Math.max(P.spawnMin, P.spawnMax);
        return a + (b - a) * r();
      },
      spawn(P, y) {
        const r = this.rng, kinds = this.kinds(P);
        const z = r(), sc = 1 - P.depthVar * z;
        const size = P.size * (1 + (r() - 0.5) * 2 * P.sizeVar) * sc;
        const h = size / engine.docH;
        this.obj.push({
          id: this.nextId++, x: this.spawnX(P), y: y ?? -h * 0.7, vx: 0, vy: P.startSpeed * (0.6 + r() * 0.6) * sc, z, sc, size,
          kind: kinds[r.int(kinds.length)], col: P.colors.length ? P.colors[r.int(P.colors.length)] : '#ffffff',
          ph: r() * 100, rot: (r() - 0.5) * 0.6, spinDir: r() < 0.5 ? -1 : 1, spinK: 0.4 + r(), rank: r(), born: this.now,
        });
      },
      pop(o, P, t) {
        if (o.dead) return;
        o.dead = true;
        if (P.popEffect !== 'none') this.fx.push({ x: o.x, y: o.y, t0: t, size: o.size * P.popSize, seed: RL.hashSeed(L.id, 'pop', o.id), col: o.col, sc: o.sc });
      },
      step(dt, t, evs, P, rawDt) {
        const r = this.rng, A = engine.aspect, wrap = !!engine.project.wrap;
        this.now = t + (rawDt || dt);
        // schedule pops (offset may be + → queue)
        if (P.popOn) {
          const seen = new Set();
          for (const e of evs) {
            const key = P.popByFace ? e.t + ':' + e.face : String(e.t);
            if (seen.has(key)) continue; seen.add(key);
            this.pend.push({ t: e.t + P.popOffset / 1000, face: P.popByFace ? e.face : -1, s: e.s, seed: RL.hashSeed(L.id, 'ev', Math.round(e.t * 1000), e.face) });
          }
        }
        for (const e of evs) { if (P.burstOnMarker > 0 && (P.popByFace || e.face === evs[0].face)) for (let i = 0; i < P.burstOnMarker; i++) if (this.obj.length < P.maxCount * 1.5) this.spawn(P); }
        // spawn
        this.acc += P.rate * dt;
        while (this.acc >= 1) { this.acc -= 1; if (this.obj.length < P.maxCount) this.spawn(P); }
        // physics
        const n = engine.project.faces;
        for (const o of this.obj) {
          const sz = o.sc;
          o.vy += (P.buoyancy - P.gravity) * dt * sz;
          o.vy -= o.vy * Math.min(1, P.drag * dt);
          o.vx -= o.vx * Math.min(1, P.drag * dt);
          const swayV = P.sway * Math.cos((this.now + o.ph) * P.swayFreq * 6.283) * P.swayFreq * 6.283 * sz;
          o.x += (o.vx + swayV / A * 0.5 + P.drift * 0.08 / A * sz) * dt;
          o.y += o.vy * dt * 0.5;
          o.rot = Math.sin((this.now + o.ph) * P.swayFreq * 3.1) * P.tilt * Math.PI / 180 + o.spinDir * o.spinK * P.spin * (this.now - o.born);
          if (wrap) o.x = ((o.x % 1) + 1) % 1;
        }
        if (P.collide && this.obj.length > 1) {
          const os = this.obj, docH = engine.docH;
          for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
            const a = os[i], b = os[j];
            let dx = (b.x - a.x) * A; if (wrap) { if (dx > A / 2) dx -= A; else if (dx < -A / 2) dx += A; }
            const dy = b.y - a.y, rr = (a.size + b.size) * 0.36 / docH, d2 = dx * dx + dy * dy;
            if (d2 > rr * rr || d2 < 1e-12) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (rr - d) * 0.5;
            a.x -= nx * ov / A; a.y -= ny * ov; b.x += nx * ov / A; b.y += ny * ov;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) { const k = -(1 + P.bounce) * rv * 0.5; a.vx -= k * nx; a.vy -= k * ny * 2; b.vx += k * nx; b.vy += k * ny * 2; }
          }
        }
        // due pops
        this.pend.sort((a, b) => a.t - b.t);
        while (this.pend.length && this.pend[0].t <= this.now) {
          const e = this.pend.shift();
          let cand = this.obj.filter(o => !o.dead && o.y > P.popMinY && o.y < 1.02 && (e.face < 0 || Math.floor(o.x * n) === e.face));
          if (!cand.length) continue;
          const er = RL.rng(e.seed);
          cand = cand.map(o => [o, (o.rank + er()) % 1]).sort((a, b) => a[1] - b[1]).map(v => v[0]);
          const k = P.popRatio >= 0.999 ? cand.length : Math.round(cand.length * P.popRatio + er() * 0.5 * (P.popRatio > 0 ? 1 : 0));
          for (let i = 0; i < Math.min(k, cand.length); i++) this.pop(cand[i], P, e.t);
        }
        if (P.popHeight > 0) for (const o of this.obj) if (!o.dead && o.y >= P.popHeight) this.pop(o, P, this.now);
        this.obj = this.obj.filter(o => !o.dead && o.y < 1.0 + o.size / engine.docH && o.y > -0.6 && (wrap || (o.x > -0.2 && o.x < 1.2)));
        this.fx = this.fx.filter(f => this.now - f.t0 < P.popLife);
      },
      render(target, P) {
        RL.clear(gl, target);
        const T = this.now, tb = engine.texb, sb = engine.sprites, sg = engine.segs, A = engine.aspect, wrap = !!engine.project.wrap;
        const objs = this.obj.slice().sort((a, b) => b.z - a.z);   // far first
        // group draws by texture to keep sort-ish order cheap: far→near per texture
        const groups = new Map();
        for (const o of objs) {
          let tex, uv, asp = 1, luma = false, custom = false;
          if (o.kind.b) { const b = engine.builtin(o.kind.b); tex = b; uv = RL.atlasUV(b, o.kind.k); asp = (b.w / b.cols) / (b.h / b.rows); }
          else { const a = engine.asset(o.kind.a); if (!a) continue; tex = a; custom = true; luma = a.luma; const fr = a.frames > 1 ? Math.floor((T - o.born + o.ph) * (a.fps || 24)) : 0; uv = RL.atlasUV(a, fr); asp = (a.w / a.cols) / (a.h / a.rows); }
          if (!groups.has(tex)) groups.set(tex, []);
          groups.get(tex).push({ o, uv, asp, luma, custom });
        }
        const dim = o => (1 - 0.45 * o.z * P.depthVar / 0.9) * P.intensity;
        const xs = o => { const w = o.size / engine.docW; const out = [o.x]; if (wrap) { if (o.x < w) out.push(o.x + 1); if (o.x > 1 - w) out.push(o.x - 1); } return out; };
        // soft halo behind
        sb.begin();
        for (const o of objs) { const c = RL.hexToRgb(o.col); for (const x of xs(o)) sb.push(x, o.y, o.size * 1.05, o.size * 1.05, 0, c[0], c[1], c[2], 0.08 * P.glow * dim(o), 1, 1, 0.6, 0); }
        sb.flush(target, engine.docW, 'add');
        for (const [tex, list] of groups) {
          // glow pass
          if (P.glow > 0) {
            for (const { o, uv, asp, luma } of list) { const c = RL.hexToRgb(o.col); for (const x of xs(o)) tb.push(x, o.y, o.size * asp * 1.07, o.size * 1.07, o.rot, c[0], c[1], c[2], 0.35 * P.glow * dim(o), uv[0], uv[1], uv[2], uv[3], luma); }
            tb.flush(target, engine.docW, tex.tex, 'add');
          }
          for (const { o, uv, asp, luma, custom } of list) {
            const c = RL.hexToRgb(o.col), k = custom ? P.tint : Math.max(P.tint, 0.0001);
            const tc = [1 + (c[0] - 1) * k, 1 + (c[1] - 1) * k, 1 + (c[2] - 1) * k];
            const life = T - o.born, fadeIn = Math.min(1, life * 3);
            for (const x of xs(o)) tb.push(x, o.y, o.size * asp, o.size, o.rot, tc[0], tc[1], tc[2], dim(o) * fadeIn, uv[0], uv[1], uv[2], uv[3], luma);
          }
          tb.flush(target, engine.docW, tex.tex, custom(list) ? 'over' : 'add');
        }
        function custom(list) { return list.length && list[0].custom; }
        // pop effects
        const imgA = P.popEffect === 'image' ? engine.asset(P.popAsset) : null;
        const pal = (P.popColors && P.popColors.length ? P.popColors : ['#ffffff']).map(RL.hexToRgb);
        sb.begin(); sg.begin(); tb.begin();
        for (const f of this.fx) {
          const age = (T - f.t0) / P.popLife; if (age < 0 || age > 1) continue;
          const r = RL.rng(f.seed);
          const types = P.popEffect === 'random' ? [RL.FX_TYPES[r.int(RL.FX_TYPES.length)], 'sparks', 'flash'] : [P.popEffect];
          const colors = P.popUseColor ? [RL.hexToRgb(f.col), ...pal] : pal;
          for (const x of (wrap ? [f.x, f.x + 1, f.x - 1] : [f.x])) {
            if (x < -0.3 || x > 1.3) continue;
            const e = { x, y: f.y, age01: age, size: f.size, seed: f.seed, colors, count: Math.round(P.popCount * f.sc + 2), types, intensity: P.intensity };
            if (imgA) RL.drawImageBurst(engine, imgA, e); else if (P.popEffect !== 'image') RL.drawBurst(engine, e);
          }
        }
        sg.flush(target, engine.docW, 'add'); sb.flush(target, engine.docW, 'add');
        if (imgA) tb.flush(target, engine.docW, imgA.tex, imgA.luma ? 'add' : 'over'); else tb.n = 0;
      },
      dispose() {},
    };
    return inst;
  },
};
