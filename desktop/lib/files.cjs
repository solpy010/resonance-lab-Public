'use strict';
// 파일 입출력 규칙 — 화면은 사용자가 대화상자에서 고른 폴더·파일에만 쓸 수 있다.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const FILTERS = {
  mov: [{ name: 'QuickTime ProRes', extensions: ['mov'] }],
  mp4: [{ name: 'MP4 (H.264)', extensions: ['mp4'] }],
  png: [{ name: 'PNG', extensions: ['png'] }],
  json: [{ name: 'RESONANCE LAB 프로젝트', extensions: ['json'] }],
};
// 파일 이름만 남기고 Windows 금지 문자 제거
const safeName = (n) => path.basename(String(n || 'untitled')).replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+$/, '_') || 'untitled';

function createGate() {
  const dirs = new Set(), files = new Set();
  return {
    approveDir(d) { dirs.add(path.resolve(d)); },
    approveFile(f) { const r = path.resolve(f); files.add(r); dirs.add(path.dirname(r)); },
    // 승인된 폴더 + 안전한 파일 이름 → 실제 경로
    inDir(dir, name) {
      const d = path.resolve(String(dir));
      if (!dirs.has(d)) throw new Error('선택하지 않은 폴더에는 쓸 수 없습니다.');
      return path.join(d, safeName(name));
    },
    file(f) {
      const r = path.resolve(String(f));
      if (!files.has(r)) throw new Error('저장 대화상자에서 고른 파일만 쓸 수 있습니다.');
      return r;
    },
  };
}

async function readProject(file) {
  const st = await fsp.stat(file);
  if (st.size > MAX_PROJECT_BYTES) throw new Error('프로젝트 파일이 너무 큽니다.');
  return { path: file, text: await fsp.readFile(file, 'utf8') };
}

// 자동 보관 — 씬 백업을 바꾸거나 지우기 직전의 상태를 backups 폴더에 남긴다. 최근 keep 개만 유지.
function createBackups(dir, { keep = 30 } = {}) {
  const issued = new Set();   // 이번 실행에서 쓴 이름 — 정리로 지워진 이름을 다시 쓰지 않도록
  return {
    dir,
    async save(label, bytes) {
      await fsp.mkdir(dir, { recursive: true });
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      const base = path.join(dir, `${stamp}_${safeName(label).replace(/\.[^.]*$/, '')}`);
      let f = base + '.rlab-act.json', n = 1;
      while (issued.has(f) || fs.existsSync(f)) f = `${base}_${++n}.rlab-act.json`;
      issued.add(f);
      await fsp.writeFile(f, Buffer.from(bytes));
      // 오래된 것부터 정리 (수정 시각 순, 같으면 이름 순)
      const all = await Promise.all((await fsp.readdir(dir)).filter((x) => x.endsWith('.rlab-act.json'))
        .map(async (x) => ({ x, t: (await fsp.stat(path.join(dir, x))).mtimeMs })));
      all.sort((a, b) => a.t - b.t || (a.x.length - b.x.length) || (a.x < b.x ? -1 : 1));
      for (const { x } of all.slice(0, Math.max(0, all.length - keep))) await fsp.unlink(path.join(dir, x)).catch(() => {});
      return f;
    },
  };
}
module.exports = { FILTERS, MAX_PROJECT_BYTES, safeName, createGate, readProject, createBackups };
