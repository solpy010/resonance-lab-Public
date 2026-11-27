'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as eng from './engine.js';
// WAVE — 2D 파동 방정식. 경계는 '흡수'(열린 공간)라 벽 반사 없이 퍼져 사라진다.
// 표현: 등고선 링 / 소프트 글로우 링 / 간섭 광망 / 마루 빛 / 입체 음영.

RL.modules.wave = {
  label: '파장', icon: '◎', blend: 'add',
  schema: [
    { id: 'quality', when: (P) => P.mode !== 'glow', label: '시뮬 해상도(세로 칸)', type: 'range', min: 120, max: 520, step: 10, default: 300, group: '형태' },
    { id: 'waveSpeed', label: '전파 속도', type: 'range', min: 0.2, max: 6, step: 0.05, default: 1.6, group: '움직임', key: true },
    { id: 'damping', label: '감쇠(잔향)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.12, group: '움직임', key: true },
    { id: 'shape', when: (P) => P.mode !== 'glow', label: '충격 형태', type: 'select', options: [['point', '점(동심원)'], ['ring', '고리']], default: 'point', group: '형태' },
    { id: 'sweepOn', label: '가로선 파장(아래→위)', type: 'bool', default: false, group: '형태', hint: '켜면 이 레이어는 동심원 대신 가로선 파장이 아래에서 위로 한 번 훑고 지나갑니다(기본 꺼짐).' },
    { id: 'radius', when: (P) => P.mode !== 'glow', label: '충격 크기', type: 'range', min: 0.005, max: 0.3, step: 0.005, default: 0.05, group: '형태' },
    { id: 'amp', label: '충격 세기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '형태', key: true },
    { id: 'eventY', label: '충격 높이(0~1)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '형태' },
    { id: 'autoEvery', when: (P) => P.mode !== 'glow', label: '자동 타격 간격(초, 0=끔)', type: 'range', min: 0, max: 10, step: 0.1, default: 0, group: '움직임' },
    { id: 'oscAmp', when: (P) => P.mode !== 'glow', label: '상시 진동 세기', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '움직임', key: true },
    { id: 'oscFreq', when: (P) => P.mode !== 'glow', label: '상시 진동 주기(Hz)', type: 'range', min: 0.05, max: 4, step: 0.05, default: 0.6, group: '움직임' },
    { id: 'oscFaces', when: (P) => P.mode !== 'glow', label: '진동 면', type: 'text', default: 'B,D,F', group: '움직임' },
    { id: 'mode', rerender: true, label: '표현', type: 'select', options: [['glow', '발광 링(빛 파장·권장)'], ['contour', '등고선 링'], ['ripple', '소프트 글로우 링'], ['caustic', '간섭 광망'], ['crest', '마루 빛'], ['relief', '입체 음영']], default: 'glow', group: '물성' },
    { id: 'bands', label: '링 밀도', type: 'range', min: 0.5, max: 16, step: 0.1, default: 3, group: '물성' },
    { id: 'lineWidth', when: (P) => P.mode !== 'glow', label: '선 두께 / 링 부드러움', type: 'range', min: 0.3, max: 6, step: 0.1, default: 1.4, group: '물성' },
    { id: 'softness', label: '글로우 번짐', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: '물성', hint: '소프트 링·간섭 광망에서 빛이 번지는 정도' },
    { id: 'core', label: '중심 코어 밝기', type: 'range', min: 0, max: 2, step: 0.01, default: 0.9, group: '물성', hint: '중심의 밝은 흰빛 코어' },
    { id: 'sustain', when: (P) => P.mode === 'glow', label: '지속 발광 (0 펄스 ↔ 1 상시 오브)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '발광 링', hint: '0=타격마다 링이 퍼지고 사라짐(소나), 1=꺼지지 않는 에너지 오브' },
    { id: 'spread', when: (P) => P.mode === 'glow', label: '링 확산 범위', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.2, group: '발광 링', hint: '링이 중심에서 얼마나 멀리까지 퍼져 보이는지' },
    { id: 'swirl', when: (P) => P.mode === 'glow', label: '소용돌이 에너지', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: '발광 링', key: true, hint: '링을 휘감는 소용돌이 빛결(이미지2 느낌)' },
    { id: 'swirlArms', when: (P) => P.mode === 'glow', label: '소용돌이 가닥', type: 'range', min: 1, max: 12, step: 1, default: 5, group: '발광 링' },
    { id: 'ringDecay', when: (P) => P.mode === 'glow', label: '타격 후 사라짐 속도', type: 'range', min: 0.2, max: 5, step: 0.01, default: 1.6, group: '발광 링', hint: 'sustain이 낮을 때 타격 오브가 사라지는 빠르기' },
    { id: 'sparkle', when: (P) => P.mode === 'glow', label: '반짝임 입자', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, group: '발광 링', hint: '주변에 떠다니는 빛 입자(이미지2·3 느낌)' },
    { id: 'orbFaces', when: (P) => P.mode === 'glow', label: '상시 오브 면 (비우면 타격 위치)', type: 'text', default: '', group: '발광 링', hint: 'sustain이 있을 때 이 면들 중앙에 오브를 상시 띄움. 예) A,C,E' },
    { id: 'gain', label: '표현 증폭', type: 'range', min: 0.5, max: 40, step: 0.1, default: 9, group: '물성', key: true },
    { id: 'threshold', when: (P) => P.mode !== 'glow', label: '잔잔한 면 숨김', type: 'range', min: 0, max: 1, step: 0.01, default: 0.08, group: '물성' },
    { id: 'colorA', label: '마루 색(밝음)', type: 'color', default: '#a7e6ff', group: '색상' },
    { id: 'colorB', label: '골 색(어둠)', type: 'color', default: '#1b49ff', group: '색상' },
    { id: 'coreColor', label: '코어 색', type: 'color', default: '#eafcff', group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 1, group: '색상', key: true },
  ],
  create(engine, L) {
    const gl = engine.gl;
    // --- propagation step: open (absorbing) boundaries, no wall / face reflection ---
    const step = webgl.program(gl, `
      uniform sampler2D st; uniform vec2 px; uniform float c2, damp, wrap, padU, padV;
      void main(){
        vec4 S = texture(st, uv); float h = S.r, hp = S.g;
        float l = texture(st, uv - vec2(px.x,0)).r, r = texture(st, uv + vec2(px.x,0)).r;
        float d = texture(st, uv - vec2(0,px.y)).r, u = texture(st, uv + vec2(0,px.y)).r;
        float hn = (2.0*h - hp + c2*(l + r + u + d - 4.0*h)) * damp;
        // The sim grid is larger than the visible frame; [padV,1-padV]x[padU,1-padU] is on-screen.
        // The absorbing sponge sits ONLY in the off-screen guard band, so on-screen the ring
        // stays a clean expanding circle (no reflection, no pinch). Light wave, not water.
        float eV = min(uv.y, 1.0-uv.y);                    // distance to sim edge
        float spV = padV > 0.0 ? 1.0 - clamp(eV / padV, 0.0, 1.0) : 0.0;
        float sp = spV;
        if (wrap < 0.5 && padU > 0.0) { float eU = min(uv.x, 1.0-uv.x); sp = max(sp, 1.0 - clamp(eU / padU, 0.0, 1.0)); }
        hn *= 1.0 - 0.6 * sp * sp;
        frag = vec4(hn, h, 0.0, 1.0); }`);
    const inject = webgl.program(gl, webgl.GLSL_NOISE + `
      uniform sampler2D st; uniform vec4 imp[16]; uniform float nImp, shape, aspect, wrap, uScale, vScale;
      void main(){
        vec4 S = texture(st, uv); float add = 0.0;
        for (int i = 0; i < 16; i++) { if (float(i) >= nImp) break; vec4 q = imp[i];
          float du = wrapDx(uv.x - q.x, wrap) * uScale * aspect;   // sim-uv delta → physical distance
          float dv = (uv.y - q.y) * vScale;
          float dd = length(vec2(du, dv));
          float kr = (dd - q.z)/(q.z*0.35+0.002), kp = dd/q.z;
          add += shape > 0.5 ? q.w * exp(-kr*kr) : q.w * exp(-kp*kp); }
        frag = vec4(S.r + add, S.g + add, 0.0, 1.0); }`);
    // --- render ---
    const draw = webgl.program(gl, `
      uniform sampler2D st; uniform vec2 px; uniform float mode, bands, lw, soft, core, gain, thr, intensity, padU, padV;
      uniform vec3 cA, cB, cC;
      vec2 toSim(vec2 v){ return vec2(padU + v.x*(1.0-2.0*padU), padV + v.y*(1.0-2.0*padV)); }
      void main(){
        vec2 sv = toSim(uv);
        float h = texture(st, sv).r * gain;
        float e = abs(h);
        float env = smoothstep(thr, thr + 0.12, e);           // hide the still areas
        vec3 col = vec3(0.0); float a = 0.0;
        float coreT = smoothstep(0.75, 1.6, e) * core;         // bright hot centre
        if (mode < 0.5) {                                      // 등고선 링 (thin AA rings)
          float f = h * bands; float w = fwidth(f) * lw;
          float k = abs(fract(f + 0.5) - 0.5);
          float line = 1.0 - smoothstep(w*0.5, w*0.5 + fwidth(f), k);
          a = line * env; col = h > 0.0 ? cA : cB;
        } else if (mode < 1.5) {                               // 소프트 글로우 링 (image 3)
          float f = h * bands;
          float ring = 0.5 + 0.5*cos(f * 6.2831853);          // 0..1 smooth crest rings
          float sharp = mix(5.0, 0.9, soft);                  // soft→wide fat rings
          float band = pow(ring, sharp);
          float tone = clamp(h*0.5 + 0.5, 0.0, 1.0);
          col = mix(cB, cA, tone*0.55);                        // rings stay saturated blue
          a = band * env * (0.6 + 0.9*soft);
          // luminous blue fill toward the centre, then the bright core on top
          float fill = smoothstep(0.2, 1.1, e) * (0.4 + 0.6*soft);
          col = mix(col, mix(cB, cA, 0.35), fill); a = max(a, fill*0.85);
          col = mix(col, cC, coreT); a = max(a, coreT);
        } else if (mode < 2.5) {                               // 간섭 광망 (image 4)
          float inten = h*h;                                  // antinode intensity
          float fieldA = smoothstep(0.015, 0.5, inten);       // dark-blue filled field
          float f = h * bands;
          float ridge = pow(1.0 - 2.0*abs(fract(f) - 0.5), mix(10.0, 2.5, soft)); // bright web
          float nodes = pow(smoothstep(0.35, 1.1, e), 2.0);   // hot cyan antinodes
          col = mix(cB*0.5, cB, fieldA);
          col += cA * ridge * (0.5 + 0.5*soft);
          col = mix(col, cC, nodes*0.85);
          a = clamp(fieldA*0.65 + ridge*0.55 + nodes, 0.0, 1.4) * env;
          col = mix(col, cC, coreT); a = max(a, coreT);
        } else if (mode < 3.5) {                               // 마루 빛
          float cr = smoothstep(thr, 1.0, h), tr = smoothstep(thr, 1.0, -h) * 0.45;
          a = clamp(cr + tr, 0.0, 1.0); col = mix(cB, cA, cr / max(cr + tr, 1e-4));
          col = mix(col, cC, coreT); a = max(a, coreT);
        } else {                                               // 입체 음영
          float hl = texture(st, sv - vec2(px.x,0)).r, hr = texture(st, sv + vec2(px.x,0)).r;
          float hd = texture(st, sv - vec2(0,px.y)).r, hu = texture(st, sv + vec2(0,px.y)).r;
          vec3 n = normalize(vec3(-(hr - hl)*gain*6.0, -(hu - hd)*gain*6.0, 1.0));
          vec3 ld = normalize(vec3(-0.45, 0.6, 0.66));
          float diff = max(dot(n, ld), 0.0); float spec = pow(max(dot(reflect(-ld, n), vec3(0,0,1)), 0.0), 48.0);
          col = mix(cB, cA, clamp(h*0.5 + 0.5, 0.0, 1.0)) * (0.35 + 0.9*diff) + vec3(spec);
          a = smoothstep(thr*0.5, thr + 0.25, e + length(n.xy));
        }
        a = clamp(a, 0.0, 1.0);
        frag = vec4(col * a * intensity, a * min(intensity, 1.0)); }`);
    const sweepDraw = webgl.program(gl, `
      uniform float ys[8], ss[8]; uniform float nS, thick, intensity; uniform vec3 cA, cC;
      void main(){
        float a = 0.0;
        for (int i = 0; i < 8; i++) { if (float(i) >= nS) break; float d = abs(uv.y - ys[i]) / thick; a += ss[i] * exp(-d*d); }
        a = clamp(a, 0.0, 1.3);
        vec3 col = mix(cA, cC, clamp(a, 0.0, 1.0));
        frag = vec4(col * a * intensity, min(a, 1.0) * min(intensity, 1.0)); }`);
    const orbDraw = webgl.program(gl, `
      uniform vec4 em[6]; uniform float nE, aspect, time, density, speed, frontSpeed, sharp, decay,
        swirl, arms, falloff, gain, sustain, sparkle, holeR, frontTight, trailFade, intensity;
      uniform vec3 cDeep, cBright, cCore;
      float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      void main(){
        vec2 pr = vec2(aspect, 1.0);
        float field = 0.0;
        for (int i = 0; i < 6; i++){
          if (float(i) >= nE) break;
          vec4 e = em[i]; float age = max(e.z, 0.0);
          vec2 d = (uv - e.xy) * pr; float r = length(d); float ang = atan(d.y, d.x);
          float hole = smoothstep(0.0, holeR, r);                 // DARK centre — the light never stays in the middle
          float fade = exp(-r*falloff);
          float sw = 0.5 + 0.5*sin(ang*arms + r*density*0.6 - time*speed*1.25 + hash(vec2(float(i),3.0))*6.283);
          // continuous concentric rings living in an annulus (dark centre), only when sustained
          float phase = r*density - time*speed;
          float rings = pow(0.5 + 0.5*cos(phase*6.2831853), sharp);
          float cont = rings*(1.0 - swirl + swirl*sw) * mix(exp(-age*decay), 1.0, sustain) * sustain;
          // beat: a bright ring that expands OUT from the centre and leaves it dark behind
          float R = age*frontSpeed; float dR = r - R;
          float frontBand = exp(-dR*dR*frontTight);
          float trail = pow(0.5 + 0.5*cos(dR*density*6.2831853), sharp) * exp(-max(-dR,0.0)*trailFade) * exp(-max(dR,0.0)*10.0);
          float beat = (frontBand*1.3 + trail*0.6) * exp(-age*decay);
          field += (cont + beat) * hole * fade * e.w;
        }
        float fg = field*gain;
        float a = clamp(fg, 0.0, 1.4);
        vec3 col = mix(cDeep, cBright, clamp(fg*0.9, 0.0, 1.0));
        col = mix(col, cCore, clamp(max(0.0, fg - 0.8)*1.2, 0.0, 1.0));     // white only at the hottest ring crest
        if (sparkle > 0.0){
          vec2 cell = floor(uv*vec2(540.0, 320.0));
          float tw = hash(cell + floor(time*5.0)*1.7);
          float sp = pow(tw, 70.0) * (0.4 + 0.6*hash(cell+7.1));
          col += cBright * sp * sparkle; a = max(a, sp*sparkle);
        }
        frag = vec4(col * a * intensity, min(a, 1.0) * min(intensity, 1.0)); }`);
    let S = null;
    const inst = {
      events: [], sweeps: [], next: 0,
      alloc(P) {
        const wrap = !!engine.project.wrap, A = engine.aspect;
        const PADV = 0.33, PADU = wrap ? 0 : 0.33 / A;      // off-screen guard band (physical height units)
        const Vtot = 1 + 2 * PADV, Utot = 1 + 2 * PADU;
        this.uScale = Utot; this.vScale = Vtot;
        this.padFracV = PADV / Vtot; this.padFracU = PADU / Utot;
        const gh = Math.round(P.quality * Vtot), gw = Math.min(gl._maxTex, Math.round(P.quality * A * Utot));
        if (S && S.w === gw && S.h === gh && S._wrap === wrap) return;
        webgl.freeTarget(gl, S); S = webgl.pair(gl, gw, gh, { nearest: false }); S._wrap = wrap;
        webgl.clear(gl, S.a); webgl.clear(gl, S.b);
      },
      toSim(x, y) { return [this.padFracU + x * (1 - 2 * this.padFracU), this.padFracV + y * (1 - 2 * this.padFracV)]; },
      reset(rng, P) { this.rng = rng; S && (webgl.freeTarget(gl, S), S = null); this.alloc(P); this.pending = []; this.sweeps = []; this.sweepAnim = []; this.emits = []; this.time = 0; this.nextAuto = P.autoEvery > 0 ? 0.3 : Infinity; this.lastSweepT = null; },
      step(dt, t, evs, P) {
        const glow = P.mode === 'glow';
        if (!glow) this.alloc(P);
        const n = engine.project.faces, W = engine.project.wrap ? 1 : 0;
        if (!glow) webgl.setWrap(gl, S, !!W);
        for (const e of evs) {
          this.emits.push({ x: e.u, y: P.eventY + ((e.v ?? 0.5) - 0.5) * 0.6, t0: this.time, s: e.s });
          if (P.sweepOn) { if (this.lastSweepT !== e.t) { this.sweeps.push({ s: e.s }); this.lastSweepT = e.t; } }
          else this.pending.push({ x: e.u, y: P.eventY + ((e.v ?? 0.5) - 0.5) * 0.6, s: e.s });
        }
        if (this.emits.length > 6) this.emits.splice(0, this.emits.length - 6);
        if (glow) { this.time += dt; return; }
        if (P.autoEvery > 0 && this.time >= this.nextAuto) {
          if (P.sweepOn) this.sweeps.push({ s: 1 });
          else { const f = this.rng.int(n); this.pending.push({ x: (f + 0.5) / n, y: P.eventY, s: 1 }); }
          this.nextAuto = this.time + P.autoEvery;
        }
        this.time += dt;
        if (dt <= 0) return;
        const spd = P.waveSpeed * dt * 30;
        const sub = Math.max(1, Math.ceil(spd / 0.6));
        const c = spd / sub, c2 = Math.min(0.45, c * c);
        const damp = Math.pow(1 - P.damping * 0.06, 1 / sub * (dt * 30));
        const shapeId = P.shape === 'ring' ? 1 : 0;
        if (this.pending.length) {
          {
            const arr = new Float32Array(64); const k = Math.min(16, this.pending.length);
            for (let i = 0; i < k; i++) { const p = this.pending[i]; const sp = this.toSim(p.x, p.y); arr.set([sp[0], sp[1], P.radius, P.amp * p.s * 0.6], i * 4); }
            webgl.draw(gl, inject, S.b, { st: S.a, imp: arr, nImp: k, shape: shapeId, aspect: engine.aspect, wrap: W, uScale: this.uScale, vScale: this.vScale }); S.swap();
          }
          this.pending = [];
        }
        if (this.sweeps.length) { for (const sw of this.sweeps) this.sweepAnim.push({ p: 0, s: sw.s }); this.sweeps = []; }
        for (const a of this.sweepAnim) a.p += P.waveSpeed * dt * 0.42;   // clean bottom→top rise, exits off top
        this.sweepAnim = this.sweepAnim.filter(a => a.p < 1.2);
        if (P.oscAmp > 0) {
          const faces = eng.parseFaces(P.oscFaces, n); const arr = new Float32Array(64); let k = 0;
          const v = Math.sin(this.time * Math.PI * 2 * P.oscFreq) * P.oscAmp * 0.04 * dt * 30;
          for (const f of faces) if (k < 16) { const sp = this.toSim((f + 0.5) / n, P.eventY); arr.set([sp[0], sp[1], P.radius * 0.6, v], (k++) * 4); }
          if (k) { webgl.draw(gl, inject, S.b, { st: S.a, imp: arr, nImp: k, shape: 0, aspect: engine.aspect, wrap: W, uScale: this.uScale, vScale: this.vScale }); S.swap(); }
        }
        for (let i = 0; i < sub; i++) {
          webgl.draw(gl, step, S.b, { st: S.a, px: S.texel, c2, damp, wrap: W, padU: this.padFracU, padV: this.padFracV });
          S.swap();
        }
      },
      render(target, P) {
        webgl.clear(gl, target);
        if (P.mode === 'glow') {
          const n = engine.project.faces, list = [];
          const homes = eng.parseFaces(P.orbFaces, n);
          if (homes.length && (P.sustain || 0) > 0.01) for (const f of homes) list.push({ x: (f + 0.5) / n, y: P.eventY, age: 0, s: 1 });
          for (const e of this.emits) list.push({ x: e.x, y: e.y, age: this.time - e.t0, s: e.s });
          const use = list.slice(-6), em = new Float32Array(24); let k = 0;
          for (const o of use) { em.set([o.x, o.y, o.age, o.s], k * 4); k++; }
          if (k === 0 && (P.sustain || 0) > 0.01) { em.set([0.5, P.eventY, 0, 1], 0); k = 1; }   // show something when sustained & no beats yet
          webgl.draw(gl, orbDraw, target, {
            em, nE: k, aspect: engine.aspect, time: this.time,
            density: Math.max(1.5, P.bands * 2.2), speed: P.waveSpeed * 0.6, frontSpeed: P.waveSpeed * 0.35,
            sharp: Math.max(0.6, 6.0 * (1 - (P.softness ?? 0.5))), decay: P.ringDecay ?? 1.6,
            swirl: P.swirl ?? 0.4, arms: Math.round(P.swirlArms ?? 5), falloff: 1.1 / (P.spread || 1.2),
            holeR: 0.03 + 0.05 * (P.spread || 1.2), frontTight: 120.0, trailFade: 6.0,
            gain: Math.max(0.3, P.gain * 0.09), sustain: P.sustain ?? 0.4, sparkle: P.sparkle ?? 0.3, intensity: P.intensity,
            cDeep: webgl.hexToRgb(P.colorB), cBright: webgl.hexToRgb(P.colorA), cCore: webgl.hexToRgb(P.coreColor || '#eafcff'),
          }, 'over');
          if (this.sweepAnim && this.sweepAnim.length) {
            const ys = new Float32Array(8), ss = new Float32Array(8); let j = 0;
            for (const a of this.sweepAnim) { if (j >= 8) break; ys[j] = 0.06 + 0.9 * a.p; ss[j] = Math.max(0, 1 - Math.max(0, a.p - 1) * 5) * a.s; j++; }
            webgl.draw(gl, sweepDraw, target, { ys, ss, nS: j, thick: 0.006 + 0.004 * (P.lineWidth / 1.4), intensity: P.intensity, cA: webgl.hexToRgb(P.colorA), cC: webgl.hexToRgb(P.coreColor || '#eafcff') }, 'add');
          }
          return;
        }
        webgl.setWrap(gl, S, !!engine.project.wrap);
        const m = { contour: 0, ripple: 1, caustic: 2, crest: 3, relief: 4 }[P.mode] ?? 1;
        webgl.draw(gl, draw, target, {
          st: S.a, px: S.texel, mode: m, bands: P.bands, lw: P.lineWidth, soft: P.softness ?? 0.5, core: P.core ?? 0,
          gain: P.gain, thr: P.threshold, intensity: P.intensity, padU: this.padFracU, padV: this.padFracV,
          cA: webgl.hexToRgb(P.colorA), cB: webgl.hexToRgb(P.colorB), cC: webgl.hexToRgb(P.coreColor || '#eafcff'),
        });
        if (this.sweepAnim && this.sweepAnim.length) {
          const ys = new Float32Array(8), ss = new Float32Array(8); let k = 0;
          for (const a of this.sweepAnim) { if (k >= 8) break; ys[k] = 0.06 + 0.9 * a.p; ss[k] = Math.max(0, 1 - Math.max(0, a.p - 1) * 5) * a.s; k++; }
          webgl.draw(gl, sweepDraw, target, { ys, ss, nS: k, thick: 0.006 + 0.004 * (P.lineWidth / 1.4), intensity: P.intensity,
            cA: webgl.hexToRgb(P.colorA), cC: webgl.hexToRgb(P.coreColor || '#eafcff') }, 'add');
        }
      },
      get state() { return S; },
      dispose() { webgl.freeTarget(gl, S); },
    };
    return inst;
  },
};
