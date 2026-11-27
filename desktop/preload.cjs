'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Minimal, explicit bridge. The page never gets Node access.
contextBridge.exposeInMainWorld('rlabNative', {
  version: '0.5.6',
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
});
