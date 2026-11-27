'use strict';
// 데스크톱 설정(settings.json) — 읽을 때 기본값을 채우고, 쓸 때는 임시 파일에 쓴 뒤 바꿔치기(쓰다가 꺼져도 파일이 깨지지 않음).
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { gpuMode: 'normal', lastDir: null };

function createSettings(file) {
  let cache = null;
  function get() {
    if (!cache) {
      let s = {};
      try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* 없거나 깨짐 → 기본값 */ }
      cache = { ...DEFAULTS, ...(s && typeof s === 'object' && !Array.isArray(s) ? s : {}) };
      if (!['normal', 'safe'].includes(cache.gpuMode)) cache.gpuMode = 'normal';
      if (cache.lastDir != null && typeof cache.lastDir !== 'string') cache.lastDir = null;
    }
    return { ...cache };
  }
  function set(patch) {
    cache = { ...get(), ...patch };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
      fs.renameSync(tmp, file);
      return true;
    } catch { return false; }
  }
  return { get, set, file };
}
module.exports = { createSettings, DEFAULTS };
