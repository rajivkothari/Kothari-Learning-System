#!/usr/bin/env node
// Lifty character review board: every live Lifty pose next to the approved neutral master.
//   node scripts/lifty-board.js            -> web-screenshots/lifty-character-board.png
// Rows: each pose at source size with the master's registration guides; each pose over the
// master's silhouette (drift shows as a coloured edge); and game-scale samples on the cabin's back
// wall at about 120, 105 and 90 pt of visible robot (1 px per pt, the strictest case). Each pose is
// measured in the page: screen width along the eye row, hover-jet centre and bottom.
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('./lib/browser');

const root = path.join(__dirname, '..');
const art = path.join(root, 'assets/themes/elevator-quest/art');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/manifest.json'), 'utf8'));
const rights = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/rights.json'), 'utf8'));
const ORDER = ['neutral', 'quiet', 'success', 'help', 'concerned', 'thinking'];
const dataUri = (file) => `data:image/${path.extname(file).slice(1)};base64,${fs.readFileSync(path.join(art, file)).toString('base64')}`;
const poses = manifest.assets
  .filter((a) => a.kind === 'lifty' && rights.assets.find((r) => r.asset === a.id)?.approval !== 'rejected')
  .sort((a, b) => ORDER.indexOf(a.pose) - ORDER.indexOf(b.pose))
  .map((a) => {
    const approval = rights.assets.find((r) => r.asset === a.id).approval;
    return { pose: a.pose, status: a.pose === 'neutral' ? `${approval.toUpperCase()} MASTER` : approval === 'approved' ? 'APPROVED' : 'CANDIDATE (pending)', src: dataUri(a.file) };
  });
const backing = dataUri(manifest.assets.find((a) => a.id === 'cabin.backing').file);
// Robot height is about 90% of the canvas: canvas sizes for about 120, 105 and 90 pt of robot.
const GAME = [133, 117, 100];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; background: #0B1220; color: #E8EEF7; font: 14px/1.3 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 16px; } h2 { font-size: 15px; margin: 18px 16px 8px; color: #FFB23F; letter-spacing: 1px; }
.row { display: flex; gap: 12px; padding: 0 16px; }
.cell { width: 256px; text-align: center; }
.src { position: relative; width: 256px; height: 256px; background: #1A2B48; }
.src img, .src canvas { position: absolute; left: 0; top: 0; width: 256px; height: 256px; }
.onion .master { filter: brightness(0) invert(1) sepia(1) hue-rotate(150deg) saturate(6); opacity: 0.45; }
.label { margin-top: 6px; font-weight: 700; } .status { font-size: 12px; color: #9AA8BD; } .num { font: 12px/1.4 ui-monospace, monospace; color: #9AA8BD; }
.game { display: flex; align-items: flex-end; justify-content: center; gap: 6px; height: 150px; background: url(${backing}) center 35% / 520px auto; }
</style></head><body>
<h1>Lifty character set: one robot, six poses (D147). Guides: the master's antenna top, eye row, hover jet.</h1>
<h2>SOURCE SIZE (512 px shown at 256) WITH THE MASTER'S GUIDES</h2>
<div class="row">${poses.map((p, i) => `<div class="cell"><div class="src"><img id="p${i}" src="${p.src}"><canvas id="g${i}" width="512" height="512"></canvas></div><div class="label">${p.pose.toUpperCase()}</div><div class="status">${p.status}</div><div class="num" id="n${i}"></div></div>`).join('')}</div>
<h2>OVER THE MASTER'S SILHOUETTE (CYAN = WHERE THE MASTER IS AND THE POSE IS NOT)</h2>
<div class="row">${poses.map((p) => `<div class="cell"><div class="src onion"><img class="master" src="${poses[0].src}"><img src="${p.src}"></div></div>`).join('')}</div>
${GAME.map((s) => `<h2>GAME SCALE: ABOUT ${Math.round(s * 0.9)} PT OF ROBOT (${s} PT DRAWING), 1 PX PER PT</h2><div class="row">${poses.map((p) => `<div class="cell"><div class="game"><img src="${p.src}" width="${s}" height="${s}"></div></div>`).join('')}</div>`).join('')}
<div style="height:16px"></div>
<script>
function measure(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const W = c.width, H = c.height;
  const px = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; };
  let top = H, bottom = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (px(i, j)[3] > 16) { top = Math.min(top, j); bottom = Math.max(bottom, j); }
  const cyan = (p) => p[3] > 128 && p[1] > 170 && p[2] > 170 && p[0] < 150;
  const face = [], jet = [];
  for (let j = top; j <= bottom; j++) for (let i = 0; i < W; i++) { const p = px(i, j); if (!cyan(p)) continue; if (j < top + (bottom - top) * 0.45) face.push([i, j]); else if (j > top + (bottom - top) * 0.7) jet.push([i, j]); }
  const fy = face.map((f) => f[1]).sort((a, b) => a - b); const eyeRow = fy[Math.floor(fy.length * 0.2)];
  const fx = face.map((f) => f[0]).sort((a, b) => a - b); const cx = fx[Math.floor(fx.length / 2)];
  const onScreen = (i) => { const p = px(i, eyeRow); return p[3] > 200 && !(p[0] > 170 && p[1] > 170 && p[2] > 160); };
  let l = cx, r = cx; while (l > 0 && onScreen(l - 1)) l--; while (r < W - 1 && onScreen(r + 1)) r++;
  const jy = jet.map((f) => f[1]).sort((a, b) => a - b);
  return { top, eyeRow, screenW: r - l + 1, jetX: jet.reduce((s, f) => s + f[0], 0) / jet.length, jetBottom: jy[Math.floor(jy.length * 0.99)] };
}
window.boardReady = Promise.all([...document.querySelectorAll('img')].map((i) => i.decode())).then(() => {
  const master = measure(document.getElementById('p0'));
  document.querySelectorAll('[id^=p]').forEach((img, i) => {
    const m = measure(img);
    const g = document.getElementById('g' + i).getContext('2d'); g.lineWidth = 2; g.setLineDash([8, 6]); g.strokeStyle = 'rgba(255,178,63,0.9)';
    for (const y of [master.top, master.eyeRow, master.jetBottom]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.beginPath(); g.moveTo(master.jetX, 0); g.lineTo(master.jetX, 512); g.stroke();
    const pct = (v, ref) => (v / ref * 100 - 100).toFixed(1);
    document.getElementById('n' + i).textContent = 'screen ' + m.screenW + ' px (' + pct(m.screenW, master.screenW) + '%) · jet ' + m.jetX.toFixed(1) + ', ' + m.jetBottom + ' (Δ ' + (m.jetX - master.jetX).toFixed(1) + ', ' + (m.jetBottom - master.jetBottom) + ' px)';
  });
});
</script></body></html>`;

(async () => {
  const out = path.join(root, 'web-screenshots');
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 6 * 256 + 5 * 12 + 32, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => window.boardReady);
  const file = path.join(out, 'lifty-character-board.png');
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
  console.log(`ok   ${path.relative(root, file)}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
