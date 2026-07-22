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
const AUTO_SAVE_DELAY = 2000;

// ── DOM refs ──
const statusPath = document.getElementById('status-path');
const statusSave = document.getElementById('status-save');
const editorContainer = document.getElementById('editor-container');

// ── File Operations ──
async function openFile(filePath, content) {
  currentFilePath = filePath;
  statusPath && (statusPath.textContent = filePath);
  setActiveFile(filePath);
  clearMermaidPreviews(editorContainer);

  editorApi = await createEditor(editorContainer, content);
  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
}

async function saveCurrentFile() {
  if (!currentFilePath || !editorApi || !window.electronAPI) return;
  const md = editorApi.getMarkdown();
  const result = await window.electronAPI.writeFile(currentFilePath, md);
  updateSaveStatus(result.success ? '已保存' : '保存失败');
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
    updateSaveStatus('未保存…');
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveCurrentFile(), AUTO_SAVE_DELAY);
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
    sidebar.style.width = `${Math.max(160, Math.min(400, startWidth + e.clientX - startX))}px`;
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
    '按 **Ctrl+O** 打开文件，**Ctrl+T** 切换主题。');

  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  updateSaveStatus('就绪');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  window.electronAPI?.showError('启动失败', err.message);
});
