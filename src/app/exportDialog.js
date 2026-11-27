// RESONANCE LAB 화면 — 출력 창
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, $$ } from './dom.js';
import { report } from '../core/report.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const exportDialog = {
  // ---------------------------------------------------------------- export
  openModal() {
    this.pause();
    this.exFmt = this.exFmt || 'png';
    $('#exFrom').value = 0; $('#exTo').value = this.project.duration;
    $('#exBar').style.width = '0'; $('#exStatus').textContent = '';
    $('#exGo').disabled = false; $('#exCancel').textContent = '닫기';
    $('#modal').classList.remove('hidden');
    this.updateModal();
  },
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
  },
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
  },
  exProgress(p, s) { $('#exBar').style.width = (p * 100).toFixed(1) + '%'; $('#exStatus').textContent = s; },
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
    catch (e) { console.error(e); report('error', '출력 오류', e); if (inModal) $('#exStatus').textContent = '오류: ' + e.message; else alert('출력 오류: ' + e.message); }
    this.exporting = false;
    $('#busy').classList.add('hidden');
    this.seekAsync(prevFrame);
  },
};
