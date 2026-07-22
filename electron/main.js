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
    title: 'Markdown 编辑器',
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
      label: '文件',
      submenu: [
        { label: '打开...', accelerator: 'Ctrl+O', click: handleOpenFile },
        { label: '保存', accelerator: 'Ctrl+S', click: () => mainWindow?.webContents.send('menu:action', 'save') },
        { type: 'separator' },
        { label: '导出 PDF...', accelerator: 'Ctrl+Shift+P',
          click: () => mainWindow?.webContents.send('menu:action', 'export-pdf') },
        { type: 'separator' },
        { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', role: 'cut' },
        { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
        { label: '全选', accelerator: 'Ctrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换主题', accelerator: 'Ctrl+T',
          click: () => mainWindow?.webContents.send('menu:action', 'toggle-theme') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── File Operations ──
const MD_FILE_FILTER = { name: 'Markdown 文件', extensions: ['md', 'markdown', 'mdown', 'mdtext'] };
const OPEN_DIALOG_OPTS = {
  title: '打开 Markdown 文件',
  filters: [MD_FILE_FILTER],
  properties: ['openFile'],
};

async function handleOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, OPEN_DIALOG_OPTS);
  if (!result.canceled && result.filePaths.length > 0) {
    loadFile(result.filePaths[0]);
  }
}

function loadFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    mainWindow?.setTitle(`${path.basename(filePath)} — Markdown 编辑器`);
    mainWindow?.webContents.send('file:opened', { path: filePath, content });
  } catch (err) {
    dialog.showErrorBox('错误', `无法打开文件: ${err.message}`);
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
    const result = await dialog.showOpenDialog(mainWindow, OPEN_DIALOG_OPTS);
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
      title: '导出 PDF',
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
  ipcMain.handle('dialog:show-error', async (_e, title, msg) => { dialog.showErrorBox(title, msg); return { success: true }; });
}

// ── Lifecycle ──
app.whenReady().then(() => {
  setupIPC();
  buildMenu();
  createWindow();

  // Already inside whenReady(), so app is always ready at this point
  app.on('open-file', (_e, fp) => loadFile(fp));

  // Open file from command-line arg (double-click in Explorer)
  const fileArg = process.argv.slice(1).find(a => a.match(/\.(md|markdown)$/i));
  if (fileArg) loadFile(fileArg);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
