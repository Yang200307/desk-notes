const port = process.argv[2] || '9223';
const endpoint = `http://127.0.0.1:${port}/json`;

async function waitForPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await fetch(endpoint).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page' && !entry.url.startsWith('devtools:') && entry.url !== 'about:blank');
      if (page) return page;
    } catch {
      // The packaged app may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Electron page found at ${endpoint}`);
}

function evaluate(webSocketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DevTools evaluation timed out'));
    }, 10000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }));
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        return;
      }
      resolve(message.result.result.value);
    });

    socket.addEventListener('error', reject);
  });
}

async function main() {
  const page = await waitForPage();
  const expression = String.raw`new Promise((resolve) => {
    const outlineTab = document.querySelector('[data-tab="outline"]');
    outlineTab?.click();
    setTimeout(async () => resolve({
      title: document.title,
      outlineLabel: outlineTab?.textContent?.trim() || null,
      outlineActive: outlineTab?.classList.contains('active') || false,
      outlineRows: document.querySelectorAll('.outline-row').length,
      statusPath: document.getElementById('status-path')?.textContent?.trim() || null,
      electronApiMethods: Object.keys(window.electronAPI || {}).sort(),
      updateBanner: Boolean(document.getElementById('update-banner')),
      prepareForPrint: typeof window.__prepareForPrint,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      unauthorizedReadBlocked: !(await window.electronAPI.readFile('C:\\\\Windows\\\\win.ini')).success,
      unauthorizedWriteBlocked: !(await window.electronAPI.writeFile('C:\\\\Windows\\\\Temp\\\\md-editor-security-test.txt', 'blocked')).success,
      unauthorizedDirectoryBlocked: !(await window.electronAPI.listDir('C:\\\\Windows')).success,
    }), 1000);
  })`;
  const result = await evaluate(page.webSocketDebuggerUrl, expression);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
