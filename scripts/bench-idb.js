#!/usr/bin/env node
// How long one browser save of the whole database image takes in Chromium's IndexedDB, by image
// size: the same pattern as src/persistence/web/indexedDbByteStore.ts (in one readwrite transaction,
// read the owner claim, then put the image; resolve on transaction complete).
//
//   CHROMIUM_PATH=/path/to/chrome node scripts/bench-idb.js [--sizes 1,3,5,10] [--saves 20] [--out <file.json>]
//
// Desktop Chromium on this machine only: not Safari on an iPad, not Silk on a Fire tablet.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { serve } = require('./serve-web');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const sizes = opt('sizes', '1,3,5,10').split(',').map(Number);
const saves = Number(opt('saves', '20'));

const PAGE = `<!doctype html><meta charset="utf-8"><title>idb</title><script>
async function bench(mb, n) {
  const idb = await new Promise((res, rej) => { const r = indexedDB.open('bench-' + mb, 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res) => { const tx = idb.transaction('s', 'readwrite'); tx.objectStore('s').put('me', 'db#owner'); tx.oncomplete = res; });
  const bytes = new Uint8Array(mb * 1024 * 1024);
  for (let i = 0; i < bytes.length; i += 4096) bytes[i] = (i / 4096) & 255;
  const ms = [];
  for (let k = 0; k < n; k++) {
    bytes[k] = k & 255;
    const t = performance.now();
    await new Promise((res, rej) => {
      const tx = idb.transaction('s', 'readwrite');
      const s = tx.objectStore('s');
      const claim = s.get('db#owner');
      claim.onsuccess = () => { if (claim.result === 'me') s.put(bytes, 'db'); else tx.abort(); };
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
    ms.push(performance.now() - t);
  }
  idb.close();
  return ms;
}
</script>`;

(async () => {
  const exe = process.env.CHROMIUM_PATH;
  if (!exe) throw new Error('Set CHROMIUM_PATH to a Chrome or Chromium executable');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-idb-'));
  fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
  const server = await serve(dir, 0);
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const rows = [];
  for (const mb of sizes) {
    const ms = await page.evaluate(([m, n]) => globalThis.bench(m, n), [mb, saves]);
    const s = [...ms].sort((a, b) => a - b);
    rows.push({ mb, saves: ms.length, p50: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], min: s[0], max: s.at(-1) });
  }
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  const lines = ['| image MB | saves | p50 ms | p95 ms | min–max ms |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.mb} | ${r.saves} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.min.toFixed(1)}–${r.max.toFixed(1)} |`)];
  console.log(`Chromium IndexedDB, one image save (owner check + put), ${os.cpus().length} cores, load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}`);
  console.log(lines.join('\n'));
  const out = opt('out', null);
  if (out) fs.writeFileSync(out, JSON.stringify({ rows, load: os.loadavg() }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
