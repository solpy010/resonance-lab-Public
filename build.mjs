// RESONANCE LAB 빌드 — src/ 를 이어 붙여 실행 파일 하나(HTML)를 만든다. 평문 빌드(보호·축약 없음).
//   node build.mjs          공개판  → app/RESONANCE_LAB.html (저장소에 함께 올림 — 받아서 바로 실행)
//   node build.mjs --work   작업판  → dist/RESONANCE_LAB_work.html (local/scene_titles.json 의 씬 타이틀 적용, 저장소에는 없음)
import fs from 'fs';

const WORK = process.argv.includes('--work');
const VERSION = fs.readFileSync('VERSION', 'utf8').trim();
const S = (p) => fs.readFileSync('src/' + p, 'utf8');

// 리듬게임 모듈은 이름 충돌을 막기 위해 자체 스코프로 감싼다
const rhythm = () => "(function () {\nconst RL = window.RL;\n" + S('rhythm/fx_glsl.js') + '\n' + S('rhythm/mod_rhythm.js') + '\n})();\n';

const order = ['gl.js', 'batch.js', 'builtins.js', 'engine.js', 'fx.js', 'mod_wave.js', 'mod_fluid.js', 'mod_particle.js', 'mod_dot.js',
  'mod_line.js', 'mod_beam.js', 'mod_surface.js', 'mod_shapes.js', 'rhythm', 'mod_floaters.js', 'robot_mesh.js', 'mod_robot.js',
  'mod_neongeo.js', 'mod_laser.js', 'presets.js', 'audio.js', 'export.js', 'ui.js', 'ui2.js'];

let titles = '';
if (WORK) {
  const f = 'local/scene_titles.json';
  if (!fs.existsSync(f)) throw new Error('작업판 빌드에는 ' + f + ' 가 필요합니다');
  titles = `// ===== work titles =====\n(function () {\n  const T = ${fs.readFileSync(f, 'utf8')};\n` +
    `  for (const [k, v] of Object.entries(T.presets || {})) { const P = RL.presets[k]; if (!P) continue; if (v.label) P.label = v.label;\n` +
    `    const mk = P.make; P.make = function () { const p = mk.apply(this, arguments); if (v.name) p.name = v.name;\n` +
    `      for (const l of p.layers || []) if (T.layers && T.layers[l.name]) l.name = T.layers[l.name]; return p; }; }\n})();\n`;
}

const js = order.map((f) => `// ===== ${f} =====\n` + (f === 'rhythm' ? rhythm() : S(f)) + (f === 'presets.js' ? '\n' + titles : '')).join('\n');
const mux = fs.readFileSync('node_modules/mp4-muxer/build/mp4-muxer.js', 'utf8');
const muxLic = '/*! mp4-muxer v5 — MIT License (c) 2023 Vanilagy — https://github.com/Vanilagy/mp4-muxer */\n';
for (const [n, s] of [['js', js], ['mux', mux]]) if (/<\/script/i.test(s)) throw new Error('</script in ' + n);

const head = `/*! RESONANCE LAB v${VERSION}${WORK ? ' (작업판)' : ''} — Unlicense / 퍼블릭 도메인. 누구나 자유롭게 사용·수정·배포할 수 있습니다. https://unlicense.org\n` +
  ` *  포함된 오픈소스는 각자의 라이선스를 따릅니다: mp4-muxer (MIT). */\n`;
let html = S('index.html');
html = html.split('/*__CSS__*/').join(S('style.css'));
html = html.split('/*__MP4MUXER__*/').join(muxLic + mux);
html = html.split('/*__JS__*/').join(head + js);
html = html.split('__RLAB_VERSION__').join(VERSION);

const out = WORK ? 'dist/RESONANCE_LAB_work.html' : 'app/RESONANCE_LAB.html';
fs.mkdirSync(out.split('/')[0], { recursive: true });
fs.writeFileSync(out, html);
console.log('ok', out, (html.length / 1024).toFixed(0) + 'KB', 'v' + VERSION);
