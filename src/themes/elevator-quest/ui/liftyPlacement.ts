// Where Lifty stands, and where everything Lifty must never cover sits. Pure: no React.
//
// Lifty lives in the scene: in a band at eye level between the floor indicator and the door
// frame (cabinGeometry.band). Inside that band Lifty moves with the job: beside the words by
// default, over toward the panel or the shaft map when that is what the help is about, and
// above the crates or the test run when those take the stage. The band is placed so it never
// overlaps the floor buttons, the indicator, the doorway (the destination view), the shaft map,
// the cargo bay or the Concept Rescue board, at any window size (liftyPlacement.test.ts).
import type { DirectorView } from '../director/director';
import { NARROW_CABIN, cabinGeometry, type Rect } from './cabinGeometry';
import { cargoBoxFor } from './cargoLayout';
import type { Box, GameLayout } from './layout';

export type LiftyContext = 'default' | 'panelHelp' | 'shaftMap' | 'cargo' | 'rescue' | 'completion';

export function liftyContext(v: Pick<DirectorView, 'stage' | 'shaftMode' | 'highlights' | 'countAlong' | 'overlay' | 'task'>): LiftyContext {
  if (v.stage === 'rescue') return 'rescue';
  if (v.stage === 'cargo' || (v.stage === 'success' && v.task?.kind === 'cargo')) return 'cargo';
  if (v.stage === 'complete' || v.overlay) return 'completion';
  if (v.shaftMode !== 'status' || v.countAlong || v.task?.kind === 'shaft') return 'shaftMap';
  if (v.highlights.length > 0) return 'panelHelp';
  return 'default';
}

export interface SceneBoxes {
  shaft: Box;
  cargo: Box & { hideStatus: boolean };
  rescue: Box;
  indicator: Box;
  /** The door frame and doorway: the destination view. */
  doorway: Box;
}

const toScreen = (cabin: Box, r: Rect): Box => ({ x: cabin.x + r.x, y: cabin.y + r.y, width: r.w, height: r.h });

/** Every region of the scene that Lifty must leave clear. */
export function sceneBoxes(layout: GameLayout, shaftMode: DirectorView['shaftMode'], context: LiftyContext = 'default'): SceneBoxes {
  const { cabin, panel } = layout;
  const g = cabinGeometry(cabin, layout.bandHeight);
  const mapWidth = shaftMode === 'status' ? 64 : 96;
  const band = bandFor(layout, context);
  const below = band.y + band.height + 6;
  // Wide cabins keep a column for the shaft map beside Lifty's band; narrow ones put it below.
  const shaftTop = cabin.width < NARROW_CABIN ? below : cabin.y + 64;
  const shaft: Box = { x: cabin.x + cabin.width - mapWidth - 10, y: shaftTop, width: mapWidth, height: Math.max(0, cabin.y + cabin.height - 10 - shaftTop) };
  // The crates and the test run take the cabin view below Lifty's band.
  const cargo = cargoBoxFor(cabin, below - cabin.y);
  const underBand: Box = { x: cabin.x, y: below, width: cabin.width, height: Math.max(0, cabin.y + cabin.height - below) };
  // Portrait: whichever is bigger, the cabin below the band or the (locked) panel area.
  const rescue = layout.orientation === 'landscape' || underBand.width * underBand.height >= panel.width * panel.height ? underBand : { x: cabin.x, y: panel.y, width: cabin.width, height: panel.height };
  return { shaft, cargo, rescue, indicator: toScreen(cabin, g.indicator), doorway: toScreen(cabin, g.frame) };
}

export interface LiftyPlacement {
  /** Lifty's figure. */
  figure: Box;
  /** The speech bubble; its tail points at the figure. */
  bubble: Box;
  /** The help button (the offer belongs to Lifty). */
  help: Box;
  /** Which side of the bubble the figure stands on. */
  side: 'left' | 'right';
  /** What Lifty is attending to (drives the pointing pose). */
  attends: 'learner' | 'panel' | 'shaft' | 'below';
}

export const HELP_SIZE = { width: 96, height: 64 };
const GAP = 8;
/** The narrowest bubble that still reads well beside a help button. */
const MIN_BUBBLE_BESIDE_HELP = 220;

/** Cabins narrower than this put Lifty's band at the top during cargo (see bandFor). */
export const TINY_CABIN = 400;

/**
 * Lifty's band for a context. Normally the eye-level band under the indicator. The one exception:
 * a tiny cabin (Split View 1/3, Slide Over) during cargo, where the crates would otherwise get
 * no room. There the band moves to the top of the cabin, over the indicator, as the cargo bay
 * itself used to. Nothing else ever covers the indicator.
 */
export function bandFor(layout: GameLayout, context: LiftyContext): Box {
  if (context === 'cargo' && layout.cabin.width < TINY_CABIN) return { x: layout.cabin.x + 8, y: layout.cabin.y + 8, width: layout.cabin.width - 16, height: layout.bandHeight };
  return layout.lifty;
}

/**
 * Lifty's figure, bubble and help button for a context, all inside the band. When the help
 * button does not fit beside the words, it goes to the cabin's top-left corner (the checklist
 * hides there), or, when the band itself is at the top, under Lifty's figure.
 */
export function liftyPlacement(layout: GameLayout, context: LiftyContext, opts: { help: boolean } = { help: true }): LiftyPlacement {
  const band = bandFor(layout, context);
  const atTop = band.y === layout.cabin.y + 8;
  const fig = Math.round(Math.min(88, band.height - 8, band.width * 0.2));
  // No help on offer (a test run, the completion): the words take the whole band.
  const helpBeside = opts.help && band.width - fig - GAP - HELP_SIZE.width - GAP >= MIN_BUBBLE_BESIDE_HELP;
  const towardRight = context === 'panelHelp' || context === 'shaftMap';
  const side: LiftyPlacement['side'] = towardRight ? 'right' : 'left';
  const attends: LiftyPlacement['attends'] = context === 'panelHelp' ? 'panel' : context === 'shaftMap' ? 'shaft' : context === 'cargo' || context === 'rescue' ? 'below' : 'learner';
  const figY = band.y + (band.height - fig) / 2;
  const helpY = band.y + (band.height - HELP_SIZE.height) / 2;
  // The top-left corner, left of the indicator (as wide as it can be there, never under 64).
  const indicatorLeft = layout.cabin.x + cabinGeometry(layout.cabin, layout.bandHeight).indicator.x;
  const corner: Box = { x: layout.cabin.x + 8, y: layout.cabin.y + 8, width: Math.max(64, Math.min(HELP_SIZE.width, indicatorLeft - layout.cabin.x - 16)), height: HELP_SIZE.height };
  if (!helpBeside && atTop && opts.help) {
    // Stacked: Lifty above the help button on the left, the words beside them.
    const col = Math.max(64, Math.min(fig, band.height - 64 - GAP));
    const figure: Box = { x: band.x, y: band.y, width: col, height: col };
    const help: Box = { x: band.x, y: band.y + band.height - 64, width: Math.max(64, col), height: 64 };
    const left = band.x + Math.max(col, help.width) + GAP;
    return { figure, help, bubble: { x: left, y: band.y, width: band.x + band.width - left, height: band.height }, side: 'left', attends };
  }
  let figure: Box;
  let bubble: Box;
  let help: Box;
  if (side === 'left') {
    figure = { x: band.x, y: figY, width: fig, height: fig };
    help = helpBeside ? { x: band.x + band.width - HELP_SIZE.width, y: helpY, ...HELP_SIZE } : corner;
    const right = helpBeside ? help.x - GAP : band.x + band.width;
    bubble = { x: figure.x + fig + GAP, y: band.y, width: right - (figure.x + fig + GAP), height: band.height };
  } else {
    figure = { x: band.x + band.width - fig, y: figY, width: fig, height: fig };
    help = helpBeside ? { x: band.x, y: helpY, ...HELP_SIZE } : corner;
    const left = helpBeside ? help.x + HELP_SIZE.width + GAP : band.x;
    bubble = { x: left, y: band.y, width: figure.x - GAP - left, height: band.height };
  }
  return { figure, bubble, help, side, attends };
}

/** How long Lifty takes to move to a new place: instantly under reduced motion. */
export const liftyMoveMs = (reducedMotion: boolean) => (reducedMotion ? 0 : 320);

/** The checklist (top-left HUD) gives its corner to the help button when the band is narrow. */
export const helpUsesCorner = (layout: GameLayout, context: LiftyContext) => {
  const p = liftyPlacement(layout, context);
  return p.help.y === layout.cabin.y + 8 && bandFor(layout, context) === layout.lifty;
};

// ---------- words ----------

export const BUBBLE_PAD = { x: 14, y: 8 };
export const NAME_HEIGHT = 14;
export const MIN_LINE_FONT = 13;
export const MAX_LINE_FONT = 20;

/**
 * Largest font size (13..20) at which `text` fits the bubble, estimated for the reading face
 * (average glyph about 0.52 em, line height 1.3 em, plus room for the LIFTY label). Null when it
 * does not fit even at the minimum. The same estimate sizes the text on screen, so a line the
 * test accepts is a line the screen shows whole.
 */
export function fitLine(text: string, bubble: Pick<Box, 'width' | 'height'>): number | null {
  const width = bubble.width - BUBBLE_PAD.x * 2;
  const height = bubble.height - BUBBLE_PAD.y * 2 - NAME_HEIGHT;
  for (let size = MAX_LINE_FONT; size >= MIN_LINE_FONT; size--) {
    if (linesAt(text, width, size) * size * 1.3 <= height) return size;
  }
  return null;
}

/** Greedy word wrap with an average glyph width: how many lines `text` takes. */
export function linesAt(text: string, width: number, size: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * 0.52)));
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
