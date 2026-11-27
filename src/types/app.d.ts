// 기능 파일(app/*.js)의 메서드를 App 클래스 타입에 합친다 — App.prototype 에 Object.assign 으로 붙는 것과 같은 모양
type F_inspector = typeof import('../app/inspector.js').inspector;
type F_transport = typeof import('../app/transport.js').transport;
type F_stage = typeof import('../app/stage.js').stage;
type F_timeline = typeof import('../app/timeline.js').timeline;
type F_exportDialog = typeof import('../app/exportDialog.js').exportDialog;
type F_menus = typeof import('../app/menus.js').menus;
type F_clipboard = typeof import('../app/clipboard.js').clipboard;
type F_history = typeof import('../app/history.js').history;
type F_shelf = typeof import('../app/shelf.js').shelf;
type F_assets = typeof import('../app/assets.js').assets;

declare module '../app/App.js' {
  // 기능 파일에서 처음 정하는 화면 상태 (값은 실행 중에만 — 여기서는 모양만 적는다)
  interface App {
    shelf: any[];                      // 씬 백업 목록 (하단 줄)
    shelfActive: number;               // 지금 열린 씬 백업 번호, 없으면 -1
    prefs: { shelf: boolean; [k: string]: any };
    layoutSz: { lw: number; rw: number; bh: number };
    menus: any[];
    zoom: number; pan: { x: number; y: number }; panned: boolean;
    hist: string[]; redoStack: string[]; _restoring: boolean;
    kfSel: any[]; kfClip: any[] | null; layerClip: any; lastClip: 'keys' | 'layer';
    paramRows: Array<() => void>; timeRows: Array<() => void>;
    playStartFrame: number; playStartTime: number; scrubT: number | null;
    gpuMode: 'normal' | 'safe'; lastOut: string;
    _resimT: any; _toastT: any; _saveT: any;
    _tlRows: any[]; _tlRowsBottom: number; _tlBand: { x0: number; y0: number; x1: number; y1: number } | null;
    _tlDrag: any; _tlSnapX: number | null;
  }
  interface App extends F_inspector, F_transport, F_stage, F_timeline, F_exportDialog, F_menus, F_clipboard, F_history, F_shelf, F_assets {}
}
export {};
