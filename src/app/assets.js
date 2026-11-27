// RESONANCE LAB 화면 — 이미지·영상 소스 고르기·불러오기
// App 의 메서드 묶음. app/App.js 가 App.prototype 에 붙인다 (this = App).
import { $, h } from './dom.js';
import { RL } from '../core/rl.js';

/** @satisfies {ThisType<import('./App.js').App>} */
export const assets = {
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
          const meta = f.type.startsWith('video') ? await videoToAtlas(f, p => { $('#busyBar').style.width = (p * 100) + '%'; }) : await imageToAsset(f);
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
};


export const imageToAsset = async function (file) {
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
export const videoToAtlas = async function (file, progress) {
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

// 호환 등록
Object.assign(RL, { imageToAsset, videoToAtlas });
