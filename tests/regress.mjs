// 회귀 검사 — 프리셋을 고정 조건으로 렌더해 기준 프레임(tests/golden.json)과 비교하고, 결정론(같은 조건 = 같은 프레임)을 확인한다.
//   node tests/regress.mjs            검사 (app/RESONANCE_LAB.html 기준 — 먼저 node build.mjs)
//   node tests/regress.mjs --update   기준 프레임 다시 저장 (의도한 화면 변경일 때만)
//   CHROME_PATH=... 로 크롬 경로 지정 가능. 렌더는 항상 SwiftShader(CPU)로 해서 PC·GPU가 달라도 같은 결과를 낸다.
/* global window, document, RL, app -- page.evaluate 안에서 브라우저 쪽 이름 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'app/RESONANCE_LAB.html');
const GOLD = path.join(ROOT, 'tests/golden.json');
const UPDATE = process.argv.includes('--update');
// 기본: 해시가 다르면 실패 (같은 크롬 + SwiftShader 면 비트 단위로 같음).
// RLAB_LOOSE=1: 크롬 버전이 달라 생기는 미세 차(평균 픽셀 차 TOL 이하)는 통과
const LOOSE = !!process.env.RLAB_LOOSE, TOL = 0.5;
const W = +(process.env.RLAB_W || 640);   // 렌더 폭(px) — 문서 크기는 유지하고 배율로 줄임
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const TIMES = [0.5, 2.0, 4.0];

const CHROME = process.env.CHROME_PATH || [
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

// 리듬게임 다중참여 경로도 검사하도록 추가 케이스
const EXTRA = {
  rg_crowd: { base: 'rg_bass', rhythm: { crowd: 60, crowdRate: 0.6, crowdSync: 0.3, crowdFree: 0.4, fxCat: 'all', sizeRand: 1, sizeVar: 0.8 } },
  rg_classic: { base: 'rg_bass', rhythm: { effectType: 'random', crowd: 20 } },
};

async function main() {
  if (!fs.existsSync(HTML)) throw new Error('app/RESONANCE_LAB.html 없음 — 먼저 node build.mjs');
  if (!CHROME) throw new Error('크롬/엣지를 찾지 못했습니다 — CHROME_PATH 를 지정하세요');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(HTML).href);
  await page.waitForFunction(() => window.app && window.RL && RL.presets);

  const cases = await page.evaluate(({ TIMES, EXTRA }) => {
    const out = [];
    for (const k of Object.keys(RL.presets)) if (k !== 'empty') for (const t of TIMES) out.push([k, t]);
    for (const k of Object.keys(EXTRA)) for (const t of TIMES) out.push([k, t]);
    return out;
  }, { TIMES, EXTRA }).then((c) => ONLY ? c.filter(([k]) => ONLY.split(',').includes(k)) : c);

  // 한 케이스 렌더: UI와 분리된 엔진, 고정 레이어 ID, 고정 해상도
  const render = (k, t) => page.evaluate(async ({ k, t, W, EXTRA }) => {
    const ex = EXTRA[k], key = ex ? ex.base : k;
    const p = RL.presets[key].make();
    p.layers.forEach((l, i) => { l.id = 'T' + i; if (ex && ex.rhythm && l.type === 'rhythm') Object.assign(l.params, ex.rhythm); });
    const P = app.normalize(p);
    const E = new RL.Engine(document.createElement('canvas'));
    E.scale = Math.min(1, W / P.width);        // 문서 크기는 그대로, 미리보기처럼 렌더 배율만 낮춤
    E.load(P);
    await E.assetsReady();
    E.reset();
    const f = Math.max(1, Math.min(Math.round(t * P.fps), Math.round(P.duration * P.fps)));
    while (E.frame < f) E.stepFrame();
    E.render();
    const px = E.readFrame(), rw = E.rw, rh = E.rh;
    let hash = 2166136261;
    for (let i = 0; i < px.length; i++) hash = Math.imul(hash ^ px[i], 16777619) >>> 0;
    // 비교용 축소본 (160px 폭, 칸 평균 — 작은 이펙트도 반영됨)
    const tw = Math.min(160, rw), th = Math.max(8, Math.round(tw * rh / rw)), thumb = new Uint8Array(tw * th * 4), acc = new Float64Array(tw * th * 5);
    for (let y = 0; y < rh; y++) { const ty = Math.min(th - 1, Math.floor(y * th / rh)); for (let x = 0; x < rw; x++) {
      const tx = Math.min(tw - 1, Math.floor(x * tw / rw)), s = (y * rw + x) * 4, d = (ty * tw + tx) * 5;
      for (let c = 0; c < 4; c++) acc[d + c] += px[s + c]; acc[d + 4]++; } }
    for (let i = 0; i < tw * th; i++) for (let c = 0; c < 4; c++) thumb[i * 4 + c] = Math.round(acc[i * 5 + c] / Math.max(1, acc[i * 5 + 4]));
    E.gl.getExtension('WEBGL_lose_context')?.loseContext();
    let bin = ''; for (const b of thumb) bin += String.fromCharCode(b);
    return { hash: hash.toString(16), w: tw, h: th, thumb: btoa(bin) };
  }, { k, t, W, EXTRA });

  const gold = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : {};
  const next = {};
  let fail = 0, warn = 0;
  const diff = (a, b) => { const x = Buffer.from(a, 'base64'), y = Buffer.from(b, 'base64'); if (x.length !== y.length) return 255; let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };

  for (const [k, t] of cases) {
    const id = `${k}@${t}`;
    const a = await render(k, t), b = await render(k, t);
    let status = 'ok', note = '';
    if (a.hash !== b.hash) { status = 'FAIL'; note = '결정론 깨짐 — 같은 조건 두 번 렌더가 다름'; }
    else if (!UPDATE && gold[id]) {
      if (gold[id].hash !== a.hash) {
        const d = diff(gold[id].thumb, a.thumb);
        if (LOOSE && d <= TOL) { status = 'warn'; note = `미세 차 ${d.toFixed(3)} (느슨한 모드 통과)`; }
        else { status = 'FAIL'; note = `기준과 다름 (평균 픽셀 차 ${d.toFixed(3)})`; }
      }
    } else if (!UPDATE) { status = 'new'; note = '기준 없음'; }
    if (status === 'FAIL') fail++; if (status === 'warn') warn++;
    next[id] = a;
    const tb = Buffer.from(a.thumb, 'base64'); let lum = 0; for (let i = 0; i < tb.length; i += 4) lum += tb[i] + tb[i + 1] + tb[i + 2];
    lum /= tb.length / 4 * 3;
    if (lum > 250) { status = 'FAIL'; note += ' 화면이 거의 하얌(렌더 이상)'; fail++; }
    console.log(`${status.padEnd(4)} ${id.padEnd(16)} ${a.hash.padStart(8)} 밝기 ${lum.toFixed(0).padStart(3)} ${note}`);
  }
  await browser.close();
  if (errors.length) { console.log('페이지 오류:', errors.slice(0, 5)); fail++; }
  if (UPDATE) { fs.writeFileSync(GOLD, JSON.stringify(next, null, 0)); console.log(`기준 프레임 ${Object.keys(next).length}개 저장 → tests/golden.json`); return; }
  console.log(`\n${cases.length}개 중 실패 ${fail}${LOOSE ? `, 미세 차 통과 ${warn}` : ''}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
