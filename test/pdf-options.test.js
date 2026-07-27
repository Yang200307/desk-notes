const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfOptions } = require('../electron/pdf-options');

test('PDF export uses A4 and converts 20pt margins to inches', () => {
  const options = createPdfOptions();
  assert.equal(options.pageSize, 'A4');
  assert.equal(options.margins.top, 20 / 72);
  assert.ok(options.margins.left < 1);
  assert.equal(options.printBackground, true);
});
