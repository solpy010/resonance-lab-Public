// RESONANCE LAB 화면 — 씬 사이 레이어 복사·붙여넣기
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import * as eng from '../engine.js';
import * as registry from '../core/registry.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const clipboard = {
  // ------------------------------------------------------------ layer clipboard (씬 사이 레이어 복사·붙여넣기)
  layerAssets(layers, assets) {
    const out = {}; if (!assets) return out;
    const visit = (v) => { if (typeof v === 'string' && assets[v]) out[v] = assets[v]; else if (Array.isArray(v)) v.forEach(visit); };
    for (const L of layers) for (const k in (L.params || {})) visit(L.params[k]);
    return out;
  },
  copyLayers(layers, assets, from) {
    if (!layers || !layers.length) return;
    const clip = { layers: JSON.parse(JSON.stringify(layers)), assets: this.layerAssets(layers, assets || this.project.assets), from: from || this.project.name, time: Date.now() };
    this.layerClip = clip; this.lastClip = 'layer';
    try { localStorage.setItem('rlab.layerClip', JSON.stringify(clip)); } catch (e) { /* large image assets may not fit — keep in memory */ }
    this.toast('레이어 ' + layers.length + '개 복사됨 — 다른 씬을 열고 Ctrl+V로 붙여넣기');
  },
  getLayerClip() {
    if (this.layerClip) return this.layerClip;
    try { const c = JSON.parse(localStorage.getItem('rlab.layerClip') || 'null'); if (c && c.layers) { this.layerClip = c; return c; } } catch (e) { }
    return null;
  },
  pasteLayers(clip) {
    clip = clip || this.getLayerClip(); if (!clip || !clip.layers.length) { this.toast('복사한 레이어가 없습니다'); return; }
    const P = this.project;
    // bring along image / video sources the layers use
    if (clip.assets && Object.keys(clip.assets).length) { P.assets = P.assets || {}; for (const id in clip.assets) if (!P.assets[id]) P.assets[id] = clip.assets[id]; this.engine.syncAssets && this.engine.syncAssets(); }
    const at = this.sel ? P.layers.findIndex(l => l.id === this.sel) + 1 : P.layers.length;
    const add = clip.layers.map(src => {
      const fresh = registry.modules[src.type] ? eng.newLayer(src.type) : null; if (!fresh) return null;
      const c = Object.assign(fresh, JSON.parse(JSON.stringify(src)));
      c.params = Object.assign(eng.newLayer(src.type).params, c.params || {});
      c.id = 'L' + Math.random().toString(36).slice(2, 8);
      if (P.layers.some(x => x.name === c.name)) c.name += ' (붙여넣기)';
      return c;
    }).filter(Boolean);
    P.layers.splice(Math.max(0, at), 0, ...add);
    this.engine.syncLayers();
    for (const c of add) { const EL = this.engine.layers.find(x => x.id === c.id); if (EL) EL.needsReset = true; }
    this.sel = add.length ? add[add.length - 1].id : this.sel; this.kfSel = [];
    this.renderLayerList(); this.renderInspector(); this.needsRender = true; this.updateBgWarn && this.updateBgWarn(); this.drawTimeline(); this.save(true);
    this.toast('레이어 ' + add.length + '개 붙여넣음' + (clip.from ? ' — 「' + clip.from + '」에서' : ''));
  },
  layerCtx(e, L) {
    e.preventDefault(); this.sel = L.id; this.renderLayerList(); this.renderInspector();
    const clip = this.getLayerClip();
    this.ctxMenu(e.clientX, e.clientY, [
      { label: '레이어 복사', fn: () => this.copyLayers([L]) },
      { label: '모든 레이어 복사 (' + this.project.layers.length + '개)', fn: () => this.copyLayers(this.project.layers.slice()) },
      { label: clip ? '붙여넣기 — ' + clip.layers.map(l => l.name).slice(0, 2).join(', ') + (clip.layers.length > 2 ? ' 외 ' + (clip.layers.length - 2) : '') : '붙여넣기', dis: !clip, fn: () => this.pasteLayers() },
      '-',
      { label: '복제', fn: () => this.layerAction(L.id, 'dup') },
      { label: '삭제', fn: () => this.layerAction(L.id, 'del') },
    ]);
  },
};
