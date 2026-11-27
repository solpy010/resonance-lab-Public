// 데스크톱 셸 검사 — Electron 없이 desktop/lib 의 규칙을 확인한다 (수 초).
//   node tests/desktop.mjs
// 기록 파일 넘기기, 설정 기본값·깨진 파일·원자적 쓰기, 파일 쓰기 허용 규칙, 자동 보관 개수 제한,
// FFmpeg 인자·해상도 검사, 출력 작업(가짜 FFmpeg로 정상·실패·취소·전체 취소).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLogger } = require('../desktop/lib/log.cjs');
const { createSettings } = require('../desktop/lib/settings.cjs');
const { safeName, createGate, readProject, createBackups, MAX_PROJECT_BYTES } = require('../desktop/lib/files.cjs');
const { encoderArgs, checkSize, createEncoder } = require('../desktop/lib/encoder.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rlab-desk-'));
const results = [];
async function t(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e]); }
}
const quiet = { info() {}, warn() {}, error() {}, write() {} };

await t('기록: 한 줄 형식, 1MB 넘으면 .1 로 넘김', () => {
  const f = path.join(tmp, 'log', 'rlab.log');
  const L = createLogger(f, { maxBytes: 200 });
  L.info('시작', { a: 1 }); L.error('오류', new Error('boom'));
  const s = fs.readFileSync(f, 'utf8');
  assert.match(s, /^\d{4}-\d\d-\d\dT.*info\s+시작 \{"a":1\}/m);
  assert.match(s, /error\s+오류 Error: boom/);
  for (let i = 0; i < 20; i++) L.warn('x'.repeat(30));
  assert.ok(fs.existsSync(f + '.1'));
  assert.ok(fs.statSync(f).size < 400);
  L.write('이상한수준', '그래도 기록'); assert.match(fs.readFileSync(f, 'utf8'), /info\s+그래도 기록/);
});

await t('설정: 없으면 기본값, 깨진 파일·잘못된 값은 기본값으로', () => {
  const f = path.join(tmp, 'cfg', 'settings.json');
  assert.deepEqual(createSettings(f).get(), { gpuMode: 'normal', lastDir: null });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '{깨짐');
  assert.equal(createSettings(f).get().gpuMode, 'normal');
  fs.writeFileSync(f, JSON.stringify({ gpuMode: 'turbo', lastDir: 3, other: 'keep' }));
  assert.deepEqual(createSettings(f).get(), { gpuMode: 'normal', lastDir: null, other: 'keep' });
});

await t('설정: 쓰기는 임시 파일 → 바꿔치기, 다른 값 유지', () => {
  const f = path.join(tmp, 'cfg2', 'settings.json');
  const S = createSettings(f);
  assert.ok(S.set({ gpuMode: 'safe' }));
  assert.ok(S.set({ lastDir: '/x' }));
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { gpuMode: 'safe', lastDir: '/x' });
  assert.ok(!fs.existsSync(f + '.tmp'));
  assert.equal(createSettings(f).get().gpuMode, 'safe');
});

await t('파일 이름: 경로·금지 문자 제거', () => {
  assert.equal(safeName('../../a/b:c*?.png'), 'b_c_.png');
  assert.equal(safeName(''), 'untitled');
  assert.equal(safeName('..'), '_');
  assert.equal(safeName('씬 1_2.rlab.json'), '씬 1_2.rlab.json');
});

await t('쓰기 허용: 고른 폴더·파일만', () => {
  const G = createGate(), d = path.join(tmp, 'out');
  assert.throws(() => G.inDir(d, 'a.png'), /선택하지 않은 폴더/);
  G.approveDir(d);
  assert.equal(G.inDir(d + path.sep, '../evil.png'), path.join(d, 'evil.png'));
  assert.throws(() => G.file(path.join(d, 'x.mov')), /저장 대화상자/);
  const f = path.join(tmp, 'other', 'x.mov');
  G.approveFile(f);
  assert.equal(G.file(path.join(tmp, 'other', '.', 'x.mov')), f);
  assert.equal(G.inDir(path.join(tmp, 'other'), 'x_project.json'), path.join(tmp, 'other', 'x_project.json'));
});

await t('프로젝트 열기: 크기 제한', async () => {
  const f = path.join(tmp, 'p.json'); fs.writeFileSync(f, '{"layers":[]}');
  assert.deepEqual(await readProject(f), { path: f, text: '{"layers":[]}' });
  const big = path.join(tmp, 'big.json'); fs.writeFileSync(big, ''); fs.truncateSync(big, MAX_PROJECT_BYTES + 1);
  await assert.rejects(readProject(big), /너무 큽니다/);
});

await t('자동 보관: 이름 겹침 처리, 최근 N개만 유지', async () => {
  const B = createBackups(path.join(tmp, 'backups'), { keep: 3 });
  const made = [];
  for (let i = 0; i < 5; i++) made.push(await B.save('액트 열기 전', Buffer.from('{"i":' + i + '}')));
  assert.equal(new Set(made).size, 5);
  const left = fs.readdirSync(B.dir).sort();
  assert.equal(left.length, 3);
  assert.equal(JSON.parse(fs.readFileSync(made[4], 'utf8')).i, 4);
  assert.deepEqual(left, made.slice(2).map((f) => path.basename(f)).sort());
  assert.ok(left.every((x) => x.endsWith('.rlab-act.json')));
});

await t('FFmpeg 인자: 코덱별, 해상도·fps 검사', () => {
  const a = encoderArgs({ codec: 'prores4444', width: 1920, height: 1080, fps: 30, file: 'o.mov' });
  assert.ok(a.includes('prores_ks') && a.includes('yuva444p10le') && a.at(-1) === 'o.mov');
  assert.ok(encoderArgs({ codec: 'prores422hq', width: 64, height: 64, fps: 24, file: 'o.mov' }).includes('yuv422p10le'));
  assert.ok(encoderArgs({ codec: 'h264', width: 64, height: 64, fps: 24, file: 'o.mp4' }, 'win32').includes('h264_mf'));
  assert.ok(encoderArgs({ codec: 'h264', width: 64, height: 64, fps: 24, file: 'o.mp4' }, 'linux').includes('libx264'));
  assert.throws(() => encoderArgs({ codec: 'gif', width: 64, height: 64, fps: 24, file: 'o' }), /알 수 없는 코덱/);
  assert.throws(() => checkSize(15, 64, 30), /짝수/);
  assert.throws(() => checkSize(65, 64, 30), /짝수/);
  assert.throws(() => checkSize(64, 64, 0), /프레임레이트/);
  assert.deepEqual(checkSize(64.9, 64, '30'), { w: 64, h: 64, fps: 30 });
});

// 가짜 FFmpeg: stdin 으로 받은 바이트 수를 세고, end 되면 exitCode 로 종료
function fakeSpawn(exitCode = 0) {
  const made = [];
  const spawn = (exe, args) => {
    const c = new EventEmitter();
    c.args = args; c.got = 0; c.killed = false;
    c.stderr = new EventEmitter();
    c.stdin = new EventEmitter();
    c.stdin.write = (b) => { c.got += b.length; return true; };
    c.stdin.end = () => setTimeout(() => { if (exitCode) c.stderr.emit('data', Buffer.from('encoder failed')); c.emit('close', exitCode); }, 5);
    c.stdin.destroy = () => {};
    c.kill = () => { c.killed = true; setTimeout(() => c.emit('close', null), 5); };
    made.push(c); return c;
  };
  return { spawn, made };
}
const encDeps = (sp, unlinked = []) => ({ spawn: sp.spawn, exists: () => true, ffmpegPath: () => 'ffmpeg', unlink: async (f) => { unlinked.push(f); }, log: quiet });

await t('출력 작업: 정상 완료', async () => {
  const sp = fakeSpawn(0), E = createEncoder(encDeps(sp));
  const id = E.begin({ codec: 'prores422hq', width: 16, height: 16, fps: 30 }, '/x/o.mov');
  assert.equal(E.size, 1);
  await E.frame(id, new Uint8Array(16 * 16 * 4)); await E.frame(id, new Uint8Array(16 * 16 * 4));
  await assert.rejects(E.frame(id, new Uint8Array(10)), /프레임 크기/);
  assert.equal(await E.finish(id), '/x/o.mov');
  assert.equal(sp.made[0].got, 2 * 16 * 16 * 4);
  assert.equal(E.size, 0);
  await assert.rejects(E.frame(id, new Uint8Array(1)), /작업이 없습니다/);
});

await t('출력 작업: FFmpeg 실패는 오류 내용과 함께', async () => {
  const sp = fakeSpawn(1), E = createEncoder(encDeps(sp));
  const id = E.begin({ codec: 'h264', width: 16, height: 16, fps: 30 }, '/x/o.mp4');
  await assert.rejects(E.finish(id), /FFmpeg 오류\(1\): encoder failed/);
  assert.equal(E.size, 0);
});

await t('출력 작업: FFmpeg 없음', () => {
  const E = createEncoder({ ...encDeps(fakeSpawn()), exists: () => false });
  assert.throws(() => E.begin({ codec: 'h264', width: 16, height: 16, fps: 30 }, '/x/o.mp4'), /찾을 수 없습니다/);
});

await t('출력 작업: 취소·전체 취소는 덜 만든 파일 삭제', async () => {
  const sp = fakeSpawn(0), un = [], E = createEncoder(encDeps(sp, un));
  const a = E.begin({ codec: 'h264', width: 16, height: 16, fps: 30 }, '/x/a.mp4');
  E.begin({ codec: 'h264', width: 16, height: 16, fps: 30 }, '/x/b.mp4');
  E.begin({ codec: 'h264', width: 16, height: 16, fps: 30 }, '/x/c.mp4');
  assert.equal(await E.cancel(a), true);
  assert.equal(await E.cancel('없음'), false);
  await E.cancelAll();
  assert.equal(E.size, 0);
  assert.deepEqual(un.sort(), ['/x/a.mp4', '/x/b.mp4', '/x/c.mp4']);
  assert.ok(sp.made.every((c) => c.killed));
});

fs.rmSync(tmp, { recursive: true, force: true });
for (const [ok, name, e] of results) console.log((ok ? '  통과  ' : '  실패  ') + name + (e ? '\n        ' + (e.message || e) : ''));
const bad = results.filter((r) => !r[0]).length;
console.log(bad ? `데스크톱 검사 실패 ${bad}건` : `데스크톱 검사 통과 (${results.length}개)`);
process.exit(bad ? 1 : 0);
