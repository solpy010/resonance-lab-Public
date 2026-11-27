// RESONANCE LAB 화면 — 되돌리기·다시 실행
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $ } from './dom.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const history = {
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
};
