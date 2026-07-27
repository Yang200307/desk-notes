// electron/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { createPdfOptions } = require('./pdf-options');
const {
  boundedText,
  isMarkdownPath,
  isPathInside,
  isSafeExternalUrl,
  normalizeAbsolutePath,
} = require('./security');

let mainWindow = null;
let currentFilePath = null;
let isDirty = false;
let forceClose = false;
let closeConfirmationPending = false;
let isExporting = false;
let updaterInitialized = false;
let downloadedUpdate = null;
let lastUpdateStatus = null;
let logFilePath = null;
const authorizedFiles = new Set();
const authorizedDirectories = new Set();

function writeLog(level, ...values) {
  const line = `[${new Date().toISOString()}] [${level}] ${values.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(' ')}\n`;
  if (logFilePath) fs.promises.appendFile(logFilePath, line, 'utf8').catch(() => {});
}

function assertTrustedEvent(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Rejected IPC from an untrusted renderer frame');
  }
}

function authorizeFile(filePath) {
  const normalized = normalizeAbsolutePath(filePath);
  if (!normalized || !isMarkdownPath(normalized)) throw new Error('Invalid Markdown file path');
  authorizedFiles.add(normalized);
  authorizedDirectories.add(path.dirname(normalized));
  return normalized;
}

function canReadMarkdown(filePath) {
  const normalized = normalizeAbsolutePath(filePath);
  if (!normalized || !isMarkdownPath(normalized)) return false;
  return authorizedFiles.has(normalized) || [...authorizedDirectories].some(dir => isPathInside(dir, normalized));
}

function sendUpdateStatus(status) {
  lastUpdateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('update:status', status);
  }
}

function runRendererSetting(method, fallbackAction) {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`window.__settings?.${method}()`)
    .catch(() => mainWindow?.webContents.send('menu:action', fallbackAction));
}

// ── Window ──
function createWindow() {
  forceClose = false;
  closeConfirmationPending = false;
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
      sandbox: true,
    },
    title: 'Markdown 编辑器',
    show: false,
  });

  const isDev = process.argv.includes('--dev');
  const isDebug = process.argv.includes('--devtools') || isDev;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(err => writeLog('error', err));
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevServer = isDev && url.startsWith('http://localhost:5173');
    if (isDevServer || url === mainWindow?.webContents.getURL()) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(err => writeLog('error', err));
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }
  if (isDebug) {
    mainWindow.webContents.openDevTools();
  }

  if (isDebug) {
    mainWindow.webContents.on('console-message', (_event, details) => writeLog(details.level || 'renderer', details.message || ''));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Close confirmation: intercept close when document is dirty
  mainWindow.on('close', (e) => {
    if (isDirty && !forceClose) {
      e.preventDefault();
      if (closeConfirmationPending) return;
      closeConfirmationPending = true;
      mainWindow.webContents.send('menu:action', 'confirm-close');
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (lastUpdateStatus) mainWindow?.webContents.send('update:status', lastUpdateStatus);
    const fileArg = process.argv.find(isMarkdownPath);
    const fileToOpen = pendingFile || fileArg;
    pendingFile = null;
    if (fileToOpen) loadFile(fileToOpen);
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

async function loadFile(filePath) {
  try {
    const normalized = authorizeFile(filePath);
    const content = await fs.promises.readFile(normalized, 'utf-8');
    mainWindow?.webContents.send('file:opened', { path: normalized, content });
  } catch (err) {
    dialog.showErrorBox('错误', `无法打开文件: ${err.message}`);
  }
}

// ── IPC Handlers ──
function setupIPC() {
  ipcMain.handle('file:read', async (event, fp) => {
    assertTrustedEvent(event);
    try {
      if (!canReadMarkdown(fp)) throw new Error('File access was not authorized');
      return { success: true, content: await fs.promises.readFile(path.resolve(fp), 'utf-8') };
    }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:write', async (event, fp, content) => {
    assertTrustedEvent(event);
    try {
      const normalized = normalizeAbsolutePath(fp);
      if (!normalized || normalized !== currentFilePath || !authorizedFiles.has(normalized)) throw new Error('File write was not authorized');
      if (typeof content !== 'string') throw new Error('Invalid file content');
      await fs.promises.writeFile(normalized, content, 'utf-8');
      mainWindow?.setTitle(`${path.basename(normalized)} — Markdown 编辑器`);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:open-dialog', async (event) => {
    assertTrustedEvent(event);
    try {
      const result = await dialog.showOpenDialog(mainWindow, OPEN_DIALOG_OPTS);
      if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
      const fp = authorizeFile(result.filePaths[0]);
      const content = await fs.promises.readFile(fp, 'utf-8');
      return { success: true, path: fp, content };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:save-dialog', async (event) => {
    assertTrustedEvent(event);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存 Markdown 文件',
      defaultPath: currentFilePath || 'document.md',
      filters: [MD_FILE_FILTER],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try { return { success: true, path: authorizeFile(result.filePath) }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:set-current', (event, fp) => {
    assertTrustedEvent(event);
    const normalized = normalizeAbsolutePath(fp);
    if (!normalized || !authorizedFiles.has(normalized)) return { success: false, error: 'File was not authorized' };
    currentFilePath = normalized;
    mainWindow?.setTitle(`${path.basename(normalized)} — Markdown 编辑器`);
    return { success: true };
  });

  ipcMain.handle('dir:list', async (event, dirPath) => {
    assertTrustedEvent(event);
    try {
      const normalizedDir = normalizeAbsolutePath(dirPath);
      if (!normalizedDir || !authorizedDirectories.has(normalizedDir)) throw new Error('Directory access was not authorized');
      const entries = await fs.promises.readdir(normalizedDir, { withFileTypes: true });
      const files = entries
        .filter(e => e.isFile() && e.name.match(/\.(md|markdown|mdown|mdtext)$/i))
        .map(e => ({ name: e.name, path: path.join(normalizedDir, e.name) }));
      return { success: true, files, dirPath: normalizedDir };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('export:pdf', async (event) => {
    assertTrustedEvent(event);
    if (!mainWindow) return { success: false, error: 'No window' };
    if (isExporting) return { success: false, error: 'PDF export is already in progress' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 PDF',
      defaultPath: currentFilePath ? currentFilePath.replace(/\.(md|markdown|mdown|mdtext)$/i, '.pdf') : 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'canceled' };
    const outputPath = path.extname(result.filePath).toLowerCase() === '.pdf' ? result.filePath : `${result.filePath}.pdf`;
    try {
      isExporting = true;
      await mainWindow.webContents.executeJavaScript('window.__prepareForPrint?.()');
      const pdfData = await mainWindow.webContents.printToPDF(createPdfOptions());
      await fs.promises.writeFile(outputPath, pdfData);
      return { success: true, path: outputPath };
    } catch (err) { return { success: false, error: err.message }; }
    finally { isExporting = false; }
  });

  ipcMain.handle('theme:get-system', (event) => { assertTrustedEvent(event); return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'; });
  ipcMain.handle('dialog:show-error', async (event, title, msg) => {
    assertTrustedEvent(event);
    dialog.showErrorBox(boundedText(title, 100) || '错误', boundedText(msg));
    return { success: true };
  });
  ipcMain.handle('dialog:confirm-unsaved', async (event, context) => {
    assertTrustedEvent(event);
    if (!['close', 'switch', 'update'].includes(context)) return 'cancel';
    const isClose = context === 'close';
    const isUpdate = context === 'update';
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '未保存的修改',
      message: isClose ? '关闭前要保存当前文件吗？' : isUpdate ? '安装更新前要保存当前文件吗？' : '切换文件前要保存当前文件吗？',
      detail: '选择“取消”可返回编辑器，当前内容不会丢失。',
      buttons: [isClose ? '保存并退出' : isUpdate ? '保存并更新' : '保存并切换', isClose ? '放弃并退出' : isUpdate ? '放弃并更新' : '放弃并切换', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return ['save', 'discard', 'cancel'][result.response] || 'cancel';
  });

  // Dirty state tracking for close confirmation
  ipcMain.handle('dirty:set', (event, dirty) => {
    assertTrustedEvent(event);
    if (typeof dirty !== 'boolean') throw new Error('Invalid dirty state');
    isDirty = dirty;
  });

  ipcMain.handle('confirm:force-close', (event) => {
    assertTrustedEvent(event);
    closeConfirmationPending = false;
    forceClose = true; isDirty = false;
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('confirm:cancel-close', (event) => {
    assertTrustedEvent(event);
    closeConfirmationPending = false;
    isDirty = true; forceClose = false;
  });

  ipcMain.handle('update:install', (event) => {
    assertTrustedEvent(event);
    if (!downloadedUpdate) return { success: false, error: 'No downloaded update' };
    if (isDirty) return { success: false, needsSave: true };
    forceClose = true;
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
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
  if (!app.isPackaged || updaterInitialized) return;
  updaterInitialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (...args) => writeLog('info', ...args),
    warn: (...args) => writeLog('warn', ...args),
    error: (...args) => writeLog('error', ...args),
    debug: (...args) => writeLog('debug', ...args),
  };

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking', message: '正在检查更新…' }));
  autoUpdater.on('update-available', info => sendUpdateStatus({ state: 'available', message: `发现新版本 ${info.version}，正在下载…`, version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'idle', message: '' }));
  autoUpdater.on('download-progress', progress => sendUpdateStatus({ state: 'downloading', message: `正在下载更新 ${Math.round(progress.percent)}%`, percent: progress.percent }));

  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdate = info;
    sendUpdateStatus({ state: 'downloaded', message: `新版本 ${info.version} 已下载`, version: info.version });
  });

  autoUpdater.on('error', (err) => {
    writeLog('error', '自动更新失败:', err);
    sendUpdateStatus({ state: 'error', message: '自动更新暂时不可用' });
  });

  // Check for updates 3 seconds after startup to let the app settle
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => writeLog('error', err));
  }, 3000);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const fileArg = argv.find(isMarkdownPath);
  if (fileArg) loadFile(fileArg);
});

app.whenReady().then(() => {
  logFilePath = path.join(app.getPath('userData'), 'logs', 'app.log');
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  setupIPC();
  buildMenu();
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
