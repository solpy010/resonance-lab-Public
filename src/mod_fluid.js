'use strict';
import { RL } from './core/rl.js';
// FLUID — Stable Fluids (Stam 1999 계열) 직접 구현. 염료 밀도 = 알파 → 배경 위에 '물감'처럼 얹힘

RL.modules.fluid = {
  label: '유체', icon: '≈', blend: 'over',
  schema: [
    { id: 'quality', label: '속도장 해상도(세로)', type: 'range', min: 48, max: 256, step: 8, default: 112, group: '형태' },
    { id: 'dyeRes', label: '물감 해상도(세로)', type: 'range', min: 128, max: 1024, step: 16, default: 448, group: '형태' },
    { id: 'flow', label: '흐름 방식', type: 'select', options: [['drift', '수평 드리프트'], ['rise', '상승'], ['vortex', '소용돌이'], ['cross', '교차'], ['still', '정지(이벤트만)']], default: 'drift', group: '움직임' },
    { id: 'emitters', label: '이미터 수', type: 'range', min: 0, max: 16, step: 1, default: 6, group: '형태' },
    { id: 'emitSize', label: '이미터 크기', type: 'range', min: 0.005, max: 0.2, step: 0.005, default: 0.04, group: '형태' },
    { id: 'emitBand', label: '이미터 높이대(0~1)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '형태' },
    { id: 'force', label: '밀어내는 힘', type: 'range', min: 0, max: 3, step: 0.01, default: 0.8, group: '움직임', key: true },
    { id: 'dyeAmount', label: '물감 양', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '형태', key: true },
    { id: 'flowSpeed', label: '흐름 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.6, group: '움직임', key: true },
    { id: 'curl', label: '소용돌이 유지(와도)', type: 'range', min: 0, max: 60, step: 0.5, default: 18, group: '움직임', key: true },
    { id: 'vortex', label: '회오리 세기', type: 'range', min: 0, max: 3, step: 0.01, default: 0.8, group: '움직임', key: true },
    { id: 'vortexFaces', label: '회오리 중심 면', type: 'text', default: 'C,D', group: '움직임' },
    { id: 'viscosity', label: '점성(속도 감쇠)', type: 'range', min: 0, max: 3, step: 0.01, default: 0.25, group: '움직임' },
    { id: 'fade', label: '물감 사라짐', type: 'range', min: 0, max: 3, step: 0.01, default: 0.18, group: '형태', key: true },
    { id: 'colors', label: '팔레트', type: 'colors', default: ['#e9e4d8', '#7aa7c7', '#2f4a6b', '#c9a46a'], group: '색상' },
    { id: 'relief', label: '물감 두께 음영', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, group: '물성' },
    { id: 'sheen', label: '표면 광택', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, group: '물성' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'eventForce', label: '이벤트 폭발 힘', type: 'range', min: 0, max: 5, step: 0.01, default: 1.5, group: '반응' },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const P_ = (body) => RL.program(gl, body);
    const advect = P_(`uniform sampler2D vel, src; uniform float dt, diss, aspect;
      void main(){ vec2 v = texture(vel, uv).xy; vec2 p = uv - dt * vec2(v.x/aspect, v.y);
        frag = texture(src, p) / (1.0 + diss*dt); }`);
    const splat = P_(RL.GLSL_NOISE + `uniform sampler2D src; uniform vec2 pt; uniform vec4 val; uniform float rad, aspect, dyeMode, wrap;
      void main(){ vec2 d = uv - pt; d.x = wrapDx(d.x, wrap) * aspect; float g = exp(-dot(d,d)/(rad*rad));
        vec4 s = texture(src, uv);
        if (dyeMode > 0.5) { vec4 o = s + vec4(val.rgb*val.a, val.a)*g; if (o.a > 1.0) o /= o.a; frag = o; }
        else frag = vec4(s.xy + val.xy*g, 0.0, 1.0); }`);
    const vortexP = P_(RL.GLSL_NOISE + `uniform sampler2D src; uniform vec4 c[6]; uniform float n, aspect, dt, wrap;
      void main(){ vec2 v = texture(src, uv).xy;
        for (int i = 0; i < 6; i++) { if (float(i) >= n) break; vec2 d = uv - c[i].xy; d.x = wrapDx(d.x, wrap) * aspect;
          float r2 = dot(d,d) + c[i].z*c[i].z; v += vec2(-d.y, d.x) / r2 * c[i].w * dt * 0.02 - d / r2 * c[i].w * dt * 0.004; }
        frag = vec4(v, 0.0, 1.0); }`);
    const curlP = P_(`uniform sampler2D vel; uniform vec2 px;
      void main(){ float l = texture(vel, uv - vec2(px.x,0)).y, r = texture(vel, uv + vec2(px.x,0)).y;
        float b = texture(vel, uv - vec2(0,px.y)).x, t = texture(vel, uv + vec2(0,px.y)).x;
        frag = vec4(0.5*(r - l - t + b), 0.0, 0.0, 1.0); }`);
    const vortP = P_(`uniform sampler2D vel, cu; uniform vec2 px; uniform float amt, dt;
      void main(){ float l = abs(texture(cu, uv - vec2(px.x,0)).x), r = abs(texture(cu, uv + vec2(px.x,0)).x);
        float b = abs(texture(cu, uv - vec2(0,px.y)).x), t = abs(texture(cu, uv + vec2(0,px.y)).x), c = texture(cu, uv).x;
        vec2 f = 0.5*vec2(t - b, r - l); f /= length(f) + 1e-5; f *= amt * c; f.y *= -1.0;
        vec2 v = texture(vel, uv).xy + f * dt; frag = vec4(clamp(v, -8.0, 8.0), 0.0, 1.0); }`);
    const divP = P_(`uniform sampler2D vel; uniform vec2 px; uniform float wrap;
      void main(){ vec2 C = texture(vel, uv).xy;
        float l = texture(vel, uv - vec2(px.x,0)).x, r = texture(vel, uv + vec2(px.x,0)).x;
        float b = texture(vel, uv - vec2(0,px.y)).y, t = texture(vel, uv + vec2(0,px.y)).y;
        if (wrap < 0.5) { if (uv.x < px.x) l = -C.x; if (uv.x > 1.0-px.x) r = -C.x; } if (uv.y < px.y) b = -C.y; if (uv.y > 1.0-px.y) t = -C.y;
        frag = vec4(0.5*(r - l + t - b), 0.0, 0.0, 1.0); }`);
    const presP = P_(`uniform sampler2D pr, dv; uniform vec2 px;
      void main(){ float l = texture(pr, uv - vec2(px.x,0)).x, r = texture(pr, uv + vec2(px.x,0)).x;
        float b = texture(pr, uv - vec2(0,px.y)).x, t = texture(pr, uv + vec2(0,px.y)).x;
        frag = vec4((l + r + b + t - texture(dv, uv).x) * 0.25, 0.0, 0.0, 1.0); }`);
    const gradP = P_(`uniform sampler2D pr, vel; uniform vec2 px;
      void main(){ float l = texture(pr, uv - vec2(px.x,0)).x, r = texture(pr, uv + vec2(px.x,0)).x;
        float b = texture(pr, uv - vec2(0,px.y)).x, t = texture(pr, uv + vec2(0,px.y)).x;
        vec2 v = texture(vel, uv).xy - 0.5*vec2(r - l, t - b); frag = vec4(v, 0.0, 1.0); }`);
    const scaleP = P_(`uniform sampler2D src; uniform float k; void main(){ frag = texture(src, uv) * k; }`);
    const drawP = P_(`uniform sampler2D dye; uniform vec2 px; uniform float relief, sheen, intensity;
      void main(){ vec4 c = texture(dye, uv);
        if (relief > 0.0 || sheen > 0.0) {
          float l = texture(dye, uv - vec2(px.x,0)).a, r = texture(dye, uv + vec2(px.x,0)).a;
          float b = texture(dye, uv - vec2(0,px.y)).a, t = texture(dye, uv + vec2(0,px.y)).a;
          vec3 n = normalize(vec3(-(r - l)*4.0, -(t - b)*4.0, 1.0)); vec3 ld = normalize(vec3(-0.4, 0.6, 0.7));
          float diff = dot(n, ld); float spec = pow(max(dot(reflect(-ld, n), vec3(0,0,1)), 0.0), 30.0);
          c.rgb *= mix(1.0, 0.55 + 0.6*diff, relief); c.rgb += vec3(spec) * sheen * c.a;
        }
        frag = vec4(c.rgb * intensity, min(c.a, 1.0) * min(intensity, 1.0)); }`);
    let vel, dye, pres, divT, curlT, alloc = {};
    function allocate(P) {
      const vh = Math.round(P.quality), vw = Math.round(vh * engine.aspect);
      const dh = Math.round(P.dyeRes), dw = Math.min(gl._maxTex, Math.round(dh * engine.aspect));
      if (alloc.vw === vw && alloc.vh === vh && alloc.dw === dw && alloc.dh === dh) return false;
      [vel, dye, pres, divT, curlT].forEach(t => RL.freeTarget(gl, t));
      vel = RL.pair(gl, vw, vh); pres = RL.pair(gl, vw, vh); divT = RL.target(gl, vw, vh); curlT = RL.target(gl, vw, vh);
      dye = RL.pair(gl, dw, dh);
      alloc = { vw, vh, dw, dh };
      return true;
    }
    const inst = {
      reset(rng, P) {
        this.rng = rng; alloc = {}; allocate(P);
        [vel.a, vel.b, pres.a, pres.b, dye.a, dye.b].forEach(t => RL.clear(gl, t));
        this.em = [];
        for (let i = 0; i < 16; i++) this.em.push({ u: rng(), v: rng(), fu: rng.range(0.03, 0.12), fv: rng.range(0.05, 0.2), pu: rng() * 6.28, pv: rng() * 6.28, ci: i, dir: rng() < 0.5 ? -1 : 1 });
        this.time = 0; this.bursts = [];
      },
      step(dt, t, evs, P) {
        allocate(P);
        for (const e of evs) this.bursts.push(e);
        if (dt <= 0) return;
        const A = engine.aspect, cols = (P.colors || []).map(RL.hexToRgb), W = engine.project.wrap ? 1 : 0;
        [vel, dye, pres].forEach(t => RL.setWrap(gl, t, !!W)); RL.setWrap(gl, divT, !!W); RL.setWrap(gl, curlT, !!W);
        const pal = cols.length ? cols : [[1, 1, 1]];
        this.time += dt;
        const T = this.time;
        // emitters
        const n = Math.round(P.emitters);
        for (let i = 0; i < n; i++) {
          const e = this.em[i];
          let u, v, dx, dy;
          const band = P.emitBand;
          if (P.flow === 'rise') { u = (e.u + Math.sin(T * e.fu + e.pu) * 0.05 + 1) % 1; v = 0.04 + 0.08 * e.v; dx = Math.sin(T * e.fv + e.pv) * 0.3; dy = 1; }
          else if (P.flow === 'vortex') {
            const vf = RL.parseFaces(P.vortexFaces, engine.project.faces), nf = engine.project.faces;
            const cu = vf.length ? (vf[i % vf.length] + 0.5) / nf : 0.5, sgn = vf.length && (i % vf.length) % 2 ? -1 : 1;
            const a = T * 0.9 * P.flowSpeed * sgn + e.pu, rad = 0.12 + 0.28 * e.u;
            u = cu + Math.cos(a) * rad / A; v = 0.5 + Math.sin(a) * rad; dx = -Math.sin(a) * sgn; dy = Math.cos(a) * sgn; }
          else if (P.flow === 'cross') { u = (e.u + T * P.flowSpeed * 0.02 * e.dir + 10) % 1; v = band + (e.v - 0.5) * 0.6; dx = e.dir; dy = Math.sin(T * e.fv * 3 + e.pv) * 0.6; }
          else if (P.flow === 'still') { continue; }
          else { u = (e.u + T * P.flowSpeed * 0.015 + 10) % 1; v = band + (e.v - 0.5) * 0.7 + Math.sin(T * e.fv * 2 + e.pv) * 0.12; dx = 1; dy = Math.sin(T * e.fu * 4 + e.pu) * 0.8; }
          const fm = P.force * 0.6;
          RL.draw(gl, splat, vel.b, { src: vel.a, pt: [u, v], val: [dx * fm, dy * fm, 0, 0], rad: P.emitSize, aspect: A, dyeMode: 0, wrap: W }); vel.swap();
          const c = pal[e.ci % pal.length];
          RL.draw(gl, splat, dye.b, { src: dye.a, pt: [u, v], val: [c[0], c[1], c[2], P.dyeAmount * dt * 5], rad: P.emitSize * 0.8, aspect: A, dyeMode: 1, wrap: W }); dye.swap();
        }
        // event bursts
        for (const b of this.bursts) {
          const c = pal[Math.floor(b.r * pal.length) % pal.length];
          for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + b.r * 6;
            const f = P.eventForce * b.s;
            RL.draw(gl, splat, vel.b, { src: vel.a, pt: [b.u + Math.cos(a) * P.emitSize / A, b.v + Math.sin(a) * P.emitSize], val: [Math.cos(a) * f, Math.sin(a) * f, 0, 0], rad: P.emitSize, aspect: A, dyeMode: 0, wrap: W }); vel.swap();
          }
          RL.draw(gl, splat, dye.b, { src: dye.a, pt: [b.u, b.v], val: [c[0], c[1], c[2], Math.min(1, 0.8 * b.s)], rad: P.emitSize * 1.4, aspect: A, dyeMode: 1, wrap: W }); dye.swap();
        }
        this.bursts = [];
        // drift as global push
        if (P.flow === 'drift' && P.flowSpeed > 0) {
          // gentle uniform current: splat large & weak at random heights
          RL.draw(gl, splat, vel.b, { src: vel.a, pt: [0.0, 0.5], val: [P.flowSpeed * 0.02, 0, 0, 0], rad: 2.0, aspect: 1, dyeMode: 0 }); vel.swap();
        }
        if (P.flow === 'vortex' && P.vortex > 0) {
          const faces = RL.parseFaces(P.vortexFaces, engine.project.faces);
          const arr = new Float32Array(24); let k = 0; const nf = engine.project.faces;
          for (const f of faces) if (k < 6) arr.set([(f + 0.5) / nf, 0.5, 0.15, P.vortex * 40 * (k % 2 ? -1 : 1)], (k++) * 4);
          if (!k) { arr.set([0.5, 0.5, 0.15, P.vortex * 40], 0); k = 1; }
          RL.draw(gl, vortexP, vel.b, { src: vel.a, c: arr, n: k, aspect: A, dt, wrap: W }); vel.swap();
        }
        // velocity self-advection
        RL.draw(gl, advect, vel.b, { vel: vel.a, src: vel.a, dt, diss: P.viscosity, aspect: A }); vel.swap();
        // vorticity confinement
        RL.draw(gl, curlP, curlT, { vel: vel.a, px: vel.texel });
        RL.draw(gl, vortP, vel.b, { vel: vel.a, cu: curlT, px: vel.texel, amt: P.curl, dt }); vel.swap();
        // projection
        RL.draw(gl, divP, divT, { vel: vel.a, px: vel.texel, wrap: W });
        RL.draw(gl, scaleP, pres.b, { src: pres.a, k: 0.8 }); pres.swap();
        for (let i = 0; i < 22; i++) { RL.draw(gl, presP, pres.b, { pr: pres.a, dv: divT, px: vel.texel }); pres.swap(); }
        RL.draw(gl, gradP, vel.b, { pr: pres.a, vel: vel.a, px: vel.texel }); vel.swap();
        // dye advection
        RL.draw(gl, advect, dye.b, { vel: vel.a, src: dye.a, dt, diss: P.fade, aspect: A }); dye.swap();
      },
      render(target, P) {
        RL.clear(gl, target);
        RL.setWrap(gl, dye, !!engine.project.wrap);
        RL.draw(gl, drawP, target, { dye: dye.a, px: dye.texel, relief: P.relief, sheen: P.sheen, intensity: P.intensity });
      },
      dispose() { [vel, dye, pres, divT, curlT].forEach(t => RL.freeTarget(gl, t)); },
    };
    return inst;
  },
};
