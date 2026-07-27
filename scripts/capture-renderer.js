const fs = require('fs');

const port = process.argv[2] || '9223';
const outputPath = process.argv[3];
const target = process.argv[4] || 'top';

if (!outputPath) throw new Error('Usage: node capture-renderer.js <port> <output.png> [top|latex]');

async function waitForPage() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page' && !entry.url.startsWith('devtools:'));
      if (page && page.url !== 'about:blank') return page;
    } catch {
      // App is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Electron page did not become available');
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    async send(method, params = {}) {
      await ready;
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function main() {
  const page = await waitForPage();
  const client = connect(page.webSocketDebuggerUrl);
  const expression = `new Promise((resolve) => {
    const editor = document.querySelector('#editor-container .milkdown');
    const proseMirror = document.querySelector('.ProseMirror');
    if (${JSON.stringify(target)} === 'latex') {
      const latexBlock = [...document.querySelectorAll('.ProseMirror > *')]
        .find((node) => /\\\\int_|\\\\begin\{|\\\\frac/.test(node.textContent));
      const heading = [...document.querySelectorAll('h1,h2,h3,h4')]
        .find((node) => /latex|mathematical|公式/i.test(node.textContent));
      (latexBlock || heading)?.scrollIntoView({ block: 'start' });
    } else {
      document.getElementById('editor-container')?.scrollTo(0, 0);
    }
    setTimeout(() => {
      const editorStyle = editor ? getComputedStyle(editor) : null;
      const proseStyle = proseMirror ? getComputedStyle(proseMirror) : null;
      resolve({
        path: document.getElementById('status-path')?.textContent || '',
        fontSize: proseStyle?.fontSize || null,
        fontFamily: proseStyle?.fontFamily || null,
        lineHeight: proseStyle?.lineHeight || null,
        contentWidth: editorStyle?.maxWidth || null,
        katexCount: document.querySelectorAll('.katex').length,
        katexErrors: [...document.querySelectorAll('.katex-error')].slice(0, 10).map((node) => node.textContent),
        inlineMathNodes: document.querySelectorAll('[data-type="math_inline"]').length,
        blockMathNodes: document.querySelectorAll('[data-type="math_block"], .milkdown-latex-block').length,
        latexElements: [...document.querySelectorAll('[class*="latex"], [data-language="LaTeX"], [data-language="latex"]')]
          .slice(0, 12)
          .map((node) => ({ tag: node.tagName, className: node.className, text: node.textContent.slice(0, 160) })),
        codeBlocks: [...document.querySelectorAll('.ProseMirror > div, .ProseMirror > pre')]
          .filter((node) => /\\\\int_|\\\\begin\{|\\\\frac/.test(node.textContent))
          .slice(0, 5)
          .map((node) => ({ tag: node.tagName, className: node.className, html: node.outerHTML.slice(0, 800) })),
        settings: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('md-editor-'))),
      });
    }, 1200);
  })`;
  const evaluated = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
  client.close();
  console.log(JSON.stringify(evaluated.result.value, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
