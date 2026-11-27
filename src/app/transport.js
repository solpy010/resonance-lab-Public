// RESONANCE LAB 화면 — 시간 패널·재생·탐색·프레임 루프
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, h, fmtTime } from './dom.js';
import * as eng from '../engine.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const transport = {
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
  },

  // ---------------------------------------------------------------- markers
  markersChanged() {
    const P = this.project;
    P.markers.sort((a, b) => a.t - b.t);
    this.refreshSchedules();
    this.updateMarkerCount(); this.drawTimeline(); this.save(true);
  },
  refreshSchedules() {
    const E = this.engine, t = this.t;
    E.buildGlobalSchedule(); E.gPtr = E.globalEvents.findIndex(e => e.t >= t); if (E.gPtr < 0) E.gPtr = E.globalEvents.length;
    for (const L of E.layers) { L.events = E.buildSchedule(L); L.evPtr = L.events.findIndex(e => e.t >= t); if (L.evPtr < 0) L.evPtr = L.events.length; }
  },
  updateMarkerCount() { $('#mCount').textContent = '마커 ' + this.project.markers.length + '개'; },
  tap() { if (!this.playing) return; this.project.markers.push({ t: +this.t.toFixed(4), s: 1 }); this.markersChanged(); },

  // ---------------------------------------------------------------- playback
  togglePlay() { this.playing ? this.pause() : this.play(); },
  play() {
    if (this.exporting) return;
    if (this.engine.frame >= this.totalFrames) { this.engine.reset(); this.engine.stepFrame(); }
    this.playing = true; $('#tPlay').textContent = '❚❚';
    this.playStartTime = performance.now(); this.playStartFrame = this.engine.frame;
    if ($('#aPlay').checked) this.audio.play(this.t);
  },
  pause() {
    if (!this.playing) return;
    this.playing = false; $('#tPlay').textContent = '▶'; this.audio.stop();
    this.refreshInspectorValues();
  },

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
  },

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
  },
};
