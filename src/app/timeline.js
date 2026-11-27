// RESONANCE LAB 화면 — 타임라인 그리기·키프레임 편집
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $ } from './dom.js';
import * as eng from '../engine.js';
import * as registry from '../core/registry.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const timeline = {
  drawTimeline() {
    const c = $('#timeline'), dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight; if (!W || !H || !this.project) return;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = this.project, D = P.duration, X = t => 8 + t / D * (W - 16);
    g.fillStyle = '#0e1013'; g.fillRect(0, 0, W, H);
    // ruler
    g.fillStyle = '#5f656e'; g.font = '10px sans-serif'; g.strokeStyle = '#23272e';
    const stepS = D > 120 ? 10 : D > 40 ? 5 : D > 15 ? 2 : 1;
    for (let s = 0; s <= D; s += stepS) { const x = X(s); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 10); g.stroke(); g.fillText(s + 's', x + 2, 9); }
    // waveform
    const wy = 14, wh = Math.max(20, H * 0.38);
    if (this.audio.peaks) {
      const pk = this.audio.peaks, bins = pk.length / 2, ad = this.audio.buffer.duration;
      g.fillStyle = '#2b3f55';
      for (let px = 0; px < W - 16; px++) {
        const t = px / (W - 16) * D; if (t > ad) break;
        const b = Math.floor(t / ad * bins) * 2; const mn = pk[b], mx = pk[b + 1];
        g.fillRect(8 + px, wy + wh / 2 - mx * wh / 2, 1, Math.max(1, (mx - mn) * wh / 2));
      }
    } else { g.fillStyle = '#3a3f47'; g.fillText('오디오 없음 — 오디오를 불러오면 파형과 타격 검출을 사용할 수 있습니다', 12, wy + wh / 2 + 3); }
    // markers
    for (const m of P.markers) {
      const x = X(m.t), hh = Math.min(1.5, m.s ?? 1) / 1.5 * wh;
      g.fillStyle = m.kind === 'sweep' ? '#7cc4ff' : '#e7b04a'; g.globalAlpha = 0.85;
      g.fillRect(x, wy + wh - hh, 1.5, hh);
      g.beginPath(); g.moveTo(x - 3, wy + wh); g.lineTo(x + 4, wy + wh); g.lineTo(x + 0.5, wy + wh - 5); g.fill();
      g.globalAlpha = 1;
    }
    // keyframe rows
    const rows = [];
    if (P.speedKeys.length) rows.push({ name: '전체 속도', ks: P.speedKeys, keyId: '__speed__', layerId: null });
    const L = this.selLayer();
    if (L) for (const k in L.keys) if (L.keys[k] && L.keys[k].length) {
      const sc = registry.modules[L.type].schema.find(x => x.id === k) || eng.layerCommonSchema.find(x => '_' + x.id === k);
      rows.push({ name: (sc ? sc.label : k), ks: L.keys[k], keyId: k, layerId: L.id });
    }
    let ry = wy + wh + 6;
    g.font = '10px sans-serif';
    this._tlRows = []; const selSet = new Set((this.kfSel || []).map(r => r.key));
    for (const row of rows.slice(0, 8)) {
      this._tlRows.push(Object.assign({ y: ry + 5 }, row));
      g.fillStyle = '#5f656e'; g.fillText(row.name, 10, ry + 8);
      g.strokeStyle = '#2d323a'; g.beginPath(); g.moveTo(X(0), ry + 5); g.lineTo(X(D), ry + 5); g.stroke();
      for (const k of row.ks) {
        const x = X(k.t), on = selSet.has(k);
        g.fillStyle = on ? '#8fd0ff' : '#e7b04a';
        g.beginPath(); g.moveTo(x, ry + 1); g.lineTo(x + 4, ry + 5); g.lineTo(x, ry + 9); g.lineTo(x - 4, ry + 5); g.fill();
        if (on) { g.strokeStyle = '#eafcff'; g.lineWidth = 1; g.stroke(); }
      }
      ry += 13;
    }
    this._tlRowsBottom = ry;
    // rubber-band selection rectangle
    if (this._tlBand) { const r = this._tlBand; g.strokeStyle = '#8fd0ff'; g.fillStyle = 'rgba(143,208,255,0.12)';
      g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); g.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }
    // snap guide (Shift-drag magnet)
    if (this._tlSnapX != null) { g.strokeStyle = '#8fd0ff'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(this._tlSnapX, 0); g.lineTo(this._tlSnapX, H); g.stroke(); g.setLineDash([]); }
    // playhead
    const pt = this.scrubT != null ? this.scrubT : this.t;
    g.strokeStyle = '#f2c879'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(pt), 0); g.lineTo(X(pt), H); g.stroke(); g.lineWidth = 1;
  },
  tlGeom() {
    const c = $('#timeline'), W = c.clientWidth, H = c.clientHeight, D = this.project.duration;
    const wy = 14, wh = Math.max(20, H * 0.38);
    return { W, H, D, wy, wh, X: t => 8 + t / D * (W - 16), invX: x => (x - 8) / (W - 16) * D };
  },
  tlLocal(e) { const r = $('#timeline').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
  tlLocalY(e) { return e.clientY - $('#timeline').getBoundingClientRect().top; },
  kfAt(e) {
    const { x, y } = this.tlLocal(e), g = this.tlGeom(), rows = this._tlRows || [];
    let best = null, bd = 7;
    for (const row of rows) {
      if (Math.abs(y - row.y) > 7) continue;
      for (const k of row.ks) { const d = Math.abs(g.X(k.t) - x); if (d < bd && d < 6.5) { bd = d; best = { arr: row.ks, key: k, keyId: row.keyId, layerId: row.layerId }; } }
    }
    return best;
  },
  tlDown(e) {
    if (e.button !== 0) return;
    const { x, y } = this.tlLocal(e), g = this.tlGeom();
    const inKeyBand = this._tlRows && this._tlRows.length && y >= g.wy + g.wh && y <= (this._tlRowsBottom || 0) + 6;
    this.kfSel = this.kfSel || [];
    if (inKeyBand) {
      const hit = this.kfAt(e);
      if (hit) {
        const inSel = this.kfSel.some(r => r.key === hit.key);
        if (e.shiftKey) { if (inSel) this.kfSel = this.kfSel.filter(r => r.key !== hit.key); else this.kfSel.push(hit); }
        else if (!inSel) this.kfSel = [hit];
        this._tlDrag = { mode: 'move', startX: x, orig: this.kfSel.map(r => ({ r, t: r.key.t })), moved: false };
      } else {
        if (!e.shiftKey) this.kfSel = [];
        this._tlDrag = { mode: 'band', base: this.kfSel.slice() };
        this._tlBand = { x0: x, y0: y, x1: x, y1: y };
      }
      this.drawTimeline();
    } else {
      this._tlDrag = { mode: 'scrub' }; this.pause(); this.scrubT = this._tAt(e); this.drawTimeline();
    }
  },
  tlMove(e) {
    const d = this._tlDrag; if (!d) return;
    const { x, y } = this.tlLocal(e), g = this.tlGeom();
    if (d.mode === 'scrub') { this.scrubT = this._tAt(e); this.drawTimeline(); return; }
    if (d.mode === 'move') {
      const dt = (x - d.startX) / (g.W - 16) * g.D;
      if (Math.abs(dt) > 1e-4) d.moved = true;
      let off = 0; this._tlSnapX = null;
      if (e.shiftKey) {                                   // hold Shift to snap (magnet) like After Effects
        const tol = 10 / (g.W - 16) * g.D, targets = this.snapTargets(d.orig.map(o => o.r.key));
        let best = tol;
        for (const o of d.orig) { const nt = o.t + dt; for (const tg of targets) { const dd = Math.abs(nt - tg); if (dd < best) { best = dd; off = tg - nt; this._tlSnapX = g.X(tg); } } }
      }
      for (const o of d.orig) o.r.key.t = Math.max(0, Math.min(g.D, o.t + dt + off));
      this.drawTimeline();
    } else if (d.mode === 'band') {
      this._tlBand.x1 = x; this._tlBand.y1 = y; this.drawTimeline();
    }
  },
  tlUp(e) {
    const d = this._tlDrag; if (!d) { return; }
    this._tlDrag = null; this._tlSnapX = null;
    const g = this.tlGeom(), fps = this.project.fps;
    if (d.mode === 'scrub') { const t = this.scrubT; this.scrubT = null; this.seekAsync(Math.max(1, Math.round((t || 0) * fps))); return; }
    if (d.mode === 'move') {
      if (d.moved) {
        const arrs = new Set();
        for (const o of d.orig) { o.r.key.t = Math.max(0, Math.min(g.D, Math.round(o.r.key.t * fps) / fps)); arrs.add(o.r.arr); }
        for (const a of arrs) a.sort((p, q) => p.t - q.t);
        this.commitKeys();
      } else this.drawTimeline();
      return;
    }
    if (d.mode === 'band') {
      const b = this._tlBand; this._tlBand = null;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const sel = d.base.slice();
      for (const row of (this._tlRows || [])) {
        if (row.y < y0 - 6 || row.y > y1 + 6) continue;
        for (const k of row.ks) { const x = g.X(k.t); if (x >= x0 && x <= x1 && !sel.some(r => r.key === k)) sel.push({ arr: row.ks, key: k, keyId: row.keyId, layerId: row.layerId }); }
      }
      this.kfSel = sel; this.drawTimeline();
      if (sel.length) this.toast(sel.length + '개 키프레임 선택 — 드래그로 이동, Ctrl+C 복사, Delete 삭제', 1800);
    }
  },
  deleteKeys(refs) {
    if (!refs || !refs.length) return;
    for (const r of refs) { const i = r.arr.indexOf(r.key); if (i >= 0) r.arr.splice(i, 1); }
    // drop now-empty layer key arrays so the row disappears
    for (const r of refs) if (r.arr.length === 0 && r.layerId != null) { const L = this.project.layers.find(l => l.id === r.layerId); if (L && L.keys) for (const k in L.keys) if (L.keys[k] === r.arr) delete L.keys[k]; }
    const gone = new Set(refs.map(r => r.key));
    this.kfSel = (this.kfSel || []).filter(r => !gone.has(r.key));
    this.toast(refs.length + '개 키프레임 삭제', 1200);
    this.commitKeys();
  },
  copyKeys() {
    const sel = this.kfSel || []; if (!sel.length) { this.toast('선택된 키프레임이 없습니다'); return; }
    const minT = Math.min(...sel.map(r => r.key.t));
    this.kfClip = sel.map(r => ({ keyId: r.keyId, dt: r.key.t - minT, v: r.key.v, e: r.key.e }));
    this.toast('키프레임 ' + sel.length + '개 복사 — Ctrl+V로 재생헤드 위치에 붙여넣기', 1800);
  },
  pasteKeys() {
    const clip = this.kfClip; if (!clip || !clip.length) { this.toast('복사된 키프레임이 없습니다'); return; }
    const P = this.project, fps = P.fps, L = this.selLayer(), base = +this.t;
    const newSel = []; const arrs = new Set();
    for (const c of clip) {
      let arr;
      if (c.keyId === '__speed__') arr = P.speedKeys;
      else { if (!L) continue; arr = L.keys[c.keyId] = L.keys[c.keyId] || []; }
      const t = Math.max(0, Math.min(P.duration, Math.round((base + c.dt) * fps) / fps));
      let k = arr.find(x => Math.abs(x.t - t) < 0.5 / fps);
      if (k) { k.v = c.v; k.e = c.e; } else { k = { t, v: c.v, e: c.e }; arr.push(k); }
      newSel.push({ arr, key: k, keyId: c.keyId, layerId: c.keyId === '__speed__' ? null : (L ? L.id : null) });
      arrs.add(arr);
    }
    for (const a of arrs) a.sort((p, q) => p.t - q.t);
    this.kfSel = newSel;
    this.toast(newSel.length + '개 붙여넣기', 1200);
    this.commitKeys();
  },
  snapTargets(exclude) {
    const P = this.project, ex = new Set(exclude), out = [0, P.duration, +this.t];
    for (const m of P.markers) out.push(m.t);
    for (const row of (this._tlRows || [])) for (const k of row.ks) if (!ex.has(k)) out.push(k.t);
    return out;
  },
  commitKeys() {
    this.save(); this.refreshInspectorValues(); this.drawTimeline(); this.needsRender = true;
    if (!this.playing) { clearTimeout(this._resimT); this._resimT = setTimeout(() => { const f = this.engine.frame; this.engine.reset(); this.seekAsync(f); }, 300); }
  },
};
