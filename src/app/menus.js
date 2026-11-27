// RESONANCE LAB 화면 — 화면 초기화·메뉴·대화상자·알림·단축키·도움말
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, h } from './dom.js';
import * as webgl from '../gl.js';
import * as eng from '../engine.js';
import * as registry from '../core/registry.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const menus = {
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
    const presetItems = Object.keys(registry.presets).map(k => ({ label: registry.presets[k].label, fn: () => { if (P().layers.length && !confirm('현재 작업을 이 프리셋으로 바꿀까요? (Ctrl+Z로 되돌릴 수 있습니다)')) return; A.loadProject(registry.presets[k].make(), true); } }));
    const scaleItems = [['0.25', '25%'], ['0.5', '50%'], ['1', '100%']].map(([v, l]) => ({ label: '미리보기 해상도 ' + l, check: () => String(A.engine.scale) === v, fn: () => { $('#scale').value = v; $('#scale').dispatchEvent(new Event('change')); } }));
    const addItems = Object.keys(registry.modules).map(k => ({ label: registry.modules[k].icon + '  ' + registry.modules[k].label + ' 추가', fn: () => A.addLayer(k) }));
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
        ...(this.native && this.native.openDir ? ['-', { label: '자동 보관 폴더 열기 (씬 백업 교체·삭제 전 상태)', fn: () => A.native.openDir('backups') }, { label: '기록(로그) 폴더 열기', fn: () => A.native.openDir('log') }] : []),
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

  // ------------------------------------------------------------ shortcuts
  shortcut(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !['range', 'checkbox', 'color'].includes(/** @type {HTMLInputElement} */ (document.activeElement).type);
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
};
