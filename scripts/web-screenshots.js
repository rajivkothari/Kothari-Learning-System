#!/usr/bin/env node
// Visual QA screenshots of the browser playtest build (not pixel-perfect regression tests).
//   npm run web:export        (once, or after changes)
//   npm run web:screenshots   -> web-screenshots/<viewport>-<scenario>.png
// Options: --out <dir>, --only <substring>, --url <running server base URL>.
// Each capture opens a fresh browser context (so a fresh, empty browser save), drives the REAL
// game to a scenario state through the developer tools (?open=devtools&scenario=...), then
// photographs the simulated device frame only. Same scenario + same build = same game state.
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(opt('--out', path.join(__dirname, '..', 'web-screenshots')));
const only = opt('--only', '');

const CAPTURES = [
  ['ipad-landscape', 'ipad', 'landscape', 'start'],
  ['ipad-landscape', 'ipad', 'landscape', 'selected'],
  ['ipad-landscape', 'ipad', 'landscape', 'wrong-floor'],
  ['ipad-landscape', 'ipad', 'landscape', 'rescue-generic'],
  ['ipad-landscape', 'ipad', 'landscape', 'cargo'],
  // In-world completion: before (dormant Floor 15), during (restored, panel sweep), after (free ride).
  ['ipad-landscape', 'ipad', 'landscape', 'floor-15-dormant'],
  ['ipad-landscape', 'ipad', 'landscape', 'completion'],
  ['ipad-landscape', 'ipad', 'landscape', 'completion-after'],
  ['ipad-portrait', 'ipad', 'portrait', 'idle'],
  ['ipad-portrait', 'ipad', 'portrait', 'rescue-generic'],
  ['ipad-portrait', 'ipad', 'portrait', 'cargo'],
  ['narrow', 'ipad-split-third', 'landscape', 'idle'],
  ['narrow', 'ipad-split-third', 'landscape', 'cargo'],
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'wrong-floor', 'reduced'],
  ...[1, 2, 3, 6, 9, 11, 13, 19].map((f) => ['ipad-landscape', 'ipad', 'landscape', `floor-${f}`]),
  // Exploration: each inspectable landing before a touch, mid-reaction, and inspected.
  ...[5, 7, 15, 17, 18].flatMap((f) => ['', '-reaction', '-after'].map((v) => ['ipad-landscape', 'ipad', 'landscape', `explore-${f}${v}`])),
  ...['log-empty', 'log-partial', 'log-complete', 'hall-call', 'hall-call-ride'].map((sc) => ['ipad-landscape', 'ipad', 'landscape', sc]),
  ...['explore-7', 'log-partial', 'hall-call', 'completion-after'].map((sc) => ['fire-landscape', 'fire-hd8', 'landscape', sc]),
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'hall-call', 'reduced'],
  ['ipad-portrait', 'ipad', 'portrait', 'explore-17-after'],
  ['ipad-portrait', 'ipad', 'portrait', 'log-partial'],
  ['narrow', 'ipad-split-third', 'landscape', 'explore-17-after'],
  ['narrow', 'ipad-split-third', 'landscape', 'log-partial'],
  ['fire-landscape', 'fire-hd8', 'landscape', 'floor-8'],
  ['ipad-landscape', 'ipad', 'landscape', 'replay-routine'],
  ['ipad-landscape', 'ipad', 'landscape', 'replay-stretch'],
  ['ipad-landscape', 'ipad', 'landscape', 'replay-cargo'],
  ['ipad-portrait', 'ipad', 'portrait', 'replay-routine'],
  ['narrow', 'ipad-split-third', 'landscape', 'replay-routine'],
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'replay-routine', 'reduced'],
  ['fire-landscape', 'fire-hd8', 'landscape', 'clue'],
  ['fire-landscape', 'fire-hd8', 'landscape', 'help-offered'],
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'help-offered', 'reduced'],
  ['ipad-landscape', 'ipad', 'landscape', 'clue'],
  ['ipad-portrait', 'ipad', 'portrait', 'floor-15'],
  ['narrow', 'ipad-split-third', 'landscape', 'floor-11'],
].filter((c) => c.join(' ').includes(only));

(async () => {
  let server = null;
  let base = opt('--url', '');
  if (!base) {
    server = await serve(path.join(__dirname, '..', 'dist-web'), 0);
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser();
  let failures = 0;
  for (const [tag, preset, orientation, scenario, motion] of CAPTURES) {
    const context = await browser.newContext({ viewport: { width: 1800, height: 1500 } });
    const page = await context.newPage();
    const file = path.join(out, `${tag}-${scenario}.png`);
    try {
      await page.goto(`${base}?open=devtools&preset=${preset}&orientation=${orientation}&scenario=${scenario}${motion ? `&motion=${motion}` : ''}`, { waitUntil: 'load' });
      await waitForStatus(page, `scenario:${scenario}`);
      await page.waitForTimeout(600); // let the last animation frame land
      await page.getByTestId('device-frame').screenshot({ path: file });
      console.log(`ok   ${path.relative(process.cwd(), file)}`);
    } catch (e) {
      failures += 1;
      console.log(`FAIL ${tag}-${scenario}: ${e.message.split('\n')[0]}`);
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
