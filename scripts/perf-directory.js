#!/usr/bin/env node
// The building directory opening (M9.1): how long the frame that opens it takes, in the browser
// build. Each run opens a fresh browser on the developer tools' free-ride scenario floor-1 (iPad
// landscape, production art), then opens and closes the DIRECTORY several times:
//   open        the press on DIRECTORY (pointerdown) to the first animation frame after the sheet
//               is in the page, and to every Skia canvas made meanwhile having drawn once;
//   long frame  the longest gap between animation frames from the press to 1 s after it, and the
//               long tasks (over 50 ms) in that second, summed;
//   scroll      the longest frame gap while the list is scrolled to its end and back (wheel).
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/perf-directory.js --dist <dir> [--runs 3] [--opens 3] [--profile file.cpuprofile] [--out file.json]
// --profile records a CPU profile of the first open of the first run and prints the functions with
// the most self time. Browser numbers on a shared machine: compare builds measured the same way.
const fs = require('node:fs');
const { openPerf, sample, args, median, until, MB } = require('./lib/perfProbe');
const { waitForStatus } = require('./lib/browser');

/** In the page: record animation frame times from now on (globalThis.__frames). */
const startFrames = (page) =>
  page.evaluate(() => {
    const f = (globalThis.__frames = []);
    const loop = (t) => {
      f.push(t);
      if (globalThis.__framesOn) requestAnimationFrame(loop);
    };
    globalThis.__framesOn = true;
    requestAnimationFrame(loop);
  });
const stopFrames = (page, from, to) =>
  page.evaluate(([a, b]) => {
    globalThis.__framesOn = false;
    const f = globalThis.__frames.filter((t) => t >= a - 50 && t <= b);
    let worst = 0;
    for (let i = 1; i < f.length; i++) worst = Math.max(worst, f[i] - f[i - 1]);
    const tasks = globalThis.__perf.longTasks.filter((t) => t.start >= a - 5 && t.start <= b);
    return { worstFrame: worst, longTaskMs: tasks.reduce((s, t) => s + t.duration, 0), longest: Math.max(0, ...tasks.map((t) => t.duration)) };
  }, [from, to]);

function topSelf(profile, n = 15) {
  const self = new Map();
  const dt = profile.timeDeltas;
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const time = new Map();
  profile.samples.forEach((id, i) => time.set(id, (time.get(id) ?? 0) + (dt[i] ?? 0)));
  for (const [id, us] of time) {
    const node = byId.get(id);
    const cf = node.callFrame;
    const key = `${cf.functionName || '(anonymous)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + us);
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${(us / 1000).toFixed(1).padStart(7)} ms  ${k}`);
}

async function oneRun(opt, profile) {
  const run = await openPerf(opt.dist);
  const { page, cdp, base } = run;
  const opens = [];
  try {
    await page.goto(`${base}?open=devtools&scenario=floor-1&preset=${opt.preset}&orientation=${opt.orientation}&art=production`, { waitUntil: 'load' });
    await waitForStatus(page, 'scenario:floor-1', 180_000);
    const button = page.locator('[data-testid="directory-button"]').first();
    await button.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const before = await sample(page, cdp);
    let scroll = null;
    for (let i = 0; i < opt.opens; i++) {
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const p = globalThis.__perf;
        delete p.marks.directory;
        delete p.marks['directory:frame'];
        delete p.marks['directory:drawn'];
        p.taps = [];
        p.armed = 'directory';
      });
      await startFrames(page);
      const profiling = profile && i === 0;
      if (profiling) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
        await cdp.send('Profiler.start');
      }
      await button.click();
      const frame = await until(page, 'the directory sheet', () => page.evaluate(() => globalThis.__perf.marks['directory:frame']), 30_000, 25);
      await page.waitForTimeout(1000);
      if (profiling) {
        const { profile: p } = await cdp.send('Profiler.stop');
        fs.writeFileSync(profile, JSON.stringify(p));
        console.log(`CPU profile of the first open: ${profile}\n${topSelf(p).join('\n')}`);
      }
      const tap = await page.evaluate(() => globalThis.__perf.taps[0]?.t);
      const drawn = await page.evaluate(() => globalThis.__perf.marks['directory:drawn']);
      const frames = await stopFrames(page, tap, tap + 1000);
      const o = { open: frame - tap, drawn: Math.max(frame, drawn ?? 0) - tap, ...frames };
      opens.push(o);
      console.log(`open ${i + 1}: sheet ${o.open.toFixed(0)} ms, drawn ${o.drawn.toFixed(0)} ms, worst frame ${o.worstFrame.toFixed(0)} ms, long tasks ${o.longTaskMs.toFixed(0)} ms (longest ${o.longest.toFixed(0)})`);
      await page.evaluate(() => (globalThis.__perf.armed = null));
      if (i === 0) {
        // Scroll the list to its end and back with the wheel, watching the frames.
        const list = page.locator('[data-testid="directory-scroll"]').first();
        const box = await list.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        const t0 = await page.evaluate(() => performance.now());
        await startFrames(page);
        for (let k = 0; k < 12; k++) {
          await page.mouse.wheel(0, 120);
          await page.waitForTimeout(40);
        }
        for (let k = 0; k < 12; k++) {
          await page.mouse.wheel(0, -120);
          await page.waitForTimeout(40);
        }
        await page.waitForTimeout(300);
        const t1 = await page.evaluate(() => performance.now());
        scroll = await stopFrames(page, t0, t1);
        console.log(`scroll: worst frame ${scroll.worstFrame.toFixed(0)} ms, long tasks ${scroll.longTaskMs.toFixed(0)} ms`);
      }
      await page.locator('[data-testid="directory-back"]').first().click();
      await until(page, 'the sheet closed', () => page.evaluate(() => !document.querySelector('[data-testid="directory-sheet"]')), 10_000, 25);
    }
    const after = await sample(page, cdp);
    console.log(`memory: wasm ${MB(before.wasmBytes)} -> ${MB(after.wasmBytes)} MB, js ${MB(before.jsHeapUsed)} -> ${MB(after.jsHeapUsed)} MB, images live ${before.imgLive} -> ${after.imgLive}`);
    return { opens, scroll, before, after };
  } finally {
    await run.close();
  }
}

async function main() {
  const opt = args({ dist: undefined, runs: 3, opens: 3, profile: '', out: '', preset: 'ipad', orientation: 'landscape' });
  const runs = [];
  for (let r = 0; r < opt.runs; r++) {
    console.log(`run ${r + 1}`);
    runs.push(await oneRun(opt, r === 0 ? opt.profile : ''));
  }
  const first = runs.map((r) => r.opens[0]);
  const later = runs.flatMap((r) => r.opens.slice(1));
  const fmt = (xs) => `median ${median(xs).toFixed(0)} ms (range ${Math.min(...xs).toFixed(0)} to ${Math.max(...xs).toFixed(0)}, n=${xs.length})`;
  console.log(`\nfirst open: sheet ${fmt(first.map((o) => o.open))}; worst frame ${fmt(first.map((o) => o.worstFrame))}; long tasks ${fmt(first.map((o) => o.longTaskMs))}`);
  if (later.length) console.log(`later opens: sheet ${fmt(later.map((o) => o.open))}; worst frame ${fmt(later.map((o) => o.worstFrame))}; long tasks ${fmt(later.map((o) => o.longTaskMs))}`);
  console.log(`scroll: worst frame ${fmt(runs.map((r) => r.scroll.worstFrame))}`);
  if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ dist: opt.dist, runs }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
