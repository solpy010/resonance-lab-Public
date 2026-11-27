// RESONANCE LAB 화면 — App: 프로젝트 불러오기·저장·기본 바인딩. 나머지 기능은 같은 폴더의 기능별 파일
// (inspector, transport, stage, timeline, exportDialog, menus, clipboard, history, shelf, assets) 에 있고 아래에서 App.prototype 에 붙는다. 기능 파일의 메서드 타입은 types/app.d.ts 에서 App 에 합쳐진다.
import { RL } from '../core/rl.js';
import { $, $$, h } from './dom.js';
import * as webgl from '../gl.js';
import * as eng from '../engine.js';
import * as audioLib from '../audio.js';
import { report } from '../core/report.js';
import * as exportLib from '../export.js';
import * as registry from '../core/registry.js';
import { inspector } from './inspector.js';
import { transport } from './transport.js';
import { stage } from './stage.js';
import { timeline } from './timeline.js';
import { exportDialog } from './exportDialog.js';
import { menus } from './menus.js';
import { clipboard } from './clipboard.js';
import { history } from './history.js';
import { shelf } from './shelf.js';
import { assets } from './assets.js';

export class App {
  constructor() {
    this.engine = new eng.Engine($('#gl'));
    this.audio = new audioLib.Audio();
    this.exporter = new exportLib.Exporter(this);
    this.view = { guides: true, thumb: false };
    this.engine.view.checker = true;
    this.playing = false; this.sel = null; this.exporting = false; this.seekToken = 0;
    this.fpsCount = 0; this.fpsTime = performance.now(); this.fpsShown = 0;
    this.native = window.rlabNative || null;
    if (this.native) { for (const e of $$('.native-only')) e.classList.remove('hidden'); $('#ver').textContent = 'v' + this.native.version + ' Desktop'; document.title = 'RESONANCE LAB Desktop'; }
    this.buildStatic();
    this.bind();
    this.initV4();
    let p = null;
    try { const s = localStorage.getItem('rlab.autosave'); if (s) p = JSON.parse(s); } catch (e) { p = null; }
    this.loadProject(p || registry.presets.s1_2.make(), !p);
    this.historyReset();
    new ResizeObserver(() => { this.layoutStage(); this.drawTimeline(); }).observe($('#viewport'));
    new ResizeObserver(() => this.drawTimeline()).observe($('#timeline'));
    requestAnimationFrame(t => this.tick(t));
  }

  get project() { return this.engine.project; }
  get t() { return this.engine.frame / this.project.fps; }
  get totalFrames() { return Math.max(1, Math.round(this.project.duration * this.project.fps)); }

  // ---------------------------------------------------------------- project
  normalize(p) {
    const d = eng.defaultProject();
    const o = Object.assign(d, p || {});
    o.bg = Object.assign(eng.defaultProject().bg, (p || {}).bg || {});
    o.post = Object.assign(eng.defaultProject().post, (p || {}).post || {});
    o.impact = Object.assign(eng.defaultProject().impact, (p || {}).impact || {});
    o.markers = (o.markers || []).filter(m => isFinite(m.t)).sort((a, b) => a.t - b.t);
    o.speedKeys = o.speedKeys || [];
    o.layers = (o.layers || []).filter(l => registry.modules[l.type]).map(l => {
      const fresh = eng.newLayer(l.type);
      const out = Object.assign(fresh, l);
      out.params = Object.assign(eng.newLayer(l.type).params, l.params || {});
      out.react = Object.assign(eng.defaultReact(), l.react || {});
      out.keys = l.keys || {};
      return out;
    });
    return o;
  }

  loadProject(p, fromPreset, keepSel) {
    this.pause(); this.kfSel = [];
    if (!this._restoring && this.flushHistory && this.hist) this.flushHistory();
    const P = this.normalize(p);
    this.engine.load(P);
    this.sel = (keepSel && P.layers.some(l => l.id === keepSel)) ? keepSel : P.layers.length ? P.layers[P.layers.length - 1].id : null;
    this.syncHeader();
    this.renderLayerList();
    this.renderInspector();
    this.renderBg();
    this.renderPost();
    this.renderTimePanel();
    this.afterRebuild();
    this.updateMarkerCount();
    this.save(true);
  }

  afterRebuild() {
    this.layoutStage();
    this.engine.reset();
    this.engine.stepFrame();
    this.needsRender = true;
    this.drawTimeline();
  }

  save(now) {
    if (now && this.flushHistory) { this._saveT = 1; this.flushHistory(); return; }
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { const j = JSON.stringify(this.project); this.historyCommit(j); try { localStorage.setItem('rlab.autosave', j); } catch (e) { } }, 450);
  }

  // ---------------------------------------------------------------- static UI
  buildStatic() {
    const ps = $('#preset');
    ps.append(h('option', { value: '', text: '— 씬 프리셋 불러오기 —' }));
    for (const k in registry.presets) ps.append(h('option', { value: k, text: registry.presets[k].label }));
    const add = $('#addBtns');
    for (const k in registry.modules) {
      const M = registry.modules[k];
      add.append(h('button', { title: M.label + ' 레이어 추가', onclick: () => this.addLayer(k) }, h('span', { text: M.icon }), M.label));
    }
  }

  syncHeader() {
    const P = this.project;
    $('#projName').value = P.name;
    const key = P.width + 'x' + P.height;
    const opt = $$('#size option').find(o => o.value === key);
    $('#size').value = opt ? key : 'custom';
    $('#customSize').classList.toggle('hidden', !!opt);
    $('#cw').value = P.width; $('#ch').value = P.height;
    $('#faces').value = P.faces; $('#fps').value = String(P.fps); $('#dur').value = P.duration; $('#seed').value = P.seed;
    $('#scale').value = String(this.engine.scale);
    for (const b of $$('.tg')) {
      const k = b.dataset.view;
      b.classList.toggle('on', k === 'wrap' ? !!P.wrap : k in this.view ? !!this.view[k] : !!this.engine.view[k]);
    }
    $('#exTo').value = P.duration;
  }

  bind() {
    const P = () => this.project;
    $('#projName').addEventListener('input', e => { P().name = e.target.value; this.save(); });
    $('#preset').addEventListener('change', e => {
      const k = e.target.value; e.target.value = '';
      if (!k) return;
      if (P().layers.length && !confirm('현재 작업을 프리셋으로 바꿀까요? 저장하지 않은 변경은 사라집니다.')) return;
      this.loadProject(registry.presets[k].make(), true);
    });
    $('#size').addEventListener('change', e => {
      const v = e.target.value;
      $('#customSize').classList.toggle('hidden', v !== 'custom');
      if (v === 'custom') return;
      const [w, hh] = v.split('x').map(Number); this.setSize(w, hh);
    });
    const cs = () => this.setSize(Math.max(64, +$('#cw').value | 0), Math.max(64, +$('#ch').value | 0));
    $('#cw').addEventListener('change', cs); $('#ch').addEventListener('change', cs);
    $('#faces').addEventListener('change', e => { P().faces = Math.max(1, Math.min(12, +e.target.value | 0)); this.resetSim(); });
    $('#fps').addEventListener('change', e => { P().fps = +e.target.value; this.resetSim(); });
    $('#dur').addEventListener('change', e => { P().duration = Math.max(1, +e.target.value); this.drawTimeline(); this.save(); });
    $('#seed').addEventListener('change', e => { P().seed = +e.target.value | 0; this.resetSim(); });
    $('#seedNew').addEventListener('click', () => { P().seed = Math.floor(Math.random() * 99999); $('#seed').value = P().seed; this.resetSim(); });
    $('#scale').addEventListener('change', e => { this.engine.scale = +e.target.value; const f = this.engine.frame; this.engine.rebuild(); this.afterRebuild(); this.seekAsync(f); });
    for (const b of $$('.tg')) b.addEventListener('click', () => {
      const k = b.dataset.view;
      if (k === 'wrap') { this.setWrap(!P().wrap); return; }
      if (k in this.view) this.view[k] = !this.view[k]; else this.engine.view[k] = !this.engine.view[k];
      b.classList.toggle('on');
      $('#thumbBox').classList.toggle('hidden', !this.view.thumb);
      this.drawGuides(); this.needsRender = true;
    });
    $('#btnSave').addEventListener('click', async () => {
      const json = JSON.stringify(P(), null, 2), name = exportLib.safeName(P().name) + '.rlab.json';
      if (!this.native) { exportLib.download(new Blob([json], { type: 'application/json' }), name); return; }
      try { const f = await this.native.saveDialog(name, 'json'); if (f) { await this.native.writePath(f, new TextEncoder().encode(json)); this.nativePath = f; this.toast && this.toast('저장: ' + f, 2200); } }
      catch (err) { report('error', '저장 실패', err); alert('저장 실패: ' + err.message); }
    });
    $('#btnOpen').addEventListener('click', async () => {
      if (!this.native) { $('#fileOpen').click(); return; }
      try { const r = await this.native.openProject(); if (r) { const o = JSON.parse(r.text); if (o.type === 'rlab-act') this.loadAct(r.text, r.path); else this.loadProject(o); } }
      catch (err) { alert('프로젝트 파일을 읽을 수 없습니다: ' + err.message); }
    });
    $('#exShow').addEventListener('click', () => { if (this.native && this.lastOut) this.native.showItem(this.lastOut); });
    $('#fileOpen').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const tx = await f.text(), o = JSON.parse(tx); if (o.type === 'rlab-act') this.loadAct(tx, f.name); else this.loadProject(o); } catch (err) { alert('프로젝트 파일을 읽을 수 없습니다: ' + err.message); }
    });
    $('#btnStill').addEventListener('click', () => this.runExport(() => this.exporter.stillFrame(Math.max(0, this.engine.frame - 1)), '현재 프레임 저장 중'));
    $('#btnRender').addEventListener('click', () => this.openModal());
    // background
    for (const b of $$('#bgMode button')) b.addEventListener('click', () => { P().bg.mode = b.dataset.v; this.renderBg(); this.needsRender = true; this.save(); });
    $('#bgColor').addEventListener('input', e => { P().bg.color = e.target.value; this.renderBg(); this.needsRender = true; this.save(); });
    $('#bgHex').addEventListener('change', e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) { P().bg.color = v.toLowerCase(); this.renderBg(); this.needsRender = true; this.save(); } });
    const hsv = () => { const c = webgl.hsvToRgb(+$('#bgH').value, +$('#bgS').value, +$('#bgV').value); P().bg.color = webgl.rgbToHex(...c); this.renderBg(true); this.needsRender = true; this.save(); };
    ['#bgH', '#bgS', '#bgV'].forEach(s => $(s).addEventListener('input', hsv));
    for (const b of $$('#chromaPreset button')) b.addEventListener('click', () => { P().bg.chroma = b.dataset.v; this.renderBg(); this.needsRender = true; this.save(); });
    $('#chromaColor').addEventListener('input', e => { P().bg.chroma = e.target.value; this.renderBg(); this.needsRender = true; this.save(); });
    // transport
    $('#tPlay').addEventListener('click', () => this.togglePlay());
    $('#tStart').addEventListener('click', () => { this.pause(); this.seekAsync(1); });
    $('#tNext').addEventListener('click', () => { this.pause(); this.seekAsync(this.engine.frame + 1); });
    $('#tPrev').addEventListener('click', () => { this.pause(); this.seekAsync(Math.max(1, this.engine.frame - 1)); });
    // audio & markers
    $('#aLoad').addEventListener('click', () => $('#fileAudio').click());
    $('#fileAudio').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { await this.audio.load(f); $('#aName').textContent = f.name + ' · ' + this.audio.buffer.duration.toFixed(1) + '초';
        if (this.audio.buffer.duration > P().duration && confirm('프로젝트 길이를 음원 길이(' + Math.ceil(this.audio.buffer.duration) + '초)에 맞출까요?')) { P().duration = Math.ceil(this.audio.buffer.duration); $('#dur').value = P().duration; }
        this.drawTimeline(); }
      catch (err) { alert('오디오를 읽을 수 없습니다: ' + err.message); }
    });
    $('#aDetect').addEventListener('click', () => {
      if (!this.audio.buffer) { alert('먼저 오디오를 불러오세요.'); return; }
      const m = this.audio.onsets({ sensitivity: +$('#aSens').value, minGap: +$('#aGap').value, band: $('#aBand').value });
      P().markers = m; this.markersChanged();
    });
    $('#bpmGrid').addEventListener('click', () => {
      const bpm = +$('#bpm').value, from = +$('#bpmFrom').value; if (!(bpm > 0)) return;
      for (let t = from; t < P().duration; t += 60 / bpm) P().markers.push({ t: +t.toFixed(4), s: 1 });
      this.markersChanged();
    });
    $('#mTap').addEventListener('click', () => this.tap());
    $('#mClear').addEventListener('click', () => { if (!P().markers.length || confirm('마커 ' + P().markers.length + '개를 모두 지울까요?')) { P().markers = []; this.markersChanged(); } });
    // timeline
    const tl = $('#timeline');
    const tAt = (e) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(P().duration, (e.clientX - r.left - 8) / (r.width - 16) * P().duration)); };
    this._tAt = tAt;
    tl.addEventListener('mousedown', e => this.tlDown(e));
    window.addEventListener('mousemove', e => this.tlMove(e));
    window.addEventListener('mouseup', e => this.tlUp(e));
    tl.addEventListener('dblclick', e => {
      const g = this.tlGeom(), y = this.tlLocalY(e), hit = this.kfAt(e);
      if (hit) { this.deleteKeys([hit]); return; }                 // double-click a keyframe → delete it
      if (y >= g.wy && y <= g.wy + g.wh) { P().markers.push({ t: +tAt(e).toFixed(4), s: 1 }); this.markersChanged(); }
    });
    tl.addEventListener('contextmenu', e => {
      e.preventDefault();
      const hit = this.kfAt(e);
      if (hit) { this.deleteKeys([hit]); return; }                 // right-click a keyframe → delete it
      const t = tAt(e), r = tl.getBoundingClientRect(), tol = 8 / (r.width - 16) * P().duration;
      let bi = -1, bd = tol; P().markers.forEach((m, i) => { const d = Math.abs(m.t - t); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { P().markers.splice(bi, 1); this.markersChanged(); }
    });
    // modal
    for (const b of $$('#exFmt button')) b.addEventListener('click', () => { this.exFmt = b.dataset.v; this.updateModal(); });
    $('#exCancel').addEventListener('click', () => { if (this.exporting) this.exporter.cancel = true; else $('#modal').classList.add('hidden'); });
    $('#exGo').addEventListener('click', () => this.startExport());
    ['#exFrom', '#exTo'].forEach(s => $(s).addEventListener('input', () => this.updateModal()));
    // keyboard
    window.addEventListener('keydown', e => {
      if (this.shortcut(e)) return;
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && /** @type {HTMLInputElement} */ (document.activeElement).type !== 'range' && /** @type {HTMLInputElement} */ (document.activeElement).type !== 'checkbox') return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      else if (e.code === 'ArrowRight') { this.pause(); this.seekAsync(this.engine.frame + (e.shiftKey ? 10 : 1)); }
      else if (e.code === 'ArrowLeft') { this.pause(); this.seekAsync(Math.max(1, this.engine.frame - (e.shiftKey ? 10 : 1))); }
      else if (e.code === 'Home') { this.pause(); this.seekAsync(1); }
      else if (e.code === 'KeyT') this.tap();
    });
  }

  setSize(w, hh) {
    const P = this.project; P.width = w - (w % 2); P.height = hh - (hh % 2);
    this.engine.rebuild(); this.afterRebuild(); this.syncHeader(); this.save();
  }

  resetSim() { const f = this.engine.frame; this.engine.reset(); this.afterRebuild(); this.seekAsync(f); this.save(); }

  // ---------------------------------------------------------------- layers
  addLayer(type) {
    const P = this.project;
    const L = eng.newLayer(type);
    let n = 1; while (P.layers.some(x => x.name === L.name + (n > 1 ? ' ' + n : ''))) n++;
    if (n > 1) L.name += ' ' + n;
    P.layers.push(L);
    this.engine.syncLayers();
    this.sel = L.id;
    this.renderLayerList(); this.renderInspector(); this.needsRender = true; this.updateBgWarn(); this.save(true);
  }
  layerAction(id, act) {
    const P = this.project, i = P.layers.findIndex(l => l.id === id); if (i < 0) return;
    const L = P.layers[i];
    if (act === 'toggle') L.enabled = !L.enabled;
    else if (act === 'up' && i < P.layers.length - 1) [P.layers[i], P.layers[i + 1]] = [P.layers[i + 1], P.layers[i]];
    else if (act === 'down' && i > 0) [P.layers[i], P.layers[i - 1]] = [P.layers[i - 1], P.layers[i]];
    else if (act === 'dup') { const c = JSON.parse(JSON.stringify(L)); c.id = 'L' + Math.random().toString(36).slice(2, 8); c.name += ' 복제'; P.layers.splice(i + 1, 0, c); this.sel = c.id; }
    else if (act === 'del') { if (!confirm('"' + L.name + '" 레이어를 삭제할까요?')) return; P.layers.splice(i, 1); if (this.sel === id) this.sel = P.layers.length ? P.layers[P.layers.length - 1].id : null; }
    this.engine.syncLayers();
    if (act === 'dup') { const EL = this.engine.layers.find(x => x.id === this.sel); if (EL) { EL.needsReset = true; } }
    this.renderLayerList(); this.renderInspector(); this.needsRender = true; this.updateBgWarn(); this.save(true);
  }
}
Object.assign(App.prototype, inspector, transport, stage, timeline, exportDialog, menus, clipboard, history, shelf, assets);

window.addEventListener('DOMContentLoaded', () => {
  try { window.app = new App(); }
  catch (e) {
    console.error(e);
    const N = window.rlabNative;
    document.body.innerHTML = '<div style="padding:40px;color:#ddd;font:14px sans-serif;line-height:1.7">RESONANCE LAB을 시작할 수 없습니다.<br><br><b>' + e.message + '</b><br><br>' +
      (N ? '이 PC의 그래픽 가속(GPU)이 WebGL2를 지원하지 않거나 막혀 있을 수 있습니다.<br><button id="rlSafe" style="margin-top:12px;padding:8px 16px;font-size:14px">호환 모드(소프트웨어 렌더링)로 다시 시작</button> <button id="rlNorm" style="padding:8px 16px;font-size:14px">일반 모드로 다시 시작</button><div id="rlLog" style="margin-top:14px;color:#888;font-size:12px"></div>'
         : 'Chrome 또는 Edge 최신 버전에서 열고, 설정 → 시스템 → 「가능한 경우 그래픽 가속 사용」을 켜 주세요.') + '</div>';
    if (N) {
      document.getElementById('rlSafe').onclick = () => N.relaunch(true);
      document.getElementById('rlNorm').onclick = () => N.relaunch(false);
      N.logPath && N.logPath().then(p => { document.getElementById('rlLog').textContent = '로그: ' + p; });
      N.startFail && N.startFail(e.message);
    }
  }
});


// 호환 등록 — 디버그 콘솔과 아직 import 로 바뀌지 않은 곳을 위해 RL 에도 남겨 둔다
Object.assign(RL, { App });
