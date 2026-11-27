'use strict';
import { RL } from './core/rl.js';
import * as webgl from './gl.js';
import * as eng from './engine.js';
// RESONANCE LAB — application UI

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'text') e.textContent = attrs[k];
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0'); };

RL.App = class {
  constructor() {
    this.engine = new eng.Engine($('#gl'));
    this.audio = new RL.Audio();
    this.exporter = new RL.Exporter(this);
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
    this.loadProject(p || RL.presets.s1_2.make(), !p);
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
    o.layers = (o.layers || []).filter(l => RL.modules[l.type]).map(l => {
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
    for (const k in RL.presets) ps.append(h('option', { value: k, text: RL.presets[k].label }));
    const add = $('#addBtns');
    for (const k in RL.modules) {
      const M = RL.modules[k];
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
      this.loadProject(RL.presets[k].make(), true);
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
      const json = JSON.stringify(P(), null, 2), name = RL.safeName(P().name) + '.rlab.json';
      if (!this.native) { RL.download(new Blob([json], { type: 'application/json' }), name); return; }
      try { const f = await this.native.saveDialog(name, 'json'); if (f) { await this.native.writePath(f, new TextEncoder().encode(json)); this.nativePath = f; this.toast && this.toast('저장: ' + f, 2200); } }
      catch (err) { alert('저장 실패: ' + err.message); }
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
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox') return;
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
  renderLayerList() {
    const ul = $('#layerList'); ul.innerHTML = '';
    const P = this.project;
    if (!P.layers.length) ul.append(h('li', { class: 'empty' }, '위 버튼으로 레이어를 추가하세요'));
    for (const L of P.layers.slice().reverse()) {
      const M = RL.modules[L.type];
      const li = h('li', { class: (L.id === this.sel ? 'sel ' : '') + (L.enabled ? '' : 'off'), onclick: () => { this.sel = L.id; this.kfSel = []; this.renderLayerList(); this.renderInspector(); this.drawTimeline(); }, oncontextmenu: e => this.layerCtx(e, L), title: '우클릭: 복사·붙여넣기' },
        h('button', { title: '보이기/숨기기', onclick: e => { e.stopPropagation(); this.layerAction(L.id, 'toggle'); } }, L.enabled ? '◉' : '○'),
        h('span', { class: 'ico', text: M.icon }),
        h('span', { class: 'nm' }, L.name, h('small', { text: M.label })),
        h('button', { title: '위로', onclick: e => { e.stopPropagation(); this.layerAction(L.id, 'up'); } }, '▲'),
        h('button', { title: '아래로', onclick: e => { e.stopPropagation(); this.layerAction(L.id, 'down'); } }, '▼'),
        h('button', { title: '복제', onclick: e => { e.stopPropagation(); this.layerAction(L.id, 'dup'); } }, '⧉'),
        h('button', { title: '삭제', onclick: e => { e.stopPropagation(); this.layerAction(L.id, 'del'); } }, '✕'));
      ul.append(li);
    }
  }

  selLayer() { return this.project.layers.find(l => l.id === this.sel); }

  // ---------------------------------------------------------------- inspector
  renderInspector() {
    const box = $('#inspector'); box.innerHTML = '';
    const L = this.selLayer();
    if (!L) { box.append(h('p', { class: 'empty' }, '레이어를 선택하세요.')); return; }
    const M = RL.modules[L.type];
    box.append(h('div', { class: 'head' }, h('span', { class: 'type', text: M.icon + ' ' + M.label }),
      h('input', { type: 'text', value: L.name, oninput: e => { L.name = e.target.value; this.renderLayerList(); this.save(); } })));
    const groups = [];
    for (const s of M.schema) { let g = groups.find(x => x.name === s.group); if (!g) groups.push(g = { name: s.group, items: [] }); g.items.push(s); }
    const order = ['배치', '시점', '패턴', '표시', '동기화', '심벌', '노트', '이펙트', '다중참여', '오브젝트', '생성', '형태', '흐름 면', '세로 면', '움직임', '돌출 각도', '물리', '터짐', '가로지르기', '스크래치', '그리드', '선 스타일', '입체', '해수면', '동작', '동작 어휘', '회전', '재질', '레이저', '그래픽', '물성', '색상', '반응'];
    groups.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const sub = { '다중참여': '3층·참여', '형태': '1층', '움직임': '1층·시간', '물성': '2층', '색상': '2층', '반응': '3층', '그리드': '1층', '스크래치': '1층', '흐름 면': '1층', '세로 면': '1층', '물리': '1층·물리', '가로지르기': '1층', '표시': '켜기/끄기', '동기화': '3층·싱크', '심벌': '1층', '노트': '1층', '이펙트': '3층', '오브젝트': '1층', '생성': '1층', '터짐': '3층', '선 스타일': '2층', '돌출 각도': '1층·3D', '입체': '2층', '해수면': '1층', '배치': '1층·위치', '시점': '1층·3D', '동작': '1층·안무', '동작 어휘': '1층·안무', '회전': '1층·시간', '재질': '2층', '패턴': '1층', '레이저': '2층', '그래픽': '1층' };
    this.paramRows = [];
    for (const g of groups) {
      const det = h('details', { class: 'grp', open: true }, h('summary', {}, g.name, h('small', { text: sub[g.name] || '' })));
      const body = h('div', { class: 'body' });
      for (const s of g.items) body.append(this.paramRow(L, s, 'params'));
      det.append(body); box.append(det);
    }
    const dc = h('details', { class: 'grp', open: true }, h('summary', {}, '깊이·합성', h('small', { text: '2층' })));
    const bc = h('div', { class: 'body' });
    for (const s of eng.layerCommonSchema) bc.append(this.paramRow(L, s, 'common'));
    dc.append(bc); box.append(dc);
    const dr = h('details', { class: 'grp', open: true }, h('summary', {}, '마커 반응', h('small', { text: '3층' })));
    const br = h('div', { class: 'body' });
    for (const s of eng.reactSchema) br.append(this.paramRow(L, s, 'react'));
    dr.append(br); box.append(dr);
  }

  paramRow(L, s, where) {
    const keyId = where === 'common' ? '_' + s.id : s.id;
    const get = () => where === 'params' ? L.params[s.id] : where === 'common' ? L[s.id] : L.react[s.id];
    const setBase = (v) => { if (where === 'params') L.params[s.id] = v; else if (where === 'common') L[s.id] = v; else L.react[s.id] = v; };
    const onChange = () => {
      if (where === 'react') this.refreshSchedules();
      if (where === 'common' && s.id === 'blend') this.updateBgWarn();
      this.paramChanged(s, where); this.save();
    };
    const row = h('div', { class: 'prm' + (s.type === 'range' ? '' : ' wide'), title: s.hint || '' });
    row.append(h('label', { text: s.label }));
    if (s.type === 'range') {
      const keys = () => (L.keys[keyId] || []);
      const cur = () => keys().length ? eng.evalKeys(keys(), this.t, get()) : get();
      const rng = h('input', { type: 'range', min: s.min, max: s.max, step: s.step });
      const num = h('input', { type: 'number', min: s.min, max: s.max, step: s.step });
      const key = h('button', { class: 'key', title: '키프레임: 클릭=현재 시간에 추가/삭제, Alt+클릭=이 항목 키 전체 삭제' }, '◆');
      const sync = () => {
        const v = cur(), act = document.activeElement;
        if (act !== rng) rng.value = v;
        if (act !== num) num.value = +(+v).toFixed(4);   // never overwrite the field being typed into
        const ks = keys(), on = ks.some(k => Math.abs(k.t - this.t) < 0.5 / this.project.fps);
        key.classList.toggle('on', on); key.classList.toggle('has', ks.length > 0 && !on);
        key.textContent = on ? '◆' : '◇';
      };
      const apply = (v) => {
        v = Math.min(s.max, Math.max(s.min, +v));
        const ks = keys();
        if (ks.length) this.upsertKey(L, keyId, v); else setBase(v);
        sync(); onChange();
      };
      rng.addEventListener('input', () => apply(rng.value));
      num.addEventListener('change', () => apply(num.value));
      num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(num.value); num.blur(); } e.stopPropagation(); });
      num.addEventListener('focus', () => num.select());
      if (s.key) key.addEventListener('click', (e) => {
        if (e.altKey) { delete L.keys[keyId]; sync(); onChange(); this.drawTimeline(); return; }
        const ks = keys(), i = ks.findIndex(k => Math.abs(k.t - this.t) < 0.5 / this.project.fps);
        if (i >= 0) { ks.splice(i, 1); if (!ks.length) delete L.keys[keyId]; }
        else this.upsertKey(L, keyId, +cur());
        sync(); onChange(); this.drawTimeline();
      });
      else key.style.visibility = 'hidden';
      sync();
      this.paramRows.push(sync);
      row.append(rng, num, key);
    } else if (s.type === 'color') {
      const c = h('input', { type: 'color', value: get() });
      c.addEventListener('input', () => { setBase(c.value); onChange(); });
      row.append(c);
    } else if (s.type === 'colors') {
      const wrap = h('div', { class: 'colors' });
      const draw = () => {
        wrap.innerHTML = '';
        const arr = get();
        arr.forEach((col, i) => {
          const c = h('input', { type: 'color', value: col, title: '우클릭: 삭제' });
          c.addEventListener('input', () => { arr[i] = c.value; onChange(); });
          c.addEventListener('contextmenu', e => { e.preventDefault(); if (arr.length > 1) { arr.splice(i, 1); draw(); onChange(); } });
          wrap.append(c);
        });
        if (arr.length < 6) wrap.append(h('button', { class: 'add', title: '색 추가', onclick: () => { arr.push(arr[arr.length - 1] || '#ffffff'); draw(); onChange(); } }, '+'));
      };
      draw(); row.append(wrap);
    } else if (s.type === 'select') {
      const sel = h('select', {}, s.options.map(([v, l]) => h('option', { value: v, text: l })));
      sel.value = get();
      sel.addEventListener('change', () => { setBase(sel.value); onChange(); if (s.rerender) this.renderInspector(); });
      row.append(sel);
    } else if (s.type === 'bool') {
      const c = h('input', { type: 'checkbox' }); c.checked = !!get();
      c.addEventListener('change', () => { setBase(c.checked); onChange(); });
      row.append(h('div', {}, c));
    } else if (s.type === 'asset') {
      row.append(this.assetPicker(get, (v) => { setBase(v); onChange(); }));
    } else if (s.type === 'assetList') {
      row.append(this.assetListUI(get, onChange));
    } else {
      const ti = h('input', { type: 'text', value: get() ?? '' });
      ti.addEventListener('change', () => { setBase(ti.value); onChange(); });
      row.append(ti);
    }
    if (where === 'params' && s.when && !s.when(L.params)) {
      row.classList.add('locked');
      row.querySelectorAll('input, select, button').forEach(el => { el.disabled = true; });
    }
    const frag = document.createDocumentFragment();
    frag.append(row);
    if (s.hint && !(where === 'params' && s.when && !s.when(L.params))) frag.append(h('div', { class: 'hint', text: s.hint }));
    return frag;
  }

  upsertKey(L, keyId, v) {
    const ks = L.keys[keyId] = L.keys[keyId] || [];
    const t = +this.t.toFixed(4);
    const k = ks.find(k => Math.abs(k.t - t) < 0.5 / this.project.fps);
    if (k) k.v = v; else { ks.push({ t, v, e: (this.prefs && this.prefs.ease) || 'quintOut' }); ks.sort((a, b) => a.t - b.t); }
  }

  refreshInspectorValues() { if (this.paramRows) for (const f of this.paramRows) f(); if (this.timeRows) for (const f of this.timeRows) f(); }

  // visual-only params re-render immediately; simulation params re-simulate to the current frame when paused
  paramChanged(s, where) {
    this.needsRender = true;
    const simGroups = ['회전', '형태', '움직임', '반응', '그리드', '스크래치', '흐름 면', '세로 면', '물리', '가로지르기', '오브젝트', '생성', '터짐'];
    if (!this.playing && (where === 'react' || (where === 'params' && simGroups.includes(s.group)) || (where === 'common' && s.id === 'speed'))) {
      clearTimeout(this._resimT);
      this._resimT = setTimeout(() => { const f = this.engine.frame; this.engine.reset(); this.seekAsync(f); }, 350);
    }
  }

  // ---------------------------------------------------------------- bg / post / time
  renderBg(fromHsv) {
    const bg = this.project.bg;
    for (const b of $$('#bgMode button')) b.classList.toggle('on', b.dataset.v === bg.mode);
    $('#bgSolid').classList.toggle('hidden', bg.mode !== 'solid');
    $('#bgChroma').classList.toggle('hidden', bg.mode !== 'chroma');
    $('#bgNote').classList.toggle('hidden', bg.mode !== 'transparent');
    $('#bgColor').value = bg.color; $('#bgHex').value = bg.color;
    if (!fromHsv) { const [hh, s, v] = webgl.rgbToHsv(...webgl.hexToRgb(bg.color)); $('#bgH').value = hh; $('#bgS').value = s; $('#bgV').value = v; }
    $('#bgHv').textContent = Math.round($('#bgH').value); $('#bgSv').textContent = Math.round($('#bgS').value); $('#bgVv').textContent = Math.round($('#bgV').value);
    $('#chromaColor').value = bg.chroma;
    for (const b of $$('#chromaPreset button')) b.classList.toggle('on', b.dataset.v === bg.chroma);
    this.updateBgWarn();
  }
  updateBgWarn() {
    const P = this.project;
    const risky = P.bg.mode === 'chroma' && (P.post.glow > 0.01 || P.layers.some(l => l.enabled && (l.blend !== 'over' || ['beam', 'particle', 'fluid', 'wave'].includes(l.type))));
    $('#bgWarn').classList.toggle('hidden', !risky);
  }
  sliderRow(label, obj, k, min, max, step, onCh, keyHost) {
    const row = h('div', { class: 'sl' + (keyHost ? ' k' : '') });
    const r = h('input', { type: 'range', min, max, step, value: obj[k] });
    const em = h('em', { text: (+obj[k]).toFixed(2) });
    r.addEventListener('input', () => { obj[k] = +r.value; em.textContent = (+r.value).toFixed(2); onCh && onCh(); this.needsRender = true; this.save(); });
    row.append(h('span', { text: label }), r, em);
    return row;
  }
  renderPost() {
    const box = $('#postPanel'); box.innerHTML = '';
    const po = this.project.post, w = () => this.updateBgWarn();
    box.append(
      this.sliderRow('글로우', po, 'glow', 0, 2, 0.01, w),
      this.sliderRow('글로우 기준', po, 'glowThreshold', 0, 1, 0.01),
      this.sliderRow('글로우 범위', po, 'glowRadius', 0, 1, 0.01),
      this.sliderRow('할레이션', po, 'halation', 0, 1, 0.01),
      this.sliderRow('필름 그레인', po, 'grain', 0, 0.3, 0.005),
      this.sliderRow('색수차', po, 'chroma', 0, 1, 0.01),
      this.sliderRow('노출', po, 'exposure', 0, 3, 0.01),
      this.sliderRow('대비', po, 'contrast', 0.5, 1.8, 0.01),
      this.sliderRow('채도', po, 'saturation', 0, 2, 0.01),
      h('p', { class: 'note', text: '글로우는 요소에서만 생기며, 투명 출력 시 알파에 포함됩니다.' }));
  }
  renderTimePanel() {
    const box = $('#timePanel'); box.innerHTML = '';
    const P = this.project;
    this.timeRows = [];
    // global speed with keyframes
    const row = h('div', { class: 'prm', style: 'grid-template-columns:62px 1fr 46px 18px' });
    const r = h('input', { type: 'range', min: 0, max: 4, step: 0.01 }), num = h('input', { type: 'number', min: 0, max: 4, step: 0.01 });
    const key = h('button', { class: 'key', title: '전체 속도 키프레임 (Alt+클릭=전체 삭제)' }, '◇');
    const cur = () => P.speedKeys.length ? eng.evalKeys(P.speedKeys, this.t, P.speed) : P.speed;
    const sync = () => { const v = cur(), act = document.activeElement; if (act !== r) r.value = v; if (act !== num) num.value = (+v).toFixed(2); const on = P.speedKeys.some(k => Math.abs(k.t - this.t) < 0.5 / P.fps); key.textContent = on ? '◆' : '◇'; key.classList.toggle('on', on); key.classList.toggle('has', !on && P.speedKeys.length > 0); };
    const apply = v => {
      v = +v;
      if (P.speedKeys.length) { const t = +this.t.toFixed(4); const k = P.speedKeys.find(k => Math.abs(k.t - t) < 0.5 / P.fps); if (k) k.v = v; else { P.speedKeys.push({ t, v, e: 'quintOut' }); P.speedKeys.sort((a, b) => a.t - b.t); } }
      else P.speed = v;
      sync(); this.save(); this.drawTimeline();
      if (!this.playing) { clearTimeout(this._resimT); this._resimT = setTimeout(() => { const f = this.engine.frame; this.engine.reset(); this.seekAsync(f); }, 350); }
    };
    r.addEventListener('input', () => apply(r.value)); num.addEventListener('change', () => apply(num.value));
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { apply(num.value); num.blur(); } e.stopPropagation(); }); num.addEventListener('focus', () => num.select());
    key.addEventListener('click', e => {
      if (e.altKey) P.speedKeys = [];
      else { const i = P.speedKeys.findIndex(k => Math.abs(k.t - this.t) < 0.5 / P.fps); if (i >= 0) P.speedKeys.splice(i, 1); else { P.speedKeys.push({ t: +this.t.toFixed(4), v: cur(), e: 'quintOut' }); P.speedKeys.sort((a, b) => a.t - b.t); } }
      sync(); this.save(); this.drawTimeline();
    });
    sync(); this.timeRows.push(sync);
    row.append(h('label', { text: '전체 속도' }), r, num, key);
    box.append(row, h('p', { class: 'note', text: '시간 재매핑: ◆로 속도 키를 찍어 정지 → 급가속 → 긴 감속을 만듭니다(이징 Quint Out).' }));
    // impact
    const im = P.impact;
    const chk = h('input', { type: 'checkbox' }); chk.checked = im.enabled;
    chk.addEventListener('change', () => { im.enabled = chk.checked; this.save(); });
    const mode = h('select', {}, h('option', { value: 'flash', text: '섬광' }), h('option', { value: 'invert', text: '반전' })); mode.value = im.mode;
    mode.addEventListener('change', () => { im.mode = mode.value; this.save(); });
    box.append(h('div', { class: 'row' }, h('label', { class: 'chk' }, chk, '마커 임팩트 프레임'), mode),
      this.sliderRow('지속 프레임', im, 'frames', 1, 12, 1),
      this.sliderRow('세기', im, 'amount', 0, 1.5, 0.01),
      h('p', { class: 'note', text: '임팩트는 장면당 핵심 타격에만 쓰세요. 모든 비트 점멸은 피합니다.' }));
  }

  // ---------------------------------------------------------------- markers
  markersChanged() {
    const P = this.project;
    P.markers.sort((a, b) => a.t - b.t);
    this.refreshSchedules();
    this.updateMarkerCount(); this.drawTimeline(); this.save(true);
  }
  refreshSchedules() {
    const E = this.engine, t = this.t;
    E.buildGlobalSchedule(); E.gPtr = E.globalEvents.findIndex(e => e.t >= t); if (E.gPtr < 0) E.gPtr = E.globalEvents.length;
    for (const L of E.layers) { L.events = E.buildSchedule(L); L.evPtr = L.events.findIndex(e => e.t >= t); if (L.evPtr < 0) L.evPtr = L.events.length; }
  }
  updateMarkerCount() { $('#mCount').textContent = '마커 ' + this.project.markers.length + '개'; }
  tap() { if (!this.playing) return; this.project.markers.push({ t: +this.t.toFixed(4), s: 1 }); this.markersChanged(); }

  // ---------------------------------------------------------------- playback
  togglePlay() { this.playing ? this.pause() : this.play(); }
  play() {
    if (this.exporting) return;
    if (this.engine.frame >= this.totalFrames) { this.engine.reset(); this.engine.stepFrame(); }
    this.playing = true; $('#tPlay').textContent = '❚❚';
    this.playStartTime = performance.now(); this.playStartFrame = this.engine.frame;
    if ($('#aPlay').checked) this.audio.play(this.t);
  }
  pause() {
    if (!this.playing) return;
    this.playing = false; $('#tPlay').textContent = '▶'; this.audio.stop();
    this.refreshInspectorValues();
  }

  async seekAsync(frame) {
    frame = Math.max(1, Math.min(this.totalFrames, frame));
    const E = this.engine, token = ++this.seekToken;
    if (frame < E.frame) E.reset();
    const total = frame - E.frame, big = total > 45;
    const t0 = performance.now();
    while (E.frame < frame) {
      E.stepFrame();
      if (performance.now() - t0 > 40 && big) {
        $('#busy').classList.remove('hidden');
        $('#busyText').textContent = '재계산 중… ' + fmtTime(E.frame / this.project.fps);
        $('#busyBar').style.width = ((1 - (frame - E.frame) / total) * 100) + '%';
        await new Promise(r => setTimeout(r));
        if (token !== this.seekToken) return;
      }
    }
    $('#busy').classList.add('hidden');
    this.needsRender = true;
    this.refreshInspectorValues();
    this.drawTimeline();
  }

  tick(now) {
    requestAnimationFrame(t => this.tick(t));
    if (this.exporting) return;
    const E = this.engine, P = this.project;
    let stepped = 0;
    if (this.playing) {
      const target = this.playStartFrame + Math.floor((now - this.playStartTime) / 1000 * P.fps);
      while (E.frame < target && stepped < 4) { E.stepFrame(); stepped++; }
      if (target - E.frame > 6) { this.playStartTime = now; this.playStartFrame = E.frame; if ($('#aPlay').checked) this.audio.play(this.t); }
      if (E.frame >= this.totalFrames) {
        if ($('#tLoop').checked) { E.reset(); E.stepFrame(); this.playStartTime = now; this.playStartFrame = E.frame; if ($('#aPlay').checked) this.audio.play(0); }
        else this.pause();
      }
      if (stepped && E.frame % 6 === 0) this.refreshInspectorValues();
    }
    if (stepped || this.needsRender) {
      E.render(); E.present();
      this.needsRender = false;
      if (this.view.thumb) this.drawThumb();
      this.fpsCount++;
      this.drawTimeline();
    }
    if (now - this.fpsTime > 500) { this.fpsShown = this.fpsCount * 1000 / (now - this.fpsTime); this.fpsCount = 0; this.fpsTime = now; }
    $('#tTime').textContent = fmtTime(this.t) + ' / ' + fmtTime(P.duration) + '  f' + E.frame;
    $('#stats').textContent = `${P.width}×${P.height} · 미리보기 ${E.rw}×${E.rh} · ${this.playing ? this.fpsShown.toFixed(0) + ' fps' : '정지'}`;
  }

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
  }
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
  }
  drawThumb() {
    const tb = $('#thumb'), g = tb.getContext('2d');
    g.drawImage(this.engine.canvas, 0, 0, tb.width, tb.height);
  }

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
      const sc = RL.modules[L.type].schema.find(x => x.id === k) || eng.layerCommonSchema.find(x => '_' + x.id === k);
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
  }

  // ---------------------------------------------------------------- export
  openModal() {
    this.pause();
    this.exFmt = this.exFmt || 'png';
    $('#exFrom').value = 0; $('#exTo').value = this.project.duration;
    $('#exBar').style.width = '0'; $('#exStatus').textContent = '';
    $('#exGo').disabled = false; $('#exCancel').textContent = '닫기';
    $('#modal').classList.remove('hidden');
    this.updateModal();
  }
  updateModal() {
    for (const b of $$('#exFmt button')) b.classList.toggle('on', b.dataset.v === this.exFmt);
    const P = this.project, from = +$('#exFrom').value || 0, to = Math.min(P.duration, +$('#exTo').value || P.duration);
    const n = Math.max(1, Math.round((to - from) * P.fps));
    let info = `${P.width}×${P.height} · ${P.fps}fps · ${n}프레임 · `;
    if (this.exFmt === 'png') info += P.bg.mode === 'transparent' ? 'RGBA 알파 포함' : '배경 합성(알파 없음)';
    else if (this.exFmt === 'prores4444') info += 'ProRes 4444 10bit .mov · ' + (P.bg.mode === 'transparent' ? '알파 포함(AE에서 Straight로 해석)' : '배경 합성(알파 채널은 불투명)');
    else if (this.exFmt === 'prores422hq') info += 'ProRes 422 HQ 10bit .mov · 배경 합성' + (P.bg.mode === 'transparent' ? '(투명 배경은 단색 배경색으로)' : '');
    else info += 'H.264 MP4 · ' + (P.bg.mode === 'transparent' ? '투명 배경은 지원되지 않아 배경색으로 저장' : '배경 합성');
    info += this.native || window.showDirectoryPicker || this.exFmt !== 'png' ? '' : ' · 폴더 선택 미지원 브라우저: ZIP으로 저장';
    $('#exInfo').textContent = info;
  }
  async startExport() {
    const opt = { from: +$('#exFrom').value || 0, to: +$('#exTo').value || this.project.duration };
    const pr = (p, s) => this.exProgress(p, s);
    const fn = this.exFmt === 'mp4' ? () => this.exporter.mp4(opt, pr)
      : this.exFmt === 'png' ? () => this.exporter.pngSequence(opt, pr)
      : () => this.exporter.ffmpegVideo(opt, pr, this.exFmt);
    $('#exShow').classList.add('hidden');
    $('#exGo').disabled = true; $('#exCancel').textContent = '취소';
    await this.runExport(fn, null, true);
    $('#exGo').disabled = false; $('#exCancel').textContent = '닫기';
  }
  exProgress(p, s) { $('#exBar').style.width = (p * 100).toFixed(1) + '%'; $('#exStatus').textContent = s; }
  async runExport(fn, label, inModal) {
    this.pause();
    this.exporting = true;
    if (label) { $('#busy').classList.remove('hidden'); $('#busyText').textContent = label; $('#busyBar').style.width = '30%'; }
    const prevFrame = this.engine.frame;
    let res;
    try {
      res = await fn();
      const st = res && res.status ? res.status : res;
      if (res && res.path) { this.lastOut = res.path; if (inModal && this.native) $('#exShow').classList.remove('hidden'); }
      if (inModal) $('#exStatus').textContent = st === 'cancelled' ? '취소됨' : '완료' + (res && res.path ? ' — ' + res.path : '');
    }
    catch (e) { console.error(e); if (inModal) $('#exStatus').textContent = '오류: ' + e.message; else alert('출력 오류: ' + e.message); }
    this.exporting = false;
    $('#busy').classList.add('hidden');
    this.seekAsync(prevFrame);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  try { window.app = new RL.App(); }
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

export { $, $$, h, fmtTime };
