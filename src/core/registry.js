// 레지스트리 — 레이어 모듈(modules)과 프리셋(presets)을 등록하는 곳.
// 레이어 모듈은 등록 순서 = 레이어 추가 버튼 순서 (main.js 의 import 순서).
import { RL } from './rl.js';
export const modules = {};
export const presets = {};
RL.modules = modules;   // 디버그 콘솔·검사 도구용
RL.presets = presets;
