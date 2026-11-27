// 실행 환경 타입 — 브라우저 표준에 없는 것, 데스크톱 앱이 넣어 주는 것, Vite 가 처리하는 import
import type { NativeBridge } from './rlab';

declare global {
  interface Window {
    /** 디버그 콘솔용 전역 (src/core/rl.js) */
    RL: Record<string, any>;
    /** 데스크톱 앱(Electron preload)이 제공. 브라우저에서 열면 없음 */
    rlabNative?: NativeBridge;
    webkitAudioContext?: typeof AudioContext;
    showDirectoryPicker?: (opts?: any) => Promise<any>;
  }
}
