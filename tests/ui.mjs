// 화면 동작 검사 — 실제 화면을 띄워 메뉴·레이어·인스펙터·되돌리기·씬 백업·타임라인·출력 창을 눌러 보고
// 페이지 오류가 없는지 확인한다 (렌더 결과는 regress.mjs 가 본다). 수십 초.
//   node tests/ui.mjs     (app/RESONANCE_LAB.html 기준 — 먼저 node build.mjs)
/* global window, document, KeyboardEvent, Event */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'app/RESONANCE_LAB.html');
const CHROME = process.env.CHROME_PATH || [
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e)));
page.on('dialog', (d) => d.accept());
await page.goto(pathToFileURL(HTML).href);
await page.waitForFunction(() => window.app && window.app.menus);
// 렌더 비용을 줄인다 (동작만 본다)
await page.evaluate(() => { window.app.engine.scale = 0.25; });

const results = [];
async function step(name, fn) {
  const before = pageErrors.length;
  try {
    const r = await page.evaluate(fn);
    await page.waitForTimeout(30);
    if (r !== true) throw new Error('결과: ' + JSON.stringify(r));
    if (pageErrors.length > before) throw new Error(pageErrors.slice(before).join('\n'));
    results.push([true, name]);
  } catch (e) { results.push([false, name, e.message.split('\n').slice(0, 4).join('\n')]); }
}

await step('메뉴 막대: 모든 메뉴 열기 (항목 수 확인) → 닫기', async () => {
  const A = window.app, tops = [...document.querySelectorAll('#menubar .mi')], bad = [];
  for (const [i, mi] of tops.entries()) {
    mi.dispatchEvent(new Event('mousedown', { bubbles: true }));
    const n = mi.querySelectorAll('.it').length, want = A.menus[i][1].filter((x) => x !== '-' && !x.sub).length;
    if (!mi.classList.contains('open') || n !== want) bad.push(A.menus[i][0] + ':' + n + '/' + want);
    window.dispatchEvent(new Event('mousedown'));
    if (mi.classList.contains('open')) bad.push(A.menus[i][0] + ' 안 닫힘');
  }
  return (tops.length === A.menus.length && !bad.length) || { tops: tops.length, bad };
});

await step('레이어: 모든 종류 추가 → 선택 → 인스펙터', async () => {
  const A = window.app, R = window.RL;
  A.newProject && (window.confirm = () => true);
  const types = Object.keys(R.modules), bad = [];
  for (const k of types) {
    A.addLayer(k);
    const L = A.project.layers[A.project.layers.length - 1];
    A.sel = L.id; A.renderLayerList(); A.renderInspector();
    const rows = document.querySelectorAll('#inspector input, #inspector select').length;
    if (L.type !== k || rows < 3) bad.push(k + ':' + rows);
  }
  A.engine.render();
  return bad.length ? bad : true;
});

await step('인스펙터: 슬라이더·선택 바꾸기 → 값 반영', async () => {
  const A = window.app;
  const L = A.project.layers.find((l) => l.type === 'particle') || A.project.layers[0];
  A.sel = L.id; A.renderInspector();
  const r = /** @type {any} */ (document.querySelector('#inspector input[type=range]'));
  const before = JSON.stringify(L.params);
  r.value = String((+r.min + +r.max) / 2 + +r.step); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
  const s = /** @type {any} */ (document.querySelector('#inspector select'));
  if (s && s.options.length > 1) { s.selectedIndex = (s.selectedIndex + 1) % s.options.length; s.dispatchEvent(new Event('change', { bubbles: true })); }
  return JSON.stringify(L.params) !== before || 'unchanged';
});

await step('레이어 동작: 숨기기·위/아래·복제·삭제', async () => {
  const A = window.app, P = A.project, n = P.layers.length, id = P.layers[1].id;
  A.layerAction(id, 'toggle'); A.layerAction(id, 'up'); A.layerAction(id, 'down'); A.layerAction(id, 'dup');
  if (P.layers.length !== n + 1) return 'dup';
  A.layerAction(A.sel, 'del');
  return P.layers.length === n || 'del';
});

await step('되돌리기·다시 실행', async () => {
  const A = window.app;
  A.flushHistory(); A.historyReset();
  const n = A.project.layers.length;
  A.addLayer('dot'); A.flushHistory();
  A.undo(); const a = A.project.layers.length;
  A.redo(); const b = A.project.layers.length;
  return (a === n && b === n + 1) || { n, a, b };
});

await step('씬 백업: 저장·불러오기·넘기기·액트 교체(자동 보관)', async () => {
  const A = window.app;
  A.shelf = []; A.shelfActive = -1;
  A.shelfSave(); A.addLayer('line'); A.shelfSave();
  if (A.shelf.length !== 2) return 'save';
  A.shelfLoad(0); A.shelfStep(1);
  if (A.shelfActive !== 1) return 'step ' + A.shelfActive;
  window.confirm = () => true;
  const act = JSON.stringify({ type: 'rlab-act', version: 1, scenes: [A.shelf[0]] });
  A.loadAct(act, 'x');
  const prev = JSON.parse(localStorage.getItem('rlab.shelf.prev') || 'null');
  return (A.shelf.length === 1 && prev && prev.scenes.length === 2) || { len: A.shelf.length, prev: prev && prev.scenes.length };
});

await step('레이어 복사·붙여넣기 (씬 사이)', async () => {
  const A = window.app, n = A.project.layers.length;
  A.copyLayers([A.project.layers[0]], A.project.assets || {}, 'test');
  A.pasteLayers(A.getLayerClip());
  return A.project.layers.length === n + 1 || 'paste';
});

await step('타임라인: 그리기·키프레임 추가·복사·붙여넣기·삭제', async () => {
  const A = window.app, L = A.project.layers.find((l) => window.RL.modules[l.type].schema.some((f) => f.type === 'range'));
  A.sel = L.id; A.renderInspector();
  const f = window.RL.modules[L.type].schema.find((x) => x.type === 'range');
  A.upsertKey(L, f.id, f.default ?? f.min);
  A.drawTimeline();
  const keys = (L.keys && L.keys[f.id]) || [];
  if (!keys.length) return 'nokey';
  A.kfSel = [{ L, keyId: f.id, key: keys[0] }];
  A.copyKeys(); A.engine.frame = 10; A.pasteKeys();
  const after = (L.keys[f.id] || []).length;
  A.deleteKeys(A.kfSel); A.drawTimeline();
  return after >= 1 || after;
});

await step('재생·정지·탐색 (Space, ←/→, Home)', async () => {
  const A = window.app, key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true }));
  key(' '); await new Promise((r) => setTimeout(r, 120)); const playing = A.playing; key(' ');
  key('Home'); key('ArrowRight'); key('ArrowRight');
  await new Promise((r) => setTimeout(r, 50));
  return (playing && !A.playing && A.engine.frame >= 1) || { playing, now: A.playing, frame: A.engine.frame };
});

await step('보기: 확대·맞춤·1:1, 패널 크기', async () => {
  const A = window.app;
  A.zoomBy(2, 100, 100); const z = A.zoom; A.zoomFit(); A.zoom1to1(); A.zoomFit();
  A.applyLayout({ lw: 320, rw: 400, bh: 220 }); A.layoutStage();
  return (z > 1 && A.layoutSz.lw === 320) || { z, L: A.layoutSz };
});

await step('출력 창: 열기·형식 바꾸기·닫기', async () => {
  const A = window.app;
  A.openModal(); A.updateModal();
  const m = document.querySelector('#modal');
  const open = m && !m.classList.contains('hidden');
  const sel = /** @type {any} */ (m && m.querySelector('select'));
  if (sel) for (let i = 0; i < sel.options.length; i++) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); A.updateModal(); }
  m && m.classList.add('hidden');
  return open || 'modal';
});

await step('알림·우클릭 메뉴·도움말', async () => {
  const A = window.app;
  A.toast('테스트');
  A.ctxMenu(200, 200, [{ label: '항목', fn: () => {} }, '-', { label: '항목2', fn: () => {} }]);
  document.body.dispatchEvent(new Event('mousedown', { bubbles: true }));
  A.help('keys');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
});

await step('새 프로젝트 → 프리셋 불러오기', async () => {
  const A = window.app, R = window.RL;
  window.confirm = () => true;
  A.newProject();
  if (A.project.layers.length) return 'new';
  A.loadProject(R.presets.s1_2.make(), true);
  return A.project.layers.length > 0 || 'preset';
});

await browser.close();
for (const [ok, name, why] of results) console.log((ok ? '  통과  ' : '  실패  ') + name + (why ? '\n        ' + why.replace(/\n/g, '\n        ') : ''));
const bad = results.filter((r) => !r[0]).length;
console.log(bad ? `화면 검사 실패 ${bad}건` : `화면 검사 통과 (${results.length}개)`);
process.exit(bad ? 1 : 0);
