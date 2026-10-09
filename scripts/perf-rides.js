#!/usr/bin/env node
// Ride soak (M9.1): rides the elevator between illustrated floors in free ride and samples the
// CanvasKit (WebAssembly) heap, the JS heap and the DOM every few rides. A leak shows as growth
// that never levels off; a healthy build climbs while it first sees each floor, then holds.
//   EXPO_PUBLIC_DEV_TOOLS=1 EXPO_PUBLIC_PLAYTEST=1 npx expo export --platform web --output-dir <dir>
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/perf-rides.js --dist <dir> [--rides 100] [--every 10] [--out file.json]
// The page is the developer tools' free-ride scenario `floor-1` (a fresh test learner, Floor 15
// completed by the tools, iPad landscape, production art). Each ride presses a floor button on the
// panel, waits for the doors to open and for the landing's art to draw. The floor order is fixed
// (a stride through the twenty floors), so every run rides the same trips. Browser numbers only.
const fs = require('node:fs');
const { openPerf, sample, line, args, MB } = require('./lib/perfProbe');
const { waitForStatus } = require('./lib/browser');
const { LANDING_FLOORS, rideToFloor, waitForLandingArt } = require('./lib/landingWalk');

async function main() {
  const opt = args({ dist: undefined, rides: 100, every: 10, out: '', preset: 'ipad', orientation: 'landscape' });
  const floors = LANDING_FLOORS.map((f) => f.floor);
  // A stride of 7 through 20 floors visits every floor before repeating, with trips of varied length.
  const order = Array.from({ length: opt.rides }, (_, i) => floors[(1 + (i + 1) * 7) % floors.length]);
  const run = await openPerf(opt.dist);
  const { page, cdp, base } = run;
  const samples = [];
  try {
    await page.goto(`${base}?open=devtools&scenario=floor-1&preset=${opt.preset}&orientation=${opt.orientation}&art=production`, { waitUntil: 'load' });
    await waitForStatus(page, 'scenario:floor-1', 180_000);
    await waitForLandingArt(page);
    const first = { ride: 0, floor: 1, ...(await sample(page, cdp)) };
    samples.push(first);
    console.log(line('ride 0', first));
    const started = Date.now();
    let notArt = 0;
    for (let i = 0; i < order.length; i++) {
      const floor = order[i] === (i ? order[i - 1] : 1) ? floors[(floors.indexOf(order[i]) + 1) % floors.length] : order[i];
      await rideToFloor(page, floor, { timeoutMs: 90_000 });
      const l = await waitForLandingArt(page, 20_000);
      if (l.state !== 'art') notArt += 1;
      if ((i + 1) % opt.every === 0) {
        const s = { ride: i + 1, floor, ...(await sample(page, cdp)) };
        samples.push(s);
        console.log(line(`ride ${i + 1}`, s));
      }
    }
    const last = samples[samples.length - 1];
    const mid = samples[Math.floor(samples.length / 2)];
    console.log(`\n${opt.rides} rides in ${((Date.now() - started) / 1000).toFixed(0)} s; landings not drawn as art: ${notArt}`);
    console.log(`wasm: start ${MB(first.wasmBytes)} MB, middle ${MB(mid.wasmBytes)} MB, end ${MB(last.wasmBytes)} MB (second half +${MB(last.wasmBytes - mid.wasmBytes)} MB)`);
    if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ dist: opt.dist, rides: opt.rides, samples }, null, 1));
  } finally {
    await run.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
