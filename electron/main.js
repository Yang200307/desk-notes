// electron/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let currentFilePath = null;

// ── Window ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Markdown Editor',
    show: false,
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ──
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open...', accelerator: 'Ctrl+O', click: handleOpenFile },
        { label: 'Save', accelerator: 'Ctrl+S', click: () => mainWindow?.webContents.send('menu:action', 'save') },
        { type: 'separator' },
        { label: 'Export PDF...', accelerator: 'Ctrl+Shift+P',
          click: () => mainWindow?.webContents.send('menu:action', 'export-pdf') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Ctrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'Ctrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'Ctrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'Ctrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Theme', accelerator: 'Ctrl+T',
          click: () => mainWindow?.webContents.send('menu:action', 'toggle-theme') },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── File Operations ──
async function handleOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown File',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdtext'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    loadFile(result.filePaths[0]);
  }
}

function loadFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    mainWindow?.setTitle(`${path.basename(filePath)} — Markdown Editor`);
    mainWindow?.webContents.send('file:opened', { path: filePath, content });
  } catch (err) {
    dialog.showErrorBox('Error', `Cannot open file: ${err.message}`);
  }
}

// ── IPC Handlers ──
function setupIPC() {
  ipcMain.handle('file:read', async (_e, fp) => {
    try { return { success: true, content: fs.readFileSync(fp, 'utf-8') }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:write', async (_e, fp, content) => {
    try { fs.writeFileSync(fp, content, 'utf-8'); currentFilePath = fp; return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Markdown File',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdtext'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { success: false };
    const fp = result.filePaths[0];
    const content = fs.readFileSync(fp, 'utf-8');
    currentFilePath = fp;
    mainWindow?.setTitle(`${path.basename(fp)} — Markdown Editor`);
    return { success: true, path: fp, content };
  });

  ipcMain.handle('dir:list', async (_e, dirPath) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile() && e.name.match(/\.(md|markdown|mdown|mdtext)$/i))
        .map(e => ({ name: e.name, path: path.join(dirPath, e.name) }));
      return { success: true, files, dirPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('export:pdf', async () => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: currentFilePath ? currentFilePath.replace(/\.(md|markdown)$/i, '.pdf') : 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled) return { success: false, error: 'canceled' };
    try {
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      });
      fs.writeFileSync(result.filePath, pdfData);
      return { success: true, path: result.filePath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('theme:get-system', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  ipcMain.handle('dialog:show-error', async (_e, title, msg) => { dialog.showErrorBox(title, msg); });
}

// ── Lifecycle ──
app.whenReady().then(() => {
  setupIPC();
  buildMenu();
  createWindow();

  app.on('open-file', (_e, fp) => {
    if (app.isReady()) loadFile(fp);
    else app.once('ready', () => loadFile(fp));
  });

  // Open file from command-line arg (double-click in Explorer)
  const fileArg = process.argv.slice(1).find(a => a.match(/\.(md|markdown)$/i));
  if (fileArg) loadFile(fileArg);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
