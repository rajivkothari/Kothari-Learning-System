#!/usr/bin/env node
/* global __dirname */
// End-to-end check of the browser playtest build in a real Chromium (playwright-core).
//   npm run web:export && npm run web:e2e
// 1. Plays Floor 15 as a child would (default learner, normal game screen), with a page reload
//    mid-mission, answering the hall calls between jobs, to the in-world completion; reloads
//    again and checks the completion persisted (free ride, rank plate).
//    Each correct answer waits on NEXT JOB, which the script presses (at least five per run).
//    The run covers one job from each step: moves, the shaft map, two orders, a two-part trip, where did
//    the crew get on, the trip meter (FEWER/MORE/GO) or calls in order, the beacon or another stretch
//    job, the express, a lamp pattern or the ten-floor express, and the encounter (M8: pool steps pick
//    one job per run, so a single run sees a subset of the job kinds).
//    Reading jobs (M8, four per run): the note shows first (`reading-note`); nothing on screen shows
//    the answer before it is given, except as an option's own name; the note is folded and the job
//    answered on the landing (`landing-touch-<thing>`), on the cards (`reading-choice-<value>`), or on
//    the panel (a ride). The first reading job uses CLUE (the note's key line is labelled "Clue: ");
//    the second is missed once on purpose, comes back the same, and is then answered.
// 1b. Exploration: touches two landings, opens the Engineer Log, reloads, and finds the
//    discoveries still there.
// 2. Developer tools: enters a Concept Rescue on a test learner, works the test run, returns to
//    the real job, and checks the tools wrote no learning records doing so.
// 3. Opens the playtest report from the tools and checks it names the simulated viewport.
// 4. Art pipeline (development calibration art): the images load (no 404, no decode failure
//    reported), and the Floor 15 core is still touchable through the art's own touch area.
// 5. Reading on an illustrated landing (Review art): a touch job answered by touching the thing, and
//    a landing that cannot offer every thing (the lobby's plant and bench are not on the art)
//    answered with cards instead.
// The math answers are worked out from Lifty's on-screen line (the givens), as a person would. A
// reading job is recognised from its note's words, and its answer comes from the content data
// (content/packs/reading.json: item id -> right value), never from the screen.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');

const step = (m) => console.log(`- ${m}`);
const ROOT = path.join(__dirname, '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

// Reading items (M8): the right value and the wrong options from the pack, the words from the theme.
const READING_WORDS = json('content/themes/elevator-quest/reading.json').items;
const READING_ITEMS = json('content/packs/reading.json').activities.flatMap((a) =>
  a.params.items.map((it) => ({ id: it.id, correct: it.correct, wrong: it.distractors.map((d) => d.value), words: READING_WORDS[it.id] })),
);
/** A landing's first exploration spot, and what it is called before it is found (content/landings.ts spotLabel). */
const LANDING_FLOORS = json('content/themes/elevator-quest/landings.json').floors;
const firstSpotLabel = (floor) => {
  const spot = LANDING_FLOORS.find((f) => f.floor === floor).explore[0];
  return spot.action ?? `Inspect the ${spot.object}`;
};
/** Whitespace and case aside (a style may set the case): the words as a reader sees them. */
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Which item a note shows: the one whose every sentence is on it, as a person reads it. */
function noteItem(noteText) {
  const t = norm(noteText);
  const hits = READING_ITEMS.filter((it) => it.words.passage.every((line) => t.includes(norm(line))));
  if (hits.length !== 1) throw new Error(`the note matches ${hits.length} reading items: ${t.slice(0, 200)}`);
  return hits[0];
}

const tap = (locator) => (process.env.E2E_TOUCH ? locator.tap() : locator.click());
const visible = async (locator) => (await locator.count()) > 0 && (await locator.first().isVisible());
async function waitVisible(page, locators, label, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    for (const l of locators) if (await visible(l)) return l.first();
    if (Date.now() > end) throw new Error(`timeout waiting for ${label}\n${(await text(page)).slice(0, 600)}`);
    await page.waitForTimeout(200);
  }
}

/**
 * Before an answer, nothing on screen gives the reading job away: no SHOW ME glow, and outside the
 * note itself and the options' own names, no words naming the right thing, card or floor.
 */
async function checkNoAnswerShown(page, item) {
  if (await page.locator('[data-testid$="-shown"]').count()) throw new Error(`${item.id}: an answer is marked before SHOW ME`);
  const outside = await page.evaluate(() => {
    const skip = (el) => el.closest('[data-testid="reading-note"],[data-testid="reading-choices"]');
    // The game only: in the developer tools, the simulated device (the panel beside it names jobs).
    const root = document.querySelector('[data-testid="device-frame"]') ?? document.body;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (el && !skip(el) && el.getClientRects().length) out.push(n.textContent);
    }
    return out.join(' ');
  });
  const words = item.words.mode === 'ride' ? new RegExp(`\\bFloor ${item.correct}(?!\\d)`) : new RegExp(`\\b${escapeRe(item.words.options[item.correct])}\\b`, 'i');
  if (words.test(outside)) throw new Error(`${item.id}: the answer shows on screen before it is given (${words})`);
  for (const raw of [item.id, String(item.correct)]) if (raw.includes('-') && outside.includes(raw)) throw new Error(`${item.id}: an internal id shows on screen: ${raw}`);
}

/** Fold the note and give `value`: the thing on the landing, else its card (touch); a card; or a floor (ride). */
async function answerReading(page, item, value) {
  const note = page.getByTestId('reading-note');
  if (await visible(note)) await tap(page.getByTestId('reading-note-close').first());
  if (item.words.mode === 'ride') return click(page, `Floor ${value}`);
  const target = await waitVisible(page, [page.getByTestId(`landing-touch-${value}`), page.getByTestId(`reading-choice-${value}`)], `a way to answer ${value}`);
  return tap(target);
}

/**
 * One reading job, from its open note to the answer. `clue`: ask for CLUE first and find the note's
 * key line marked. `miss`: give a wrong answer first, see the same job come back (CLUE now offered),
 * then answer. Returns what it did, for the run's own checks.
 */
async function playReading(page, { clue, miss }) {
  const note = page.getByTestId('reading-note').first();
  const item = noteItem(await note.innerText());
  if (!norm(await note.innerText()).includes(norm(item.words.source))) throw new Error(`${item.id}: the note has no title`);
  await checkNoAnswerShown(page, item);
  if (clue) {
    await tap(page.getByLabel(/^Help( ready)?: CLUE$/).first());
    await waitVisible(page, [page.locator('[data-testid="reading-note"] [aria-label^="Clue: "]')], 'the clue line in the note');
    const marked = await page.locator('[data-testid="reading-note"] [aria-label^="Clue: "]').count();
    if (marked !== 1) throw new Error(`${item.id}: ${marked} lines marked as the clue`);
  }
  if (miss) {
    const wrong = item.words.mode === 'ride' ? (item.correct === 20 ? 19 : item.correct + 1) : item.wrong[0];
    await answerReading(page, item, wrong);
    // The same job waits again: no NEXT JOB, CLUE offered, and its note is the same note.
    await waitVisible(page, [page.getByLabel('Help ready: CLUE', { exact: true })], 'CLUE offered after the miss', 40_000);
    if (/NEXT JOB/.test(await text(page))) throw new Error(`${item.id}: a miss moved on`);
    if (!(await visible(page.getByTestId('reading-note')))) await tap(page.getByTestId('reading-note-open').first());
    const again = noteItem(await (await waitVisible(page, [page.getByTestId('reading-note')], 'the note again')).innerText());
    if (again.id !== item.id) throw new Error(`a miss on ${item.id} brought ${again.id}, not the same job`);
    await checkNoAnswerShown(page, item);
  }
  await answerReading(page, item, item.correct);
  return item;
}

async function text(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
}
async function waitText(page, re, ms = 40_000) {
  const end = Date.now() + ms;
  for (;;) {
    const t = await text(page);
    const m = t.match(re);
    if (m) return m;
    if (Date.now() > end) throw new Error(`timeout waiting for ${re}\n${t.slice(0, 600)}`);
    await page.waitForTimeout(200);
  }
}
const click = (page, label) => {
  const control = page.getByLabel(label, { exact: true }).first();
  return process.env.E2E_TOUCH ? control.tap() : control.click();
};

/** Work out the job from Lifty's line. */
function job(t) {
  let m;
  if ((m = t.match(/We're on Floor (\d+)\. The repair kit is (\d+) floors (up|down)/)) || (m = t.match(/Floor (\d+)\. The toolbox is (\d+) floors (up|down)/))) return { kind: 'panel', target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're at Floor (\d+)\. The spare parts are (\d+) floors (up|down)/))) return { kind: 'panel', target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're (\d+) floors (above|below) the beacon\." The beacon is on Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/loading dock is (\d+) floors (above|below) Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/It can carry (\d+) units\. (\d+) are already aboard/))) return { kind: 'cargo', target: +m[1] - +m[2], key: m[0] };
  // The wider arithmetic (D148).
  if ((m = t.match(/Two orders: (\d+) crates for the crew, (\d+) for the roof/))) return { kind: 'cargo', target: +m[1] + +m[2], key: m[0] };
  if ((m = t.match(/from Floor (\d+), go (\d+) floors (up|down), then (\d+) floors (up|down)/))) return { kind: 'panel', target: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]), key: m[0] };
  if ((m = t.match(/First part done: Floor (\d+)\. Now (\d+) floors (up|down)/))) return { kind: 'panel', target: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]), key: m[0] };
  if ((m = t.match(/rode (\d+) floors (up|down) and got off here, on Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'up' ? +m[3] - +m[1] : +m[3] + +m[1], key: m[0] };
  if ((m = t.match(/(\d+) floors at a time\. The repair kit is at stop (\d+)/))) return { kind: 'panel', target: +m[1] * +m[2], key: m[0] };
  if ((m = t.match(/We're on Floor (\d+)\. The crew is on Floor (\d+)\. How many floors/))) return { kind: 'meter', target: Math.abs(+m[2] - +m[1]), key: m[0] };
  // The M8 jobs: a lamp pattern with a gap, the ten-floor express, calls in the order of travel.
  if ((m = t.match(/the hall lamps go ((?:\d+|\?)(?:, (?:\d+|\?))+)\. One lamp is out/))) {
    const terms = m[1].split(', ').map((x) => (x === '?' ? null : +x));
    const gap = terms.indexOf(null);
    const known = terms.findIndex((x, i) => x !== null && terms[i + 1] != null);
    const step = terms[known + 1] - terms[known];
    return { kind: 'panel', target: gap > 0 ? terms[gap - 1] + step : terms[gap + 1] - step, key: m[0] };
  }
  if ((m = t.match(/From Floor (\d+): one 10-floor jump (up|down), then (\d+) more floors/))) return { kind: 'panel', target: +m[1] + (m[2] === 'up' ? 1 : -1) * (10 + +m[3]), key: m[0] };
  if ((m = t.match(/From Floor (\d+): one jump of 10 floors (up|down)/))) return { kind: 'panel', target: +m[1] + (m[2] === 'up' ? 10 : -10), key: m[0] };
  if ((m = t.match(/from the bottom: one 10-floor jump up, then (\d+) more floors/))) return { kind: 'panel', target: 10 + +m[1], key: m[0] };
  if ((m = t.match(/Calls on Floors (\d+)(?:, (\d+))? and (\d+)\. Going (up|down) from Floor \d+, which do we reach (first|second|third)\?/))) {
    const calls = [m[1], m[2], m[3]].filter(Boolean).map(Number).sort((a, b) => (m[4] === 'up' ? a - b : b - a));
    return { kind: 'panel', target: calls[['first', 'second', 'third'].indexOf(m[5])], key: m[0] };
  }
  if ((m = t.match(/We've got a call on Floor (\d+)/))) return { kind: 'panel', target: +m[1], key: m[0] };
  if (/Take us to Floor 15/.test(t)) return { kind: 'panel', target: 15, key: 'finale' };
  if (/Press DOOR OPEN to wake/.test(t)) return { kind: 'wake', key: 'wake' };
  return null;
}

/** The in-world completion: Lifty's rank line (first time) or the replay line. There is no card. */
const COMPLETE = /Engineer Rank 1\. Your Engineer Log is on the clipboard|is running again\. Ride anywhere/;

async function playToEnd(page, { reloadAfterJobs }) {
  let done = 0;
  let last = '';
  let reloaded = false;
  let nextJobs = 0;
  const read = [];
  let clued = false;
  let missed = false;
  const maybeReload = async () => {
    if (reloaded || done !== reloadAfterJobs) return;
    // Wait for the commit, then reload: the save must bring us back to the next job.
    await page.waitForTimeout(9000);
    step(`reload after ${done} actions`);
    await page.reload({ waitUntil: 'load' });
    reloaded = true;
    last = '';
    await waitText(page, /Welcome back|We're on Floor|Floor \d+\. The toolbox|shaft map|beacon|loading dock|Load the car|got a call|Two orders|Two-part trip|got off here|Express service|Lamp check|Ten-floor express|Calls on Floors/);
  };
  for (let guard = 0; guard < 1500; guard++) {
    await page.waitForTimeout(250);
    const t = await text(page);
    if (COMPLETE.test(t)) {
      if (nextJobs < 5) throw new Error(`expected a NEXT JOB after each job, saw ${nextJobs}`);
      if (read.length !== 4 || !clued || !missed) throw new Error(`expected four reading jobs, one with CLUE and one missed once: ${JSON.stringify({ read, clued, missed })}`);
      return;
    }
    // A reading job (M8): its note is open. Read it, then answer it (see playReading).
    if (last !== 'reading' && (await visible(page.getByTestId('reading-note')))) {
      await page.waitForTimeout(400);
      const clue = !clued;
      const miss = clued && !missed;
      const item = await playReading(page, { clue, miss });
      clued ||= clue;
      missed ||= miss;
      read.push(`${item.id} (${item.words.mode})`);
      if (process.env.E2E_VERBOSE) step(`reading ${item.words.mode} ${item.id}${clue ? ' with CLUE' : ''}${miss ? ' after a miss' : ''}`);
      last = 'reading';
      done += 1;
      await maybeReload();
      continue;
    }
    // A success waits for the child (D122): nothing moves on until NEXT JOB is pressed.
    if (/NEXT JOB/.test(t)) {
      await page.waitForTimeout(400);
      await click(page, 'NEXT JOB');
      nextJobs += 1;
      last = '';
      continue;
    }
    const j = job(t);
    if (!j || j.key === last) continue;
    last = j.key;
    await page.waitForTimeout(500);
    if (j.kind === 'wake') await click(page, 'DOOR OPEN');
    else if (j.kind === 'meter') {
      for (let i = 0; i < j.target; i++) await click(page, 'More floors');
      await click(page, 'GO');
    } else if (j.kind === 'cargo') {
      for (let i = 0; i < j.target; i++) await click(page, 'Load crate');
      await click(page, 'DOOR CLOSE');
    } else await click(page, `Floor ${j.target}`);
    done += 1;
    if (process.env.E2E_VERBOSE) step(`${j.kind} ${j.target ?? ''}: ${j.key}`);
    await maybeReload();
  }
  throw new Error('Mission did not complete');
}

(async () => {
  const server = await serve(path.join(__dirname, '..', 'dist-web'), 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchBrowser();
  const preset = process.env.E2E_TOUCH ? 'fire-hd8' : 'ipad';
  const failures = [];
  const errors = [];
  const external = [];
  const newContext = async () => {
    const ctx = await browser.newContext({
      // Same approximate logical window as the Fire HD 8 preset, not its physical pixels.
      viewport: process.env.E2E_TOUCH ? { width: 960, height: 600 } : { width: 1180, height: 820 },
      hasTouch: !!process.env.E2E_TOUCH,
      reducedMotion: process.env.E2E_REDUCED ? 'reduce' : 'no-preference',
    });
    // Installation assets are served locally; gameplay must never need another origin.
    await ctx.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(base) || /^(data|blob):/.test(url)) return route.continue();
      external.push(url);
      return route.abort();
    });
    ctx.on('page', (p) => p.on('pageerror', (e) => errors.push({ name: e.name, message: e.message })));
    return ctx;
  };
  const check = async (name, fn) => {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failures.push(name);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  };

  const context = await newContext();
  const page = await context.newPage();

  await check('Floor 15 plays end to end in the browser, with a reload mid-mission', async () => {
    await page.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(page, /Press DOOR OPEN to wake/);
    await playToEnd(page, { reloadAfterJobs: 4 });
  });

  await check('completion persists after a reload: free ride at the restored floor, with the rank plate', async () => {
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /The lift is all yours/);
    await waitText(page, /ENGINEER RANK 1/);
    if (/MISSION COMPLETE/.test(await text(page))) throw new Error('a completion card is still shown');
  });

  await check('exploration: touch two landings, read them in the Engineer Log, and keep them after a reload', async () => {
    await click(page, firstSpotLabel(15));
    await waitText(page, /Primary power\. The core is running again/);
    await click(page, 'Floor 6');
    await waitText(page, /Try tapping the traction motor wheel/);
    await click(page, firstSpotLabel(6));
    await waitText(page, /This motor turns the big wheel/);
    await page.waitForTimeout(1500); // let the world-memory write land
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /The lift is all yours/);
    await click(page, 'Engineer Log');
    await waitText(page, /ENGINEER LOG/);
    await waitText(page, /The sheave moves the cables/);
    await waitText(page, /This core sends power/);
    if (/These fans move fresh air/.test(await text(page))) throw new Error('an undiscovered fact is shown');
    await click(page, 'CLOSE');
  });

  await check('replay from the Engineer Log returns to a usable new mission', async () => {
    await click(page, 'Engineer Log');
    await waitText(page, /ENGINEER LOG/);
    await click(page, 'RUN FLOOR 15 AGAIN');
    await waitText(page, /Press DOOR OPEN to wake/);
    await click(page, 'DOOR OPEN');
    await waitText(page, /We've got a call on Floor/);
  });

  await check('start over from the options sheet: a fresh game after replay, still fresh after a reload (D143)', async () => {
    await click(page, 'Settings');
    await page.getByText('Start over (clear progress)', { exact: true }).click();
    await page.getByText('Press again to clear progress and start over', { exact: true }).click();
    await waitText(page, /Press DOOR OPEN to wake/);
    if (/ENGINEER RANK 1/.test(await text(page))) throw new Error('the rank plate survived the start over');
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /Press DOOR OPEN to wake/);
    if (/The lift is all yours/.test(await text(page))) throw new Error('the finished save came back after a reload');
  });

  const dev = await context.newPage();
  await check('the default learner is untouched by the developer tools, and test learners start empty', async () => {
    // Same browser profile, same save. The tools open a test learner, not the default one.
    await dev.goto(`${base}?open=devtools&preset=${preset}&learner=learner-test-a`, { waitUntil: 'load' });
    await page.close(); // one tab at a time (the save is held by one page)
    await dev.reload({ waitUntil: 'load' });
    await waitForStatus(dev, 'game');
    await waitText(dev, /attempts\s+0 · mission completions 0/);
    await waitText(dev, /unlocks\s+none/);
  });

  // A practice miss is corrected on the learner's own job (D149): the board, then a fresh job. The
  // missed job is the one record (written by the runtime when the correction ends, not by the tools).
  await check('a correction runs from the tools on the learner\'s own job, a fresh job follows, and only the miss is on record', async () => {
    await dev.getByLabel('Enter rescue (general)', { exact: true }).click();
    await waitForStatus(dev, 'scenario:rescue-generic');
    await waitText(dev, /LET'S COUNT/);
    await waitText(dev, /Correction \(their own job\): start \d+/);
    await dev.getByLabel('Answer the test run', { exact: true }).click();
    await waitForStatus(dev, 'answer test run');
    await waitText(dev, /New job\./, 30_000);
    await waitText(dev, /attempts\s+1 · mission completions 0/);
  });

  await check('the playtest report opens on web and names the simulated viewport', async () => {
    await dev.getByLabel('Open playtest report', { exact: true }).click();
    await waitText(dev, /Playtest report \(developer only, local\)/);
    await waitText(dev, /\(simulated\)/);
    await waitText(dev, /browser: /);
  });

  await check('calibration art loads in the browser and the art-drawn landing stays touchable', async () => {
    const art = [];
    dev.on('response', (r) => {
      if (r.url().includes('/assets/dev/art/')) art.push(r.status());
    });
    await dev.goto(`${base}?open=devtools&preset=${preset}&scenario=explore-15&art=calibration&overlay=hitboxes`, { waitUntil: 'load' });
    await waitForStatus(dev, 'scenario:explore-15');
    await dev.getByTestId('device-frame').getByLabel(firstSpotLabel(15), { exact: true }).click();
    await waitText(dev, /Primary power\. The core is running again/);
    const status = await dev.getByTestId('art-status').textContent();
    if (/Missing or failed/.test(status)) throw new Error(`art failed to load: ${status}`);
    if (art.length < 10 || art.some((code) => code !== 200)) throw new Error(`calibration art requests: ${art.join(', ')}`);
  });

  await check('a newer tab takes over the save; the older tab stops saving and says where the game is', async () => {
    // One browser profile, two tabs: the newest tab plays; the older one never overwrites it.
    const profile = await newContext();
    const older = await profile.newPage();
    await older.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(older, /Press DOOR OPEN to wake/);
    const newer = await profile.newPage();
    await newer.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(newer, /Press DOOR OPEN to wake/);
    if (/Saving did not work/.test(await text(newer))) throw new Error('the newer tab was refused');
    // The older tab is told at once, stops, and offers to take the game back.
    await waitText(older, /The game is open in another tab/);
    await click(newer, 'DOOR OPEN');
    await waitText(newer, /We're on Floor|Floor \d+\. The toolbox|got a call/);
    if (/Saving did not work/.test(await text(newer))) throw new Error('the newer tab could not save');
    // PLAY HERE in the older tab reloads it and takes the save back; the newer tab is told in turn.
    await older.getByText('PLAY HERE', { exact: true }).click();
    await waitText(older, /We're on Floor|Floor \d+\. The toolbox|got a call/);
    await waitText(newer, /The game is open in another tab/);
    await profile.close();
  });

  await check('an old delayed tab claim cannot stop the current save owner', async () => {
    const profile = await newContext();
    try {
      const older = await profile.newPage();
      await older.addInitScript(() => {
        const send = BroadcastChannel.prototype.postMessage;
        BroadcastChannel.prototype.postMessage = function (message) {
          window.releaseOldClaim = () => send.call(this, message);
        };
      });
      await older.goto(`${base}?open=quest`, { waitUntil: 'load' });
      await waitText(older, /Press DOOR OPEN to wake/);
      const newer = await profile.newPage();
      await newer.goto(`${base}?open=quest`, { waitUntil: 'load' });
      await waitText(newer, /Press DOOR OPEN to wake/);
      await waitText(older, /The game is open in another tab/);
      await older.evaluate(() => window.releaseOldClaim());
      // Allow the notification and its IndexedDB ownership check to settle.
      await newer.waitForTimeout(500);
      if (/The game is open in another tab/.test(await text(newer))) throw new Error('delayed claim stopped the newer owner');
      await click(newer, 'DOOR OPEN');
      await waitText(newer, /We're on Floor|Floor \d+\. The toolbox|got a call/);
    } finally {
      await profile.close();
    }
  });

  await check('every approved and pending image decodes at its declared dimensions', async () => {
    const root = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/manifest.json'), 'utf8'));
    const rights = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/rights.json'), 'utf8'));
    const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? files(path.join(dir, f.name)) : [path.join(dir, f.name)]);
    const exported = files(path.join(root, 'dist-web/assets'));
    for (const asset of manifest.assets) {
      if (rights.assets.find((r) => r.asset === asset.id)?.approval === 'rejected') continue;
      const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(root, 'assets/themes/elevator-quest/art', asset.file))).digest('hex');
      const file = exported.find((f) => path.basename(f).includes(md5));
      if (!file) throw new Error(`missing exported image: ${asset.id}`);
      const url = base + path.relative(path.join(root, 'dist-web'), file).split(path.sep).join('/');
      const size = await dev.evaluate(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        const size = [bitmap.width, bitmap.height];
        bitmap.close();
        return size;
      }, url);
      if (size[0] !== asset.width || size[1] !== asset.height) throw new Error(`${asset.id}: decoded ${size}, expected ${asset.width},${asset.height}`);
    }
  });

  await check('Review candidates render and preserve the landing interaction', async () => {
    await dev.goto(`${base}?open=devtools&preset=${preset}&scenario=explore-15&art=review`, { waitUntil: 'load' });
    await waitForStatus(dev, 'scenario:explore-15');
    await dev.getByTestId('device-frame').getByLabel(firstSpotLabel(15), { exact: true }).click();
    await waitText(dev, /Primary power\. The core is running again/);
    const status = await dev.getByTestId('art-status').textContent();
    if (/Missing or failed/.test(status)) throw new Error(`Review art failed: ${status}`);
  });

  await check('reading on an illustrated landing: a touch job is answered by touching the thing; a landing that cannot offer every thing answers it with cards', async () => {
    const frame = dev.getByTestId('device-frame');
    // Floor 13 (Review art): every thing the note names is on the art, so the things are touched there.
    await dev.goto(`${base}?open=devtools&preset=${preset}&scenario=read-touch&art=review`, { waitUntil: 'load' });
    await waitForStatus(dev, 'scenario:read-touch');
    const item = noteItem(await frame.getByTestId('reading-note').innerText());
    if (item.words.mode !== 'touch') throw new Error(`${item.id} is not a touch job`);
    await checkNoAnswerShown(dev, item);
    await tap(frame.getByTestId('reading-note-close'));
    await waitVisible(dev, [frame.getByTestId(`landing-touch-${item.correct}`)], 'the thing to touch on the landing');
    if (await visible(frame.getByTestId('reading-choices'))) throw new Error('cards shown although every thing is on the art');
    for (const other of item.wrong) if (!(await visible(frame.getByTestId(`landing-touch-${other}`)))) throw new Error(`${other} cannot be touched: the job would show the answer by elimination`);
    await tap(frame.getByTestId(`landing-touch-${item.correct}`));
    await waitVisible(dev, [frame.getByLabel('NEXT JOB', { exact: true })], 'NEXT JOB after the touch');
    // The lobby (Review art): the plant and the bench are not drawn on it, so the same job takes cards.
    await dev.goto(`${base}?open=devtools&preset=${preset}&scenario=read-touch-cards&art=review`, { waitUntil: 'load' });
    await waitForStatus(dev, 'scenario:read-touch-cards');
    await tap(frame.getByTestId('reading-note-open'));
    const lobby = noteItem(await (await waitVisible(dev, [frame.getByTestId('reading-note')], 'the note')).innerText());
    await tap(frame.getByTestId('reading-note-close'));
    await waitVisible(dev, [frame.getByTestId(`reading-choice-${lobby.correct}`)], 'the cards');
    if (await frame.locator('[data-testid^="landing-touch-"]').count()) throw new Error('a lobby thing is touchable although the job is on the cards');
    await tap(frame.getByTestId(`reading-choice-${lobby.correct}`));
    await waitVisible(dev, [frame.getByLabel('NEXT JOB', { exact: true })], 'NEXT JOB after the card');
  });

  await check('failed illustrated images leave the vector game operable', async () => {
    const profile = await newContext();
    let blocked = 0;
    try {
      await profile.route(/\/assets\/.*\.(png|webp)(\?|$)/, (route) => {
        blocked += 1;
        return route.abort();
      });
      const fallback = await profile.newPage();
      await fallback.goto(`${base}?open=quest`, { waitUntil: 'load' });
      await waitText(fallback, /Press DOOR OPEN to wake/);
      await click(fallback, 'DOOR OPEN');
      await waitText(fallback, /We've got a call on Floor/);
      if (blocked < 2) throw new Error(`did not exercise failed image requests (${blocked})`);
    } finally {
      await profile.close();
    }
  });

  await browser.close();
  server.close();
  // Expo's web player does not catch the browser's rejected play() promise when pause()
  // cancels it. That AbortError is expected during scene cleanup; other errors still fail.
  const real = errors.filter((e) => !/play\(\) failed because the user didn't interact/.test(e.message)
    && !(e.name === 'AbortError' && /^The play\(\) request was interrupted by (a call to pause\(\)|a new load request)\./.test(e.message)));
  if (errors.length !== real.length) console.log(`expected browser media interruptions: ${errors.length - real.length}`);
  if (real.length) console.log(`page errors:\n${real.slice(0, 10).map((e) => `${e.name}: ${e.message}`).join('\n')}`);
  if (external.length) console.log(`unexpected external requests:\n${external.join('\n')}`);
  if (failures.length || real.length || external.length) process.exit(1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
