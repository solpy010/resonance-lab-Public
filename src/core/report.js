// 화면 쪽 기록 — 데스크톱 앱이면 rlab.log 에 남기고, 브라우저면 최근 기록만 메모리에 둔다.
// 처리되지 않은 오류도 여기로 모인다 (브라우저 콘솔에도 그대로 보임).
import { RL } from './rl.js';

const MAX = 100;
/** @type {Array<{t: number, level: string, msg: string}>} */
const recent = [];

const text = (x) => (x instanceof Error ? (x.stack || x.message) : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());

/** @param {'info'|'warn'|'error'} level @param {...any} parts */
export function report(level, ...parts) {
  const msg = parts.map(text).join(' ');
  recent.push({ t: Date.now(), level, msg });
  if (recent.length > MAX) recent.shift();
  const N = window.rlabNative;
  if (N && N.log) N.log(level, msg).catch(() => {});
}
export const recentLog = () => recent.slice();

window.addEventListener('error', (e) => { if (e.error || e.message) recent.push({ t: Date.now(), level: 'error', msg: text(e.error || e.message) }); });
// 처리되지 않은 오류는 콘솔 오류로도 찍혀 데스크톱 앱이 이미 기록하므로, 여기서는 최근 목록에만 둔다
window.addEventListener('unhandledrejection', (e) => { recent.push({ t: Date.now(), level: 'error', msg: '처리되지 않은 오류: ' + text(e.reason) }); });

Object.assign(RL, { recentLog });
