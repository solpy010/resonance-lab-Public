// RESONANCE LAB 화면 — 씬 백업(하단 줄)·액트 저장/열기·자동 보관
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, h } from './dom.js';
import { report } from '../core/report.js';
import * as exportLib from '../export.js';
import * as registry from '../core/registry.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const shelf = {
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
            ...s.project.layers.slice().reverse().map(L => ({ label: (registry.modules[L.type] ? registry.modules[L.type].icon + '  ' : '') + L.name, dis: !registry.modules[L.type], fn: () => this.pasteLayers({ layers: [L], assets: this.layerAssets([L], s.project.assets), from: s.name }) })),
            '-', { label: '고른 레이어를 붙이지 않고 복사만 하려면: 그 씬을 열고 레이어 우클릭 → 복사', dis: true, fn: () => {} },
          ]), 0) },
          '-',
          { label: '이름 바꾸기…', fn: () => this.askText('씬 이름', s.name).then(n => { if (n) { s.name = n; this.persistShelf(); this.renderShelf(); } }) },
          '-',
          { label: '◀ 앞으로 이동', dis: i === 0, fn: () => mv(-1) },
          { label: '뒤로 이동 ▶', dis: i === this.shelf.length - 1, fn: () => mv(1) },
          '-',
          { label: '삭제', fn: () => { if (!confirm('"' + s.name + '" 씬 백업을 삭제할까요?')) return; this.shelf.splice(i, 1); if (this.shelfActive >= i) this.shelfActive--; this.persistShelf(); this.renderShelf(); } },
          { label: '모든 씬 지우기', fn: () => { if (!confirm('씬 백업 ' + this.shelf.length + '개를 모두 지울까요? (지우기 전 상태는 자동 보관됩니다)')) return; this.backupShelf('모두 지우기 전'); this.shelf = []; this.shelfActive = -1; this.persistShelf(); this.renderShelf(); } },
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
    catch (err) { report('error', '액트 저장 실패', err); alert('액트 저장 실패: ' + err.message); }
  },
  // 씬 백업을 바꾸거나 지우기 직전 상태를 남긴다 — 데스크톱: 자동 보관 폴더(최근 30개), 브라우저: 직전 1개(rlab.shelf.prev)
  backupShelf(why) {
    if (!this.shelf.length) return;
    const act = { type: 'rlab-act', version: 1, name: why, saved: new Date().toISOString(), active: this.shelfActive, scenes: this.shelf };
    const json = JSON.stringify(act);
    if (this.native && this.native.backup) {
      this.native.backup(why, new TextEncoder().encode(json))
        .then(f => { report('info', '씬 백업 자동 보관', act.scenes.length + '개', f); this.toast('이전 씬 백업 ' + act.scenes.length + '개 자동 보관 — 옵션 → 자동 보관 폴더 열기', 3500); })
        .catch(e => { report('error', '자동 보관 실패', e); this.toast('⚠ 자동 보관 실패: ' + e.message, 4000); });
    } else {
      try { localStorage.setItem('rlab.shelf.prev', json); } catch (e) { report('warn', '직전 씬 백업 보관 실패(저장 공간 부족)'); }
    }
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
    if (this.shelf.length && !confirm('현재 씬 백업 ' + this.shelf.length + '개를 이 액트(' + o.scenes.length + '씬)로 바꿀까요?\n(지금 씬 백업은 자동 보관됩니다)')) return;
    this.backupShelf('액트 열기 전');
    this.shelf = o.scenes; this.shelfActive = -1; this.persistShelf(); this.renderShelf();
    this.shelfLoad(0);
    this.toast('액트 열기: ' + o.scenes.length + '씬', 2000);
  },
};
