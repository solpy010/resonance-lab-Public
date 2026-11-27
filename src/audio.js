'use strict';
import { RL } from './core/rl.js';
// 3층: 오디오 불러오기 · 파형 · 온셋(타격) 검출 → 마커

RL.Audio = class {
  constructor() { this.ctx = null; this.buffer = null; this.src = null; this.peaks = null; this.name = ''; }
  ensureCtx() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); return this.ctx; }
  async load(file) {
    const ctx = this.ensureCtx();
    const ab = await file.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(ab);
    this.name = file.name;
    this.mono = this.toMono(this.buffer);
    this.peaks = this.makePeaks(this.mono, 4000);
    return this.buffer;
  }
  toMono(b) {
    const n = b.length, out = new Float32Array(n);
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / b.numberOfChannels; }
    return out;
  }
  makePeaks(d, bins) {
    const p = new Float32Array(bins * 2), per = Math.max(1, Math.floor(d.length / bins));
    for (let i = 0; i < bins; i++) {
      let mn = 0, mx = 0;
      for (let j = i * per, e = Math.min(d.length, j + per); j < e; j++) { const v = d[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      p[i * 2] = mn; p[i * 2 + 1] = mx;
    }
    return p;
  }
  // energy-flux onset detection
  onsets(opt) {
    if (!this.mono) return [];
    const sr = this.buffer.sampleRate, d = this.mono, hop = 512, win = 1024;
    const band = opt.band || 'full';
    let src = d;
    if (band !== 'full') {
      src = new Float32Array(d.length);
      const fc = band === 'low' ? 180 : 2500;
      const a = Math.exp(-2 * Math.PI * fc / sr);
      let y = 0;
      for (let i = 0; i < d.length; i++) { y = (1 - a) * d[i] + a * y; src[i] = band === 'low' ? y : d[i] - y; }
    }
    const n = Math.floor((src.length - win) / hop);
    const e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; const o = i * hop; for (let j = 0; j < win; j++) { const v = src[o + j]; s += v * v; } e[i] = Math.log(1e-9 + s / win); }
    const flux = new Float32Array(n);
    for (let i = 1; i < n; i++) flux[i] = Math.max(0, e[i] - e[i - 1]);
    const out = [];
    const W = 24, k = 1.2 + (1 - opt.sensitivity) * 3.5, minGap = opt.minGap || 0.08;
    let maxF = 0; for (const f of flux) maxF = Math.max(maxF, f);
    let last = -1e9;
    for (let i = 2; i < n - 2; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - W); j < Math.min(n, i + W); j++) { s += flux[j]; c++; }
      const mean = s / c;
      let v = 0; for (let j = Math.max(0, i - W); j < Math.min(n, i + W); j++) v += (flux[j] - mean) ** 2;
      const thr = mean + k * Math.sqrt(v / c) + 0.05;
      if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
        const t = (i * hop + win / 2) / sr;
        if (t - last >= minGap) { out.push({ t: +t.toFixed(4), s: +Math.min(1.5, 0.3 + flux[i] / maxF * 1.2).toFixed(3) }); last = t; }
      }
    }
    return out;
  }
  play(at) {
    if (!this.buffer) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    this.stop();
    if (at >= this.buffer.duration) return;
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buffer;
    this.src.connect(ctx.destination);
    this.src.start(0, Math.max(0, at));
  }
  stop() { if (this.src) { try { this.src.stop(); } catch (e) { } this.src.disconnect(); this.src = null; } }
};
