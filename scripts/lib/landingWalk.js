/* global __dirname */
// Shared by scripts/web-e2e.js (the floor walkthrough) and scripts/floor-contact-sheet.js: read a
// landing from the page and ride the real game between floors in free ride (developer tools page).
// Everything here reads what the page shows: the art hook CabinScene renders
// (`landing-art:<floor>:<art|loading|vector>`), the live sign (`landing-sign`), the doorway (its
// accessibility box, "Landing: floor N, ...") and how far the doors are open (the gap the sign shows
// through). The floor list and names come from the landing catalog, never a hard-coded count.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

/** The landing catalog's floors (content/themes/elevator-quest/landings.json), low to high. */
const LANDING_FLOORS = json('content/themes/elevator-quest/landings.json').floors.slice().sort((a, b) => a.floor - b.floor);
/** The sign an illustrated landing carries (D136: the number beside the name), from the theme's words. */
const SIGN_NUMBERED = json('content/themes/elevator-quest/floor15.json').lines.signNumbered;
const signFor = (floor, name) => SIGN_NUMBERED.replace('{floor}', String(floor)).replace('{name}', name);

/** The landing as the page shows it: floor, art state, doorway box, sign text (spaces collapsed: it may wrap) and box, whether the sign is cut off, and the door gap. */
async function landingNow(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="device-frame"]');
    const hook = frame?.querySelector('[data-testid^="landing-art:"]')?.getAttribute('data-testid') ?? null;
    const [, floor, state] = hook ? hook.split(':') : [];
    const door = frame?.querySelector('[aria-label^="Landing: floor"]');
    const sign = frame?.querySelector('[data-testid="landing-sign"]');
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    // The sign shows through the gap between the door leaves (its grandparent clips it): open is the doorway's width.
    const gap = r(sign?.parentElement?.parentElement);
    // Cut off: the text overflows its box (one line ellipsised, or more lines than it has room for).
    const signCut = sign ? sign.scrollWidth > sign.clientWidth + 1 || sign.scrollHeight > sign.clientHeight + 1 : null;
    return { floor: floor ? Number(floor) : null, state: state ?? null, door: r(door), sign: sign ? sign.textContent.replace(/\s+/g, ' ').trim() : null, signCut, signBox: r(sign), gap };
  });
}

/** Ride to a floor with the panel's button (free ride) and wait until its doors stand open. */
async function rideToFloor(page, floor, { touch = false, timeoutMs = 60_000 } = {}) {
  const here = await landingNow(page);
  if (here.floor !== floor) {
    const button = page.getByTestId('device-frame').getByLabel(`Floor ${floor}`, { exact: true }).first();
    await (touch ? button.tap() : button.click());
  }
  const end = Date.now() + timeoutMs;
  for (;;) {
    const l = await landingNow(page);
    if (l.floor === floor && l.door && l.gap && l.gap.width >= l.door.width - 16) return l;
    if (Date.now() > end) throw new Error(`Floor ${floor}: the doors never opened there (${JSON.stringify(l)})`);
    await page.waitForTimeout(150);
  }
}

/**
 * Wait (up to `ms`) while the landing's art is still loading; returns the last state seen: "art" (the
 * illustrated scene), "vector" (no art for this floor in this set or doorway: final at once), or
 * "loading" (art exists but never drew: still loading, or failed).
 */
async function waitForLandingArt(page, ms = 15_000) {
  let l = await landingNow(page);
  for (const end = Date.now() + ms; l.state === 'loading' && Date.now() < end; l = await landingNow(page)) await page.waitForTimeout(200);
  return l;
}

module.exports = { LANDING_FLOORS, signFor, landingNow, rideToFloor, waitForLandingArt };
