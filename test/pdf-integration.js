const { app, BrowserWindow } = require('electron');
const { createPdfOptions } = require('../electron/pdf-options');

async function run() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false });
  const paragraphs = Array.from({ length: 180 }, (_, index) => `<p>第 ${index + 1} 段：中文 PDF 分页与字体测试。</p>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>@page{size:A4}body{font-family:"Microsoft YaHei",sans-serif}</style><h1>PDF 集成测试</h1>${paragraphs}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdf = await window.webContents.printToPDF(createPdfOptions());
  if (pdf.length < 1000 || pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('Invalid PDF output');
  console.log(`PDF integration passed (${pdf.length} bytes)`);
  window.destroy();
  app.quit();
}

run().catch(error => {
  console.error(error);
  app.exit(1);
});
