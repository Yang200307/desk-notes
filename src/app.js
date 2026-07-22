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
  updateSaveStatus(result.success ? 'Saved' : 'Save error');
  return result;
}

function updateSaveStatus(text) {
  if (statusSave) {
    statusSave.textContent = text;
    statusSave.style.color = text === 'Saved' ? 'var(--text-muted)' : 'var(--accent)';
  }
}

// ── Auto-Save ──
function setupAutoSave() {
  const observer = new MutationObserver(() => {
    updateSaveStatus('Unsaved…');
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
  updateSaveStatus('Exporting PDF…');
  const result = await exportToPDF();
  if (result.success) updateSaveStatus('PDF exported');
  else if (result.error !== 'canceled') {
    updateSaveStatus('Export failed');
    window.electronAPI?.showError('Export Error', result.error || 'Unknown error');
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
    '# Welcome to Markdown Editor\n\n' +
    'Start typing or open a `.md` file to begin.\n\n' +
    '## Features\n\n' +
    '- **WYSIWYG editing** — formatting visible as you type\n' +
    '- LaTeX math: $E = mc^2$\n' +
    '- Mermaid diagrams: use ````mermaid` code blocks\n' +
    '- Syntax-highlighted code blocks\n' +
    '- PDF export via **File → Export PDF**\n' +
    '- Auto-save every 2 seconds\n\n' +
    'Press **Ctrl+O** to open a file, **Ctrl+T** to toggle theme.');

  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  updateSaveStatus('Ready');
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  window.electronAPI?.showError('Startup Error', err.message);
});
