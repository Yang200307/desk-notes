// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  readFile: (fp) => ipcRenderer.invoke('file:read', fp),
  writeFile: (fp, content) => ipcRenderer.invoke('file:write', fp, content),
  openFileDialog: () => ipcRenderer.invoke('file:open-dialog'),
  saveFileDialog: () => ipcRenderer.invoke('file:save-dialog'),
  setCurrentFile: (fp) => ipcRenderer.invoke('file:set-current', fp),
  listDir: (dirPath) => ipcRenderer.invoke('dir:list', dirPath),
  exportPDF: () => ipcRenderer.invoke('export:pdf'),
  getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
  onMenuAction: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const listener = (_e, action) => cb(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
  onFileOpened: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('file:opened', listener);
    return () => ipcRenderer.removeListener('file:opened', listener);
  },
  onUpdateStatus: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const listener = (_e, status) => cb(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  showError: (title, msg) => ipcRenderer.invoke('dialog:show-error', title, msg),
  setDirty: (dirty) => ipcRenderer.invoke('dirty:set', dirty),
  forceClose: () => ipcRenderer.invoke('confirm:force-close'),
  cancelClose: () => ipcRenderer.invoke('confirm:cancel-close'),
  confirmUnsaved: (context) => ipcRenderer.invoke('dialog:confirm-unsaved', context),
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(api));
