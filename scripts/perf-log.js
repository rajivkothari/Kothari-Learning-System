#!/usr/bin/env node
// Engineer Log open/close soak (audit follow-up, D179): closes and reopens the Log many times,
// sampling the CanvasKit (WebAssembly) heap, the JS heap, DOM nodes (attached and detached), event
// listeners, live WebGL contexts, canvases and live CanvasKit images every few cycles. The Log draws
// all its emblems in one canvas, so the canvas count rises by one while it is open and the lines stay
// flat after the first cycle or two; before D179 each opening made a WebGL context per row.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/perf-log.js --dist <dir> [--cycles 50] [--every 10] [--out file.json]
// Page: the developer tools' scenario log-complete (a fresh test learner in free ride with every
// floor inspected and the Log open), iPad landscape, production art. A cycle: CLOSE, two animation
// frames, press the Engineer Log button, wait for the Log and two frames. Nothing is answered, so no
// learning record is written. Browser numbers only, never a tablet.
const fs = require('node:fs');
const { openPerf, sample, line, args, until } = require('./lib/perfProbe');
const { waitForStatus } = require('./lib/browser');

const frames = (page, n) => page.evaluate((k) => new Promise((r) => {
  const step = (i) => (i <= 0 ? r() : requestAnimationFrame(() => step(i - 1)));
  step(k);
}), n);
// The Log's header (every build has it, before and after D179).
const logOpen = (page) => page.evaluate(() => [...document.querySelectorAll('[role="heading"]')].some((h) => h.textContent.trim().toUpperCase() === 'ENGINEER LOG'));

async function main() {
  const opt = args({ dist: undefined, cycles: 50, every: 10, out: '', preset: 'ipad', orientation: 'landscape' });
  const run = await openPerf(opt.dist);
  const { page, cdp, base } = run;
  const samples = [];
  const frame = page.getByTestId('device-frame');
  try {
    await page.goto(`${base}?open=devtools&scenario=log-complete&preset=${opt.preset}&orientation=${opt.orientation}&art=production`, { waitUntil: 'load' });
    await waitForStatus(page, 'scenario:log-complete', 180_000);
    await until(page, 'the open Log', () => logOpen(page));
    await frames(page, 2);
    const s0 = { cycle: 0, ...(await sample(page, cdp)) };
    samples.push(s0);
    console.log(line('log 0', s0));
    for (let i = 1; i <= opt.cycles; i++) {
      await frame.getByLabel('CLOSE', { exact: true }).first().click();
      await until(page, 'the Log closed', async () => !(await logOpen(page)), 30_000, 50);
      await frames(page, 2);
      await frame.getByLabel('Engineer Log', { exact: true }).first().click();
      await until(page, 'the Log open', () => logOpen(page), 30_000, 50);
      await frames(page, 2);
      if (i % opt.every === 0) {
        const s = { cycle: i, ...(await sample(page, cdp)) };
        samples.push(s);
        console.log(line(`log ${i}`, s));
      }
    }
  } finally {
    await run.close();
  }
  if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ dist: opt.dist, cycles: opt.cycles, samples }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
