// RESONANCE LAB 빌드 — Vite로 src/ 의 ES 모듈을 묶어 실행 파일 하나(HTML)를 만든다. 축약·보호 없음(평문).
//   node build.mjs          공개판 → app/RESONANCE_LAB.html (저장소에 함께 올림 — 받아서 바로 실행)
//   node build.mjs --work   작업판 → dist/RESONANCE_LAB_work.html (local/scene_titles.json 의 씬 타이틀 적용, 저장소에는 없음)
import fs from 'fs';
import path from 'path';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { ROOT, VERSION, workTitles, version } from './tools/vite-plugins.mjs';

const WORK = process.argv.includes('--work');
const TMP = path.join(ROOT, 'build', WORK ? 'vite-work' : 'vite-public');

await build({
  root: path.join(ROOT, 'src'),
  base: './',
  logLevel: 'warn',
  configFile: false,
  plugins: [workTitles(WORK), version(), viteSingleFile({ removeViteModuleLoader: true })],
  build: { outDir: TMP, emptyOutDir: true, minify: false, cssMinify: false, target: 'es2022', modulePreload: false, reportCompressedSize: false },
});

const head = `<!-- RESONANCE LAB v${VERSION}${WORK ? ' (작업판)' : ''} — Unlicense / 퍼블릭 도메인. 누구나 자유롭게 사용·수정·배포할 수 있습니다. https://unlicense.org\n` +
  `     포함된 오픈소스는 각자의 라이선스를 따릅니다: mp4-muxer (MIT). 소스: src/ (ES 모듈), 빌드: build.mjs (Vite) -->\n`;
let html = fs.readFileSync(path.join(TMP, 'index.html'), 'utf8');
html = html.replace(/^(<!DOCTYPE html>\n?)/i, `$1${head}`);
if (/<script[^>]+src=/i.test(html) || /<link[^>]+stylesheet/i.test(html)) throw new Error('외부 파일 참조가 남아 있습니다 — 단일 파일이 아님');

const out = path.join(ROOT, WORK ? 'dist/RESONANCE_LAB_work.html' : 'app/RESONANCE_LAB.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('ok', path.relative(ROOT, out), (html.length / 1024).toFixed(0) + 'KB', 'v' + VERSION);
