#!/usr/bin/env node
/* global __dirname */
// Child playtest harness for Elevator Quest (the learner-engineer's tower): what would go wrong for a real child?
//   npm run web:export   (only when the game changed; this script never exports)
//   npm run web:elevator-playtest
// Three scripted children play the browser build in Chromium (playwright-core, a touch screen) from a fresh
// save, `?open=quest&e2e=1` (the read-only probe of minigames/hostProbe.web.ts). Nothing here can hear or see:
// it measures what plays, what is on the page and what was written. Browser only, never a tablet result.
//   engineer  plays as the game intends: reads each line (EP_READ_MS a word), thinks 1.5 to 4 s a decision,
//             answers right, rides, touches the things on a few landings on the way. Measures: seconds to the
//             first ride, seconds per job, the longest stretch with nothing to press, how long a touched control
//             takes to change, the whole session.
//   guesser   answers wrong first wherever an answer is asked, double-taps, presses floors and door buttons while
//             the lift moves and while a new line is up, works LET'S COUNT, misses the fresh job on every second
//             job and takes the help offered. Measures: its own ledger of committed answers against the learning
//             records (every miss once, no attempt from a tap that was not an answer), whether a miss changed the
//             item, whether help was recorded as help, whether it was ever left with nothing to press.
//   explorer  ignores the job: a minute idle at the first call, every floor button, the door buttons twelve
//             times, every thing on the landing, the directory, the game on the landing opened and left; then it
//             plays on with reloads at awkward moments (mid-ride, a floor marked but not pressed, the note open,
//             cargo half loaded, JOB DONE, inside a game) and, after Floor 15, rides the free lift to the game
//             floors and B1, opens each game and leaves, and idles a minute again. Measures: did each touched
//             thing change the picture, did anything it did write a learning record, did a reload come back to
//             the same job with nothing lost or doubled, did idling move the game on or speak.
// For all three: every sound the page starts (name, start, end, played out or cut; loops too), any two spoken
// clips at once, page errors and console errors, controls smaller than EP_MIN_TARGET px, text cut off by its
// box, red on a screen that is not a danger, and the learning records read back from the page's own database
// image (IndexedDB) with sql.js. The answers are worked out from Lifty's line or from the content data, never
// read off the screen.
// It fails (exit 1) on: a page error; a learning record no committed answer explains; a miss recorded twice or
// not at all; a miss that changed the item outside a correction; help not recorded as help; a reload that lost
// or doubled a record or came back on another job; an idle minute that moved the game on; a persona left with
// nothing to press; two spoken clips at once. Everything else is measured and reported, not judged.
// Options (environment):
//   EP_PERSONA=engineer,guesser,explorer   which children (default all three, side by side)
//   EP_PARTS=mission,landings,chaos,reloads,idle,free   which parts they play (default all); `free` is the
//             explorer's free ride after Floor 15, `chaos` its button mashing, `landings` touching things
//   EP_JOBS=14          stop after this many jobs (a shorter run)
//   EP_SIZE=1180x820    window in CSS px (iPad landscape; 1280x800 is Fire HD 8 landscape)
//   EP_STILL=1          Reduced Motion (the OS preference and the game's setting)
//   EP_SOUND=off        Sound: Mute in Settings before play
//   EP_PACE=1           the engineer's pace (0: no reading or thinking time, for a quick run of the harness)
//   EP_SERIAL=1         one persona at a time (steadier timing on a busy machine)
//   EP_DIST=<dir>       another export than dist-web      EP_OUT=<dir>   where the JSON and screenshots go
//   EP_MIN_TARGET=44    the smallest comfortable control, CSS px
//   CHROMIUM_PATH       the Chromium to drive (default: Playwright's own, then installed Chrome)
const path = require('node:path');
const fs = require('node:fs');
const { serve } = require('./serve-web');
const MG = require('./lib/miniGames');

const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const DIST = path.resolve(ROOT, process.env.EP_DIST ?? 'dist-web');
const OUT = path.resolve(process.env.EP_OUT ?? path.join(ROOT, 'web-screenshots', 'elevator-playtest'));
const [W, H] = (process.env.EP_SIZE ?? '1180x820').split('x').map(Number);
const STILL = process.env.EP_STILL === '1';
const SOUND_OFF = process.env.EP_SOUND === 'off';
const PACE = Number(process.env.EP_PACE ?? 1);
const READ_MS = Number(process.env.EP_READ_MS ?? 250);
const MAX_JOBS = Number(process.env.EP_JOBS ?? 14);
const MIN_TARGET = Number(process.env.EP_MIN_TARGET ?? 44);
const PERSONAS = (process.env.EP_PERSONA ?? 'engineer,guesser,explorer').split(',').map((s) => s.trim()).filter(Boolean);
const PARTS = new Set((process.env.EP_PARTS ?? 'mission,landings,chaos,reloads,idle,free').split(',').map((s) => s.trim()).filter(Boolean));
/** No persona may take longer than this (a stuck run ends as a failure, never a hang). */
const RUN_LIMIT_MS = Number(process.env.EP_LIMIT_MIN ?? 45) * 60_000;
/** A persona that sees no change for this long, with nothing it knows how to press, is stuck. */
const STUCK_MS = 75_000;

const READING_WORDS = json('content/themes/elevator-quest/reading.json').items;
const READING_ITEMS = json('content/packs/reading.json').activities.flatMap((a) =>
  a.params.items.map((it) => ({ id: it.id, correct: it.correct, wrong: it.distractors.map((d) => d.value), words: READING_WORDS[it.id] })));
const HOST = json('content/themes/elevator-quest/minigames/host.json');
const STEPS = ['intro', 'cued-moves', 'read-1', 'second-representation', 'two-groups', 'read-2', 'two-moves', 'number-sense', 'read-3', 'start-unknown', 'compare-distance', 'stretch', 'read-4', 'capacity-encounter', 'finale'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (ms) => (ms == null || Number.isNaN(ms) ? null : Math.round(ms / 100) / 10);
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const failures = [];
const fail = (who, what) => { failures.push(`${who}: ${what}`); console.log(`  FAIL ${who}: ${what}`); };

// ---------------------------------------------------------------- in the page
function instrument() {
  const abs = () => performance.timeOrigin + performance.now();
  const ep = { clips: [], touches: [], timeline: [], audits: [], console: [] };
  window.__ep = ep;
  // Sounds are fetched into blobs (one-shots) or array buffers (loops) before they play: remember where each came from.
  const from = new Map();
  const bufferFrom = new WeakMap();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); try { Object.defineProperty(b, '__src', { value: this.url }); } catch { /* ignore */ } return b; };
  const arrayBuffer = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = async function () { const b = await arrayBuffer.call(this); bufferFrom.set(b, this.url); return b; };
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
      if (el.paused || !el.getAttribute('src')) { c.how = el.ended ? 'ended' : 'cut'; c.t1 = abs(); els.splice(i, 1); }
    }
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const c = { id: name(this.currentSrc || this.src), t0: abs(), t1: null, how: null, dur: null, vol: this.volume, loop: false };
    ep.clips.push(c);
    els.push([c, this]);
    const end = (how) => { if (c.how) return; c.how = how; c.t1 = abs(); c.dur = Number.isFinite(this.duration) ? this.duration : null; };
    this.addEventListener('ended', () => end('ended'));
    // A clip that plays out pauses just before it ends: a pause at its end is an ending, not a cut.
    this.addEventListener('pause', () => { if (this.ended || (Number.isFinite(this.duration) && this.currentTime >= this.duration - 0.08)) end('ended'); else end('cut'); });
    this.addEventListener('error', () => end('error'));
    this.addEventListener('emptied', () => end('cut'));
    this.addEventListener('abort', () => end('cut'));
    const p = play.call(this);
    if (p && p.catch) p.catch((e) => end(`refused:${e && e.name}`));
    return p;
  };
  // Loops play through Web Audio (audio/loopPlayer.web.ts): a buffer source started and stopped.
  if (window.AudioContext) {
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (data, ...rest) {
      const url = bufferFrom.get(data);
      const p = decode.call(this, data, ...rest);
      if (p && p.then) p.then((b) => { try { Object.defineProperty(b, '__src', { value: url }); } catch { /* ignore */ } }).catch(() => {});
      return p;
    };
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...a) {
      const c = { id: name(this.buffer && this.buffer.__src), t0: abs(), t1: null, how: null, dur: this.buffer ? this.buffer.duration : null, vol: null, loop: true };
      this.__clip = c;
      ep.clips.push(c);
      return start.apply(this, a);
    };
    AudioBufferSourceNode.prototype.stop = function (...a) {
      if (this.__clip && !this.__clip.how) { this.__clip.how = 'stopped'; this.__clip.t1 = abs(); }
      return stop.apply(this, a);
    };
  }
  // Touches, and how long the touched control takes to change (a DOM change inside it, by an element that was
  // not already changing: idle pulses do not count).
  const recent = new WeakMap();
  let pending = [];
  const control = (el) => (el && el.closest ? el.closest('[role="button"],[data-testid],[aria-label]') : null);
  const touch = (type) => (e) => {
    const t = control(e.target);
    const rec = { t: abs(), type, id: t ? t.getAttribute('data-testid') : null, label: t ? t.getAttribute('aria-label') : null, off: t ? t.getAttribute('aria-disabled') === 'true' : null, self: null, any: null };
    ep.touches.push(rec);
    if (type !== 'start') return;
    // The control and what holds it (a control that goes away changes its parent, not itself).
    const near = [];
    for (let a = t, i = 0; a && i < 4; a = a.parentElement, i++) near.push(a);
    pending.push({ rec, el: t, near, t: performance.now() });
    if (pending.length > 6) pending.shift();
  };
  document.addEventListener('touchstart', touch('start'), true);
  document.addEventListener('touchend', touch('end'), true);
  const observe = () => new MutationObserver((list) => {
    const now = performance.now();
    for (const m of list) {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!el) continue;
      // An element that changed four times in the 300 ms before the touch is animating by itself (a pulse).
      const ring = recent.get(el) ?? [];
      for (const p of pending) {
        if (now < p.t || now - p.t > 3000) continue;
        const busy = ring.length >= 4 && ring[ring.length - 4] > p.t - 300 && ring[ring.length - 1] < p.t;
        if (busy) continue;
        if (p.rec.any === null) p.rec.any = Math.round(now - p.t);
        if (p.rec.self === null && p.el && (p.el.contains(el) || p.near.includes(el))) p.rec.self = Math.round(now - p.t);
      }
      ring.push(now);
      if (ring.length > 4) ring.shift();
      recent.set(el, ring);
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe);

  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  const probe = () => { try { return globalThis.__eqProbe ? globalThis.__eqProbe.elevator() : null; } catch { return null; } };
  /** What a child could press now to get on (not Settings, not the directory). */
  const live = () => {
    const out = new Set();
    const q = (sel) => [...document.querySelectorAll(sel)].filter((e) => shown(e) && e.getAttribute('aria-disabled') !== 'true');
    if (q('[data-testid="next-job"],[aria-label="NEXT JOB"]').length) out.add('next');
    if (q('[data-testid="reading-note-close"],[data-testid="reading-note-open"]').length) out.add('note');
    if (q('[data-testid^="reading-choice-"]').length) out.add('cards');
    if (q('[data-testid^="landing-touch-"]').length) out.add('touch');
    if (q('[data-testid^="shaft-floor-"]').length) out.add('plan');
    if (q('[aria-label="GO"]').length) out.add('meter');
    if (q('[aria-label="Load crate"],[aria-label="Unload crate"]').length) out.add('crates');
    if (q('[aria-label^="Help"]').length) out.add('help');
    if (q('[aria-label="LET\'S COUNT"]').length) out.add('count');
    if (q('[aria-label="Count it together"] [role="button"],[aria-label="Test run"] [role="button"]').length) out.add('board');
    if (q('[data-testid^="minigame-host-"],[data-testid="word-golf"],[data-testid="cargo-commander"],[data-testid="tower-rescue"],[data-testid="express"],[data-testid="strike"]').length) out.add('game');
    if (q('[data-testid="directory-sheet"]').length) out.add('directory');
    return [...out].sort();
  };
  let lastSig = '';
  setInterval(() => {
    const p = probe();
    if (!p) return;
    const controls = live();
    const sig = `${p.stage}|${p.phase}|${p.floor}|${p.stepId}|${p.panelEnabled ? 1 : 0}|${p.miniGame ? p.miniGame.id : ''}|${controls.join(',')}|${p.lifty}`;
    if (sig === lastSig) return;
    lastSig = sig;
    ep.timeline.push({ t: abs(), stage: p.stage, phase: p.phase, floor: p.floor, step: p.stepId, panel: !!p.panelEnabled, game: p.miniGame ? p.miniGame.id : null, basement: !!p.basement, controls, lifty: p.lifty });
  }, 100);

  window.__epSettle = settle;
  /** Everything the children look at, in one read. */
  window.__epState = () => {
    const ids = {};
    const order = [];
    for (const e of document.querySelectorAll('[data-testid]')) {
      const id = e.getAttribute('data-testid');
      if (id in ids) continue;
      const r = e.getBoundingClientRect();
      ids[id] = { off: e.getAttribute('aria-disabled') === 'true', label: e.getAttribute('aria-label'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      order.push(id);
    }
    const labels = [];
    for (const e of document.querySelectorAll('[aria-label]')) {
      const r = shown(e);
      if (!r) continue;
      const scope = e.closest('[aria-label="Elevator control panel"]') ? 'panel' : e.closest('[aria-label="Count it together"],[aria-label="Test run"]') ? 'board' : e.closest('[data-testid="directory-sheet"]') ? 'directory' : '';
      labels.push({ label: e.getAttribute('aria-label'), role: e.getAttribute('role'), off: e.getAttribute('aria-disabled') === 'true', id: e.getAttribute('data-testid'), scope, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height });
    }
    settle();
    const playing = ep.clips.filter((c) => !c.how && !c.loop).map((c) => c.id);
    return { t: abs(), ids, order, labels, text: document.body.innerText.replace(/\s+/g, ' '), probe: probe(), playing, live: live() };
  };
  /** Small controls, text cut off by its box, and red, on the screen as it stands. */
  window.__epAudit = (minTarget) => {
    const small = [];
    const cut = [];
    const red = [];
    const vw = innerWidth, vh = innerHeight;
    const onScreen = (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
    const hit = (e, r) => { const top = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.x + r.width / 2)), Math.min(vh - 1, Math.max(0, r.y + r.height / 2))); return !!top && (e.contains(top) || top.contains(e)); };
    for (const e of document.querySelectorAll('[role="button"],[role="radio"],[role="slider"]')) {
      const r = e.getBoundingClientRect();
      if (!onScreen(r) || !hit(e, r)) continue;
      if (Math.min(r.width, r.height) < minTarget - 0.5) small.push({ what: e.getAttribute('aria-label') || e.getAttribute('data-testid') || e.innerText.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), off: e.getAttribute('aria-disabled') === 'true' });
    }
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const e = n.parentElement;
      if (!e || seen.has(e) || !n.textContent.trim()) continue;
      seen.add(e);
      const r = e.getBoundingClientRect();
      if (!onScreen(r)) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      // Cut by its own box (an ellipsis or a clipped line), or by a clipping ancestor that does not scroll.
      const own = (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
      let clipped = null;
      for (let a = e.parentElement, depth = 0; a && depth < 8 && !clipped; a = a.parentElement, depth++) {
        const as = getComputedStyle(a);
        if (as.overflowY === 'auto' || as.overflowY === 'scroll' || as.overflowX === 'auto' || as.overflowX === 'scroll') break;
        if (as.overflow === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.bottom > ar.bottom + 2 || r.right > ar.right + 2 || r.top < ar.top - 2 || r.left < ar.left - 2) clipped = { by: a.getAttribute('data-testid') || a.getAttribute('aria-label') || a.tagName, over: Math.round(Math.max(r.bottom - ar.bottom, r.right - ar.right, ar.top - r.top, ar.left - r.left)) };
      }
      if (own || clipped) cut.push({ text: e.innerText.replace(/\s+/g, ' ').slice(0, 70), own, clipped, size: parseFloat(cs.fontSize) });
      const rgb = (v) => (v.match(/[\d.]+/g) || []).map(Number);
      for (const [k, v] of [['text', cs.color], ['fill', cs.backgroundColor], ['border', cs.borderTopWidth !== '0px' ? cs.borderTopColor : '']]) {
        const [R, G, B, A = 1] = rgb(v || '');
        if (A > 0.5 && R > 170 && G < 100 && B < 100 && R - Math.max(G, B) > 90) red.push({ what: e.innerText.replace(/\s+/g, ' ').slice(0, 50), part: k, colour: v });
      }
    }
    for (const e of document.querySelectorAll('[role="button"],[data-testid]')) {
      const r = e.getBoundingClientRect();
      if (!onScreen(r)) continue;
      const cs = getComputedStyle(e);
      for (const [k, v] of [['fill', cs.backgroundColor], ['border', cs.borderTopWidth !== '0px' ? cs.borderTopColor : '']]) {
        const m = (v || '').match(/[\d.]+/g);
        if (!m) continue;
        const [R, G, B, A = 1] = m.map(Number);
        if (A > 0.5 && R > 170 && G < 100 && B < 100 && R - Math.max(G, B) > 90) red.push({ what: e.getAttribute('aria-label') || e.getAttribute('data-testid'), part: k, colour: v });
      }
    }
    return { small, cut, red };
  };
}

// ---------------------------------------------------------------- a child at a tablet
async function child(browser, base, who) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: false, reducedMotion: STILL ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const c = { who, ctx, page, base, errors: [], console: [], taps: 0, log: [], clips: [], touches: [], timeline: [], audits: [], auditSeen: new Set(), external: [], t0: Date.now(), ledger: [], reloads: [] };
  page.on('pageerror', (e) => c.errors.push({ at: r1(Date.now() - c.t0), message: `${e.name}: ${e.message}` }));
  page.on('console', (m) => { if (m.type() === 'error') c.console.push({ at: r1(Date.now() - c.t0), text: m.text().slice(0, 300) }); });
  // The game is offline: a request to another origin is a finding.
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base) || /^(data|blob):/.test(url)) return route.continue();
    c.external.push(url);
    return route.abort();
  });
  await page.addInitScript(instrument);
  c.cdp = await ctx.newCDPSession(page);
  c.state = () => page.evaluate(() => window.__epState());
  c.now = () => Date.now();
  c.note = (m) => { c.log.push({ at: r1(Date.now() - c.t0), m }); if (process.env.EP_VERBOSE) console.log(`    ${who} ${r1(Date.now() - c.t0)} s: ${m}`); };
  /** Move the page's logs into Node (they are lost on a reload). Times are epoch ms. */
  c.harvest = async () => {
    const got = await page.evaluate(() => {
      window.__epSettle();
      const ep = window.__ep;
      const done = ep.clips.filter((k) => k.how);
      ep.clips = ep.clips.filter((k) => !k.how);
      const out = { clips: done, touches: ep.touches.splice(0), timeline: ep.timeline.splice(0) };
      return out;
    }).catch(() => null);
    if (!got) return;
    c.clips.push(...got.clips);
    c.touches.push(...got.touches);
    c.timeline.push(...got.timeline);
  };
  /** At a reload or the end: clips still sounding are closed as cut by the page going away. */
  c.harvestAll = async (how) => {
    await page.evaluate((h) => { window.__epSettle(); for (const k of window.__ep.clips) if (!k.how) { k.how = h; k.t1 = performance.timeOrigin + performance.now(); } }, how).catch(() => null);
    await c.harvest();
  };
  c.wait = async (what, fn, ms = 30_000, every = 120) => {
    const end = Date.now() + ms;
    for (;;) {
      const s = await c.state();
      const v = await fn(s);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what} (stage ${s.probe?.stage}/${s.probe?.phase}, floor ${s.probe?.floor}, live: ${s.live.join(' ') || 'nothing'}; Lifty: ${String(s.probe?.lifty).slice(0, 90)})`);
      await sleep(every);
    }
  };
  /** A control by test id, or by its exact accessibility label (optionally inside the panel or the board). */
  c.find = (s, what, scope) => {
    if (s.ids[what]) return s.ids[what];
    return s.labels.find((l) => l.label === what && (scope === undefined || l.scope === scope)) ?? null;
  };
  c.at = async (what, scope) => {
    const e = c.find(await c.state(), what, scope);
    if (!e) throw new Error(`${what} is not on screen`);
    return e;
  };
  c.has = async (what, scope) => !!c.find(await c.state(), what, scope);
  c.tapAt = async (x, y) => { c.taps++; await page.touchscreen.tap(x, y); };
  c.tap = async (what, scope) => { const e = await c.at(what, scope); await c.tapAt(e.x, e.y); return e; };
  /** Two taps, as an impatient finger. */
  c.doubleTap = async (what, scope, gap = 80) => { const e = await c.at(what, scope); await c.tapAt(e.x, e.y); await sleep(gap); await c.tapAt(e.x, e.y); return e; };
  /** A held press: touch down, wait, lift (CDP touch events, as a finger). */
  c.press = async (what, ms, scope) => {
    const e = typeof what === 'string' ? await c.at(what, scope) : what;
    c.taps++;
    await c.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: e.x, y: e.y }] });
    await sleep(ms);
    await c.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  c.shot = async (name) => { fs.mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, `${who}-${W}x${H}${STILL ? '-still' : ''}${SOUND_OFF ? '-quiet' : ''}-${name}.png`); await page.screenshot({ path: f }).catch(() => null); return f; };
  c.probe = (fn, arg) => page.evaluate(([f, a]) => (globalThis.__eqProbe ? globalThis.__eqProbe[f](a) : null), [fn, arg ?? null]);
  /** Small controls, cut text and red, once per distinct screen (stage, controls, sheet). */
  c.audit = async (label) => {
    const s = await c.state();
    const key = `${s.probe?.stage}|${s.probe?.miniGame?.id ?? ''}|${s.live.join(',')}|${label ?? ''}`;
    if (c.auditSeen.has(key)) return;
    c.auditSeen.add(key);
    const a = await page.evaluate((m) => window.__epAudit(m), MIN_TARGET).catch(() => null);
    if (a && (a.small.length || a.cut.length || a.red.length)) c.audits.push({ at: r1(Date.now() - c.t0), screen: key, lifty: s.probe?.lifty ?? null, ...a });
  };
  c.open = async () => {
    await page.goto(`${base}?open=quest&e2e=1`, { waitUntil: 'load' });
    await c.wait('the game to load', (s) => s.probe && s.probe.stage !== 'loading', 180_000, 250);
  };
  /** Reload the page as a child's tablet would restart the app, keeping the logs. Returns what came back. */
  c.reload = async (why) => {
    await c.harvestAll('cut:reload');
    const before = { mission: await c.probe('mission').catch(() => null), records: (await c.probe('records').catch(() => [])) ?? [], elevator: await c.probe('elevator').catch(() => null) };
    await page.reload({ waitUntil: 'load' });
    await c.wait('the game after a reload', (s) => s.probe && s.probe.stage !== 'loading', 180_000, 250);
    await sleep(1200);
    const after = { mission: await c.probe('mission').catch(() => null), records: (await c.probe('records').catch(() => [])) ?? [], elevator: await c.probe('elevator').catch(() => null) };
    const r = {
      why, at: r1(Date.now() - c.t0),
      before: { stage: before.elevator?.stage, phase: before.elevator?.phase, floor: before.elevator?.floor, step: before.mission?.stepId, item: before.mission?.item, wrongTries: before.mission?.wrongTries, records: before.records.length, game: before.elevator?.miniGame?.id ?? null },
      after: { stage: after.elevator?.stage, phase: after.elevator?.phase, floor: after.elevator?.floor, step: after.mission?.stepId, item: after.mission?.item, wrongTries: after.mission?.wrongTries, records: after.records.length, game: after.elevator?.miniGame?.id ?? null, lifty: after.elevator?.lifty },
      sameInstance: before.mission?.instanceId === after.mission?.instanceId,
    };
    c.reloads.push(r);
    c.note(`reload (${why}): ${r.before.stage}/${r.before.phase} step ${r.before.step} -> ${r.after.stage}/${r.after.phase} step ${r.after.step}; records ${r.before.records} -> ${r.after.records}`);
    return r;
  };
  /** Learning records, world memory and settings of every learner, read from the page's own database image. */
  c.records = async () => {
    const images = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('kothari-learning');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const idb = req.result;
        const out = [];
        if (!idb.objectStoreNames.contains('sqlite-images')) return resolve(out);
        const cur = idb.transaction('sqlite-images', 'readonly').objectStore('sqlite-images').openCursor();
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
    const out = { rows: [], world: [], progression: [], unlocks: [], settings: [] };
    for (const img of images) {
      const db = new SQL.Database(Uint8Array.from(img.bytes));
      const all = (sql) => { try { const r = db.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((col, i) => [col, v[i]]))) : []; } catch (e) { return [{ error: String(e) }]; } };
      for (const r of all('SELECT seq, type, learner_id, mission_instance_id, occurred_at, payload FROM learning_events ORDER BY seq')) out.rows.push(r.error ? r : { seq: r.seq, type: r.type, learner: r.learner_id, mission: r.mission_instance_id, at: r.occurred_at, ...JSON.parse(r.payload) });
      out.world.push(...all('SELECT learner_id, memory_key, occurred_at FROM world_memory ORDER BY seq'));
      out.progression.push(...all('SELECT learner_id, opportunity_key, kind, from_tier, to_tier, increment FROM progression_events ORDER BY seq'));
      out.unlocks.push(...all('SELECT * FROM unlocks'));
      out.settings.push(...all('SELECT * FROM learner_settings'));
      db.close();
    }
    return out;
  };
  return c;
}

// ---------------------------------------------------------------- reading the game as a child would
/** Work out the job from Lifty's line (the givens), as a person would. Copied from scripts/web-e2e.js `job`. */
function job(t) {
  let m;
  if ((m = t.match(/We're on Floor (\d+)\. The repair kit is (\d+) floors (up|down)/)) || (m = t.match(/Floor (\d+)\. The toolbox is (\d+) floors (up|down)/))) return { kind: 'panel', from: +m[1], target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're at Floor (\d+)\. The spare parts are (\d+) floors (up|down)/))) return { kind: 'panel', from: +m[1], target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're (\d+) floors (above|below) the beacon\." The beacon is on Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/loading dock is (\d+) floors (above|below) Floor (\d+)/))) return { kind: 'panel', from: +m[3], target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/It can carry (\d+) units\. (\d+) are already aboard/))) return { kind: 'cargo', target: +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/Two orders: (\d+) crates for the crew, (\d+) for the roof/)) || (m = t.match(/Order one: (\d+) crates\. Order two: (\d+) crates/))) return { kind: 'cargo', target: +m[1] + +m[2], key: `Two orders: ${m[1]} and ${m[2]}` };
  if ((m = t.match(/First part done: Floor (\d+)\. Now (\d+) floors (up|down)/))) return { kind: 'panel', from: +m[1], target: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]), key: m[0], leg: 2 };
  if ((m = t.match(/from Floor (\d+), go (\d+) floors (up|down), then (\d+) floors (up|down)/))) return { kind: 'panel', from: +m[1], target: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]), final: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]) + (m[5] === 'up' ? +m[4] : -m[4]), key: m[0], leg: 1 };
  if ((m = t.match(/rode (\d+) floors (up|down) and got off here, on Floor (\d+)/))) return { kind: 'panel', from: +m[3], target: m[2] === 'up' ? +m[3] - +m[1] : +m[3] + +m[1], key: m[0] };
  if ((m = t.match(/(\d+) floors at a time\. The repair kit is at stop (\d+)/))) return { kind: 'panel', target: +m[1] * +m[2], key: m[0] };
  if ((m = t.match(/We're on Floor (\d+)\. The crew is on Floor (\d+)\. How many floors/))) return { kind: 'meter', target: Math.abs(+m[2] - +m[1]), key: m[0] };
  if ((m = t.match(/the hall lamps go ((?:\d+|\?)(?:, (?:\d+|\?))+)\. One lamp is out/))) {
    const terms = m[1].split(', ').map((x) => (x === '?' ? null : +x));
    const gap = terms.indexOf(null);
    const known = terms.findIndex((x, i) => x !== null && terms[i + 1] != null);
    const step = terms[known + 1] - terms[known];
    return { kind: 'panel', target: gap > 0 ? terms[gap - 1] + step : terms[gap + 1] - step, key: m[0] };
  }
  if ((m = t.match(/From Floor (\d+): one 10-floor jump (up|down), then (\d+) more floors/))) return { kind: 'panel', from: +m[1], target: +m[1] + (m[2] === 'up' ? 1 : -1) * (10 + +m[3]), key: m[0] };
  if ((m = t.match(/From Floor (\d+): one jump of 10 floors (up|down)/))) return { kind: 'panel', from: +m[1], target: +m[1] + (m[2] === 'up' ? 10 : -10), key: m[0] };
  if ((m = t.match(/from the bottom: one 10-floor jump up, then (\d+) more floors/))) return { kind: 'panel', target: 10 + +m[1], key: m[0] };
  if ((m = t.match(/Calls on Floors (\d+)(?:, (\d+))? and (\d+)\. Going (up|down) from Floor \d+, which do we reach (first|second|third)\?/))) {
    const calls = [m[1], m[2], m[3]].filter(Boolean).map(Number).sort((a, b) => (m[4] === 'up' ? a - b : b - a));
    return { kind: 'panel', target: calls[['first', 'second', 'third'].indexOf(m[5])], key: m[0] };
  }
  if ((m = t.match(/We've got a call on Floor (\d+)/))) return { kind: 'call', target: +m[1], key: m[0] };
  if (/Take us to Floor 15/.test(t)) return { kind: 'finale', target: 15, key: 'finale' };
  if (/Press DOOR OPEN to wake/.test(t)) return { kind: 'wake', key: 'wake' };
  return null;
}
const COMPLETE = /Engineer Rank 1\. Your Engineer Log is on the clipboard|is running again\. Ride anywhere/;

/** Which item a note shows: the one whose every sentence is on it, as a person reads it. */
function noteItem(noteText) {
  const t = norm(noteText);
  const hits = READING_ITEMS.filter((it) => it.words.passage.every((line) => t.includes(norm(line))));
  if (hits.length !== 1) throw new Error(`the note matches ${hits.length} reading items: ${t.slice(0, 160)}`);
  return hits[0];
}
const noteText = (c) => c.page.locator('[data-testid="reading-note"]').first().innerText().catch(() => '');

/** A wrong value for a job, as a guess a child might make (one off, inside the building, never the car's floor). */
function wrongFor(j, floorNow) {
  if (j.kind === 'cargo' || j.kind === 'meter') return j.target > 1 ? j.target - 1 : j.target + 1;
  for (const d of [1, -1, 2, -2, 3]) { const f = j.target + d; if (f >= 1 && f <= 20 && f !== floorNow && f !== j.from) return f; }
  return j.target === 20 ? 18 : j.target + 1;
}

// ---------------------------------------------------------------- hands on the controls
/** A floor on the panel: mark it on the shaft map first when the job takes a plan (D201), then press it. */
async function pressFloor(c, floor, { double = false } = {}) {
  const s = await c.state();
  if (s.ids[`shaft-floor-${floor}`] && !s.ids[`shaft-plan-${floor}`]) {
    await c.tap(`shaft-floor-${floor}`);
    await c.wait(`floor ${floor} marked on the shaft map`, (x) => x.ids[`shaft-plan-${floor}`], 5000).catch(() => null);
    await sleep(Math.min(600, 300 * PACE + 150));
  }
  if (double) await c.doubleTap(`Floor ${floor}`, 'panel'); else await c.tap(`Floor ${floor}`, 'panel');
}
async function setMeter(c, value, { double = false } = {}) {
  for (let guard = 0; guard < 40; guard++) {
    const s = await c.state();
    const now = Number(s.labels.find((l) => /^Trip meter: /.test(l.label))?.label.match(/(\d+) floors/)?.[1] ?? NaN);
    if (now === value) break;
    await c.tap(now < value || Number.isNaN(now) ? 'More floors' : 'Fewer floors');
    await sleep(120);
  }
  if (double) await c.doubleTap('GO'); else await c.tap('GO');
}
async function loadCrates(c, n, { double = false } = {}) {
  for (let guard = 0; guard < 40; guard++) {
    const s = await c.state();
    const loaded = Number(s.labels.find((l) => /^Car: /.test(l.label))?.label.match(/(\d+) crates loaded/)?.[1] ?? NaN);
    if (loaded === n) break;
    await c.tap(loaded < n || Number.isNaN(loaded) ? 'Load crate' : 'Unload crate');
    await sleep(160);
  }
  if (double) await c.doubleTap('DOOR CLOSE', 'panel'); else await c.tap('DOOR CLOSE', 'panel');
}
/** Give a value for a math job of any kind. */
async function give(c, j, value, opts = {}) {
  if (j.kind === 'meter') return setMeter(c, value, opts);
  if (j.kind === 'cargo') return loadCrates(c, value, opts);
  return pressFloor(c, value, opts);
}
/** Fold the note and give `value`: the thing on the landing, else its card (touch); a card; or a floor (ride). */
async function answerReading(c, item, value, opts = {}) {
  if (await c.has('reading-note')) { await c.tap('reading-note-close'); await sleep(500); }
  if (item.words.mode === 'ride') return pressFloor(c, value, opts);
  const s = await c.wait(`a way to answer ${value}`, (x) => (x.ids[`landing-touch-${value}`] || x.ids[`reading-choice-${value}`]) && x, 20_000);
  const id = s.ids[`landing-touch-${value}`] ? `landing-touch-${value}` : `reading-choice-${value}`;
  if (opts.double) await c.doubleTap(id); else await c.tap(id);
}

/**
 * LET'S COUNT and the TEST RUN board, worked as a child reads it: the next floor (or stop) after the last one
 * counted, the same way and the same size of step as the count so far, then the board's question. Counts are
 * presentation, never evidence. Returns the taps it made and how many the board refused.
 */
async function workBoard(c) {
  const out = { taps: 0, refused: 0 };
  const board = (s) => s.labels.filter((l) => l.scope === 'board' && l.role === 'button');
  const end = Date.now() + 120_000;
  let guess = { at: '', i: 0 };
  while (Date.now() < end) {
    const s = await c.state();
    if (s.probe?.stage !== 'rescue') return out;
    const cells = board(s);
    const floors = cells.map((l) => ({ ...l, n: Number(l.label.match(/^(?:Floor|Space) (\d+)/)?.[1] ?? NaN), start: /, start/.test(l.label), order: Number(l.label.match(/, (?:move|stop|counted|lamp|call|floor) (\d+)$/i)?.[1] ?? NaN), full: /already full/.test(l.label) })).filter((l) => !Number.isNaN(l.n));
    const choices = cells.filter((l) => /^\d+( more)?$/.test(l.label));
    const counted = floors.filter((f) => !Number.isNaN(f.order)).sort((a, b) => a.order - b.order);
    const origin = floors.find((f) => f.start);
    const before = `${counted.length}|${origin?.n}|${choices.length}|${s.probe.lifty}`;
    let tapped = null;
    const asking = /\?\s*$/.test(s.probe.lifty ?? '');
    if (choices.length) {
      // The board asks for a number: how many were counted (the trip), or what they came to (the load).
      const fill = floors.some((f) => /^Space/.test(f.label));
      const want = fill ? Math.max(0, ...counted.map((f) => f.order)) : counted.length;
      tapped = choices.find((ch) => Number(ch.label.match(/\d+/)[0]) === want) ?? choices[0];
    } else if (asking && counted.length) {
      // The board's question (where does the lift stop, which lamp is out): the last one counted.
      tapped = counted.at(-1);
    } else {
      const last = counted.at(-1) ?? origin;
      const empty = floors.filter((f) => !f.off && !f.full && Number.isNaN(f.order) && !f.start);
      // Where the count stands: a new part or a new count starts the guessing again.
      const here = `${origin?.n ?? 'bottom'}|${counted.length}`;
      if (here !== guess.at) guess = { at: here, i: 0 };
      let want;
      if (floors.some((f) => /^Space/.test(f.label))) want = empty.sort((x, y) => x.n - y.n)[0]?.n;
      else if (counted.length >= 2) want = last.n + (counted.at(-1).n - counted.at(-2).n);
      else if (counted.length === 1 && origin && guess.i === 0) want = last.n + (counted[0].n - origin.n);
      else {
        // The first count of a part: the floors next to the start (or the bottom of the shaft), nearest first.
        const tries = [1, -1, 2, -2, 5, -5, 10, -10, 3, -3, 4, -4].map((d) => (last?.n ?? 0) + d).filter((n) => floors.some((f) => f.n === n && !f.off));
        want = tries[guess.i % Math.max(1, tries.length)];
      }
      tapped = floors.find((f) => f.n === want && !f.off) ?? null;
    }
    if (!tapped) { await sleep(400); continue; }
    await c.tapAt(tapped.x, tapped.y);
    out.taps++;
    await sleep(STILL ? 350 : 650);
    if (choices.length || tapped === counted.at(-1)) await c.wait('the board to answer', (x) => x.probe.stage !== 'rescue' || x.probe.lifty !== s.probe.lifty, 5000).catch(() => null);
    const s2 = await c.state();
    if (s2.probe?.stage !== 'rescue') return out;
    const cells2 = board(s2);
    const counted2 = cells2.filter((l) => /, (?:move|stop|counted|lamp|call|floor) \d+$/i.test(l.label)).length;
    const after = `${counted2}|${cells2.find((l) => /, start/.test(l.label))?.label.match(/\d+/)?.[0]}|${cells2.filter((l) => /^\d+( more)?$/.test(l.label)).length}|${s2.probe.lifty}`;
    if (after === before || /right next to|Try the/i.test(s2.probe.lifty ?? '')) { out.refused++; guess.i++; }
    if (out.taps > 80) throw new Error(`the board would not finish (${out.taps} taps, ${out.refused} refused; Lifty: ${s2.probe.lifty})`);
  }
  throw new Error('the board did not finish in two minutes');
}

/** Sound and motion as a grown-up would set them, in Settings. */
async function settings(c) {
  if (!SOUND_OFF && !STILL) return;
  await c.tap('Settings');
  await c.page.getByText('Settings', { exact: true }).first().waitFor({ timeout: 5000 });
  if (SOUND_OFF) await c.page.getByText('Mute', { exact: true }).first().tap();
  if (STILL) await c.page.getByText('Reduced', { exact: true }).first().tap();
  await sleep(300);
  await c.audit('settings');
  await c.shot('settings');
  await c.tap('Done');
  await sleep(400);
}

/** Touch every explore spot on the open landing once; did the picture change, did Lifty speak, was anything recorded? */
async function touchLanding(c, { quietExpected }) {
  const s = await c.state();
  if (s.probe?.phase !== 'idleOpen') return [];
  const spots = s.order.filter((id) => /^landing-spot-|^secret-/.test(id));
  const out = [];
  for (const id of spots) {
    const st = await c.state();
    const e = st.ids[id];
    if (!e || e.w <= 0) continue;
    // A thing under another view (the cargo bay, a sheet) cannot be touched: say so, do not tap what covers it.
    const covered = await c.page.evaluate(([tid, x, y]) => { const el = document.querySelector(`[data-testid="${tid}"]`); const top = document.elementFromPoint(x, y); return !(el && top && (el.contains(top) || top.contains(el))); }, [id, e.x, e.y]);
    if (covered) { out.push({ floor: st.probe.basement ? 'B1' : st.probe.floor, id, covered: true, stage: st.probe.stage }); continue; }
    const clip = { x: Math.max(0, e.x - e.w / 2), y: Math.max(0, e.y - e.h / 2), width: Math.max(8, e.w), height: Math.max(8, e.h) };
    const recs = ((await c.probe('records')) ?? []).length;
    const stepBefore = st.probe.stepId;
    const lineBefore = st.probe.lifty;
    const a = await c.page.screenshot({ clip });
    const t = Date.now();
    await c.tapAt(e.x, e.y);
    await sleep(STILL ? 220 : 350);
    const b = await c.page.screenshot({ clip });
    const changed = await MG.pixelsChanged(c.page, a, b);
    await sleep(1400);
    const after = await c.state();
    if (after.ids['reading-card-close']) { await c.audit('landing card'); await c.tap('reading-card-close'); await sleep(400); }
    const recs2 = ((await c.probe('records')) ?? []).length;
    out.push({ floor: st.probe.basement ? 'B1' : st.probe.floor, id, w: Math.round(e.w), h: Math.round(e.h), changedPx: changed, spoke: after.probe.lifty !== lineBefore ? after.probe.lifty : null, newRecords: recs2 - recs, stepMoved: after.probe.stepId !== stepBefore, ms: Date.now() - t });
    if (recs2 !== recs) fail(c.who, `touching ${id} on floor ${st.probe.floor} wrote ${recs2 - recs} learning record(s)`);
    if (quietExpected && after.probe.stepId !== stepBefore) fail(c.who, `touching ${id} during a job moved the job on`);
    await sleep(500);
  }
  return out;
}


// ---------------------------------------------------------------- the mission, played by any child
const moving = (phase) => phase !== 'idleOpen' && phase !== 'idleClosed';
/** A small seeded generator: the same child every run. */
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/**
 * Plays Floor 15 from wherever the page is to the free ride (or `maxJobs` jobs). `o` is the child:
 *   think(words)      time before a decision            wrongFirst      miss each job once before answering
 *   double            two taps where one would do       onRide(s)       once a ride
 *   onNewLine(s)      once a new line of Lifty's        onSuccess(s,n)  NEXT JOB waits (job n done)
 *   at(moment, s)     a named awkward moment (call, planned, riding, note, folded, cargo, meter, jobDone, pause):
 *                     returns true when it reloaded the page (the loop then reads the page afresh)
 * Returns the jobs as played and the ledger of every answer it committed.
 */
async function playMission(c, o, R = {}) {
  Object.assign(R, { jobs: [], boards: [], misses: [], helps: [], fresh: [], changed: [], wrongPlace: [], lostJobs: [], gamesOpened: [], stuck: null, finished: false, nextJobs: 0 });
  let lastSig = '', lastChange = Date.now(), lastLine = '', rideSeen = false, lostSince = 0;
  const solved = new Set();
  let cur = null; // the job in hand: { step, kind, key, item, tries: [], helped: [], t0 }
  const think = o.think ?? (() => sleep(150));
  const at = async (moment, s) => (o.at ? !!(await o.at(moment, s)) : false);
  const commit = async (entry, act) => {
    const m = await c.probe('mission');
    const before = await c.state();
    await act();
    // An answer is committed when the game takes it. A floor locks when the car departs (the stage becomes the
    // ride; until then another floor replaces it and DOOR OPEN holds the car), or is judged in place; a load, a
    // card or a touched thing is judged at once (the stage or Lifty's words change).
    const floorAnswer = entry.kind === 'panel' || entry.kind === 'reading-ride' || entry.kind === 'meter';
    const took = await c.wait('the answer to be taken', (x) => (x.probe.stage !== before.probe.stage || (!floorAnswer && x.probe.lifty !== before.probe.lifty)) && x, floorAnswer ? 20_000 : 8000).catch(() => null);
    const rec = { at: r1(Date.now() - c.t0), step: m?.stepId ?? before.probe.stepId, item: m?.item ?? null, wrongTriesBefore: m?.wrongTries ?? null, boards: R.boards.length, ...entry, taken: !!took };
    // The item a miss left behind must be the item that waits now, except after a correction (LET'S COUNT brings
    // a fresh job, D149) and after a reading job's second miss (a fresh note).
    const prev = c.ledger.filter((l) => l.taken && l.step === rec.step).at(-1);
    if (prev && !prev.right && prev.leg !== 1 && prev.item && rec.item && prev.item !== rec.item) {
      const byDesign = prev.boards !== rec.boards || (/^reading/.test(prev.kind) && prev.wrongTriesBefore >= 1);
      R.changed.push({ step: rec.step, from: prev.key, to: entry.key, byDesign });
      if (!byDesign) fail(c.who, `a miss changed the item on ${rec.step} with no correction between (${prev.key} -> ${entry.key})`);
    } else if (prev && !prev.right && prev.leg !== 1 && rec.wrongTriesBefore !== null && prev.wrongTriesBefore !== null && rec.item === prev.item && rec.wrongTriesBefore !== prev.wrongTriesBefore + 1) {
      const twice = o.double && rec.wrongTriesBefore === prev.wrongTriesBefore + 2;
      // The judgement at the end expects what the game counted, so this is reported once, here.
      if (twice) prev.countedTwice = true;
      fail(c.who, twice ? `${rec.step}: one wrong ${prev.kind === 'cargo' ? 'load, DOOR CLOSE' : 'answer'} tapped twice, was counted as two misses` : `after a miss on ${rec.step} the item's misses read ${rec.wrongTriesBefore}, not ${prev.wrongTriesBefore + 1}`);
    }
    c.ledger.push(rec);
    if (cur) cur.tries.push(rec);
    c.note(`${entry.leg === 1 ? 'first part' : entry.right ? 'right' : 'WRONG'} ${entry.kind} ${entry.value}${took ? '' : ' (not taken)'}`);
    return rec;
  };
  for (;;) {
    if (Date.now() - c.t0 > RUN_LIMIT_MS) throw new Error(`ran past ${RUN_LIMIT_MS / 60000} minutes with ${solved.size} jobs solved`);
    await sleep(180);
    const s = await c.state();
    const p = s.probe;
    if (!p) continue;
    const sig = `${p.stage}|${p.phase}|${p.floor}|${p.stepId}|${p.lifty}|${s.live.join(',')}`;
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
    else if (Date.now() - lastChange > STUCK_MS) {
      R.stuck = { at: r1(Date.now() - c.t0), stage: p.stage, phase: p.phase, step: p.stepId, live: s.live, lifty: p.lifty, shot: await c.shot(`stuck-${p.stepId}`) };
      throw new Error(`nothing it knows how to press for ${STUCK_MS / 1000} s (stage ${p.stage}/${p.phase}, step ${p.stepId}, live: ${s.live.join(' ') || 'nothing'}; Lifty: ${String(p.lifty).slice(0, 100)})`);
    }
    if (p.lifty !== lastLine) { lastLine = p.lifty; await c.audit(); if (o.onNewLine) await o.onNewLine(s); }
    if (p.stage === 'error') throw new Error(`the game stopped with its trouble screen: ${s.text.slice(0, 200)}`);
    if (p.stage === 'freeRide' || p.stage === 'complete' || COMPLETE.test(s.text)) {
      if (p.stage !== 'freeRide') { await sleep(500); continue; }
      R.finished = true;
      return R;
    }
    if (p.miniGame) {
      // Nobody meant to open a game: a second tap landed on the entrance that took another button's place.
      await sleep(1500);
      const g = await c.state();
      const last = c.touches.filter((t) => t.type === 'start').at(-1) ?? (await c.harvest(), c.touches.filter((t) => t.type === 'start').at(-1));
      R.gamesOpened.push({ game: p.miniGame.id, step: p.stepId, stage: p.stage, by: last?.label ?? last?.id ?? null, shot: await c.shot(`game-opened-by-second-tap-${R.gamesOpened.length}`) });
      fail(c.who, `a mini-game (${p.miniGame.id}) opened during ${p.stage} on ${p.stepId} from a tap meant for another button`);
      const back = ['minigame-back', 'wg-back'].find((x) => g.ids[x]) ?? g.labels.find((l) => /BACK TO ELEVATOR/i.test(l.label ?? ''))?.label;
      if (!back) throw new Error(`in ${p.miniGame.id} with no BACK TO ELEVATOR on screen`);
      await c.tap(back);
      await c.wait('the elevator again', (x) => !x.probe.miniGame, 20_000);
      continue;
    }
    if (moving(p.phase)) {
      if (!rideSeen) { rideSeen = true; if (await at('riding', s)) { cur = null; rideSeen = false; continue; } if (o.onRide) await o.onRide(s); }
      continue;
    }
    rideSeen = false;
    if (p.stage === 'intro') {
      if (!/Press DOOR OPEN to wake/.test(s.text)) continue;
      if (await at('intro', s)) continue;
      await think(p.lifty.split(' ').length);
      await c.tap('DOOR OPEN', 'panel');
      await sleep(1500);
      continue;
    }
    if (p.stage === 'rescue') {
      await c.audit('board');
      if (await at('board', s)) continue;
      await think(p.lifty.split(' ').length);
      const b = await workBoard(c);
      R.boards.push({ step: p.stepId, ...b });
      c.note(`board done: ${b.taps} taps, ${b.refused} refused`);
      continue;
    }
    const lets = s.labels.find((l) => /^(Help( ready)?: )?LET'S COUNT$/i.test(l.label) && !l.off);
    if (lets) {
      if (await at('pause', s)) continue;
      await think(p.lifty.split(' ').length);
      await c.tapAt(lets.x, lets.y);
      await c.wait('the counting board', (x) => x.probe.stage === 'rescue', 8000).catch(() => null);
      continue;
    }
    // NEXT JOB: the big button low in the cabin, or the small one in the help slot while a thing waits to be loaded.
    const next = s.ids['next-job'] ?? s.labels.find((l) => l.label === 'NEXT JOB' && !l.off);
    if (next && p.stage === 'success') {
      if (cur) { cur.solvedAt = r1(Date.now() - c.t0); R.jobs.push(cur); cur = null; }
      const first = !solved.has(p.stepId);
      solved.add(p.stepId);
      if (first && o.onSuccess) await o.onSuccess(s, solved.size);
      if (await at('jobDone', s)) continue;
      if (solved.size >= MAX_JOBS) return R;
      await think(p.lifty.split(' ').length);
      const stepBefore = p.stepId;
      const again = await c.state();
      const btn = again.ids['next-job'] ?? again.labels.find((l) => l.label === 'NEXT JOB' && !l.off) ?? next;
      await c.tapAt(btn.x, btn.y);
      if (o.double) { await sleep(80); await c.tapAt(btn.x, btn.y); }
      R.nextJobs++;
      await c.wait('the next job', (x) => !x.live.includes('next') || x.probe.stepId !== stepBefore, 10_000).catch(() => null);
      if (o.double) {
        // Where did the second tap land? NEXT JOB can sit in the help slot: the next job's help button takes its place.
        await sleep(400);
        await c.harvest();
        const last = c.touches.filter((t) => t.type === 'start').at(-1);
        if (last && /^Help/.test(last.label ?? '')) {
          const m = await c.probe('mission');
          R.helps.push({ step: m?.stepId ?? null, key: null, help: last.label.replace(/^Help( ready)?: /, ''), offered: false, accidental: true, itemBefore: m?.item ?? null });
          c.note(`the second tap on NEXT JOB pressed ${last.label} on ${m?.stepId}`);
          fail(c.who, `a double tap on NEXT JOB (in the help slot) pressed ${last.label} on the next job (${m?.stepId}): help taken that nobody asked for`);
        }
      }
      continue;
    }
    // A reading job: its note is open, or folded with its things, cards or panel waiting.
    const reading = s.ids['reading-note'] || s.ids['reading-note-open'];
    if (reading && p.stage === 'task') {
      if (!s.ids['reading-note']) { await c.tap('reading-note-open'); await sleep(500); }
      const item = noteItem(await noteText(c));
      if (!cur || cur.key !== item.id) {
        if (cur) R.jobs.push(cur);
        cur = { step: p.stepId, kind: `reading-${item.words.mode}`, key: item.id, tries: [], helped: [], shownAt: r1(Date.now() - c.t0) };
        await c.audit('note');
        if (await at('note', s)) { cur = null; continue; }
        await think(item.words.passage.join(' ').split(' ').length + item.words.ask.split(' ').length);
      }
      const missed = cur.tries.filter((t) => t.taken && !t.right).length;
      // A touch job needs its things (or its cards) once the note is folded: look before answering.
      if (item.words.mode !== 'ride') {
        if (await c.has('reading-note')) { await c.tap('reading-note-close'); await sleep(500); }
        const can = await c.wait('things or cards to answer with', (x) => x.order.some((id) => /^landing-touch-|^reading-choice-/.test(id)), 4000).catch(() => null);
        const fs1 = await c.state();
        if (!can && fs1.probe.stage === 'task') {
          if (R.lostJobs.length >= 8) throw new Error(`${p.stepId}: nothing to touch and no card, again`);
          R.lostJobs.push({ step: p.stepId, at: r1(Date.now() - c.t0), lifty: fs1.probe.lifty, floor: fs1.probe.floor, nothingToTouch: item.id, shot: await c.shot(`nothing-to-touch-${p.stepId}`) });
          fail(c.who, `${p.stepId}: "${item.words.ask}" on Floor ${fs1.probe.floor}, where there is nothing to touch and no card (stranded until the app restarts)`);
          await c.reload('nothing to touch for a touch job');
          cur = null;
          continue;
        }
      }
      if (o.wrongFirst && missed === 0) {
        const wrong = item.words.mode === 'ride' ? wrongFor({ kind: 'panel', target: item.correct }, p.floor) : item.wrong[0];
        await commit({ kind: cur.kind, key: item.id, value: wrong, right: false }, () => answerReading(c, item, wrong, { double: o.double }));
        continue;
      }
      if (o.wrongFirst && missed === 1 && !cur.helped.length) {
        // The help offered after a miss: CLUE (the note's key line), recorded as a clue.
        const clue = s.labels.find((l) => /^Help( ready)?: CLUE$/.test(l.label) && !l.off);
        if (clue) { await c.tapAt(clue.x, clue.y); cur.helped.push('CLUE'); R.helps.push({ step: p.stepId, key: item.id, help: 'CLUE', offered: /ready/.test(clue.label), itemBefore: (await c.probe('mission'))?.item ?? null }); await sleep(900); await c.audit('clue'); }
      }
      if (await c.has('reading-note')) { await c.tap('reading-note-close'); await sleep(400); }
      if (await at('folded', await c.state())) { continue; }
      await commit({ kind: cur.kind, key: item.id, value: item.correct, right: true }, () => answerReading(c, item, item.correct, { double: o.double }));
      continue;
    }
    // After a miss the job's own words leave Lifty's bubble (the consequence takes their place): the job in hand
    // is still the job, as long as the step and the item are the same.
    const j = job(s.text) ?? (cur && cur.job && cur.step === p.stepId && (p.stage === 'task' || p.stage === 'cargo') && cur.item === (await c.probe('mission'))?.item ? cur.job : null);
    if (!j) {
      // A job is waiting for an answer and its words are nowhere on the screen (another line took their place
      // and never gave it back). A child is stranded here; the script notes it and restarts the app to go on.
      const waiting = (p.stage === 'task' || p.stage === 'cargo') && !moving(p.phase) && (p.panelEnabled || s.live.includes('plan') || s.live.includes('meter') || s.live.includes('crates'));
      if (!waiting) { lostSince = 0; continue; }
      if (!lostSince) lostSince = Date.now();
      if (Date.now() - lostSince > 12_000 && R.lostJobs.length < 8) {
        const lost = { step: p.stepId, at: r1(Date.now() - c.t0), lifty: p.lifty, floor: p.floor, shot: await c.shot(`job-words-gone-${p.stepId}-${R.lostJobs.length}`) };
        R.lostJobs.push(lost);
        fail(c.who, `${p.stepId}: a job waits and its words are not on screen for 12 s (Lifty: "${String(p.lifty).slice(0, 80)}")`);
        await c.reload('the job words were gone');
        lostSince = 0;
        cur = null;
      }
      continue;
    }
    lostSince = 0;
    const open = p.panelEnabled || s.live.includes('plan') || s.live.includes('meter') || s.live.includes('crates');
    if (!open) continue;
    if (j.kind === 'call' || j.kind === 'finale') {
      if (p.stage !== 'call' && p.stage !== 'finale') continue;
      if (await at(j.kind, s)) continue;
      await think(p.lifty.split(' ').length);
      if (o.double) await c.doubleTap(`Floor ${j.target}`, 'panel'); else await c.tap(`Floor ${j.target}`, 'panel');
      await c.wait('the car to leave', (x) => moving(x.probe.phase) || x.probe.stage !== p.stage, 8000).catch(() => null);
      continue;
    }
    if (p.stage !== 'task' && p.stage !== 'cargo') continue;
    if (!cur || (cur.key !== j.key && !(cur.leg === 1 && j.leg === 2))) {
      if (cur) R.jobs.push(cur);
      const fresh = R.boards.some((b) => b.step === p.stepId);
      const size = (x) => (x.kind === 'panel' && x.from !== undefined ? Math.abs((x.final ?? x.target) - x.from) : x.kind === 'panel' ? null : x.target);
      if (fresh && cur && cur.step === p.stepId && cur.job) R.fresh.push({ step: p.stepId, missed: cur.key, fresh: j.key, missedSize: size(cur.job), freshSize: size(j) });
      cur = { step: p.stepId, kind: j.kind, key: j.key, job: j, item: (await c.probe('mission'))?.item ?? null, leg: j.leg ?? null, tries: [], helped: [], shownAt: r1(Date.now() - c.t0), fresh, missFresh: fresh && R.boards.length % 2 === 1 };
      if (j.kind === 'panel' && j.from !== undefined && !fresh && /We're (on|at) Floor|^Floor \d+\. The toolbox|From Floor|from Floor|where we are now/.test(j.key) && p.floor !== j.from) {
        const w = { step: p.stepId, says: j.from, carAt: p.floor, line: j.key, shot: await c.shot(`wrong-place-${p.stepId}`) };
        R.wrongPlace.push(w);
        fail(c.who, `${p.stepId}: the job says Floor ${j.from} ("${j.key.slice(0, 60)}") and the car stands on Floor ${p.floor}`);
      }
      await c.audit(j.kind);
      await think(p.lifty.split(' ').length);
    } else if (cur.leg === 1 && j.leg === 2) { cur.leg = 2; await think(8); }
    const missed = cur.tries.filter((t) => t.taken && !t.right).length;
    // Wrong first: once on every job; and once more on the fresh job after a correction on every second job,
    // followed by the help that is offered, so the ordinary ladder is seen as well as the correction.
    const wantMiss = o.wrongFirst && j.leg !== 2 && missed === 0 && (!cur.fresh || cur.missFresh);
    if (wantMiss) {
      const wrong = wrongFor(j, p.floor);
      const rec = await commit({ kind: j.kind, key: j.key, value: wrong, right: false, target: j.target }, () => give(c, j, wrong, { double: o.double }));
      if (rec.taken) R.misses.push({ step: p.stepId, key: j.key, item: rec.item, fresh: cur.fresh });
      continue;
    }
    if (o.wrongFirst && missed >= 1 && !cur.helped.length && (cur.fresh || j.kind === 'cargo' || p.stage === 'cargo' || !/LET'S COUNT/.test(s.text))) {
      const help = s.labels.find((l) => /^Help( ready)?: (?!LET'S COUNT)/.test(l.label) && !l.off);
      if (help) {
        const m0 = await c.probe('mission');
        await c.tapAt(help.x, help.y);
        cur.helped.push(help.label);
        R.helps.push({ step: p.stepId, key: j.key, help: help.label.replace(/^Help( ready)?: /, ''), offered: /ready/.test(help.label), itemBefore: m0?.item ?? null });
        await sleep(1100);
        await c.audit('help');
        const m1 = await c.probe('mission');
        if (m0 && m1 && m0.item !== m1.item) fail(c.who, `asking for ${help.label} changed the item on ${p.stepId}`);
      }
    }
    if (j.kind === 'panel' && s.live.includes('plan') && !s.ids[`shaft-plan-${j.target}`]) {
      await c.tap(`shaft-floor-${j.target}`);
      await c.wait('the floor marked', (x) => x.ids[`shaft-plan-${j.target}`], 5000).catch(() => null);
      if (await at('planned', await c.state())) continue;
    }
    if (j.kind === 'cargo' && o.at) {
      await c.tap('Load crate').catch(() => null);
      await sleep(300);
      if (await at('cargo', await c.state())) continue;
    }
    if (j.kind === 'meter' && o.at) {
      await c.tap('More floors').catch(() => null);
      await sleep(300);
      if (await at('meter', await c.state())) continue;
    }
    await commit({ kind: j.kind, key: j.key, value: j.target, right: j.leg !== 1, leg: j.leg ?? null, target: j.target }, () => give(c, j, j.target, { double: o.double }));
  }
}

// ---------------------------------------------------------------- the engineer
async function engineer(c, out) {
  const rnd = rng(15);
  Object.assign(out, { landings: [], mission: null });
  const think = async (words = 0) => { if (PACE > 0) await sleep(PACE * (Math.min(7000, words * READ_MS) + 1500 + rnd() * 2500)); else await sleep(120); };
  let explored = 0;
  out.mission = {};
  await playMission(c, {
    think,
    onSuccess: async (s, n) => {
      // A few landings on the way: the first three jobs solved, every thing on the landing touched once.
      if (!PARTS.has('landings') || explored >= 3 || !s.order.some((id) => id.startsWith('landing-spot-'))) return;
      explored++;
      await think(4);
      out.landings.push(...(await touchLanding(c, { quietExpected: false })).map((t) => ({ ...t, afterJob: n })));
    },
  }, out.mission);
  return out;
}

// ---------------------------------------------------------------- the guesser
async function guesser(c, out) {
  const rnd = rng(7);
  Object.assign(out, { mission: null, mashes: [] });
  const think = async () => sleep(250 + rnd() * 350);
  let mashedAt = '';
  const mash = async (why) => {
    // Once for each ride and each new line of a job, not once for every time the doors try to close.
    const key = `${c.ledger.length}|${(await c.state()).probe.stepId}|${why}`;
    if (key === mashedAt) return;
    mashedAt = key;
    // Presses that are not answers: other floors, the door buttons, B1, the directory plate. Nothing may be recorded.
    const s = await c.state();
    const floors = [3, 17, 9, 20].filter((f) => f !== s.probe.floor);
    for (const f of floors.slice(0, 3)) { const e = c.find(s, `Floor ${f}`, 'panel'); if (e) { await c.tapAt(e.x, e.y); await sleep(70); } }
    for (const l of ['DOOR OPEN', 'DOOR CLOSE', 'B1, bowling']) { const e = c.find(s, l, 'panel'); if (e) { await c.tapAt(e.x, e.y); await sleep(70); } }
    await sleep(400);
    const after = await c.state();
    // What the records make of these presses is judged at the end, item by item (judgeRecords).
    out.mashes.push({ why, at: r1(Date.now() - c.t0), stage: s.probe.stage, phase: s.probe.phase, then: `${after.probe.stage}/${after.probe.phase}`, line: after.probe.lifty !== s.probe.lifty ? after.probe.lifty : null });
  };
  out.mission = {};
  await playMission(c, {
    think,
    wrongFirst: true,
    double: true,
    onRide: PARTS.has('chaos') ? async () => { await sleep(500); await mash('while the lift moves'); } : undefined,
    onNewLine: PARTS.has('chaos') ? async (s) => { if (['pause', 'success', 'reposition'].includes(s.probe.stage) && rnd() < 0.6) await mash(`while a new line is up (${s.probe.stage})`); } : undefined,
  }, out.mission);
  return out;
}

// ---------------------------------------------------------------- the explorer
/** Ride the free lift to a floor (or 'B1') and wait for the doors. */
async function rideFree(c, floor) {
  const s = await c.state();
  if (floor === 'B1') { if (!s.probe.basement) await c.tap('panel-b1'); }
  else if (s.probe.floor !== floor || s.probe.basement) await c.tap(`Floor ${floor}`, 'panel');
  else return;
  await c.wait(`floor ${floor}`, (x) => x.probe.phase === 'idleOpen' && x.probe.destination === null && (floor === 'B1' ? x.probe.basement : x.probe.floor === floor && !x.probe.basement), 60_000);
  await sleep(900);
}

async function explorer(c, out) {
  Object.assign(out, { idle: [], chaos: null, landings: [], reloads: [], games: [], free: null, mission: null });
  const recs = async () => ((await c.probe('records')) ?? []).length;
  /** Sixty idle seconds: does the game move on, speak, or play a sound nobody asked for? */
  const idle = async (where) => {
    await c.harvest();
    const s0 = await c.state();
    const t = Date.now();
    const r0 = await recs();
    await sleep(60_000);
    await c.harvest();
    const s1 = await c.state();
    const sounds = c.clips.filter((k) => k.t0 >= t + 1500 && !k.loop).map((k) => k.id);
    const lines = c.timeline.filter((x) => x.t >= t + 1500).map((x) => x.lifty).filter((l, i, a) => l !== s0.probe.lifty && a.indexOf(l) === i);
    const res = { where, stage: s0.probe.stage, movedOn: s1.probe.stage !== s0.probe.stage || s1.probe.stepId !== s0.probe.stepId || s1.probe.floor !== s0.probe.floor, newLines: lines, sounds, records: (await recs()) - r0, shot: await c.shot(`idle-${where}`) };
    out.idle.push(res);
    if (res.movedOn) fail(c.who, `a minute idle (${where}) moved the game on: ${s0.probe.stage} step ${s0.probe.stepId} floor ${s0.probe.floor} -> ${s1.probe.stage} step ${s1.probe.stepId} floor ${s1.probe.floor}`);
    if (res.records) fail(c.who, `a minute idle (${where}) wrote ${res.records} learning record(s)`);
    c.note(`idle ${where}: moved on ${res.movedOn}, new lines ${lines.length}, sounds ${sounds.length}`);
  };
  /** Everything but the job, at the first hall call. */
  const chaos = async () => {
    const res = { floorPresses: 0, refused: 0, rodeTo: [], doorCycles: 0, directory: null, records: 0, lines: [] };
    const r0 = await recs();
    const s = await c.state();
    const call = job(s.text);
    for (let f = 20; f >= 1; f--) {
      if (call && f === call.target) continue;
      const e = c.find(await c.state(), `Floor ${f}`, 'panel');
      if (!e) continue;
      await c.tapAt(e.x, e.y);
      res.floorPresses++;
      await sleep(140);
      const st = await c.state();
      if (moving(st.probe.phase)) { res.rodeTo.push(f); await c.wait('the ride to end', (x) => !moving(x.probe.phase), 40_000); }
      else res.refused++;
      if (!res.lines.includes(st.probe.lifty)) res.lines.push(st.probe.lifty);
    }
    await c.shot('chaos-floors');
    for (let i = 0; i < 12; i++) { await c.tap(i % 2 ? 'DOOR OPEN' : 'DOOR CLOSE', 'panel'); res.doorCycles++; await sleep(i % 3 === 0 ? 90 : 420); }
    await c.wait('the doors to settle open', (x) => x.probe.phase === 'idleOpen', 30_000).catch(() => null);
    const sd = await c.state();
    res.afterDoors = { phase: sd.probe.phase, stage: sd.probe.stage, floor: sd.probe.floor };
    // B1 and the directory during a call.
    await c.tap('panel-b1').catch(() => null);
    await sleep(900);
    res.b1Line = (await c.state()).probe.lifty;
    if (await c.has('directory-button')) {
      await c.tap('directory-button');
      await sleep(900);
      await c.audit('directory');
      const sheet = await c.state();
      res.directory = { opened: !!sheet.ids['directory-sheet'], shot: await c.shot('directory') };
      if (sheet.ids['directory-view']) { await c.tap('directory-view'); await sleep(700); await c.audit('map'); await c.shot('map'); await c.tap('directory-view'); await sleep(400); }
      if (sheet.ids['directory-back']) await c.tap('directory-back');
      await sleep(600);
    }
    res.records = (await recs()) - r0;
    if (res.records) fail(c.who, `pressing everything but the call wrote ${res.records} learning record(s)`);
    out.chaos = res;
    c.note(`chaos: ${res.floorPresses} floors (${res.refused} refused, rode to ${res.rodeTo.join(' ') || 'none'}), ${res.doorCycles} door presses, records ${res.records}`);
  };
  /** Open the game this landing offers, do something in it that is not an answer, optionally reload inside, leave. */
  const visitGame = async (reloadInside) => {
    const s = await c.state();
    const id = s.order.find((x) => x.startsWith('minigame-entrance-'));
    if (!id) return null;
    const res = { game: id.slice(18), floor: s.probe.basement ? 'B1' : s.probe.floor, stage: s.probe.stage, label: s.ids[id].label, w: Math.round(s.ids[id].w), h: Math.round(s.ids[id].h) };
    const r0 = await recs();
    const m0 = await c.probe('mission');
    const t = Date.now();
    await c.doubleTap(id, undefined, 60);
    const opened = await c.wait('the game to open', (x) => x.probe.miniGame && x.live.includes('game') && x, 20_000).catch(() => null);
    res.openMs = opened ? Date.now() - t : null;
    if (!opened) { res.opened = false; out.games.push(res); return res; }
    await sleep(1800);
    await c.audit(`game ${res.game}`);
    res.shot = await c.shot(`game-${res.game}`);
    // Touch the first few things the game offers that are not its answer button.
    const g = await c.state();
    const starts = ['wg-begin', 'tr-start', 'ex-go', 'sl-start'].filter((x) => g.ids[x]);
    for (const x of starts) { await c.tap(x).catch(() => null); await sleep(1500); }
    await c.audit(`game ${res.game} playing`);
    res.shotPlaying = await c.shot(`game-${res.game}-playing`);
    if (reloadInside) {
      const r = await c.reload(`inside ${res.game}`);
      res.reload = r;
      await sleep(9000); // games.reopen goes back into the game within 8 s when its landing offers it
      const back = await c.state();
      res.afterReload = { stage: back.probe.stage, floor: back.probe.floor, basement: back.probe.basement, game: back.probe.miniGame?.id ?? null, entrance: back.order.find((x) => x.startsWith('minigame-entrance-')) ? back.ids[back.order.find((x) => x.startsWith('minigame-entrance-'))].label : null };
    }
    const now = await c.state();
    if (now.probe.miniGame) {
      const back = ['minigame-back', 'wg-back'].find((x) => now.ids[x]) ?? now.labels.find((l) => /BACK TO ELEVATOR/i.test(l.label ?? ''))?.label;
      if (!back) { res.noWayBack = true; fail(c.who, `${res.game}: no BACK TO ELEVATOR on screen`); }
      else {
        await c.tap(back);
        const home = await c.wait('the elevator again', (x) => !x.probe.miniGame && x.probe.phase === 'idleOpen' && x, 20_000).catch(() => null);
        res.backOk = !!home;
        if (!home) fail(c.who, `${res.game}: BACK TO ELEVATOR did not bring the elevator back`);
      }
    }
    await sleep(800);
    const m1 = await c.probe('mission');
    res.records = (await recs()) - r0;
    res.elevatorSame = m0?.instanceId === m1?.instanceId && m0?.stepId === m1?.stepId && m0?.item === m1?.item;
    if (res.records) fail(c.who, `opening and leaving ${res.game} wrote ${res.records} learning record(s)`);
    if (!res.elevatorSame) fail(c.who, `opening and leaving ${res.game} changed the elevator's job (${m0?.stepId} -> ${m1?.stepId})`);
    out.games.push(res);
    c.note(`game ${res.game}: opened in ${res.openMs} ms, records ${res.records}, elevator same ${res.elevatorSame}`);
    return res;
  };

  // Part 1: the first hall call, ignored.
  await c.wait('the wake-up line', (s) => /Press DOOR OPEN to wake/.test(s.text), 60_000);
  if (PARTS.has('reloads')) { const r = await c.reload('before waking the lift'); out.reloads.push(r); if (r.after.stage !== 'intro') fail(c.who, `a reload before waking came back as ${r.after.stage}`); }
  // Long presses on DOOR OPEN wake her up too?
  await c.tap('DOOR OPEN', 'panel');
  await c.wait('the first call', (s) => s.probe.stage === 'call' && s.probe.phase === 'idleOpen', 30_000);
  await sleep(1500);
  await c.audit('call');
  if (PARTS.has('idle')) await idle('first call');
  if (PARTS.has('landings')) out.landings.push(...(await touchLanding(c, { quietExpected: true })).map((t) => ({ ...t, during: 'call' })));
  if (PARTS.has('chaos')) await chaos();
  if (PARTS.has('free')) await visitGame(PARTS.has('reloads'));

  // Part 2: the mission played on (it answers, so that the free lift opens), with reloads at awkward moments.
  const planned = PARTS.has('reloads') ? ['call', 'planned', 'riding', 'note', 'folded', 'cargo', 'jobDone', 'riding', 'meter', 'jobDone'] : [];
  const used = new Set();
  let landingsTouched = 0;
  out.mission = {};
  await playMission(c, {
    think: () => sleep(350),
    at: async (moment, s) => {
      const i = planned.findIndex((m, k) => m === moment && !used.has(k));
      if (i < 0) return false;
      used.add(i);
      if (moment === 'riding') await sleep(700);
      const r = await c.reload(moment);
      r.moment = moment;
      out.reloads.push(r);
      const lost = r.after.records < r.before.records;
      if (lost) fail(c.who, `a reload (${moment}) lost ${r.before.records - r.after.records} learning record(s)`);
      if (!r.sameInstance) fail(c.who, `a reload (${moment}) came back on another mission instance`);
      if (moment !== 'riding' && moment !== 'jobDone' && moment !== 'call' && (r.after.step !== r.before.step || r.after.item !== r.before.item || r.after.wrongTries !== r.before.wrongTries)) fail(c.who, `a reload (${moment}) changed the job: step ${r.before.step} -> ${r.after.step}, item ${r.before.item === r.after.item ? 'same' : 'changed'}, misses ${r.before.wrongTries} -> ${r.after.wrongTries}`);
      if (r.after.records > r.before.records + (moment === 'riding' ? 2 : 0)) fail(c.who, `a reload (${moment}) added ${r.after.records - r.before.records} learning record(s)`);
      void s;
      return true;
    },
    onSuccess: async () => {
      if (!PARTS.has('landings') || landingsTouched >= 4) return;
      landingsTouched++;
      out.landings.push(...(await touchLanding(c, { quietExpected: false })).map((t) => ({ ...t, during: 'job done' })));
    },
  }, out.mission);

  // Part 3: the free lift. Every game floor and B1, each game opened and left, a reload inside one, a minute idle.
  if (out.mission.finished && PARTS.has('free')) {
    const free = { rides: [], records0: await recs() };
    await sleep(6000);
    await c.audit('free ride');
    free.shot = await c.shot('free-ride');
    let k = 0;
    for (const floor of [20, 4, 10, 1, 'B1', 15, 2]) {
      const t = Date.now();
      await rideFree(c, floor);
      free.rides.push({ floor, ms: Date.now() - t });
      await c.audit(`floor ${floor}`);
      if (PARTS.has('landings')) out.landings.push(...(await touchLanding(c, { quietExpected: false })).map((x) => ({ ...x, during: 'free ride' })));
      await visitGame(PARTS.has('reloads') && k++ === 1);
    }
    if (PARTS.has('idle')) await idle('free ride');
    if (PARTS.has('reloads')) { const r = await c.reload('free ride'); out.reloads.push(r); if (r.after.stage !== 'freeRide') fail(c.who, `a reload in the free ride came back as ${r.after.stage}`); }
    free.records = (await recs()) - free.records0;
    if (free.records) fail(c.who, `the free ride wrote ${free.records} learning record(s)`);
    out.free = free;
  }
  return out;
}

// ---------------------------------------------------------------- shared judgement
const SPOKEN = /^(narration-v1|elevenlabs-voice-v1|elevenlabs-narration-v1):|:voice\.|:word\./;
/** Two spoken clips sounding at once (a voice over a voice). */
function voicesAtOnce(clips) {
  const said = clips.filter((k) => SPOKEN.test(k.id) && k.t1 !== null && !/^refused/.test(k.how ?? '')).sort((a, b) => a.t0 - b.t0);
  const out = [];
  for (let i = 1; i < said.length; i++) for (let j = 0; j < i; j++) if (said[j].t1 > said[i].t0 + 60) out.push({ first: said[j].id, second: said[i].id, overlapMs: Math.round(Math.min(said[j].t1, said[i].t1) - said[i].t0) });
  return out;
}

/** The ledger of committed answers against the learning records, item by item: every miss once, nothing unexplained. */
function judgeRecords(who, ledger, records, mission, ended) {
  const mine = records.rows.filter((r) => !r.error);
  const attempts = mine.filter((r) => r.type === 'attempt');
  const taken = ledger.filter((l) => l.taken && l.leg !== 1);
  // An item's misses on record: its wrong tries before the last response, and that response when the item ended as a miss.
  const missesOf = (a) => (a.wrongTries ?? 0) + (a.outcome === 'incorrect' ? 1 : 0);
  const out = {
    answers: taken.length, wrongGiven: taken.filter((l) => !l.right).length, rightGiven: taken.filter((l) => l.right).length,
    attempts: attempts.length, recordedMisses: attempts.reduce((n, a) => n + missesOf(a), 0),
    correctAttempts: attempts.filter((a) => a.outcome === 'correct').length, incorrectAttempts: attempts.filter((a) => a.outcome !== 'correct').length,
    completions: mine.filter((r) => r.type === 'completion').length,
    assistance: attempts.reduce((m, a) => ({ ...m, [a.assistance ?? 'none']: (m[a.assistance ?? 'none'] ?? 0) + 1 }), {}),
    duplicateIds: mine.length - new Set(mine.map((a) => a.id)).size,
    items: [], pending: [], unexplained: [], problems: [],
  };
  if (out.duplicateIds) out.problems.push(`${out.duplicateIds} learning record id(s) written twice`);
  const items = [...new Set(taken.map((l) => l.item))];
  for (const item of items) {
    const given = taken.filter((l) => l.item === item);
    const recs = attempts.filter((a) => a.itemSignature === item);
    const row = { step: given[0].step, kind: given[0].kind, wrongGiven: given.filter((l) => !l.right).length + given.filter((l) => l.countedTwice).length, countedTwice: given.filter((l) => l.countedTwice).length, rightGiven: given.filter((l) => l.right).length, recorded: recs.map((a) => `${a.outcome}/${a.assistance}/${a.wrongTries}${a.conceptRescue ? '/rescue' : ''}`).join(', ') || null };
    out.items.push(row);
    if (!recs.length) { out.pending.push(row); continue; }
    const misses = recs.reduce((n, a) => n + missesOf(a), 0);
    if (misses !== row.wrongGiven) out.problems.push(`${row.step}: ${row.wrongGiven} wrong answer(s) given, ${misses} on record (${row.recorded})`);
    if (row.rightGiven && !recs.some((a) => a.outcome === 'correct')) out.problems.push(`${row.step}: a right answer was given and none is on record (${row.recorded})`);
    if (!row.rightGiven && recs.some((a) => a.outcome === 'correct')) out.problems.push(`${row.step}: a correct attempt is on record and no right answer was given`);
    if (recs.some((a) => (a.wrongTries ?? 0) > 0 && a.assistance === 'independent')) out.problems.push(`${row.step}: an attempt with misses is recorded as independent`);
  }
  // An item answered but not on record: only the one in hand when the run stopped (an attempt is written when its item ends).
  if (out.pending.length > (ended ? 0 : 1)) out.problems.push(`${out.pending.length} answered item(s) have no learning record: ${out.pending.map((p) => p.step).join(', ')}`);
  for (const a of attempts) if (!items.includes(a.itemSignature)) out.unexplained.push({ id: a.id, activityId: a.activityId, outcome: a.outcome, assistance: a.assistance });
  if (out.unexplained.length) out.problems.push(`${out.unexplained.length} attempt(s) on record that no committed answer explains: ${out.unexplained.map((u) => u.id).slice(0, 3).join(', ')}`);
  // Help taken on an item must show in that item's attempt (anything above a retry).
  for (const h of mission?.helps ?? []) {
    const a = attempts.find((x) => x.itemSignature === h.itemBefore) ?? null;
    if (a && ['independent', 'retry'].includes(a.assistance)) out.problems.push(`${h.help} on ${h.step} was recorded as ${a.assistance}`);
    h.recordedAs = a?.assistance ?? null;
  }
  for (const p of out.problems) fail(who, p);
  return out;
}

/** What the page's own timeline and touches say: time to the first ride, per job, nothing to press, reactions. */
function measure(c, mission) {
  const tl = c.timeline.slice().sort((a, b) => a.t - b.t);
  const t0 = tl[0]?.t ?? c.t0;
  const firstTouch = c.touches.find((t) => t.type === 'start')?.t ?? null;
  const firstRide = tl.find((x) => moving(x.phase) && x.phase !== 'doorsOpening' && x.phase !== 'doorsClosing')?.t ?? tl.find((x) => moving(x.phase))?.t ?? null;
  // Per step: from its first sight to the success that follows it.
  const jobs = [];
  for (const step of STEPS.slice(1)) {
    const first = tl.find((x) => x.step === step && x.stage !== 'success');
    if (!first) continue;
    const ok = tl.find((x) => x.t > first.t && x.step === step && x.stage === 'success') ?? (step === 'finale' ? tl.find((x) => x.t > first.t && (x.stage === 'complete' || x.stage === 'freeRide')) : null);
    jobs.push({ step, seconds: ok ? r1(ok.t - first.t) : null, solved: !!ok });
  }
  // Stretches with nothing to press: the panel locked and no other control live.
  const dead = [];
  for (let i = 0; i < tl.length; i++) {
    const x = tl[i];
    const nothing = !x.panel && !x.controls.length && x.stage !== 'intro' && x.stage !== 'loading';
    if (!nothing) continue;
    let j = i;
    while (j + 1 < tl.length && !tl[j + 1].panel && !tl[j + 1].controls.length) j++;
    const end = tl[j + 1]?.t ?? tl[j].t;
    dead.push({ at: r1(x.t - t0), ms: Math.round(end - x.t), stage: x.stage, phases: [...new Set(tl.slice(i, j + 1).map((y) => y.phase))].join('>'), step: x.step });
    i = j;
  }
  dead.sort((a, b) => b.ms - a.ms);
  const starts = c.touches.filter((t) => t.type === 'start' && t.id !== null || t.label !== null).filter((t) => t.type === 'start');
  const self = starts.map((t) => t.self).filter((v) => v !== null);
  const any = starts.map((t) => t.any).filter((v) => v !== null);
  const none = starts.filter((t) => t.any === null);
  const p95 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : null);
  return {
    toFirstRide: firstRide ? r1(firstRide - t0) : null,
    firstTouchToFirstRide: firstRide && firstTouch ? r1(firstRide - firstTouch) : null,
    jobs,
    jobsSolved: jobs.filter((j) => j.solved).length,
    jobSeconds: { median: median(jobs.filter((j) => j.solved).map((j) => j.seconds)), max: Math.max(0, ...jobs.filter((j) => j.solved).map((j) => j.seconds)) },
    nothingToPress: { longest: dead.slice(0, 5), longestMs: dead[0]?.ms ?? 0, totalMs: dead.reduce((n, d) => n + d.ms, 0) },
    taps: { count: starts.length, controlChangedMs: { median: median(self), p95: p95(self), max: self.length ? Math.max(...self) : null, n: self.length }, anythingChangedMs: { median: median(any), p95: p95(any), max: any.length ? Math.max(...any) : null }, nothingChanged: none.length, nothingChangedOn: [...new Set(none.map((t) => t.label ?? t.id))].slice(0, 12) },
    session: r1((tl.at(-1)?.t ?? t0) - t0),
    lastStep: tl.at(-1)?.step ?? null,
    lastStage: tl.at(-1)?.stage ?? null,
    missionFinished: !!mission?.finished,
  };
}

async function run(browser, base, who) {
  const c = await child(browser, base, who);
  const result = {};
  try {
    await c.open();
    await c.wait('the wake-up line', (s) => /Press DOOR OPEN to wake/.test(s.text), 60_000);
    await c.audit('intro');
    await settings(c);
    if (who === 'engineer') await engineer(c, result); else if (who === 'guesser') await guesser(c, result); else await explorer(c, result);
  } catch (e) {
    fail(who, e.message);
    result.shot = await c.shot('stuck').catch(() => null);
    result.error = e.message;
  }
  await sleep(1500);
  await c.harvestAll('cut:end');
  const records = await c.records().catch((e) => ({ rows: [{ error: String(e) }], world: [], progression: [], unlocks: [], settings: [] }));
  const mission = result?.mission ?? null;
  const judged = judgeRecords(who, c.ledger, records, mission, !!mission?.finished);
  const m = measure(c, mission);
  const over = voicesAtOnce(c.clips);
  for (const o of over.slice(0, 5)) fail(who, `two voices at once: ${o.second} started ${o.overlapMs} ms before ${o.first} ended`);
  for (const e of c.errors) fail(who, `page error: ${e.message}`);
  if (c.external.length) fail(who, `the page asked another origin for ${[...new Set(c.external)].slice(0, 3).join(', ')}`);
  const sounds = c.clips.filter((k) => !k.loop);
  const out = {
    who, seconds: r1(Date.now() - c.t0), taps: c.taps, result, measures: m, judged, ledger: c.ledger,
    sounds: { started: sounds.length, playedOut: sounds.filter((k) => k.how === 'ended').length, cut: sounds.filter((k) => /^cut/.test(k.how ?? '')).map((k) => k.id), refused: sounds.filter((k) => /^refused|error/.test(k.how ?? '')).map((k) => `${k.id}:${k.how}`), spoken: sounds.filter((k) => SPOKEN.test(k.id)).length, loops: c.clips.filter((k) => k.loop).length, voicesAtOnce: over },
    errors: c.errors, console: c.console, external: [...new Set(c.external)], audits: c.audits, reloads: c.reloads, log: c.log,
    clips: c.clips.map((k) => ({ id: k.id, t0: r1(k.t0 - c.t0), t1: k.t1 === null ? null : r1(k.t1 - c.t0), how: k.how, loop: k.loop || undefined })),
    timeline: c.timeline.map((x) => ({ ...x, t: r1(x.t - c.t0) })),
    touches: c.touches.filter((t) => t.type === 'start').map((t) => ({ t: r1(t.t - c.t0), id: t.id, label: t.label, off: t.off || undefined, self: t.self, any: t.any })),
    records,
  };
  await c.ctx.close();
  return out;
}

function table(all) {
  const rows = [];
  const pad = (v, n) => String(v ?? '-').padStart(n);
  rows.push(`\n${'persona'.padEnd(9)} | ${pad('session s', 9)} | ${pad('jobs', 5)} | ${pad('1st ride s', 10)} | ${pad('job s med/max', 13)} | ${pad('nothing to press, longest ms', 28)} | ${pad('tap->control ms med/p95', 23)} | ${pad('sounds played/cut', 17)} | ${pad('answers w/r', 11)} | ${pad('attempts', 8)} | ${pad('misses rec', 10)} | errors`);
  for (const a of all) {
    const m = a.measures;
    rows.push(`${a.who.padEnd(9)} | ${pad(m.session, 9)} | ${pad(`${m.jobsSolved}/14`, 5)} | ${pad(m.toFirstRide, 10)} | ${pad(`${m.jobSeconds.median ?? '-'}/${m.jobSeconds.max || '-'}`, 13)} | ${pad(`${m.nothingToPress.longestMs} (${m.nothingToPress.longest[0]?.stage ?? '-'} ${m.nothingToPress.longest[0]?.phases ?? ''})`.slice(0, 28), 28)} | ${pad(`${m.taps.controlChangedMs.median ?? '-'}/${m.taps.controlChangedMs.p95 ?? '-'} (n ${m.taps.controlChangedMs.n})`, 23)} | ${pad(`${a.sounds.playedOut}/${a.sounds.cut.length}`, 17)} | ${pad(`${a.judged.wrongGiven}/${a.judged.rightGiven}`, 11)} | ${pad(a.judged.attempts, 8)} | ${pad(a.judged.recordedMisses, 10)} | ${a.errors.length} page, ${a.console.length} console`);
  }
  for (const a of all) {
    const small = new Map();
    const cut = new Map();
    const red = new Map();
    for (const au of a.audits) {
      for (const s of au.small) if (!small.has(s.what)) small.set(s.what, `${s.what} ${s.w}x${s.h}`);
      for (const s of au.cut) if (!cut.has(s.text)) cut.set(s.text, s.text);
      for (const s of au.red) if (!red.has(s.what)) red.set(s.what, `${s.what} (${s.part})`);
    }
    rows.push(`${a.who}: controls under ${MIN_TARGET} px: ${small.size ? [...small.values()].slice(0, 8).join('; ') : 'none'}`);
    rows.push(`${a.who}: text cut off: ${cut.size ? [...cut.values()].slice(0, 5).map((t) => `"${t}"`).join('; ') : 'none'}; red: ${red.size ? [...red.values()].slice(0, 5).join('; ') : 'none'}`);
    const r = a.result ?? {};
    if (a.who === 'guesser' && r.mission) rows.push(`guesser: boards ${r.mission.boards.length} (${r.mission.boards.reduce((n, b) => n + b.refused, 0)} taps refused), helps ${r.mission.helps.map((h) => `${h.help}>${h.recordedAs ?? '?'}`).join(' ') || 'none'}, fresh jobs smaller than the one missed ${r.mission.fresh.filter((f) => f.freshSize !== null && f.missedSize !== null && f.freshSize < f.missedSize).length}/${r.mission.fresh.length}, items changed by a miss outside a correction ${r.mission.changed.filter((x) => !x.byDesign).length}, mashes ${r.mashes.length}, help taken by the second tap of a double tap ${r.mission.helps.filter((h) => h.accidental).length}, jobs that named a floor the car was not on ${r.mission.wrongPlace.length}, jobs whose words left the screen ${r.mission.lostJobs.length}, games opened by a second tap ${r.mission.gamesOpened.length}, assistance on record ${JSON.stringify(a.judged.assistance)}`);
    if (a.who === 'explorer') {
      rows.push(`explorer: idle ${(r.idle ?? []).map((i) => `${i.where}: moved on ${i.movedOn}, ${i.newLines.length} new lines, ${i.sounds.length} sounds`).join('; ') || '-'}`);
      rows.push(`explorer: chaos ${r.chaos ? `${r.chaos.floorPresses} floors pressed (${r.chaos.refused} refused, rode to ${r.chaos.rodeTo.join(' ') || 'none'}), ${r.chaos.doorCycles} door presses, records ${r.chaos.records}` : '-'}; landings touched ${(r.landings ?? []).length} (no change in the picture: ${(r.landings ?? []).filter((l) => !l.covered && l.changedPx < 10).map((l) => `${l.floor}:${l.id}`).join(' ') || 'none'})`);
      rows.push(`explorer: reloads ${(a.reloads ?? []).map((x) => `${x.why}: ${x.before.stage}>${x.after.stage} records ${x.before.records}>${x.after.records}`).join('; ') || '-'}`);
      rows.push(`explorer: games ${(r.games ?? []).map((g) => `${g.game}@${g.floor} ${g.opened === false ? 'DID NOT OPEN' : `${g.openMs} ms`} rec ${g.records ?? '-'}`).join('; ') || '-'}`);
    }
  }
  return rows.join('\n');
}

module.exports = { child, job, noteItem, wrongFor, pressFloor, setMeter, loadCrates, give, answerReading, workBoard, touchLanding, settings, playMission, rideFree, measure, judgeRecords, voicesAtOnce, sleep, r1, moving, STEPS, READING_ITEMS, HOST, COMPLETE, instrument };

if (require.main === module) (async () => {
  const startedAt = Date.now();
  const server = await serve(DIST, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts).catch(() => chromium.launch({ channel: 'chrome' }));
  console.log(`Elevator Quest child playtest (browser only): ${PERSONAS.join(', ')} at ${W}x${H}${STILL ? ', Reduced Motion' : ''}${SOUND_OFF ? ', sound off' : ''}; parts ${[...PARTS].join(' ')}; up to ${MAX_JOBS} jobs`);
  let all;
  if (process.env.EP_SERIAL === '1') { all = []; for (const p of PERSONAS) all.push(await run(browser, base, p)); }
  else all = await Promise.all(PERSONAS.map((p) => run(browser, base, p)));
  await browser.close();
  server.close();
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `elevator-playtest-${PERSONAS.join('-')}-${W}x${H}${STILL ? '-still' : ''}${SOUND_OFF ? '-quiet' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), note: 'browser only (headless Chromium): not a tablet measurement', size: [W, H], still: STILL, soundOff: SOUND_OFF, parts: [...PARTS], pace: PACE, failures, personas: all }, null, 1));
  console.log(table(all));
  console.log(`\n${failures.length ? `${failures.length} failure(s):\n  ${failures.join('\n  ')}` : 'no failures'}\nmeasurements: ${file}\ntook ${r1(Date.now() - startedAt)} s`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
