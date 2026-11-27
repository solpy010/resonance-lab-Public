// RESONANCE LAB 화면 — 레이어 목록·인스펙터·배경·후처리 패널
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, $$, h } from './dom.js';
import * as webgl from '../gl.js';
import * as eng from '../engine.js';
import * as registry from '../core/registry.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const inspector = {
  renderLayerList() {
    const ul = $('#layerList'); ul.innerHTML = '';
    const P = this.project;
    if (!P.layers.length) ul.append(h('li', { class: 'empty' }, '위 버튼으로 레이어를 추가하세요'));
    for (const L of P.layers.slice().reverse()) {
      const M = registry.modules[L.type];
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
  },

  selLayer() { return this.project.layers.find(l => l.id === this.sel); },

  // ---------------------------------------------------------------- inspector
  renderInspector() {
    const box = $('#inspector'); box.innerHTML = '';
    const L = this.selLayer();
    if (!L) { box.append(h('p', { class: 'empty' }, '레이어를 선택하세요.')); return; }
    const M = registry.modules[L.type];
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
  },

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
  },

  upsertKey(L, keyId, v) {
    const ks = L.keys[keyId] = L.keys[keyId] || [];
    const t = +this.t.toFixed(4);
    const k = ks.find(k => Math.abs(k.t - t) < 0.5 / this.project.fps);
    if (k) k.v = v; else { ks.push({ t, v, e: (this.prefs && this.prefs.ease) || 'quintOut' }); ks.sort((a, b) => a.t - b.t); }
  },

  refreshInspectorValues() { if (this.paramRows) for (const f of this.paramRows) f(); if (this.timeRows) for (const f of this.timeRows) f(); },

  // visual-only params re-render immediately; simulation params re-simulate to the current frame when paused
  paramChanged(s, where) {
    this.needsRender = true;
    const simGroups = ['회전', '형태', '움직임', '반응', '그리드', '스크래치', '흐름 면', '세로 면', '물리', '가로지르기', '오브젝트', '생성', '터짐'];
    if (!this.playing && (where === 'react' || (where === 'params' && simGroups.includes(s.group)) || (where === 'common' && s.id === 'speed'))) {
      clearTimeout(this._resimT);
      this._resimT = setTimeout(() => { const f = this.engine.frame; this.engine.reset(); this.seekAsync(f); }, 350);
    }
  },

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
  },
  updateBgWarn() {
    const P = this.project;
    const risky = P.bg.mode === 'chroma' && (P.post.glow > 0.01 || P.layers.some(l => l.enabled && (l.blend !== 'over' || ['beam', 'particle', 'fluid', 'wave'].includes(l.type))));
    $('#bgWarn').classList.toggle('hidden', !risky);
  },
  sliderRow(label, obj, k, min, max, step, onCh, keyHost) {
    const row = h('div', { class: 'sl' + (keyHost ? ' k' : '') });
    const r = h('input', { type: 'range', min, max, step, value: obj[k] });
    const em = h('em', { text: (+obj[k]).toFixed(2) });
    r.addEventListener('input', () => { obj[k] = +r.value; em.textContent = (+r.value).toFixed(2); onCh && onCh(); this.needsRender = true; this.save(); });
    row.append(h('span', { text: label }), r, em);
    return row;
  },
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
  },
};
