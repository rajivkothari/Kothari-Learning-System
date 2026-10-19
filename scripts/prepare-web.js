#!/usr/bin/env node
// Copies the two WebAssembly files the browser build loads at runtime into public/, which Expo
// serves from the site root in development and copies into the export. public/ is gitignored:
// the files come from installed packages, never from the repo.
//   canvaskit.wasm         Skia on the web (@shopify/react-native-skia -> canvaskit-wasm)
//   sql-wasm-browser.wasm  SQLite for the browser save (sql.js)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
fs.mkdirSync(pub, { recursive: true });
const files = [
  require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm', { paths: [require.resolve('@shopify/react-native-skia', { paths: [root] })] }),
  path.join(path.dirname(require.resolve('sql.js', { paths: [root] })), 'sql-wasm-browser.wasm'),
];
for (const f of files) {
  fs.copyFileSync(f, path.join(pub, path.basename(f)));
  console.log(`public/${path.basename(f)}  (${Math.round(fs.statSync(f).size / 1024)} KB)`);
}
// The page template (Expo uses public/index.html when it exists), the home-screen manifest and its
// icon. Tracked in web/ because public/ is generated.
const site = [
  [path.join(root, 'web', 'index.html'), 'index.html'],
  [path.join(root, 'web', 'manifest.json'), 'manifest.json'],
  [path.join(root, 'assets', 'icon.png'), 'apple-touch-icon.png'],
];
for (const [from, to] of site) fs.copyFileSync(from, path.join(pub, to));
console.log(`public/${site.map(([, to]) => to).join(', public/')}`);
