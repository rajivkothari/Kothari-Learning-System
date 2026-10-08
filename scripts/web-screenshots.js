#!/usr/bin/env node
/* global __dirname */
// Visual QA screenshots of the browser playtest build (not pixel-perfect regression tests).
//   npm run web:export        (once, or after changes)
//   npm run web:screenshots   -> web-screenshots/<viewport>-<scenario>.png
// Options: --out <dir>, --only <substring>, --url <running server base URL>, --dist <export dir>.
// Mid-motion scenarios (a landing thing moving: touch-*, golf-rolling, golf-sunk, golf-job-rolling)
// say READY early in the motion and are photographed at once, without the usual settle (M8.1: a
// capture 600 ms after READY used to land after the motion, with the golf ball out of sight).
// Each capture opens a fresh browser context (so a fresh, empty browser save), drives the REAL
// game to a scenario state through the developer tools (?open=devtools&scenario=...), then
// photographs the simulated device frame only. Same scenario + same build = same game state.
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');
const { LANDING_FLOORS } = require('./lib/landingWalk');

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
  ...[5, 6, 15, 17, 18].flatMap((f) => ['', '-reaction', '-after'].map((v) => ['ipad-landscape', 'ipad', 'landscape', `explore-${f}${v}`])),
  ...['log-empty', 'log-partial', 'log-complete', 'hall-call', 'hall-call-ride'].map((sc) => ['ipad-landscape', 'ipad', 'landscape', sc]),
  ...['explore-6', 'log-partial', 'hall-call', 'completion-after'].map((sc) => ['fire-landscape', 'fire-hd8', 'landscape', sc]),
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'hall-call', 'reduced'],
  // Child-paced success and mission objects (correction round): arrival, NEXT JOB, absence, objects.
  ...['success-arrival', 'collect-kit', 'objective-toolbox', 'objective-parts', 'objective-crew', 'objective-dock', 'beacon', 'wrong-stretch', 'replay-after-rescue'].map((sc) => ['ipad-landscape', 'ipad', 'landscape', sc]),
  ...['success-arrival', 'replay-routine', 'wrong-floor', 'beacon', 'cargo'].map((sc) => ['fire-landscape', 'fire-hd8', 'landscape', sc]),
  ['ipad-portrait', 'ipad', 'portrait', 'objective-crew'],
  ['narrow', 'ipad-split-third', 'landscape', 'objective-crew'],
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
  // Mixed tower (D127, D130): the four themed destinations and the moved Machine Room, as vectors.
  ...[6, 7, 9, 13, 20].map((f) => ['ipad-landscape', 'ipad', 'landscape', `floor-${f}`]),
  ...[7, 20].map((f) => ['fire-landscape', 'fire-hd8', 'landscape', `floor-${f}`]),
  // The building directory (information, never a control) and its placard.
  ['ipad-landscape', 'ipad', 'landscape', 'floor-20', undefined, '', 'Building directory'],
  ['narrow', 'ipad-split-third', 'landscape', 'floor-9', undefined, '', 'Building directory'],
  // Development calibration art with the overlays (doorway crop, safe core, reserved zones, touch
  // areas): checks layers, crops, pivots and fallbacks. Test patterns, not game art.
  ...['floor-15-dormant', 'completion-after', 'explore-15-after', 'floor-7', 'floor-9', 'floor-13', 'floor-20', 'success-arrival', 'objective-crew'].map((sc) => ['art-ipad-landscape', 'ipad', 'landscape', sc, undefined, 'art=calibration&overlay=doorway,safe,hitboxes']),
  ...['floor-20', 'success-arrival'].map((sc) => ['art-fire-landscape', 'fire-hd8', 'landscape', sc, undefined, 'art=calibration&overlay=doorway,safe,hitboxes']),
  ['art-ipad-portrait', 'ipad', 'portrait', 'floor-9', undefined, 'art=calibration&overlay=doorway,safe,hitboxes'],
  ['art-narrow', 'ipad-split-third', 'landscape', 'floor-13', undefined, 'art=calibration&overlay=doorway,safe,hitboxes'],
  // Production art: what a child build draws (approved art only, D145), doors shut, then open.
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape']].flatMap(([tag, preset, o]) => ['start', 'floor-20'].map((sc) => [`production-${tag}`, preset, o, sc, undefined, 'art=production'])),
  // Review mode: production art plus art still pending a person's approval, in the real game (doors shut, then open).
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape']].flatMap(([tag, preset, o]) => ['start', 'floor-20'].map((sc) => [`review-${tag}`, preset, o, sc, undefined, 'art=review'])),
  // A/B for the review: the same states with vectors only, and each candidate Lifty pose forced at
  // its real eye-level placement (a pose with no file falls back to the vector Lifty).
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape']].flatMap(([tag, preset, o]) => ['start', 'floor-20'].map((sc) => [`vector-${tag}`, preset, o, sc, undefined, 'art=vector'])),
  // Lifty's readability at his real sizes (D142): about 120, 108, 105 and 90 pt of visible robot.
  // Calibration shows the canvas and baseline; Review shows the neutral pose once it exists.
  ...['calibration', 'review'].flatMap((mode) => [['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['narrow', 'ipad-split-third', 'landscape'], ['slide-over', 'ipad-slide-over', 'landscape']].map(([tag, preset, o]) => [`lifty-size-${mode}-${tag}`, preset, o, 'success-arrival', undefined, `art=${mode}&liftyPose=neutral`])),
  // Lifty's poses in their real moments (D147), Review art: a ride, the Success Replay, a clue, a
  // wrong floor, and a Concept Rescue count that needs another look.
  ...[['quiet', 'hall-call-ride'], ['success', 'replay-routine'], ['help', 'clue'], ['concerned', 'wrong-floor'], ['thinking', 'rescue-not-next']].flatMap(([pose, sc]) =>
    [['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['narrow', 'ipad-split-third', 'landscape']].map(([tag, preset, o]) => [`pose-${pose}-${tag}`, preset, o, sc, undefined, 'art=review']),
  ),
  // The wider arithmetic (D148): each new job, a typical miss, its success replay, and its test run.
  ...['orders', 'orders-mismatch', 'replay-orders', 'two-part', 'two-part-leg', 'two-part-wrong', 'start-floor', 'replay-start-floor', 'meter', 'meter-set', 'meter-wrong', 'replay-meter', 'express', 'express-count', 'replay-express', 'rescue-two-part', 'rescue-meter', 'rescue-orders', 'rescue-express'].map((sc) => ['ipad-landscape', 'ipad', 'landscape', sc]),
  // The trip meter takes the panel's place: every layout, and reduced motion.
  ...[['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape'], ['slide-over', 'ipad-slide-over', 'landscape']].flatMap(([tag, preset, o]) => ['meter-set', 'orders', 'express-count'].map((sc) => [tag, preset, o, sc])),
  ['fire-landscape-reduced', 'fire-hd8', 'landscape', 'meter-wrong', 'reduced'],
  // Corrections (D149): the consequence and LET'S COUNT, the count on the learner's own job, the fresh job, a capacity underload.
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait']].flatMap(([tag, preset, o]) => ['correction-ready', 'correction-board', 'correction-fresh', 'underload'].map((sc) => [`correction-${tag}`, preset, o, sc])),
  // Illustrated landings pending review (D150): the six floors, Floor 15 both ways, on every main layout
  // (the narrow split view keeps vectors: its doorway is too tall for the art).
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape'], ['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape']].flatMap(([tag, preset, o]) => ['floor-1', 'floor-7', 'floor-9', 'floor-13', 'floor-15-dormant', 'floor-15', 'floor-20'].map((sc) => [`landing-${tag}`, preset, o, sc, undefined, 'art=review'])),
  ['landing-overlay-ipad-landscape', 'ipad', 'landscape', 'floor-9', undefined, 'art=review&overlay=doorway,safe,hitboxes'],
  ['landing-overlay-fire-landscape', 'fire-hd8', 'landscape', 'explore-15-after', undefined, 'art=review&overlay=doorway,safe,hitboxes'],
  ['review-overlay-ipad-landscape', 'ipad', 'landscape', 'selected', undefined, 'art=review&overlay=doorway,safe'],
  ['review-ipad-landscape', 'ipad', 'landscape', 'success-arrival', undefined, 'art=review'],
  ['vector-ipad-landscape', 'ipad', 'landscape', 'success-arrival', undefined, 'art=vector'],
  ['review-ride-ipad-landscape', 'ipad', 'landscape', 'hall-call-ride', undefined, 'art=review'],
  // Calibration art without overlays, and with one Lifty pose forced.
  ['art-clean-ipad-landscape', 'ipad', 'landscape', 'floor-20', undefined, 'art=calibration&liftyPose=help'],
  ['art-clean-fire-landscape-reduced', 'fire-hd8', 'landscape', 'floor-9', 'reduced', 'art=calibration'],
  // M8: the new illustrated landings (pending review) beside their vectors, on iPad and Fire.
  ...[2, 5, 6, 11, 17, 18].flatMap((f) =>
    [['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape']].flatMap(([tag, preset, o]) => ['vector', 'review'].map((mode) => [`m8-landing-${mode}-${tag}`, preset, o, `floor-${f}`, undefined, `art=${mode}`])),
  ),
  ['m8-landing-overlay-ipad-landscape', 'ipad', 'landscape', 'floor-2', undefined, 'art=review&overlay=doorway,safe,hitboxes'],
  // The workshop toolbox (closed is the floor-2 landing above) open, and the rooftop putt mid-roll and back at rest.
  ...['toolbox-open', 'toolbox-shut', 'golf-rolling', 'golf-reset'].flatMap((sc) => ['vector', 'review'].map((mode) => [`m8-${mode}-ipad-landscape`, 'ipad', 'landscape', sc, undefined, `art=${mode}`])),
  ['m8-review-fire-landscape-reduced', 'fire-hd8', 'landscape', 'golf-reduced', 'reduced', 'art=review'],
  // M8.1: the rooftop putt during a job (the ball putts quietly while the job waits), mid-roll and in
  // the cup, and every landing thing mid-motion on the production art and on the vectors.
  ...['golf-job', 'golf-job-rolling', 'golf-rolling', 'golf-sunk', 'golf-read'].map((sc) => ['m81-ipad-landscape', 'ipad', 'landscape', sc, undefined, 'art=production']),
  ...['golf-job-rolling'].flatMap((sc) => [['m81-fire-portrait', 'fire-hd8', 'portrait', sc, undefined, 'art=production'], ['m81-vector-ipad-landscape', 'ipad', 'landscape', sc, undefined, 'art=vector']]),
  // Every spot of the landing catalog (twelve floors in M8.1, every floor since M8.2), from the data.
  ...LANDING_FLOORS.flatMap((f) => (f.explore ?? []).map((s) => [f.floor, s.id])).flatMap(([f, id]) =>
    ['production', 'vector'].map((mode) => [`m81-touch-${mode}-ipad-landscape`, 'ipad', 'landscape', `touch-${f}-${id}`, undefined, `art=${mode}`]),
  ),
  // Reading jobs (M8): the note of each kind, then folded on what answers it (the landing's things,
  // the panel, the cards), the cards in place of a landing that cannot offer every thing, CLUE, SHOW ME.
  ...[['ipad-landscape', 'ipad', 'landscape'], ['fire-landscape', 'fire-hd8', 'landscape']].flatMap(([tag, preset, o]) =>
    ['read-touch', 'read-ride', 'read-cards', 'read-touch-folded', 'read-ride-folded', 'read-cards-folded', 'read-touch-cards', 'read-clue', 'read-show-me'].map((sc) => [`reading-${tag}`, preset, o, sc, undefined, 'art=review']),
  ),
  ...['read-touch', 'read-cards-folded', 'read-touch-cards'].flatMap((sc) => [['ipad-portrait', 'ipad', 'portrait'], ['narrow', 'ipad-split-third', 'landscape']].map(([tag, preset, o]) => [`reading-${tag}`, preset, o, sc, undefined, 'art=review'])),
  ['reading-vector-ipad-landscape', 'ipad', 'landscape', 'read-touch-folded', undefined, 'art=vector'],
  ['reading-fire-landscape-reduced', 'fire-hd8', 'landscape', 'read-show-me', 'reduced', 'art=review'],
].filter((c) => c.join(' ').includes(only));

/** Scenarios caught mid-motion: no settle before the capture. */
const MID_MOTION = /^(touch-\d+-[a-z-]+|golf-rolling|golf-sunk|golf-job-rolling)$/;

/** Wait for READY with a tight poll (the moment matters for a mid-motion capture). */
async function readyNow(page, label, timeoutMs = 90_000) {
  const loc = page.getByTestId('devtools-status');
  const end = Date.now() + timeoutMs;
  for (;;) {
    const t = (await loc.textContent().catch(() => '')) ?? '';
    if (t.startsWith(`READY ${label}`)) return;
    if (t.startsWith('FAILED')) throw new Error(t);
    if (Date.now() > end) throw new Error(`Timed out waiting for READY ${label} (status: ${t})`);
    await page.waitForTimeout(25);
  }
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
  for (const [tag, preset, orientation, scenario, motion, extra, click] of CAPTURES) {
    const context = await browser.newContext({ viewport: { width: 1800, height: 1500 } });
    const page = await context.newPage();
    const file = path.join(out, `${tag}-${scenario}${click ? `-${click.toLowerCase().replace(/\W+/g, '-')}` : ''}.png`);
    try {
      await page.goto(`${base}?open=devtools&preset=${preset}&orientation=${orientation}&scenario=${scenario}${motion ? `&motion=${motion}` : ''}${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
      if (MID_MOTION.test(scenario)) {
        // Photograph at once: the scenario said READY early in the motion.
        await readyNow(page, `scenario:${scenario}`);
      } else {
        await waitForStatus(page, `scenario:${scenario}`);
        if (click) await page.getByTestId('device-frame').getByLabel(click, { exact: true }).click();
        await page.waitForTimeout(600); // let the last animation frame land
      }
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
