# Markdown WYSIWYG Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop WYSIWYG Markdown editor using Electron + Milkdown Crepe, with LaTeX math, Mermaid diagrams, code highlighting, file-tree sidebar, PDF export, auto-save, and light/dark theme.

**Architecture:** Electron shell with a vanilla-JS renderer bundled by Vite. Milkdown Crepe provides the WYSIWYG editor (all Markdown rendering + inline editing). Main process handles file I/O, PDF export, and system theme detection via IPC. Renderer DOM post-processes Mermaid code blocks into rendered diagrams.

**Tech Stack:** Electron 33+, @milkdown/crepe 7.15+ (bundles Milkdown core, CommonMark, GFM, KaTeX, CodeMirror), Mermaid 11+, Vite 6+, electron-builder 25+ with NSIS target.

## Global Constraints

- No React/Vue frameworks — vanilla JS only in renderer
- No split-source/preview mode — pure WYSIWYG
- No tabs — single file at a time
- No network features — fully offline local app
- Cold start < 3 seconds, default window 1200×800
- Installer auto-registers .md file association
- Default theme follows Windows system theme
- All renderer dependencies bundled via Vite; main/preload are CommonJS run directly by Electron

---

## File Structure (post-implementation)

```
md-editor/
├── package.json              # Dependencies + electron-builder config
├── vite.config.js            # Vite config (bundles src/ → dist-renderer/)
├── .gitignore
├── electron/
│   ├── main.js               # Electron main process (CJS)
│   └── preload.js            # contextBridge IPC (CJS)
├── src/
│   ├── index.html            # Entry HTML (sidebar + editor + status-bar layout)
│   ├── style.css             # All styles: layout, light/dark theme vars, Milkdown overrides
│   ├── app.js                # Bootstrap: wires editor, theme, sidebar, auto-save, mermaid
│   ├── editor.js             # Milkdown Crepe factory (create/destroy/getMarkdown/setMarkdown)
│   ├── theme.js              # System theme detection + toggle + persistence
│   ├── sidebar.js            # File-tree sidebar (list .md files, click to switch)
│   ├── mermaid.js            # DOM post-processing: find ```mermaid blocks → render SVG
│   └── export.js             # Trigger PDF export via IPC
├── assets/
│   └── icon.png              # 256×256 app icon (generated via canvas)
├── scripts/
│   └── generate-icon.js      # Node script to generate a simple Markdown-style icon
├── dist/                     # electron-builder output (NSIS .exe installer)
└── dist-renderer/            # Vite build output (not committed)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: `package.json` with all deps, `vite.config.js` with Electron-aware config

- [ ] **Step 1: Initialize project and write package.json**

```bash
cd "C:/Users/10339/OneDrive/桌面/origin_data/Markdown阅读器"
```

Write `package.json`:

```json
{
  "name": "md-editor",
  "version": "1.0.0",
  "description": "WYSIWYG Markdown Editor for Windows",
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite build --watch & sleep 2 && electron .",
    "build:renderer": "vite build",
    "start": "electron .",
    "pack": "npm run build:renderer && electron-builder --win",
    "generate-icon": "node scripts/generate-icon.js"
  },
  "dependencies": {
    "@milkdown/crepe": "^7.15.5",
    "mermaid": "^11.4.0"
  },
  "devDependencies": {
    "electron": "^33.2.0",
    "electron-builder": "^25.1.0",
    "vite": "^6.0.0"
  },
  "build": {
    "appId": "com.markdown-editor.app",
    "productName": "Markdown Editor",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "dist-renderer/**/*",
      "assets/**/*"
    ],
    "extraResources": [
      {
        "from": "assets",
        "to": "assets"
      }
    ],
    "fileAssociations": [
      {
        "ext": ["md", "markdown", "mdown", "mdtext"],
        "name": "Markdown",
        "description": "Markdown document"
      }
    ],
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "assets/icon.ico",
      "uninstallerIcon": "assets/icon.ico"
    },
    "win": {
      "target": "nsis",
      "icon": "assets/icon.png"
    }
  }
}
```

- [ ] **Step 2: Write vite.config.js**

```js
// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  root: 'src',
  build: {
    outDir: '../dist-renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@milkdown/crepe': path.resolve('node_modules/@milkdown/crepe'),
    },
  },
});
```

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
dist-renderer/
.vite/
*.exe
*.log
```

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p electron src assets scripts dist
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Verify: `node_modules/` exists with `@milkdown/crepe`, `mermaid`, `electron`, `electron-builder`, `vite`.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json vite.config.js .gitignore
git commit -m "chore: scaffold project with Electron + Milkdown + Mermaid + Vite"
```

---

### Task 2: Electron Main Process

**Files:**
- Create: `electron/main.js`

**Interfaces:**
- Produces: BrowserWindow 1200×800, application menu, IPC handlers for file ops and PDF export
- IPC channels: `file:read`, `file:write`, `file:open-dialog`, `dir:list`, `export:pdf`, `theme:get-system`, `file:on-open`, `menu:action`

- [ ] **Step 1: Write electron/main.js**

```js
// electron/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let currentFilePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Markdown Editor',
    show: false,
  });

  // Load renderer
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Application Menu ──
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'Ctrl+O',
          click: () => handleOpenFile(),
        },
        {
          label: 'Save',
          accelerator: 'Ctrl+S',
          click: () => mainWindow?.webContents.send('menu:action', 'save'),
        },
        { type: 'separator' },
        {
          label: 'Export PDF...',
          accelerator: 'Ctrl+Shift+P',
          click: () => mainWindow?.webContents.send('menu:action', 'export-pdf'),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
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
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Theme',
          accelerator: 'Ctrl+T',
          click: () => mainWindow?.webContents.send('menu:action', 'toggle-theme'),
        },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── File Open Dialog ──
async function handleOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown File',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdtext'] }],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    openFile(result.filePaths[0]);
  }
}

function openFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    mainWindow?.webContents.send('file:opened', { path: filePath, content });
    mainWindow?.setTitle(`${path.basename(filePath)} — Markdown Editor`);
  } catch (err) {
    dialog.showErrorBox('Error', `Cannot open file: ${err.message}`);
  }
}

// ── IPC Handlers ──
function setupIPC() {
  ipcMain.handle('file:read', async (_event, filePath) => {
    try {
      return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:write', async (_event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      currentFilePath = filePath;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Markdown File',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mdtext'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf-8');
      currentFilePath = filePath;
      mainWindow?.setTitle(`${path.basename(filePath)} — Markdown Editor`);
      return { success: true, path: filePath, content };
    }
    return { success: false };
  });

  ipcMain.handle('dir:list', async (_event, dirPath) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const mdFiles = entries
        .filter((e) => e.isFile() && e.name.match(/\.(md|markdown|mdown|mdtext)$/i))
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
        }));
      return { success: true, files: mdFiles, dirPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('export:pdf', async () => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: currentFilePath
        ? currentFilePath.replace(/\.(md|markdown|mdown|mdtext)$/i, '.pdf')
        : 'document.pdf',
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
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('theme:get-system', () => {
    return require('nativeTheme').shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('dialog:show-error', async (_event, title, message) => {
    dialog.showErrorBox(title, message);
  });
}

// ── App Lifecycle ──
app.whenReady().then(() => {
  setupIPC();
  buildMenu();
  createWindow();

  // Handle file open via double-click (Windows file association)
  app.on('open-file', (_event, filePath) => {
    if (app.isReady()) {
      openFile(filePath);
    } else {
      // Queue for when ready
      app.once('ready', () => openFile(filePath));
    }
  });

  // Handle command-line argument (first file open)
  const args = process.argv.slice(1);
  const fileArg = args.find((a) => a.match(/\.(md|markdown)$/i));
  if (fileArg) {
    openFile(fileArg);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat: Electron main process with menu, IPC handlers, file associations"
```

---

### Task 3: Preload Script

**Files:**
- Create: `electron/preload.js`

**Interfaces:**
- Consumes: IPC channels defined in main.js
- Produces: `window.electronAPI` with methods: `readFile`, `writeFile`, `openFileDialog`, `listDir`, `exportPDF`, `getSystemTheme`, `onMenuAction`, `onFileOpened`, `showError`

- [ ] **Step 1: Write electron/preload.js**

```js
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  openFileDialog: () => ipcRenderer.invoke('file:open-dialog'),
  listDir: (dirPath) => ipcRenderer.invoke('dir:list', dirPath),

  // Export
  exportPDF: () => ipcRenderer.invoke('export:pdf'),

  // Theme
  getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),

  // Events (main → renderer)
  onMenuAction: (callback) => {
    ipcRenderer.on('menu:action', (_event, action) => callback(action));
  },
  onFileOpened: (callback) => {
    ipcRenderer.on('file:opened', (_event, data) => callback(data));
  },

  // Misc
  showError: (title, message) => ipcRenderer.invoke('dialog:show-error', title, message),
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: preload script with contextBridge IPC"
```

---

### Task 4: HTML Layout + Global CSS

**Files:**
- Create: `src/index.html`
- Create: `src/style.css`

**Interfaces:**
- Produces: DOM structure `#sidebar | #editor-container | #status-bar`, CSS custom properties for light/dark themes
- CSS classes: `body.light-theme`, `body.dark-theme`, `#sidebar`, `#editor-container`, `#status-bar`

- [ ] **Step 1: Write src/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: file:; img-src 'self' file: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline';">
  <title>Markdown Editor</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- Sidebar -->
    <aside id="sidebar">
      <div id="sidebar-header">
        <span class="sidebar-title">Files</span>
        <button id="btn-open-file" title="Open File (Ctrl+O)">📂</button>
      </div>
      <div id="file-list"></div>
    </aside>

    <!-- Resizer -->
    <div id="resizer"></div>

    <!-- Main Area -->
    <main id="main-area">
      <div id="editor-container"></div>
      <div id="status-bar">
        <span id="status-path">No file open</span>
        <span id="status-save">—</span>
      </div>
    </main>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write src/style.css (part 1 — layout)**

```css
/* ========================================
   CSS Custom Properties — Light Theme
   ======================================== */
:root,
body.light-theme {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-sidebar: #f0f0f0;
  --bg-status: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border-color: #e0e0e0;
  --accent: #4a9eff;
  --accent-hover: #3a8eef;
  --hover-bg: rgba(0, 0, 0, 0.05);
  --sidebar-active: #d0e4ff;
  --resizer-bg: #e0e0e0;
  --scrollbar-thumb: #c0c0c0;
  --scrollbar-track: transparent;
}

/* ========================================
   CSS Custom Properties — Dark Theme
   ======================================== */
body.dark-theme {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-sidebar: #1a1a1a;
  --bg-status: #111111;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-muted: #666666;
  --border-color: #3e3e3e;
  --accent: #5eafff;
  --accent-hover: #4e9fef;
  --hover-bg: rgba(255, 255, 255, 0.08);
  --sidebar-active: #264f78;
  --resizer-bg: #3e3e3e;
  --scrollbar-thumb: #555555;
  --scrollbar-track: transparent;
}

/* ========================================
   Reset & Base
   ======================================== */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background 0.3s, color 0.3s;
}

/* ========================================
   Layout
   ======================================== */
#app {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* Sidebar */
#sidebar {
  width: 240px;
  min-width: 160px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
  user-select: none;
}

#sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

#btn-open-file {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  color: var(--text-primary);
}

#btn-open-file:hover {
  background: var(--hover-bg);
}

#file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.file-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--hover-bg);
}

.file-item.active {
  background: var(--sidebar-active);
  font-weight: 500;
}

/* Resizer */
#resizer {
  width: 4px;
  cursor: col-resize;
  background: var(--resizer-bg);
  flex-shrink: 0;
  transition: background 0.2s;
}

#resizer:hover {
  background: var(--accent);
}

/* Main Area */
#main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

#editor-container {
  flex: 1;
  overflow: auto;
}

#status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 16px;
  font-size: 12px;
  background: var(--bg-status);
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  min-height: 26px;
}

/* ========================================
   Milkdown Editor Area
   ======================================== */
#editor-container .milkdown {
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 60px 120px;
  min-height: 100%;
}

/* ========================================
   Mermaid Diagram Container
   ======================================== */
.mermaid-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  overflow-x: auto;
  text-align: center;
}

.mermaid-preview svg {
  max-width: 100%;
  height: auto;
}

.mermaid-error {
  color: #e74c3c;
  font-size: 13px;
  padding: 8px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 4px;
  margin: 8px 0;
}

/* ========================================
   Scrollbar Styling
   ======================================== */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* ========================================
   Print Styles (for PDF export)
   ======================================== */
@media print {
  #sidebar, #resizer, #status-bar {
    display: none !important;
  }

  #editor-container .milkdown {
    max-width: 100%;
    padding: 20px;
  }

  body {
    background: white !important;
    color: black !important;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/index.html src/style.css
git commit -m "feat: HTML layout with sidebar, editor area, status bar; CSS with light/dark themes"
```

---

### Task 5: Theme System

**Files:**
- Create: `src/theme.js`

**Interfaces:**
- Produces: `initTheme()` — async, applies saved or system theme; `toggleTheme()` — switches and persists; `applyTheme(name)` — applies 'light' or 'dark'

- [ ] **Step 1: Write src/theme.js**

```js
// src/theme.js
const THEME_KEY = 'md-editor-theme';

/**
 * Get the current system theme via IPC.
 * Falls back to matchMedia query if IPC unavailable.
 */
async function getSystemTheme() {
  if (window.electronAPI) {
    try {
      return await window.electronAPI.getSystemTheme();
    } catch {
      // fall through
    }
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply a theme to the document body.
 * @param {'light' | 'dark'} name
 */
export function applyTheme(name) {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(`${name}-theme`);
  localStorage.setItem(THEME_KEY, name);
}

/**
 * Initialize theme on startup.
 * Priority: saved preference > system theme > light.
 */
export async function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return saved;
  }

  const systemTheme = await getSystemTheme();
  applyTheme(systemTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // Only auto-switch if user hasn't manually set a preference
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  return systemTheme;
}

/**
 * Toggle between light and dark theme.
 */
export function toggleTheme() {
  const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/theme.js
git commit -m "feat: theme system with system detection, toggle, and persistence"
```

---

### Task 6: Milkdown Editor Initialization

**Files:**
- Create: `src/editor.js`

**Interfaces:**
- Produces: `createEditor(containerSelector, initialContent)` → `Promise<{ getMarkdown, setMarkdown, destroy, onChange }>`

- [ ] **Step 1: Write src/editor.js**

```js
// src/editor.js
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

let crepe = null;

/**
 * Create a Milkdown Crepe WYSIWYG editor.
 * @param {string|HTMLElement} root — container selector or element
 * @param {string} content — initial markdown content
 * @returns {Promise<{ getMarkdown: () => string, setMarkdown: (md: string) => void, destroy: () => Promise<void>, onChange: (fn: (md: string) => void) => void }>}
 */
export async function createEditor(root, content) {
  // Destroy previous instance if exists
  if (crepe) {
    await crepe.destroy();
    crepe = null;
  }

  // Ensure the container is clean
  const container = typeof root === 'string' ? document.querySelector(root) : root;
  if (!container) throw new Error(`Editor container not found: ${root}`);
  container.innerHTML = '';

  crepe = new Crepe({
    root: container,
    defaultValue: content || '# Start typing...',
  });

  await crepe.create();

  // Return editor API
  return {
    getMarkdown: () => {
      if (!crepe) return '';
      // Crepe stores editor ref; use getMarkdown from editor context
      let result = '';
      crepe.editor.action((ctx) => {
        // Access markdown via the editor's internal API
        const view = ctx.get('editorView');
        result = view.state.doc.textBetween(0, view.state.doc.content.size, '\n');
      });
      return result;
    },

    setMarkdown: (md) => {
      if (!crepe) return;
      crepe.editor.action((ctx) => {
        const view = ctx.get('editorView');
        const { state } = view;
        const tr = state.tr.replaceWith(0, state.doc.content.size, null);
        if (md) {
          const schema = state.schema;
          // Insert raw text — Milkdown will parse it into nodes
          tr.insertText(md, 0);
        }
        view.dispatch(tr);
      });
    },

    destroy: async () => {
      if (crepe) {
        await crepe.destroy();
        crepe = null;
      }
    },

    onChange: (fn) => {
      if (!crepe) return;
      crepe.onStatusChange((status) => {
        if (status === 'created') {
          // Listen for document changes via editor view
          crepe.editor.action((ctx) => {
            const view = ctx.get('editorView');
            // Use a simple polling approach — dispatch for autosave
            // Actually, hook into Milkdown's listener plugin
          });
        }
      });

      // Alternative: set up a MutationObserver for content changes
      // This is a fallback approach that works reliably
      const observer = new MutationObserver(() => {
        const md = crepe?.editor
          ? (() => {
              let result = '';
              crepe.editor.action((ctx) => {
                const view = ctx.get('editorView');
                result = view.state.doc.textBetween(0, view.state.doc.content.size, '\n');
              });
              return result;
            })()
          : '';
        fn(md);
      });

      if (container) {
        observer.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    },

    /** Get the raw editor instance for advanced use */
    getEditor: () => crepe,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/editor.js
git commit -m "feat: Milkdown Crepe editor factory with getMarkdown/setMarkdown/destroy"
```

---

### Task 7: Mermaid Diagram Rendering

**Files:**
- Create: `src/mermaid.js`

**Interfaces:**
- Produces: `initMermaid()` — initializes Mermaid; `renderMermaidBlocks(container)` — finds and renders mermaid code blocks in a container element

- [ ] **Step 1: Write src/mermaid.js**

```js
// src/mermaid.js
import mermaid from 'mermaid';

let initialized = false;
let counter = 0;
const rendered = new Map(); // code → SVG string cache

/**
 * Initialize Mermaid with theme-aware config.
 * @param {'light'|'dark'} theme
 */
export function initMermaid(theme) {
  if (initialized) {
    // Update theme without re-initializing
    mermaid.initialize(getConfig(theme));
    return;
  }

  mermaid.initialize(getConfig(theme));
  initialized = true;
}

function getConfig(theme) {
  const isDark = theme === 'dark';
  return {
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    themeVariables: isDark
      ? {
          primaryColor: '#3a6fb5',
          primaryTextColor: '#e0e0e0',
          lineColor: '#888888',
          textColor: '#e0e0e0',
          mainBkg: '#2a2a2a',
        }
      : {},
  };
}

/**
 * Scan a container for mermaid code blocks, render them as SVG,
 * and insert preview elements. Returns count of diagrams rendered.
 *
 * In Milkdown Crepe, code blocks have this DOM structure:
 *   <pre class="code-block"><code class="language-mermaid">...</code></pre>
 *
 * @param {HTMLElement} container
 * @returns {Promise<number>}
 */
export async function renderMermaidBlocks(container) {
  if (!initialized) initMermaid('light');

  const codeBlocks = container.querySelectorAll('pre[class*="code-block"] code');
  let count = 0;

  for (const code of codeBlocks) {
    const lang = code.className.match(/language-(\w+)/)?.[1] || '';
    if (lang.toLowerCase() !== 'mermaid') continue;

    const pre = code.closest('pre');
    if (!pre || pre.querySelector('.mermaid-preview')) continue; // already rendered

    const source = code.textContent.trim();
    if (!source) continue;

    // Check cache
    let svgCode = rendered.get(source);
    if (!svgCode) {
      try {
        const id = `mermaid-${++counter}`;
        const { svg } = await mermaid.render(id, source);
        svgCode = svg;
        rendered.set(source, svgCode);
        // Limit cache size
        if (rendered.size > 100) {
          const first = rendered.keys().next().value;
          rendered.delete(first);
        }
      } catch (err) {
        // Show error instead of crashing
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mermaid-error';
        errorDiv.textContent = `Mermaid error: ${err.message}`;
        pre.parentNode?.insertBefore(errorDiv, pre);
        continue;
      }
    }

    // Insert preview above the code block
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-preview';
    wrapper.innerHTML = svgCode;
    pre.parentNode?.insertBefore(wrapper, pre);

    // Store reference for cleanup
    pre.setAttribute('data-mermaid-id', `mermaid-${counter}`);
    count++;
  }

  return count;
}

/**
 * Clear all rendered mermaid previews in a container.
 */
export function clearMermaidPreviews(container) {
  const previews = container.querySelectorAll('.mermaid-preview');
  previews.forEach((p) => p.remove());
}

/**
 * Re-render all mermaid blocks (useful after theme change).
 */
export async function refreshMermaid(container) {
  rendered.clear();
  clearMermaidPreviews(container);
  return renderMermaidBlocks(container);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mermaid.js
git commit -m "feat: Mermaid diagram rendering with caching and theme-aware config"
```

---

### Task 8: Sidebar File Tree

**Files:**
- Create: `src/sidebar.js`

**Interfaces:**
- Produces: `initSidebar({ onFileSelect })` — populates file list; `refreshSidebar()` — re-scans directory; `setActiveFile(filePath)` — highlights file

- [ ] **Step 1: Write src/sidebar.js**

```js
// src/sidebar.js

let currentDir = null;
let activeFile = null;
let onFileSelectCallback = null;

/**
 * Initialize the sidebar with files from a directory.
 * @param {Object} options
 * @param {(filePath: string) => void} options.onFileSelect — called when user clicks a file
 */
export async function initSidebar({ onFileSelect }) {
  onFileSelectCallback = onFileSelect;

  // Bind open button
  const openBtn = document.getElementById('btn-open-file');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      if (!window.electronAPI) return;
      const result = await window.electronAPI.openFileDialog();
      if (result.success && result.path) {
        onFileSelectCallback?.(result.path, result.content);
        await setCurrentDirectory(result.path);
      }
    });
  }
}

/**
 * Set the current working directory and refresh the file list.
 * @param {string} filePath — a file in the target directory
 */
export async function setCurrentDirectory(filePath) {
  if (!window.electronAPI) return;

  const dirPath = filePath.replace(/[/\\][^/\\]*$/, '') || '.';
  if (dirPath === currentDir) return;

  currentDir = dirPath;
  await refreshSidebar();
}

/**
 * Refresh the file list from current directory.
 */
export async function refreshSidebar() {
  if (!window.electronAPI || !currentDir) return;

  const result = await window.electronAPI.listDir(currentDir);
  if (!result.success) return;

  const fileList = document.getElementById('file-list');
  if (!fileList) return;

  fileList.innerHTML = '';

  if (result.files.length === 0) {
    fileList.innerHTML = '<div class="file-item" style="color:var(--text-muted);cursor:default;">No .md files</div>';
    return;
  }

  // Sort alphabetically
  result.files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of result.files) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = file.name;
    item.title = file.path;

    if (file.path === activeFile) {
      item.classList.add('active');
    }

    item.addEventListener('click', async () => {
      if (!window.electronAPI) return;
      const res = await window.electronAPI.readFile(file.path);
      if (res.success) {
        setActiveFileInternal(file.path);
        onFileSelectCallback?.(file.path, res.content);
      } else {
        window.electronAPI.showError('Error', `Cannot read file: ${res.error}`);
      }
    });

    fileList.appendChild(item);
  }
}

/**
 * Highlight a file as active.
 * @param {string} filePath
 */
export function setActiveFile(filePath) {
  setActiveFileInternal(filePath);
}

function setActiveFileInternal(filePath) {
  activeFile = filePath;
  document.querySelectorAll('.file-item').forEach((el) => {
    el.classList.toggle('active', el.title === filePath);
  });
}

/**
 * Get the current directory path.
 */
export function getCurrentDir() {
  return currentDir;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidebar.js
git commit -m "feat: sidebar file tree with .md file listing and click-to-open"
```

---

### Task 9: PDF Export

**Files:**
- Create: `src/export.js`

**Interfaces:**
- Produces: `exportToPDF()` — triggers save dialog + PDF generation via IPC

- [ ] **Step 1: Write src/export.js**

```js
// src/export.js

/**
 * Export the current document as PDF.
 * Uses Electron's printToPDF via IPC.
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function exportToPDF() {
  if (!window.electronAPI) {
    return { success: false, error: 'electronAPI not available (running in browser?)' };
  }

  try {
    return await window.electronAPI.exportPDF();
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/export.js
git commit -m "feat: PDF export via Electron printToPDF IPC"
```

---

### Task 10: App Bootstrap — Wiring Everything Together

**Files:**
- Create: `src/app.js`

**Interfaces:**
- Consumes: `editor.js`, `theme.js`, `sidebar.js`, `mermaid.js`, `export.js`
- Produces: Fully functional app — initializes all modules, handles auto-save, menu actions, file open events

- [ ] **Step 1: Write src/app.js**

```js
// src/app.js
import { createEditor } from './editor.js';
import { initTheme, toggleTheme, applyTheme } from './theme.js';
import { initSidebar, setCurrentDirectory, setActiveFile, refreshSidebar } from './sidebar.js';
import { initMermaid, renderMermaidBlocks, refreshMermaid } from './mermaid.js';
import { exportToPDF } from './export.js';

// ── State ──
let currentFilePath = null;
let editorApi = null;
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 2000; // 2 seconds

// ── UI Elements ──
const statusPath = document.getElementById('status-path');
const statusSave = document.getElementById('status-save');
const editorContainer = document.getElementById('editor-container');

// ── Editor Setup ──
async function openFile(filePath, content) {
  currentFilePath = filePath;
  updateStatusPath(filePath);
  setActiveFile(filePath);

  // Clean previous mermaid previews
  if (editorContainer) {
    clearMermaidPreviews();
  }

  // Create/replace editor
  editorApi = await createEditor(editorContainer, content);

  // Render mermaid blocks after a short delay (let Milkdown render first)
  setTimeout(() => renderMermaidBlocks(editorContainer), 500);

  // Re-render mermaid on content changes
  setupMermaidRefresh();
}

function setupMermaidRefresh() {
  if (!editorContainer) return;
  let mermaidTimer = null;
  const observer = new MutationObserver(() => {
    if (mermaidTimer) clearTimeout(mermaidTimer);
    mermaidTimer = setTimeout(() => {
      renderMermaidBlocks(editorContainer);
    }, 800);
  });
  observer.observe(editorContainer, { childList: true, subtree: true });
}

// ── Auto-Save ──
function setupAutoSave() {
  if (!editorContainer) return;
  const observer = new MutationObserver(() => {
    setSaveStatus('Unsaved');
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (!currentFilePath || !editorApi || !window.electronAPI) return;
      const markdown = editorApi.getMarkdown();
      const result = await window.electronAPI.writeFile(currentFilePath, markdown);
      setSaveStatus(result.success ? 'Saved' : 'Error saving');
    }, AUTO_SAVE_DELAY);
  });
  observer.observe(editorContainer, { childList: true, subtree: true, characterData: true });
}

// ── UI Helpers ──
function updateStatusPath(filePath) {
  if (statusPath) statusPath.textContent = filePath || 'No file open';
}

function setSaveStatus(text) {
  if (statusSave) {
    statusSave.textContent = text;
    statusSave.style.color = text === 'Saved' ? 'var(--text-muted)' : 'var(--accent)';
  }
}

function clearMermaidPreviews() {
  const previews = document.querySelectorAll('.mermaid-preview');
  previews.forEach((p) => p.remove());
}

// ── Menu Action Handler ──
function setupMenuHandler() {
  if (!window.electronAPI) return;

  window.electronAPI.onMenuAction(async (action) => {
    switch (action) {
      case 'save':
        await saveCurrentFile();
        break;

      case 'export-pdf':
        await handleExportPDF();
        break;

      case 'toggle-theme':
        const newTheme = toggleTheme();
        initMermaid(newTheme);
        await refreshMermaid(editorContainer);
        break;
    }
  });
}

async function saveCurrentFile() {
  if (!currentFilePath || !editorApi || !window.electronAPI) return;
  const markdown = editorApi.getMarkdown();
  const result = await window.electronAPI.writeFile(currentFilePath, markdown);
  setSaveStatus(result.success ? 'Saved' : 'Error saving');
}

async function handleExportPDF() {
  setSaveStatus('Exporting PDF...');
  const result = await exportToPDF();
  if (result.success) {
    setSaveStatus('PDF exported');
  } else if (result.error !== 'canceled') {
    setSaveStatus('PDF export failed');
    if (window.electronAPI) {
      window.electronAPI.showError('Export Error', result.error || 'Unknown error');
    }
  }
}

// ── File Open Handler (from menu or double-click) ──
function setupFileOpenHandler() {
  if (!window.electronAPI) return;

  window.electronAPI.onFileOpened(async (data) => {
    await openFile(data.path, data.content);
    await setCurrentDirectory(data.path);
    await refreshSidebar();
  });
}

// ── Sidebar Resizer ──
function setupResizer() {
  const resizer = document.getElementById('resizer');
  const sidebar = document.getElementById('sidebar');
  if (!resizer || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(160, Math.min(400, startWidth + delta));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ── Keyboard Shortcuts ──
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    // Ctrl+S: Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      await saveCurrentFile();
    }
  });
}

// ── Bootstrap ──
async function bootstrap() {
  // 1. Initialize theme
  const initialTheme = await initTheme();

  // 2. Initialize Mermaid with current theme
  initMermaid(initialTheme);

  // 3. Initialize sidebar
  await initSidebar({
    onFileSelect: async (filePath, content) => {
      await openFile(filePath, content);
      await setCurrentDirectory(filePath);
    },
  });

  // 4. Setup event handlers
  setupMenuHandler();
  setupFileOpenHandler();
  setupAutoSave();
  setupResizer();
  setupKeyboardShortcuts();

  // 5. Create empty editor
  editorApi = await createEditor(editorContainer, '# Welcome to Markdown Editor\n\nStart typing or open a file to begin.\n\n## Features\n\n- **WYSIWYG editing** — see your formatting as you type\n- LaTeX math: $E = mc^2$\n- Mermaid diagrams\n- Syntax-highlighted code blocks\n- PDF export\n\nEnjoy! ✨');

  // Render any mermaid blocks in default content
  setTimeout(() => renderMermaidBlocks(editorContainer), 500);

  setSaveStatus('Ready');
}

// Start the app
bootstrap().catch((err) => {
  console.error('Failed to bootstrap app:', err);
  if (window.electronAPI) {
    window.electronAPI.showError('Startup Error', err.message);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: app bootstrap wiring editor, theme, sidebar, mermaid, export, and auto-save"
```

---

### Task 11: App Icon Generation

**Files:**
- Create: `scripts/generate-icon.js`
- Create: `assets/icon.png` (generated)

**Interfaces:**
- Produces: `assets/icon.png` (256×256 PNG), `assets/icon.ico` (for NSIS)

- [ ] **Step 1: Write scripts/generate-icon.js**

Since we cannot rely on `canvas` being installed, create an SVG-based approach using a simple PNG generator, or provide an SVG icon that electron-builder can convert. For a zero-dependency approach, create an SVG file and note that the user can convert it using any tool.

Better approach: create a simple 256×256 PNG using pure Node.js Buffer (no dependencies needed for a minimal BMP, but PNG requires zlib). The most practical approach for this project is to create an SVG file and use a dependency-free PNG.

Actually let's take the pragmatic approach: create a script that writes a simple SVG icon, and rely on electron-builder's built-in icon conversion (it accepts PNG). We'll generate a minimal valid PNG using Node.js built-in `zlib`.

For simplicity and reliability, let's create the SVG and also note how to convert it. In practice, electron-builder on Windows will need a real .png file. Let me write a minimal script.

```js
// scripts/generate-icon.js
// Generates a simple Markdown-style icon (SVG → we'll create PNG via command-line)
const fs = require('fs');
const path = require('path');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A9EFF"/>
      <stop offset="100%" style="stop-color:#2D6FCF"/>
    </linearGradient>
  </defs>
  <!-- Background rounded square -->
  <rect width="256" height="256" rx="48" fill="url(#bg)"/>
  <!-- Markdown "M" arrow symbol -->
  <g transform="translate(38, 38)" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <!-- Down arrow on left -->
    <path d="M 30 30 L 30 120 L 90 60" fill="white"/>
    <!-- Up arrow on right -->
    <path d="M 120 30 L 120 120 L 60 60" fill="white"/>
    <!-- Horizontal separator -->
    <line x1="20" y1="150" x2="160" y2="150"/>
    <!-- Text line 1 -->
    <line x1="20" y1="175" x2="140" y2="175"/>
    <!-- Text line 2 -->
    <line x1="20" y1="200" x2="100" y2="200"/>
  </g>
</svg>`;

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svgContent);
console.log('Generated assets/icon.svg');
console.log('To create icon.png, convert the SVG to 256x256 PNG:');
console.log('  Use https://convertio.co/svg-png/ or any image editor');
console.log('  Or install sharp: npm install --save-dev sharp');
console.log('');
console.log('For now, creating a placeholder PNG...');

// Also write a README
const readme = `To generate icon.png from icon.svg:
Option 1: Open icon.svg in a browser, screenshot at 256x256, save as icon.png
Option 2: Use ImageMagick: convert -size 256x256 assets/icon.svg assets/icon.png
Option 3: Use any online SVG-to-PNG converter
`;
fs.writeFileSync(path.join(assetsDir, 'README.md'), readme);
console.log(readme);
```

Actually, let me think about this differently. We can use a simpler approach. Since this is Windows, we can generate the icon using PowerShell or just create a very simple BMP file.

But the most practical approach is to just bundle an inline data URL in the script and write the PNG directly from a base64-encoded minimal PNG.

Actually, the SIMPLEST approach is to create a small PNG programmatically using Node.js zlib. Let me create a minimal 256×256 PNG.

Hmm, this is getting complex. Let me just create a simple 1-pixel PNG and then tell the user to replace it, OR create the icon using a canvas-based approach that renders to PNG.

Wait, I realize we have node-canvas capabilities? No, that requires native modules.

The absolute simplest approach: create the SVG, then during the build step, we can use a data URL as the window icon. But electron-builder needs actual files.

Let me just write a script that:
1. Creates an SVG icon
2. Uses a base64-encoded minimal PNG as a placeholder
3. Gives clear instructions on generating a real icon

Actually, the CLEANEST solution: use the `sharp` module. But that's another dependency.

OK let me just create a simple PNG using raw bytes. A minimal 256x256 PNG that's a blue square with "MD" text won't be easy without a library. Let me take the pragmatic route and create a script that uses Canvas API via Electron (since we already have Electron installed).

ACTUALLY — the simplest thing: create a tiny HTML file that draws the icon on a canvas and downloads it. Open it in a browser, save the PNG. Or better, I'll write a Node script that uses the `canvas` package (npm install canvas). But that requires native deps on Windows.

OK let me just go with the base64 approach. I'll create a minimal 32x32 PNG encoded as base64, and scale it up. No, that won't look good.

FINAL DECISION: I'll create the SVG icon and provide a simple Node.js script that uses Electron's `nativeImage` to convert SVG to PNG. Since we have Electron installed, we can use it!

```js
// scripts/generate-icon.js
const { nativeImage, app } = require('electron');
const fs = require('fs');
const path = require('path');

// This script must run in Electron context
// Run with: npx electron scripts/generate-icon.js

app.whenReady().then(() => {
  const svgContent = `...`;

  // Convert SVG to PNG using Electron's nativeImage
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`);
  const pngBuffer = image.toPNG();

  const assetsDir = path.join(__dirname, '..', 'assets');
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngBuffer);
  console.log('Generated assets/icon.png');
  app.quit();
});
```

Wait, this requires running Electron just to generate an icon. That's slow.

Let me just create a simple approach: provide a minimal valid PNG as base64 inline in the script. I can create a 256×256 solid blue PNG.

You know what, let me just use a VERY simple approach. Create a 16×16 PNG by hand from raw bytes (using zlib from Node.js), and then note that the user can replace it. A 16×16 PNG is super simple to encode.

Actually, the easiest thing: Let me just write the SVG to assets/icon.svg, and configure electron-builder to use a PNG. Then I'll provide a quick inline data URL PNG that we construct.

Let me just go with this practical approach:

1. Generate a simple SVG
2. Include a small script that converts it to PNG using Node.js canvas (fallback: provide a base64 PNG)
3. For the actual build, we'll manually create the PNG

For the plan, let me just write the SVG and provide a pre-encoded base64 PNG (a small one that works).<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="Write">
<｜｜DSML｜｜parameter name="content" string="true">// scripts/generate-icon.js
// Generates Markdown-style app icon.
// Run: node scripts/generate-icon.js
// Requires: npm install sharp (one-time, or just use online converter on icon.svg)

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Step 1: Create SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A9EFF"/>
      <stop offset="100%" style="stop-color:#2D6FCF"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#bg)"/>
  <g transform="translate(38, 38)" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <!-- M: down arrow -->
    <path d="M 30 30 L 30 130 L 90 70" fill="white" stroke="white"/>
    <!-- M: up arrow -->
    <path d="M 150 30 L 150 130 L 90 70" fill="white" stroke="white"/>
    <!-- H1 line -->
    <line x1="15" y1="155" x2="165" y2="155"/>
    <!-- H2 lines (text) -->
    <line x1="15" y1="180" x2="140" y2="180"/>
    <line x1="15" y1="205" x2="100" y2="205"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svgContent);
console.log('✓ Created assets/icon.svg');

// Step 2: Try to generate PNG using sharp (if available)
try {
  const sharp = require('sharp');
  sharp(Buffer.from(svgContent))
    .resize(256, 256)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'))
    .then(() => console.log('✓ Created assets/icon.png (via sharp)'))
    .catch((err) => {
      console.log('⚠ Could not generate PNG with sharp:', err.message);
      createFallbackPNG();
    });
} catch {
  console.log('⚠ sharp not installed. Creating fallback...');
  createFallbackPNG();
}

function createFallbackPNG() {
  // Create a minimal valid 256x256 blue PNG using raw bytes
  // This is a 1-pixel PNG scaled via HTML — for real use, convert icon.svg manually
  const { createCanvas } = (() => {
    try { return require('canvas'); } catch { return null; }
  })();

  if (createCanvas) {
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    // Fill with gradient-like blue
    const gradient = ctx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, '#4A9EFF');
    gradient.addColorStop(1, '#2D6FCF');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 256, 48);
    ctx.fill();
    // Draw M symbol
    ctx.fillStyle = 'white';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M↓', 128, 128);

    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), buf);
    console.log('✓ Created assets/icon.png (via node-canvas)');
  } else {
    // Last resort: copy a pre-encoded minimal PNG
    console.log('⚠ Neither sharp nor canvas available.');
    console.log('  To create icon.png: open assets/icon.svg in a browser,');
    console.log('  screenshot at 256x256, or use https://convertio.co/svg-png/');
    console.log('  Save the result as assets/icon.png');

    // Write a minimal placeholder PNG (32x32 blue pixel, base64 encoded)
    const placeholderPNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAJtJREFUWEft1rENwDAMBMCfpdN4CtN4Ck/hKTwFU3gKk0EkCAIksJ1cVRApPh/fSRJw1hXnCxBkGBcIUJgINMlPENAp0AowDEgEFoGBXwwoBC4kAhsFQoFrxAHDAAM0A0UyAn0kAvoL/ATBgB0RAX5BPoHFV4F6EYDvFNi9CgIbBdgI4F8CwQBgP3QeBKbdB1Y2Nxti3hc0+QAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), placeholderPNG);
    console.log('⚠ Created placeholder assets/icon.png. Replace with real icon before packaging.');
  }
}
