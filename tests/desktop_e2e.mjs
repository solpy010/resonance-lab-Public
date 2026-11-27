// 데스크톱 앱 실제 실행 검사 (선택) — Electron 으로 앱을 띄워 저장·쓰기 제한·ProRes 출력·자동 보관·기록을 확인한다.
//   ELECTRON_PATH=<electron 실행 파일> FFMPEG_PATH=<ffmpeg> node tests/desktop_e2e.mjs
//   Linux 서버에서는 xvfb-run 으로 감싸서 실행. 먼저 node build.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EL = process.env.ELECTRON_PATH, FF = process.env.FFMPEG_PATH || 'ffmpeg';
if (!EL) { console.log('ELECTRON_PATH 가 없어 건너뜀'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rlab-e2e-'));
const app = path.join(tmp, 'app'), out = path.join(tmp, 'out'), ud = path.join(tmp, 'userdata');
fs.mkdirSync(path.join(app, 'app'), { recursive: true }); fs.mkdirSync(out);
for (const f of ['main.cjs', 'preload.cjs', 'package.json']) fs.copyFileSync(path.join(ROOT, 'desktop', f), path.join(app, f));
fs.cpSync(path.join(ROOT, 'desktop/lib'), path.join(app, 'lib'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'app/RESONANCE_LAB.html'), path.join(app, 'app/RESONANCE_LAB.html'));
spawnSync(EL, ['--no-sandbox', '--user-data-dir=' + ud, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', app], {
  env: { ...process.env, RLAB_TEST_OUT: out, RLAB_TEST_SCRIPT: path.join(ROOT, 'tests/e2e/desktop_run.js'), RLAB_FFMPEG: FF }, timeout: 120000, stdio: 'ignore',
});
const r = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
const log = fs.existsSync(path.join(ud, 'rlab.log')) ? fs.readFileSync(path.join(ud, 'rlab.log'), 'utf8') : '';
const backups = fs.existsSync(path.join(ud, 'backups')) ? fs.readdirSync(path.join(ud, 'backups')) : [];
const checks = [
  ['검사 스크립트 실행', !r.error, r.error],
  ['프로젝트 저장', r.save && fs.existsSync(r.save)],
  ['고르지 않은 경로 쓰기 거부', r.evil === 'blocked'],
  ['ProRes 출력 + 프로젝트 사본', r.prores && r.prores.status === 'done' && fs.statSync(r.prores.path).size > 1000 && fs.readdirSync(out).some((x) => x.endsWith('_project.rlab.json'))],
  ['액트 교체 전 자동 보관', backups.length === 1 && JSON.parse(fs.readFileSync(path.join(ud, 'backups', backups[0]), 'utf8')).scenes.length === r.shelfBefore],
  ['기록 파일 (시작·출력 완료·화면 기록)', /시작/.test(log) && /출력 완료/.test(log) && /e2e 화면 기록 확인/.test(log)],
];
for (const [n, ok, why] of checks) console.log((ok ? '  통과  ' : '  실패  ') + n + (ok || !why ? '' : '  ' + why));
fs.rmSync(tmp, { recursive: true, force: true });
const bad = checks.filter((c) => !c[1]).length;
console.log(bad ? `데스크톱 실행 검사 실패 ${bad}건` : `데스크톱 실행 검사 통과 (${checks.length}개)`);
process.exit(bad ? 1 : 0);
