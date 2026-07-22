# Task 8 Report: Sidebar File Tree

## Status: Complete

## Files Created
- `src/sidebar.js` — Sidebar module with file tree listing, click-to-open, and directory management

## Exported Functions

| Function | Description |
|---|---|
| `initSidebar({ onFileSelect })` | Binds the open-file button and stores the callback for file selection |
| `setCurrentDirectory(filePath)` | Extracts directory from a file path, refreshes listing if directory changed |
| `setActiveFile(filePath)` | Highlights the active file in the sidebar DOM |
| `refreshSidebar()` | Re-lists `.md` files from `currentDir` via IPC, renders file items sorted alphabetically |
| `getCurrentDir()` | Returns the current directory path (or `null`) |

## Design Decisions
- The module uses module-scoped state (`currentDir`, `activeFile`, `onFileSelectCallback`) rather than a class — matching the ESM pattern used by other modules (`editor.js`, `theme.js`).
- Directory extraction uses the regex `/[/\\][^/\\]*$/` to strip the last path segment, with a fallback to `'.'` for root paths — correct for both Windows and POSIX paths.
- `setCurrentDirectory` is a no-op if the directory hasn't changed, avoiding unnecessary IPC calls.
- File items use `title` attribute to store the full path, which `setActiveFile` uses for matching — simpler than data attributes for querySelector-based toggling.
- The open-file button handler chains `onFileSelectCallback` then `setCurrentDirectory` — ensuring the editor loads content before the sidebar refreshes to show the current directory.
- All IPC calls check `window.electronAPI` availability before invoking, for robustness in non-Electron contexts.

## Verification
- Module exports match the spec (`initSidebar`, `setCurrentDirectory`, `setActiveFile`, `refreshSidebar`, `getCurrentDir`).
- HTML DOM IDs (`#btn-open-file`, `#file-list`) match the existing `src/index.html` layout.
- CSS classes (`.file-item`, `.file-item.active`, `.file-item.placeholder`) match the existing `src/style.css`.
- All IPC method names (`openFileDialog`, `listDir`, `readFile`, `showError`) match `electron/preload.js`.
- File items are sorted alphabetically by name, with a placeholder message for empty directories.
- No build errors expected — pure ESM module with no additional dependencies.
