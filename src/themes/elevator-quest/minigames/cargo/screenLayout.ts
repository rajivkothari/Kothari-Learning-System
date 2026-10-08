// Cargo Commander's screen layout. Pure math, no React: tested at every window size the game runs in.
//
// The warehouse fills the window. One attention order: the brief (what to load, the biggest words),
// then the freight elevator (where the load goes) and the scale beside it, then the dock (what there
// is to load). WEIGH sits under the scale, in the same place in every state (NEXT DELIVERY takes its
// place after a run). BACK TO ELEVATOR, the toolkit and help stay in the top bar.
//
//   landscape   [ dock | freight | scale, Lifty's line, WEIGH ]
//   portrait    [ freight | scale, WEIGH ] then Lifty's line, then the dock
//   narrow      freight, then [ scale | WEIGH ], Lifty's line, the dock
//
// Every control and every crate is at least 64 pt (ACCESSIBILITY.md); text sizes come from the
// window's text class (ui/textRoles.ts), never shrunk to fit: a box that cannot hold its words grows.
import { lineHeightFor, textClass, textSizes, type TextSizes } from '../../ui/textRoles';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const MIN_TARGET = 64;
export const MAX_CRATE = 112;
const GUTTER = 12;
const GAP = 12;
export const BAR = 64;
/** The dock's and the freight's small title line. */
export const HEADER = 30;
/** Inner padding of the dock and the freight cab. */
export const PAD = 10;
const WEIGH_HEIGHT = 72;
/** The dock's line of givens (order slips, the other pallet): a label and a big number. */
export const INFO_H = 72;

export type Arrangement = 'landscape' | 'portrait' | 'narrow';

export interface CargoScreenLayout {
  arrangement: Arrangement;
  text: TextSizes;
  back: Box;
  toolkit: Box;
  help: Box;
  brief: Box;
  /** The freight elevator: its shaft and cab. */
  freight: Box;
  /** The cab's inside (where the load stands), in screen coordinates. */
  hold: Box;
  /** The scale's dial and its readout. */
  gauge: Box;
  /** WEIGH, and NEXT DELIVERY in its place. */
  weigh: Box;
  /** Lifty's line: cues, hints. */
  cue: Box;
  /** The dock: crates, or the sack and box piles, and the order slips. */
  supply: Box;
  /** A crate's side (exactLoad), at least 64 pt. */
  crate: number;
  /** The toolkit panel when open (it covers the dock and the freight, never the scale, WEIGH or the top bar). */
  toolkitPanel: Box;
  /** The height everything needs: the window's, or more where the screen must scroll (Slide Over). */
  contentHeight: number;
  /** Stacked windows: the open toolkit takes WEIGH's row too (WEIGH waits under it until CLOSE). */
  toolkitCoversWeigh: boolean;
}

export interface LayoutInput {
  size: { width: number; height: number };
  insets: Insets;
  /** Characters in the brief and in the longest cue, so their boxes fit them at full size. */
  briefChars: number;
  cueChars: number;
  /** exactLoad: crates on the dock (0 for the filler kinds). */
  crates: number;
  /** Text sizes the host chose for this window (else from the window's text class). */
  text?: TextSizes;
}

/** Lines a text needs at a size in a width (reading face: about 0.52 em a character), at least one. */
export function linesFor(chars: number, size: number, width: number): number {
  const perLine = Math.max(8, Math.floor(Math.max(1, width) / (size * 0.52)));
  return Math.max(1, Math.ceil(chars / perLine));
}

/** The biggest square crate that lets `n` crates fit in a box as a grid (with gaps). */
export function crateFit(n: number, box: { width: number; height: number }, gap = 8): number {
  if (n <= 0) return MAX_CRATE;
  let best = 0;
  for (let perRow = 1; perRow <= n; perRow += 1) {
    const rows = Math.ceil(n / perRow);
    const s = Math.min((box.width - gap * (perRow - 1)) / perRow, (box.height - gap * (rows - 1)) / rows);
    best = Math.max(best, s);
  }
  return Math.floor(best);
}

/** Where `n` crates of side `s` sit in a box: rows as wide as the box allows, centred. */
export function crateGrid(n: number, s: number, box: Box, gap = 8): Box[] {
  const perRow = Math.max(1, Math.min(n, Math.floor((box.width + gap) / (s + gap))));
  const rows = Math.ceil(n / Math.max(1, perRow));
  const out: Box[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / perRow);
    const inRow = r === rows - 1 ? n - r * perRow : perRow;
    const rowWidth = inRow * s + (inRow - 1) * gap;
    const c = i - r * perRow;
    out.push({ x: box.x + (box.width - rowWidth) / 2 + c * (s + gap), y: box.y + box.height - (rows - r) * (s + gap) + gap, width: s, height: s });
  }
  return out;
}

const box = (x: number, y: number, width: number, height: number): Box => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });

export function cargoScreenLayout(input: LayoutInput): CargoScreenLayout {
  const { size, insets } = input;
  const text = input.text ?? textSizes(textClass(size));
  const left = insets.left + GUTTER;
  const top = insets.top + GUTTER;
  const right = size.width - insets.right - GUTTER;
  const bottom = size.height - insets.bottom - GUTTER;
  const width = Math.max(0, right - left);
  // Three columns where there is room for three (a square-ish split view too), else stacked.
  const arrangement: Arrangement = width < 460 ? 'narrow' : width >= 660 && size.width >= size.height * 0.85 ? 'landscape' : 'portrait';

  // Top bar: BACK TO ELEVATOR on the left (two lines when the bar is tight), the toolkit and help on the right.
  const tight = width < 600;
  const backW = arrangement === 'narrow' ? 112 : tight ? 168 : 236;
  const helpW = arrangement === 'narrow' ? 76 : tight ? 88 : 104;
  const toolkitW = arrangement === 'narrow' ? 84 : tight ? 132 : 168;
  const back = box(left, top, backW, BAR);
  const help = box(right - helpW, top, helpW, BAR);
  const toolkit = box(right - helpW - GAP - toolkitW, top, toolkitW, BAR);

  // The brief: the biggest words on screen, its full text at the question size.
  const briefTextW = width - 32;
  const briefH = linesFor(input.briefChars, text.question, briefTextW) * lineHeightFor(text.question, 'question') + 20;
  const brief = box(left, top + BAR + GAP, width, briefH);
  const y0 = brief.y + brief.height + GAP;
  const mainH = Math.max(0, bottom - y0);

  // Lifty's box holds his longest line for this delivery, up to four lines; a longer one scrolls (M8.1).
  const cueFor = (w: number) => Math.min(4, linesFor(input.cueChars, text.dialogue.min, w - 28)) * lineHeightFor(text.dialogue.min, 'dialogue') + 20;

  let freight: Box;
  let gauge: Box;
  let weigh: Box;
  let cue: Box;
  let supply: Box;
  if (arrangement === 'landscape') {
    // The scale's column gets the most: its dial, the reading and Lifty's line share it.
    const supplyW = Math.round(width * 0.27);
    const freightW = Math.round(width * 0.31);
    const colX = left + supplyW + GAP + freightW + GAP;
    const colW = right - colX;
    supply = box(left, y0, supplyW, mainH);
    freight = box(left + supplyW + GAP, y0, freightW, mainH);
    weigh = box(colX + (colW - Math.min(colW, 280)) / 2, bottom - WEIGH_HEIGHT, Math.min(colW, 280), WEIGH_HEIGHT);
    const cueH = cueFor(colW);
    cue = box(colX, weigh.y - GAP - cueH, colW, cueH);
    gauge = box(colX, y0, colW, Math.max(0, cue.y - GAP - y0));
  } else if (arrangement === 'portrait') {
    // The freight and the scale side by side; under them Lifty's line and WEIGH (right under the scale).
    const freightW = Math.round((width - GAP) * 0.54);
    const colX = left + freightW + GAP;
    const colW = right - colX;
    const cueH = Math.max(WEIGH_HEIGHT, cueFor(freightW));
    // The dock keeps room for its givens line and full-size piles (or two rows of crates); the freight and the scale take the rest.
    const dockMin = HEADER + PAD * 2 + Math.max(INFO_H + 8 + 96, 2 * MIN_TARGET + 8);
    const rowH = Math.round(Math.min((mainH - cueH - GAP) * 0.6, mainH - cueH - 2 * GAP - dockMin));
    freight = box(left, y0, freightW, rowH);
    gauge = box(colX, y0, colW, rowH);
    cue = box(left, y0 + rowH + GAP, freightW, cueH);
    weigh = box(colX + (colW - Math.min(colW, 280)) / 2, cue.y + (cueH - WEIGH_HEIGHT) / 2, Math.min(colW, 280), WEIGH_HEIGHT);
    supply = box(left, cue.y + cueH + GAP, width, Math.max(0, bottom - (cue.y + cueH + GAP)));
  } else {
    // Narrow: everything stacked, the scale as wide as the window (its reading beside the dial). Where
    // even that does not fit at full size (Slide Over), the whole screen scrolls rather than shrink.
    const cueH = cueFor(width);
    const avail = mainH - cueH - WEIGH_HEIGHT - 4 * GAP;
    const dockMin = HEADER + PAD * 2 + Math.max(INFO_H + 8 + 80, 2 * MIN_TARGET + 8);
    const freightMin = HEADER + 28 + 56 + 8 + 2 * MIN_TARGET + 8;
    const dockH = Math.max(dockMin, Math.round(avail * 0.3));
    const gaugeH = Math.max(140, Math.min(190, Math.round(avail * 0.28)));
    const freightH = Math.max(freightMin, avail - gaugeH - dockH);
    freight = box(left, y0, width, freightH);
    gauge = box(left, y0 + freightH + GAP, width, gaugeH);
    weigh = box(left, gauge.y + gaugeH + GAP, width, WEIGH_HEIGHT);
    cue = box(left, weigh.y + WEIGH_HEIGHT + GAP, width, cueH);
    supply = box(left, cue.y + cueH + GAP, width, dockH);
  }

  // The cab's inside: below the cab's header (the capacity plate) and inside its walls.
  const hold = box(freight.x + 22, freight.y + HEADER + 14, freight.width - 44, freight.height - HEADER - 28);
  const dockInside = { width: supply.width - PAD * 2, height: supply.height - HEADER - PAD * 2 };
  const crate = input.crates > 0 ? Math.max(MIN_TARGET, Math.min(MAX_CRATE, crateFit(input.crates, dockInside), crateFit(input.crates, { width: hold.width - 8, height: hold.height - 8 }))) : MAX_CRATE;
  // The toolkit opens over the dock and the freight in landscape (the scale, WEIGH and the bar stay in
  // reach); in portrait over Lifty's line, WEIGH's row and the dock (the scale stays in view); narrow: the dock.
  const toolkitPanel =
    arrangement === 'landscape'
      ? box(supply.x, supply.y, freight.x + freight.width - supply.x, supply.height)
      : arrangement === 'portrait'
        ? box(left, cue.y, width, bottom - cue.y)
        : box(left, cue.y, width, supply.y + supply.height - cue.y);
  const contentHeight = Math.max(size.height, supply.y + supply.height + GUTTER + insets.bottom);
  return { arrangement, text, back, toolkit, help, brief, freight, hold, gauge, weigh, cue, supply, crate, toolkitPanel, contentHeight, toolkitCoversWeigh: arrangement === 'portrait' };
}

export const inside = (b: Box, outer: Box) => b.x >= outer.x - 0.5 && b.y >= outer.y - 0.5 && b.x + b.width <= outer.x + outer.width + 0.5 && b.y + b.height <= outer.y + outer.height + 0.5;
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export interface HoldLayout {
  /** The cargo already aboard (or the lighter pallet), with its weight: null when there is none. */
  base: Box | null;
  /** Filler kinds: the sacks (tens, left) and the boxes (ones, right). Each is one touch target that takes one off. */
  tens: Box | null;
  ones: Box | null;
  /** exactLoad: where the crates in the freight stand. */
  crates: Box | null;
}

/** Inside the cab: the fixed cargo along the floor, the tens and ones side by side above it (a place-value mat), or the crates. */
export function holdLayout(hold: Box, filler: boolean, hasBase: boolean): HoldLayout {
  const baseH = hasBase ? Math.min(64, Math.max(48, Math.round(hold.height * 0.2))) : 0;
  const base = hasBase ? box(hold.x, hold.y + hold.height - baseH, hold.width, baseH) : null;
  const above = { x: hold.x, y: hold.y, width: hold.width, height: hold.height - baseH - (hasBase ? 8 : 0) };
  if (!filler) return { base, tens: null, ones: null, crates: box(above.x, above.y, above.width, above.height) };
  const colW = (above.width - 8) / 2;
  return { base, tens: box(above.x, above.y, colW, above.height), ones: box(above.x + colW + 8, above.y, colW, above.height), crates: null };
}

export interface DockLayout {
  /** Order slips (twoDeliveries, missingAmount) or the heavier pallet (compare): givens to read, not to touch. */
  info: Box | null;
  /** Filler kinds: the sack pile and the box pile (each a button that puts one in the freight). */
  sackPile: Box | null;
  boxPile: Box | null;
  /** exactLoad: where the crates on the dock stand. */
  crates: Box | null;
}

export function dockLayout(supply: Box, filler: boolean, hasInfo: boolean, label: number): DockLayout {
  const inner = { x: supply.x + PAD, y: supply.y + HEADER + PAD, width: supply.width - PAD * 2, height: supply.height - HEADER - PAD * 2 };
  if (!filler) return { info: null, sackPile: null, boxPile: null, crates: box(inner.x, inner.y, inner.width, inner.height) };
  // The givens get a line: a label and a big number. The piles take the rest.
  void label;
  const infoH = hasInfo ? INFO_H : 0;
  const info = hasInfo ? box(inner.x, inner.y, inner.width, infoH) : null;
  const py = inner.y + infoH + (hasInfo ? 8 : 0);
  const room = inner.y + inner.height - py;
  // A tall, slim dock (landscape) stacks the piles; otherwise they stand side by side.
  if (inner.width < 400 && room >= 2 * 140 + 10) {
    const ph = Math.min(200, (room - 10) / 2);
    return { info, sackPile: box(inner.x, py, inner.width, ph), boxPile: box(inner.x, py + ph + 10, inner.width, ph), crates: null };
  }
  const ph = Math.min(176, room);
  const pw = (inner.width - 10) / 2;
  return { info, sackPile: box(inner.x, py, pw, ph), boxPile: box(inner.x + pw + 10, py, pw, ph), crates: null };
}
