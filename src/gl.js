'use strict';
// RESONANCE LAB — WebGL2 helpers (clean-room implementation)
const RL = window.RL = window.RL || {};

RL.VS = `#version 300 es
layout(location=0) in vec2 p;
out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

RL.HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
out vec4 frag;
`;

RL.createGL = function (canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2를 사용할 수 없습니다. Chrome 또는 Edge 최신 버전에서 열어 주세요.');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('이 GPU는 부동소수 렌더타깃(EXT_color_buffer_float)을 지원하지 않습니다.');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.DITHER);
  // full-screen triangle
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl._quad = vao;
  gl._maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  gl._pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
  return gl;
};

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
    console.error(log + '\n' + lines);
    throw new Error('셰이더 컴파일 실패: ' + log);
  }
  return s;
}

RL.program = function (gl, fsBody, vsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc || RL.VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, vsSrc ? fsBody : RL.HEAD + fsBody));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('프로그램 링크 실패: ' + gl.getProgramInfoLog(p));
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
  }
  return { p, uniforms };
};

RL.setUniforms = function (gl, prog, u) {
  let unit = 0;
  for (const k in u) {
    const info = prog.uniforms[k];
    if (!info) continue;
    const v = u[k];
    const L = info.loc;
    switch (info.type) {
      case gl.FLOAT: info.size > 1 ? gl.uniform1fv(L, v) : gl.uniform1f(L, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(L, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(L, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(L, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(L, false, v); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(L, v | 0); break;
      case gl.SAMPLER_2D:
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v && v.tex ? v.tex : v);
        gl.uniform1i(L, unit); unit++; break;
      default: break;
    }
  }
};

RL.target = function (gl, w, h, opts) {
  opts = opts || {};
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const fmt = opts.format || 'rgba16f';
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const filter = opts.nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (fmt === 'rgba8') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
};

RL.pair = function (gl, w, h, opts) {
  const o = { a: RL.target(gl, w, h, opts), b: RL.target(gl, w, h, opts) };
  o.swap = function () { const t = o.a; o.a = o.b; o.b = t; };
  o.w = o.a.w; o.h = o.a.h; o.texel = o.a.texel;
  return o;
};

RL.uploadImage = function (gl, img) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};
// uv rect for frame k of an atlas (cols×rows, row 0 = top of the image)
RL.atlasUV = function (a, k) {
  const n = Math.max(1, a.frames || 1); k = ((Math.floor(k) % n) + n) % n;
  const c = k % a.cols, r = Math.floor(k / a.cols);
  return [c / a.cols, 1 - (r + 1) / a.rows, (c + 1) / a.cols, 1 - r / a.rows];
};

RL.setWrap = function (gl, t, repeat) {
  if (!t) return;
  if (t.a) { RL.setWrap(gl, t.a, repeat); RL.setWrap(gl, t.b, repeat); return; }
  if (t.repeat === repeat) return;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  t.repeat = repeat;
};

RL.freeTarget = function (gl, t) {
  if (!t) return;
  if (t.a) { RL.freeTarget(gl, t.a); RL.freeTarget(gl, t.b); return; }
  gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo);
};

RL.bindTarget = function (gl, t) {
  if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
};

RL.clear = function (gl, t, c) {
  RL.bindTarget(gl, t);
  c = c || [0, 0, 0, 0];
  gl.clearColor(c[0], c[1], c[2], c[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

RL.draw = function (gl, prog, t, u, blend) {
  RL.bindTarget(gl, t);
  gl.useProgram(prog.p);
  RL.setUniforms(gl, prog, u || {});
  RL.setBlend(gl, blend);
  gl.bindVertexArray(gl._quad);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
};

RL.setBlend = function (gl, mode) {
  if (!mode) { gl.disable(gl.BLEND); return; }
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  if (mode === 'over') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);           // premultiplied over
  else if (mode === 'add') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  else if (mode === 'screen') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  else if (mode === 'mult') gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
};

// ---------- deterministic random ----------
RL.rng = function (seed) {
  let a = (seed >>> 0) || 1;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (n) => Math.floor(f() * n);
  return f;
};
RL.hashSeed = function (...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  return h >>> 0;
};

// value noise + curl (deterministic CPU)
RL.noise = (function () {
  const P = new Uint8Array(512);
  const r = RL.rng(1337);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const G = new Float32Array(512);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; G[i * 2] = Math.cos(a); G[i * 2 + 1] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function grad(ix, iy, x, y) { const h = P[(P[ix & 255] + iy) & 511] & 255; return G[h * 2] * x + G[h * 2 + 1] * y; }
  function n2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fade(fx), v = fade(fy);
    const a = grad(ix, iy, fx, fy), b = grad(ix + 1, iy, fx - 1, fy), c = grad(ix, iy + 1, fx, fy - 1), d = grad(ix + 1, iy + 1, fx - 1, fy - 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function n3(x, y, z) { // cheap 3rd dim: blend two slices
    const iz = Math.floor(z), fz = z - iz, w = fade(fz);
    const a = n2(x + iz * 17.13, y + iz * 31.7), b = n2(x + (iz + 1) * 17.13, y + (iz + 1) * 31.7);
    return a + (b - a) * w;
  }
  function curl(x, y, z) {
    const e = 0.01;
    const dx = (n3(x, y + e, z) - n3(x, y - e, z)) / (2 * e);
    const dy = (n3(x + e, y, z) - n3(x - e, y, z)) / (2 * e);
    return [dx, -dy];
  }
  return { n2, n3, curl };
})();

// GLSL noise library (hash-based, deterministic)
RL.GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return s; }
vec3 hex2rgb(vec3 c){ return c; }
// periodic value noise: lattice wraps every 'per' cells in x (per must be an integer)
float vnoiseP(vec2 p, float per){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(hash12(vec2(x0,i.y)),hash12(vec2(x1,i.y)),u.x), mix(hash12(vec2(x0,i.y+1.)),hash12(vec2(x1,i.y+1.)),u.x), u.y); }
float fbmP(vec2 p, float per){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoiseP(p, per); p=p*2.0+vec2(0.0, 7.3); per*=2.0; a*=.5; } return s; }
float wrapDx(float dx, float on){ return on > 0.5 ? dx - floor(dx + 0.5) : dx; }
`;

RL.hexToRgb = function (hex) {
  hex = String(hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
RL.rgbToHex = function (r, g, b) {
  const t = x => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');
  return '#' + t(r) + t(g) + t(b);
};
RL.hsvToRgb = function (h, s, v) {
  h = ((h % 360) + 360) % 360 / 60; s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) [r, g, b] = [c, x, 0]; else if (h < 2) [r, g, b] = [x, c, 0]; else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c]; else if (h < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
};
RL.rgbToHsv = function (r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
  return [(h + 360) % 360, mx ? d / mx * 100 : 0, mx * 100];
};
RL.srgbToLin = c => c.map(x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

// easing
RL.ease = {
  linear: t => t,
  expoOut: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  quintOut: t => 1 - Math.pow(1 - t, 5),
  expoIn: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  inOut: t => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
  hold: t => 0,
};
