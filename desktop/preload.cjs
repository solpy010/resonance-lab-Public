'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// 화면에 주는 최소한의 기능 목록. 화면은 Node 기능에 직접 접근하지 못한다.
contextBridge.exposeInMainWorld('rlabNative', {
  version: '0.5.8',
  chooseFolder: (title) => ipcRenderer.invoke('dlg:folder', title),
  saveDialog: (name, kind) => ipcRenderer.invoke('dlg:save', name, kind),
  writeFile: (dir, name, bytes) => ipcRenderer.invoke('fs:write', dir, name, bytes),
  writePath: (file, bytes) => ipcRenderer.invoke('fs:writePath', file, bytes),
  openProject: () => ipcRenderer.invoke('project:open'),
  encBegin: (opt) => ipcRenderer.invoke('enc:begin', opt),
  encFrame: (id, bytes) => ipcRenderer.invoke('enc:frame', id, bytes),
  encFinish: (id) => ipcRenderer.invoke('enc:finish', id),
  encCancel: (id) => ipcRenderer.invoke('enc:cancel', id),
  showItem: (p) => ipcRenderer.invoke('shell:show', p),
  gpuMode: () => ipcRenderer.invoke('app:gpuMode'),
  relaunch: (safe) => ipcRenderer.invoke('app:relaunch', safe),
  startFail: (msg) => ipcRenderer.invoke('app:startFail', msg),
  logPath: () => ipcRenderer.invoke('app:logPath'),
  log: (level, msg) => ipcRenderer.invoke('app:log', level, msg),
  backup: (label, bytes) => ipcRenderer.invoke('backup:save', label, bytes),
  backupDir: () => ipcRenderer.invoke('backup:dir'),
  openDir: (which) => ipcRenderer.invoke('shell:openDir', which),
});
