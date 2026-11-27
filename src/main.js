// 진입점 — 모듈을 예전 이어 붙이기와 같은 순서로 불러온다.
// 레이어 모듈 import 순서 = 레이어 추가 버튼 순서이므로 바꾸지 말 것.
import './style.css';
import './core/report.js';
import './core/registry.js';
import './gl.js';
import './batch.js';
import './builtins.js';
import './engine.js';
import './fx.js';
import './mod_wave.js';
import './mod_fluid.js';
import './mod_particle.js';
import './mod_dot.js';
import './mod_line.js';
import './mod_beam.js';
import './mod_surface.js';
import './mod_shapes.js';
import './rhythm/mod_rhythm.js';
import './mod_floaters.js';
import './robot_mesh.js';
import './mod_robot.js';
import './mod_neongeo.js';
import './mod_laser.js';
import './presets.js';
import 'virtual:work-titles';   // 작업판 빌드에서만 내용이 들어감 (build.mjs --work)
import './audio.js';
import './export.js';
import './app/App.js';
