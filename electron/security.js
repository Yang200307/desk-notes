const path = require('path');

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mdtext']);

function normalizeAbsolutePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32767) return null;
  if (!path.isAbsolute(value)) return null;
  return path.resolve(value);
}

function isMarkdownPath(value) {
  const normalized = normalizeAbsolutePath(value);
  return normalized !== null && MARKDOWN_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function isPathInside(parent, child) {
  const normalizedParent = normalizeAbsolutePath(parent);
  const normalizedChild = normalizeAbsolutePath(child);
  if (!normalizedParent || !normalizedChild) return false;
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function boundedText(value, maxLength = 2000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

module.exports = {
  MARKDOWN_EXTENSIONS,
  boundedText,
  isMarkdownPath,
  isPathInside,
  isSafeExternalUrl,
  normalizeAbsolutePath,
};
