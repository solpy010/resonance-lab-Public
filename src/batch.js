'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
// Instanced sprite & neon-segment renderers (sizes in document pixels; positions normalized 0..1, y up)

export const SpriteBatch = class {
  constructor(gl, max) {
    this.gl = gl; this.max = max; this.n = 0;
    this.stride = 16; // x,y,w,h | rot,r,g,b | a,shape,soft,glow | outline,pad,pad,pad
    this.data = new Float32Array(max * this.stride);
    const vs = `#version 300 es
    layout(location=0) in vec2 p;
    layout(location=1) in vec4 a0; // x y w h
    layout(location=2) in vec4 a1; // rot r g b
    layout(location=3) in vec4 a2; // a shape soft glow
    layout(location=4) in vec4 a3; // outline
    uniform vec2 res; uniform float pxScale;
    out vec2 lp; out vec4 col; out vec4 sh; out float vpad;
    void main(){
      float pad = 1.0 + a2.w*3.0 + a3.x*2.0;   // room for the glow tail (a2.w) and outline (a3.x)
      vpad = pad;
      vec2 s = a0.zw * pxScale * pad;
      float c = cos(a1.x), sn = sin(a1.x);
      vec2 q = p * 0.5 * s; q = vec2(q.x*c - q.y*sn, q.x*sn + q.y*c);
      vec2 pos = a0.xy*res + q;
      lp = p * pad;
      col = vec4(a1.yzw, a2.x); sh = vec4(a2.yzw, a3.x);
      gl_Position = vec4(pos/res*2.0-1.0, 0.0, 1.0);
    }`;
    const fs = `#version 300 es
    precision highp float;
    in vec2 lp; in vec4 col; in vec4 sh; in float vpad; out vec4 frag;
    float sdTri(vec2 p){ const float k = 1.7320508; p.y += 0.25; p.x = abs(p.x) - 0.866; p.y = p.y + 0.866/k;
      if (p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.0; p.x -= clamp(p.x, -1.732, 0.0); return -length(p)*sign(p.y); }
    float sdHex(vec2 p){ const vec3 k = vec3(-0.866025404, 0.5, 0.577350269); p = abs(p); p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
      p -= vec2(clamp(p.x, -k.z*0.9, k.z*0.9), 0.9); return length(p)*sign(p.y); }
    float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,d.y),0.0); }
    void main(){
      float shape = sh.x, soft = max(sh.y, 0.002), glow = sh.z, outline = sh.w;
      float d;
      if (shape < 0.5) d = sdBox(lp, vec2(1.0));
      else if (shape < 1.5) d = length(lp) - 1.0;
      else if (shape < 2.5) d = sdTri(lp*1.05);
      else if (shape < 3.5) d = abs(length(lp) - 0.78) - 0.22;
      else if (shape < 4.5) d = sdHex(lp);
      else if (shape < 5.5) d = min(sdBox(lp, vec2(1.0, 0.3)), sdBox(lp, vec2(0.3, 1.0)));
      else d = (abs(lp.x) + abs(lp.y) - 1.0) * 0.7071;
      if (outline > 0.0) d = abs(d + outline*0.5) - outline*0.5;
      float aa = shape < 0.5 ? soft*0.5 : soft;
      float a = 1.0 - smoothstep(-aa, 0.0, d);   // core fill (always inside the quad)
      if (glow > 0.0) {
        // smooth box-window aligned to the quad so the glow tail reaches exactly 0 at the edge — no seam
        float edge = 1.0 - smoothstep(vpad*0.80, vpad*0.995, max(abs(lp.x), abs(lp.y)));
        a += glow * exp(-max(d, 0.0)*3.0) * 0.6 * step(0.0, d) * edge;
      }
      frag = col * clamp(a, 0.0, 1.5);   // premultiplied
    }`;
    this.prog = webgl.program(gl, fs, vs);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = this.stride * 4;
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, B, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }
  begin() { this.n = 0; }
  // shape: 0 rect 1 disc 2 triangle 3 ring 4 hex 5 cross 6 diamond ; outline: 0=fill, >0 stroke width (0..1 of radius)
  push(x, y, w, h, rot, r, g, b, a, shape, soft, glow, outline) {
    if (this.n >= this.max) return;
    const o = this.n++ * this.stride, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h; d[o + 4] = rot;
    d[o + 5] = r * a; d[o + 6] = g * a; d[o + 7] = b * a; d[o + 8] = a;
    d[o + 9] = shape; d[o + 10] = soft; d[o + 11] = glow || 0; d[o + 12] = outline || 0;
  }
  flush(target, docW, blend) {
    const gl = this.gl;
    if (!this.n) return;
    webgl.bindTarget(gl, target);
    gl.useProgram(this.prog.p);
    webgl.setUniforms(gl, this.prog, { res: [target.w, target.h], pxScale: target.w / docW });
    webgl.setBlend(gl, blend || 'over');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * this.stride);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
  }
};

// Line segments with material styles (2층 물성): 0 neon(core+halo) 1 tube(3D cylinder) 2 ribbon 3 brush 4 flat 5 beads 6 shadow
export const LINE_STYLES = { neon: 0, tube: 1, ribbon: 2, brush: 3, flat: 4, beads: 5, shadow: 6 };
export const SegBatch = class {
  constructor(gl, max) {
    this.gl = gl; this.max = max; this.n = 0;
    this.stride = 16; // x0,y0,x1,y1 | core,halo,r,g | b,a,white,style | along0, light, pad, pad
    this.data = new Float32Array(max * this.stride);
    const vs = `#version 300 es
    layout(location=0) in vec2 p;
    layout(location=1) in vec4 a0;
    layout(location=2) in vec4 a1;
    layout(location=3) in vec4 a2;
    layout(location=4) in vec4 a3;
    uniform vec2 res; uniform float pxScale;
    out vec2 d; out float L; out vec4 col; out vec4 prm; out vec2 extra; out float vext;
    void main(){
      vec2 P0 = a0.xy*res, P1 = a0.zw*res;
      vec2 dir = P1-P0; float len = max(length(dir), 1e-4); dir/=len;
      vec2 nrm = vec2(-dir.y, dir.x);
      float core = a1.x*pxScale, halo = a1.y*pxScale;
      float ext = core*0.5 + halo*4.5 + 2.0; vext = ext;
      float t = p.x*0.5+0.5;
      vec2 pos = mix(P0 - dir*ext, P1 + dir*ext, t) + nrm * p.y * ext;
      d = vec2(mix(-ext, len+ext, t), p.y*ext); L = len;
      col = vec4(a1.zw, a2.x, a2.y); prm = vec4(core, halo, a2.z, a2.w); extra = vec2(a3.x*pxScale, a3.y);
      gl_Position = vec4(pos/res*2.0-1.0, 0.0, 1.0);
    }`;
    const fs = `#version 300 es
    precision highp float;
    in vec2 d; in float L; in vec4 col; in vec4 prm; in vec2 extra; in float vext; out vec4 frag;
    float h1(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(h1(i),h1(i+vec2(1,0)),u.x), mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),u.x), u.y); }
    void main(){
      float core = max(prm.x, 0.5), halo = prm.y, white = prm.z, style = prm.w;
      float along = clamp(d.x, 0.0, L);
      float dist = length(vec2(d.x-along, d.y));
      float hw = core*0.5;
      float aa = 1.0;
      float inside = 1.0 - smoothstep(hw - aa*0.5, hw + aa*0.5, dist);
      float glowH = halo > 0.01 ? exp(-max(dist - hw, 0.0)/halo) : 0.0;
      // fade the halo to exactly 0 at the quad boundary (sides + caps) so no rectangular seam appears
      float endx = max(max(-d.x, d.x - L), 0.0);
      float win = (1.0 - smoothstep(vext*0.74, vext*0.99, abs(d.y))) * (1.0 - smoothstep(vext*0.74, vext*0.99, endx));
      glowH *= win;
      vec3 c = col.rgb; float A = col.a;
      vec3 rgb; float a;
      if (style < 0.5) {            // neon: white-hot core + coloured halo
        rgb = mix(c, vec3(1.0), white*inside); a = clamp(inside + glowH*0.85, 0.0, 1.0);
        frag = vec4(rgb*a*A, a*A*mix(1.0, 0.6, 1.0-inside)); return;
      }
      float n = clamp(d.y / max(hw, 0.5), -1.0, 1.0);   // signed across-coordinate
      if (style < 1.5) {            // tube: lit cylinder, light from above-left
        float z = sqrt(max(0.0, 1.0 - n*n));
        float diff = max(0.0, n*0.55 + z*0.83);
        float spec = pow(max(0.0, n*0.35 + z*0.94), 28.0) * (0.5 + white);
        rgb = c*(0.18 + 0.9*diff) + vec3(spec)*0.9;
        a = inside;
      } else if (style < 2.5) {     // ribbon: flat band, gradient + bright rims
        float g = n*0.5 + 0.5;
        rgb = mix(c*0.55, c*1.15, g);
        rgb += vec3(1.0) * smoothstep(0.78, 0.95, abs(n)) * (0.35 + white*0.5);
        a = inside;
      } else if (style < 3.5) {     // brush: dry-brush streaks and ragged edges
        float s = vn(vec2((extra.x + along) * 0.045, n*2.2 + 3.0));
        float s2 = vn(vec2((extra.x + along) * 0.012, n*7.0));
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(n) + (s - 0.5)*0.6);
        a = inside * edge * mix(0.55, 1.0, s2);
        rgb = c * (0.75 + 0.5*s);
      } else if (style < 4.5) {     // flat matte
        rgb = c; a = inside;
      } else if (style < 5.5) {     // beads: discs along the path
        float sp = max(core*1.6, 2.0);
        float ph = mod(extra.x + along, sp) - sp*0.5;
        float r = length(vec2(ph, d.y));
        float dsk = 1.0 - smoothstep(hw*0.9 - 0.7, hw*0.9 + 0.7, r);
        float z = sqrt(max(0.0, 1.0 - (r*r)/(hw*hw)));
        rgb = c*(0.35 + 0.75*z) + vec3(pow(z, 12.0))*0.5*(0.5+white);
        a = dsk;
      } else {                      // shadow: soft dark falloff (use with normal blend)
        a = clamp(inside*0.9 + glowH*0.7, 0.0, 1.0); rgb = vec3(0.0);
        frag = vec4(0.0, 0.0, 0.0, a*A); return;
      }
      a += glowH * 0.35 * extra.y;  // optional soft bloom around solid styles
      a = clamp(a, 0.0, 1.0);
      frag = vec4(rgb*a*A, a*A);
    }`;
    this.prog = webgl.program(gl, fs, vs);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = this.stride * 4;
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, B, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }
  begin() { this.n = 0; }
  push(x0, y0, x1, y1, core, halo, r, g, b, a, white, style, along0, bloom) {
    if (this.n >= this.max) return;
    const o = this.n++ * this.stride, d = this.data;
    d[o] = x0; d[o + 1] = y0; d[o + 2] = x1; d[o + 3] = y1; d[o + 4] = core; d[o + 5] = halo;
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = b; d[o + 9] = a; d[o + 10] = white || 0; d[o + 11] = style || 0;
    d[o + 12] = along0 || 0; d[o + 13] = bloom || 0; d[o + 14] = 0; d[o + 15] = 0;
  }
  flush(target, docW, blend) {
    const gl = this.gl;
    if (!this.n) return;
    webgl.bindTarget(gl, target);
    gl.useProgram(this.prog.p);
    webgl.setUniforms(gl, this.prog, { res: [target.w, target.h], pxScale: target.w / docW });
    webgl.setBlend(gl, blend || 'screen');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * this.stride);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
};

// Textured sprites (custom images / video atlases). Positions normalized, sizes in document px.
export const TexBatch = class {
  constructor(gl, max) {
    this.gl = gl; this.max = max; this.n = 0;
    this.stride = 16; // x,y,w,h | rot,r,g,b | a,u0,v0,u1 | v1,lumaAlpha,pad,pad
    this.data = new Float32Array(max * this.stride);
    const vs = `#version 300 es
    layout(location=0) in vec2 p;
    layout(location=1) in vec4 a0; layout(location=2) in vec4 a1; layout(location=3) in vec4 a2; layout(location=4) in vec4 a3;
    uniform vec2 res; uniform float pxScale;
    out vec2 tuv; out vec4 col; out float luma;
    void main(){
      vec2 s = a0.zw * pxScale; float c = cos(a1.x), sn = sin(a1.x);
      vec2 q = p * 0.5 * s; q = vec2(q.x*c - q.y*sn, q.x*sn + q.y*c);
      vec2 t = p*0.5 + 0.5; tuv = vec2(mix(a2.y, a2.w, t.x), mix(a3.x, a2.z, t.y));
      col = vec4(a1.yzw, a2.x); luma = a3.y;
      gl_Position = vec4((a0.xy*res + q)/res*2.0-1.0, 0.0, 1.0);
    }`;
    const fs = `#version 300 es
    precision highp float;
    uniform sampler2D tex; in vec2 tuv; in vec4 col; in float luma; out vec4 frag;
    void main(){ vec4 t = texture(tex, tuv);
      if (luma > 0.5) t.a = max(t.r, max(t.g, t.b));       // video on black → luminance as alpha
      vec3 rgb = t.rgb * col.rgb; float a = t.a * col.a;
      frag = vec4(rgb * a, a); }`;
    this.prog = webgl.program(gl, fs, vs);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = this.stride * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, B, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    gl.bindVertexArray(null);
  }
  begin() { this.n = 0; }
  // uv rect: u0,v0 (bottom-left) .. u1,v1 (top-right) in texture space (texture uploaded with flipY)
  push(x, y, w, h, rot, r, g, b, a, u0, v0, u1, v1, luma) {
    if (this.n >= this.max) return;
    const o = this.n++ * this.stride, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h; d[o + 4] = rot; d[o + 5] = r; d[o + 6] = g; d[o + 7] = b;
    d[o + 8] = a; d[o + 9] = u0; d[o + 10] = v1; d[o + 11] = u1; d[o + 12] = v0; d[o + 13] = luma ? 1 : 0;
  }
  flush(target, docW, tex, blend) {
    const gl = this.gl;
    if (!this.n || !tex) { this.n = 0; return; }
    webgl.bindTarget(gl, target);
    gl.useProgram(this.prog.p);
    webgl.setUniforms(gl, this.prog, { res: [target.w, target.h], pxScale: target.w / docW, tex });
    webgl.setBlend(gl, blend || 'over');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * this.stride);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
};

// 호환 등록 — 디버그 콘솔과 아직 import 로 바뀌지 않은 곳을 위해 RL 에도 남겨 둔다
Object.assign(RL, { SpriteBatch, LINE_STYLES, SegBatch, TexBatch });
