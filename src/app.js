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
let saveQueue = Promise.resolve();
let isDirty = false;
let lastSavedMarkdown = '';
const AUTO_SAVE_DELAY = 2000;

// ── HTML Cleanup ──
// MinerU-generated markdown files may contain raw HTML tags which Milkdown
// displays as literal text. Convert HTML to Markdown equivalents.

// Convert HTML <table> to Markdown table format
function decodeEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function escapeTableCell(text) {
  return text.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

function htmlTableToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('tr')].map((row) =>
    [...row.querySelectorAll(':scope > th, :scope > td')].map((cell) => escapeTableCell(cell.textContent))
  ).filter((row) => row.length);
  if (!rows.length) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(columnCount - row.length).fill('')]);
  const formatRow = (row) => `| ${row.join(' | ')} |`;
  return `\n\n${formatRow(normalized[0])}\n${formatRow(Array(columnCount).fill('---'))}\n${normalized.slice(1).map(formatRow).join('\n')}\n\n`;
}

function cleanHTMLInMarkdown(md) {
  if (!md) return md;
  // Do not rewrite examples inside fenced code blocks.
  return md.split(/(```[\s\S]*?```)/g).map((segment, index) => {
    if (index % 2 === 1) return segment;
    let cleaned = segment.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, htmlTableToMarkdown);
    cleaned = cleaned.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1^');
    cleaned = cleaned.replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '~$1~');
    cleaned = cleaned.replace(/<img\b([^>]*)\/?>/gi, (_match, attrs) => {
      const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!src) return '';
      const alt = attrs.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || 'image';
      return `![${alt}](${src})`;
    });
    cleaned = cleaned.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, label) => {
      const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      return href ? `[${label.replace(/<[^>]+>/g, '')}](${href})` : label;
    });
    // A literal newline breaks an existing Markdown table row. Keep table
    // cells on one line while still turning standalone HTML breaks into text.
    cleaned = cleaned.split('\n').map((line) => {
      if (/^\s*\|.*\|\s*$/.test(line)) return line.replace(/<br\s*\/?>/gi, ' ');
      return line;
    }).join('\n');
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '  \n');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    return decodeEntities(cleaned);
  }).join('');
}

const LATEX_COMMAND_IN_TABLE = /\\(?:frac|sqrt|sum|prod|int|oint|lim|partial|nabla|left|right|times|cdot|pm|mp|to|rightarrow|leftrightarrow|sigma|Sigma|gamma|Gamma|varphi|phi|alpha|beta|theta|lambda|mu|rho|epsilon|mathrm|mathbf|text|begin|end)\b/;

function normalizeMinerUTableLatex(md) {
  return md.split(/(```[\s\S]*?```)/g).map((segment, segmentIndex) => {
    if (segmentIndex % 2 === 1) return segment;
    return segment.split('\n').map((line) => {
      if (!/^\s*\|.*\|\s*$/.test(line) || /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) return line;

      // Split only at unescaped table delimiters. MinerU frequently emits
      // pure LaTeX table cells without the required $...$ delimiters.
      const cells = line.split(/(?<!\\)\|/);
      return cells.map((cell, index) => {
        if (index === 0 || index === cells.length - 1) return cell;
        const value = cell.trim();
        if (!value || value.includes('$') || !LATEX_COMMAND_IN_TABLE.test(value)) return cell;
        const leading = cell.match(/^\s*/)?.[0] || '';
        const trailing = cell.match(/\s*$/)?.[0] || '';
        return `${leading}$${value}$${trailing}`;
      }).join('|');
    }).join('\n');
  }).join('');
}

// ── Default Settings (persisted to localStorage) ──
const DEFAULTS = {
  fontFamily: "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
  fontSize: '17px',
  contentWidth: '1120px',
};

function loadSetting(key) {
  return localStorage.getItem('md-editor-' + key) || DEFAULTS[key];
}

function saveSetting(key, value) {
  localStorage.setItem('md-editor-' + key, value);
}

function migrateLegacySettings() {
  const font = localStorage.getItem('md-editor-fontFamily');
  const legacyFonts = [
    "'Segoe UI', 'Times New Roman', '宋体', SimSun, 'Microsoft YaHei', system-ui, serif",
    "'Times New Roman', '宋体', SimSun, 'Microsoft YaHei', serif",
    "Georgia, '楷体', KaiTi, serif",
    "Consolas, '宋体', SimSun, monospace",
  ];
  if (legacyFonts.includes(font)) {
    saveSetting('fontFamily', DEFAULTS.fontFamily);
  }
  if (!localStorage.getItem('md-editor-contentWidth')) saveSetting('contentWidth', DEFAULTS.contentWidth);

  // Earlier builds allowed an accidental Ctrl+wheel gesture to persist very
  // large reading sizes. Migrate once, while keeping later user choices.
  const layoutVersion = '2';
  if (localStorage.getItem('md-editor-layoutVersion') !== layoutVersion) {
    const storedSize = parseInt(localStorage.getItem('md-editor-fontSize') || '', 10);
    if (!Number.isFinite(storedSize) || storedSize < 14 || storedSize > 21) {
      saveSetting('fontSize', DEFAULTS.fontSize);
      localStorage.removeItem('md-editor-fontSize-idx');
    }
    localStorage.removeItem('md-editor-contentPadding');
    localStorage.removeItem('md-editor-contentPadding-idx');
    localStorage.setItem('md-editor-layoutVersion', layoutVersion);
  }
}

function setEditorCSSVariable(name, value) {
  document.documentElement.style.setProperty(name, value);
  document.body.style.setProperty(name, value);
}

function applySettings() {
  const fontFamily = loadSetting('fontFamily');
  const fontSize = loadSetting('fontSize');
  const contentWidth = loadSetting('contentWidth');

  // CSS variables (for CSS rules that reference them)
  setEditorCSSVariable('--editor-font-family', fontFamily);
  setEditorCSSVariable('--editor-font-size', fontSize);
  setEditorCSSVariable('--editor-content-width', contentWidth);
  document.getElementById('status-font-size').textContent = fontSize;
}

// ── DOM refs ──
const statusPath = document.getElementById('status-path');
const statusSave = document.getElementById('status-save');
const statusFontSize = document.getElementById('status-font-size');
const editorContainer = document.getElementById('editor-container');

// ── File Operations ──
async function openFile(filePath, content, skipDirtyCheck = false) {
  if (!skipDirtyCheck && isDirty && currentFilePath) {
    const choice = await window.electronAPI?.confirmUnsaved('switch');
    if (choice === 'cancel' || !choice) return false;
    if (choice === 'save' && !(await saveCurrentFile())?.success) return false;
  }

  clearTimeout(autoSaveTimer);
  clearTimeout(mermaidTimer);
  currentFilePath = filePath;
  const cleanedContent = normalizeMinerUTableLatex(cleanHTMLInMarkdown(content));
  statusPath && (statusPath.textContent = filePath);
  statusPath && (statusPath.title = filePath);
  setActiveFile(filePath);
  await window.electronAPI?.setCurrentFile(filePath);
  clearMermaidPreviews(editorContainer);

  editorApi = await createEditor(editorContainer, cleanedContent, { onChange: handleEditorChange });
  lastSavedMarkdown = editorApi.getMarkdown();
  applySettings();
  resetOutlineState();
  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  requestAnimationFrame(() => updateOutline());
  markClean();
  updateSaveStatus('已加载');
  return true;
}

function markDirty() {
  if (!isDirty) { isDirty = true; window.electronAPI?.setDirty(true); }
}

function markClean() {
  isDirty = false;
  window.electronAPI?.setDirty(false);
}

async function performSave(isAutoSave = false) {
  if (!editorApi || !window.electronAPI) return;

  // If no file is open yet, prompt to save as new file
  if (!currentFilePath) {
    if (isAutoSave) return; // Don't prompt during auto-save
    const result = await window.electronAPI.saveFileDialog();
    if (!result.success) return;
    currentFilePath = result.path;
    statusPath && (statusPath.textContent = currentFilePath);
    setActiveFile(result.path);
    await window.electronAPI.setCurrentFile(result.path);
    await setCurrentDirectory(result.path);
    await refreshSidebar();
  }

  const targetPath = currentFilePath;
  const md = editorApi.getMarkdown();
  const result = await window.electronAPI.writeFile(targetPath, md);
  if (result.success) {
    lastSavedMarkdown = md;
    if (currentFilePath === targetPath && editorApi.getMarkdown() === md) {
      markClean();
      updateSaveStatus('已保存');
    } else {
      markDirty();
      updateSaveStatus('未保存…');
    }
  } else {
    updateSaveStatus('保存失败', true);
  }
  return result;
}

function saveCurrentFile(isAutoSave = false) {
  const operation = () => performSave(isAutoSave);
  saveQueue = saveQueue.then(operation, operation);
  return saveQueue;
}

function updateSaveStatus(text, isError = false) {
  if (statusSave) {
    statusSave.textContent = text;
    if (isError) {
      statusSave.style.color = '#e74c3c';
    } else if (text === '已保存' || text === '已加载' || text === '就绪') {
      statusSave.style.color = 'var(--text-muted)';
    } else {
      statusSave.style.color = 'var(--accent)';
    }
  }
}

let mermaidTimer = null;

function handleEditorChange(markdown) {
  if (markdown === lastSavedMarkdown) {
    clearTimeout(autoSaveTimer);
    markClean();
    updateSaveStatus(currentFilePath ? '已加载' : '就绪');
    return;
  }
  markDirty();
  updateSaveStatus('未保存…');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveCurrentFile(true), AUTO_SAVE_DELAY);
  clearTimeout(mermaidTimer);
  mermaidTimer = setTimeout(() => renderMermaidBlocks(editorContainer), 800);
  // Keep the outline responsive while the user edits a heading.
  clearTimeout(outlineDebounceTimer);
  outlineDebounceTimer = setTimeout(() => updateOutline(), 250);
}

// ── Close Confirmation (three-way: save / discard / cancel) ──
async function handleConfirmClose() {
  if (!isDirty) { window.electronAPI?.forceClose(); return; }
  const choice = await window.electronAPI?.confirmUnsaved('close');
  if (choice === 'save') {
    if ((await saveCurrentFile())?.success) window.electronAPI?.forceClose();
    else window.electronAPI?.cancelClose();
  } else if (choice === 'discard') {
    window.electronAPI?.forceClose();
  } else {
    window.electronAPI?.cancelClose();
  }
}

// ── Settings ──
const FONT_OPTIONS = [
  { label: '现代无衬线', value: DEFAULTS.fontFamily },
  { label: '微软雅黑', value: "'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif" },
  { label: '宋体 + Georgia', value: "Georgia, 'Noto Serif CJK SC', 'Source Han Serif SC', SimSun, '宋体', serif" },
  { label: '等宽', value: "'Cascadia Code', Consolas, 'Microsoft YaHei UI', monospace" },
];

const SIZE_OPTIONS = [
  { label: '小 (15px)', value: '15px' },
  { label: '中 (18px)', value: '18px' },
  { label: '大 (21px)', value: '21px' },
  { label: '特大 (24px)', value: '24px' },
];

const WIDTH_OPTIONS = [
  { label: '舒适 (1120px)', value: '1120px' },
  { label: '宽屏 (1280px)', value: '1280px' },
  { label: '专注 (900px)', value: '900px' },
  { label: '铺满窗口', value: 'none' },
];

function cycleSetting(type, options) {
  // Use index-based cycling (robust against value mismatches)
  const idxKey = `md-editor-${type}-idx`;
  const current = loadSetting(type);
  let idx = options.findIndex(o => o.value === current);
  if (idx === -1) {
    // Current value doesn't match any option — try saved index
    idx = parseInt(localStorage.getItem(idxKey) || '0', 10);
    if (idx >= options.length) idx = 0;
  }
  const nextIdx = (idx + 1) % options.length;
  const next = options[nextIdx];

  // Persist both the value AND the index for reliable cycling
  saveSetting(type, next.value);
  localStorage.setItem(idxKey, String(nextIdx));
  applySettings();

  if (type === 'fontSize') statusFontSize.textContent = next.value;
  updateSaveStatus(type === 'fontFamily' ? `字体：${next.label}` :
                    type === 'fontSize' ? `字号：${next.label}` :
                    `宽度：${next.label}`);
  setTimeout(() => updateSaveStatus(isDirty ? '未保存…' : '已保存'), 1800);
}

// ── Menu Actions ──
function setupMenuHandler() {
  if (!window.electronAPI) return;
  window.electronAPI.onMenuAction(async (action) => {
    try {
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
        case 'setting-width': cycleSetting('contentWidth', WIDTH_OPTIONS); break;
      }
    } catch (err) {
      console.error('Menu action error:', action, err);
      window.electronAPI?.showError('错误', `操作失败: ${err.message}`);
    }
  });
}

async function handleExportPDF() {
  await saveQueue.catch(() => {});
  updateSaveStatus('正在导出 PDF…');
  const result = await exportToPDF();
  if (result.success) updateSaveStatus('PDF 已导出');
  else if (result.error !== 'canceled') {
    updateSaveStatus('导出失败', true);
    window.electronAPI?.showError('导出错误', result.error || '未知错误');
  }
}

async function prepareForPrint() {
  await renderMermaidBlocks(editorContainer);
  if (document.fonts?.ready) await document.fonts.ready;
  const images = [...document.images];
  await Promise.all(images.map(image => image.complete
    ? image.decode?.().catch(() => {})
    : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
}

function setupUpdateHandler() {
  const banner = document.getElementById('update-banner');
  const message = document.getElementById('update-message');
  const installButton = document.getElementById('update-install');
  const dismissButton = document.getElementById('update-dismiss');
  if (!banner || !message || !installButton || !dismissButton || !window.electronAPI) return;

  window.electronAPI.onUpdateStatus(status => {
    if (!status || status.state === 'idle') {
      banner.hidden = true;
      return;
    }
    message.textContent = typeof status.message === 'string' ? status.message : '';
    installButton.hidden = status.state !== 'downloaded';
    dismissButton.hidden = status.state === 'checking' || status.state === 'downloading';
    banner.hidden = false;
  });

  dismissButton.addEventListener('click', () => { banner.hidden = true; });
  installButton.addEventListener('click', async () => {
    if (isDirty) {
      const choice = await window.electronAPI.confirmUnsaved('update');
      if (choice === 'cancel' || !choice) return;
      if (choice === 'save' && !(await saveCurrentFile())?.success) return;
      if (choice === 'discard') {
        isDirty = false;
        await window.electronAPI.setDirty(false);
      }
    }
    await window.electronAPI.setDirty(false);
    const result = await window.electronAPI.installUpdate();
    if (!result?.success) {
      updateSaveStatus(result?.needsSave ? '请先保存文档' : '无法安装更新', true);
    }
  });
}

// ── File Open from Menu/Double-click ──
function setupFileOpenHandler() {
  if (!window.electronAPI) return;
  window.electronAPI.onFileOpened(async (data) => {
    const opened = await openFile(data.path, data.content);
    if (opened) {
      await setCurrentDirectory(data.path);
      await refreshSidebar();
    }
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

// ── Ctrl + Scroll Zoom ──
function setupZoomOnScroll() {
  const MIN_FONT = 10;   // px
  const MAX_FONT = 48;   // px
  const STEP = 1;        // px per scroll tick

  document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const current = parseInt(loadSetting('fontSize')) || 18;
    const delta = e.deltaY > 0 ? -STEP : STEP; // scroll down = smaller, up = larger
    let newSize = current + delta;
    newSize = Math.max(MIN_FONT, Math.min(MAX_FONT, newSize));
    const newSizeStr = newSize + 'px';

    saveSetting('fontSize', newSizeStr);
    setEditorCSSVariable('--editor-font-size', newSizeStr);
    statusFontSize.textContent = newSizeStr;
  }, { passive: false, capture: true });
}

// ── Document Outline ──
let outlineDebounceTimer = null;
let outlineEntries = [];
let outlineTree = [];
let outlineSearchQuery = '';
let activeOutlineIndex = -1;
const collapsedOutlineKeys = new Set();

function setupSidebarTabs() {
  const tabs = document.querySelectorAll('.sidebar-tab');
  const panels = {
    files: document.getElementById('file-list'),
    outline: document.getElementById('outline-panel'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p?.classList.remove('active'));
      const panel = panels[tab.dataset.tab];
      if (panel) panel.classList.add('active');
      if (tab.dataset.tab === 'outline') {
        updateOutline();
        updateActiveHeading();
      }
    });
  });

  document.getElementById('outline-search')?.addEventListener('input', (event) => {
    outlineSearchQuery = event.target.value.trim().toLocaleLowerCase();
    renderOutline();
  });

  document.getElementById('outline-collapse-all')?.addEventListener('click', () => {
    const branchKeys = collectBranchKeys(outlineTree);
    const allCollapsed = branchKeys.length > 0 && branchKeys.every(key => collapsedOutlineKeys.has(key));
    collapsedOutlineKeys.clear();
    if (!allCollapsed) branchKeys.forEach(key => collapsedOutlineKeys.add(key));
    renderOutline();
  });
}

function resetOutlineState() {
  outlineEntries = [];
  outlineTree = [];
  outlineSearchQuery = '';
  activeOutlineIndex = -1;
  collapsedOutlineKeys.clear();
  const search = document.getElementById('outline-search');
  if (search) search.value = '';
}

function stripExistingSectionNumber(text) {
  return text.replace(
    /^\s*(?:第[\d一二三四五六七八九十百千]+[章节篇]\s*[:：、.．-]?\s*|\d+(?:\.\d+)*[.)、．]?\s+)/,
    '',
  ).trim() || text;
}

function buildOutlineTree(headings) {
  const root = { level: 0, number: '', children: [] };
  const stack = [root];

  headings.forEach((heading, index) => {
    while (stack.length > 1 && stack.at(-1).level >= heading.level) stack.pop();
    const parent = stack.at(-1);
    const number = parent.number
      ? `${parent.number}.${parent.children.length + 1}`
      : String(parent.children.length + 1);
    const node = {
      ...heading,
      displayText: stripExistingSectionNumber(heading.text),
      index,
      number,
      key: number,
      depth: Math.min(stack.length, 4),
      parentKey: parent.key || null,
      children: [],
    };
    parent.children.push(node);
    stack.push(node);
  });

  return root.children;
}

function collectBranchKeys(nodes, keys = []) {
  nodes.forEach(node => {
    if (node.children.length) {
      keys.push(node.key);
      collectBranchKeys(node.children, keys);
    }
  });
  return keys;
}

function nodeMatchesSearch(node, query) {
  if (!query) return true;
  return node.text.toLocaleLowerCase().includes(query)
    || node.displayText.toLocaleLowerCase().includes(query)
    || node.number.includes(query)
    || node.children.some(child => nodeMatchesSearch(child, query));
}

function createOutlineNode(node, query) {
  if (!nodeMatchesSearch(node, query)) return null;

  const item = document.createElement('li');
  item.className = `outline-node depth-${node.depth}`;
  item.dataset.outlineIndex = String(node.index);
  item.dataset.outlineKey = node.key;

  const row = document.createElement('div');
  row.className = 'outline-row';
  row.tabIndex = 0;
  row.title = `${node.number} ${node.displayText}`;

  if (node.children.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'outline-toggle';
    const collapsed = collapsedOutlineKeys.has(node.key) && !query;
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.setAttribute('aria-label', `${collapsed ? '展开' : '折叠'} ${node.displayText}`);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (collapsedOutlineKeys.has(node.key)) collapsedOutlineKeys.delete(node.key);
      else collapsedOutlineKeys.add(node.key);
      renderOutline();
    });
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'outline-toggle-spacer';
    row.appendChild(spacer);
  }

  const number = document.createElement('span');
  number.className = 'outline-number';
  number.textContent = node.number;
  row.appendChild(number);

  const title = document.createElement('span');
  title.className = 'outline-title';
  title.textContent = node.displayText;
  row.appendChild(title);

  const navigate = () => {
    editorApi?.scrollToHeading(node.pos);
    setActiveOutline(node.index, true);
  };
  row.addEventListener('click', navigate);
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate();
    }
  });
  item.appendChild(row);

  if (node.children.length) {
    const children = document.createElement('ul');
    children.className = 'outline-children';
    if (collapsedOutlineKeys.has(node.key) && !query) children.hidden = true;
    node.children.forEach(child => {
      const childElement = createOutlineNode(child, query);
      if (childElement) children.appendChild(childElement);
    });
    item.appendChild(children);
  }

  return item;
}

function renderOutline() {
  const outlineList = document.getElementById('outline-list');
  if (!outlineList) return;
  outlineList.innerHTML = '';

  if (!outlineTree.length) {
    outlineList.innerHTML = '<div class="outline-item placeholder">当前文档没有 H1–H4 标题</div>';
    return;
  }

  const tree = document.createElement('ul');
  tree.className = 'outline-tree';
  outlineTree.forEach(node => {
    const element = createOutlineNode(node, outlineSearchQuery);
    if (element) tree.appendChild(element);
  });

  if (!tree.children.length) {
    outlineList.innerHTML = '<div class="outline-item placeholder">没有匹配的标题</div>';
    return;
  }

  outlineList.appendChild(tree);
  const branchKeys = collectBranchKeys(outlineTree);
  const collapseButton = document.getElementById('outline-collapse-all');
  if (collapseButton) {
    const allCollapsed = branchKeys.length > 0 && branchKeys.every(key => collapsedOutlineKeys.has(key));
    collapseButton.textContent = allCollapsed ? '⊞' : '⊟';
    collapseButton.title = allCollapsed ? '展开全部章节' : '折叠全部章节';
    collapseButton.disabled = branchKeys.length === 0;
  }
  setActiveOutline(activeOutlineIndex);
}

function updateOutline() {
  if (!editorApi) return;
  outlineEntries = editorApi.getHeadings().filter(heading => heading.level >= 1 && heading.level <= 4);
  outlineTree = buildOutlineTree(outlineEntries);

  renderOutline();
  updateActiveHeading();
}

function setActiveOutline(index, scrollIntoView = false) {
  activeOutlineIndex = index;
  const outlineList = document.getElementById('outline-list');
  if (!outlineList) return;
  outlineList.querySelectorAll('.outline-row').forEach(row => {
    row.classList.remove('active', 'contains-active');
  });

  const activeNode = outlineList.querySelector(`.outline-node[data-outline-index="${index}"]`);
  if (!activeNode) return;
  const activeRow = activeNode.querySelector(':scope > .outline-row');
  activeRow?.classList.add('active');

  let parent = activeNode.parentElement?.closest('.outline-node');
  while (parent) {
    parent.querySelector(':scope > .outline-row')?.classList.add('contains-active');
    parent = parent.parentElement?.closest('.outline-node');
  }

  if (scrollIntoView && activeRow && activeRow.offsetParent) {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function updateActiveHeading() {
  if (!outlineEntries.length) {
    setActiveOutline(-1);
    return;
  }

  const containerRect = editorContainer.getBoundingClientRect();
  const threshold = containerRect.top + 96;
  const headingElements = [...editorContainer.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4')];
  let activeIndex = 0;
  for (const [index, element] of headingElements.entries()) {
    if (element.getBoundingClientRect().top <= threshold) {
      activeIndex = index;
    } else {
      break;
    }
  }
  if (editorContainer.scrollHeight - editorContainer.scrollTop - editorContainer.clientHeight < 4) {
    activeIndex = outlineEntries.length - 1;
  }
  setActiveOutline(activeIndex, true);
}

function setupOutlineScrollSpy() {
  let scheduled = false;
  editorContainer.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateActiveHeading();
    });
  }, { passive: true });
}

// ── Bootstrap ──
async function bootstrap() {
  migrateLegacySettings();
  applySettings();

  const initialTheme = await initTheme();
  initMermaid(initialTheme);

  await initSidebar({
    onFileSelect: async (filePath, content) => {
      const opened = await openFile(filePath, content);
      if (opened) await setCurrentDirectory(filePath);
      return opened;
    },
  });

  setupMenuHandler();
  setupFileOpenHandler();
  setupResizer();
  setupKeyboardShortcuts();
  setupZoomOnScroll();
  setupSidebarTabs();
  setupOutlineScrollSpy();

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
    '菜单栏 **设置** 可调整字体、字号和页面宽度。',
    { onChange: handleEditorChange });
  lastSavedMarkdown = editorApi.getMarkdown();
  applySettings();

  setTimeout(() => renderMermaidBlocks(editorContainer), 600);
  requestAnimationFrame(() => updateOutline());
  updateSaveStatus('就绪');

  // Expose settings API for menu click handlers (called via executeJavaScript)
  window.__settings = {
    cycleFont: () => cycleSetting('fontFamily', FONT_OPTIONS),
    cycleSize: () => cycleSetting('fontSize', SIZE_OPTIONS),
    cycleWidth: () => cycleSetting('contentWidth', WIDTH_OPTIONS),
  };
  window.__prepareForPrint = prepareForPrint;
  setupUpdateHandler();
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  window.electronAPI?.showError('启动失败', err.message);
});
