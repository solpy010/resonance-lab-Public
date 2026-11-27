// RESONANCE LAB 화면 — 뷰포트 배치·가이드·확대/이동·패널 크기
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $ } from './dom.js';
import * as eng from '../engine.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const stage = {
  // ---------------------------------------------------------------- view
  layoutStage() {
    const vp = $('#viewport'), P = this.project; if (!P) return;
    const aw = vp.clientWidth - 32, ah = vp.clientHeight - 32, a = P.width / P.height;
    let w = aw, hh = aw / a; if (hh > ah) { hh = ah; w = ah * a; }
    const z = this.zoom || 1; w *= z; hh *= z;
    const pan = this.pan || (this.pan = { x: 0, y: 0 });
    if (z <= 1.0001) { pan.x = 0; pan.y = 0; }
    else { const mx = Math.max(0, (w - vp.clientWidth) / 2 + 40), my = Math.max(0, (hh - vp.clientHeight) / 2 + 40); pan.x = Math.max(-mx, Math.min(mx, pan.x)); pan.y = Math.max(-my, Math.min(my, pan.y)); }
    const st = $('#stage'); st.style.width = Math.max(10, w) + 'px'; st.style.height = Math.max(10, hh) + 'px';
    st.style.left = ((vp.clientWidth - w) / 2 + pan.x) + 'px'; st.style.top = ((vp.clientHeight - hh) / 2 + pan.y) + 'px';
    if ($('#zVal')) $('#zVal').textContent = z <= 1.0001 ? '맞춤' : Math.round(z * 100) + '%';
    this.drawGuides();
    const tb = $('#thumb'); tb.width = Math.max(32, Math.round(P.width * 0.1)); tb.height = Math.max(8, Math.round(P.height * 0.1));
    if (tb.width > 480) { tb.height = Math.round(tb.height * 480 / tb.width); tb.width = 480; }
    this.needsRender = true;
  },
  drawGuides() {
    const c = $('#guides'), st = $('#stage');
    const dpr = Math.min(window.devicePixelRatio || 1, 8192 / Math.max(1, st.clientWidth), 8192 / Math.max(1, st.clientHeight));
    c.width = Math.max(1, Math.round(st.clientWidth * dpr)); c.height = Math.max(1, Math.round(st.clientHeight * dpr));
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    if (!this.view.guides) return;
    const n = this.project.faces;
    g.strokeStyle = 'rgba(231,176,74,0.45)'; g.fillStyle = 'rgba(231,176,74,0.8)'; g.lineWidth = 1 * dpr; g.setLineDash([4 * dpr, 4 * dpr]);
    g.font = `${10 * dpr}px sans-serif`;
    for (let i = 0; i < n; i++) {
      const x = i / n * c.width;
      if (i > 0) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
      g.fillText(eng.FACE_NAMES[i], x + 5 * dpr, 13 * dpr);
    }
  },
  drawThumb() {
    const tb = $('#thumb'), g = tb.getContext('2d');
    g.drawImage(this.engine.canvas, 0, 0, tb.width, tb.height);
  },

  // ------------------------------------------------------------ panels
  applyLayout(L) {
    const bs = document.body.style;
    this.layoutSz = { lw: Math.max(200, Math.min(700, L.lw || 300)), rw: Math.max(240, Math.min(820, L.rw || 380)), bh: Math.max(110, Math.min(560, L.bh || 196)) };
    bs.setProperty('--lw', this.layoutSz.lw + 'px'); bs.setProperty('--rw', this.layoutSz.rw + 'px'); bs.setProperty('--bh', this.layoutSz.bh + 'px');
  },
  saveLayout() { try { localStorage.setItem('rlab.layout', JSON.stringify(this.layoutSz)); } catch (e) { } },
  bindSplitters() {
    if (!this.layoutSz) this.applyLayout({});
    const drag = (el, fn) => el.addEventListener('mousedown', e => {
      e.preventDefault(); el.classList.add('drag'); document.body.classList.add('resizing');
      document.body.style.cursor = getComputedStyle(el).cursor;
      const start = { x: e.clientX, y: e.clientY, ...this.layoutSz };
      const mv = ev => { fn(ev, start); this.applyLayout(this.layoutSz); };
      const up = () => { el.classList.remove('drag'); document.body.classList.remove('resizing'); document.body.style.cursor = ''; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this.saveLayout(); this.layoutStage(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    drag($('#splitL'), (e, s) => { this.layoutSz.lw = s.lw + (e.clientX - s.x); });
    drag($('#splitR'), (e, s) => { this.layoutSz.rw = s.rw - (e.clientX - s.x); });
    drag($('#splitB'), (e, s) => { this.layoutSz.bh = s.bh - (e.clientY - s.y); });
    for (const [id, k] of [['#splitL', 'lw'], ['#splitR', 'rw'], ['#splitB', 'bh']]) $(id).addEventListener('dblclick', () => { this.layoutSz[k] = { lw: 300, rw: 380, bh: 196 }[k]; this.applyLayout(this.layoutSz); this.saveLayout(); });
  },

  // ------------------------------------------------------------ zoom / pan
  bindZoom() {
    const vp = $('#viewport');
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    }, { passive: false });
    let pan = null;
    vp.addEventListener('mousedown', e => {
      if (!(e.button === 1 || (e.button === 0 && e.altKey))) return;
      e.preventDefault(); pan = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y }; vp.classList.add('panning'); this.panned = true;
    });
    window.addEventListener('mousemove', e => { if (!pan) return; this.pan.x = pan.px + e.clientX - pan.x; this.pan.y = pan.py + e.clientY - pan.y; this.layoutStage(); });
    window.addEventListener('mouseup', () => { if (pan) { pan = null; vp.classList.remove('panning'); } });
    vp.addEventListener('dblclick', () => this.zoomFit());
    $('#zIn').addEventListener('click', () => this.zoomBy(1.25));
    $('#zOut').addEventListener('click', () => this.zoomBy(0.8));
    $('#zFit').addEventListener('click', () => this.zoomFit());
  },
  zoomBy(f, cx, cy) {
    const vp = $('#viewport'), r = vp.getBoundingClientRect();
    const old = this.zoom, nz = Math.max(1, Math.min(32, old * f));
    if (nz === old) return;
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    // keep the point under the cursor fixed: offset from viewport center scales with zoom
    const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    this.pan.x = ox - (ox - this.pan.x) * nz / old; this.pan.y = oy - (oy - this.pan.y) * nz / old;
    this.zoom = nz; this.layoutStage();
  },
  zoomFit() { this.zoom = 1; this.pan = { x: 0, y: 0 }; this.layoutStage(); },
  zoom1to1() {
    const vp = $('#viewport'), P = this.project, aw = vp.clientWidth - 32, ah = vp.clientHeight - 32, a = P.width / P.height;
    let w = aw; if (aw / a > ah) w = ah * a;
    this.zoom = Math.max(1, P.width / (window.devicePixelRatio || 1) / w); this.pan = { x: 0, y: 0 }; this.layoutStage();
  },
};
