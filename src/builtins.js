'use strict';
import { RL } from './core/rl.js';
// Built-in line-art graphics drawn in code (white strokes → tinted in the shader). Replaceable by user images/videos.

export const drawBuiltin = function (name) {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const line = (g, w) => { g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; };

  function guitar(g, cx, cy, S, lw) {
    g.save(); g.translate(cx, cy); g.scale(S, S); line(g, lw / S);
    // body (P-bass style, headstock up)
    g.beginPath();
    g.moveTo(0, 0.92);
    g.bezierCurveTo(0.42, 0.92, 0.54, 0.70, 0.42, 0.52);
    g.bezierCurveTo(0.31, 0.40, 0.28, 0.30, 0.36, 0.18);
    g.bezierCurveTo(0.45, 0.06, 0.34, -0.06, 0.22, 0.02);
    g.bezierCurveTo(0.15, 0.07, 0.11, 0.13, 0.08, 0.16);
    g.lineTo(-0.08, 0.16);
    g.bezierCurveTo(-0.14, 0.08, -0.30, -0.16, -0.41, -0.01);
    g.bezierCurveTo(-0.47, 0.10, -0.34, 0.26, -0.33, 0.34);
    g.bezierCurveTo(-0.31, 0.43, -0.54, 0.62, -0.45, 0.77);
    g.bezierCurveTo(-0.36, 0.93, -0.14, 0.92, 0, 0.92);
    g.closePath();
    g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1; g.stroke();
    // pickguard line
    g.beginPath(); g.moveTo(-0.30, 0.30); g.bezierCurveTo(-0.20, 0.55, 0.05, 0.60, 0.22, 0.48); g.stroke();
    // neck + frets
    g.strokeRect(-0.045, -0.72, 0.09, 0.88);
    g.lineWidth = lw / S * 0.45;
    for (let i = 0; i < 9; i++) { const y = -0.68 + i * 0.09; g.beginPath(); g.moveTo(-0.045, y); g.lineTo(0.045, y); g.stroke(); }
    g.lineWidth = lw / S;
    // headstock
    g.beginPath(); g.moveTo(-0.05, -0.72); g.lineTo(-0.085, -0.98); g.lineTo(0.075, -1.0); g.lineTo(0.05, -0.72); g.closePath(); g.stroke();
    for (let i = 0; i < 2; i++) { for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.12, -0.80 - i * 0.1, 0.03, 0, Math.PI * 2); g.stroke(); } }
    // pickup + bridge
    g.strokeRect(-0.10, 0.40, 0.20, 0.06); g.strokeRect(-0.09, 0.68, 0.18, 0.05);
    // strings
    g.lineWidth = lw / S * 0.35;
    for (let i = 0; i < 4; i++) { const x = -0.03 + i * 0.02; g.beginPath(); g.moveTo(x, 0.70); g.lineTo(x * 0.9, -0.74); g.stroke(); }
    // knobs
    g.lineWidth = lw / S;
    for (const [x, y] of [[0.22, 0.66], [0.30, 0.56]]) { g.beginPath(); g.arc(x, y, 0.035, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  function gong(g, cx, cy, S, lw) {
    g.save(); g.translate(cx, cy); g.scale(S, S); line(g, lw / S);
    g.beginPath(); g.arc(0, 0.08, 0.78, 0, Math.PI * 2); g.globalAlpha = 0.14; g.fill(); g.globalAlpha = 1; g.stroke();
    g.beginPath(); g.arc(0, 0.08, 0.56, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0.08, 0.18, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-0.25, -0.66); g.quadraticCurveTo(0, -1.0, 0.25, -0.66); g.stroke();
    g.restore();
  }
  function buk(g, cx, cy, S, lw) {
    g.save(); g.translate(cx, cy); g.scale(S, S); line(g, lw / S);
    g.beginPath(); g.ellipse(0, -0.38, 0.72, 0.24, 0, 0, Math.PI * 2); g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1; g.stroke();
    g.beginPath(); g.moveTo(-0.72, -0.38); g.bezierCurveTo(-0.82, 0.05, -0.82, 0.30, -0.70, 0.48); g.stroke();
    g.beginPath(); g.moveTo(0.72, -0.38); g.bezierCurveTo(0.82, 0.05, 0.82, 0.30, 0.70, 0.48); g.stroke();
    g.beginPath(); g.ellipse(0, 0.48, 0.70, 0.22, 0, 0, Math.PI); g.stroke();
    g.lineWidth = lw / S * 0.5;
    g.beginPath(); for (let i = 0; i <= 8; i++) { const x = -0.66 + i * 0.165, y = i % 2 ? 0.44 : -0.20; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.lineWidth = lw / S;
    g.beginPath(); g.moveTo(0.35, -0.95); g.lineTo(0.1, -0.45); g.stroke(); g.beginPath(); g.arc(0.37, -0.98, 0.06, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function janggu(g, cx, cy, S, lw) {
    g.save(); g.translate(cx, cy); g.scale(S, S); line(g, lw / S);
    g.beginPath(); g.ellipse(-0.66, 0, 0.18, 0.56, 0, 0, Math.PI * 2); g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1; g.stroke();
    g.beginPath(); g.ellipse(0.66, 0, 0.18, 0.56, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-0.66, -0.56); g.bezierCurveTo(-0.30, -0.50, -0.12, -0.10, 0, -0.10); g.bezierCurveTo(0.12, -0.10, 0.30, -0.50, 0.66, -0.56); g.stroke();
    g.beginPath(); g.moveTo(-0.66, 0.56); g.bezierCurveTo(-0.30, 0.50, -0.12, 0.10, 0, 0.10); g.bezierCurveTo(0.12, 0.10, 0.30, 0.50, 0.66, 0.56); g.stroke();
    g.lineWidth = lw / S * 0.45;
    g.beginPath(); for (let i = 0; i <= 10; i++) { const x = -0.62 + i * 0.124, y = i % 2 ? 0.50 : -0.50; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.restore();
  }
  function kkwaeng(g, cx, cy, S, lw) {
    g.save(); g.translate(cx, cy); g.scale(S, S); line(g, lw / S);
    g.beginPath(); g.arc(-0.12, 0.1, 0.55, 0, Math.PI * 2); g.globalAlpha = 0.14; g.fill(); g.globalAlpha = 1; g.stroke();
    g.beginPath(); g.arc(-0.12, 0.1, 0.40, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-0.12, -0.45); g.quadraticCurveTo(-0.12, -0.85, 0.2, -0.85); g.stroke();
    g.beginPath(); g.moveTo(0.25, 0.85); g.lineTo(0.85, -0.25); g.stroke();
    g.beginPath(); g.arc(0.9, -0.33, 0.1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  if (name === 'guitar' || name === 'guitarGlow') {
    const c = mk(512, 512), g = c.getContext('2d');
    if (name === 'guitarGlow') { g.filter = 'blur(14px)'; guitar(g, 256, 262, 230, 26); g.filter = 'blur(5px)'; guitar(g, 256, 262, 230, 14); }
    else guitar(g, 256, 262, 230, 9);
    return { canvas: c };
  }
  if (name === 'instruments') {
    const S = 256, c = mk(S * 5, S), g = c.getContext('2d');
    const fns = [gong, buk, janggu, kkwaeng, (gg, x, y, s, l) => guitar(gg, x, y + 6, s * 1.05, l)];
    fns.forEach((f, i) => f(g, i * S + S / 2, S / 2, S * 0.42, 6));
    return { canvas: c, cols: 5, rows: 1, frames: 5 };
  }
  if (name === 'note') {
    const c = mk(128, 128), g = c.getContext('2d'); line(g, 9);
    g.beginPath(); g.moveTo(64, 112); g.lineTo(14, 22); g.lineTo(114, 22); g.closePath(); g.stroke();
    return { canvas: c };
  }
  return null;
};

// 호환 등록 — 디버그 콘솔과 아직 import 로 바뀌지 않은 곳을 위해 RL 에도 남겨 둔다
Object.assign(RL, { drawBuiltin });
