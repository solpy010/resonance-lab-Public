'use strict';
import { RL } from './core/rl.js';
import { $, h } from './ui.js';
import * as webgl from './gl.js';
import * as eng from './engine.js';
import * as exportLib from './export.js';
// RESONANCE LAB — menubar, resizable panels, zoom/pan, undo/redo, scene shelf (Ctrl+S), acts, asset loading

Object.assign(RL.App.prototype, {
  initV4() {
    this.zoom = 1; this.pan = { x: 0, y: 0 }; this.kfSel = []; this.kfClip = null;
    this.shelf = []; this.shelfActive = -1;
    try { const s = JSON.parse(localStorage.getItem('rlab.shelf') || 'null'); if (s && Array.isArray(s.scenes)) { this.shelf = s.scenes; this.shelfActive = s.active ?? -1; } } catch (e) { }
    try { const L = JSON.parse(localStorage.getItem('rlab.layout') || 'null'); if (L) this.applyLayout(L); } catch (e) { }
    this.prefs = Object.assign({ shelf: true }, JSON.parse(localStorage.getItem('rlab.prefs') || '{}'));
    document.body.classList.toggle('noshelf', !this.prefs.shelf);
    this.buildMenus();
    this.bindSplitters();
    this.bindZoom();
    this.bindShelf();
    this.renderShelf();
    this.engine.onAssetLoad = () => { this.needsRender = true; };
    if (this.native && this.native.gpuMode) this.native.gpuMode().then(m => { this.gpuMode = m; if (m === 'safe') { $('#ver').textContent += ' · 호환 모드'; this.toast('GPU 호환 모드(소프트웨어 렌더링)로 실행 중 — 옵션 메뉴에서 일반 모드로 되돌릴 수 있습니다', 4000); } });
  },

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
      const fresh = RL.modules[src.type] ? eng.newLayer(src.type) : null; if (!fresh) return null;
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

  // text input dialog (window.prompt is not available in the desktop app)
  askText(title, value) {
    return new Promise(res => {
      const bg = h('div', { style: 'position:fixed;inset:0;background:#0008;z-index:60;display:flex;align-items:center;justify-content:center' });
      const inp = h('input', { type: 'text', value: value || '', style: 'width:100%;margin:10px 0 12px;padding:6px 8px' });
      const done = (v) => { bg.remove(); res(v); };
      const box = h('div', { style: 'background:#16181d;border:1px solid var(--line2);border-radius:8px;padding:16px 18px;min-width:340px;box-shadow:0 10px 30px #000a' },
        h('b', { text: title }), inp,
        h('div', { style: 'display:flex;gap:8px;justify-content:flex-end' },
          h('button', { text: '취소', onclick: () => done(null) }), h('button', { text: '확인', class: 'pri', onclick: () => done(inp.value.trim()) })));
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
      bg.addEventListener('mousedown', e => { if (e.target === bg) done(null); });
      bg.append(box); document.body.append(bg); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  },

  // ------------------------------------------------------------ toast / ctx
  toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.add('hidden'), ms || 1600);
  },
  ctxMenu(x, y, items) {
    const c = $('#ctx'); c.innerHTML = '';
    for (const it of items) {
      if (it === '-') { c.append(h('div', { class: 'sep' })); continue; }
      c.append(h('div', { class: 'it' + (it.dis ? ' dis' : ''), onclick: () => { if (it.dis) return; c.classList.add('hidden'); it.fn(); } }, h('span', { class: 'ck' }), h('span', { class: 'lb', text: it.label })));
    }
    c.classList.remove('hidden');
    c.style.left = Math.min(x, innerWidth - 190) + 'px'; c.style.top = Math.min(y, innerHeight - c.offsetHeight - 6) + 'px';
    setTimeout(() => window.addEventListener('mousedown', function off(e) { if (!c.contains(e.target)) { c.classList.add('hidden'); window.removeEventListener('mousedown', off); } }), 0);
  },

  // ------------------------------------------------------------ menubar
  buildMenus() {
    const A = this, P = () => this.project;
    const tgView = (k) => ({ check: () => k in A.view ? !!A.view[k] : !!A.engine.view[k], fn: () => { const b = $(`.tg[data-view="${k}"]`); if (b) b.click(); } });
    const presetItems = Object.keys(RL.presets).map(k => ({ label: RL.presets[k].label, fn: () => { if (P().layers.length && !confirm('현재 작업을 이 프리셋으로 바꿀까요? (Ctrl+Z로 되돌릴 수 있습니다)')) return; A.loadProject(RL.presets[k].make(), true); } }));
    const scaleItems = [['0.25', '25%'], ['0.5', '50%'], ['1', '100%']].map(([v, l]) => ({ label: '미리보기 해상도 ' + l, check: () => String(A.engine.scale) === v, fn: () => { $('#scale').value = v; $('#scale').dispatchEvent(new Event('change')); } }));
    const addItems = Object.keys(RL.modules).map(k => ({ label: RL.modules[k].icon + '  ' + RL.modules[k].label + ' 추가', fn: () => A.addLayer(k) }));
    const easeItems = ['quintOut', 'inOut', 'expoOut', 'linear', 'hold'].filter(e => webgl.ease[e]).map(e => ({ label: '키프레임 이징: ' + e, check: () => (A.prefs.ease || 'quintOut') === e, fn: () => { A.prefs.ease = e; A.savePrefs(); } }));
    this.menus = [
      ['파일', [
        { label: '새 프로젝트', sc: 'Ctrl+N', fn: () => A.newProject() },
        { label: '프로젝트 열기…', sc: 'Ctrl+O', fn: () => $('#btnOpen').click() },
        { label: '프로젝트 파일로 저장…', sc: 'Ctrl+Shift+S', fn: () => $('#btnSave').click() },
        '-',
        { label: '현재 상태를 씬 백업 (하단)', sc: 'Ctrl+S', fn: () => A.shelfSave() },
        { label: '활성 씬 덮어쓰기', sc: 'Ctrl+Alt+S', fn: () => A.shelfSave(true) },
        { label: '액트 열기 (씬 묶음)…', fn: () => A.openAct() },
        { label: '액트 저장 (씬 묶음)…', fn: () => A.saveAct() },
        '-',
        { sub: '씬 프리셋' }, ...presetItems,
        '-',
        { label: '현재 프레임 PNG 저장', fn: () => $('#btnStill').click() },
        { label: '렌더 / 출력…', sc: 'Ctrl+M', fn: () => $('#btnRender').click() },
        { label: '오디오 불러오기…', fn: () => $('#aLoad').click() },
        ...(this.native ? ['-', { label: '종료', fn: () => window.close() }] : []),
      ]],
      ['편집', [
        { label: '되돌리기', sc: 'Ctrl+Z', dis: () => A.hist.length < 2, fn: () => A.undo() },
        { label: '다시 실행', sc: 'Ctrl+Y', dis: () => !A.redoStack.length, fn: () => A.redo() },
        '-',
        { sub: '레이어 추가' }, ...addItems,
        '-',
        { label: '선택 레이어 복사', sc: 'Ctrl+C', dis: () => !A.sel, fn: () => { const L = A.selLayer(); if (L) A.copyLayers([L]); } },
        { label: '모든 레이어 복사', dis: () => !P().layers.length, fn: () => A.copyLayers(P().layers.slice()) },
        { label: '레이어 붙여넣기 (다른 씬에서 복사한 것)', sc: 'Ctrl+V', dis: () => !A.getLayerClip(), fn: () => A.pasteLayers() },
        { label: '선택 레이어 복제', sc: 'Ctrl+D', dis: () => !A.sel, fn: () => A.layerAction(A.sel, 'dup') },
        { label: '선택 레이어 삭제', sc: 'Delete', dis: () => !A.sel, fn: () => A.layerAction(A.sel, 'del') },
        { label: '선택 레이어 보이기/숨기기', sc: 'H', dis: () => !A.sel, fn: () => A.layerAction(A.sel, 'toggle') },
        { label: '선택 레이어 위로', sc: 'Ctrl+]', dis: () => !A.sel, fn: () => A.layerAction(A.sel, 'up') },
        { label: '선택 레이어 아래로', sc: 'Ctrl+[', dis: () => !A.sel, fn: () => A.layerAction(A.sel, 'down') },
        { label: '선택 레이어의 키프레임 모두 삭제', dis: () => !A.sel, fn: () => { const L = A.selLayer(); if (L && confirm('이 레이어의 키프레임을 모두 지울까요?')) { L.keys = {}; A.renderInspector(); A.drawTimeline(); A.paramChanged({ group: '형태' }, 'react'); A.save(); } } },
        '-',
        { label: '현재 위치에 마커 추가', sc: 'M', fn: () => { P().markers.push({ t: +A.t.toFixed(4), s: 1 }); A.markersChanged(); } },
        { label: '마커 모두 지우기', fn: () => $('#mClear').click() },
      ]],
      ['보기', [
        { label: '면 가이드', ...tgView('guides') },
        { label: '흑백 검수', ...tgView('grayscale') },
        { label: '10% 축소 검수', ...tgView('thumb') },
        { label: '글로우 끄기', ...tgView('glowOff') },
        { label: '체커보드(투명 확인)', ...tgView('checker') },
        { label: '이음새 확인(반 바퀴 회전)', ...tgView('seam') },
        '-',
        { label: '확대', sc: 'Ctrl+=', fn: () => A.zoomBy(1.25) },
        { label: '축소', sc: 'Ctrl+−', fn: () => A.zoomBy(0.8) },
        { label: '화면에 맞춤', sc: 'Ctrl+0', fn: () => A.zoomFit() },
        { label: '100% (출력 1:1 픽셀)', sc: 'Ctrl+1', fn: () => A.zoom1to1() },
        '-',
        ...scaleItems,
        '-',
        { label: '하단 씬 백업 줄 표시', check: () => A.prefs.shelf, fn: () => { A.prefs.shelf = !A.prefs.shelf; document.body.classList.toggle('noshelf', !A.prefs.shelf); A.savePrefs(); A.layoutStage(); } },
        { label: '패널 크기 초기화', fn: () => { A.applyLayout({ lw: 300, rw: 380, bh: 196 }); A.saveLayout(); } },
      ]],
      ['옵션', [
        { label: '360° 좌우 연결 (모든 레이어)', check: () => !!P().wrap, fn: () => A.setWrap(!P().wrap) },
        { label: '재생 시 소리', check: () => $('#aPlay').checked, fn: () => { $('#aPlay').checked = !$('#aPlay').checked; } },
        { label: '반복 재생', check: () => $('#tLoop').checked, fn: () => { $('#tLoop').checked = !$('#tLoop').checked; } },
        { label: '마커 임팩트 프레임', check: () => P().impact.enabled, fn: () => { P().impact.enabled = !P().impact.enabled; A.renderTimePanel(); A.save(); } },
        '-',
        { sub: '새 키프레임 이징' }, ...easeItems,
        ...(this.native && this.native.relaunch ? ['-', { label: 'GPU 호환 모드(소프트웨어 렌더링) — 다시 시작', check: () => A.gpuMode === 'safe', fn: () => { if (confirm(A.gpuMode === 'safe' ? '일반 GPU 모드로 다시 시작할까요?' : '호환 모드로 다시 시작할까요? (그래픽 가속이 안 되는 PC용, 느림)')) { A.flushHistory(); A.native.relaunch(A.gpuMode !== 'safe'); } } }] : []),
      ]],
      ['도움말', [
        { label: '사용법', sc: 'F1', fn: () => A.help('usage') },
        { label: '단축키', fn: () => A.help('keys') },
        { label: '리듬게임 · 오브젝트 유영 레이어', fn: () => A.help('rhythm') },
        '-',
        { label: 'RESONANCE LAB 정보', fn: () => A.help('about') },
      ]],
    ];
    const bar = $('#menubar'); bar.innerHTML = '';
    let openOne = null;
    const close = () => { if (openOne) openOne.classList.remove('open'); openOne = null; };
    for (const [name, items] of this.menus) {
      const dd = h('div', { class: 'dd' });
      const mi = h('div', { class: 'mi' }, name, dd);
      const fill = () => {
        dd.innerHTML = '';
        for (const it of items) {
          if (it === '-') { dd.append(h('div', { class: 'sep' })); continue; }
          if (it.sub) { dd.append(h('div', { class: 'sub', text: it.sub })); continue; }
          const dis = it.dis && it.dis();
          dd.append(h('div', { class: 'it' + (dis ? ' dis' : ''), onmousedown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); close(); it.fn(); } },
            h('span', { class: 'ck', text: it.check && it.check() ? '✓' : '' }), h('span', { class: 'lb', text: it.label }), h('span', { class: 'sc', text: it.sc || '' })));
        }
      };
      mi.addEventListener('mousedown', e => { e.stopPropagation(); if (openOne === mi) { close(); return; } close(); fill(); mi.classList.add('open'); openOne = mi; });
      mi.addEventListener('mouseenter', () => { if (openOne && openOne !== mi) { close(); fill(); mi.classList.add('open'); openOne = mi; } });
      bar.append(mi);
    }
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
  },
  savePrefs() { try { localStorage.setItem('rlab.prefs', JSON.stringify(this.prefs)); } catch (e) { } },

  newProject() {
    if (this.project.layers.length && !confirm('새 프로젝트를 만들까요? (Ctrl+Z로 되돌릴 수 있습니다)')) return;
    const p = eng.defaultProject(); p.name = 'Untitled';
    this.loadProject(p, true);
  },

  setWrap(on) {
    this.project.wrap = !!on;
    const b = $('.tg[data-view="wrap"]'); if (b) b.classList.toggle('on', !!on);
    this.toast(on ? '360° 좌우 연결 켬 — 화면 끝을 넘으면 반대편으로 이어집니다' : '360° 좌우 연결 끔');
    this.resetSim();
  },

  // ------------------------------------------------------------ help
  help(which) {
    const T = {
      usage: ['사用법'.replace('用', '용'), `
<h4>3층 구조</h4><p>왼쪽에서 레이어(1층 형태)를 쌓고, 오른쪽 인스펙터에서 물성·빛(2층)과 마커 반응(3층)을 조정합니다. 레이어 합성은 일반·더하기·스크린·곱하기·하드라이트 등 10종.</p>
<h4>씬 백업과 액트</h4><p><b>Ctrl+S</b>를 누르면 현재 상태가 화면 하단 '씬 백업' 줄에 썸네일 아이콘으로 쌓입니다. 아이콘을 클릭하면 그 씬을 불러오고, PageUp/PageDown으로 순서대로 넘겨볼 수 있습니다. 우클릭으로 이름 바꾸기·덮어쓰기·순서 이동·삭제. <b>액트 저장</b>은 모든 씬을 한 파일(.rlab-act.json)로 묶어 저장합니다.</p>
<h4>되돌리기</h4><p>Ctrl+Z 최대 10단계, Ctrl+Y(또는 Ctrl+Shift+Z) 다시 실행. 프리셋·씬 불러오기도 되돌릴 수 있습니다.</p>
<h4>키프레임 편집(타임라인)</h4><p>인스펙터의 ◆로 현재 시간에 키프레임을 추가하고, 하단 타임라인에서 직접 편집합니다: 키프레임을 <b>드래그해 이동</b>, 빈 곳을 <b>드래그해 사각형 다중 선택</b>(Shift로 추가), <b>더블클릭·우클릭으로 삭제</b>, Delete로 선택 삭제, <b>Ctrl+C/Ctrl+V로 복사·재생헤드 위치에 붙여넣기</b>. 선택한 키프레임은 하늘색으로 표시됩니다.</p>
<h4>미리보기 확대</h4><p>마우스 휠로 커서 위치 중심 확대·축소, 휠 버튼 드래그 또는 Alt+드래그로 이동, 더블클릭으로 맞춤.</p>
<h4>패널 크기</h4><p>좌·우 패널 경계와 타임라인 위 경계를 드래그해 크기를 바꿉니다(자동 기억).</p>
<h4>360° 좌우 연결</h4><p>옵션 메뉴 또는 상단 토글. 켜면 모든 레이어의 노이즈·파동·유체·입자·라인이 좌우 끝에서 이음새 없이 이어집니다. '이음새 확인'으로 화면을 반 바퀴 돌려 경계를 검수하세요.</p>
<h4>출력</h4><p>렌더/출력에서 PNG 시퀀스(알파), ProRes 4444(데스크톱), MP4. 출력은 항상 0프레임부터 100% 해상도로 다시 시뮬레이션합니다.</p>`],
      keys: ['단축키', `<table>
<tr><td>Ctrl+S</td><td>씬 백업 (하단 아이콘 추가)</td></tr><tr><td>Ctrl+Alt+S</td><td>활성 씬 덮어쓰기</td></tr><tr><td>Ctrl+Shift+S</td><td>프로젝트 파일로 저장</td></tr>
<tr><td>Ctrl+O / Ctrl+N</td><td>열기 / 새 프로젝트</td></tr><tr><td>Ctrl+Z</td><td>되돌리기 (10단계)</td></tr><tr><td>Ctrl+Y · Ctrl+Shift+Z</td><td>다시 실행</td></tr>
<tr><td>Ctrl+C / Ctrl+V</td><td>레이어 복사 / 붙여넣기 (다른 씬·씬 백업 사이에서도 가능 · 키프레임을 선택했을 땐 키프레임 복사)</td></tr><tr><td>Ctrl+D / Delete</td><td>레이어 복제 / 삭제</td></tr><tr><td>Ctrl+[ / Ctrl+]</td><td>레이어 아래로 / 위로</td></tr><tr><td>H</td><td>선택 레이어 보이기/숨기기</td></tr>
<tr><td>Space</td><td>재생 / 정지</td></tr><tr><td>← → (Shift)</td><td>1 (10) 프레임 이동</td></tr><tr><td>Home</td><td>처음으로</td></tr>
<tr><td>T / M</td><td>재생 중 탭 마커 / 현재 위치 마커</td></tr><tr><td>PageUp / PageDown</td><td>이전 / 다음 씬</td></tr>
<tr><td>휠 · Ctrl+= · Ctrl+−</td><td>미리보기 확대 · 축소</td></tr><tr><td>Ctrl+0 / Ctrl+1</td><td>맞춤 / 1:1</td></tr><tr><td>휠버튼·Alt+드래그</td><td>미리보기 이동</td></tr>
<tr><td>Ctrl+M</td><td>렌더 / 출력</td></tr><tr><td>F1</td><td>사용법</td></tr><tr><td colspan=2 style="color:#8fd0ff;padding-top:8px">타임라인 키프레임</td></tr><tr><td>드래그</td><td>키프레임 이동(여러 개 선택 시 함께)</td></tr><tr><td>빈 곳 드래그</td><td>사각형으로 다중 선택(Shift=추가)</td></tr><tr><td>더블클릭·우클릭</td><td>키프레임 삭제</td></tr><tr><td>Delete</td><td>선택한 키프레임 삭제</td></tr><tr><td>Ctrl+C / Ctrl+V</td><td>키프레임 복사 / 재생헤드에 붙여넣기</td></tr><tr><td>Shift+드래그</td><td>자석 스냅(다른 키프레임·마커·재생헤드에 딱 붙음)</td></tr></table>`],
      rhythm: ['리듬게임 · 오브젝트 유영', `
<h4>리듬게임 레이어</h4><p>심벌(기본: 베이스 기타 라인아트)은 고정, 노트가 위에서 떨어져 <b>마커 시점에 정확히 심벌에 닿고</b> 그 순간 이펙트가 터집니다. 타격이 쌓일수록 심벌이 밝고 두껍고 화려해집니다(누적 증가/감소). 카메라는 움직이지 않습니다.</p>
<p><b>노트 도착 싱크</b>와 <b>이펙트 터짐 싱크</b>는 별도 슬라이더(ms)입니다. 소리보다 눈이 늦게 느껴지면 −로 당기세요. <b>노트 낙하 시간</b>만큼 노트가 먼저 출발합니다.</p>
<p>표시 그룹의 체크박스로 심벌·노트·이펙트를 각각 켜고 끕니다. 심벌·노트·이펙트는 이미지(PNG)나 짧은 영상(MP4/WebM)으로 바꿀 수 있습니다 — 영상은 최대 48프레임 아틀라스로 변환되어 저장되며, 검은 배경은 '검정=투명'으로 처리됩니다.</p>
<p>추천 조합: 아래에 <b>라인 → 비(rain)</b> 레이어(세로로 쏟아지는 네온선), 위에 리듬게임 레이어. 프리셋 '리듬게임 인게임'을 참고하세요.</p>
<h4>오브젝트 유영 레이어</h4><p>오브젝트가 화면 하단 바깥에서 태어나 부력·중력·저항을 받아 위로 떠오르고, 마커마다 <b>터지는 비율</b>만큼(일부 ↔ 전체) 팡 터지며 사라집니다. 크기·편차·원근감·좌우 운동 폭/빈도·바람·회전·서로 부딪힘 조절. 기본은 징·북·장구·꽹과리·기타 라인아트이며 이미지/영상을 여러 개 첨부할 수 있습니다.</p>`],
      about: ['RESONANCE LAB 정보', `<p><b>RESONANCE LAB v__RLAB_VERSION__</b> — 2027 베오그라드 엑스포 한국관 공연 영상용 AE 리소스 시뮬레이터.</p><p>독자 구현(clean-room). 결정론적 프레임 시계: 같은 프로젝트·Seed면 언제나 같은 프레임.</p><p>오픈소스: mp4-muxer (MIT)${this.native ? ', FFmpeg (LGPL/GPL, 데스크톱 번들)' : ''}.</p><p><b>라이센스: 퍼블릭 도메인 (Public Domain)</b> · 저작권을 포기하여 누구나 자유롭게 사용·수정·배포할 수 있습니다. (포함 오픈소스는 위 각 라이선스를 따릅니다.)</p>`],
    }[which];
    $('#helpTitle').textContent = T[0]; $('#helpBody').innerHTML = T[1];
    $('#helpModal').classList.remove('hidden');
    $('#helpClose').onclick = () => $('#helpModal').classList.add('hidden');
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

  // ------------------------------------------------------------ undo / redo (10 steps)
  historyReset() { this.hist = [JSON.stringify(this.project)]; this.redoStack = []; },
  historyCommit(j) {
    if (this._restoring) return;
    if (!this.hist) { this.hist = [j]; this.redoStack = []; return; }
    if (this.hist[this.hist.length - 1] === j) return;
    this.hist.push(j); if (this.hist.length > 11) this.hist.shift();
    this.redoStack = [];
  },
  flushHistory() { if (this._saveT) { if (this._saveT !== 1) clearTimeout(this._saveT); this._saveT = null; const j = JSON.stringify(this.project); this.historyCommit(j); try { localStorage.setItem('rlab.autosave', j); } catch (e) { } } },
  undo() {
    this.flushHistory();
    if (this.hist.length < 2) { this.toast('더 되돌릴 수 없습니다'); return; }
    this.redoStack.push(this.hist.pop());
    this.restoreJSON(this.hist[this.hist.length - 1]);
    this.toast('되돌리기 (' + (this.hist.length - 1) + '단계 남음)', 900);
  },
  redo() {
    this.flushHistory();
    if (!this.redoStack.length) { this.toast('다시 실행할 작업이 없습니다'); return; }
    const j = this.redoStack.pop(); this.hist.push(j);
    this.restoreJSON(j);
    this.toast('다시 실행', 900);
  },
  restoreJSON(j) {
    const f = this.engine.frame, sel = this.sel, scroll = $('#right').scrollTop, wasPlaying = this.playing;
    this._restoring = true;
    try { this.loadProject(JSON.parse(j), false, sel); } finally { this._restoring = false; }
    $('#right').scrollTop = scroll;
    this.seekAsync(f);
    if (wasPlaying) this.play();
  },

  // ------------------------------------------------------------ shortcuts
  shortcut(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !['range', 'checkbox', 'color'].includes(document.activeElement.type);
    if (k === 'F1') { e.preventDefault(); this.help('usage'); return true; }
    if (k === 'Escape') { $('#helpModal').classList.add('hidden'); $('#ctx').classList.add('hidden'); if (this.kfSel && this.kfSel.length) { this.kfSel = []; this.drawTimeline(); } return false; }
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 's') { e.preventDefault(); if (e.shiftKey) $('#btnSave').click(); else this.shelfSave(e.altKey); return true; }
      if (lk === 'z' && !inField) { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return true; }
      if (lk === 'y' && !inField) { e.preventDefault(); this.redo(); return true; }
      if (lk === 'o') { e.preventDefault(); $('#btnOpen').click(); return true; }
      if (lk === 'n') { e.preventDefault(); this.newProject(); return true; }
      if (lk === 'm') { e.preventDefault(); $('#btnRender').click(); return true; }
      if (inField) return false;
      if (lk === 'c' && this.kfSel && this.kfSel.length) { e.preventDefault(); this.copyKeys(); this.lastClip = 'keys'; return true; }
      if (lk === 'c' && this.sel) { e.preventDefault(); this.copyLayers([this.selLayer()]); return true; }
      if (lk === 'v' && this.lastClip !== 'layer' && this.kfClip && this.kfClip.length) { e.preventDefault(); this.pasteKeys(); return true; }
      if (lk === 'v' && this.getLayerClip()) { e.preventDefault(); this.pasteLayers(); return true; }
      if (lk === 'd') { e.preventDefault(); if (this.sel) this.layerAction(this.sel, 'dup'); return true; }
      if (k === '=' || k === '+') { e.preventDefault(); this.zoomBy(1.25); return true; }
      if (k === '-' || k === '_') { e.preventDefault(); this.zoomBy(0.8); return true; }
      if (k === '0') { e.preventDefault(); this.zoomFit(); return true; }
      if (k === '1') { e.preventDefault(); this.zoom1to1(); return true; }
      if (k === ']') { e.preventDefault(); if (this.sel) this.layerAction(this.sel, 'up'); return true; }
      if (k === '[') { e.preventDefault(); if (this.sel) this.layerAction(this.sel, 'down'); return true; }
      return false;
    }
    if (inField || e.altKey) return false;
    if (k === 'PageUp') { e.preventDefault(); this.shelfStep(-1); return true; }
    if (k === 'PageDown') { e.preventDefault(); this.shelfStep(1); return true; }
    if ((k === 'Delete' || k === 'Backspace') && this.kfSel && this.kfSel.length) { this.deleteKeys(this.kfSel.slice()); return true; }
    if (k === 'Delete' && this.sel) { this.layerAction(this.sel, 'del'); return true; }
    if ((k === 'h' || k === 'H') && this.sel) { this.layerAction(this.sel, 'toggle'); return true; }
    if (k === 'm' || k === 'M') { this.project.markers.push({ t: +this.t.toFixed(4), s: 1 }); this.markersChanged(); return true; }
    return false;
  },

  // ------------------------------------------------------------ scene shelf
  snapThumb() {
    const E = this.engine; E.render(); E.present();
    const c = document.createElement('canvas'), a = E.canvas.width / E.canvas.height;
    c.width = 240; c.height = Math.max(24, Math.round(240 / a));
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(E.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  },
  shelfSave(overwrite) {
    this.flushHistory();
    const scene = { name: this.project.name || '씬', time: Date.now(), frame: this.engine.frame, thumb: this.snapThumb(), project: JSON.parse(JSON.stringify(this.project)) };
    if (overwrite && this.shelf[this.shelfActive]) { scene.name = this.shelf[this.shelfActive].name; this.shelf[this.shelfActive] = scene; this.toast('씬 ' + (this.shelfActive + 1) + ' 덮어씀'); }
    else {
      const ins = this.shelfActive >= 0 ? this.shelfActive + 1 : this.shelf.length;
      let base = scene.name, n = 1; while (this.shelf.some(s => s.name === scene.name)) scene.name = base + ' ' + (++n);
      this.shelf.splice(ins, 0, scene); this.shelfActive = ins; this.toast('씬 백업 저장 — ' + (ins + 1) + '번 · ' + scene.name);
    }
    this.persistShelf(); this.renderShelf();
    if (this.native && this.nativePath) this.native.writePath(this.nativePath, new TextEncoder().encode(JSON.stringify(this.project, null, 2))).catch(() => { });
  },
  shelfLoad(i) {
    const s = this.shelf[i]; if (!s) return;
    this.flushHistory();
    this.shelfActive = i; this.persistShelf(true);
    this.loadProject(JSON.parse(JSON.stringify(s.project)));
    this.renderShelf();
    if (s.frame > 1) this.seekAsync(s.frame);
  },
  shelfStep(d) { if (!this.shelf.length) return; const i = Math.max(0, Math.min(this.shelf.length - 1, (this.shelfActive < 0 ? (d > 0 ? -1 : this.shelf.length) : this.shelfActive) + d)); if (i !== this.shelfActive) this.shelfLoad(i); },
  persistShelf(quiet) {
    try { localStorage.setItem('rlab.shelf', JSON.stringify({ active: this.shelfActive, scenes: this.shelf })); $('#shInfo').textContent = ''; }
    catch (e) { $('#shInfo').textContent = '⚠ 브라우저 저장 공간 부족 — 액트 저장으로 파일에 보관하세요'; if (!quiet) this.toast('저장 공간이 부족합니다. 액트 저장을 권장합니다.', 3000); }
  },
  bindShelf() {
    $('#shAdd').addEventListener('click', () => this.shelfSave());
    $('#shPrev').addEventListener('click', () => this.shelfStep(-1));
    $('#shNext').addEventListener('click', () => this.shelfStep(1));
    $('#shSaveAct').addEventListener('click', () => this.saveAct());
    $('#shOpenAct').addEventListener('click', () => this.openAct());
    $('#fileAct').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) this.loadAct(await f.text(), f.name); });
    $('#shelfList').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $('#shelfList').scrollLeft += e.deltaY; } }, { passive: false });
  },
  renderShelf() {
    const box = $('#shelfList'); box.innerHTML = '';
    if (!this.shelf.length) { box.append(h('div', { class: 'empty', text: 'Ctrl+S를 누르면 현재 씬이 여기에 아이콘으로 백업됩니다. 아이콘을 클릭하면 그 씬을 다시 불러옵니다.' })); return; }
    this.shelf.forEach((s, i) => {
      const el = h('div', { class: 'slot' + (i === this.shelfActive ? ' on' : ''), title: s.name + ' — ' + new Date(s.time).toLocaleString() + '\n클릭: 불러오기 · 우클릭: 메뉴', onclick: () => this.shelfLoad(i) },
        h('img', { src: s.thumb, draggable: 'false' }), h('i', { text: String(i + 1) }), h('span', { text: s.name }));
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        const mv = (d) => { const j = i + d; if (j < 0 || j >= this.shelf.length) return; [this.shelf[i], this.shelf[j]] = [this.shelf[j], this.shelf[i]]; if (this.shelfActive === i) this.shelfActive = j; else if (this.shelfActive === j) this.shelfActive = i; this.persistShelf(); this.renderShelf(); };
        this.ctxMenu(e.clientX, e.clientY, [
          { label: '불러오기', fn: () => this.shelfLoad(i) },
          { label: '현재 상태로 덮어쓰기', fn: () => { this.shelfActive = i; this.shelfSave(true); } },
          { label: '이 씬의 모든 레이어 → 현재 씬에 붙여넣기', dis: !(s.project && s.project.layers && s.project.layers.length), fn: () => this.pasteLayers({ layers: s.project.layers, assets: this.layerAssets(s.project.layers, s.project.assets), from: s.name }) },
          { label: '이 씬의 레이어 하나 골라 가져오기 ▸', dis: !(s.project && s.project.layers && s.project.layers.length), fn: () => setTimeout(() => this.ctxMenu(e.clientX + 12, e.clientY, [
            { label: '「' + s.name + '」 레이어 — 클릭하면 현재 씬에 붙여넣기', dis: true, fn: () => {} }, '-',
            ...s.project.layers.slice().reverse().map(L => ({ label: (RL.modules[L.type] ? RL.modules[L.type].icon + '  ' : '') + L.name, dis: !RL.modules[L.type], fn: () => this.pasteLayers({ layers: [L], assets: this.layerAssets([L], s.project.assets), from: s.name }) })),
            '-', { label: '고른 레이어를 붙이지 않고 복사만 하려면: 그 씬을 열고 레이어 우클릭 → 복사', dis: true, fn: () => {} },
          ]), 0) },
          '-',
          { label: '이름 바꾸기…', fn: () => this.askText('씬 이름', s.name).then(n => { if (n) { s.name = n; this.persistShelf(); this.renderShelf(); } }) },
          '-',
          { label: '◀ 앞으로 이동', dis: i === 0, fn: () => mv(-1) },
          { label: '뒤로 이동 ▶', dis: i === this.shelf.length - 1, fn: () => mv(1) },
          '-',
          { label: '삭제', fn: () => { if (!confirm('"' + s.name + '" 씬 백업을 삭제할까요?')) return; this.shelf.splice(i, 1); if (this.shelfActive >= i) this.shelfActive--; this.persistShelf(); this.renderShelf(); } },
          { label: '모든 씬 지우기', fn: () => { if (!confirm('씬 백업 ' + this.shelf.length + '개를 모두 지울까요? (먼저 액트 저장을 권장)')) return; this.shelf = []; this.shelfActive = -1; this.persistShelf(); this.renderShelf(); } },
        ]);
      });
      box.append(el);
    });
    const on = box.children[this.shelfActive]; if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  async saveAct() {
    if (!this.shelf.length) { this.toast('먼저 Ctrl+S로 씬을 백업하세요'); return; }
    const act = { type: 'rlab-act', version: 1, name: this.project.name, saved: new Date().toISOString(), active: this.shelfActive, scenes: this.shelf };
    const json = JSON.stringify(act), name = exportLib.safeName(this.project.name || 'act') + '.rlab-act.json';
    if (!this.native) { exportLib.download(new Blob([json], { type: 'application/json' }), name); return; }
    try { const f = await this.native.saveDialog(name, 'json'); if (f) { await this.native.writePath(f, new TextEncoder().encode(json)); this.toast('액트 저장: ' + f, 2500); } }
    catch (err) { alert('액트 저장 실패: ' + err.message); }
  },
  async openAct() {
    if (!this.native) { $('#fileAct').click(); return; }
    try { const r = await this.native.openProject(); if (r) this.loadAct(r.text, r.path); } catch (err) { alert('파일을 읽을 수 없습니다: ' + err.message); }
  },
  loadAct(text, name) {
    let o; try { o = JSON.parse(text); } catch (e) { alert('액트 파일을 읽을 수 없습니다.'); return; }
    if (o.type !== 'rlab-act' || !Array.isArray(o.scenes)) {
      if (o.layers) { this.loadProject(o); this.toast('프로젝트 파일이라 현재 씬으로 열었습니다'); return; }
      alert('RESONANCE LAB 액트 파일이 아닙니다.'); return;
    }
    if (this.shelf.length && !confirm('현재 씬 백업 ' + this.shelf.length + '개를 이 액트(' + o.scenes.length + '씬)로 바꿀까요?')) return;
    this.shelf = o.scenes; this.shelfActive = -1; this.persistShelf(); this.renderShelf();
    this.shelfLoad(0);
    this.toast('액트 열기: ' + o.scenes.length + '씬', 2000);
  },

  // ------------------------------------------------------------ assets (image / short video)
  assetPicker(get, set) {
    const P = this.project, box = h('div', { class: 'asset' });
    const sel = h('select', {}, h('option', { value: '', text: '— 기본 —' }), Object.entries(P.assets || {}).map(([id, a]) => h('option', { value: id, text: (a.kind === 'atlas' ? '🎞 ' : '🖼 ') + a.name })));
    sel.value = get() || '';
    sel.addEventListener('change', () => set(sel.value));
    const load = h('button', { title: '이미지(PNG/JPG) 또는 짧은 영상(MP4/WebM) 불러오기', onclick: async () => { const id = await this.importAsset(); if (id) { set(id); this.renderInspector(); } } }, '불러오기');
    const cur = get() && P.assets[get()];
    box.append(sel, load);
    if (cur) box.append(h('button', { title: cur.luma ? '현재: 검정=투명(밝기를 알파로). 클릭하면 원본 알파' : '현재: 원본 알파. 클릭하면 검정=투명', onclick: () => { cur.luma = !cur.luma; this.engine.assets.delete(get()); this.engine.syncAssets(); this.renderInspector(); this.needsRender = true; this.save(); } }, cur.luma ? '검정=투명' : '알파'));
    return box;
  },
  assetListUI(get, onChange) {
    const P = this.project, box = h('div', { class: 'alist' });
    const arr = get();
    arr.forEach((id, i) => { const a = P.assets[id]; if (!a) return; box.append(h('span', { class: 'chip' }, h('b', { text: (a.kind === 'atlas' ? '🎞 ' : '🖼 ') + a.name }), h('button', { title: '빼기', onclick: () => { arr.splice(i, 1); onChange(); this.renderInspector(); } }, '✕'))); });
    const pick = h('select', {}, h('option', { value: '', text: '+ 기존 소스' }), Object.entries(P.assets || {}).filter(([id]) => !arr.includes(id)).map(([id, a]) => h('option', { value: id, text: a.name })));
    pick.addEventListener('change', () => { if (pick.value) { arr.push(pick.value); onChange(); this.renderInspector(); } });
    box.append(h('button', { onclick: async () => { const id = await this.importAsset(); if (id) { arr.push(id); onChange(); this.renderInspector(); } } }, '+ 이미지/영상 추가'));
    if (Object.keys(P.assets || {}).length > arr.length) box.append(pick);
    return box;
  },
  importAsset() {
    return new Promise(res => {
      const inp = $('#fileAsset');
      inp.onchange = async () => {
        const f = inp.files[0]; inp.value = ''; if (!f) { res(null); return; }
        $('#busy').classList.remove('hidden'); $('#busyText').textContent = '소스 변환 중… ' + f.name; $('#busyBar').style.width = '10%';
        try {
          const meta = f.type.startsWith('video') ? await RL.videoToAtlas(f, p => { $('#busyBar').style.width = (p * 100) + '%'; }) : await RL.imageToAsset(f);
          const id = 'A' + Math.random().toString(36).slice(2, 8);
          this.project.assets = this.project.assets || {};
          this.project.assets[id] = Object.assign({ name: f.name.replace(/\.[^.]+$/, '') }, meta);
          this.engine.syncAssets();
          await this.engine.assetsReady();
          this.needsRender = true; this.save();
          res(id);
        } catch (e) { alert('소스를 불러올 수 없습니다: ' + e.message); res(null); }
        finally { $('#busy').classList.add('hidden'); }
      };
      inp.click();
    });
  },
});

RL.imageToAsset = async function (file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('이미지 디코딩 실패')); i.src = url; });
    const M = 768, k = Math.min(1, M / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const jpg = !/png|webp|gif|svg/i.test(file.type);
    return { kind: 'image', src: c.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.9), cols: 1, rows: 1, frames: 1, fps: 24, luma: false };
  } finally { URL.revokeObjectURL(url); }
};

// short video → sprite atlas (≤48 frames, cell ≤256px). Black background becomes transparent (luma) by default.
RL.videoToAtlas = async function (file, progress) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('영상 디코딩 실패(MP4 H.264 또는 WebM 권장)')); });
    const dur = Math.max(0.05, Math.min(v.duration || 1, 8));
    const frames = Math.max(1, Math.min(48, Math.round(dur * 12)));
    const fps = frames / dur;
    const cell = 256, k = Math.min(1, cell / Math.max(v.videoWidth, v.videoHeight));
    const cw = Math.max(2, Math.round(v.videoWidth * k)), ch = Math.max(2, Math.round(v.videoHeight * k));
    const cols = Math.ceil(Math.sqrt(frames)), rows = Math.ceil(frames / cols);
    const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < frames; i++) {
      const t = Math.min(dur - 0.001, (i + 0.5) / fps);
      await new Promise(ok => { v.onseeked = ok; v.currentTime = t; });
      g.drawImage(v, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
      progress && progress((i + 1) / frames);
    }
    return { kind: 'atlas', src: c.toDataURL('image/jpeg', 0.85), cols, rows, frames, fps, luma: true };
  } finally { URL.revokeObjectURL(url); }
};

// ---------------------------------------------------------------- timeline keyframe editing (v0.4)
Object.assign(RL.App.prototype, {
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
});
