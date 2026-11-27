// build.mjs 와 vite.config.mjs(개발 서버)가 함께 쓰는 Vite 플러그인
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();

// 작업판 씬 타이틀 — 프리셋 등록 직후에 적용되는 가상 모듈 (공개판에서는 빈 모듈)
export function workTitles(work) {
  const ID = 'virtual:work-titles', RID = '\0' + ID;
  return {
    name: 'rlab-work-titles',
    resolveId: (id) => (id === ID ? RID : null),
    load(id) {
      if (id !== RID) return null;
      if (!work) return 'export {};';
      const f = path.join(ROOT, 'local/scene_titles.json');
      if (!fs.existsSync(f)) throw new Error('작업판 빌드에는 local/scene_titles.json 이 필요합니다');
      return `import { RL } from ${JSON.stringify(path.join(ROOT, 'src/core/rl.js'))};
const T = ${fs.readFileSync(f, 'utf8')};
for (const [k, v] of Object.entries(T.presets || {})) {
  const P = RL.presets[k]; if (!P) continue; if (v.label) P.label = v.label;
  const mk = P.make;
  P.make = function () { const p = mk.apply(this, arguments); if (v.name) p.name = v.name;
    for (const l of p.layers || []) if (T.layers && T.layers[l.name]) l.name = T.layers[l.name]; return p; };
}`;
    },
  };
}

// 버전 표기 (__RLAB_VERSION__) 치환
export const version = () => ({
  name: 'rlab-version',
  transform: (code) => (code.includes('__RLAB_VERSION__') ? code.split('__RLAB_VERSION__').join(VERSION) : null),
  transformIndexHtml: (html) => html.split('__RLAB_VERSION__').join(VERSION),
});
