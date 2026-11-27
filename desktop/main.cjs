'use strict';
// RESONANCE LAB — offline desktop shell (Electron). Rendering stays in the page (WebGL2);
// this process only writes files and drives the bundled FFmpeg for ProRes output.
const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

let win = null;
const approvedDirs = new Set();          // folders the user picked this session
const approvedFiles = new Set();         // files the user picked in a save dialog
const jobs = new Map();
let lastDir = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function saveSettings(s) { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s)); } catch {} }

// ---------------- startup robustness: log, GPU fallback, never-invisible window ----------------
const SAFE = process.argv.includes('--safe-gpu') || loadSettings().gpuMode === 'safe';
app.commandLine.appendSwitch('ignore-gpu-blocklist');           // older / office GPUs are often blocklisted for WebGL2
if (SAFE) { app.commandLine.appendSwitch('use-angle', 'swiftshader'); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); }
const logFile = () => { try { return path.join(app.getPath('userData'), 'startup.log'); } catch { return null; } };
function log(...a) { const f = logFile(); if (!f) return; try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, new Date().toISOString() + '  ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); } catch {} }
function relaunch(safe) { const s = loadSettings(); s.gpuMode = safe ? 'safe' : 'normal'; saveSettings(s); app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--safe-gpu').concat(safe ? ['--safe-gpu'] : []) }); app.exit(0); }
process.on('uncaughtException', (e) => { log('uncaught', String(e && e.stack || e)); try { dialog.showErrorBox('RESONANCE LAB 오류', String(e && e.message || e) + '\n\n로그: ' + logFile()); } catch {} });
let gpuWarned = false;
function offerSafe(reason) {
  log('gpu/renderer problem', reason);
  if (SAFE || gpuWarned || !win) return; gpuWarned = true;
  const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['호환 모드로 다시 시작', '그대로 두기'], defaultId: 0, cancelId: 1, title: 'RESONANCE LAB',
    message: '이 PC의 그래픽 가속(GPU)으로 화면을 그리지 못했습니다.', detail: reason + '\n\n호환 모드는 GPU 대신 CPU(소프트웨어)로 그립니다. 느리지만 대부분의 PC에서 동작합니다. 옵션 메뉴에서 언제든 되돌릴 수 있습니다.' });
  if (r === 0) relaunch(true);
}

const ffmpegPath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  : (process.env.RLAB_FFMPEG || path.join(__dirname, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  log('start', { version: app.getVersion(), electron: process.versions.electron, os: process.getSystemVersion(), arch: process.arch, exe: process.execPath, safe: SAFE });
  try { log('gpu', app.getGPUFeatureStatus()); } catch {}
  app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU' && d.reason !== 'clean-exit') offerSafe('GPU 프로세스 종료: ' + d.reason); });
  lastDir = loadSettings().lastDir || app.getPath('videos');
  // fully offline: deny every network request and permission
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
  setTimeout(showWin, 5000);                                           // never stay invisible if the first paint stalls
  win.webContents.on('render-process-gone', (_e, d) => { log('renderer gone', d); showWin(); if (d.reason !== 'clean-exit') offerSafe('화면 프로세스 종료: ' + d.reason); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { log('load fail', code, desc, url); showWin(); dialog.showErrorBox('RESONANCE LAB', '화면 파일을 불러오지 못했습니다(' + desc + ').\n프로그램 폴더 전체를 함께 복사했는지 확인해 주세요.\n' + url); });
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) log('console', msg); });
  if (TEST_OUT && process.env.RLAB_TEST_SCRIPT) win.webContents.once('did-finish-load', async () => {
    try { const r = await win.webContents.executeJavaScript(fs.readFileSync(process.env.RLAB_TEST_SCRIPT, 'utf8')); fs.writeFileSync(path.join(TEST_OUT, 'result.json'), JSON.stringify(r)); }
    catch (e) { fs.writeFileSync(path.join(TEST_OUT, 'result.json'), JSON.stringify({ error: String(e && e.stack || e) })); }
    app.exit(0);
  });
  win.on('close', (e) => {
    if (jobs.size) {
      const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['계속 작업', '출력 취소하고 닫기'], defaultId: 0, cancelId: 0, message: '출력이 진행 중입니다.' });
      if (r === 0) { e.preventDefault(); return; }
      for (const j of jobs.values()) try { j.child.kill(); } catch {}
    }
  });
});
app.on('window-all-closed', () => app.quit());

function remember(dir) { lastDir = dir; const s = loadSettings(); s.lastDir = dir; saveSettings(s); }
const safeName = (n) => path.basename(String(n || 'untitled')).replace(/[\\/:*?"<>|]+/g, '_');

// automated self-test hooks (only when RLAB_TEST_OUT is set by the build/test script)
const TEST_OUT = process.env.RLAB_TEST_OUT || null;
ipcMain.handle('dlg:folder', async (_e, title) => {
  if (TEST_OUT) { approvedDirs.add(path.resolve(TEST_OUT)); return TEST_OUT; }
  const r = await dialog.showOpenDialog(win, { title: title || '출력 폴더 선택', defaultPath: lastDir, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  approvedDirs.add(path.resolve(r.filePaths[0])); remember(r.filePaths[0]);
  return r.filePaths[0];
});

const FILTERS = {
  mov: [{ name: 'QuickTime ProRes', extensions: ['mov'] }],
  mp4: [{ name: 'MP4 (H.264)', extensions: ['mp4'] }],
  png: [{ name: 'PNG', extensions: ['png'] }],
  json: [{ name: 'RESONANCE LAB 프로젝트', extensions: ['json'] }],
};
ipcMain.handle('dlg:save', async (_e, name, kind) => {
  if (TEST_OUT) { const f = path.resolve(TEST_OUT, safeName(name)); approvedFiles.add(f); approvedDirs.add(path.resolve(TEST_OUT)); return f; }
  const r = await dialog.showSaveDialog(win, { title: '저장', defaultPath: path.join(lastDir, safeName(name)), filters: FILTERS[kind] || [] });
  if (r.canceled || !r.filePath) return null;
  approvedFiles.add(path.resolve(r.filePath)); approvedDirs.add(path.resolve(path.dirname(r.filePath))); remember(path.dirname(r.filePath));
  return r.filePath;
});

ipcMain.handle('fs:write', async (_e, dir, name, bytes) => {
  const d = path.resolve(dir);
  if (!approvedDirs.has(d)) throw new Error('선택하지 않은 폴더에는 쓸 수 없습니다.');
  const file = path.join(d, safeName(name));
  await fsp.writeFile(file, Buffer.from(bytes));
  return file;
});
ipcMain.handle('fs:writePath', async (_e, file, bytes) => {
  const f = path.resolve(file);
  if (!approvedFiles.has(f)) throw new Error('저장 대화상자에서 고른 파일만 쓸 수 있습니다.');
  await fsp.writeFile(f, Buffer.from(bytes));
  return f;
});
ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: '프로젝트 열기', defaultPath: lastDir, filters: FILTERS.json, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const st = await fsp.stat(r.filePaths[0]);
  if (st.size > 64 * 1024 * 1024) throw new Error('프로젝트 파일이 너무 큽니다.');
  remember(path.dirname(r.filePaths[0]));
  return { path: r.filePaths[0], text: await fsp.readFile(r.filePaths[0], 'utf8') };
});
ipcMain.handle('app:gpuMode', () => (SAFE ? 'safe' : 'normal'));
ipcMain.handle('app:relaunch', (_e, safe) => relaunch(!!safe));
ipcMain.handle('app:startFail', (_e, msg) => offerSafe(String(msg).slice(0, 500)));
ipcMain.handle('app:logPath', () => logFile());
ipcMain.handle('shell:show', async (_e, p) => { if (p) shell.showItemInFolder(p); });

// ---------------- FFmpeg encoding (raw RGBA frames over stdin) ----------------
function encoderArgs(o) {
  const color = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-r', String(o.fps), '-i', 'pipe:0'];
  const vf = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv'];
  if (o.codec === 'prores4444') return [...input, ...vf, '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', ...color, '-movflags', '+write_colr', o.file];
  if (o.codec === 'prores422hq') return [...input, ...vf, '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', ...color, '-movflags', '+write_colr', o.file];
  if (o.codec === 'h264') return [...input, ...vf, '-c:v', process.platform === 'win32' ? 'h264_mf' : 'libx264', '-b:v', String(Math.round(Math.max(8e6, o.width * o.height * o.fps * 0.18))), '-pix_fmt', 'yuv420p', ...color, '-movflags', '+faststart', o.file];
  throw new Error('알 수 없는 코덱');
}
ipcMain.handle('enc:begin', async (_e, o) => {
  const file = path.resolve(o.file);
  if (!approvedFiles.has(file)) throw new Error('저장 대화상자에서 고른 파일만 쓸 수 있습니다.');
  const w = o.width | 0, h = o.height | 0;
  if (w < 16 || h < 16 || w > 8192 || h > 8192 || w % 2 || h % 2) throw new Error('해상도는 16~8192의 짝수여야 합니다.');
  const exe = ffmpegPath();
  if (!fs.existsSync(exe)) throw new Error('FFmpeg를 찾을 수 없습니다: ' + exe);
  const args = encoderArgs({ ...o, width: w, height: h, file });
  const child = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  const id = Math.random().toString(36).slice(2);
  const job = { child, file, log: '', frameBytes: w * h * 4, exited: null };
  child.stderr.on('data', (d) => { job.log = (job.log + d.toString()).slice(-4000); });
  job.done = new Promise((res) => child.on('close', (code) => { job.exited = code; res(code); }));
  child.on('error', (err) => { job.log += String(err); });
  jobs.set(id, job);
  return id;
});
ipcMain.handle('enc:frame', async (_e, id, bytes) => {
  const j = jobs.get(id);
  if (!j) throw new Error('인코딩 작업이 없습니다.');
  if (j.exited !== null) throw new Error('FFmpeg가 중단되었습니다: ' + j.log);
  const buf = Buffer.from(bytes);
  if (buf.length !== j.frameBytes) throw new Error('프레임 크기가 맞지 않습니다.');
  if (!j.child.stdin.write(buf)) await new Promise((r) => j.child.stdin.once('drain', r));
  return true;
});
ipcMain.handle('enc:finish', async (_e, id) => {
  const j = jobs.get(id); if (!j) throw new Error('인코딩 작업이 없습니다.');
  j.child.stdin.end();
  const code = await j.done;
  jobs.delete(id);
  if (code !== 0) throw new Error('FFmpeg 오류(' + code + '): ' + j.log);
  return j.file;
});
ipcMain.handle('enc:cancel', async (_e, id) => {
  const j = jobs.get(id); if (!j) return false;
  try { j.child.stdin.destroy(); j.child.kill(); } catch {}
  await j.done; jobs.delete(id);
  try { await fsp.unlink(j.file); } catch {}
  return true;
});
