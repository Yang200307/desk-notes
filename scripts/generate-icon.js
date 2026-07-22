// scripts/generate-icon.js
// Generates Markdown-style app icon SVG and optionally converts to PNG.
// Run: node scripts/generate-icon.js
//
// Requires sharp for SVG-to-PNG conversion:
//   npm install --save-dev sharp
// Without sharp, a placeholder PNG is written instead.

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SVG_PATH = path.join(ASSETS_DIR, 'icon.svg');
const PNG_PATH = path.join(ASSETS_DIR, 'icon.png');

// ── SVG Content ──

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A9EFF"/>
      <stop offset="100%" style="stop-color:#2D6FCF"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#bg)"/>
  <g transform="translate(38, 38)" fill="white" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 30 30 L 30 130 L 90 70" fill="white"/>
    <path d="M 150 30 L 150 130 L 90 70" fill="white"/>
    <line x1="15" y1="155" x2="165" y2="155"/>
    <line x1="15" y1="180" x2="140" y2="180"/>
    <line x1="15" y1="205" x2="100" y2="205"/>
  </g>
</svg>`;

// ── Placeholder PNG (base64-encoded 32x32 blue square) ──

const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAKJJREFUWEft1rENwDAMQ9H8mY7RMR1jK2PUMRpFsSAIENgPV4IY4j0+uTnO+dc9ANIQEwJWcQScKLApkBiYEGADLgJvClgEhvGvwB3BFZEHAc8CBwFBgF2gCLQJwv/fBMyXwE6BNwJOBG4M/B8EnggkBCYC4whYfCfjQiA8BHwUKJuAO4EOSYEkYfKMB3gbNV8mhyBQAAAAAElFTkSuQmCC';

// ── Main ──

function main() {
  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    console.log('Created assets/ directory');
  }

  // Write SVG icon
  fs.writeFileSync(SVG_PATH, SVG_CONTENT, 'utf-8');
  console.log('Created assets/icon.svg');

  // Try to convert to PNG using sharp
  let sharpAvailable = false;
  try {
    require.resolve('sharp');
    sharpAvailable = true;
  } catch {
    sharpAvailable = false;
  }

  if (sharpAvailable) {
    const sharp = require('sharp');
    sharp(Buffer.from(SVG_CONTENT))
      .resize(256, 256)
      .png()
      .toFile(PNG_PATH)
      .then(() => {
        console.log('Created assets/icon.png (converted from SVG via sharp)');
      })
      .catch((err) => {
        console.error('Error converting SVG to PNG with sharp:', err.message);
        writePlaceholder();
      });
  } else {
    console.log('sharp not available. Install it with: npm install --save-dev sharp');
    console.log('Writing placeholder PNG instead.');
    writePlaceholder();
  }
}

function writePlaceholder() {
  const pngBuffer = Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64');
  fs.writeFileSync(PNG_PATH, pngBuffer);
  console.log('Created assets/icon.png (placeholder — replace with real icon before packaging)');
}

main();
