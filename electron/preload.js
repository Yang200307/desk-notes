// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (fp) => ipcRenderer.invoke('file:read', fp),
  writeFile: (fp, content) => ipcRenderer.invoke('file:write', fp, content),
  openFileDialog: () => ipcRenderer.invoke('file:open-dialog'),
  listDir: (dirPath) => ipcRenderer.invoke('dir:list', dirPath),
  exportPDF: () => ipcRenderer.invoke('export:pdf'),
  getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
  onMenuAction: (cb) => { ipcRenderer.on('menu:action', (_e, action) => cb(action)); },
  onFileOpened: (cb) => { ipcRenderer.on('file:opened', (_e, data) => cb(data)); },
  showError: (title, msg) => ipcRenderer.invoke('dialog:show-error', title, msg),
  setDirty: (dirty) => ipcRenderer.invoke('dirty:set', dirty),
  forceClose: () => ipcRenderer.invoke('confirm:force-close'),
  cancelClose: () => ipcRenderer.invoke('confirm:cancel-close'),
});
