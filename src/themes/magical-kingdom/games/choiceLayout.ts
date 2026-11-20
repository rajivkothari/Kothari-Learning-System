// Where everything sits on a picture game's screen (the four picture games and the Royal Quest). Pure
// math: no React, no pixels read back. choiceLayout.test.ts runs it over every supported window, with and
// without the quest's path.
//
// The bar across the top: the ear and the line, and on its right the turn dots or the quest's stepping
// stones (on a narrow window the stones take a row of their own, so none is under 40 pt). Under it the
// stage, two slots side by side: what is asked (the picture or the story's cover) and the answer's frame
// (the picture picked up, the chest, the bunny's stones, the book). Under the stage the three choices,
// and at the foot the action row: Help on the left, the gold star (or Next) in the middle. In a short
// landscape window the stage sits beside the choices instead of above them.
import type { Rect } from './layout';

export { MIN_TOUCH, EAR_RING } from './layout';
export type { Rect } from './layout';

export interface ChoiceLayout {
  side: boolean;
  bar: Rect;
  /** The ear (square, without its glow ring) and the printed line. */
  ear: Rect;
  text: Rect;
  /** single games: the turn dots. The quest: the path, its five stones and the castle at its end. */
  dots: Rect | null;
  path: Rect | null;
  /** The path did not fit in the bar and has a row of its own. */
  pathRow: boolean;
  stones: Rect[];
  castle: Rect | null;
  stage: Rect;
  /** The two slots: [what is asked, the answer's frame]. Each has its picture and, under it, a band for print. */
  slots: [Rect, Rect];
  /** Height of the print band at the foot of a slot, and the printed word's font size. */
  printH: number;
  print: number;
  choices: [Rect, Rect, Rect];
  /** The action row: Help on its left; the star, or Next once answered, in its middle. */
  actions: Rect;
  help: Rect;
  star: Rect;
  next: Rect;
}

const MIN_TOUCH_PT = 64;
const RING = 7;
const GAP = 12;
/** The smallest stepping stone the path may draw. Under this it takes its own row. */
export const MIN_STONE = 40;
const MAX_STONE = 60;
const STONE_GAP = 8;
/** Stones plus the castle. */
const PATH_PIECES = 6;
export const STAR_SIZE = 96;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);

/** The pieces of a path laid in `r` (five stones, then the castle a little bigger). */
function pathIn(r: Rect, size: number): { stones: Rect[]; castle: Rect } {
  const total = PATH_PIECES * size + (PATH_PIECES - 1) * STONE_GAP;
  let x = r.x + round((r.w - total) / 2);
  const y = r.y + round((r.h - size) / 2);
  const stones: Rect[] = [];
  for (let i = 0; i < PATH_PIECES - 1; i++) {
    stones.push({ x, y, w: size, h: size });
    x += size + STONE_GAP;
  }
  return { stones, castle: { x, y, w: size, h: size } };
}
const stoneFor = (w: number) => Math.floor((w - (PATH_PIECES - 1) * STONE_GAP) / PATH_PIECES);

/**
 * `top` is where the screen may start (under the kingdom header); `bottom` the safe-area inset at the
 * foot; `turns` how many turn dots a single game shows; `quest` draws the path instead of the dots.
 */
export function choiceLayout({ width, height, top, bottom, quest, turns = 4 }: { width: number; height: number; top: number; bottom: number; quest: boolean; turns?: number }): ChoiceLayout {
  const m = width < 480 ? 12 : 16;
  const x0 = m;
  const y0 = top + m;
  const w = width - 2 * m;
  const h = height - Math.max(bottom, 0) - m - y0;
  const side = width > height && h < 560 && w >= 640;

  // The bar: the ear, the line, and on the right the dots or (when there is room for 40 pt stones) the path.
  const barH = 72 + 2 * RING;
  const bar: Rect = { x: x0, y: y0, w, h: barH };
  const ear: Rect = { x: x0 + RING + 4, y: y0 + RING, w: 72, h: 72 };
  const textX = ear.x + ear.w + RING + GAP;
  let dots: Rect | null = null;
  let path: Rect | null = null;
  let pathRow = false;
  let stones: Rect[] = [];
  let castle: Rect | null = null;
  let below = y0 + barH + GAP;
  let textW: number;
  if (quest) {
    const inline = round(Math.min(w * 0.44, PATH_PIECES * MAX_STONE + (PATH_PIECES - 1) * STONE_GAP + 2 * GAP));
    const size = Math.min(MAX_STONE, stoneFor(inline - 2 * GAP));
    if (size >= MIN_STONE && w - inline - (textX - x0) >= 150) {
      path = { x: x0 + w - inline, y: y0 + 4, w: inline, h: barH - 8 };
      ({ stones, castle } = pathIn({ x: path.x + GAP, y: path.y, w: path.w - 2 * GAP, h: path.h }, size));
      textW = path.x - GAP - textX;
    } else {
      pathRow = true;
      const rowSize = Math.min(MAX_STONE, stoneFor(w - 2 * GAP));
      path = { x: x0, y: below, w, h: rowSize + 12 };
      ({ stones, castle } = pathIn({ x: x0 + GAP, y: below, w: w - 2 * GAP, h: rowSize + 12 }, rowSize));
      below += path.h + GAP;
      textW = x0 + w - GAP - textX;
    }
  } else {
    // Small dots, not a control: on a narrow window they pack closer so the line keeps its room.
    const dw = clamp(turns * (w < 480 ? 16 : 22) + (w < 480 ? 8 : 16), 56, 160);
    dots = { x: x0 + w - GAP - dw, y: y0 + round((barH - 24) / 2), w: dw, h: 24 };
    textW = dots.x - GAP - textX;
  }
  const text: Rect = { x: textX, y: y0 + 6, w: textW, h: barH - 12 };

  const foot = y0 + h;
  const actionH = STAR_SIZE;
  let stage: Rect, actions: Rect, choiceBox: Rect;
  if (side) {
    // The stage on the left; the choices on the right with the action row under them.
    const sw = round(w * 0.5);
    stage = { x: x0, y: below, w: sw, h: foot - below };
    const rx = x0 + sw + GAP;
    const rw = w - sw - GAP;
    actions = { x: rx, y: foot - actionH, w: rw, h: actionH };
    choiceBox = { x: rx, y: below, w: rw, h: actions.y - GAP - below };
  } else {
    actions = { x: x0, y: foot - actionH, w, h: actionH };
    const room = actions.y - GAP - below;
    const cw = Math.min(w, 780);
    const tileH = round(clamp(room * 0.36, 96, 196));
    choiceBox = { x: x0 + round((w - cw) / 2), y: 0, w: cw, h: tileH };
    const sh = room - tileH - GAP;
    const slot = Math.min(Math.floor((cw - GAP) / 2), sh, 300);
    // The stage hugs its slots; what is left over is shared above and below the stage and choices.
    const used = slot + GAP + tileH;
    // Stage and choices stay together; the spare height goes above and below them, a little between.
    const spare = Math.max(0, room - used);
    const between = Math.min(round(spare / 3), 28);
    const above = round((spare - between) / 2);
    stage = { x: x0 + round((w - cw) / 2), y: below + above, w: cw, h: slot };
    choiceBox.y = stage.y + slot + GAP + between;
  }

  // Two square slots, centred in the stage. The print band is part of each slot.
  const s = Math.min(Math.floor((stage.w - GAP) / 2), stage.h, 300);
  const sx = stage.x + round((stage.w - (2 * s + GAP)) / 2);
  const sy = stage.y + round((stage.h - s) / 2);
  const slots: [Rect, Rect] = [{ x: sx, y: sy, w: s, h: s }, { x: sx + s + GAP, y: sy, w: s, h: s }];
  const printH = round(clamp(s * 0.22, 34, 64));

  // Three tiles in a row, square-ish, as big as their box allows.
  const tw = Math.min(Math.floor((choiceBox.w - 2 * GAP) / 3), 220);
  const th = round(Math.min(choiceBox.h, tw * 1.05, 220));
  const tx = choiceBox.x + round((choiceBox.w - (3 * tw + 2 * GAP)) / 2);
  // Beside the stage the tiles line up with the top of its slots; under it they sit in their own band.
  const ty = side ? clamp(sy, choiceBox.y, choiceBox.y + choiceBox.h - th) : choiceBox.y + round((choiceBox.h - th) / 2);
  const choices: [Rect, Rect, Rect] = [0, 1, 2].map((i) => ({ x: tx + i * (tw + GAP), y: ty, w: tw, h: th })) as [Rect, Rect, Rect];

  // The action row: Help at the left, the star (or Next) centred in what is left.
  const helpW = width < 420 ? 76 : 200;
  const help: Rect = { x: actions.x, y: actions.y + round((actionH - MIN_TOUCH_PT) / 2), w: helpW, h: MIN_TOUCH_PT };
  const restX = help.x + helpW + GAP;
  const restW = actions.x + actions.w - restX;
  const centre = Math.max(restX + STAR_SIZE / 2, Math.min(actions.x + actions.w / 2, restX + restW / 2 + 0));
  const star: Rect = { x: round(Math.min(centre - STAR_SIZE / 2, actions.x + actions.w - STAR_SIZE)), y: actions.y, w: STAR_SIZE, h: STAR_SIZE };
  const nw = Math.min(240, restW);
  const next: Rect = { x: round(Math.min(Math.max(restX, centre - nw / 2), actions.x + actions.w - nw)), y: actions.y + round((actionH - 68) / 2), w: nw, h: 68 };

  return {
    side, bar, ear, text, dots, path, pathRow, stones, castle, stage, slots,
    printH, print: round(printH * 0.72),
    choices, actions, help, star, next,
  };
}
