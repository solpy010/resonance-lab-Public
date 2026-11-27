// 데스크톱 앱 안에서 실행되는 검사 스크립트 (tests/desktop_e2e.mjs 가 넣어 줌)
(async () => {
  const N = window.rlabNative, A = window.app, r = { version: N.version };
  // 1) 프로젝트 저장 (저장 대화상자 → writePath)
  const f = await N.saveDialog('e2e.rlab.json', 'json');
  r.save = await N.writePath(f, new TextEncoder().encode(JSON.stringify(A.project)));
  // 2) 허용 안 된 경로 쓰기는 거부
  try { await N.writePath('/tmp/evil.json', new Uint8Array(1)); r.evil = 'written!'; } catch (e) { r.evil = 'blocked'; }
  // 3) ProRes 422 HQ 0.5초 출력 (실제 FFmpeg)
  A.project.width = 320; A.project.height = 180;
  const out = await A.exporter.ffmpegVideo({ from: 0, to: 0.5 }, () => {}, 'prores422hq');
  r.prores = out;
  // 4) 씬 백업 자동 보관 + 액트 열기 교체
  A.shelfSave(); A.shelfSave();
  const before = A.shelf.length;
  window.confirm = () => true;
  A.loadAct(JSON.stringify({ type: 'rlab-act', version: 1, scenes: [A.shelf[0]] }), 'x');
  await new Promise(res => setTimeout(res, 800));
  r.shelfBefore = before; r.shelfAfter = A.shelf.length; r.backupDir = await N.backupDir();
  // 5) 화면 기록
  r.log = await N.log('warn', 'e2e 화면 기록 확인');
  r.logPath = await N.logPath();
  return r;
})()
