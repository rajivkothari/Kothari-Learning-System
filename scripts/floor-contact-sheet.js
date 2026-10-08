#!/usr/bin/env node
/* global __dirname, Buffer */
// Contact sheets of the tower (M8.2): every floor's landing, doors open, in production art, as one
// labelled grid PNG per layout. Visual QA, not a regression test: look at the sheets.
//   npm run web:export                     (or any export with the developer tools)
//   node scripts/floor-contact-sheet.js    -> web-screenshots/floors-<layout>.png
// Layouts: iPad landscape and Fire HD 8 portrait with every floor; Reduced Motion (iPad landscape) and
// the narrow window (Split View 1/3) with a sample (one floor in three). Each sheet comes from ONE free
// ride on a fresh test learner (the developer tools complete the mission first, as the floor-N
// scenarios do): the panel's floor buttons ride the real game from floor to floor, and each landing is
// photographed once its doors stand open and its art has drawn (or is known to be vector). Each tile
// is labelled with the live sign as the page shows it, and in red where the illustrated landing is
// missing (VECTOR, ART NOT DRAWN) or the sign is cut off. The grid is composed in the page's own canvas (no image library).
// Each tile is the doorway and a little of the cabin round it (the landing large enough to judge);
// --whole keeps the whole device frame (panel, Lifty, directory) instead.
// Options: --dist <export dir> (default dist-web), --url <running server>, --out <dir>,
// --layouts ipad,fire,reduced,narrow (default all four), --floors all|3,4,8 (overrides the floors of
// every layout), --art production|review|vector (default production), --whole.
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');
const { LANDING_FLOORS, landingNow, rideToFloor, waitForLandingArt } = require('./lib/landingWalk');

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(opt('--out', path.join(__dirname, '..', 'web-screenshots')));
const art = opt('--art', 'production');
const whole = args.includes('--whole');
const ALL = LANDING_FLOORS.map((f) => f.floor);
const SAMPLE = ALL.filter((_, i) => i % 3 === 0);
const pick = opt('--floors', '');
const floorsFor = (fallback) => (pick === 'all' ? ALL : pick ? pick.split(',').map(Number).filter((f) => ALL.includes(f)) : fallback);

/** One sheet per layout: the preset, orientation, motion, which floors, and the tile scale. */
const LAYOUTS = {
  ipad: { title: 'iPad landscape', preset: 'ipad', orientation: 'landscape', floors: floorsFor(ALL), scale: whole ? 0.4 : 0.8, columns: 7 },
  fire: { title: 'Fire HD 8 portrait', preset: 'fire-hd8', orientation: 'portrait', floors: floorsFor(ALL), scale: whole ? 0.42 : 1, columns: 7 },
  reduced: { title: 'iPad landscape, Reduced Motion (sample)', preset: 'ipad', orientation: 'landscape', motion: 'reduced', floors: floorsFor(SAMPLE), scale: whole ? 0.4 : 0.8, columns: 7 },
  narrow: { title: 'Narrow window, Split View 1/3 (sample)', preset: 'ipad-split-third', orientation: 'landscape', floors: floorsFor(SAMPLE), scale: whole ? 0.6 : 2, columns: 7 },
};
const chosen = opt('--layouts', Object.keys(LAYOUTS).join(',')).split(',').filter((k) => LAYOUTS[k]);

/** Compose labelled tiles into one PNG in the page (OffscreenCanvas): returns the PNG bytes. */
async function compose(page, title, tiles, { scale, columns }) {
  const b64 = await page.evaluate(
    async ([title, tiles, scale, columns]) => {
      const images = [];
      for (const t of tiles) images.push(await createImageBitmap(await (await fetch(`data:image/png;base64,${t.png}`)).blob()));
      const w = Math.round(Math.max(...images.map((i) => i.width)) * scale);
      const h = Math.round(Math.max(...images.map((i) => i.height)) * scale);
      const pad = 12, label = 40, head = 48;
      const cols = Math.min(columns, tiles.length);
      const rows = Math.ceil(tiles.length / cols);
      const canvas = new OffscreenCanvas(pad + cols * (w + pad), head + rows * (h + label + pad) + pad);
      const g = canvas.getContext('2d');
      g.fillStyle = '#0B0F16';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#E8EDF5';
      g.font = 'bold 22px sans-serif';
      g.fillText(title, pad, 32);
      tiles.forEach((t, i) => {
        const x = pad + (i % cols) * (w + pad);
        const y = head + Math.floor(i / cols) * (h + label + pad);
        g.drawImage(images[i], x, y, Math.round(images[i].width * scale), Math.round(images[i].height * scale));
        g.fillStyle = t.ok ? '#E8EDF5' : '#FF5A5A';
        g.font = 'bold 15px sans-serif';
        g.fillText(t.title, x, y + h + 17, w);
        g.font = '13px sans-serif';
        g.fillStyle = t.ok ? '#9AA6B8' : '#FF5A5A';
        g.fillText(t.note, x, y + h + 34, w);
      });
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [title, tiles, scale, columns],
  );
  return Buffer.from(b64, 'base64');
}

(async () => {
  let server = null;
  let base = opt('--url', '');
  if (!base) {
    server = await serve(path.resolve(opt('--dist', path.join(__dirname, '..', 'dist-web'))), 0);
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser();
  let failures = 0;
  for (const key of chosen) {
    const layout = LAYOUTS[key];
    if (!layout.floors.length) continue;
    const context = await browser.newContext({ viewport: { width: 1800, height: 1500 } });
    const page = await context.newPage();
    const tiles = [];
    try {
      const first = layout.floors[0];
      await page.goto(`${base}?open=devtools&preset=${layout.preset}&orientation=${layout.orientation}&scenario=floor-${first}&art=${art}${layout.motion ? `&motion=${layout.motion}` : ''}`, { waitUntil: 'load' });
      await waitForStatus(page, `scenario:floor-${first}`);
      for (const floor of layout.floors) {
        const name = LANDING_FLOORS.find((f) => f.floor === floor).name;
        try {
          await rideToFloor(page, floor);
          const l = await waitForLandingArt(page);
          await page.waitForTimeout(1200); // the doors and layers settle; Lifty names the thing to touch
          const status = (await page.getByTestId('art-status').textContent()) ?? '';
          const failed = /Missing or failed: (.*?) \(vector shown\)/.exec(status)?.[1];
          const frame = await page.getByTestId('device-frame').boundingBox();
          // The doorway (its accessibility box is the top 0.6 of the door) with a margin of cabin round it.
          const door = (await landingNow(page)).door;
          const H = door ? door.height / 0.6 : 0;
          const clip = whole || !door ? frame : (() => {
            const x0 = Math.max(frame.x, door.x - 0.2 * door.width), y0 = Math.max(frame.y, door.y - 0.06 * H);
            const x1 = Math.min(frame.x + frame.width, door.x + 1.2 * door.width), y1 = Math.min(frame.y + frame.height, door.y + 1.06 * H);
            return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
          })();
          const png = await page.screenshot({ clip });
          const now = await landingNow(page);
          const ok = l.state === 'art' && !failed && !now.signCut;
          const note = l.state === 'art' ? (failed ? `failed: ${failed}` : `art · sign "${now.sign}"${now.signCut ? ' CUT OFF' : ''}`) : l.state === 'vector' ? 'VECTOR (no art for this floor)' : 'ART NOT DRAWN (loading or failed)';
          tiles.push({ png: png.toString('base64'), title: `${floor} · ${name}`, note, ok });
          console.log(`${ok ? 'ok  ' : 'NOTE'} ${key} floor ${floor}: ${note}`);
        } catch (e) {
          failures += 1;
          console.log(`FAIL ${key} floor ${floor}: ${e.message.split('\n')[0]}`);
        }
      }
      const file = path.join(out, `floors-${key}.png`);
      fs.writeFileSync(file, await compose(page, `${layout.title}: ${art} art, ${tiles.length} floors`, tiles, layout));
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    } catch (e) {
      failures += 1;
      console.log(`FAIL ${key}: ${e.message.split('\n')[0]}`);
    }
    await context.close();
  }
  await browser.close();
  server?.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
