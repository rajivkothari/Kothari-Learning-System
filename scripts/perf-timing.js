#!/usr/bin/env node
// Timings (M9.1) in the browser build, each run in a fresh browser (a fresh save):
//   startup      navigation start to the first animation frame after the elevator panel shows
//                (`?open=quest`, a fresh learner: the default game a child opens);
//                (also: until every Skia canvas made meanwhile has drawn once, its first flush);
//   word golf    the press on PLAY WORD GOLF (pointerdown) to the moment every Skia canvas the game
//                made has drawn its first frame (and, also printed, to the first animation frame
//                after the game's screen is in the page); developer tools' scenario
//                minigame-entrance-20; the first entry (cold) and, after BACK TO ELEVATOR, a second (warm);
//   cargo        the same for PLAY CARGO COMMANDER (scenario minigame-entrance-4).
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/perf-timing.js --dist <dir> [--runs 5] [--only startup|word-golf|cargo-commander] [--out file.json]
// Prints each run and the median with the range. Browser numbers on this machine only (a shared
// machine is noisy): they compare two builds measured the same way, never a tablet.
const fs = require('node:fs');
const { openPerf, args, median, until } = require('./lib/perfProbe');
const { waitForStatus } = require('./lib/browser');

const mark = (page, name) => page.evaluate((n) => globalThis.__perf.marks[n], name);

async function startup(dist) {
  const run = await openPerf(dist);
  try {
    await run.page.goto(`${run.base}?open=quest`, { waitUntil: 'load' });
    const panel = await until(run.page, 'the elevator panel', () => mark(run.page, 'panel:frame'), 120_000, 50);
    await run.page.waitForTimeout(1500);
    const drawn = await mark(run.page, 'startup:drawn');
    return { panel, drawn: Math.max(panel, drawn ?? 0) };
  } finally {
    await run.close();
  }
}

const GAMES = {
  'word-golf': { scenario: 'minigame-entrance-20', back: 'wg-back' },
  'cargo-commander': { scenario: 'minigame-entrance-4', back: 'minigame-back' },
};

async function entry(dist, game, opt) {
  const g = GAMES[game];
  const run = await openPerf(dist);
  const { page } = run;
  try {
    await page.goto(`${run.base}?open=devtools&scenario=${g.scenario}&preset=${opt.preset}&orientation=${opt.orientation}&art=production`, { waitUntil: 'load' });
    await waitForStatus(page, `scenario:${g.scenario}`, 180_000);
    const entrance = page.locator(`[data-testid="minigame-entrance-${game}"]`).first();
    const times = [];
    for (let i = 0; i < 2; i++) {
      await entrance.waitFor({ state: 'visible', timeout: 60_000 });
      await page.waitForTimeout(1000); // let the landing settle (doors, art) before the press
      await page.evaluate((n) => {
        const p = globalThis.__perf;
        delete p.marks[n];
        delete p.marks[`${n}:frame`];
        p.taps = [];
        p.armed = n;
      }, game);
      await entrance.click();
      const frame = await until(page, `the ${game} screen`, () => mark(page, `${game}:frame`), 60_000, 25);
      await page.waitForTimeout(1500);
      const drawn = await mark(page, `${game}:drawn`);
      const tap = await page.evaluate(() => globalThis.__perf.taps[0]?.t);
      times.push({ screen: frame - tap, drawn: Math.max(frame, drawn ?? 0) - tap });
      await page.evaluate(() => (globalThis.__perf.armed = null));
      await page.waitForTimeout(500);
      await page.locator(`[data-testid="${game}"] [data-testid="${g.back}"]`).first().click();
    }
    return { cold: times[0], warm: times[1] };
  } finally {
    await run.close();
  }
}

const fmt = (xs) => `median ${median(xs).toFixed(0)} ms (range ${Math.min(...xs).toFixed(0)} to ${Math.max(...xs).toFixed(0)}, n=${xs.length})`;

async function main() {
  const opt = args({ dist: undefined, runs: 5, only: '', out: '', preset: 'ipad', orientation: 'landscape' });
  const result = {};
  if (!opt.only || opt.only === 'startup') {
    result.startup = { panel: [], drawn: [] };
    for (let i = 0; i < opt.runs; i++) {
      const t = await startup(opt.dist);
      result.startup.panel.push(t.panel);
      result.startup.drawn.push(t.drawn);
      console.log(`startup run ${i + 1}: panel ${t.panel.toFixed(0)} ms, every canvas drawn ${t.drawn.toFixed(0)} ms`);
    }
  }
  for (const game of Object.keys(GAMES)) {
    if (opt.only && opt.only !== game) continue;
    result[game] = { cold: [], warm: [], coldScreen: [], warmScreen: [] };
    for (let i = 0; i < opt.runs; i++) {
      const t = await entry(opt.dist, game, opt);
      result[game].cold.push(t.cold.drawn);
      result[game].warm.push(t.warm.drawn);
      result[game].coldScreen.push(t.cold.screen);
      result[game].warmScreen.push(t.warm.screen);
      console.log(`${game} run ${i + 1}: first entry ${t.cold.drawn.toFixed(0)} ms (screen in page ${t.cold.screen.toFixed(0)}), second ${t.warm.drawn.toFixed(0)} ms (${t.warm.screen.toFixed(0)})`);
    }
  }
  console.log('');
  if (result.startup) console.log(`startup, panel shown: ${fmt(result.startup.panel)}\nstartup, every canvas drawn: ${fmt(result.startup.drawn)}`);
  for (const game of Object.keys(GAMES)) if (result[game]) console.log(`${game} entry to every game canvas drawn: first ${fmt(result[game].cold)}; second ${fmt(result[game].warm)}\n${game} entry to the screen in the page: first ${fmt(result[game].coldScreen)}`);
  if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ dist: opt.dist, result }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
