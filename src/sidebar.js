// src/sidebar.js — Sidebar file tree for .md files

let currentDir = null;
let activeFile = null;
let onFileSelectCallback = null;

export async function initSidebar({ onFileSelect }) {
  onFileSelectCallback = onFileSelect;

  document.getElementById('btn-open-file')?.addEventListener('click', async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFileDialog();
    if (result.success && result.path) {
      onFileSelectCallback?.(result.path, result.content);
      await setCurrentDirectory(result.path);
    }
  });
}

export async function setCurrentDirectory(filePath) {
  const dirPath = filePath.replace(/[/\\][^/\\]*$/, '') || '.';
  if (dirPath === currentDir) return;
  currentDir = dirPath;
  await refreshSidebar();
}

export async function refreshSidebar() {
  if (!window.electronAPI || !currentDir) return;
  const result = await window.electronAPI.listDir(currentDir);
  if (!result.success) return;

  const fileList = document.getElementById('file-list');
  if (!fileList) return;
  fileList.innerHTML = '';

  if (result.files.length === 0) {
    fileList.innerHTML = '<div class="file-item placeholder">No .md files in directory</div>';
    return;
  }

  result.files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of result.files) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = file.name;
    item.title = file.path;
    if (file.path === activeFile) item.classList.add('active');

    item.addEventListener('click', async () => {
      if (!window.electronAPI) return;
      const res = await window.electronAPI.readFile(file.path);
      if (res.success) {
        setActiveFile(file.path);
        onFileSelectCallback?.(file.path, res.content);
      } else {
        window.electronAPI.showError('Error', `Cannot read file: ${res.error}`);
      }
    });

    fileList.appendChild(item);
  }
}

export function setActiveFile(filePath) {
  activeFile = filePath;
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('active', el.title === filePath);
  });
}

export function getCurrentDir() { return currentDir; }
