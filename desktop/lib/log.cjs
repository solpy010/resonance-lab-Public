'use strict';
// 오류·동작 기록 — 한 파일(rlab.log)에 메인·화면 프로세스 기록을 모두 남긴다. 1MB 를 넘으면 rlab.log.1 로 넘기고 새로 시작.
const fs = require('node:fs');
const path = require('node:path');

const fmt = (x) => (typeof x === 'string' ? x : x instanceof Error ? (x.stack || String(x)) : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());

function createLogger(file, { maxBytes = 1 << 20 } = {}) {
  let ready = false;
  function write(level, parts) {
    if (!file) return;
    try {
      if (!ready) { fs.mkdirSync(path.dirname(file), { recursive: true }); ready = true; }
      try { if (fs.statSync(file).size > maxBytes) fs.renameSync(file, file + '.1'); } catch { /* 아직 파일 없음 */ }
      fs.appendFileSync(file, new Date().toISOString() + '  ' + level.padEnd(5) + '  ' + parts.map(fmt).join(' ') + '\n');
    } catch { /* 기록 실패는 앱 동작에 영향 주지 않음 */ }
  }
  return {
    file,
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
    write: (level, ...a) => write(['info', 'warn', 'error'].includes(level) ? level : 'info', a),
  };
}
module.exports = { createLogger };
