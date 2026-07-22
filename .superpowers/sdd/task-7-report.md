# Task 7 Report -- Mermaid Diagram Rendering

**Status:** Complete  
**File:** `src/mermaid.js`  
**Date:** 2026-07-23

## What was done

Created `src/mermaid.js` implementing Mermaid diagram DOM post-processing for the Milkdown Crepe editor.

### Exported functions

| Function | Signature | Description |
|---|---|---|
| `initMermaid(theme)` | `void` | Initializes mermaid with theme-aware config (`'light'` or `'dark'`). |
| `renderMermaidBlocks(container)` | `Promise<number>` | Scans container for unrendered `<pre><code class="language-mermaid">` blocks, renders to SVG via `mermaid.render()`, inserts `.mermaid-preview` divs. Returns count of newly rendered blocks. |
| `clearMermaidPreviews(container)` | `void` | Removes all `.mermaid-preview` and `.mermaid-error` divs and resets `data-mermaid-rendered` attributes. |
| `refreshMermaid(container)` | `Promise<number>` | Clears all previews (including render cache) and re-renders everything. Used after theme changes. |

### Key implementation details

- **Render cache:** A `Map<string, string>` mapping Mermaid source to SVG strings avoids redundant `mermaid.render()` calls for identical diagrams. Limited to 100 entries (FIFO eviction).
- **Error handling:** Failed renders insert a `.mermaid-error` div instead of crashing. The `data-mermaid-rendered` attribute is set to `'error'` so these blocks are not retried until an explicit refresh.
- **Tracking:** Each processed `<pre>` gets `data-mermaid-rendered="true"` (or `"error"`) to prevent double-rendering on subsequent scans.
- **Unique IDs:** Each render call uses a unique `mermaid-{counter}` ID as required by mermaid's API.
- **CSS support:** `.mermaid-preview` and `.mermaid-error` styles already exist in `src/style.css` (from Tasks 1-6).

### Deviation from task brief

- `clearMermaidPreviews` also removes `.mermaid-error` divs (not just `.mermaid-preview`), ensuring error-state blocks are cleaned up properly during `refreshMermaid`.
