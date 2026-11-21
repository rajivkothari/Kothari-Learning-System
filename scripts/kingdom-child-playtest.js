#!/usr/bin/env node
/* global __dirname */
// Child playtest harness for the Magical Kingdom's royal games (docs/magical-kingdom/REBUILD_SPEC.md "Checks").
//   npm run web:export   (only when the kingdom changed; this script never exports)
//   npm run web:kingdom-playtest
// Three scripted children play the browser build in Chromium (playwright-core, a touch screen), with every
// clip the page plays logged by name: when it started, when it stopped, and whether it played to its end or
// was cut. Nothing here can hear: it measures what plays and when.
//   listener  waits for the voice to go quiet, answers right, plays the toy once, then NEXT. Per game and for
//             the quest: seconds, seconds of listening before she can act on each turn, any clip cut.
//   masher    taps the first tappable thing the instant it is tappable and never listens (and keeps tapping a
//             held choice while nothing is tappable). Per game: seconds, taps, misses, clips started and
//             finished, and whether a committed answer ever came while an ask was still being said.
//   explorer  the crown (a quick tap, a two-second hold), presses of 80 ms to 3.5 s, taps on a choice, the
//             star and Help during a first telling (a rhyme ask, and two seconds into a story), the ear during
//             and after a telling, a drag of a picture, forty idle seconds (reminders against the end of
//             speech, and the ear's nudge after the last), two misses then SHOW ME, leaving mid-item and
//             coming back, the toy six times, NEXT twice, and the gift dialog's line.
//             Then the fixes of 2026-11-21, each from the games room: Help double-tapped in Chests (one rung, the
//             clue not cut, the record says clue); how to play interrupted by a tap (the picture is picked up); a
//             held tap answered by the Listen first badge; a story's pages lighting; the right letter
//             double-tapped in Bowling (no roll, "Now roll the ball" not cut); the star double-tapped (the
//             celebration not skipped); the story's answer printed under its own picture; the printed line in
//             the reading typeface; SHOW ME's gold tick; a reload on the end screen (the end screen again); More
//             games double-tapped (no game opens).
// With KP_SOUND=off nobody can play: the run checks that instead (every card held with the speaker-with-a-line
// picture, nothing starts, nothing is recorded; then, with sound on, a game is opened, Sound is switched off in
// the middle of its ask, the game pauses to the same picture, and the ask is said again when sound is back).
// It fails (exit 1) on: a press of up to 2900 ms that does not activate; a first telling cut by a tap on a
// choice, the star or Help; a reminder (any speech no touch asked for) that starts while a clip is playing; a
// masher answer committed while an ask is still being said; a game or quest a persona cannot finish; a gift
// line not heard to its end; a clip the page could not play (refused); a tap's tick cut short; any of the
// checks above; a page error.
// Answers come from content/themes/magical-kingdom/learning.json (never from the page, which never shows
// them); bowling and golf ask for the word's first letter. Learning records are read back from the page's
// own database image (IndexedDB) with sql.js after each persona.
// Options (environment):
//   KP_PERSONA=listener,masher,explorer   which children (default all three, run side by side)
//   KP_GAMES=bowling,golf,rhyme,sort,hop,story,quest   which games the listener and masher play (default all)
//   KP_SIZE=1180x820   window in CSS px            KP_STILL=1   Still pictures (Comfort, and the OS preference)
//   KP_SOUND=off       Sound off in Comfort before play
//   KP_SERIAL=1        one persona at a time (slower, steadier timing on a busy machine)
//   KP_DIST=<dir>      another export than dist-web     KP_OUT=<dir>   where the JSON and screenshots go
//   CHROMIUM_PATH      the Chromium to drive (default: Playwright's own, then installed Chrome)
const path = require('node:path');
const fs = require('node:fs');
const { serve } = require('./serve-web');

const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
const DIST = path.resolve(ROOT, process.env.KP_DIST ?? 'dist-web');
const OUT = path.resolve(process.env.KP_OUT ?? path.join(ROOT, 'web-screenshots', 'kingdom-playtest'));
const [W, H] = (process.env.KP_SIZE ?? '1180x820').split('x').map(Number);
const STILL = process.env.KP_STILL === '1';
const SOUND_OFF = process.env.KP_SOUND === 'off';
const PERSONAS = (process.env.KP_PERSONA ?? 'listener,masher,explorer').split(',').map((s) => s.trim()).filter(Boolean);
const GAMES = (process.env.KP_GAMES ?? 'bowling,golf,rhyme,sort,hop,story,quest').split(',').map((s) => s.trim()).filter(Boolean);
const LETTER = new Set(['bowling', 'golf']);
/** A gap inside a sequence is at most 750 ms (a story's sentences): quiet means nothing for longer than this. */
const QUIET_MS = 1100;
/** No game may take a child longer than this. */
const GAME_LIMIT_MS = 6 * 60_000;

const ITEMS = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/themes/magical-kingdom/learning.json'), 'utf8')).pack.activities
  .flatMap((a) => a.params?.items ?? []).map((it) => [it.id, String(it.correct?.value ?? it.correct)]));
const UI = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/themes/magical-kingdom/ui.json'), 'utf8'));
/** Clips that belong to an ask (what a child must hear before answering). How to play is a tail after the ask: a tap may interrupt it. */
const ASK_CLIP = /line\.(rhyme|sort|hop)\.ask|^games-v2:q\.|^games-v2:story\.|line\.story\.intro|^narration-v1:/;
const HOW_CLIP = /hearThenStar/;
const TICK_CLIP = /^effects-v1:(place|remove)$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
const failures = [];
const fail = (who, what) => { failures.push(`${who}: ${what}`); console.log(`  FAIL ${who}: ${what}`); };

// ---------------------------------------------------------------- in the page
function instrument() {
  const kp = { clips: [], touches: [], origin: performance.timeOrigin };
  window.__kp = kp;
  // Narration is fetched into blobs before it plays (audio/localSources.web.ts): remember where each came from.
  const from = new Map();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); try { Object.defineProperty(b, '__src', { value: this.url }); } catch { /* ignore */ } return b; };
  const create = URL.createObjectURL;
  URL.createObjectURL = function (o) { const u = create.call(URL, o); if (o && o.__src) from.set(u, o.__src); return u; };
  const name = (src) => {
    const s = decodeURIComponent((from.get(src) || src || '').split('?')[0]);
    const parts = s.split('/');
    const file = parts.pop() || '';
    const folder = parts.pop() || '';
    const m = file.match(/^(.*?)(\.[0-9a-f]{32})?\.(mp3|wav)$/);
    return `${folder}:${m ? m[1] : file}`;
  };
  const els = [];
  /** Clips whose element stopped without an event we saw: paused or emptied while still marked as playing. */
  const settle = () => {
    for (let i = els.length - 1; i >= 0; i--) {
      const [c, el] = els[i];
      if (c.how) { els.splice(i, 1); continue; }
      if (el.paused || !el.getAttribute('src')) { c.how = el.ended ? 'ended' : 'cut'; c.t1 = performance.now(); els.splice(i, 1); }
    }
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const c = { id: name(this.currentSrc || this.src), t0: performance.now(), t1: null, how: null, dur: null, rate: this.playbackRate };
    kp.clips.push(c);
    els.push([c, this]);
    const end = (how) => { if (c.how) return; c.how = how; c.t1 = performance.now(); c.dur = Number.isFinite(this.duration) ? this.duration : null; };
    this.addEventListener('ended', () => end('ended'));
    // A clip that plays out pauses just before it ends: a pause at its end is an ending, not a cut.
    this.addEventListener('pause', () => { if (this.ended || (Number.isFinite(this.duration) && this.currentTime >= this.duration - 0.08)) end('ended'); else end('cut'); });
    this.addEventListener('error', () => end('error'));
    // A clip stopped before it began (its source removed) may fire no pause: emptied and abort are cuts too.
    this.addEventListener('emptied', () => end('cut'));
    this.addEventListener('abort', () => end('cut'));
    const p = play.call(this);
    if (p && p.catch) p.catch((e) => end(`refused:${e && e.name}`));
    return p;
  };
  const touch = (type) => (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-testid]') : null;
    const q = (id) => !!document.querySelector(`[data-testid="${id}"]`);
    // What the touch could do: whether the control was held (aria-disabled), and whether a star or a printed word was up.
    kp.touches.push({ t: performance.now(), type, id: t ? t.getAttribute('data-testid') : null, off: t ? t.getAttribute('aria-disabled') === 'true' : null, star: q('choice-star'), played: q('game-word') });
  };
  document.addEventListener('touchstart', touch('start'), true);
  document.addEventListener('touchend', touch('end'), true);
  /** Everything the children look at, in one read. */
  window.__kpSettle = settle;
  window.__kpState = () => {
    const ids = {};
    const order = [];
    for (const e of document.querySelectorAll('[data-testid]')) {
      const id = e.getAttribute('data-testid');
      if (id in ids) continue;
      const r = e.getBoundingClientRect();
      ids[id] = { off: e.getAttribute('aria-disabled') === 'true', label: e.getAttribute('aria-label'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      order.push(id);
    }
    settle();
    const playing = kp.clips.filter((c) => !c.how).map((c) => c.id);
    const lastEnd = Math.max(0, ...kp.clips.map((c) => c.t1 ?? 0));
    return { t: performance.now(), ids, order, playing, lastEnd, clips: kp.clips.length };
  };
}

// ---------------------------------------------------------------- a child at a tablet
async function child(browser, base, who) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: false, reducedMotion: STILL ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  await page.addInitScript(instrument);
  const cdp = await ctx.newCDPSession(page);
  const c = { who, ctx, page, cdp, errors, taps: 0, log: [] };
  c.state = () => page.evaluate(() => window.__kpState());
  c.now = () => page.evaluate(() => performance.now());
  c.clips = () => page.evaluate(() => { window.__kpSettle(); return window.__kp.clips; });
  c.touches = () => page.evaluate(() => window.__kp.touches);
  c.note = (m) => c.log.push(m);
  c.has = async (id) => !!(await c.state()).ids[id];
  c.wait = async (what, fn, ms = 30_000, every = 100) => {
    const end = Date.now() + ms;
    for (;;) {
      const s = await c.state();
      const v = await fn(s);
      if (v) return v;
      if (Date.now() > end) throw new Error(`${who}: timed out waiting for ${what} (sounding: ${s.playing.join(" ") || "nothing"}; last end ${Math.round(s.t - s.lastEnd)} ms ago)`);
      await sleep(every);
    }
  };
  c.at = async (id) => {
    const s = await c.state();
    const e = s.ids[id];
    if (!e) throw new Error(`${who}: ${id} is not on screen`);
    return e;
  };
  c.tapAt = async (x, y) => { c.taps++; await page.touchscreen.tap(x, y); };
  c.tap = async (id) => { const e = await c.at(id); await c.tapAt(e.x, e.y); };
  /** A held press: touch down, wait, lift (CDP touch events, as a finger). */
  c.press = async (id, ms, dx = 0) => {
    const e = await c.at(id);
    c.taps++;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: e.x, y: e.y }] });
    if (dx) {
      for (let i = 1; i <= 10; i++) { await sleep(ms / 10); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: e.x + (dx * i) / 10, y: e.y + (dx * i) / 20 }] }); }
    } else await sleep(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  /** The browser allows sound only after a touch: touch the page away from every control. */
  c.wake = async () => { await page.touchscreen.tap(3, Math.round(H * 0.55)); await sleep(250); };
  c.open = async (query = '') => {
    await page.goto(`${base}?open=kingdom${query}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="kingdom-screen"]', { timeout: 120_000 });
    await c.wait('the kingdom to be ready', (s) => s.ids['open-games'] || s.ids['games-room'] || s.ids['game-room'] || s.ids['gift-dialog'], 60_000);
    await c.wake();
  };
  c.reload = async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="kingdom-screen"]', { timeout: 120_000 });
    await c.wait('the kingdom to be ready', (s) => s.ids['open-games'] || s.ids['games-room'] || s.ids['game-room'] || s.ids['gift-dialog'], 60_000);
    await c.wake();
  };
  /** Nothing has sounded for QUIET_MS (and nothing is sounding). Returns the state. */
  c.quiet = (ms = 60_000) => c.wait('the voice to go quiet', (s) => !s.playing.length && s.t - s.lastEnd >= QUIET_MS && s, ms);
  c.shot = async (name) => { fs.mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); return f; };
  /** Learning records and settings of every learner, read from the page's own database image. */
  c.records = async () => {
    const images = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('kothari-learning');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const idb = req.result;
        const out = [];
        const tx = idb.transaction('sqlite-images', 'readonly');
        const cur = tx.objectStore('sqlite-images').openCursor();
        cur.onsuccess = () => {
          const k = cur.result;
          if (!k) return resolve(out);
          const v = k.value;
          if (v instanceof Uint8Array || v instanceof ArrayBuffer) out.push({ key: String(k.key), bytes: Array.from(v instanceof Uint8Array ? v : new Uint8Array(v)) });
          k.continue();
        };
      };
    }));
    const SQL = await require(path.join(ROOT, 'node_modules/sql.js'))();
    const rows = [];
    const settings = [];
    for (const img of images) {
      const db = new SQL.Database(Uint8Array.from(img.bytes));
      try {
        const res = db.exec('SELECT type, mission_instance_id, occurred_at, payload FROM learning_events ORDER BY seq');
        for (const r of res[0]?.values ?? []) rows.push({ db: img.key, type: r[0], mission: r[1], at: r[2], ...JSON.parse(r[3]) });
        const st = db.exec('SELECT * FROM learner_settings');
        for (const r of st[0]?.values ?? []) settings.push(Object.fromEntries(st[0].columns.map((col, i) => [col, r[i]])));
      } catch (e) { rows.push({ db: img.key, error: String(e) }); }
      db.close();
    }
    return { rows, settings };
  };
  return c;
}

/** Wherever the child is, get to the games room (putting a gift away on the way). */
async function toRoom(c) {
  for (let i = 0; i < 6; i++) {
    const s = await c.state();
    if (s.ids['gift-dialog']) { await giftSeen(c); await c.tap('gift-keep'); await sleep(600); continue; }
    if (s.ids['games-room'] && !s.ids['game-room']) return;
    if (s.ids['game-room']) { await c.tap('game-room'); await sleep(800); continue; }
    if (s.ids['open-games']) { await c.tap('open-games'); await sleep(800); continue; }
    await sleep(600);
  }
  await c.wait('the games room', (s) => s.ids['games-room'] && !s.ids['game-room'], 10_000);
}

/** The gift dialog: is its line heard to its end? Waits for it, then judges. */
async function giftSeen(c, { wait = true } = {}) {
  const seen = (c.gifts ??= []);
  const at = await c.now();
  if (wait && !SOUND_OFF) {
    await c.wait('the gift line', async () => (await c.clips()).some((k) => k.id === 'narration-v1:gift' && k.t0 >= at - 4000 && k.how), 12_000).catch(() => null);
  }
  const clips = (await c.clips()).filter((k) => k.id === 'narration-v1:gift' && k.t0 >= at - 4000);
  const last = clips.at(-1);
  const g = { at: r1(at), played: !!last, how: last?.how ?? null };
  seen.push(g);
  if (!SOUND_OFF && (!last || last.how !== 'ended')) fail(c.who, `the gift line was ${last ? last.how : 'never played'} when the dialog showed`);
  return g;
}

/** Start a game from its card. Returns the start time (the card's touch). */
async function startGame(c, game) {
  await toRoom(c);
  // The room's cards take no press for a moment after it appears (More games sits over one of them).
  await c.wait(`the ${game} card to be live`, (s) => s.ids[`play-${game}`] && !s.ids[`play-${game}`].off, 10_000);
  const t = await c.now();
  await c.tap(`play-${game}`);
  const root = LETTER.has(game) ? `royal-game-${game}` : `choice-game-${game}`;
  await c.wait(`${game} to open`, (s) => s.ids[root], 20_000);
  return t;
}

const first = (s, prefix) => s.order.filter((id) => id.startsWith(prefix));
const itemOf = (s) => first(s, 'choice-item-')[0]?.slice(12) ?? null;
const wordOf = (s) => first(s, 'game-picture-')[0]?.slice(13) ?? null;

// ---------------------------------------------------------------- the listener
async function listener(c) {
  const out = [];
  for (const game of GAMES) {
    const res = { game, seconds: null, turns: [], cut: [], finished: false };
    out.push(res);
    try {
      const startAt = await startGame(c, game);
      let turnAt = startAt;
      const deadline = Date.now() + GAME_LIMIT_MS;
      for (;;) {
        if (Date.now() > deadline) throw new Error('took longer than the limit');
        const s = await c.state();
        if (s.ids['choice-done'] || s.ids['game-done']) break;
        if (s.ids['choice-next'] || s.ids['game-next']) {
          await c.quiet();
          if (s.ids['choice-payoff']) { await c.tap('choice-payoff'); await sleep(300); await c.quiet(); }
          turnAt = await c.now();
          await c.tap(s.ids['choice-next'] ? 'choice-next' : 'game-next');
          await c.wait('the next turn', (x) => !x.ids['choice-next'] && !x.ids['game-next'], 10_000);
          continue;
        }
        if (LETTER.has(game)) {
          const word = wordOf(s);
          if (s.ids['game-word'] || !word) {
            // The play stage: roll at the shining pin or flag (the right letter) until the turn clears.
            const right = res.turns.at(-1)?.word?.[0];
            await c.quiet();
            if (right && s.ids[`game-target-${right}`]) await c.tap(`game-target-${right}`); else await c.tap('game-lane');
            await sleep(1500);
            continue;
          }
          const can = await c.wait('a letter to be live', (x) => first(x, 'game-target-').some((id) => !x.ids[id].off) && x, 60_000);
          await c.quiet();
          const clips = await c.clips();
          const ask = clips.find((k) => k.t0 >= turnAt);
          res.turns.push({ word, listen: r1(can.t - turnAt), fromVoice: ask ? r1(can.t - ask.t0) : null });
          await c.tap(`game-target-${word[0]}`);
          await c.wait('the word printed', (x) => x.ids['game-word'], 10_000);
          continue;
        }
        const item = itemOf(s);
        if (!item) { await sleep(150); continue; }
        const can = await c.wait('a choice to be live', (x) => first(x, 'choice-option-').some((id) => !x.ids[id].off) && x, 90_000);
        await c.quiet();
        const clips = await c.clips();
        const ask = clips.find((k) => k.t0 >= turnAt);
        const right = ITEMS.get(item);
        res.turns.push({ item, listen: r1(can.t - turnAt), fromVoice: ask ? r1(can.t - ask.t0) : null });
        await c.tap(`choice-option-${right}`);
        if (s.ids['choice-star']) {
          await c.wait('the picture picked up', (x) => x.ids[`choice-held-${right}`], 5_000);
          await c.quiet();
          await c.tap('choice-star');
        }
        await c.wait('the answer accepted', (x) => x.ids['choice-next'] || x.ids['choice-done'], 10_000);
      }
      await c.quiet();
      res.seconds = r1((await c.now()) - startAt);
      if (game === 'quest') {
        const s = await c.state();
        res.stonesDone = first(s, 'quest-stone-').filter((id) => id.endsWith('-done')).length;
        res.castleLit = !!s.ids['quest-castle-done'];
        res.princess = !!s.ids['princess-look'];
      }
      res.finished = true;
      const clips = (await c.clips()).filter((k) => k.t0 >= startAt);
      res.cut = clips.filter((k) => k.how === 'cut').map((k) => k.id);
      res.clips = clips.length;
      await c.tap(LETTER.has(game) ? 'game-done' : 'choice-done');
      await sleep(900);
      if (await c.has('gift-dialog')) res.gift = await giftSeen(c);
    } catch (e) {
      fail(c.who, `${game}: ${e.message}`);
      await c.shot(`${c.who}-${game}-stuck`).catch(() => null);
      await c.open().catch(() => null);
    }
    console.log(`  listener ${game}: ${res.finished ? `${res.seconds} s, listening ${res.turns.map((t) => t.listen).join(' / ')} s` : 'NOT FINISHED'}${res.cut.length ? `, cut: ${res.cut.join(' ')}` : ''}`);
  }
  return out;
}

// ---------------------------------------------------------------- the masher
async function masher(c) {
  const out = [];
  for (const game of GAMES) {
    const res = { game, seconds: null, taps: 0, lockedTaps: 0, finished: false };
    out.push(res);
    const taps0 = c.taps;
    try {
      const startAt = await startGame(c, game);
      const deadline = Date.now() + GAME_LIMIT_MS;
      for (;;) {
        if (Date.now() > deadline) throw new Error('took longer than the limit');
        const s = await c.state();
        const live = (id) => s.ids[id] && !s.ids[id].off;
        if (s.ids['choice-done'] || s.ids['game-done']) break;
        const order = ['choice-next', 'game-next'];
        let pick = order.find(live);
        if (!pick && live('choice-star') && first(s, 'choice-held-').some((id) => id !== 'choice-held')) pick = 'choice-star';
        if (!pick) pick = first(s, 'choice-option-').find(live) ?? first(s, 'game-target-').find(live);
        if (!pick && s.ids['game-lane'] && s.ids['game-word']) pick = 'game-lane';
        if (pick) { await c.tap(pick); await sleep(40); continue; }
        // Nothing is tappable: a masher taps a held choice anyway.
        const held = first(s, 'choice-option-')[0] ?? first(s, 'game-target-')[0];
        if (held) { res.lockedTaps++; await c.tap(held); }
        await sleep(200);
      }
      res.seconds = r1((await c.now()) - startAt);
      res.finished = true;
      res.startAt = startAt;
      res.endAt = await c.now();
      await c.wait('More games to be live', (x) => { const d = x.ids['choice-done'] ?? x.ids['game-done']; return d && !d.off; }, 5000);
      await c.tap(LETTER.has(game) ? 'game-done' : 'choice-done');
      await sleep(900);
      if (await c.has('gift-dialog')) res.gift = await giftSeen(c);
    } catch (e) {
      fail(c.who, `${game}: ${e.message}`);
      await c.shot(`${c.who}-${game}-stuck`).catch(() => null);
      await c.open().catch(() => null);
    }
    res.taps = c.taps - taps0;
  }
  // Judge every answering touch against what was sounding: a touch that could commit an answer (a live chest,
  // clap count or letter; the live star with a picture picked up) while an ask clip still played, or in the gap
  // between two clips of one ask, came before the ask had finished. Misses are the records' wrong tries (one
  // record an item, with the misses counted in it).
  const clips = await c.clips();
  const touches = (await c.touches()).filter((t) => t.type === 'start');
  const origin = await c.page.evaluate(() => performance.timeOrigin);
  const { rows } = await c.records();
  const attempts = rows.filter((r) => r.type === 'attempt');
  for (const res of out) {
    if (!res.finished) continue;
    const mine = attempts.filter((a) => a.at - origin >= res.startAt && a.at - origin <= res.endAt + 500);
    const span = clips.filter((k) => k.t0 >= res.startAt && k.t0 <= res.endAt);
    res.attempts = mine.length;
    res.misses = mine.reduce((n, a) => n + (a.wrongTries ?? 0), 0);
    res.clipsStarted = span.length;
    res.clipsFinished = span.filter((k) => k.how === 'ended').length;
    res.duringAsk = [];
    const answering = touches.filter((t) => t.t >= res.startAt && t.t <= res.endAt && t.off === false
      && ((t.id === 'choice-star') || (/^choice-option-/.test(t.id) && !t.star) || (/^game-target-/.test(t.id) && !t.played)));
    res.answeringTouches = answering.length;
    // A clip is part of an ask when it is an ask clip or runs straight on (under 900 ms) into one: the word
    // before "Which letter does it start with?", the retry line before the ask again.
    const ask = span.map((k) => ASK_CLIP.test(k.id));
    // A tap's own tick is never part of an ask: it has its own channel and plays out under whatever answers the tap.
    for (let i = span.length - 2; i >= 0; i--) if (!ask[i] && ask[i + 1] && !TICK_CLIP.test(span[i].id) && span[i].how === 'ended' && span[i + 1].t0 - span[i].t1 < 900) ask[i] = true;
    for (const a of answering) {
      const t = a.t;
      const sounding = span.find((k, i) => ask[i] && k.t0 <= t && (k.t1 ?? Infinity) > t);
      const gap = span.find((k, i) => ask[i] && k.how === 'ended' && k.t1 <= t && span[i + 1] && span[i + 1].t0 > t && span[i + 1].t0 - k.t1 < 900 && ask[i + 1]);
      if (sounding || gap) res.duringAsk.push({ at: r1(t - res.startAt), clip: (sounding ?? gap).id, touch: a.id });
    }
    if (res.duringAsk.length) fail(c.who, `${res.game}: ${res.duringAsk.length} answer(s) committed while an ask was being said (${res.duringAsk.map((d) => `${d.clip} at ${d.at} s`).join(', ')})`);
    console.log(`  masher ${res.game}: ${res.seconds} s, ${res.taps} taps (${res.lockedTaps} on held choices), ${res.misses} misses, clips ${res.clipsFinished}/${res.clipsStarted} finished, answered during an ask: ${res.duringAsk.length}`);
  }
  return out;
}

// ---------------------------------------------------------------- the explorer
async function explorer(c) {
  const out = { presses: [], tellings: [], ear: {}, drag: null, idle: null, showMe: null, leave: null, toy: null, next2: null, crown: null };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { fail(c.who, `${name}: ${e.message}`); await c.shot(`explorer-${name}-stuck`).catch(() => null); out[`${name}Error`] = e.message; }
  };
  /** Was `clip` (a record from the log) cut, after `since`? Waits for it to end first. */
  const endOf = async (clip, ms = 30_000) => {
    const at = clip.t0;
    const got = await c.wait(`${clip.id} to end`, async () => (await c.clips()).find((k) => k.t0 === at && k.how), ms).catch(() => null);
    return got?.how ?? 'still playing';
  };
  const askClip = async (since) => c.wait('an ask clip', async () => (await c.clips()).find((k) => k.t0 >= since && ASK_CLIP.test(k.id)), 20_000);

  // The crown: a quick tap does nothing; a two-second hold opens Comfort.
  await step('crown', async () => {
    const s = await c.state();
    if (!s.ids['comfort-crown']) throw new Error('no crown');
    await c.press('comfort-crown', 150);
    await sleep(700);
    const quick = !!(await c.page.getByText(UI.close, { exact: true }).count());
    await c.press('comfort-crown', 2300);
    await sleep(700);
    const held = (await c.has('comfort-voice'));
    await c.shot('explorer-comfort');
    if (held) { await c.page.getByText(UI.close, { exact: true }).first().tap(); await sleep(500); }
    out.crown = { quickTapOpened: quick, holdOpened: held };
    if (quick) fail(c.who, 'a quick tap on the crown opened Comfort');
    if (!held) fail(c.who, 'a 2.3 s hold on the crown did not open Comfort');
  });

  // Rhymes: a tap on a choice, the star and Help during the first telling; then the presses; the drag; the ear;
  // forty idle seconds; two misses then SHOW ME; the toy six times; NEXT twice; leaving mid-item and returning.
  await step('rhymeTelling', async () => {
    const t = await startGame(c, 'rhyme');
    const ask = await askClip(t);
    await sleep(Math.max(0, ask.t0 + 900 - (await c.now())));
    const s = await c.state();
    const opts = first(s, 'choice-option-');
    const taps = [];
    for (const id of [opts[0], 'choice-star', 'choice-help']) { taps.push({ id, off: s.ids[id]?.off ?? null }); await c.tap(id); await sleep(250); }
    const how = await endOf(ask);
    const telling = { game: 'rhyme', clip: ask.id, tapped: taps, how };
    out.tellings.push(telling);
    if (how !== 'ended') fail(c.who, `the first rhyme ask (${ask.id}) was ${how} by taps on a choice, the star and Help`);
    const after = await c.state();
    if (first(after, 'choice-held-').some((id) => id !== 'choice-held')) fail(c.who, 'a tap during the first telling picked a picture up');
  });

  await step('presses', async () => {
    await c.quiet();
    await c.wait('choices live', (s) => first(s, 'choice-option-').every((id) => !s.ids[id].off));
    for (const [i, ms] of [80, 300, 450, 550, 700, 1000, 2000, 2900, 3500].entries()) {
      const s = await c.state();
      const opts = first(s, 'choice-option-');
      const id = opts[i % 3];
      const value = id.slice(14);
      const before = await c.now();
      await c.press(id, ms);
      const up = await c.now();
      await sleep(1300);
      const clips = (await c.clips()).filter((k) => k.t0 >= before);
      const st = await c.state();
      const activated = !!st.ids[`choice-held-${value}`] && clips.some((k) => k.id.endsWith(`word.${value}`) || k.id.endsWith(`:${value}`) || k.id.includes(`.${value}`));
      out.presses.push({ ms, on: id, activated, heldAfter: first(st, 'choice-held-')[0] ?? null, wordAfterLift: clips.find((k) => k.t0 >= up - 50) ? r1(clips[0].t0 - up) : null });
      if (ms <= 2900 && !activated) fail(c.who, `a ${ms} ms press on ${id} did not pick it up`);
      await c.quiet(10_000).catch(() => null);
    }
    // A five-second press too (it should not fire, and must not strand the next tap).
    const s = await c.state();
    const id = first(s, 'choice-option-')[0];
    await c.press(id, 5000);
    await sleep(800);
    const id2 = first(await c.state(), 'choice-option-')[1];
    await c.tap(id2);
    await sleep(900);
    out.press5000 = { thenTapWorked: !!(await c.has(`choice-held-${id2.slice(14)}`)) };
    if (!out.press5000.thenTapWorked) fail(c.who, 'after a five-second press, the next tap did nothing');
    await c.quiet(10_000).catch(() => null);
  });

  await step('drag', async () => {
    const s = await c.state();
    const [a, b] = first(s, 'choice-option-');
    const heldBefore = first(s, 'choice-held-')[0];
    await c.press(a, 600, 220);
    await sleep(900);
    const mid = await c.state();
    await c.tap(b);
    await sleep(900);
    const after = await c.state();
    out.drag = { pickedUpByDrag: first(mid, 'choice-held-')[0] !== heldBefore ? first(mid, 'choice-held-')[0] : null, tapAfterWorks: !!after.ids[`choice-held-${b.slice(14)}`] };
    if (!out.drag.tapAfterWorks) fail(c.who, 'a tap after dragging a picture did nothing (stranded touch)');
    await c.quiet(10_000).catch(() => null);
  });

  await step('ear', async () => {
    // During: the ear restarts the ask (it always works). After: what it says.
    let t = await c.now();
    await c.tap('choice-hear');
    const a = await askClip(t);
    await sleep(700);
    t = await c.now();
    await c.tap('choice-hear');
    await sleep(400);
    const firstHow = (await c.clips()).find((k) => k.t0 === a.t0)?.how;
    await c.quiet();
    const during = (await c.clips()).filter((k) => k.t0 >= t).map((k) => `${k.id}:${k.how}`);
    out.ear.rhymeDuring = { firstAsk: firstHow, then: during };
  });

  await step('idle', async () => {
    const q = await c.quiet();
    const quietAt = q.lastEnd;
    const t = await c.now();
    await sleep(40_000);
    const clips = (await c.clips()).filter((k) => k.t0 >= t);
    const s = await c.state();
    const ear = await c.page.evaluate(() => {
      // The Glow ring is a 5 px gold border drawn beside the ear (ui/MagicalPressable.tsx Glow).
      let e = document.querySelector('[data-testid="choice-hear"]');
      let best = null;
      for (let up = 0; e && up < 4; up++, e = e.parentElement) {
        for (const k of e.children) if (getComputedStyle(k).borderTopWidth === '5px') best = Math.max(best ?? 0, Number(getComputedStyle(k).opacity));
      }
      return best;
    });
    // Starts of reminders against the end of the speech before them.
    const starts = [];
    let lastEnd = quietAt;
    for (const k of clips) {
      if (!starts.length || k.t0 - lastEnd > QUIET_MS) starts.push({ after: r1(k.t0 - lastEnd), id: k.id, overClip: false });
      lastEnd = Math.max(lastEnd, k.t1 ?? k.t0);
    }
    out.idle = { reminders: starts, earRingOpacity: ear, earLive: !s.ids['choice-hear']?.off, shot: await c.shot('explorer-idle-nudge') };
    if (starts.length !== 2) fail(c.who, `forty idle seconds gave ${starts.length} reminders (2 expected)`);
    if (!(ear > 0)) fail(c.who, 'after the last reminder the ear shows no nudge');
  });

  await step('showMe', async () => {
    const s = await c.state();
    const item = itemOf(s);
    const right = ITEMS.get(item);
    const wrong = first(s, 'choice-option-').map((id) => id.slice(14)).filter((v) => v !== right);
    for (const w of wrong) {
      await c.wait('live', (x) => x.ids[`choice-option-${w}`] && !x.ids[`choice-option-${w}`].off, 40_000);
      await c.tap(`choice-option-${w}`);
      await c.wait('held', (x) => x.ids[`choice-held-${w}`], 5000);
      await c.quiet(10_000).catch(() => null);
      await c.tap('choice-star');
      await c.wait('the miss', (x) => x.ids[`choice-option-${w}`]?.off, 5000);
      await c.quiet();
    }
    // Help after two misses: the ladder (clue, guided, then SHOW ME), each heard to its end.
    const labels = [];
    for (let i = 0; i < 3; i++) {
      const st = await c.state();
      const l = st.ids['choice-help']?.label ?? null;
      labels.push(l);
      if (!st.ids['choice-help'] || st.ids['choice-help'].off) break;
      await c.tap('choice-help');
      await sleep(600);
      await c.quiet(30_000).catch(() => null);
      if (l === 'Show me') break;
    }
    const label = labels.includes('Show me') ? 'Show me' : labels.at(-1);
    const shown = await c.state();
    const others = first(shown, 'choice-option-').filter((id) => id !== `choice-option-${right}`);
    // A tap on a greyed one does nothing and records nothing.
    await c.tap(others[0]);
    await sleep(500);
    const stillAsk = !(await c.has('choice-next'));
    await c.quiet();
    await c.tap(`choice-option-${right}`);
    await c.wait('held', (x) => x.ids[`choice-held-${right}`], 5000);
    await c.quiet(10_000).catch(() => null);
    await c.tap('choice-star');
    await c.wait('the answer', (x) => x.ids['choice-next'], 10_000);
    out.showMe = { item, helpLadder: labels, rightLive: !shown.ids[`choice-option-${right}`]?.off, othersLocked: others.every((id) => shown.ids[id].off), wrongTapIgnored: stillAsk, tick: !!shown.ids['choice-shown'], note: 'with three choices, two misses leave only the right one' };
    if (label !== 'Show me') fail(c.who, `after two misses Help never offered Show me (${labels.join(' > ')})`);
    if (!shown.ids['choice-shown']) fail(c.who, 'SHOW ME showed nothing on the choice it shows');
  });

  await step('toy', async () => {
    const offs = [];
    for (let i = 0; i < 6; i++) { await c.tap('choice-payoff'); await sleep(450); offs.push((await c.state()).ids['choice-payoff']?.off ?? null); }
    out.toy = { lockedAfterTap: offs };
    if (offs[2] !== true || offs[1] === true) fail(c.who, `the toy did not stop after three plays (${offs.join(',')})`);
    await c.quiet(15_000).catch(() => null);
  });

  await step('next2', async () => {
    const before = (await c.state()).ids['choice-path']?.label ?? null;
    const turnLabel = async () => c.page.evaluate(() => document.querySelector('[data-testid="choice-path"] [aria-label]')?.getAttribute('aria-label') ?? null);
    const t0 = await turnLabel();
    const e = await c.at('choice-next');
    await c.tapAt(e.x, e.y);
    await sleep(90);
    await c.tapAt(e.x, e.y);
    await sleep(1500);
    out.next2 = { before: t0 ?? before, after: await turnLabel() };
    const n = (x) => Number(String(x).match(/Turn (\d+)/)?.[1]);
    if (n(out.next2.after) !== n(out.next2.before) + 1) fail(c.who, `NEXT twice went from ${out.next2.before} to ${out.next2.after}`);
  });

  await step('leave', async () => {
    // Mid-item: miss once, leave for the games room, come back.
    await c.wait('live', (x) => first(x, 'choice-option-').some((id) => !x.ids[id].off), 60_000);
    const s = await c.state();
    const item = itemOf(s);
    const right = ITEMS.get(item);
    const w = first(s, 'choice-option-').map((id) => id.slice(14)).find((v) => v !== right);
    await c.tap(`choice-option-${w}`);
    await c.wait('held', (x) => x.ids[`choice-held-${w}`], 5000);
    await c.tap('choice-star');
    await c.wait('the miss', (x) => x.ids[`choice-option-${w}`]?.off, 5000);
    await sleep(500);
    await c.tap('game-room');
    await c.wait('the room', (x) => x.ids['games-room'] && !x.ids['game-room'], 10_000);
    const t = await c.now();
    await sleep(1200);
    const leaked = (await c.clips()).filter((k) => k.t0 > t);
    await c.tap('play-rhyme');
    await c.wait('rhyme again', (x) => itemOf(x), 20_000);
    const back = await c.state();
    out.leave = { item, back: itemOf(back), triedKept: !!back.ids[`choice-option-${w}`]?.off, speechAfterLeaving: leaked.map((k) => k.id) };
    if (out.leave.back !== item) fail(c.who, `leaving and returning changed the item (${item} -> ${out.leave.back})`);
    if (leaked.some((k) => k.id.startsWith('games-v2:'))) fail(c.who, `the game kept talking in the games room: ${leaked.map((k) => k.id).join(' ')}`);
  });

  await step('rhymeFinish', async () => {
    await finishChoice(c, 'rhyme');
  });

  // Stories: two seconds into the telling, a tap on a choice, the star and Help; then the ear during and after.
  await step('storyTelling', async () => {
    const t = await startGame(c, 'story');
    const intro = await c.wait('the story', async () => (await c.clips()).find((k) => k.t0 >= t && /story\.|line\.story\.intro/.test(k.id)), 20_000);
    // Two seconds into the story itself (its first sentence), not into "Listen to the story."
    const told = await c.wait('the first sentence', async () => (await c.clips()).find((k) => k.t0 >= t && /:story\./.test(k.id)), 20_000);
    await sleep(Math.max(0, told.t0 + 2000 - (await c.now())));
    const s = await c.state();
    const sounding = s.playing[0];
    const at = (await c.clips()).filter((k) => !k.how).at(-1);
    const opts = first(s, 'choice-option-');
    const pagesAtTap = first(s, 'choice-page-lit-').length;
    let heardBadge = false;
    for (const id of [opts[1], 'choice-star', 'choice-help']) { await c.tap(id); await sleep(120); heardBadge ||= await c.has('choice-listening-heard'); await sleep(80); }
    await c.shot('story-being-told');
    const how = at ? await endOf(at) : 'nothing was playing';
    // The whole telling to its question: nothing cut from the intro to the end of the ask.
    await c.quiet();
    const all = (await c.clips()).filter((k) => k.t0 >= intro.t0);
    const cut = all.filter((k) => k.how !== 'ended');
    const pagesAfter = first(await c.state(), 'choice-page-lit-').length;
    out.tellings.push({ game: 'story', tappedDuring: sounding, how, heldTapAnswered: heardBadge, pagesLit: [pagesAtTap, pagesAfter], clips: all.map((k) => `${k.id}:${k.how}`) });
    if (!heardBadge) fail(c.who, 'a tap on a held choice during the telling got no answer from the Listen first badge');
    if (!(pagesAtTap >= 1 && pagesAtTap < 3) || pagesAfter !== 3) fail(c.who, `the story's pages did not light with its sentences (${pagesAtTap} lit two seconds into the first, ${pagesAfter} at the end)`);
    if (cut.length || !sounding) fail(c.who, `the first story telling was cut by taps on a choice, the star and Help (${cut.map((k) => k.id).join(' ') || 'nothing sounded when the taps came'})`);
    // The ear, after the story was heard to its end: the question only (the story is not told again).
    const e = await c.now();
    await c.tap('choice-hear');
    await sleep(300);
    await c.quiet();
    out.ear.storyAfter = (await c.clips()).filter((k) => k.t0 >= e).map((k) => k.id);
    if (out.ear.storyAfter.some((id) => /story\./.test(id))) fail(c.who, 'the ear retold a story that was already heard to its end');
  });

  // The star double-tapped with the right picture held: it answers once and the celebration is not skipped (Next
  // is drawn where the star stood). The answer's word is printed under the answer's own picture.
  await step('storyAnswer', async () => {
    await c.quiet();
    const s = await c.state();
    const item = itemOf(s);
    const right = ITEMS.get(item);
    await c.wait('live', (x) => x.ids[`choice-option-${right}`] && !x.ids[`choice-option-${right}`].off, 60_000);
    await c.tap(`choice-option-${right}`);
    await c.wait('held', (x) => x.ids[`choice-held-${right}`], 5000);
    await c.quiet(10_000).catch(() => null);
    const e = await c.at('choice-star');
    const t = await c.now();
    await c.tapAt(e.x, e.y);
    await sleep(150);
    await c.tapAt(e.x, e.y);
    await sleep(1600);
    const after = await c.state();
    const font = await c.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="choice-line"]')).fontFamily);
    const word = after.ids[`choice-print-${right}`];
    const picture = after.ids[`choice-answer-${right}`];
    await c.quiet(20_000).catch(() => null);
    const cut = (await c.clips()).filter((k) => k.t0 >= t && k.how === 'cut').map((k) => k.id);
    out.storyAnswer = { item, celebrated: !!after.ids['choice-next'] && itemOf(after) === item, cut, wordUnderItsPicture: !!(word && picture && Math.abs(word.x - picture.x) < picture.w / 2 && word.y > picture.y), lineFont: font, shot: await c.shot('story-answer') };
    if (!out.storyAnswer.celebrated) fail(c.who, 'a double tap on the star skipped the celebration');
    if (cut.length) fail(c.who, `the celebration was cut by the second tap of the star: ${cut.join(' ')}`);
    if (!out.storyAnswer.wordUnderItsPicture) fail(c.who, `the story's answer "${right}" is not printed under its own picture`);
    if (!/Andika/.test(font)) fail(c.who, `the printed line is not in the reading typeface (${font})`);
  });

  await step('storyFinish', async () => {
    await finishChoice(c, 'story');
  });

  await step('gift', async () => {
    const s = await c.state();
    if (s.ids['gift-dialog']) {
      out.gift = await giftSeen(c);
      await c.shot('explorer-gift');
      await c.tap('gift-keep');
    } else out.gift = { shown: false, note: 'no gift dialog after two games' };
  });

  // Treasure Chests: Help double-tapped spends one rung. The clue is not cut, the first letter does not appear, and
  // the record says clue, not guided.
  await step('helpTwice', async () => {
    await startGame(c, 'sort');
    await c.wait('Help live', (x) => x.ids['choice-help'] && !x.ids['choice-help'].off, 60_000);
    await c.quiet();
    const item = itemOf(await c.state());
    const e = await c.at('choice-help');
    const t = await c.now();
    await c.tapAt(e.x, e.y);
    await sleep(120);
    await c.tapAt(e.x, e.y);
    await sleep(250);
    await c.tapAt(e.x, e.y);
    const clue = await c.wait('the clue', async () => (await c.clips()).find((k) => k.t0 >= t && /line\.sort\.clue/.test(k.id)), 5000);
    const how = await endOf(clue);
    await c.quiet(20_000).catch(() => null);
    const s = await c.state();
    const said = (await c.clips()).filter((k) => k.t0 >= t).map((k) => `${k.id}:${k.how}`);
    await c.tap(`choice-option-${ITEMS.get(item)}`);
    await c.wait('the answer', (x) => x.ids['choice-next'], 10_000);
    await sleep(600);
    const attempt = (await c.records()).rows.filter((r) => r.type === 'attempt').at(-1);
    out.helpTwice = { item, clue: how, letterShown: !!s.ids['choice-revealed'], helpLabel: s.ids['choice-help']?.label ?? null, said, assistance: attempt?.assistance ?? null };
    if (how !== 'ended') fail(c.who, `a double tap on Help cut the clue (${how})`);
    if (s.ids['choice-revealed']) fail(c.who, 'a double tap on Help spent guided help too (the first letter is showing)');
    if (attempt?.assistance !== 'clue') fail(c.who, `after one press of Help (double-tapped) the record says ${attempt?.assistance}`);
  });

  // Rhymes: how to play follows the ask and holds nothing. A tap during it picks the picture up.
  await step('howToTail', async () => {
    await c.reload();
    const t = await startGame(c, 'rhyme');
    const how = await c.wait('how to play', async () => (await c.clips()).find((k) => k.t0 >= t && HOW_CLIP.test(k.id)), 30_000);
    await sleep(Math.max(0, how.t0 + 700 - (await c.now())));
    const s = await c.state();
    const id = first(s, 'choice-option-')[0];
    const live = !s.ids[id].off;
    await c.tap(id);
    await sleep(700);
    const after = await c.state();
    const ended = (await c.clips()).find((k) => k.t0 === how.t0)?.how;
    out.howToTail = { choicesLiveDuringIt: live, pickedUp: !!after.ids[`choice-held-${id.slice(14)}`], howToPlay: ended };
    if (!live || !out.howToTail.pickedUp) fail(c.who, 'a tap during how to play did not pick the picture up (the tail still holds the choices)');
    await c.quiet(15_000).catch(() => null);
  });

  // Bowling: the right letter double-tapped. The second tap lands on the shining pin: no roll, and the line is not cut.
  await step('letterTwice', async () => {
    await startGame(c, 'bowling');
    const can = await c.wait('a letter to be live', (x) => first(x, 'game-target-').some((id) => !x.ids[id].off) && x, 60_000);
    await c.quiet();
    const word = wordOf(can);
    const e = await c.at(`game-target-${word[0]}`);
    const t = await c.now();
    await c.tapAt(e.x, e.y);
    await sleep(150);
    await c.tapAt(e.x, e.y);
    const line = await c.wait('the play line', async () => (await c.clips()).find((k) => k.t0 >= t && /line\.bowling\.play/.test(k.id)), 8000);
    const how = await endOf(line);
    await sleep(900);
    const s = await c.state();
    const tick = (await c.clips()).filter((k) => k.t0 >= t - 50 && k.t0 <= t + 400 && /effects-v1:place/.test(k.id)).map((k) => k.how);
    out.letterTwice = { word, playLine: how, rolled: !!s.ids['game-next'], tick, shot: await c.shot('bowling-after-double-tap') };
    if (how !== 'ended') fail(c.who, `a double tap on the right letter cut "Now roll the ball" (${how})`);
    if (s.ids['game-next']) fail(c.who, 'a double tap on the right letter rolled the ball');
    // Then a real roll at the shining pin clears, and the ear while the ball rolls does not say the cheer early.
    await c.tap(`game-target-${word[0]}`);
    await sleep(120);
    await c.tap('game-hear');
    await c.wait('Next', (x) => x.ids['game-next'], 8000);
    await c.quiet();
    const cheers = (await c.clips()).filter((k) => k.t0 >= t && /line\.bowling\.cleared/.test(k.id)).map((k) => k.how);
    out.letterTwice.cheers = cheers;
    if (cheers.length !== 1 || cheers[0] !== 'ended') fail(c.who, `"Hooray!" was said ${cheers.length} times (${cheers.join(', ')})`);
  });

  // Bunny Hop to its end; a reload there comes back to the end screen; More games double-tapped opens no game.
  await step('endReload', async () => {
    await startGame(c, 'hop');
    await finishChoice(c, 'hop', { stay: true });
    await c.reload();
    const back = await c.wait('the game after the reload', (x) => (x.ids['choice-done'] || itemOf(x)) && x, 20_000);
    await sleep(600);
    out.endReload = { endScreen: !!back.ids['choice-done'], newGame: !!itemOf(back), shot: await c.shot('end-screen-after-reload') };
    if (!back.ids['choice-done']) throw new Error('a reload on the end screen started a new game');
    await c.wait('More games live', (x) => x.ids['choice-done'] && !x.ids['choice-done'].off, 5000);
    const e = await c.at('choice-done');
    await c.tapAt(e.x, e.y);
    await sleep(150);
    await c.tapAt(e.x, e.y);
    await sleep(1600);
    const s = await c.state();
    out.endReload.afterDoubleTap = s.ids['gift-dialog'] ? 'gift dialog' : s.ids['games-room'] && !first(s, 'choice-game-').length && !first(s, 'royal-game-').length ? 'games room' : 'a game opened';
    if (out.endReload.afterDoubleTap === 'a game opened') fail(c.who, 'a double tap on More games opened a game from the games room');
  });
  return out;
}

// ---------------------------------------------------------------- Sound off
/** With Sound off no royal game is offered or recorded; a game already open pauses to say why. */
async function soundOff(c) {
  const out = {};
  const comfort = async (text) => {
    await c.press('comfort-crown', 2300);
    await c.page.getByText(UI.close, { exact: true }).first().waitFor({ timeout: 5000 });
    await c.page.getByText(text, { exact: true }).first().tap();
    await sleep(300);
    await c.page.getByText(UI.close, { exact: true }).first().tap();
    await sleep(700);
  };
  await toRoom(c);
  await sleep(1200);
  const room = await c.state();
  const cards = first(room, 'play-');
  out.cards = Object.fromEntries(cards.map((id) => [id, room.ids[id].off ? room.ids[id].label : 'LIVE']));
  out.picture = !!room.ids['games-room-sound-off'];
  out.shot = await c.shot('games-room-sound-off');
  if (cards.some((id) => !room.ids[id].off)) fail(c.who, `with Sound off these games are still offered: ${cards.filter((id) => !room.ids[id].off).join(' ')}`);
  if (!out.picture) fail(c.who, 'with Sound off the games room does not show why its games are dimmed');
  // A child who taps everything: nothing starts.
  for (let round = 0; round < 3; round++) for (const id of cards) { await c.tap(id); await sleep(60); }
  await sleep(800);
  const after = await c.state();
  out.started = [...first(after, 'choice-game-'), ...first(after, 'royal-game-')];
  if (out.started.length) fail(c.who, `with Sound off a tap started ${out.started.join(' ')}`);
  // A reload with Sound off: still nothing offered.
  await c.reload();
  await toRoom(c);
  await sleep(1200);
  const again = await c.state();
  out.afterReload = first(again, 'play-').every((id) => again.ids[id].off);
  if (!out.afterReload) fail(c.who, 'after a reload with Sound off the games are offered again');
  // Sound on: a story is opened; Sound is switched off in the middle of its telling.
  await comfort(UI.sound);
  const t = await startGame(c, 'story');
  const told = await c.wait('the first sentence', async () => (await c.clips()).find((k) => k.t0 >= t && /:story\./.test(k.id)), 20_000);
  await sleep(Math.max(0, told.t0 + 1500 - (await c.now())));
  await comfort(UI.quiet);
  const paused = await c.state();
  out.paused = { picture: !!paused.ids['game-sound-off'], choices: first(paused, 'choice-option-').length, shot: await c.shot('game-paused-sound-off') };
  if (!paused.ids['game-sound-off']) fail(c.who, 'a game open when Sound is switched off does not pause to say why');
  if (out.paused.choices) fail(c.who, 'a game paused for Sound off still shows its choices');
  await sleep(13_000);
  const silent = (await c.clips()).filter((k) => k.t0 >= paused.t);
  if (silent.length) fail(c.who, `with Sound off the game still tried to speak: ${silent.map((k) => k.id).join(' ')}`);
  // Sound back on: the story is told again from its first sentence, held, before anything can be chosen.
  const on = await c.now();
  await comfort(UI.sound);
  const retold = await c.wait('the story again', async () => (await c.clips()).find((k) => k.t0 >= on && /:story\..\.1$/.test(k.id)), 15_000).catch(() => null);
  const back = await c.state();
  out.resumed = { retoldFromTheStart: !!retold, choicesHeld: first(back, 'choice-option-').every((id) => back.ids[id].off), picture: !!back.ids['game-sound-off'] };
  if (!retold) fail(c.who, 'with Sound back on the story was not told again');
  if (!out.resumed.choicesHeld) fail(c.who, 'with Sound back on the choices were live before the story was told');
  await c.quiet(40_000).catch(() => null);
  const { rows } = await c.records();
  out.attempts = rows.filter((r) => r.type === 'attempt').length;
  if (out.attempts) fail(c.who, `${out.attempts} answer(s) were recorded in a run where no question could be answered`);
  console.log(`  sound off: cards ${cards.length} all held ${cards.every((id) => room.ids[id].off)}, picture ${out.picture}, started ${out.started.length}, paused ${JSON.stringify(out.paused.picture)}, retold ${out.resumed.retoldFromTheStart}, attempts ${out.attempts}`);
  return out;
}

/** Answer the rest of a picture game right, waiting for the quiet each time, and leave by MORE GAMES (`stay`: stop on the end screen). */
async function finishChoice(c, play, { stay = false } = {}) {
  const deadline = Date.now() + GAME_LIMIT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${play} could not be finished`);
    const s = await c.state();
    if (s.ids['choice-done']) break;
    if (s.ids['choice-next']) { await c.quiet(20_000).catch(() => null); await c.tap('choice-next'); await sleep(600); continue; }
    const item = itemOf(s);
    if (!item) { await sleep(200); continue; }
    await c.wait('a live choice', (x) => first(x, 'choice-option-').some((id) => !x.ids[id].off), 90_000);
    const right = ITEMS.get(item);
    await c.tap(`choice-option-${right}`);
    if (s.ids['choice-star']) { await c.wait('held', (x) => x.ids[`choice-held-${right}`], 5000); await c.tap('choice-star'); }
    await c.wait('the answer', (x) => x.ids['choice-next'] || x.ids['choice-done'], 10_000);
  }
  await c.quiet(20_000).catch(() => null);
  if (stay) return;
  await c.wait('More games live', (x) => x.ids['choice-done'] && !x.ids['choice-done'].off, 5000);
  await c.tap('choice-done');
  await sleep(1200);
}

// ---------------------------------------------------------------- shared judgement
/** Speech that no touch asked for, starting over a clip that was still playing (a reminder over speech). */
async function overlaps(c) {
  const clips = await c.clips();
  const touches = await c.touches();
  const bad = [];
  for (let i = 1; i < clips.length; i++) {
    const k = clips[i];
    const before = clips.slice(0, i).filter((p) => p.how === 'cut' && Math.abs(p.t1 - k.t0) < 60);
    if (!before.length) continue;
    const touched = touches.some((t) => t.t <= k.t0 + 30 && k.t0 - t.t < 1500);
    if (!touched) bad.push({ at: r1(k.t0), started: k.id, cut: before.map((p) => p.id) });
  }
  return bad;
}

async function run(browser, base, who) {
  const c = await child(browser, base, who);
  const started = Date.now();
  let result = null;
  try {
    await c.open();
    if (SOUND_OFF || STILL) {
      // Comfort, as a grown-up would: hold the crown, then the buttons.
      await c.press('comfort-crown', 2300);
      await c.page.getByText(UI.close, { exact: true }).first().waitFor({ timeout: 5000 });
      if (SOUND_OFF) await c.page.getByText(UI.quiet, { exact: true }).first().tap();
      if (STILL && (await c.page.getByText(UI.still, { exact: true }).count())) await c.page.getByText(UI.still, { exact: true }).first().tap();
      await sleep(300);
      await c.page.getByText(UI.close, { exact: true }).first().tap();
      await sleep(500);
    }
    result = SOUND_OFF ? await soundOff(c) : who === 'listener' ? await listener(c) : who === 'masher' ? await masher(c) : await explorer(c);
  } catch (e) {
    fail(who, e.message);
    await c.shot(`${who}-stuck`).catch(() => null);
  }
  const over = await overlaps(c).catch(() => []);
  for (const o of over) fail(who, `${o.started} started over ${o.cut.join(' ')} with no touch (at ${o.at} s)`);
  const clips = await c.clips().catch(() => []);
  const records = await c.records().catch((e) => ({ error: String(e) }));
  // A clip the page could not play, and a tap's tick cut before it had sounded (it has its own channel now).
  const refused = clips.filter((k) => String(k.how).startsWith('refused'));
  if (refused.length) fail(who, `${refused.length} clip(s) were refused by the page: ${[...new Set(refused.map((k) => `${k.id} ${k.how}`))].join(', ')}`);
  const ticks = clips.filter((k) => TICK_CLIP.test(k.id));
  const cutTicks = ticks.filter((k) => k.how === 'cut' && k.t1 - k.t0 < 150);
  if (cutTicks.length) fail(who, `${cutTicks.length} of ${ticks.length} tap ticks were cut within 150 ms`);
  for (const e of c.errors) fail(who, `page error: ${e}`);
  const out = { who, seconds: r1(Date.now() - started), result, overlaps: over, errors: c.errors, taps: c.taps, gifts: c.gifts ?? [], ticks: { played: ticks.length, cut: cutTicks.length }, refused: refused.length, clips, records };
  await c.ctx.close();
  return out;
}

function table(all) {
  const rows = [];
  if (SOUND_OFF) return all.map((x) => `${x.who}: ${JSON.stringify(x.result)}`).join('\n');
  const L = all.find((x) => x.who === 'listener')?.result ?? [];
  const M = all.find((x) => x.who === 'masher')?.result ?? [];
  if (L.length || M.length) {
    rows.push(`\n${'game'.padEnd(9)} | ${'listener s'.padStart(10)} | ${'turn-1 listen'.padStart(13)} | ${'cut'.padStart(4)} | ${'masher s'.padStart(8)} | ${'taps'.padStart(5)} | ${'miss'.padStart(4)} | ${'clips fin/start'.padStart(15)} | during ask`);
    for (const game of GAMES) {
      const l = L.find((x) => x.game === game);
      const m = M.find((x) => x.game === game);
      rows.push(`${game.padEnd(9)} | ${String(l?.finished ? l.seconds : l ? 'STUCK' : '-').padStart(10)} | ${String(l?.turns?.[0]?.listen ?? '-').padStart(13)} | ${String(l?.cut?.length ?? '-').padStart(4)} | ${String(m?.finished ? m.seconds : m ? 'STUCK' : '-').padStart(8)} | ${String(m?.taps ?? '-').padStart(5)} | ${String(m?.misses ?? '-').padStart(4)} | ${(m ? `${m.clipsFinished ?? '-'}/${m.clipsStarted ?? '-'}` : '-').padStart(15)} | ${m?.duringAsk?.length ?? '-'}`);
    }
    const pic = ['rhyme', 'sort', 'hop', 'story'];
    const sum = (arr) => r1(arr.filter((x) => pic.includes(x.game) && x.finished).reduce((a, x) => a + x.seconds * 1000, 0));
    if (M.length) rows.push(`masher, the four picture games: ${sum(M)} s, ${M.filter((x) => pic.includes(x.game)).reduce((a, x) => a + (x.misses ?? 0), 0)} misses (first build: 21 s with 17 misses before the timing work, 177 s after)`);
    if (L.length) rows.push('listener, first build: rhymes 69 s, chests 85 s, bunny 44 s, stories 77 s, quest 86 s; first-turn listening 6.5 s rhymes, 16 s stories');
  }
  const E = all.find((x) => x.who === 'explorer')?.result;
  if (E) {
    rows.push(`\nexplorer presses: ${E.presses.map((p) => `${p.ms} ms ${p.activated ? 'yes' : 'NO'}`).join(', ')}`);
    rows.push(`explorer tellings: ${E.tellings.map((t) => `${t.game} ${t.how}`).join(', ')}; idle: ${E.idle ? `${E.idle.reminders.length} reminders at ${E.idle.reminders.map((r) => `${r.after} s`).join(', ')} after the speech, ear ring ${E.idle.earRingOpacity}` : '-'}`);
    rows.push(`explorer: crown ${JSON.stringify(E.crown)}, SHOW ME ${JSON.stringify(E.showMe)}, toy ${JSON.stringify(E.toy)}, NEXT twice ${JSON.stringify(E.next2)}, leave ${JSON.stringify(E.leave)}, gift ${JSON.stringify(E.gift)}`);
    rows.push(`explorer fixes: Help twice ${JSON.stringify(E.helpTwice)}, how-to tail ${JSON.stringify(E.howToTail)}, letter twice ${JSON.stringify(E.letterTwice)}, story answer ${JSON.stringify(E.storyAnswer)}, end reload ${JSON.stringify(E.endReload)}`);
  }
  return rows.join('\n');
}

module.exports = { child, toRoom, giftSeen, startGame, finishChoice, first, itemOf, wordOf, ITEMS, UI, overlaps, sleep };

if (require.main === module) (async () => {
  const startedAt = Date.now();
  const server = await serve(DIST, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts).catch(() => chromium.launch({ channel: 'chrome' }));
  console.log(`Magical Kingdom child playtest: ${PERSONAS.join(', ')} at ${W}x${H}${STILL ? ', still pictures' : ''}${SOUND_OFF ? ', sound off' : ''}; games ${GAMES.join(' ')}`);
  let all;
  if (process.env.KP_SERIAL === '1') { all = []; for (const p of PERSONAS) all.push(await run(browser, base, p)); }
  else all = await Promise.all(PERSONAS.map((p) => run(browser, base, p)));
  await browser.close();
  server.close();
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `kingdom-playtest-${PERSONAS.join('-')}-${W}x${H}${STILL ? '-still' : ''}${SOUND_OFF ? '-quiet' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), size: [W, H], still: STILL, soundOff: SOUND_OFF, games: GAMES, failures, personas: all }, null, 1));
  console.log(table(all));
  console.log(`\n${failures.length ? `${failures.length} failure(s):\n  ${failures.join('\n  ')}` : 'no failures'}\nmeasurements: ${file}\ntook ${r1(Date.now() - startedAt)} s`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
