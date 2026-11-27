'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
// Shared hit/pop effect renderer (stateless: everything is a function of the effect's age) — used by 리듬게임 / 오브젝트 유영

RL.FX_TYPES = ['ring', 'rays', 'shards', 'sparks', 'flash'];
RL.easeOutCubic = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// e: { x, y (normalized), age01, size (px), seed, colors[[r,g,b]..], count, types[], intensity, image? {asset} }
RL.drawBurst = function (engine, e) {
  const sb = engine.sprites, sg = engine.segs, A = engine.aspect, docW = engine.docW, docH = engine.docH;
  const a = e.age01; if (a < 0 || a > 1) return;
  const r = webgl.rng(e.seed), pick = () => e.colors[r.int(e.colors.length)];
  const k = e.intensity ?? 1, S = e.size;
  const fade = Math.pow(1 - a, 1.4) * k;
  const px = (v) => v / docH;                      // px → normalized height units
  for (const type of e.types) {
    if (type === 'ring') {
      for (let j = 0; j < 2; j++) {
        const aa = Math.max(0, a - j * 0.12) / (1 - j * 0.12); if (aa <= 0) continue;
        const rad = S * (0.25 + 0.75 * RL.easeOutCubic(aa)), c = pick();
        sb.push(e.x, e.y, rad * 1.3, rad * 1.3, 0, c[0], c[1], c[2], Math.pow(1 - aa, 1.3) * k, 1, 0.012, 0.25, 0.022 + 0.02 * (1 - aa));
      }
    } else if (type === 'rays') {
      const n = 8 + r.int(8), rot = r() * 6.283;
      for (let j = 0; j < n; j++) {
        const ang = rot + j / n * 6.283 + (r() - 0.5) * 0.3, len = S * (0.35 + r() * 0.4);
        const r0 = S * 0.12 + len * 0.6 * RL.easeOutCubic(a), r1 = S * 0.12 + len * RL.easeOutCubic(Math.min(1, a * 1.6));
        const c = pick();
        sg.push(e.x + Math.cos(ang) * px(r0) / A, e.y + Math.sin(ang) * px(r0), e.x + Math.cos(ang) * px(r1) / A, e.y + Math.sin(ang) * px(r1),
          Math.max(1.5, S * 0.012), S * 0.03, c[0], c[1], c[2], fade, 0.8, 0, 0, 0);
      }
    } else if (type === 'shards') {
      const n = Math.max(4, Math.round((e.count || 14) * 0.6));
      for (let j = 0; j < n; j++) {
        const ang = r() * 6.283, sp = 0.4 + r() * 0.6, d = S * 0.6 * sp * RL.easeOutCubic(a);
        const c = pick(), sz = S * (0.05 + r() * 0.06) * (1 - a * 0.6);
        sb.push(e.x + Math.cos(ang) * px(d) / A, e.y + Math.sin(ang) * px(d) - px(S * 0.15 * a * a), sz, sz, ang + a * (r() - 0.5) * 12,
          c[0], c[1], c[2], fade, r() < 0.5 ? 2 : 6, 0.05, 0.25, r() < 0.5 ? 0.25 : 0);
      }
    } else if (type === 'sparks') {
      const n = e.count || 18;
      for (let j = 0; j < n; j++) {
        const ang = r() * 6.283, sp = 0.3 + r() * 0.9, d = S * 0.75 * sp * RL.easeOutCubic(a);
        const c = pick(), sz = S * (0.015 + r() * 0.025);
        sb.push(e.x + Math.cos(ang) * px(d) / A, e.y + Math.sin(ang) * px(d) - px(S * 0.35 * a * a), sz, sz, 0, c[0], c[1], c[2], fade * (0.6 + r() * 0.4), 1, 0.4, 0.8, 0);
      }
    } else if (type === 'flash') {
      if (a < 0.3) { const c = pick(), t = a / 0.3, sz = S * (0.18 + 0.22 * t); sb.push(e.x, e.y, sz, sz, 0, c[0], c[1], c[2], Math.pow(1 - t, 2) * 0.7 * k, 1, 1, 0.35, 0); }
    }
  }
};

// textured burst (custom image / video atlas): plays frames over the life and scales up
RL.drawImageBurst = function (engine, asset, e) {
  const a = e.age01; if (!asset || a < 0 || a > 1) return;
  const frame = asset.frames > 1 ? Math.min(asset.frames - 1, Math.floor(a * asset.frames)) : 0;
  const [u0, v0, u1, v1] = webgl.atlasUV(asset, frame);
  const asp = (asset.w / asset.cols) / (asset.h / asset.rows);
  const sz = e.size * (0.6 + 0.6 * RL.easeOutCubic(a));
  engine.texb.push(e.x, e.y, sz * asp, sz, e.rot || 0, 1, 1, 1, (asset.frames > 1 ? 1 : Math.pow(1 - a, 1.2)) * (e.intensity ?? 1), u0, v0, u1, v1, asset.luma);
};
