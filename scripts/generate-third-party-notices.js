const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distributedRoots = ['@milkdown/crepe', 'electron', 'electron-updater', 'mermaid'];
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const npmArguments = isWindows
  ? ['/d', '/s', '/c', 'npm ls --all --json --long']
  : ['ls', '--all', '--json', '--long'];

const tree = JSON.parse(execFileSync(npmCommand, npmArguments, {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
}));

const packages = new Map();

function visit(node, fallbackName, recursive = true) {
  if (!node || typeof node !== 'object') return;
  const name = node.name || fallbackName;
  const version = node.version || 'unknown';
  const key = `${name}@${version}`;
  if (name && node.path && !packages.has(key)) {
    packages.set(key, { name, version, license: node.license || 'UNKNOWN', packagePath: node.path });
  }
  if (recursive) {
    for (const [dependencyName, dependency] of Object.entries(node.dependencies || {})) {
      visit(dependency, dependencyName);
    }
  }
}

for (const rootName of distributedRoots) {
  // Electron's npm children download and package the framework but are not
  // included in the application. The framework's own Chromium notices ship
  // beside the executable. Other roots are bundled or packaged at runtime.
  visit(tree.dependencies?.[rootName], rootName, rootName !== 'electron');
}

function mitLicense(copyright) {
  return `The MIT License (MIT)

Copyright (c) ${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;
}

const fallbackNotices = new Map([
  ['lazy-val', mitLicense('Vladimir Krivosheev')],
  ['remark-math', mitLicense('Junyoung Choi')],
]);

function readLicense(packagePath) {
  const entries = fs.readdirSync(packagePath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\..*)?$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (!candidates.length) return null;
  return fs.readFileSync(path.join(packagePath, candidates[0]), 'utf8').trim();
}

const licenseGroups = new Map();
const missing = [];
for (const pkg of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const text = readLicense(pkg.packagePath) || fallbackNotices.get(pkg.name);
  if (!text) {
    missing.push(pkg);
    continue;
  }
  if (pkg.license === 'UNKNOWN' && /The MIT License/i.test(text)) pkg.license = 'MIT';
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const group = licenseGroups.get(hash) || { text, packages: [] };
  group.packages.push(pkg);
  licenseGroups.set(hash, group);
}

const lines = [
  '# Third-Party Notices',
  '',
  'This product includes the following third-party software. The notices below',
  'are generated from the installed dependency tree used to build the product.',
  '',
];

for (const group of licenseGroups.values()) {
  lines.push('## ' + group.packages.map((pkg) => `${pkg.name} ${pkg.version} (${pkg.license})`).join(', '));
  lines.push('', '```text', group.text, '```', '');
}

if (missing.length) {
  lines.push('## Packages without a discovered top-level license file', '');
  for (const pkg of missing) lines.push(`- ${pkg.name} ${pkg.version} — declared license: ${pkg.license}`);
  lines.push('');
}

lines.push(
  'Electron distributions also contain `LICENSE` and `LICENSES.chromium.html`',
  'beside the executable. Those files contain the complete Electron and Chromium',
  'notices shipped with the application.',
  ''
);

fs.writeFileSync(path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'), lines.join('\n'), 'utf8');
console.log(`Wrote notices for ${packages.size} packages; ${missing.length} missing license files.`);
