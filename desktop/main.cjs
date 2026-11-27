'use strict';
// RESONANCE LAB — 오프라인 데스크톱 셸 (Electron). 그리기는 화면(WebGL2)이 하고,
// 이 프로세스는 파일 쓰기·FFmpeg 출력·설정·기록만 맡는다. 세부 규칙은 lib/ 에 있다.
//   lib/log.cjs       기록 (rlab.log)        lib/settings.cjs  설정 (settings.json)
//   lib/files.cjs     파일 쓰기 규칙·자동 보관  lib/encoder.cjs   FFmpeg 출력 작업
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { createLogger } = require('./lib/log.cjs');
const { createSettings } = require('./lib/settings.cjs');
const { FILTERS, safeName, createGate, readProject, createBackups } = require('./lib/files.cjs');
const { createEncoder } = require('./lib/encoder.cjs');

const userData = app.getPath('userData');
const log = createLogger(path.join(userData, 'rlab.log'));
const settings = createSettings(path.join(userData, 'settings.json'));
const gate = createGate();
const backups = createBackups(path.join(userData, 'backups'));
// 자동 검사용 (빌드·테스트 스크립트가 RLAB_TEST_OUT 을 줄 때만)
const TEST_OUT = process.env.RLAB_TEST_OUT || null;

let win = null;

// ---------------- 시작 안정성: 기록, GPU 호환 모드, 창이 안 보이는 일 방지 ----------------
const SAFE = process.argv.includes('--safe-gpu') || settings.get().gpuMode === 'safe';
app.commandLine.appendSwitch('ignore-gpu-blocklist');           // 오래된·사무용 GPU는 WebGL2 차단 목록에 자주 걸림
if (SAFE) { app.commandLine.appendSwitch('use-angle', 'swiftshader'); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); }
function relaunch(safe) {
  settings.set({ gpuMode: safe ? 'safe' : 'normal' });
  log.info('다시 시작', { safe });
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--safe-gpu').concat(safe ? ['--safe-gpu'] : []) });
  app.exit(0);
}
process.on('uncaughtException', (e) => { log.error('메인 프로세스 오류', e); try { dialog.showErrorBox('RESONANCE LAB 오류', String(e && e.message || e) + '\n\n기록: ' + log.file); } catch { /* 대화상자 불가 */ } });
process.on('unhandledRejection', (e) => log.error('메인 프로세스 처리되지 않은 오류', e));
let gpuWarned = false;
function offerSafe(reason) {
  log.warn('GPU·화면 문제', reason);
  if (SAFE || gpuWarned || !win) return; gpuWarned = true;
  const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['호환 모드로 다시 시작', '그대로 두기'], defaultId: 0, cancelId: 1, title: 'RESONANCE LAB',
    message: '이 PC의 그래픽 가속(GPU)으로 화면을 그리지 못했습니다.', detail: reason + '\n\n호환 모드는 GPU 대신 CPU(소프트웨어)로 그립니다. 느리지만 대부분의 PC에서 동작합니다. 옵션 메뉴에서 언제든 되돌릴 수 있습니다.' });
  if (r === 0) relaunch(true);
}

const ffmpegPath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  : (process.env.RLAB_FFMPEG || path.join(__dirname, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
const encoder = createEncoder({ spawn, exists: fs.existsSync, ffmpegPath, unlink: (f) => fsp.unlink(f).catch(() => {}), log });

const lastDir = () => settings.get().lastDir || app.getPath('videos');
const remember = (dir) => settings.set({ lastDir: dir });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  log.info('시작', { version: app.getVersion(), electron: process.versions.electron, os: process.getSystemVersion(), arch: process.arch, exe: process.execPath, safe: SAFE });
  try { log.info('GPU', app.getGPUFeatureStatus()); } catch { /* 일부 환경 */ }
  app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU' && d.reason !== 'clean-exit') offerSafe('GPU 프로세스 종료: ' + d.reason); });
  // 완전 오프라인: 모든 네트워크 요청과 권한 요청 거부
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_w, _p, done) => done(false));
  win = new BrowserWindow({
    width: 1680, height: 1000, minWidth: 1200, minHeight: 760, backgroundColor: '#0c0d10', title: 'RESONANCE LAB', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, devTools: !app.isPackaged },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'app', 'RESONANCE_LAB.html'));
  let shown = false; const showWin = () => { if (shown || !win || win.isDestroyed()) return; shown = true; win.maximize(); win.show(); };
  win.once('ready-to-show', showWin);
  setTimeout(showWin, 5000);                                           // 첫 화면이 늦어도 창은 띄운다
  win.webContents.on('render-process-gone', (_e, d) => { log.error('화면 프로세스 종료', d); showWin(); if (d.reason !== 'clean-exit') offerSafe('화면 프로세스 종료: ' + d.reason); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { log.error('화면 불러오기 실패', code, desc, url); showWin(); dialog.showErrorBox('RESONANCE LAB', '화면 파일을 불러오지 못했습니다(' + desc + ').\n프로그램 폴더 전체를 함께 복사했는지 확인해 주세요.\n' + url); });
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 3) log.error('화면 콘솔', msg, src ? path.basename(src) + ':' + line : ''); });
  if (TEST_OUT && process.env.RLAB_TEST_SCRIPT) win.webContents.once('did-finish-load', async () => {
    try { const r = await win.webContents.executeJavaScript(fs.readFileSync(process.env.RLAB_TEST_SCRIPT, 'utf8')); fs.writeFileSync(path.join(TEST_OUT, 'result.json'), JSON.stringify(r)); }
    catch (e) { fs.writeFileSync(path.join(TEST_OUT, 'result.json'), JSON.stringify({ error: String(e && e.stack || e) })); }
    app.exit(0);
  });
  let closing = false;
  win.on('close', (e) => {
    if (closing || !encoder.size) return;
    const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['계속 작업', '출력 취소하고 닫기'], defaultId: 0, cancelId: 0, message: '출력이 진행 중입니다.' });
    e.preventDefault();
    if (r === 0) return;
    closing = true;
    encoder.cancelAll().finally(() => { if (win && !win.isDestroyed()) win.close(); });
  });
});
app.on('window-all-closed', () => { log.info('종료'); app.quit(); });

// 화면 → 메인 호출: 오류는 기록하고 그대로 화면에 돌려준다 (화면이 사용자에게 알림)
function handle(channel, fn) {
  ipcMain.handle(channel, async (...a) => {
    try { return await fn(...a); }
    catch (e) { log.error(channel, e && e.message || e); throw e; }
  });
}

// ---------------- 대화상자·파일 ----------------
handle('dlg:folder', async (_e, title) => {
  if (TEST_OUT) { gate.approveDir(TEST_OUT); return TEST_OUT; }
  const r = await dialog.showOpenDialog(win, { title: title || '출력 폴더 선택', defaultPath: lastDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  gate.approveDir(r.filePaths[0]); remember(r.filePaths[0]);
  return r.filePaths[0];
});
handle('dlg:save', async (_e, name, kind) => {
  if (TEST_OUT) { const f = path.resolve(TEST_OUT, safeName(name)); gate.approveFile(f); return f; }
  const r = await dialog.showSaveDialog(win, { title: '저장', defaultPath: path.join(lastDir(), safeName(name)), filters: FILTERS[kind] || [] });
  if (r.canceled || !r.filePath) return null;
  gate.approveFile(r.filePath); remember(path.dirname(r.filePath));
  return r.filePath;
});
handle('fs:write', async (_e, dir, name, bytes) => { const f = gate.inDir(dir, name); await fsp.writeFile(f, Buffer.from(bytes)); return f; });
handle('fs:writePath', async (_e, file, bytes) => { const f = gate.file(file); await fsp.writeFile(f, Buffer.from(bytes)); return f; });
handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: '프로젝트 열기', defaultPath: lastDir(), filters: FILTERS.json, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  remember(path.dirname(r.filePaths[0]));
  return readProject(r.filePaths[0]);
});
handle('backup:save', async (_e, label, bytes) => { const f = await backups.save(label, bytes); log.info('자동 보관', f); return f; });
handle('backup:dir', () => backups.dir);
handle('shell:show', async (_e, p) => { if (p) shell.showItemInFolder(String(p)); });
handle('shell:openDir', async (_e, which) => {
  const d = which === 'backups' ? backups.dir : which === 'log' ? path.dirname(log.file) : null;
  if (!d) return false;
  await fsp.mkdir(d, { recursive: true });
  return (await shell.openPath(d)) === '';
});

// ---------------- 앱 ----------------
handle('app:gpuMode', () => (SAFE ? 'safe' : 'normal'));
handle('app:relaunch', (_e, safe) => relaunch(!!safe));
handle('app:startFail', (_e, msg) => offerSafe(String(msg).slice(0, 500)));
handle('app:logPath', () => log.file);
// 화면 쪽 기록 — 길이·빈도 제한 (1초에 20줄)
let logBudget = 20, logT = 0;
ipcMain.handle('app:log', (_e, level, msg) => {
  const now = Date.now(); if (now - logT > 1000) { logT = now; logBudget = 20; }
  if (logBudget-- <= 0) return false;
  log.write(String(level), '화면', String(msg).slice(0, 4000));
  return true;
});

// ---------------- FFmpeg 출력 ----------------
handle('enc:begin', async (_e, o) => encoder.begin(o, gate.file(o.file)));
handle('enc:frame', (_e, id, bytes) => encoder.frame(id, bytes));
handle('enc:finish', (_e, id) => encoder.finish(id));
handle('enc:cancel', (_e, id) => encoder.cancel(id));
