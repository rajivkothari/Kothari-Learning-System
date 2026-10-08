// Floor 15 screen layout. Pure math, no React: testable for every window size.
//
// Landscape (preferred): cabin view on the left, the physical panel on the right. Portrait:
// cabin on top, then the panel. Lifty lives inside the cabin, in a band at eye level between
// the floor indicator and the door frame (cabinGeometry.band), never in a strip below it. The
// cabin absorbs whatever space is left; the panel's buttons never drop below MIN_BUTTON.
// The DIRECTORY control hangs beside the panel on every layout (M8.1): under it in landscape and in
// narrow portrait windows, to its right where a portrait window has the width.
import { LIFTY_CANVAS } from '../art/manifest';
import { NARROW_CABIN, SHAFT_COLUMN, cabinGeometry } from './cabinGeometry';
import { TEXT_FLOOR, lineHeightFor, textClass, textSizes, type TextSizes } from './textRoles';

export interface Size {
  width: number;
  height: number;
}
export interface Box extends Size {
  x: number;
  y: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** docs/ACCESSIBILITY.md: gameplay targets at least 64 x 64 pt. */
export const MIN_BUTTON = 64;
export const MAX_BUTTON = 92;
export const FLOOR_COUNT = 20;

export interface GameLayout {
  orientation: 'landscape' | 'portrait';
  cabin: Box;
  panel: Box;
  /** Lifty's band inside the cabin (screen coordinates). */
  lifty: Box;
  /** Height of that band, for cabinGeometry(cabin, bandHeight). */
  bandHeight: number;
  /** Floor button diameter and spacing inside the panel. */
  button: number;
  gap: number;
  columns: number;
  rows: number;
  /** True when the window is too small for everything at minimum size: the panel scrolls. */
  cramped: boolean;
  /**
   * The DIRECTORY control (M8.1): a brass plate beside the panel, at least 64 pt tall, that opens the
   * building directory. Under the panel in landscape; in portrait to its right where the width allows,
   * else in the cabin's bottom-left corner beside the door frame (short split views), else under it.
   * Never over the panel, the landing's touch areas, Lifty or the help button.
   */
  directory: Box;
  /**
   * The same plate where it can meet the cabin's things: under the panel in landscape (the old
   * directory placard's place, whose job it took over), or in a portrait cabin's corner. Null where it
   * stands beside or under a portrait panel. Kept under its old name for the checks that keep the
   * landing's touch areas and the folded note's button off it.
   */
  placard: Box | null;
  /** Text sizes for this window, by role (ui/textRoles.ts). */
  text: TextSizes;
}

let MARGIN = 12;
export const PANEL_HEADER = 30;
/** The DIRECTORY control: the minimum touch target tall. */
export const DIRECTORY_HEIGHT = 64;
/** Beside a portrait panel, the plate needs this much width for its icon and word. */
export const DIRECTORY_SIDE_MIN = 150;
const DIRECTORY_SIDE_MAX = 240;

/**
 * The band Lifty's figure is sized for (D142): taller in narrow cabins, where the band spans the
 * cabin. His words may need more height than this (liftyBandHeight); he does not grow with it.
 */
export function figureBandHeight(cabinWidth: number): number {
  return cabinWidth < NARROW_CABIN ? 140 : 112;
}

// ---- Lifty's words (M8.1) ----
// The bubble keeps BUBBLE_PAD around the words and starts beside Lifty's figure. Its words are at
// least TEXT_FLOOR.dialogue.min pt (20) and the band is tall enough for a long job line at that size;
// a line longer still scrolls (never smaller).
export const BUBBLE_PAD = { x: 14, y: 8 };
/** Average glyph width of the reading face, in em (the fit estimate the tests and the screen share). */
export const GLYPH_EM = 0.52;
/** A long job line (said after "New job."): the band is tall enough for it at the smallest size. */
export const REFERENCE_LINE = 'New job. Express service! This car stops at 10, 15, and on up, 5 floors at a time. The repair kit is at stop 4. Which floor is that?';
/** The tallest Lifty's band ever gets for his words; a longer line scrolls in the bubble. */
export const WORDS_BAND_MAX = 184;
/** The largest share of a cabin's height his words may take (short cabins keep a doorway). */
const WORDS_SHARE = 0.42;
/** Lifty's widest drawing (pt), and the share of the band he may take (liftyPlacement). */
export const LIFTY_MAX = 136;
export const FIGURE_SHARE = 0.3;
/** The empty strip at the left of Lifty's square drawing. */
const LIFTY_EMPTY_LEFT = LIFTY_CANVAS.emptyLeft;
const WORDS_GAP = 8;

/** The width of Lifty's band in a cabin this wide (cabinGeometry.band). */
export const bandWidthFor = (cabinWidth: number) => Math.max(0, cabinWidth < NARROW_CABIN ? cabinWidth - 16 : cabinWidth - 8 - SHAFT_COLUMN);

/** Lifty's drawing size for a band (D142: about 132 pt on iPad, 120 on a Fire HD 8, 117 in Split View 1/3). */
export function liftySize(bandWidth: number, figureBand: number): number {
  return Math.round(Math.max(0, Math.min(LIFTY_MAX, figureBand - 4, (bandWidth * FIGURE_SHARE) / (1 - LIFTY_EMPTY_LEFT))));
}

/** Greedy word wrap with an average glyph width: how many lines `text` takes. */
export function linesAt(text: string, width: number, size: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * GLYPH_EM)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (used === 0) used = len;
    else if (used + 1 + len <= perLine) used += 1 + len;
    else {
      lines += 1;
      used = len;
    }
    while (used > perLine) {
      lines += 1;
      used -= perLine;
    }
  }
  return lines;
}

/** The height a bubble `width` wide needs for `text` at `size` (words, padding). */
export const wordsHeight = (text: string, width: number, size: number) => linesAt(text, width - BUBBLE_PAD.x * 2, size) * lineHeightFor(size, 'dialogue') + BUBBLE_PAD.y * 2;

/** The height Lifty's words need in a cabin this wide: the reference line at the smallest dialogue size. */
export function wordsBandHeight(cabinWidth: number): number {
  const band = bandWidthFor(cabinWidth);
  // Lifty at his largest for this band: the cabin's height can only make him smaller.
  const figure = liftySize(band, LIFTY_MAX + 4);
  const bubble = band - figure * (1 - LIFTY_EMPTY_LEFT) - WORDS_GAP;
  return Math.min(WORDS_BAND_MAX, wordsHeight(REFERENCE_LINE, bubble, TEXT_FLOOR.dialogue.min));
}

/**
 * The band height a cabin this wide asks for (an upper estimate, before the cabin's height is known):
 * the figure's band, or taller where his words need it.
 */
export function liftyBandHeight(cabinWidth: number): number {
  return Math.max(figureBandHeight(cabinWidth), wordsBandHeight(cabinWidth));
}

/** Lifty's band in a cabin; `foot`: the band ends above this (cabin coordinates). */
function withBand(cabin: Box, foot = cabin.height): { lifty: Box; bandHeight: number } {
  // cabinGeometry gives the band the spare gap above the frame on top of the height asked for: the
  // words count it in, so the doorway gives up only what the words really need (D142: Lifty's own
  // band never costs the doorway).
  const probe = cabinGeometry(cabin, 100).band;
  const spare = probe.h - 100;
  // A short cabin (split views) keeps its doorway: the words get at most WORDS_SHARE of its height
  // there, and a long line scrolls in the bubble. The band never runs past the cabin's foot.
  const words = Math.min(wordsBandHeight(cabin.width) - spare, cabin.height * WORDS_SHARE);
  const wanted = Math.max(figureBandHeight(cabin.width), words);
  const bandHeight = Math.max(0, Math.min(wanted, Math.min(cabin.height - 4, foot) - probe.y - spare));
  const b = cabinGeometry(cabin, bandHeight).band;
  return { lifty: { x: cabin.x + b.x, y: cabin.y + b.y, width: b.w, height: b.h }, bandHeight };
}

export function panelPad(button: number): number {
  return button <= MIN_BUTTON ? 10 : 14;
}

function panelSize(button: number, gap: number, columns: number, rows: number): Size {
  // rows of floor buttons + one row of door buttons + a header plate
  const pad = panelPad(button);
  return {
    width: columns * button + (columns - 1) * gap + pad * 2,
    height: PANEL_HEADER + (rows + 1) * button + rows * gap + gap + pad * 2,
  };
}

function fitButton(limitW: number, limitH: number, columns: number, rows: number): { button: number; gap: number; fits: boolean } {
  for (let b = MAX_BUTTON; b >= MIN_BUTTON; b -= 2) {
    for (const gap of [Math.max(8, Math.round(b * 0.16)), 8]) {
      const p = panelSize(b, gap, columns, rows);
      if (p.width <= limitW && p.height <= limitH) return { button: b, gap, fits: true };
    }
  }
  return { button: MIN_BUTTON, gap: 8, fits: false };
}

/** The cabin must stay the dominant thing on screen. */
const MIN_CABIN_WIDTH = 300;
const MIN_CABIN_SHARE = 0.4;

export function computeLayout(window: Size, insets: Insets): GameLayout {
  MARGIN = window.width < 400 ? 8 : 12;
  const area: Box = {
    x: insets.left + MARGIN,
    y: insets.top + MARGIN,
    width: Math.max(0, window.width - insets.left - insets.right - MARGIN * 2),
    height: Math.max(0, window.height - insets.top - insets.bottom - MARGIN * 2),
  };

  // Side by side whenever the cabin can still be at least MIN_CABIN_WIDTH wide next to a
  // minimum-size panel: landscape, and near-square windows such as iPad split view.
  const minPanel = panelSize(MIN_BUTTON, 8, 4, FLOOR_COUNT / 4);
  const sideBySide = area.width >= area.height * 0.85 && area.width - minPanel.width - MARGIN >= MIN_CABIN_WIDTH;

  if (sideBySide) {
    const columns = 4;
    const rows = FLOOR_COUNT / columns;
    // The DIRECTORY plate hangs under the panel: the buttons size to leave it room (never below MIN_BUTTON).
    const under = DIRECTORY_HEIGHT + MARGIN;
    const { button, gap, fits } = fitButton(Math.max(minPanel.width, area.width * 0.4), area.height - under, columns, rows);
    const p = panelSize(button, gap, columns, rows);
    const stack = p.height + under;
    const panel: Box = { x: area.x + area.width - p.width, y: area.y + Math.max(0, (area.height - stack) / 2), width: p.width, height: Math.min(p.height, area.height - under) };
    const directory: Box = { x: panel.x, y: panel.y + panel.height + MARGIN, width: panel.width, height: DIRECTORY_HEIGHT };
    const leftWidth = Math.max(0, area.width - p.width - MARGIN);
    const cabin: Box = { x: area.x, y: area.y, width: leftWidth, height: area.height };
    return { orientation: 'landscape', cabin, panel, ...withBand(cabin), button, gap, columns, rows, cramped: !fits, directory, placard: directory, text: textSizes(textClass(cabin)) };
  }

  // Stacked (portrait): reserve a real share of the height for the cabin first.
  // Tiny windows (Slide Over) keep 64 pt buttons and let the cabin shrink instead.
  // The DIRECTORY plate stands to the right of the panel where the width allows; else in the cabin's
  // bottom-left corner beside the door frame, just over the panel, where that corner has room; else
  // under the panel. Whichever leaves the cabin the most height (in that order on a tie).
  type Fit = { columns: number; fit: { button: number; gap: number; fits: boolean } };
  const fitFor = (limitW: number, limitH: number): Fit => {
    const five = fitButton(limitW, limitH, 5, FLOOR_COUNT / 5);
    return five.fits ? { columns: 5, fit: five } : { columns: 4, fit: fitButton(limitW, limitH, 4, FLOOR_COUNT / 4) };
  };
  const solve = (mode: 'beside' | 'corner' | 'under'): Fit => {
    let r: Fit = { columns: 5, fit: fitButton(area.width, 0, 5, FLOOR_COUNT / 5) };
    const preferredCabin = Math.max(240, area.height * MIN_CABIN_SHARE);
    for (const minCabin of [preferredCabin, 120, 90]) {
      // The preferred cabin has room for Lifty's words; a smaller one keeps his figure's band (his words scroll).
      const band = minCabin === preferredCabin ? liftyBandHeight(area.width) : figureBandHeight(area.width);
      const panelLimit = Math.max(0, area.height - band - MARGIN - minCabin);
      // Beside: the panel keeps the height budget and gives up width; under: the other way round.
      r = mode === 'beside' ? fitFor(area.width - DIRECTORY_SIDE_MIN - MARGIN, panelLimit) : fitFor(area.width, panelLimit - (mode === 'under' ? DIRECTORY_HEIGHT + MARGIN : 0));
      // Short of room for the preferred cabin: keep the buttons at the minimum size so every
      // spare point goes to the cabin, instead of growing the buttons into it.
      if (r.fit.fits && minCabin !== preferredCabin) r = { columns: r.columns, fit: { button: MIN_BUTTON, gap: 8, fits: true } };
      if (r.fit.fits) break;
    }
    return r;
  };
  const build = (mode: 'beside' | 'corner' | 'under', r: Fit): GameLayout | null => {
    const { columns, fit } = r;
    const rows = FLOOR_COUNT / columns;
    const { button, gap } = fit;
    const p = panelSize(button, gap, columns, rows);
    const under = mode === 'under' ? DIRECTORY_HEIGHT + MARGIN : 0;
    const panelHeight = Math.min(p.height, area.height - under);
    const sideWidth = mode === 'beside' ? Math.min(DIRECTORY_SIDE_MAX, area.width - p.width - MARGIN) : 0;
    const rowWidth = p.width + (mode === 'beside' ? MARGIN + sideWidth : 0);
    const panel: Box = { x: area.x + Math.max(0, (area.width - rowWidth) / 2), y: area.y + area.height - under - panelHeight, width: Math.min(p.width, area.width), height: panelHeight };
    const cabin: Box = { x: area.x, y: area.y, width: area.width, height: Math.max(0, panel.y - MARGIN - area.y) };
    const corner = mode === 'corner' ? cornerPlate(cabin) : null;
    if (mode === 'corner' && !corner) return null;
    const directory: Box =
      mode === 'beside'
        ? { x: panel.x + panel.width + MARGIN, y: panel.y, width: sideWidth, height: DIRECTORY_HEIGHT }
        : (corner?.plate ?? { x: panel.x, y: panel.y + panel.height + MARGIN, width: panel.width, height: DIRECTORY_HEIGHT });
    const band = withBand(cabin, corner ? corner.plate.y - cabin.y - 8 : cabin.height);
    return { orientation: 'portrait', cabin, panel, ...band, button, gap, columns, rows, cramped: !fit.fits, directory, placard: corner ? corner.plate : null, text: textSizes(textClass(cabin)) };
  };
  const options: GameLayout[] = [];
  for (const mode of ['beside', 'corner', 'under'] as const) {
    const r = solve(mode);
    const built = r.fit.fits || mode === 'under' ? build(mode, r) : null;
    if (built) options.push(built);
  }
  return options.reduce((best, o) => (o.cabin.height > best.cabin.height ? o : best));
}

/** Narrowest corner plate: the icon over the word (the word steps down to fit, the plate never does). */
export const DIRECTORY_CORNER_MIN = 92;
/** A plate this wide holds the icon over the word at the 16 pt label size. */
export const DIRECTORY_ROW_STACK_MIN = 112;
/** The least band Lifty keeps over a corner plate. */
const CORNER_BAND_MIN = 104;

/**
 * The DIRECTORY plate in a short portrait cabin's bottom-left corner, just over the panel, beside the
 * door frame (the landing's touch areas keep to the frame) and under Lifty's band. Where the doorway
 * runs off the cabin anyway (the shortest split views), Lifty's band gives way to it (down to
 * CORNER_BAND_MIN). Null when the corner is too small.
 */
function cornerPlate(cabin: Box): { plate: Box } | null {
  const { lifty, bandHeight } = withBand(cabin);
  const g = cabinGeometry(cabin, bandHeight);
  const width = Math.min(DIRECTORY_SIDE_MAX, g.frame.x - 16);
  // It reaches down into the margin over the panel, so the cabin keeps as much room as it can.
  const y = cabin.y + cabin.height + MARGIN - DIRECTORY_HEIGHT;
  const plate = { x: cabin.x + 8, y, width, height: DIRECTORY_HEIGHT };
  const doorShown = g.door.y + g.door.h <= cabin.height;
  // With a doorway on screen the plate keeps its 16 pt word; only where it runs off may the word step down.
  if (width < (doorShown ? DIRECTORY_ROW_STACK_MIN : DIRECTORY_CORNER_MIN)) return null;
  if (y >= lifty.y + lifty.height + 8) return { plate };
  return !doorShown && y - 8 - lifty.y >= CORNER_BAND_MIN ? { plate } : null;
}

/** A directory sheet shorter than this shows fewer than four rows: it takes the panel's place too. */
export const DIRECTORY_SHEET_MIN = 420;

/**
 * Where the building directory opens: over the cabin view, so the panel stays in reach beside it
 * (a floor pressed rides, and puts the directory away). In a cabin too short for a useful list (split
 * views, Slide Over) it covers the cabin and the panel, and Back returns to both.
 */
export function directorySheetBox(layout: GameLayout): Box {
  const { cabin, panel, directory } = layout;
  if (cabin.height >= DIRECTORY_SHEET_MIN) return { ...cabin };
  const x = Math.min(cabin.x, panel.x);
  const right = Math.max(cabin.x + cabin.width, panel.x + panel.width, directory.x + directory.width);
  const bottom = Math.max(cabin.y + cabin.height, panel.y + panel.height, directory.y + directory.height);
  return { x, y: cabin.y, width: right - x, height: bottom - cabin.y };
}

/** Floors in panel order: top row first, highest floors at the top, like a real panel. */
export function panelRows(columns: number, floorCount = FLOOR_COUNT): number[][] {
  const rows: number[][] = [];
  for (let first = 1; first <= floorCount; first += columns) rows.unshift(Array.from({ length: Math.min(columns, floorCount - first + 1) }, (_, i) => first + i));
  return rows;
}
