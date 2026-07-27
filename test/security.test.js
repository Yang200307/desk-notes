const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  boundedText,
  isMarkdownPath,
  isPathInside,
  isSafeExternalUrl,
  normalizeAbsolutePath,
} = require('../electron/security');

test('only absolute Markdown paths are accepted', () => {
  const markdown = path.resolve('test', 'sample.md');
  assert.equal(isMarkdownPath(markdown), true);
  assert.equal(isMarkdownPath(path.resolve('test', 'sample.exe')), false);
  assert.equal(normalizeAbsolutePath('..\\relative.md'), null);
});

test('directory containment rejects traversal and sibling prefixes', () => {
  const parent = path.resolve('test', 'docs');
  assert.equal(isPathInside(parent, path.join(parent, 'note.md')), true);
  assert.equal(isPathInside(parent, path.resolve('test', 'docs-other', 'note.md')), false);
  assert.equal(isPathInside(parent, path.resolve('test', 'outside.md')), false);
});

test('only http(s) external links are accepted', () => {
  assert.equal(isSafeExternalUrl('https://example.com'), true);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('file:///C:/secret.txt'), false);
});

test('dialog text is type checked and bounded', () => {
  assert.equal(boundedText(42), '');
  assert.equal(boundedText('abcdef', 3), 'abc');
});
