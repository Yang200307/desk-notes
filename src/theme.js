// src/theme.js
const THEME_KEY = 'md-editor-theme';

// Store listener reference for potential cleanup
let systemThemeListener = null;
let systemThemeMediaQuery = null;

async function getSystemTheme() {
  if (window.electronAPI) {
    try { return await window.electronAPI.getSystemTheme(); } catch { /* fall through */ }
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(name) {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(`${name}-theme`);
  localStorage.setItem(THEME_KEY, name);
}

export async function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') { applyTheme(saved); return saved; }

  const systemTheme = await getSystemTheme();
  applyTheme(systemTheme);

  // Follow system theme changes only when user hasn't set manual preference
  if (systemThemeMediaQuery && systemThemeListener) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeMediaQuery = mediaQuery;
  systemThemeListener = (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  };
  mediaQuery.addEventListener('change', systemThemeListener);

  return systemTheme;
}

export function toggleTheme() {
  const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
