#!/usr/bin/env node
/* global __dirname, Buffer */
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
// 6. Rooftop golf (M8.1), read from the pixels: during a job that waits at Floor 20, the golf ball is
//    found where it is drawn, tapped there, and followed frame by frame: it leaves at once, rolls to
//    the hole, drops out of sight, and comes back to where it started. On the illustrated landing and
//    on the vector one. (Before M8.1 nothing on a landing reacted while a job waited.)
// 7. The floor walkthrough (M8.2), production art, iPad landscape, one free ride on a fresh test
//    learner: for each floor visited, from the page (never from the data alone): the art hook in
//    CabinScene says the floor's background drew (`landing-art:<floor>:art`, not "vector" or
//    "loading"), the developer tools' art line lists no failed image, the live sign reads the
//    catalog's "<floor> · <NAME>" (a vector landing shows the bare name), whole (on one or two lines,
//    never cut off), the doorway's canvas is as
//    rich as a painting (hundreds of colours; a vector landing has a few dozen flat bands), every
//    explore spot is touchable as `landing-spot-<object>` inside the doorway, and a touch there changes
//    the drawn thing inside that touch area within E2E_REACT_MS (CDP screencast, canvases only: the
//    DOM rings and words hidden); the first touch in free ride is a discovery (Lifty's line). No
//    record is written (attempts, completions and unlocks in the developer panel are unchanged), and
//    no two floors share a sign. By default it visits one floor in five; E2E_FLOORS=all visits every
//    catalog floor (about seven minutes), E2E_FLOORS=3,4,8 those floors. Then once during a job
//    (`golf-job`, D161): the same checks, the touch quiet (no line, no NEXT JOB, the job still on).
// Options: E2E_ONLY=<words> runs only the checks whose name contains them; E2E_DIST=<dir> serves
// another export than dist-web; E2E_REACT_MS, E2E_MIN_COLOURS tune the walkthrough.
// The math answers are worked out from Lifty's on-screen line (the givens), as a person would. A
// reading job is recognised from its note's words, and its answer comes from the content data
// (content/packs/reading.json: item id -> right value), never from the screen.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');
const { LANDING_FLOORS, signFor, landingNow, rideToFloor, waitForLandingArt } = require('./lib/landingWalk');

const step = (m) => console.log(`- ${m}`);
const ROOT = path.join(__dirname, '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

// Reading items (M8): the right value and the wrong options from the pack, the words from the theme.
const READING_WORDS = json('content/themes/elevator-quest/reading.json').items;
const READING_ITEMS = json('content/packs/reading.json').activities.flatMap((a) =>
  a.params.items.map((it) => ({ id: it.id, correct: it.correct, wrong: it.distractors.map((d) => d.value), words: READING_WORDS[it.id] })),
);
/** A landing's first exploration spot, and what it is called before it is found (content/landings.ts spotLabel). */
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

/**
 * Small white discs on green (the golf ball), in a PNG of the device frame, decoded in the page (no
 * image library needed). Each: centre, pixel count, size.
 */
async function ballsIn(page, png) {
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = canvas.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    const { width, height, data } = g.getImageData(0, 0, bitmap.width, bitmap.height);
    const white = (x, y) => {
      const i = (y * width + x) * 4;
      return Math.min(data[i], data[i + 1], data[i + 2]) > 200 && Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 45;
    };
    const seen = new Uint8Array(width * height);
    const out = [];
    for (let y = Math.floor(height * 0.3); y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (seen[y * width + x] || !white(x, y)) continue;
        const stack = [[x, y]];
        seen[y * width + x] = 1;
        let n = 0, sx = 0, sy = 0, x0 = x, x1 = x, y0 = y, y1 = y;
        while (stack.length) {
          const [px, py] = stack.pop();
          n += 1;
          sx += px;
          sy += py;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          y0 = Math.min(y0, py);
          y1 = Math.max(y1, py);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= width || qy >= height || seen[qy * width + qx] || !white(qx, qy)) continue;
            seen[qy * width + qx] = 1;
            stack.push([qx, qy]);
          }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (n < 6 || w > 40 || h > 40 || n < 0.45 * w * h || Math.abs(w - h) > Math.max(3, 0.5 * Math.max(w, h))) continue;
        // On the green: most of a ring around it is green.
        const cx = sx / n, cy = sy / n, r = Math.max(w, h) / 2 + 3;
        let green = 0, total = 0;
        for (let a = 0; a < 24; a++) {
          const qx = Math.round(cx + r * Math.cos((a / 12) * Math.PI)), qy = Math.round(cy + r * Math.sin((a / 12) * Math.PI));
          if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
          const i = (qy * width + qx) * 4;
          total++;
          if (data[i + 1] > data[i] + 8 && data[i + 1] > data[i + 2] + 8) green++;
        }
        if (total && green / total >= 0.6) out.push({ x: cx, y: cy, n });
      }
    }
    // Not lettering (a sign's white letters sit in a row on its plate): a ball is on its own.
    return out.filter((b) => out.filter((o) => o !== b && Math.abs(o.y - b.y) < 4 && Math.abs(o.x - b.x) < 60).length < 2);
  }, png.toString('base64'));
}

/**
 * Tap the golf ball where it is drawn and follow it in the screencast for ~4.4 s. Returns the
 * ball's start and, per frame, its time after the tap and where it is (null: out of sight).
 */
async function followPutt(page) {
  const frame = page.getByTestId('device-frame');
  const fb = await frame.boundingBox();
  const balls = await ballsIn(page, await page.screenshot({ clip: fb }));
  if (balls.length !== 1) throw new Error(`expected one golf ball on the green, found ${balls.length}: ${JSON.stringify(balls)}`);
  const start = balls[0];
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, at: f.metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(200);
  const tappedAt = Date.now();
  if (process.env.E2E_TOUCH) await page.touchscreen.tap(fb.x + start.x, fb.y + start.y);
  else await page.mouse.click(fb.x + start.x, fb.y + start.y);
  await page.waitForTimeout(4400);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const viewport = page.viewportSize();
  const track = [];
  let last = start;
  for (const f of frames) {
    const t = Math.round(f.at - tappedAt);
    if (t < 0) continue;
    // The screencast is the whole viewport: crop it to the device frame in the page.
    const crop = await page.evaluate(async ([b64, box, vw]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const k = bitmap.width / vw;
      const canvas = new OffscreenCanvas(Math.round(box.width), Math.round(box.height));
      canvas.getContext('2d').drawImage(bitmap, box.x * k, box.y * k, box.width * k, box.height * k, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, [f.data, fb, viewport.width]);
    const found = await ballsIn(page, Buffer.from(crop, 'base64'));
    // The ball is the disc nearest where it was last seen (it moves a little each frame).
    const near = found.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y))[0] ?? null;
    track.push({ t, at: near ? { x: Math.round(near.x), y: Math.round(near.y) } : null });
    if (near) last = near;
  }
  return { start, track };
}

/** The putt as the learner sees it: away at once, to the hole, out of sight in it, then back at rest. */
function checkPutt({ start, track }, label) {
  const away = (p) => (p ? Math.hypot(p.x - start.x, p.y - start.y) : null);
  const say = () => `${label}: ${JSON.stringify(track.map((f) => [f.t, f.at && [f.at.x, f.at.y]]))}`;
  if (track.length < 8) throw new Error(`too few frames to follow the ball (${track.length}). ${say()}`);
  // Leaves at once: visibly moved in a frame within 700 ms of the tap (slow software rendering allowed).
  if (!track.some((f) => f.t <= 700 && away(f.at) >= 4)) throw new Error(`the ball did not move at once. ${say()}`);
  // Rolls to the hole: it gets far from where it rested.
  const farthest = Math.max(...track.map((f) => away(f.at) ?? 0));
  if (farthest < 40) throw new Error(`the ball did not roll to the hole (farthest ${Math.round(farthest)} px). ${say()}`);
  // Drops in: out of sight for a while after the roll.
  if (!track.some((f) => f.t > 1300 && f.t < 3000 && f.at === null)) throw new Error(`the ball never dropped out of sight. ${say()}`);
  // Comes back to rest where it started.
  const end = track.filter((f) => f.t >= 4000);
  if (!end.length || end.some((f) => !f.at || away(f.at) > 3)) throw new Error(`the ball is not back at rest. ${say()}`);
}

// ---------- the floor walkthrough (M8.2): every floor illustrated, named, reacting, nothing recorded ----------

/** Which floors the walkthrough visits: E2E_FLOORS=all (every catalog floor), a list (3,4,8), or a sample of one in five. */
function walkFloors() {
  const all = LANDING_FLOORS.map((f) => f.floor).sort((a, b) => a - b);
  const want = process.env.E2E_FLOORS;
  if (want === 'all' || want === '1') return all;
  if (want) return want.split(',').map(Number).filter((f) => all.includes(f));
  return all.filter((_, i) => i % 5 === 0);
}
/** Walkthrough thresholds. A touch must show within REACT_MS (a frame after the tap; slower is a failure). */
const WALK = {
  // The aim is about 150 ms; this headless, software-rendered Chromium measures 100 to 220 ms for a
  // healthy reaction (eased starts move a few pixels first), with an occasional stalled frame: a slow touch
  // is filmed once more, and fails only when it is slow twice. E2E_REACT_MS=150 for the strict aim.
  REACT_MS: Number(process.env.E2E_REACT_MS ?? 250),
  /** A pixel has changed when one channel moved this much (screencast PNGs are exact; this ignores dithering). */
  PIXEL_TOL: 24,
  /** A reaction changes at least this many pixels in the thing's touch area, and well above the idle change before the tap. */
  MIN_CHANGED: 10,
  /** An illustrated doorway is rich: at least this many distinct colours (4 bits a channel). A vector landing is a few flat bands. */
  MIN_COLOURS: Number(process.env.E2E_MIN_COLOURS ?? 250),
  /** Room for the iPad landscape frame and the panel, and no more: a smaller page films faster. */
  viewport: { width: 1640, height: 940 },
  /** Long enough for the slowest reaction to end before the next touch (a putt: roll, drop, rest, back). */
  settleAfter: (reaction) => (reaction === 'putt' ? 3800 : reaction === 'open' ? 700 : 1400),
};
/**
 * Only the Skia canvases show in the device frame: every DOM overlay (touch rings, Lifty's words, the
 * live sign, cards) is hidden, so a pixel change in a thing's box is the drawn landing's own. The touch
 * areas stay touchable (transparent, never hidden: a hidden element takes no touches).
 */
const CANVAS_ONLY = '[data-testid="device-frame"] * { visibility: hidden !important; } [data-testid="device-frame"] canvas { visibility: visible !important; } [data-testid^="landing-spot-"], [data-testid^="landing-touch-"] { visibility: visible !important; opacity: 0 !important; }';
async function canvasOnly(page, on) {
  await page.evaluate(([css, on]) => {
    document.getElementById('e2e-canvas-only')?.remove();
    if (!on) return;
    const s = document.createElement('style');
    s.id = 'e2e-canvas-only';
    s.textContent = css;
    document.head.appendChild(s);
  }, [CANVAS_ONLY, on]);
  await page.waitForTimeout(150);
}

/** Distinct colours (4 bits a channel) inside a box of a PNG of the page, counted in the page. */
async function colourCount(page, png, box) {
  return page.evaluate(async ([b64, box]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
    const g = c.getContext('2d');
    g.drawImage(bmp, box.x, box.y, box.width, box.height, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return seen.size;
  }, [png.toString('base64'), box]);
}

/**
 * Touch a thing where its touch area is and film the frame: returns, per screencast frame, its time
 * after the touch and how many pixels inside the touch area differ from the last frame before it.
 */
async function filmTouch(page, box, ms = 700) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, at: f.metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  // JPEG frames: much cheaper to encode than PNG, so filming slows the page less (an unchanged block encodes the same).
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
  await page.waitForTimeout(350);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  let touchedAt;
  if (process.env.E2E_TOUCH) {
    touchedAt = Date.now();
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.move(x, y);
    touchedAt = Date.now();
    await page.mouse.down();
    await page.mouse.up();
  }
  await page.waitForTimeout(ms);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  frames.sort((a, b) => a.at - b.at); // frames can arrive out of order after a stall
  const before = frames.filter((f) => f.at < touchedAt);
  const after = frames.filter((f) => f.at >= touchedAt);
  if (!before.length) throw new Error('no frame before the touch');
  const list = [...before.slice(-4), ...after];
  const counts = await page.evaluate(async ([frames, box, vw]) => {
    const read = async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const k = bmp.width / vw;
      const c = new OffscreenCanvas(Math.max(1, Math.round(box.width * k)), Math.max(1, Math.round(box.height * k)));
      c.getContext('2d').drawImage(bmp, box.x * k, box.y * k, box.width * k, box.height * k, 0, 0, c.width, c.height);
      bmp.close();
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    };
    const decoded = [];
    for (const f of frames.list) decoded.push(await read(f));
    const ref = decoded[decoded.length - 1 - frames.after];
    return decoded.map((d) => {
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.max(Math.abs(d[i] - ref[i]), Math.abs(d[i + 1] - ref[i + 1]), Math.abs(d[i + 2] - ref[i + 2])) > frames.tol) n++;
      return n;
    });
  }, [{ list: list.map((f) => f.data), after: after.length, tol: WALK.PIXEL_TOL }, box, page.viewportSize().width]);
  return list.map((f, i) => ({ t: Math.round(f.at - touchedAt), changed: counts[i] }));
}

/** When the touch first showed: the first frame after it that changed well above the idle change before it. */
function reactionTime(film) {
  const idle = Math.max(0, ...film.filter((f) => f.t < 0).map((f) => f.changed));
  const enough = Math.max(WALK.MIN_CHANGED, idle * 3);
  return { idle, enough, first: film.find((f) => f.t >= 0 && f.changed >= enough)?.t ?? null };
}

/** The developer panel's record counts for the test learner (Inspect > Refresh): attempts, completions, unlocks. */
async function records(page) {
  await page.getByLabel('Refresh', { exact: true }).click();
  await page.waitForTimeout(600);
  const t = await text(page);
  const counts = t.match(/attempts\s+(\d+) · mission completions (\d+)/);
  const unlocks = t.match(/unlocks\s+(.*?)\s+settings\s/);
  if (!counts || !unlocks) throw new Error('the developer panel shows no record counts');
  return `attempts ${counts[1]}, completions ${counts[2]}, unlocks ${unlocks[1]}`;
}

/**
 * One landing, checked from the page: the art drew (the art hook says so, the developer tools list no
 * failed image, the doorway is as rich as a painting), the live sign names this floor, every explore
 * spot is touchable as `landing-spot-<object>`, and a touch changes the drawn thing within REACT_MS.
 * `quiet`: a job waits (D161): the touch reacts, but says nothing and never moves the job on.
 * Returns the problems found (empty when the floor passes) and what it measured.
 */
async function checkLanding(page, floor, { quiet = false } = {}) {
  const entry = LANDING_FLOORS.find((f) => f.floor === floor);
  const problems = [];
  const frame = page.getByTestId('device-frame');
  // The art: the hook names this floor's background as drawn (it may still be loading for a moment).
  let l = await waitForLandingArt(page);
  if (l.floor !== floor) problems.push(`the landing shown is floor ${l.floor}`);
  if (l.state !== 'art') problems.push(`no illustrated landing: the art hook says "${l.state}" (vector fallback)`);
  await page.waitForTimeout(900); // the doors and the layers settle
  const status = (await page.getByTestId('art-status').textContent()) ?? '';
  if (/Missing or failed/.test(status)) problems.push(`an image failed: ${status.replace(/.*Missing or failed: /, '').replace(/\(vector shown\).*/, '').trim()}`);
  // The live sign: this floor's own name (and number, on an illustrated landing), in the open doorway.
  l = await landingNow(page);
  const sign = signFor(floor, entry.name);
  if (l.sign !== sign) problems.push(`the sign reads "${l.sign}", not "${sign}"`);
  if (l.signCut) problems.push(`the sign "${l.sign}" is cut off`);
  if (!l.signBox || !l.door || l.signBox.x < l.door.x - 1 || l.signBox.x + l.signBox.width > l.door.x + l.door.width + 1 || l.signBox.y < l.door.y - 1) problems.push(`the sign is not in the doorway (${JSON.stringify(l.signBox)})`);
  // The doorway, canvases only: a painting has hundreds of colours, the vector landing a few flat bands.
  await canvasOnly(page, true);
  const colours = l.door ? await colourCount(page, await page.screenshot(), l.door) : 0;
  await canvasOnly(page, false);
  if (colours < WALK.MIN_COLOURS) problems.push(`the doorway has ${colours} colours (vector landings have a few dozen; art at least ${WALK.MIN_COLOURS})`);
  const spots = [];
  for (const spot of entry.explore ?? []) {
    const id = `landing-spot-${spot.target}`;
    const hot = frame.getByTestId(id);
    const n = await hot.count();
    if (n !== 1) {
      problems.push(`${id}: ${n} on screen`);
      continue;
    }
    const box = await hot.boundingBox();
    if (!box || !l.door || box.x + box.width / 2 < l.door.x || box.x + box.width / 2 > l.door.x + l.door.width) {
      problems.push(`${id}: its touch area is not in the doorway (${JSON.stringify(box)})`);
      continue;
    }
    const before = await frame.innerText();
    await canvasOnly(page, true);
    let film = await filmTouch(page, box);
    let r = reactionTime(film);
    const slow = r.first === null || r.first > WALK.REACT_MS ? r.first : undefined;
    if (slow !== undefined) {
      // Once more (a stalled frame is the browser's, not the game's): slow twice is a failure.
      await page.waitForTimeout(WALK.settleAfter(spot.reaction));
      film = await filmTouch(page, box);
      r = reactionTime(film);
      if (slow !== null) r.first = r.first === null ? slow : Math.min(r.first, slow);
    }
    spots.push({ id: spot.id, reaction: spot.reaction, first: r.first, idle: r.idle, peak: Math.max(...film.map((f) => f.changed)) });
    if (process.env.E2E_VERBOSE) step(`floor ${floor} ${spot.id} (${spot.reaction}): ${JSON.stringify(film.map((f) => [f.t, f.changed]))}`);
    if (r.first === null) problems.push(`${spot.id} (${spot.reaction}): a touch changed nothing in its box within ${film.at(-1)?.t ?? 0} ms (idle ${r.idle} px, needed ${r.enough})`);
    else if (r.first > WALK.REACT_MS) problems.push(`${spot.id} (${spot.reaction}): the reaction showed after ${r.first} ms (over ${WALK.REACT_MS} ms)`);
    await page.waitForTimeout(WALK.settleAfter(spot.reaction));
    await canvasOnly(page, false);
    const after = await frame.innerText();
    // A first touch in free ride is a discovery: Lifty says its line. During a job it is quiet (D161).
    if (quiet) {
      if (after.includes(spot.line) || /NEXT JOB/.test(after)) problems.push(`${spot.id}: a touch during a job spoke or moved the job on`);
    } else if (!after.includes(spot.line) && !before.includes(spot.line) && !/inspected/i.test(await hot.getAttribute('aria-label'))) problems.push(`${spot.id}: no discovery after the touch`);
    if (spot.card && (await visible(page.getByTestId('reading-card-close')))) await tap(page.getByTestId('reading-card-close').first());
  }
  return { problems, colours, sign: l.sign, spots };
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
  const dist = process.env.E2E_DIST ? path.resolve(process.env.E2E_DIST) : path.join(__dirname, '..', 'dist-web');
  const server = await serve(dist, 0);
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
    if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
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
    const exported = files(path.join(dist, 'assets'));
    for (const asset of manifest.assets) {
      if (rights.assets.find((r) => r.asset === asset.id)?.approval === 'rejected') continue;
      const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(root, 'assets/themes/elevator-quest/art', asset.file))).digest('hex');
      const file = exported.find((f) => path.basename(f).includes(md5));
      if (!file) throw new Error(`missing exported image: ${asset.id}`);
      const url = base + path.relative(dist, file).split(path.sep).join('/');
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

  await check('rooftop golf during a job: the drawn ball rolls to the hole, drops in, and comes back (pixels; illustrated and vector)', async () => {
    for (const art of ['review', 'vector']) {
      const profile = await browser.newContext({ viewport: { width: 1800, height: 1500 }, hasTouch: !!process.env.E2E_TOUCH });
      try {
        const golf = await profile.newPage();
        golf.on('pageerror', (e) => errors.push({ name: e.name, message: e.message }));
        await golf.goto(`${base}?open=devtools&preset=ipad&orientation=landscape&scenario=golf-job&art=${art}`, { waitUntil: 'load' });
        await waitForStatus(golf, 'scenario:golf-job');
        await golf.waitForTimeout(1500); // the art in place, Lifty's words settled
        if (!/Going down from Floor 20/.test(await text(golf))) throw new Error(`${art}: not the rooftop job: ${(await text(golf)).slice(0, 300)}`);
        checkPutt(await followPutt(golf), art);
        // Still the job (in the game, not the tools beside it): no NEXT JOB, no discovery line.
        const game = (await golf.getByTestId('device-frame').innerText()).replace(/\s+/g, ' ');
        if (!/Going down from Floor 20/.test(game) || /NEXT JOB|Rooftop golf, at the very top/.test(game)) throw new Error(`${art}: the putt moved the job on or spoke: ${game.slice(0, 300)}`);
      } finally {
        await profile.close();
      }
    }
  });

  // The floor walkthrough (M8.2), from the page: one free ride to every floor visited, production art.
  const walked = walkFloors();
  await check(`walkthrough: every floor illustrated, its own name, its things react, nothing recorded (floors ${walked.join(', ')}${process.env.E2E_FLOORS ? '' : '; E2E_FLOORS=all for all of them'})`, async () => {
    const profile = await browser.newContext({ viewport: WALK.viewport, hasTouch: !!process.env.E2E_TOUCH });
    try {
      const walk = await profile.newPage();
      walk.on('pageerror', (e) => errors.push({ name: e.name, message: e.message }));
      // A fresh test learner, the mission completed by the tools (one completion record), then free ride.
      await walk.goto(`${base}?open=devtools&preset=ipad&orientation=landscape&scenario=floor-${walked[0]}&art=production`, { waitUntil: 'load' });
      await waitForStatus(walk, `scenario:floor-${walked[0]}`);
      const recorded = await records(walk);
      const problems = [];
      const signs = [];
      let warm = false;
      for (const floor of walked) {
        await rideToFloor(walk, floor, { touch: !!process.env.E2E_TOUCH });
        // One touch before any is timed: on a fresh page the first discovery stalls Linux Chromium for about
        // a second (a font lookup, docs/WEB_PLAYTEST.md "Known limitations"), which is not the game's latency.
        const first = LANDING_FLOORS.find((f) => f.floor === floor).explore?.[0];
        if (!warm && first) {
          const hot = walk.getByTestId('device-frame').getByTestId(`landing-spot-${first.target}`);
          if (await hot.count()) {
            await tap(hot.first());
            await walk.waitForTimeout(WALK.settleAfter(first.reaction));
            warm = true;
          }
        }
        const r = await checkLanding(walk, floor);
        signs.push(r.sign);
        if (process.env.E2E_VERBOSE) step(`floor ${floor}: ${r.colours} colours, sign "${r.sign}"${r.spots.map((x) => `, ${x.id} (${x.reaction}) at ${x.first} ms, ${x.peak} px`).join('')}`);
        problems.push(...r.problems.map((p) => `floor ${floor}: ${p}`));
      }
      if (new Set(signs).size !== signs.length) problems.push(`two floors share a sign: ${signs.join(' | ')}`);
      const now = await records(walk);
      if (now !== recorded) problems.push(`something was recorded on the walk: ${recorded} became ${now}`);
      if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    } finally {
      await profile.close();
    }
  });

  await check('walkthrough during a job: the landing where a job waits is illustrated and named, its things react quietly, nothing recorded (D161)', async () => {
    const profile = await browser.newContext({ viewport: WALK.viewport, hasTouch: !!process.env.E2E_TOUCH });
    try {
      const walk = await profile.newPage();
      walk.on('pageerror', (e) => errors.push({ name: e.name, message: e.message }));
      await walk.goto(`${base}?open=devtools&preset=ipad&orientation=landscape&scenario=golf-job&art=production`, { waitUntil: 'load' });
      await waitForStatus(walk, 'scenario:golf-job');
      const floor = (await landingNow(walk)).floor;
      const job = (await walk.getByTestId('device-frame').innerText()).replace(/\s+/g, ' ');
      const recorded = await records(walk);
      const r = await checkLanding(walk, floor, { quiet: true });
      if (!r.spots.length) r.problems.push('nothing to touch where the job waits');
      const game = (await walk.getByTestId('device-frame').innerText()).replace(/\s+/g, ' ');
      const line = job.match(/Going (up|down) from Floor \d+[^.?]*[.?]/)?.[0];
      if (!line || !game.includes(line)) r.problems.push(`the job is no longer on screen after the touches (${game.slice(0, 200)})`);
      const now = await records(walk);
      if (now !== recorded) r.problems.push(`something was recorded: ${recorded} became ${now}`);
      if (process.env.E2E_VERBOSE) step(`job at floor ${floor}: ${r.colours} colours, sign "${r.sign}"${r.spots.map((x) => `, ${x.id} (${x.reaction}) at ${x.first} ms, ${x.peak} px`).join('')}`);
      if (r.problems.length) throw new Error(`floor ${floor}:\n  ${r.problems.join('\n  ')}`);
    } finally {
      await profile.close();
    }
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
