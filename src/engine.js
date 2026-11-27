'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as batches from './batch.js';
import * as icons from './builtins.js';
// RESONANCE LAB — engine: deterministic frame clock, layer graph, 2층 post, background/alpha output

RL.modules = {};
export const FACE_NAMES = 'ABCDEFGHIJKL'.split('');

export const layerCommonSchema = [
  { id: 'blend', label: '레이어 합성', type: 'select', options: [['over', '일반(Normal)'], ['add', '더하기(Add)'], ['screen', '스크린(Screen)'], ['multiply', '곱하기(Multiply)'], ['hardlight', '하드라이트(Hard Light)'], ['overlay', '오버레이(Overlay)'], ['softlight', '소프트라이트(Soft Light)'], ['difference', '차이(Difference)'], ['lighten', '밝게(Lighten)'], ['darken', '어둡게(Darken)']], group: '깊이·합성', hint: '아래 레이어들과 섞이는 방식' },
  { id: 'opacity', label: '불투명도', type: 'range', min: 0, max: 1, step: 0.01, group: '깊이·합성', key: true },
  { id: 'depth', label: '깊이(원경 감쇠)', type: 'range', min: 0, max: 1, step: 0.01, group: '깊이·합성', key: true, hint: '0=근경, 1=원경. 원경일수록 배경색에 가까워지고 어두워짐' },
  { id: 'blur', label: '흐림(피사계 심도)', type: 'range', min: 0, max: 1, step: 0.01, group: '깊이·합성', key: true },
  { id: 'speed', label: '레이어 속도', type: 'range', min: 0, max: 4, step: 0.01, group: '깊이·합성', key: true },
];

export const reactSchema = [
  { id: 'enabled', label: '마커에 반응', type: 'bool' },
  { id: 'faces', label: '반응 위치', type: 'select', options: [['all', '모든 면 동시'], ['origin', '한 면'], ['propagate', '한 면 → 인접면 전파'], ['list', '지정 면'], ['random', '무작위 면(시드)']] },
  { id: 'origin', label: '시작 면', type: 'text' },
  { id: 'list', label: '지정 면 (예: A,C,E)', type: 'text' },
  { id: 'delay', label: '면 간 지연(ms)', type: 'range', min: 0, max: 1000, step: 10 },
  { id: 'gain', label: '반응 세기', type: 'range', min: 0, max: 3, step: 0.01 },
  { id: 'jitter', label: '위치 흔들림', type: 'range', min: 0, max: 1, step: 0.01 },
];

export const defaultReact = () => ({ enabled: true, faces: 'all', origin: 'C', list: 'A,C,E', delay: 120, gain: 1, jitter: 0 });

export const BLEND_ID = { over: 0, normal: 0, add: 1, screen: 2, multiply: 3, hardlight: 4, overlay: 5, softlight: 6, difference: 7, lighten: 8, darken: 9 };

export const defaultProject = () => ({
  version: 1, name: 'Untitled', width: 3840, height: 640, fps: 30, duration: 10, seed: 125, faces: 6, wrap: true, assets: {},
  bg: { mode: 'solid', color: '#05070c', chroma: '#00b140' },
  post: { glow: 0.35, glowThreshold: 0.55, glowRadius: 0.5, halation: 0, grain: 0.03, chroma: 0, exposure: 1, contrast: 1, saturation: 1 },
  impact: { enabled: false, frames: 3, mode: 'flash', amount: 0.5 },
  speed: 1, speedKeys: [],
  markers: [],
  layers: [],
});

export const newLayer = function (type, overrides) {
  const M = RL.modules[type];
  const params = {};
  for (const s of M.schema) params[s.id] = Array.isArray(s.default) ? s.default.slice() : s.default;
  return Object.assign({
    id: 'L' + Math.random().toString(36).slice(2, 8), type, name: M.label, enabled: true,
    blend: M.blend || 'over', opacity: 1, depth: 0, blur: 0, speed: 1,
    params, keys: {}, react: defaultReact(),
  }, overrides || {});
};

// keyframes: [{t, v, e}] sorted
export const evalKeys = function (keys, t, fallback) {
  if (!keys || !keys.length) return fallback;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (webgl.ease[b.e || 'quintOut'] || webgl.ease.quintOut)((t - a.t) / Math.max(1e-6, b.t - a.t));
      return a.v + (b.v - a.v) * f;
    }
  }
  return fallback;
};

export const parseFaces = function (str, nFaces) {
  return String(str || '').toUpperCase().split(/[\s,]+/).map(c => FACE_NAMES.indexOf(c)).filter(i => i >= 0 && i < nFaces);
};

export const Engine = class {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = webgl.createGL(canvas);
    this.scale = 0.5;
    this.frame = 0;
    this.view = { grayscale: false, glowOff: false, checker: true, seam: false };
    this.sprites = new batches.SpriteBatch(gl, 120000);
    this.segs = new batches.SegBatch(gl, 120000);
    this.texb = new batches.TexBatch(gl, 20000);
    this.assets = new Map();      // id -> { tex, w, h, cols, rows, frames, luma, ready }
    this.builtins = {};
    this.onAssetLoad = null;
    this.prog = {
      composite: webgl.program(gl, `
        uniform sampler2D src, dst; uniform float opacity, depth, mode; uniform vec3 bg;
        vec3 hard(vec3 b, vec3 s){ return mix(b*2.0*s, 1.0 - (1.0-b)*(1.0-(2.0*s-1.0)), step(0.5, s)); }
        vec3 soft(vec3 b, vec3 s){ vec3 dd = mix(((16.0*b-12.0)*b+4.0)*b, sqrt(b), step(0.25, b));
          return mix(b - (1.0-2.0*s)*b*(1.0-b), b + (2.0*s-1.0)*(dd-b), step(0.5, s)); }
        vec3 B(vec3 b, vec3 s, float m){
          if (m < 2.5) return b + s - b*s;          // screen
          if (m < 3.5) return b * s;                // multiply
          if (m < 4.5) return hard(b, s);           // hard light
          if (m < 5.5) return hard(s, b);           // overlay
          if (m < 6.5) return soft(b, clamp(s,0.0,1.0)); // soft light
          if (m < 7.5) return abs(b - s);           // difference
          if (m < 8.5) return max(b, s);            // lighten
          return min(b, s); }                        // darken
        void main(){
          vec4 s = texture(src, uv);
          s.rgb = mix(s.rgb, bg * s.a, depth*0.75) * (1.0 - depth*0.35);
          s *= opacity;
          vec4 d = texture(dst, uv);
          if (mode < 0.5) { frag = s + d * (1.0 - s.a); return; }
          if (mode < 1.5) { frag = vec4(s.rgb + d.rgb, s.a + d.a * (1.0 - s.a)); return; }
          vec3 cs = s.a > 1e-5 ? clamp(s.rgb / s.a, 0.0, 8.0) : vec3(0.0);
          vec3 cb = d.a > 1e-5 ? clamp(d.rgb / d.a, 0.0, 8.0) : vec3(0.0);
          vec3 b = B(cb, cs, mode);
          frag = vec4((1.0 - d.a) * s.rgb + (1.0 - s.a) * d.rgb + s.a * d.a * b, s.a + d.a * (1.0 - s.a)); }`),
      blur: webgl.program(gl, `
        uniform sampler2D src; uniform vec2 dir;
        void main(){ vec4 s = texture(src, uv)*0.227027;
          s += (texture(src, uv+dir*1.3846)+texture(src, uv-dir*1.3846))*0.3162162;
          s += (texture(src, uv+dir*3.2308)+texture(src, uv-dir*3.2308))*0.0702703;
          frag = s; }`),
      copy: webgl.program(gl, `uniform sampler2D src; void main(){ frag = texture(src, uv); }`),
      fade: webgl.program(gl, `uniform float k; void main(){ frag = vec4(0.0,0.0,0.0,k); }`),
      bright: webgl.program(gl, `
        uniform sampler2D src; uniform float th;
        void main(){ vec4 c = texture(src, uv); float l = max(c.r, max(c.g, c.b));
          float w = smoothstep(th, th + 0.35, l); frag = vec4(c.rgb * w, 1.0); }`),
      post: webgl.program(gl, webgl.GLSL_NOISE + `
        uniform sampler2D src, g1, g2, g3;
        uniform float glow, radius, halation, grain, chroma, exposure, contrast, saturation, impact, impactMode, frameN;
        uniform vec2 res;
        vec4 samp(vec2 p){ return texture(src, p); }
        void main(){
          vec2 d = (uv - 0.5); vec2 off = d * chroma * 0.012;
          vec4 c = samp(uv);
          if (chroma > 0.0) { c.r = samp(uv + off).r; c.b = samp(uv - off).b; }
          vec3 gA = texture(g1, uv).rgb, gB = texture(g2, uv).rgb, gC = texture(g3, uv).rgb;
          vec3 glw = gA * (1.0 - radius) * 0.9 + gB * 0.8 + gC * (0.4 + radius);
          c.rgb += glw * glow;
          float glL = max(glw.r, max(glw.g, glw.b));
          c.a = max(c.a, clamp(glL * glow, 0.0, 1.0));
          vec3 big = gC + gB*0.5; float bl = max(big.r, max(big.g, big.b));
          c.rgb += vec3(1.0, 0.32, 0.12) * bl * halation;
          c.a = max(c.a, clamp(bl * halation, 0.0, 1.0));
          c.rgb *= exposure;
          float L = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(vec3(L), c.rgb, saturation);
          c.rgb = (c.rgb - 0.5*c.a) * contrast + 0.5*c.a;
          c.rgb = max(c.rgb, 0.0);
          if (grain > 0.0) { float n = hash12(uv*res + vec2(frameN*17.0, frameN*7.0)) - 0.5; c.rgb += n * grain * c.a; }
          if (impact > 0.0) {
            if (impactMode < 0.5) c.rgb += c.a * impact * vec3(1.0);
            else c.rgb = mix(c.rgb, c.a - min(c.rgb, c.a), impact);
          }
          frag = c; }`),
      present: webgl.program(gl, `
        uniform sampler2D src; uniform vec3 bg; uniform float mode, gray, flip, unpremul, shift; uniform vec2 res;
        void main(){
          vec2 p = vec2(fract(uv.x + shift), flip > 0.5 ? 1.0 - uv.y : uv.y);
          vec4 c = texture(src, p); c = clamp(c, 0.0, 64.0); c.a = min(c.a, 1.0);
          vec3 base = bg;
          if (mode > 0.5) { vec2 q = floor(gl_FragCoord.xy / 16.0); base = mix(vec3(0.16), vec3(0.24), mod(q.x+q.y, 2.0)); }
          vec4 o;
          if (unpremul > 0.5) { o = c.a > 0.008 ? vec4(min(c.rgb / c.a, 1.0), c.a) : vec4(0.0); }
          else { o = vec4(min(c.rgb + base * (1.0 - c.a), 1.0), 1.0); }
          if (gray > 0.5) { float l = dot(o.rgb, vec3(0.2126, 0.7152, 0.0722)); o.rgb = vec3(l); }
          frag = o; }`),
    };
    this.layers = [];
    this.colliders = new Map();   // layerId -> { segs: Float32Array [x0,y0,x1,y1,vx,vy]*n (physical units: x*aspect), n }
  }

  // ------------------------------------------------------------ setup
  load(project) {
    this.project = project;
    this.syncAssets();
    this.rebuild();
  }

  get docW() { return this.project.width; }
  get docH() { return this.project.height; }
  get aspect() { return this.project.width / this.project.height; }

  rebuild() {
    const gl = this.gl, P = this.project;
    const max = gl._maxTex;
    let rw = Math.round(P.width * this.scale), rh = Math.round(P.height * this.scale);
    if (rw > max) { rh = Math.round(rh * max / rw); rw = max; }
    if (rh > max) { rw = Math.round(rw * max / rh); rh = max; }
    this.rw = rw; this.rh = rh;
    this.canvas.width = rw; this.canvas.height = rh;
    for (const k of ['accumA', 'accumB', 'out', 'tmp', 'b1', 'b1t', 'b2', 'b2t', 'b3', 'b3t', 'exportT']) webgl.freeTarget(gl, this[k]);
    this.accumA = webgl.target(gl, rw, rh); this.accumB = webgl.target(gl, rw, rh); this.accum = this.accumA;
    this.out = webgl.target(gl, rw, rh);
    this.tmp = webgl.target(gl, rw, rh);
    this.b1 = webgl.target(gl, rw / 2, rh / 2); this.b1t = webgl.target(gl, rw / 2, rh / 2);
    this.b2 = webgl.target(gl, rw / 6, rh / 6); this.b2t = webgl.target(gl, rw / 6, rh / 6);
    this.b3 = webgl.target(gl, rw / 16, rh / 16); this.b3t = webgl.target(gl, rw / 16, rh / 16);
    this.exportT = webgl.target(gl, rw, rh, { format: 'rgba8', nearest: true });
    for (const L of this.layers) this.disposeLayer(L);
    this.layers = [];
    this.syncLayers();
    this.reset();
  }

  disposeLayer(L) {
    if (L.inst && L.inst.dispose) L.inst.dispose();
    webgl.freeTarget(this.gl, L.target);
  }

  // keep engine layer instances in sync with project.layers (by id)
  syncLayers() {
    const want = this.project.layers;
    const keep = [];
    for (const def of want) {
      let L = this.layers.find(x => x.id === def.id && x.type === def.type);
      if (!L) {
        const M = RL.modules[def.type];
        if (!M) continue;
        L = { id: def.id, type: def.type, def, target: webgl.target(this.gl, this.rw, this.rh) };
        L.inst = M.create(this, L);
        L.needsReset = true;
      }
      L.def = def;
      keep.push(L);
    }
    for (const L of this.layers) if (!keep.includes(L)) this.disposeLayer(L);
    this.layers = keep;
  }

  reset() {
    this.frame = 0;
    this.impactLeft = 0;
    this.colliders.clear();
    for (const L of this.layers) this.resetLayer(L);
    this.buildGlobalSchedule();
  }

  resetLayer(L) {
    const P = this.project;
    L.rng = webgl.rng(webgl.hashSeed(P.seed, L.id));
    L.cur = this.evalLayer(L, 0);
    webgl.clear(this.gl, L.target);
    L.inst.reset(L.rng, L.cur);
    L.events = this.buildSchedule(L);
    L.evPtr = 0;
    L.needsReset = false;
  }

  buildGlobalSchedule() {
    const P = this.project;
    this.globalEvents = (P.markers || []).slice().sort((a, b) => a.t - b.t);
    this.gPtr = 0;
  }

  // expand markers into per-face sub-events for this layer (deterministic)
  buildSchedule(L) {
    const P = this.project, R = L.def.react || defaultReact();
    if (!R.enabled) return [];
    const n = Math.max(1, P.faces | 0);
    const rng = webgl.rng(webgl.hashSeed(P.seed, L.id, 'events'));
    const out = [];
    const origin = Math.max(0, parseFaces(R.origin, n)[0] ?? Math.floor(n / 2));
    const list = parseFaces(R.list, n);
    (P.markers || []).forEach((m, mi) => {
      const mr = webgl.rng(webgl.hashSeed(P.seed, 'marker', mi, Math.round(m.t * 1000)));   // same marker → same spot on every layer
      const mFace = mr.int(n), mju = mr() - 0.5, mjv = mr() - 0.5;
      let faces = [];
      if (R.faces === 'all') faces = Array.from({ length: n }, (_, i) => [i, 0]);
      else if (R.faces === 'origin') faces = [[origin, 0]];
      else if (R.faces === 'list') faces = (list.length ? list : [origin]).map(i => [i, 0]);
      else if (R.faces === 'random') faces = [[mFace, 0]];
      else if (R.faces === 'propagate') faces = Array.from({ length: n }, (_, i) => [i, Math.abs(i - origin) * R.delay / 1000]);
      for (const [f, d] of faces) {
        const ju = (faces.length === 1 ? mju : rng() - 0.5) * R.jitter / n, jv = (faces.length === 1 ? mjv : rng() - 0.5) * R.jitter;
        out.push({ t: m.t + d, face: f, u: (f + 0.5) / n + ju, v: 0.5 + jv * 0.8, s: (m.s ?? 1) * R.gain, r: mr(), kind: m.kind || 'hit' });
      }
    });
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  evalLayer(L, t) {
    const def = L.def, M = RL.modules[def.type];
    const cur = {};
    for (const s of M.schema) {
      const v = def.params[s.id];
      cur[s.id] = (s.type === 'range' && def.keys && def.keys[s.id]) ? evalKeys(def.keys[s.id], t, v) : v;
    }
    for (const s of layerCommonSchema) {
      const v = def[s.id];
      cur['_' + s.id] = (s.type === 'range' && def.keys && def.keys['_' + s.id]) ? evalKeys(def.keys['_' + s.id], t, v) : v;
    }
    return cur;
  }

  // ------------------------------------------------------------ simulation
  stepFrame() {
    const P = this.project, fps = P.fps, dt = 1 / fps, t = this.frame / fps;
    const gs = evalKeys(P.speedKeys, t, P.speed);
    // global impact
    while (this.gPtr < this.globalEvents.length && this.globalEvents[this.gPtr].t < t + dt) {
      const e = this.globalEvents[this.gPtr++];
      if (P.impact.enabled && e.t >= t - dt) this.impactLeft = P.impact.frames;
    }
    for (const L of this.layers) {
      if (L.needsReset) this.resetLayer(L);
      if (!L.def.enabled) { this.colliders.delete(L.id); continue; }
      const cur = L.cur = this.evalLayer(L, t);
      const evs = [];
      while (L.evPtr < L.events.length && L.events[L.evPtr].t < t + dt) evs.push(L.events[L.evPtr++]);
      const ldt = dt * gs * cur._speed;
      L.inst.step(ldt, t, evs, cur, dt);
    }
    this.frame++;
    if (this.impactLeft > 0) this.impactLeft--;
  }

  // ------------------------------------------------------------ rendering
  render() {
    const gl = this.gl, P = this.project;
    const bg = webgl.hexToRgb(P.bg.mode === 'black' ? '#000000' : P.bg.mode === 'chroma' ? P.bg.chroma : P.bg.color);
    const atmo = P.bg.mode === 'solid' ? bg : (P.bg.mode === 'black' ? [0, 0, 0] : [0, 0, 0]);
    const W = !!P.wrap;
    for (const k of ['accumA', 'accumB', 'out', 'tmp', 'b1', 'b1t', 'b2', 'b2t', 'b3', 'b3t']) webgl.setWrap(gl, this[k], W);
    let acc = this.accumA, nxt = this.accumB;
    webgl.clear(gl, acc);
    for (const L of this.layers) {
      if (L.needsReset) this.resetLayer(L);
      if (!L.def.enabled) continue;
      const cur = L.cur || this.evalLayer(L, this.frame / P.fps);
      webgl.setWrap(gl, L.target, W);
      L.inst.render(L.target, cur);
      let src = L.target;
      if (cur._blur > 0.001) {
        const r = cur._blur * 10 * (this.rw / this.docW) + 0.5;
        for (let i = 0; i < 2; i++) {
          webgl.draw(gl, this.prog.blur, this.tmp, { src, dir: [r / this.rw, 0] });
          webgl.draw(gl, this.prog.blur, this.out, { src: this.tmp, dir: [0, r / this.rh] });
          src = this.out;
        }
        webgl.draw(gl, this.prog.copy, this.tmp, { src: this.out });
        src = this.tmp;
      }
      webgl.draw(gl, this.prog.composite, nxt, { src, dst: acc, opacity: cur._opacity, depth: cur._depth, bg: atmo, mode: BLEND_ID[L.def.blend] ?? 0 });
      const t = acc; acc = nxt; nxt = t;
    }
    this.accum = acc;
    this.postProcess();
  }

  postProcess() {
    const gl = this.gl, P = this.project, po = P.post;
    const glow = this.view.glowOff ? 0 : po.glow;
    if (glow > 0 || po.halation > 0) {
      webgl.draw(gl, this.prog.bright, this.b1, { src: this.accum, th: po.glowThreshold });
      const blurT = (t, tt, r) => {
        webgl.draw(gl, this.prog.blur, tt, { src: t, dir: [r / t.w, 0] });
        webgl.draw(gl, this.prog.blur, t, { src: tt, dir: [0, r / t.h] });
      };
      blurT(this.b1, this.b1t, 1.5);
      webgl.draw(gl, this.prog.copy, this.b2, { src: this.b1 });
      blurT(this.b2, this.b2t, 2.0); blurT(this.b2, this.b2t, 2.5);
      webgl.draw(gl, this.prog.copy, this.b3, { src: this.b2 });
      blurT(this.b3, this.b3t, 2.0); blurT(this.b3, this.b3t, 3.0);
    } else { webgl.clear(gl, this.b1); webgl.clear(gl, this.b2); webgl.clear(gl, this.b3); }
    const imp = this.impactLeft > 0 && P.impact.enabled ? P.impact.amount * (this.impactLeft / P.impact.frames) : 0;
    webgl.draw(gl, this.prog.post, this.out, {
      src: this.accum, g1: this.b1, g2: this.b2, g3: this.b3,
      glow, radius: po.glowRadius, halation: this.view.glowOff ? 0 : po.halation, grain: po.grain, chroma: po.chroma,
      exposure: po.exposure, contrast: po.contrast, saturation: po.saturation,
      impact: imp, impactMode: P.impact.mode === 'invert' ? 1 : 0, frameN: this.frame % 997, res: [this.rw, this.rh],
    });
  }

  bgColor() {
    const P = this.project;
    return webgl.hexToRgb(P.bg.mode === 'black' ? '#000000' : P.bg.mode === 'chroma' ? P.bg.chroma : P.bg.color);
  }

  present() {
    const gl = this.gl, P = this.project;
    const transparent = P.bg.mode === 'transparent';
    webgl.draw(gl, this.prog.present, null, {
      src: this.out, bg: this.bgColor(), mode: transparent && this.view.checker ? 1 : 0,
      gray: this.view.grayscale ? 1 : 0, flip: 0, unpremul: 0, res: [this.rw, this.rh], shift: this.view.seam ? 0.5 : 0,
    });
  }

  // returns Uint8ClampedArray RGBA top-down (straight alpha when transparent)
  readFrame(forceOpaque) {
    const gl = this.gl, P = this.project;
    const transparent = P.bg.mode === 'transparent' && !forceOpaque;
    webgl.draw(gl, this.prog.present, this.exportT, {
      src: this.out, bg: this.bgColor(), mode: 0, gray: 0, flip: 1, unpremul: transparent ? 1 : 0, res: [this.rw, this.rh], shift: 0,
    });
    const px = new Uint8ClampedArray(this.rw * this.rh * 4);
    webgl.bindTarget(gl, this.exportT);
    gl.readPixels(0, 0, this.rw, this.rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  // ------------------------------------------------------------ assets (custom images / video atlases)
  syncAssets() {
    const gl = this.gl, want = this.project.assets || {};
    for (const [id, a] of this.assets) if (!want[id] || want[id].src !== a.src) { if (a.tex) gl.deleteTexture(a.tex); this.assets.delete(id); }
    for (const id in want) {
      if (this.assets.has(id)) continue;
      const meta = want[id];
      const rec = { src: meta.src, cols: meta.cols || 1, rows: meta.rows || 1, frames: meta.frames || 1, fps: meta.fps || 24, luma: !!meta.luma, kind: meta.kind, ready: false, tex: null };
      rec.promise = new Promise((res) => {
        const img = new Image();
        img.onload = () => { rec.tex = webgl.uploadImage(gl, img); rec.w = img.width; rec.h = img.height; rec.ready = true; res(); if (this.onAssetLoad) this.onAssetLoad(id); };
        img.onerror = () => { rec.ready = true; res(); };
        img.src = meta.src;
      });
      this.assets.set(id, rec);
    }
  }
  assetsReady() { this.syncAssets(); return Promise.all([...this.assets.values()].map(a => a.promise)); }
  asset(id) { const a = id && this.assets.get(id); return a && a.ready && a.tex ? a : null; }
  builtin(name) {
    if (!this.builtins[name]) { const c = icons.drawBuiltin(name); if (c) this.builtins[name] = { tex: webgl.uploadImage(this.gl, c.canvas), cols: c.cols || 1, rows: c.rows || 1, frames: c.frames || 1, w: c.canvas.width, h: c.canvas.height, luma: false, ready: true }; }
    return this.builtins[name];
  }

  // advance to a frame (re-simulating from 0 if needed)
  seek(frame, onProgress) {
    if (frame < this.frame) this.reset();
    while (this.frame < frame) { this.stepFrame(); if (onProgress && this.frame % 30 === 0) onProgress(this.frame / frame); }
  }
};

// 호환 등록 — 디버그 콘솔과 아직 import 로 바뀌지 않은 곳을 위해 RL 에도 남겨 둔다
Object.assign(RL, { FACE_NAMES, layerCommonSchema, reactSchema, defaultReact, BLEND_ID, defaultProject, newLayer, evalKeys, parseFaces, Engine });
