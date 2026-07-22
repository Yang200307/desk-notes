// src/export.js

export async function exportToPDF() {
  if (!window.electronAPI) {
    return { success: false, error: 'Not running in Electron' };
  }
  try {
    return await window.electronAPI.exportPDF();
  } catch (err) {
    return { success: false, error: err.message };
  }
}
