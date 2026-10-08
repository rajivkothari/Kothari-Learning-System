/* global __dirname */
// Playing the mini-games (M9) in a browser page, as a child would, for scripts/web-e2e.js and
// scripts/web-screenshots.js. Every move is a tap on what the screen shows (tiles, aim, power, PUTT,
// crates, sacks and boxes, WEIGH). The spelled word and the right load are worked out from the item
// (content data by the item's word id; the load from the item's numbers), never read off the screen:
// the screen never shows them before they are given.
//   - the e2e probe (minigames/hostProbe.web.ts, ?e2e=1) gives the item's prompt fields;
//   - a scripted session (the dev tools' -mock scenarios) has known items (devMocks.ts).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

/** wordId -> the word, from the spelling pack (the item names its word only by id). */
const WORDS = new Map(json('content/packs/spelling.json').activities.flatMap((a) => a.params.words.map((w) => [w.id, w.word])));
const CARGO_COPY = json('content/themes/elevator-quest/minigames/cargo.json').copy;
const GOLF_COPY = json('content/themes/elevator-quest/minigames/golfCourses.json').copy;

const tap = (locator) => (process.env.E2E_TOUCH ? locator.tap() : locator.click());
const byTest = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const isVisible = async (locator) => (await locator.count()) > 0 && (await locator.first().isVisible());

async function waitFor(page, what, fn, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await page.waitForTimeout(150);
  }
}

/** The e2e probe (?e2e=1): a read-only look at the session. */
const probe = (page, fn, arg) => page.evaluate(([f, a]) => globalThis.__eqProbe[f](a), [fn, arg ?? null]);

/** The word for a spelling item's prompt (its word id). */
function wordFor(prompt) {
  const w = WORDS.get(String(prompt.wordId));
  if (!w) throw new Error(`no word for word id ${prompt.wordId}`);
  return w;
}

/** Place the word's letters from the tray, tile by tile, then CHECK. */
async function spell(page, word) {
  for (const letter of word) {
    const id = await page.evaluate((l) => {
      const tiles = [...document.querySelectorAll('[data-testid^="wg-tile-"]')];
      const t = tiles.find((el) => (el.getAttribute('aria-label') ?? '').toLowerCase() === `letter ${l}`.toLowerCase() && el.getAttribute('aria-disabled') !== 'true');
      return t?.getAttribute('data-testid') ?? null;
    }, letter);
    if (!id) throw new Error(`no free tile for "${letter}"`);
    await tap(byTest(page, id));
    await page.waitForTimeout(80);
  }
  await tap(byTest(page, 'wg-check'));
}

/**
 * The cup as drawn: the largest round, near-black blob on the course (a PNG of the course box,
 * decoded in the page). Its centre in page coordinates, or null.
 */
async function cupIn(page) {
  const box = await byTest(page, 'wg-course').boundingBox();
  if (!box) return null;
  const png = await page.screenshot({ clip: box });
  const found = await page.evaluate(async (b64) => {
    const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height);
    const g = c.getContext('2d');
    g.drawImage(bm, 0, 0);
    const { width, height, data } = g.getImageData(0, 0, bm.width, bm.height);
    const dark = (x, y) => {
      const i = (y * width + x) * 4;
      return Math.max(data[i], data[i + 1], data[i + 2]) < 45;
    };
    const seen = new Uint8Array(width * height);
    let best = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (seen[y * width + x] || !dark(x, y)) continue;
        const stack = [[x, y]];
        seen[y * width + x] = 1;
        let n = 0, sx = 0, sy = 0, x0 = x, x1 = x, y0 = y, y1 = y;
        while (stack.length) {
          const [px, py] = stack.pop();
          n += 1; sx += px; sy += py;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= width || qy >= height || seen[qy * width + qx] || !dark(qx, qy)) continue;
            seen[qy * width + qx] = 1;
            stack.push([qx, qy]);
          }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        // Round and filled, not the frame's dark edge or a long shadow.
        if (n < 25 || w > width * 0.3 || h > height * 0.3 || Math.abs(w - h) > Math.max(4, 0.35 * Math.max(w, h)) || n < 0.55 * w * h) continue;
        if (!best || n > best.n) best = { n, x: sx / n, y: sy / n, w, h };
      }
    }
    return best;
  }, png.toString('base64'));
  return found ? { x: box.x + found.x, y: box.y + found.y, size: found.w } : null;
}

/** Aim at the cup the way the screen offers it ("touch the green where the ball should go"). */
async function aimAtCup(page) {
  const cup = await cupIn(page);
  if (!cup) throw new Error('no cup found on the course');
  const course = byTest(page, 'wg-course');
  const box = await course.boundingBox();
  await course.click({ position: { x: cup.x - box.x, y: cup.y - box.y } });
  await page.waitForTimeout(120);
  return cup;
}

/** Set the power meter to `p` (0..1) by touching it there. */
async function setPower(page, p) {
  const meter = byTest(page, 'wg-power-meter');
  const box = await meter.boundingBox();
  if (!box) throw new Error('no power meter');
  await meter.click({ position: { x: Math.max(1, Math.min(box.width - 1, box.width * p)), y: box.height / 2 } });
}

const panelPhase = async (page) => {
  for (const ph of ['aim', 'rolling', 'sunk', 'earned', 'intro']) if (await isVisible(page.locator(`[data-testid="wg-panel-${ph}"]`))) return ph;
  if (await isVisible(page.locator('[data-testid="wg-summary"]'))) return 'summary';
  return null;
};

/** The course's pixels (a PNG of the course box). */
async function coursePng(page) {
  const box = await byTest(page, 'wg-course').boundingBox();
  return page.screenshot({ clip: box });
}

/** How many pixels differ between two same-size PNGs (decoded in the page). */
async function pixelsChanged(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const read = async (b64) => {
      const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bm.width, bm.height);
      const g = c.getContext('2d');
      g.drawImage(bm, 0, 0);
      return g.getImageData(0, 0, bm.width, bm.height);
    };
    const [p, q] = [await read(x), await read(y)];
    if (p.width !== q.width || p.height !== q.height) return -1;
    let n = 0;
    for (let i = 0; i < p.data.length; i += 4) if (Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2]) > 60) n += 1;
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
}

/**
 * Putt until the ball drops: aim at the flag, pick a power, PUTT, then follow the screen's note (a
 * little short: more power; too fast: less). MOVE CLOSER is taken when the game offers it. Returns
 * the putts, and for the first putt how many course pixels changed while the ball rolled.
 */
async function playHole(page, { maxPutts = 16, power = 0.45 } = {}) {
  let putts = 0;
  let moved = null;
  for (;;) {
    const phase = await waitFor(page, 'the putting panel', async () => {
      const ph = await panelPhase(page);
      return ph && ph !== 'rolling' ? ph : null;
    }, 30_000);
    if (phase === 'sunk' || phase === 'summary') return { putts, moved, phase };
    const closer = page.getByLabel(/^MOVE CLOSER/i);
    if (await isVisible(closer)) {
      await tap(closer.first());
      await page.waitForTimeout(400);
      continue;
    }
    if (phase !== 'aim') throw new Error(`the panel shows "${phase}" before a putt`);
    if (putts >= maxPutts) throw new Error(`no hole in ${maxPutts} putts`);
    const note = (await isVisible(page.locator('[data-testid="wg-note"]'))) ? await byTest(page, 'wg-note').innerText() : '';
    if (note === GOLF_COPY.short) power += 0.08;
    else if (note === GOLF_COPY.tooFast || note === GOLF_COPY.out) power -= 0.08;
    power = Math.max(0.12, Math.min(0.95, power));
    await aimAtCup(page);
    await setPower(page, power);
    const before = putts === 0 ? await coursePng(page) : null;
    await tap(byTest(page, 'wg-putt'));
    putts += 1;
    if (before) {
      await waitFor(page, 'the ball rolling', async () => (await panelPhase(page)) !== 'aim', 10_000);
      await page.waitForTimeout(250);
      moved = await pixelsChanged(page, before, await coursePng(page));
    }
  }
}

/** The load that answers a cargo item, worked out from its numbers as the brief gives them. */
function cargoValue(prompt) {
  const n = (k) => (typeof prompt[k] === 'number' ? prompt[k] : null);
  switch (prompt.kind) {
    case 'exactLoad':
      return n('target');
    case 'capacityRemaining':
      return n('capacity') - n('loaded');
    case 'missingAmount':
      return n('order') - n('have');
    case 'twoDeliveries':
      return n('a') + n('b');
    case 'compare':
      return Math.abs(n('a') - n('b'));
    case 'twoStep':
      return n('capacity') - n('a') - n('b');
    default:
      throw new Error(`unknown cargo kind ${prompt.kind}`);
  }
}

/** Load `value` the way the screen offers it: crates that add up to it, or 10 kg sacks and 1 kg boxes. */
async function loadCargo(page, value) {
  const crates = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="dock-crate-"]')].map((el) => ({ id: el.getAttribute('data-testid'), weight: Number((el.getAttribute('aria-label') ?? '').match(/(\d+)/)?.[1] ?? NaN) })),
  );
  if (crates.length) {
    // The crates that make the total (each subset tried, smallest first).
    for (let mask = 1; mask < 1 << crates.length; mask++) {
      const pick = crates.filter((_, i) => mask & (1 << i));
      if (pick.reduce((s, c) => s + c.weight, 0) === value) {
        for (const c of pick) {
          await tap(byTest(page, c.id));
          await page.waitForTimeout(120);
        }
        return { crates: pick.map((c) => c.weight) };
      }
    }
    throw new Error(`no crates make ${value}: ${crates.map((c) => c.weight).join(', ')}`);
  }
  const sacks = Math.floor(value / 10);
  const boxes = value % 10;
  for (let i = 0; i < sacks; i++) {
    await tap(byTest(page, 'dock-sacks'));
    await page.waitForTimeout(60);
  }
  for (let i = 0; i < boxes; i++) {
    await tap(byTest(page, 'dock-boxes'));
    await page.waitForTimeout(60);
  }
  return { sacks, boxes };
}

/** WEIGH, then wait for the freight to leave and NEXT DELIVERY (or ALL DONE) to show. */
async function weighAndShip(page) {
  await tap(byTest(page, 'cargo-weigh'));
  await waitFor(page, 'the freight run and NEXT DELIVERY', async () => (await isVisible(page.getByLabel(CARGO_COPY.buttons.next, { exact: true }))) || (await isVisible(page.getByLabel(CARGO_COPY.buttons.finish, { exact: true }))), 40_000);
}

module.exports = { WORDS, CARGO_COPY, GOLF_COPY, probe, wordFor, spell, cupIn, aimAtCup, setPower, playHole, panelPhase, cargoValue, loadCargo, weighAndShip, pixelsChanged, coursePng, waitFor };
