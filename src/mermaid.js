// src/mermaid.js
// Mermaid diagram DOM post-processing for Milkdown editor.
// Scans the editor container for <pre><code class="language-mermaid"> blocks,
// renders them to SVG via mermaid.render(), and inserts preview divs.
import mermaid from 'mermaid';

let initialized = false;
let counter = 0;
const rendered = new Map();

function getConfig(theme) {
  const isDark = theme === 'dark';
  return {
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };
}

export function initMermaid(theme) {
  mermaid.initialize(getConfig(theme || 'light'));
  initialized = true;
}

export async function renderMermaidBlocks(container) {
  if (!initialized) initMermaid('light');

  const codeBlocks = container.querySelectorAll('pre[class*="code-block"] code, pre code');
  let count = 0;

  for (const code of codeBlocks) {
    const lang = code.className.match(/language-(\w+)/)?.[1] || '';
    if (lang.toLowerCase() !== 'mermaid') continue;

    const pre = code.closest('pre');
    if (!pre || pre.dataset.mermaidRendered) continue;

    const source = code.textContent.trim();
    if (!source) continue;

    let svgCode = rendered.get(source);
    if (!svgCode) {
      try {
        const id = `mermaid-${++counter}`;
        const { svg } = await mermaid.render(id, source);
        svgCode = svg;
        rendered.set(source, svgCode);
        if (rendered.size > 100) rendered.delete(rendered.keys().next().value);
      } catch (err) {
        const errDiv = document.createElement('div');
        errDiv.className = 'mermaid-error';
        errDiv.textContent = `Mermaid: ${err.message}`;
        pre.insertAdjacentElement('beforebegin', errDiv);
        pre.dataset.mermaidRendered = 'error';
        continue;
      }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-preview';
    wrapper.innerHTML = svgCode;
    pre.insertAdjacentElement('beforebegin', wrapper);
    pre.dataset.mermaidRendered = 'true';
    count++;
  }

  return count;
}

export function clearMermaidPreviews(container) {
  container.querySelectorAll('.mermaid-preview, .mermaid-error').forEach(p => p.remove());
  container.querySelectorAll('pre[data-mermaid-rendered]').forEach(pre => {
    delete pre.dataset.mermaidRendered;
  });
}

export async function refreshMermaid(container) {
  rendered.clear();
  clearMermaidPreviews(container);
  return renderMermaidBlocks(container);
}
