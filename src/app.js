// src/app.js
import { createEditor } from './editor.js';
import { initTheme, toggleTheme } from './theme.js';
import { initSidebar, setCurrentDirectory, setActiveFile, refreshSidebar } from './sidebar.js';
import { initMermaid, renderMermaidBlocks, refreshMermaid, clearMermaidPreviews } from './mermaid.js';
import { exportToPDF } from './export.js';

// ── State ──
let currentFilePath = null;
let editorApi = null;
let autoSaveTimer = null;
let isDirty = false;
let originalContent = '';   // for revert on cancel-close
const AUTO_SAVE_DELAY = 2000;

// ── Default Settings (persisted to localStorage) ──
const DEFAULTS = {
  fontFamily: "'Times New Roman', '宋体', SimSun, 'Microsoft YaHei', serif",
  fontSize: '18px',
  contentPadding: '32px 28px',
};

function loadSetting(key) {
  return localStorage.getItem('md-editor-' + key) || DEFAULTS[key];
}

function saveSetting(key, value) {
  localStorage.setItem('md-editor-' + key, value);
}

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--editor-font-family', loadSetting('fontFamily'));
  root.style.setProperty('--editor-font-size', loadSetting('fontSize'));
  root.style.setProperty('--editor-content-padding', loadSetting('contentPadding'));
}

// ── DOM refs ──
const statusPath = document.getElementById('status-path');
const statusSave = document.getElementById('status-save');
const editorContainer = document.getElementById('editor-container');

// ── File Operations ──
async function openFile(filePath, content) {
  currentFilePath = filePath;
  originalContent = content;           // snapshot for revert
  statusPath && (statusPath.textContent = filePath);
  setActiveFile(filePath);
  clearMermaidPreviews(editorContainer);

  editorApi = await createEditor(editorContainer, content);
  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  markClean();
}

function markDirty() {
  if (!isDirty) { isDirty = true; window.electronAPI?.setDirty(true); }
}

function markClean() {
  if (isDirty) { isDirty = false; window.electronAPI?.setDirty(false); }
}

async function saveCurrentFile(isAutoSave = false) {
  if (!currentFilePath || !editorApi || !window.electronAPI) return;
  const md = editorApi.getMarkdown();
  const result = await window.electronAPI.writeFile(currentFilePath, md);
  if (result.success) {
    if (!isAutoSave) {
      // Manual save: clear dirty AND update baseline so cancel-close has nothing to revert
      markClean();
      originalContent = md;
    }
    updateSaveStatus('已保存');
  } else {
    updateSaveStatus('保存失败');
  }
  return result;
}

function updateSaveStatus(text) {
  if (statusSave) {
    statusSave.textContent = text;
    statusSave.style.color = text === '已保存' ? 'var(--text-muted)' : 'var(--accent)';
  }
}

// ── Auto-Save ──
function setupAutoSave() {
  const observer = new MutationObserver(() => {
    markDirty();
    updateSaveStatus('未保存…');
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveCurrentFile(true), AUTO_SAVE_DELAY);
  });
  observer.observe(editorContainer, { childList: true, subtree: true, characterData: true });
}

// ── Mermaid Refresh Watch ──
function setupMermaidWatch() {
  let mermaidTimer = null;
  const observer = new MutationObserver(() => {
    if (mermaidTimer) clearTimeout(mermaidTimer);
    mermaidTimer = setTimeout(() => renderMermaidBlocks(editorContainer), 800);
  });
  observer.observe(editorContainer, { childList: true, subtree: true });
}

// ── Close Confirmation ──
async function handleConfirmClose() {
  if (!isDirty) { window.electronAPI?.forceClose(); return; }
  // 确定=保存并退出  取消=放弃修改并关闭
  const choice = confirm(
    '文件已被修改，是否保存？\n\n' +
    '"确定" = 保存修改并退出\n' +
    '"取消" = 放弃所有修改并退出'
  );
  if (choice) {
    // Save → update baseline → close
    await saveCurrentFile();
    window.electronAPI?.forceClose();
  } else {
    // Revert to original content (undo all edits since open/last manual save)
    if (originalContent !== undefined && currentFilePath) {
      await window.electronAPI.writeFile(currentFilePath, originalContent);
    }
    window.electronAPI?.forceClose();
  }
}

// ── Settings ──
const FONT_OPTIONS = [
  { label: '宋体 + Times New Roman', value: "'Times New Roman', '宋体', SimSun, 'Microsoft YaHei', serif" },
  { label: '微软雅黑', value: "'Microsoft YaHei', '微软雅黑', sans-serif" },
  { label: '楷体 + Georgia', value: "Georgia, '楷体', KaiTi, serif" },
  { label: 'Consolas + 宋体', value: "Consolas, '宋体', SimSun, monospace" },
];

const SIZE_OPTIONS = [
  { label: '小 (15px)', value: '15px' },
  { label: '中 (18px)', value: '18px' },
  { label: '大 (21px)', value: '21px' },
  { label: '特大 (24px)', value: '24px' },
];

const PADDING_OPTIONS = [
  { label: '紧凑', value: '32px 16px' },
  { label: '标准', value: '32px 28px' },
  { label: '宽松', value: '40px 48px' },
  { label: '极简', value: '24px 8px' },
];

function cycleSetting(type, options) {
  const current = loadSetting(type);
  const idx = options.findIndex(o => o.value === current);
  const next = options[(idx + 1) % options.length];
  saveSetting(type, next.value);
  applySettings();
  updateSaveStatus(type === 'fontFamily' ? `字体: ${next.label}` :
                    type === 'fontSize' ? `字号: ${next.label}` :
                    `边距: ${next.label}`);
  setTimeout(() => updateSaveStatus('已保存'), 2000);
}

// ── Menu Actions ──
function setupMenuHandler() {
  if (!window.electronAPI) return;
  window.electronAPI.onMenuAction(async (action) => {
    switch (action) {
      case 'save': await saveCurrentFile(); break;
      case 'export-pdf': await handleExportPDF(); break;
      case 'toggle-theme': {
        const newTheme = toggleTheme();
        initMermaid(newTheme);
        await refreshMermaid(editorContainer);
        break;
      }
      case 'confirm-close': await handleConfirmClose(); break;

      // Settings
      case 'setting-font': cycleSetting('fontFamily', FONT_OPTIONS); break;
      case 'setting-size': cycleSetting('fontSize', SIZE_OPTIONS); break;
      case 'setting-padding': cycleSetting('contentPadding', PADDING_OPTIONS); break;
    }
  });
}

async function handleExportPDF() {
  updateSaveStatus('正在导出 PDF…');
  const result = await exportToPDF();
  if (result.success) updateSaveStatus('PDF 已导出');
  else if (result.error !== 'canceled') {
    updateSaveStatus('导出失败');
    window.electronAPI?.showError('导出错误', result.error || '未知错误');
  }
}

// ── File Open from Menu/Double-click ──
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

  let isResizing = false, startX = 0, startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true; startX = e.clientX; startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    sidebar.style.width = `${Math.max(140, Math.min(350, startWidth + e.clientX - startX))}px`;
  });
  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
}

// ── Keyboard Shortcuts ──
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); await saveCurrentFile(); }
  });
}

// ── Bootstrap ──
async function bootstrap() {
  applySettings();

  const initialTheme = await initTheme();
  initMermaid(initialTheme);

  await initSidebar({
    onFileSelect: async (filePath, content) => {
      await openFile(filePath, content);
      await setCurrentDirectory(filePath);
    },
  });

  setupMenuHandler();
  setupFileOpenHandler();
  setupAutoSave();
  setupMermaidWatch();
  setupResizer();
  setupKeyboardShortcuts();

  editorApi = await createEditor(editorContainer,
    '# 欢迎使用 Markdown 编辑器\n\n' +
    '打开一个 `.md` 文件或直接开始输入。\n\n' +
    '## 功能特性\n\n' +
    '- **所见即所得编辑** — 输入时即时显示格式效果\n' +
    '- LaTeX 公式: $E = mc^2$\n' +
    '- Mermaid 图表: 使用 ````mermaid` 代码块\n' +
    '- 代码语法高亮\n' +
    '- 导出 PDF: **文件 → 导出 PDF**\n' +
    '- 自动保存: 每 2 秒自动保存\n\n' +
    '按 **Ctrl+O** 打开文件，**Ctrl+T** 切换主题。\n\n' +
    '菜单栏 **设置** 可调整字体、字号和页面宽度。');

  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  updateSaveStatus('就绪');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  window.electronAPI?.showError('启动失败', err.message);
});
