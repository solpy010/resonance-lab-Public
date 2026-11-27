// 스키마 검사 — 모든 레이어 모듈의 설정 항목과 프리셋 값이 앞뒤가 맞는지 확인한다 (렌더 없음, 수 초).
//   node tests/schema.mjs     (app/RESONANCE_LAB.html 기준 — 먼저 node build.mjs)
// 검사 항목: id 중복, 알 수 없는 type, range 의 min ≤ default ≤ max, select 기본값이 목록에 있는지,
//           group 누락, 프리셋 레이어 type 이 실제 모듈인지, 프리셋 값 이름이 스키마에 있는지, 값 범위.
/* global window, RL */
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

async function main() {
  if (!fs.existsSync(HTML)) throw new Error('app/RESONANCE_LAB.html 없음 — 먼저 node build.mjs');
  if (!CHROME) throw new Error('크롬/엣지를 찾지 못했습니다 — CHROME_PATH 를 지정하세요');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(pathToFileURL(HTML).href);
  await page.waitForFunction(() => window.app && window.RL && RL.presets);

  const res = await page.evaluate(() => {
    const TYPES = ['range', 'select', 'bool', 'color', 'colors', 'text', 'asset', 'assetList'];
    const bad = [], warn = [];
    let fields = 0;
    for (const [mk, m] of Object.entries(RL.modules)) {
      const at = (f, msg) => bad.push(`${mk}.${f.id}: ${msg}`);
      if (!m.label || !Array.isArray(m.schema) || typeof m.create !== 'function') { bad.push(`${mk}: label/schema/create 누락`); continue; }
      const seen = new Set();
      for (const f of m.schema) {
        fields++;
        if (!f.id) { bad.push(`${mk}: id 없는 항목`); continue; }
        if (seen.has(f.id)) at(f, 'id 중복');
        seen.add(f.id);
        if (!TYPES.includes(f.type)) at(f, `알 수 없는 type '${f.type}'`);
        if (!f.group) at(f, 'group 누락');
        if (!f.label) at(f, 'label 누락');
        if (f.when && typeof f.when !== 'function') at(f, 'when 이 함수가 아님');
        if (f.type === 'range') {
          if (!(typeof f.min === 'number' && typeof f.max === 'number' && f.min <= f.max)) at(f, `min/max 이상 (${f.min}, ${f.max})`);
          if (!(f.step > 0)) at(f, `step 이상 (${f.step})`);
          if (f.default !== undefined && !(f.default >= f.min && f.default <= f.max)) at(f, `기본값 ${f.default} 이 범위 [${f.min}, ${f.max}] 밖`);
        }
        if (f.type === 'select') {
          if (!Array.isArray(f.options) || !f.options.length) at(f, 'options 비어 있음');
          else if (f.default !== undefined && !f.options.some((o) => o[0] === f.default)) at(f, `기본값 '${f.default}' 이 목록에 없음`);
        }
        if (f.type === 'bool' && f.default !== undefined && typeof f.default !== 'boolean') at(f, '기본값이 true/false 가 아님');
        if (f.default === undefined && !['asset', 'assetList'].includes(f.type)) warn.push(`${mk}.${f.id}: 기본값 없음`);
      }
    }
    let layers = 0;
    for (const [pk, pr] of Object.entries(RL.presets)) {
      const P = pr.make();
      for (const l of P.layers || []) {
        layers++;
        const m = RL.modules[l.type];
        if (!m) { bad.push(`프리셋 ${pk}: 없는 레이어 종류 '${l.type}'`); continue; }
        const S = Object.fromEntries(m.schema.map((f) => [f.id, f]));
        for (const [k, v] of Object.entries(l.params || {})) {
          const f = S[k];
          if (!f) { warn.push(`프리셋 ${pk} / ${l.type}: 스키마에 없는 값 '${k}'`); continue; }
          if (f.type === 'range' && typeof v === 'number' && (v < f.min || v > f.max)) warn.push(`프리셋 ${pk} / ${l.type}.${k}: ${v} 이 범위 [${f.min}, ${f.max}] 밖`);
          if (f.type === 'select' && Array.isArray(f.options) && !f.options.some((o) => o[0] === v)) bad.push(`프리셋 ${pk} / ${l.type}.${k}: '${v}' 은 목록에 없는 값`);
        }
      }
    }
    return { bad, warn, modules: Object.keys(RL.modules).length, fields, presets: Object.keys(RL.presets).length, layers };
  });
  await browser.close();

  if (pageErrors.length) res.bad.push(...pageErrors.map((e) => '페이지 오류: ' + e));
  console.log(`모듈 ${res.modules}개 · 설정 항목 ${res.fields}개 · 프리셋 ${res.presets}개 · 프리셋 레이어 ${res.layers}개`);
  for (const w of res.warn) console.log('  참고  ' + w);
  for (const b of res.bad) console.log('  실패  ' + b);
  if (res.bad.length) { console.log(`스키마 검사 실패 ${res.bad.length}건`); process.exit(1); }
  console.log(`스키마 검사 통과 (참고 ${res.warn.length}건)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
