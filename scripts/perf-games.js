#!/usr/bin/env node
// Mini-game mount/unmount soak (M9.1): opens a mini-game from its landing and goes BACK TO ELEVATOR,
// many times, sampling the CanvasKit (WebAssembly) heap, the JS heap, DOM nodes (attached and
// detached), event listeners, live WebGL contexts and live CanvasKit images every few cycles. Each
// game leaving nothing behind shows as flat lines after the first cycle or two.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/perf-games.js --dist <dir> [--cycles 50] [--every 10] [--game both|word-golf|cargo-commander] [--out file.json]
// Pages: the developer tools' scenarios minigame-entrance-20 (Word Golf) and minigame-entrance-4
// (Cargo Commander): a fresh test learner in free ride at that landing, iPad landscape, production
// art. A cycle: press PLAY (the landing's entrance), wait for the game's screen and two animation
// frames, press its BACK TO ELEVATOR, wait for the landing's entrance again. Nothing is answered, so
// no learning record is written. Browser numbers only.
const fs = require('node:fs');
const { openPerf, sample, line, args, until } = require('./lib/perfProbe');
const { waitForStatus } = require('./lib/browser');

const GAMES = {
  'word-golf': { scenario: 'minigame-entrance-20', screen: 'word-golf', back: 'wg-back' },
  'cargo-commander': { scenario: 'minigame-entrance-4', screen: 'cargo-commander', back: 'minigame-back' },
};

const shown = (page, id) => page.evaluate((t) => {
  const el = document.querySelector(`[data-testid="${t}"]`);
  return Boolean(el && el.getBoundingClientRect().width > 0);
}, id);
const frames = (page, n) => page.evaluate((k) => new Promise((r) => {
  const step = (i) => (i <= 0 ? r() : requestAnimationFrame(() => step(i - 1)));
  step(k);
}), n);

async function soak(game, opt) {
  const g = GAMES[game];
  const run = await openPerf(opt.dist);
  const { page, cdp, base } = run;
  const samples = [];
  try {
    await page.goto(`${base}?open=devtools&scenario=${g.scenario}&preset=${opt.preset}&orientation=${opt.orientation}&art=production`, { waitUntil: 'load' });
    await waitForStatus(page, `scenario:${g.scenario}`, 180_000);
    const entrance = `minigame-entrance-${game}`;
    await until(page, 'the PLAY entrance', () => shown(page, entrance));
    const s0 = { cycle: 0, ...(await sample(page, cdp)) };
    samples.push(s0);
    console.log(line(`${game.slice(0, 5)} 0`, s0));
    for (let i = 1; i <= opt.cycles; i++) {
      await page.locator(`[data-testid="${entrance}"]`).first().click();
      await until(page, `the ${game} screen`, () => shown(page, g.screen), 30_000, 50);
      await frames(page, 2);
      await page.waitForTimeout(opt.dwell);
      await page.locator(`[data-testid="${g.screen}"] [data-testid="${g.back}"]`).first().click();
      await until(page, 'the landing again', () => shown(page, entrance), 30_000, 50);
      await frames(page, 2);
      if (i % opt.every === 0) {
        const s = { cycle: i, ...(await sample(page, cdp)) };
        samples.push(s);
        console.log(line(`${game.slice(0, 5)} ${i}`, s));
      }
    }
  } finally {
    await run.close();
  }
  return samples;
}

async function main() {
  const opt = args({ dist: undefined, cycles: 50, every: 10, game: 'both', dwell: 300, out: '', preset: 'ipad', orientation: 'landscape' });
  const games = opt.game === 'both' ? Object.keys(GAMES) : [opt.game];
  const result = {};
  for (const game of games) result[game] = await soak(game, opt);
  if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ dist: opt.dist, cycles: opt.cycles, result }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
