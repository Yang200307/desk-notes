// electron/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let currentFilePath = null;
let isDirty = false;
let forceClose = false;

function runRendererSetting(method, fallbackAction) {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`window.__settings?.${method}()`)
    .catch(() => mainWindow?.webContents.send('menu:action', fallbackAction));
}

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
  const isDebug = process.argv.includes('--devtools') || isDev;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }
  if (isDebug) {
    mainWindow.webContents.openDevTools();
  }

  // Capture renderer console messages
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error'];
    fs.appendFileSync(
      path.join(__dirname, '..', 'renderer-console.log'),
      `[${new Date().toISOString()}] [${levels[level]}] ${message}\n`
    );
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Close confirmation: intercept close when document is dirty
  mainWindow.on('close', (e) => {
    if (isDirty && !forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('menu:action', 'confirm-close');
    }
  });
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
        { label: '退出', accelerator: 'Alt+F4', click: () => mainWindow?.close() },
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
    {
      label: '设置',
      submenu: [
        {
          label: '字体切换',
          click: () => runRendererSetting('cycleFont', 'setting-font')
        },
        {
          label: '字号切换',
          click: () => runRendererSetting('cycleSize', 'setting-size')
        },
        {
          label: '页面宽度',
          click: () => runRendererSetting('cycleWidth', 'setting-width')
        },
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
    try {
      fs.writeFileSync(fp, content, 'utf-8');
      currentFilePath = fp;
      mainWindow?.setTitle(`${path.basename(fp)} — Markdown 编辑器`);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, OPEN_DIALOG_OPTS);
    if (result.canceled || !result.filePaths.length) return { success: false };
    const fp = result.filePaths[0];
    const content = fs.readFileSync(fp, 'utf-8');
    return { success: true, path: fp, content };
  });

  ipcMain.handle('file:save-dialog', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存 Markdown 文件',
      defaultPath: currentFilePath || 'document.md',
      filters: [MD_FILE_FILTER],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    return { success: true, path: result.filePath };
  });

  ipcMain.handle('file:set-current', (_e, fp) => {
    currentFilePath = fp;
    mainWindow?.setTitle(`${path.basename(fp)} — Markdown 编辑器`);
    return { success: true };
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
        pageSize: { width: 210000, height: 297000 },  // A4 in microns
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      });
      fs.writeFileSync(result.filePath, pdfData);
      return { success: true, path: result.filePath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('theme:get-system', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  ipcMain.handle('dialog:show-error', async (_e, title, msg) => { dialog.showErrorBox(title, msg); return { success: true }; });
  ipcMain.handle('dialog:confirm-unsaved', async (_e, context) => {
    const isClose = context === 'close';
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '未保存的修改',
      message: isClose ? '关闭前要保存当前文件吗？' : '切换文件前要保存当前文件吗？',
      detail: '选择“取消”可返回编辑器，当前内容不会丢失。',
      buttons: [isClose ? '保存并退出' : '保存并切换', isClose ? '放弃并退出' : '放弃并切换', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return ['save', 'discard', 'cancel'][result.response];
  });

  // Dirty state tracking for close confirmation
  ipcMain.handle('dirty:set', (_e, dirty) => { isDirty = dirty; });

  ipcMain.handle('confirm:force-close', () => {
    forceClose = true; isDirty = false;
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('confirm:cancel-close', () => {
    isDirty = true; forceClose = false;
  });
}

// ── Pending file queue (wait for renderer ready) ──
let pendingFile = null;

// Register BEFORE whenReady to catch early open-file events (Windows)
app.on('open-file', (_e, fp) => {
  _e.preventDefault();
  if (mainWindow && mainWindow.webContents.isLoading() === false) {
    loadFile(fp);
  } else {
    pendingFile = fp;
  }
});

// ── Lifecycle ──
// ── Auto Updater ──
function setupAutoUpdater() {
  // Only check for updates in the packaged app (not dev mode)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: `新版本 ${info.version} 已准备就绪，是否立即重启安装？`,
      buttons: ['立即重启', '稍后提醒'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('自动更新检查失败:', err.message);
  });

  // Check for updates 3 seconds after startup to let the app settle
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
}

app.whenReady().then(() => {
  setupIPC();
  buildMenu();
  createWindow();

  // Wait for renderer to fully load before sending file content
  mainWindow.webContents.on('did-finish-load', () => {
    setupAutoUpdater();
    // Check command-line arg first (Windows double-click when app was closed)
    const fileArg = process.argv.find(a => a.match(/\.(md|markdown)$/i));
    if (fileArg && !pendingFile) {
      loadFile(fileArg);
    } else if (pendingFile) {
      loadFile(pendingFile);
      pendingFile = null;
    }

  });
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
