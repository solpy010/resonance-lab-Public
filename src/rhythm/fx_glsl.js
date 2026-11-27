import { RL } from '../core/rl.js';
// ---------------------------------------------------------------------------
// 셰이더 이펙트 14종 (6 카테고리). 한 번의 그리기에서 최대 FXN개 이펙트를 처리.
// 모든 이펙트는 단위 원(반지름 1) 안에서만 그려짐 → CPU가 반지름·위치를 화면 안으로 제한하면
// 어떤 이펙트도 화면 밖으로 나가지 않음.
// ---------------------------------------------------------------------------
export const FXN = 24;
export const FX_GLSL = `
#define FXN ${FXN}
uniform float N, THK, GLW;
uniform vec2 RES;
uniform vec4 d0[FXN];   // cx, cy (px), R (px), age 0..1
uniform vec4 d1[FXN];   // style, seed, rotation, intensity
uniform vec4 d2[FXN];   // spin, density, unused, unused
uniform vec3 c0[FXN], c1[FXN], c2[FXN];
const float PI = 3.14159265, TAU = 6.2831853;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float eo(float x){ x = clamp(x, 0.0, 1.0); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }
float eob(float x){ x = clamp(x, 0.0, 1.0); float c = 1.9, y = x - 1.0; return 1.0 + (c + 1.0) * y * y * y + c * y * y; }
float wrapA(float a){ return mod(a + PI, TAU) - PI; }
float line(float d, float w, float px){ return smoothstep(w + px, w - px * 0.5, d); }
float glow(float d, float w){ return exp(-d * d / max(w * w, 1e-7)); }
float star4(vec2 q, float k){ return exp(-abs(q.y) * k * 7.0) * exp(-abs(q.x) * k) + exp(-abs(q.x) * k * 7.0) * exp(-abs(q.y) * k); }

// ① 섬광·방사 -----------------------------------------------------------------
vec3 fxSun(vec2 q, float t, float s, vec3 A, vec3 B, vec3 C){
  float g = eo(t / 0.16);
  float ext = mix(0.22, 0.98, g) * mix(1.0, 0.1, smoothstep(0.6, 1.0, t));
  float r = length(q) / ext, a = atan(q.y, q.x); vec2 dir = q / max(length(q), 1e-4);
  float n1 = vn(dir * 3.0 + s * 17.0), n2 = vn(dir * 9.0 + s * 31.0);
  float ray = pow(0.5 + 0.5 * sin(a * 36.0 + n1 * 6.0 + t * 1.2), 7.0 / THK) * (0.35 + 0.65 * n2);
  float ray2 = pow(0.5 + 0.5 * sin(a * 21.0 + n2 * 5.0 - t * 0.8), 12.0 / THK) * n1;
  float L = 0.5 + 0.5 * vn(dir * 5.0 + s * 7.0);
  float rays = (ray + ray2 * 0.9) * smoothstep(L, 0.0, r) * smoothstep(0.0, 0.1, r + 0.03);
  float core = exp(-r * r * 60.0) * 1.1 + exp(-r * r * 12.0) * 0.3;
  float fl = 0.0;                                                   // 흩날리는 불티
  for (int i = 0; i < 10; i++){ float fi = float(i), hs = h11(fi * 7.1 + s * 53.0);
    float an = hs * TAU, rd = mix(0.2, 0.85, h11(fi * 3.3 + s)) * eo(t * 1.6);
    vec2 pp = vec2(cos(an), sin(an)) * rd * ext; float d = length(q - pp);
    fl += glow(d, 0.012 * THK) * (1.0 - smoothstep(0.5, 0.9, t)); }
  return A * core + mix(A, B, smoothstep(0.0, 0.3, r)) * exp(-r * r * 5.0) * 0.35 + mix(B, C, smoothstep(0.2, 0.8, r)) * rays * 1.5 * GLW + mix(A, B, 0.5) * fl;
}
vec3 fxSpike(vec2 q, float t, float s, float px, vec3 A, vec3 B, vec3 C){
  float r = length(q), a = atan(q.y, q.x), a01 = a / TAU + 0.5;
  vec3 col = vec3(0.0);
  for (int L = 0; L < 2; L++){
    float n = L == 0 ? 26.0 : 37.0, x = a01 * n, id = floor(x), f = fract(x) - 0.5;
    float hs = h11(id + s * 91.0 + float(L) * 13.0);
    float r0 = mix(0.04, 0.55, eo(t * (0.8 + hs * 0.9) * 1.25)) * (0.75 + 0.4 * h11(id * 1.7 + s));
    float len = mix(0.12, 0.42, h11(id * 3.1 + s)) * (1.0 - 0.55 * t);
    float r1 = min(r0 + len, 0.97), u = (r - r0) / max(r1 - r0, 1e-3);
    if (u > 0.0 && u < 1.0){
      float off = (h11(id * 9.7 + s) - 0.5) * 0.5;
      float d = abs(f - off) * TAU * r / n;
      float w = (0.006 + 0.016 * h11(id * 5.3)) * pow(sin(PI * u), 0.8) * (1.0 - 0.5 * t) * THK;
      float m = line(d, w, px), gl = glow(d, w * 2.5) * 0.45 * GLW;
      vec3 cc = hs > 0.72 ? C : B;
      col += cc * (m * 0.9 + gl) + A * line(d, w * 0.35, px) * 0.8;
    }
  }
  float early = 1.0 - smoothstep(0.0, 0.42, t);
  col += A * exp(-r * r * 40.0) * early * 2.0;
  col += mix(B, A, 0.4) * early * smoothstep(0.5, 0.05, r) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(a * 13.0 + 3.0 * vn(q * 6.0 + s * 9.0)), 3.0)) * 0.7;
  return col;
}
vec3 fxImpact(vec2 q, float t, float s, float px, vec3 A, vec3 B, vec3 C){
  float pop = t < 0.14 ? eob(t / 0.14) : 1.0;
  float col_ = smoothstep(0.6, 0.86, t);
  float sc = max(0.02, pop * (1.0 - 0.88 * col_));
  q = rot(s * 6.28 + t * 0.4) * q;
  q.y /= max(0.08, 1.0 - 0.8 * col_);
  q /= sc;
  float r = length(q), a = atan(q.y, q.x), a01 = a / TAU + 0.5;
  float n = 9.0;
  float x = a01 * n, id = floor(x), f = fract(x) - 0.5;
  float ls = 0.5 + 0.34 * h11(id + s * 37.0), sh = (h11(id * 2.3 + s) - 0.5) * 0.4;
  float R1 = mix(0.2, ls, pow(max(0.0, 1.0 - abs(f - sh) * 2.0), 1.7));
  float x2 = a01 * n + 0.5, id2 = floor(x2), f2 = fract(x2) - 0.5;
  float ls2 = 0.32 + 0.22 * h11(id2 * 4.1 + s * 11.0);
  float R2 = mix(0.16, ls2, pow(max(0.0, 1.0 - abs(f2) * 2.0), 1.4));
  float R = max(R1, R2);
  float inside = smoothstep(R + px / sc, R - px / sc, r);
  float gr = r / R;
  vec3 cc = mix(A * 1.3, mix(B, C, smoothstep(0.55, 0.98, gr)), smoothstep(0.12, 0.7, gr));
  vec3 res = cc * inside + C * glow(max(r - R, 0.0), 0.05 * THK) * 0.6 * GLW * (1.0 - inside);
  return res * (1.0 - smoothstep(0.86, 1.0, t));
}

// ② 회전·궤도 -----------------------------------------------------------------
vec3 fxVortex(vec2 q, float t, float s, float spin, vec3 A, vec3 B, vec3 C){
  float ext = mix(0.55, 0.97, eo(t * 1.4));
  q = rot(-(t * 2.2 * spin + s * 6.28)) * q;
  float r = length(q), a = atan(q.y, q.x);
  float tw = mix(5.5, 2.2, t);
  float m = 6.0, th = a + tw * r;
  float arm = pow(0.5 + 0.5 * cos(m * th), mix(2.5, 12.0, t) / THK);
  float sel = 0.5 + 0.5 * sin(3.0 * th);
  float rad = smoothstep(ext, ext * 0.35, r) * smoothstep(0.03, 0.22, r);
  float haze = (1.0 - t) * 0.35 * smoothstep(ext, 0.0, r);
  vec3 col = mix(B, C, smoothstep(0.35, 0.65, sel)) * (arm * rad * 1.3 * GLW + haze);
  col += A * smoothstep(0.75, 1.0, arm) * rad * 0.7;
  float st = star4(q * 1.0, 18.0) * 0.9 + exp(-r * r * 500.0) * 2.0;
  col += A * st * (0.6 + 0.4 * (1.0 - t));
  return col * (1.0 - smoothstep(0.85, 1.0, t));
}
vec3 fxAtom(vec2 q, float t, float s, float spin, float px, vec3 A, vec3 B, vec3 C){
  float shrink = 1.0 - 0.8 * smoothstep(0.4, 0.82, t);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 6; k++){
    float fk = float(k), hk = h11(fk * 5.7 + s * 23.0);
    float th = hk * PI + t * (0.8 + hk) * spin * (mod(fk, 2.0) < 1.0 ? 1.0 : -1.0);
    float e = 0.3 + 0.28 * h11(fk * 2.9 + s);
    float R = (0.68 + 0.26 * h11(fk * 8.3 + s)) * eo(t / 0.12 + 0.3) * shrink;
    vec2 p = rot(th) * q;
    vec2 ab = vec2(R, R * e);
    float d = (length(p / ab) - 1.0) * R * e;
    float w = (0.006 + 0.012 * (1.0 - t)) * THK;
    vec3 cc = (k == 1 || k == 4) ? C : B;
    col += cc * (line(abs(d), w, px) * 0.7 + glow(d, w * 3.0) * 0.28 * GLW) + A * line(abs(d), w * 0.3, px) * 0.4;
  }
  float r = length(q);
  col += mix(A, B, 0.6) * exp(-r * r * 30.0) * (1.0 - t) * 0.45;
  float sp = smoothstep(0.35, 0.65, t) * (1.0 - smoothstep(0.85, 1.0, t));
  col += A * star4(q, mix(30.0, 10.0, sp)) * sp * 1.2;
  return col * (1.0 - smoothstep(0.88, 1.0, t));
}

// ③ 꽃잎·날개 -----------------------------------------------------------------
vec3 fxBlade(vec2 q, float t, float s, float spin, vec3 A, vec3 B, vec3 C){
  float open = eo(t * 1.25);
  float rr = length(q), a = atan(q.y, q.x);
  float rt = t * 2.0 * spin + s * 6.28;
  float r0 = mix(0.0, 0.32, open), r1 = mix(0.55, 0.97, open);
  float u = (rr - r0) / max(r1 - r0, 1e-3);
  vec3 col = vec3(0.0);
  if (u > 0.0 && u < 1.0){
    for (int k = 0; k < 4; k++){
      float d = wrapA(a - float(k) * PI * 0.5 - rt - 1.5 * rr);
      float wa = mix(0.62, 0.035, open) * pow(sin(PI * u), 0.7) * THK;
      float fill = smoothstep(wa, wa * 0.25, abs(d));
      float edge = glow(abs(d) - wa * 0.6, 0.04 * THK) * 0.5;
      vec3 cc = mix(C, B, smoothstep(0.1, 0.9, u + 0.3 * sin(float(k) + s * 6.0)));
      col += cc * (fill * mix(1.0, 0.75, open) + edge * GLW);
      col += A * glow(d, wa * 0.18) * (1.0 - u) * 0.6;
    }
  }
  col += A * exp(-rr * rr * 30.0) * (1.0 - open) * 1.6;
  return col * (1.0 - smoothstep(0.8, 1.0, t));
}
vec3 fxPetal(vec2 q, float t, float s, float spin, float px, vec3 A, vec3 B, vec3 C){
  float sc = (1.0 - 0.72 * smoothstep(0.45, 1.0, t)) * mix(0.75, 1.0, eo(t / 0.15));
  float rt = t * 2.6 * spin + s * 6.28;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 5; k++){
    float fk = float(k);
    vec2 p = rot(-(fk * TAU / 5.0 + rt)) * q / sc;
    p.y += 0.65 * p.x * p.x - 0.1;
    vec2 ab = vec2(0.42, 0.17 + 0.05 * h11(fk + s * 7.0));
    vec2 cp = p - vec2(0.45, 0.0);
    float d = (length(cp / ab) - 1.0) * ab.y;
    float w = 0.008 * THK / sc;
    float outline = line(abs(d), w, px / sc) + glow(d, w * 4.0) * 0.45 * GLW;
    float fill = smoothstep(px, -px, d) * mix(0.35, 0.08, t);
    vec3 cc = mix(B, C, smoothstep(-0.3, 0.6, cp.x + 0.2 * sin(fk * 2.0 + s)));
    col += cc * (outline + fill) + A * line(abs(d), w * 0.35, px / sc) * 0.4;
  }
  col += A * exp(-dot(q, q) / (sc * sc) * 40.0) * 0.9;
  return col * (1.0 - smoothstep(0.85, 1.0, t));
}

// ④ 원·버블 -------------------------------------------------------------------
vec3 ball(vec2 q, vec2 c, float rad, vec3 cc, vec3 hi, float px){
  if (rad < 2e-3) return vec3(0.0);
  vec2 p = (q - c) / rad; float d = length(p);
  float inside = smoothstep(1.0 + px / rad, 1.0 - px / rad, d);
  float body = 0.25 + 0.75 * pow(d, 3.0);
  float spec = exp(-dot(p - vec2(-0.35, 0.38), p - vec2(-0.35, 0.38)) * 16.0);
  return (cc * body + hi * spec * 0.9) * inside + cc * glow(max(d - 1.0, 0.0), 0.35) * 0.35;
}
vec3 fxBubble(vec2 q, float t, float s, float px, float dens, vec3 A, vec3 B, vec3 C){
  vec3 col = vec3(0.0);
  float big = 0.26 * eob(t / 0.16) * (1.0 - 0.6 * smoothstep(0.7, 1.0, t));
  col += ball(q, vec2(0.0), big, B, A, px);
  int n = int(clamp(12.0 * dens, 3.0, 24.0));
  for (int i = 0; i < 24; i++){
    if (i >= n) break;
    float fi = float(i), hs = h11(fi * 4.3 + s * 61.0);
    float an = hs * TAU + s, dd = mix(0.32, 0.6, h11(fi * 1.9 + s)) * (1.0 + 0.2 * t);
    float rad = mix(0.035, 0.12, pow(h11(fi * 7.7 + s), 1.5));
    vec2 c = vec2(cos(an), sin(an)) * dd;
    float born = h11(fi * 3.1) * 0.15, die = 0.42 + 0.35 * h11(fi * 9.1 + s);
    float g = eob((t - born) / 0.12);
    if (t < die) col += ball(q, c, rad * g, h11(fi * 5.5 + s) > 0.65 ? C : B, A, px);
    else { float rt = (t - die) / 0.25; if (rt < 1.0){ float d = abs(length(q - c) - rad * (1.0 + rt * 1.6)); col += mix(A, B, 0.3) * glow(d, 0.012 * THK) * (1.0 - rt) * 0.9;
      for (int j = 0; j < 4; j++){ float aj = float(j) * 1.57 + hs * 3.0; vec2 pj = c + vec2(cos(aj), sin(aj)) * rad * (1.0 + rt * 2.2); col += C * glow(length(q - pj), 0.008) * (1.0 - rt); } } }
  }
  float hr = smoothstep(0.55, 1.0, t);
  if (hr > 0.0){ float rr = mix(0.25, 0.8, eo(hr)); col += mix(A, B, 0.25) * glow(length(q) - rr, mix(0.06, 0.14, hr)) * (1.0 - hr) * 0.9; }
  return col * (1.0 - smoothstep(0.9, 1.0, t));
}
vec3 fxRings(vec2 q, float t, float s, float px, float dens, vec3 A, vec3 B, vec3 C){
  vec3 col = vec3(0.0);
  int n = int(clamp(14.0 * dens, 4.0, 28.0));
  for (int i = 0; i < 28; i++){
    if (i >= n) break;
    float fi = float(i), hs = h11(fi * 6.1 + s * 41.0);
    float rho = mix(0.07, 0.3, pow(h11(fi * 2.7 + s), 1.3));
    float pr = (0.9 - rho) * sqrt(h11(fi * 8.9 + s));
    float an = h11(fi * 1.3 + s * 3.0) * TAU;
    vec2 c = vec2(cos(an), sin(an)) * pr;
    float born = hs * 0.25, g = eo((t - born) / 0.3);
    float die = 0.65 + 0.3 * h11(fi * 4.4);
    float f = 1.0 - smoothstep(die - 0.15, die, t);
    float d = abs(length(q - c) - rho * mix(0.3, 1.0, g));
    float w = 0.009 * THK;
    vec3 cc = hs < 0.33 ? A : hs < 0.66 ? B : C;
    col += (cc * (line(d, w, px) + glow(d, w * 3.5) * 0.5 * GLW) + vec3(1.0) * line(d, w * 0.3, px) * 0.4 * (1.0 - t)) * f * step(born, t);
  }
  return col;
}
vec3 fxEmber(vec2 q, float t, float s, float px, float dens, vec3 A, vec3 B, vec3 C){
  vec3 col = vec3(0.0);
  int n = int(clamp(20.0 * dens, 5.0, 40.0));
  for (int i = 0; i < 40; i++){
    if (i >= n) break;
    float fi = float(i), hs = h11(fi * 3.7 + s * 29.0);
    float an = h11(fi * 5.1 + s) * TAU;
    float d0 = 0.28 * sqrt(h11(fi * 2.2 + s)), d1 = min(0.88, d0 * (1.6 + 1.6 * hs));
    float rad = mix(0.018, 0.085, pow(h11(fi * 6.6 + s), 2.0)) * (1.0 - 0.5 * t);
    vec2 c = vec2(cos(an), sin(an)) * mix(d0, d1, eo(t * 1.2));
    float dd = length(q - c);
    float f = 1.0 - smoothstep(0.55 + 0.35 * hs, 1.0, t);
    vec3 cc = mix(C, B, h11(fi * 9.3 + s));
    if (hs < 0.62) col += (A * line(dd, rad * 0.5, px) * 1.2 + cc * glow(dd, rad * 1.4) * 1.1 * GLW) * f;
    else { float d = abs(dd - rad); col += (cc * line(d, 0.006 * THK, px) + mix(A, cc, 0.5) * glow(d, 0.02) * 0.4) * f; }
  }
  float r = length(q);
  col += mix(A, B, 0.5) * exp(-r * r * 22.0) * (1.0 - smoothstep(0.0, 0.5, t)) * 1.3;
  return col;
}

// ⑤ 에너지·유체 ---------------------------------------------------------------
vec3 fxPlasma(vec2 q, float t, float s, float spin, float px, vec3 A, vec3 B, vec3 C){
  float r = length(q), a = atan(q.y, q.x);
  float Ro = 0.42 * eob(t / 0.12) * (1.0 - 0.9 * smoothstep(0.42, 0.82, t));
  vec3 col = vec3(0.0);
  if (r < Ro * 1.15){
    vec2 p = rot(r * 6.0 - t * 4.0 * spin) * q / max(Ro, 1e-3);
    float v = fbm(p * 2.5 + s * 13.0);
    float fil = pow(abs(sin(v * 14.0 + t * 3.0)), 6.0 / THK);
    float d = r / max(Ro, 1e-3);
    float inside = smoothstep(1.0 + px / Ro, 1.0 - px / Ro, d);
    col += (B * (0.45 + 0.9 * fil) + A * exp(-d * d * 5.0) * 1.4) * inside;
    col += mix(B, C, 0.4) * glow(d - 1.0, 0.08) * 0.8;
  }
  float grow = eo((t - 0.08) * 1.6);
  for (int i = 0; i < 16; i++){
    float fi = float(i), hs = h11(fi * 7.3 + s * 17.0);
    float ph = fi / 16.0 * TAU + hs * 0.3;
    float tip = min(0.95, Ro + (0.25 + 0.35 * hs) * grow + 0.2 * smoothstep(0.4, 0.8, t));
    float u = (r - Ro) / max(tip - Ro, 1e-3);
    if (u < 0.0 || u > 1.0) continue;
    float wob = 0.14 * sin(r * 13.0 + fi * 2.1 + t * 4.0) * u;
    float d = abs(wrapA(a - ph - wob)) * r;
    float w = 0.006 * THK * (1.0 - u * 0.7);
    col += (mix(B, C, u) * (line(d, w, px) + glow(d, w * 3.0) * 0.4 * GLW)) * (1.0 - smoothstep(0.85, 1.0, t));
    col += A * glow(length(q - vec2(cos(ph + wob), sin(ph + wob)) * tip), 0.012) * grow * 0.7;
  }
  float sp = smoothstep(0.55, 0.8, t) * (1.0 - smoothstep(0.88, 1.0, t));
  col += A * (star4(q, 14.0) * 0.8 + exp(-r * r * 200.0) * 1.5) * sp;
  return col;
}
vec3 fxInk(vec2 q, float t, float s, float Rpx, vec3 A, vec3 B, vec3 C){
  float ext = mix(0.35, 0.96, eo(t * 1.4)) * (1.0 - 0.85 * smoothstep(0.5, 1.0, t));
  float r = length(q); vec2 dir = q / max(r, 1e-4);
  float n = fbm(dir * 2.2 + s * 10.0 + vec2(r * 2.0 - t, 0.3));
  float edge = ext * (0.5 + 0.5 * n);
  float mask = smoothstep(edge, edge * 0.55, r);
  vec2 sw = q * 3.0 + vec2(fbm(dir * 5.0 + r * 3.0 + s * 4.0), fbm(dir * 5.0 - r * 2.0 + s * 8.0)) * 2.0;
  float w = fbm(sw + s * 3.0 - t * 0.6);
  float streak = pow(fbm(dir * 7.0 + vec2(r * 1.4, -r) + s * 2.0), 1.5);
  vec3 col = mix(B, C, smoothstep(0.45, 0.65, w)) * (0.4 + 1.2 * streak);
  col += A * smoothstep(0.62, 0.75, w) * 0.8;
  float dis = smoothstep(0.3, 0.88, t);
  float grain = h21(floor(q * Rpx * 0.5) + floor(s * 1000.0));
  float keep = mix(1.0, step(dis * 0.97, grain * (0.6 + 0.6 * fbm(q * 6.0 + s))), dis);
  return col * mask * keep * (1.0 - smoothstep(0.9, 1.0, t)) * 1.1;
}
vec3 fxRibbon(vec2 q, float t, float s, float px, float dens, vec3 A, vec3 B, vec3 C){
  vec3 col = vec3(0.0);
  float x = q.x / 0.95, win = smoothstep(1.0, 0.85, length(vec2(x, q.y / 0.55)));
  int n = int(clamp(9.0 * dens, 3.0, 18.0));
  for (int i = 0; i < 18; i++){
    if (i >= n) break;
    float fi = float(i), h1 = h11(fi * 3.3 + s * 19.0), h2 = h11(fi * 7.1 + s), h3 = h11(fi * 1.7 + s * 5.0);
    float die = 0.45 + 0.5 * h1;
    float f = 1.0 - smoothstep(die - 0.18, die, t);
    if (f <= 0.0) continue;
    float k = 3.0 + 3.0 * h2, amp = (0.1 + 0.18 * h3) * (1.0 - 0.4 * t), ph = h1 * TAU + t * (1.5 + h2 * 2.0) * (h3 > 0.5 ? 1.0 : -1.0);
    float off = (h11(fi * 5.9 + s) - 0.5) * 0.22;
    float env = 1.0 - x * x;
    float y = off * env + amp * sin(k * x + ph) * env;
    float dy = (amp * (k * cos(k * x + ph) * env - 2.0 * x * sin(k * x + ph)) - 2.0 * x * off) / 0.95;
    float d = abs(q.y - y) / sqrt(1.0 + dy * dy);
    float tws = abs(sin(k * 0.6 * x + ph * 1.3 + fi));
    float w = (0.003 + 0.02 * tws) * THK * env;
    vec3 cc = mod(fi, 2.0) < 1.0 ? B : C;
    col += (cc * (line(d, w, px) * 0.75 + glow(d, w * 2.5 + 0.004) * 0.45 * GLW) + A * line(d, w * 0.25, px) * (1.0 - tws) * 0.8) * f;
  }
  return col * win;
}

// ⑥ 조각·컨페티 ---------------------------------------------------------------
vec3 fxConfetti(vec2 q, float t, float s, float px, float dens, vec3 A, vec3 B, vec3 C){
  vec3 col = vec3(0.0);
  int n = int(clamp(22.0 * dens, 5.0, 44.0));
  for (int i = 0; i < 44; i++){
    if (i >= n) break;
    float fi = float(i), hs = h11(fi * 2.9 + s * 37.0);
    float sz = mix(0.035, 0.085, h11(fi * 6.3 + s));
    float pr = (0.86 - sz * 1.5) * sqrt(h11(fi * 4.7 + s));
    float an = h11(fi * 8.1 + s * 2.0) * TAU;
    vec2 c = vec2(cos(an), sin(an)) * pr * (1.0 + 0.06 * t) - vec2(0.0, 0.04 * t * t);
    float born = h11(fi * 1.1) * 0.12, die = 0.4 + 0.55 * h11(fi * 9.9 + s);
    float g = eob((t - born) / 0.12) * (1.0 - smoothstep(die - 0.06, die, t));
    if (g <= 0.0) continue;
    vec2 p = rot((hs - 0.5) * 0.9 + t * (hs - 0.5)) * (q - c);
    vec2 b = vec2(sz * g);
    float rr = sz * 0.22;
    float d = length(max(abs(p) - b + rr, 0.0)) - rr;
    vec3 cc = hs < 0.3 ? A : hs < 0.55 ? B : hs < 0.8 ? C : mix(A, C, 0.55);
    col += cc * (smoothstep(px, -px, d) * 0.95 + exp(-max(d, 0.0) * 40.0) * 0.18 * GLW);
  }
  return col;
}

vec3 effect(int st, vec2 q, float t, float s, float spin, float dens, float px, float Rpx, vec3 A, vec3 B, vec3 C){
  if (st == 0) return fxSun(q, t, s, A, B, C);
  if (st == 1) return fxSpike(q, t, s, px, A, B, C);
  if (st == 2) return fxImpact(q, t, s, px, A, B, C);
  if (st == 3) return fxVortex(q, t, s, spin, A, B, C);
  if (st == 4) return fxAtom(q, t, s, spin, px, A, B, C);
  if (st == 5) return fxBlade(q, t, s, spin, A, B, C);
  if (st == 6) return fxPetal(q, t, s, spin, px, A, B, C);
  if (st == 7) return fxBubble(q, t, s, px, dens, A, B, C);
  if (st == 8) return fxRings(q, t, s, px, dens, A, B, C);
  if (st == 9) return fxEmber(q, t, s, px, dens, A, B, C);
  if (st == 10) return fxPlasma(q, t, s, spin, px, A, B, C);
  if (st == 11) return fxInk(q, t, s, Rpx, A, B, C);
  if (st == 12) return fxRibbon(q, t, s, px, dens, A, B, C);
  return fxConfetti(q, t, s, px, dens, A, B, C);
}
void main(){
  vec2 P = uv * RES;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < FXN; i++){
    if (float(i) >= N) break;
    vec4 a = d0[i];
    vec2 q = (P - a.xy) / a.z;
    if (dot(q, q) >= 1.0) continue;
    vec4 b = d1[i];
    int st = int(b.x + 0.5);
    q = rot(st == 12 ? (fract(b.z / TAU) - 0.5) * 0.35 : b.z) * q;
    float px = 1.2 / a.z;
    vec3 c = effect(st, q, a.w, b.y, d2[i].x, d2[i].y, px, a.z, c0[i], c1[i], c2[i]);
    acc += max(c, 0.0) * b.w * smoothstep(1.0, 0.9, length(q));
  }
  float al = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0);
  frag = vec4(acc, al);
}`;
