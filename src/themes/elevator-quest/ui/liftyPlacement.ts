// Where Lifty stands, and where everything Lifty must never cover sits. Pure: no React.
//
// Lifty lives in the scene: in a band at eye level between the floor indicator and the door
// frame (cabinGeometry.band). Inside that band Lifty moves with the job: beside the words by
// default, over toward the panel or the shaft map when that is what the help is about, and
// above the crates or the test run when those take the stage. The band is placed so it never
// overlaps the floor buttons, the indicator, the doorway (the destination view), the shaft map,
// the cargo bay or the Concept Rescue board, at any window size (liftyPlacement.test.ts).
// M8.1: the help slot moved to the cabin's top corner (helpSlot), so Lifty's words get the band's
// width; the band is as tall as a long job line needs at 20 pt (ui/layout.ts); the mission banner has
// its own box left of the indicator (bannerBox).
import { LIFTY_CANVAS } from '../art/manifest';
import type { DirectorView } from '../director/director';
import { NARROW_CABIN, cabinGeometry, type Rect } from './cabinGeometry';
import { cargoBoxFor } from './cargoLayout';
import { BUBBLE_PAD, LIFTY_MAX, bandWidthFor, figureBandHeight, liftySize, wordsHeight, type Box, type GameLayout } from './layout';
import { lineHeightFor, type TextSizes } from './textRoles';

export type LiftyContext = 'default' | 'panelHelp' | 'shaftMap' | 'cargo' | 'rescue' | 'completion';

/**
 * The cargo bay is on screen while a load waits, through its success (the accepted load and its sum),
 * and through a correction's pause (the wrong load and the load meter stay, D149).
 */
export const cargoInView = (v: Pick<DirectorView, 'stage' | 'task'>): boolean => v.stage === 'cargo' || ((v.stage === 'success' || v.stage === 'pause') && v.task?.kind === 'cargo');

export function liftyContext(v: Pick<DirectorView, 'stage' | 'shaftMode' | 'highlights' | 'countAlong' | 'task'>): LiftyContext {
  if (v.stage === 'rescue') return 'rescue';
  if (cargoInView(v)) return 'cargo';
  if (v.stage === 'complete') return 'completion';
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
  // Wide cabins keep a column for the shaft map beside Lifty's band, under the icon row (the help
  // button may stand there); narrow ones put it below the band.
  const shaftTop = cabin.width < NARROW_CABIN ? below : cabin.y + ICON_ROW + 8;
  const shaft: Box = { x: cabin.x + cabin.width - mapWidth - 10, y: shaftTop, width: mapWidth, height: Math.max(0, cabin.y + cabin.height - 10 - shaftTop) };
  // The crates and the test run take the cabin view below Lifty's band.
  const cargo = cargoBoxFor(cabin, below - cabin.y);
  const underBand: Box = { x: cabin.x, y: below, width: cabin.width, height: Math.max(0, cabin.y + cabin.height - below) };
  // Portrait: whichever is bigger, the cabin below the band or the (locked) panel area.
  const rescue = layout.orientation === 'landscape' || underBand.width * underBand.height >= panel.width * panel.height ? underBand : { x: cabin.x, y: panel.y, width: cabin.width, height: panel.height };
  return { shaft, cargo, rescue, indicator: toScreen(cabin, g.indicator), doorway: toScreen(cabin, g.frame) };
}

export interface LiftyPlacement {
  /**
   * Lifty's figure: the part of his square drawing the layout keeps clear. The drawing is
   * `figure.height` square and starts `LIFTY_CANVAS.emptyLeft` of that to the left of `figure.x`
   * (an empty strip behind him), so `figure.width` is the rest of the square.
   */
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
export { LIFTY_MAX };
/** The part of Lifty's square drawing the layout keeps clear (the empty strip behind him is not). */
const kept = (size: number) => size * (1 - LIFTY_CANVAS.emptyLeft);
/** The cabin's icon row: settings at the top right, 48 pt, and the help slot beside it (M8.1). */
export const SETTINGS_SIZE = 48;
/** The top of the cabin the icon row and the help slot use (64 pt controls, 8 pt in). */
export const ICON_ROW = 64 + 8;

/** A band that starts at most this far up the help slot's side gives up its top instead of its width. */
const SLOT_OVERLAP = 16;

/** Cabins narrower than this put Lifty's band at the top during cargo (see bandFor). */
export const TINY_CABIN = 400;

/**
 * Lifty's band for a context. Normally the eye-level band under the indicator. The one exception:
 * a tiny cabin (Split View 1/3, Slide Over) during cargo, where the crates would otherwise get
 * no room. There the band moves to the top of the cabin, over the indicator, as the cargo bay
 * itself used to. Nothing else ever covers the indicator.
 */
export function bandFor(layout: GameLayout, context: LiftyContext): Box {
  const { cabin } = layout;
  // The crates keep at least TINY_CARGO_BAY under the band (the band gives up height, never the bay).
  if (context === 'cargo' && cabin.width < TINY_CABIN) return { x: cabin.x + 8, y: cabin.y + 8, width: cabin.width - 16, height: Math.max(0, Math.min(layout.bandHeight, cabin.height - 8 - 6 - 12 - TINY_CARGO_BAY)) };
  return layout.lifty;
}
/** The least height the cargo bay keeps in a tiny cabin (one partial row of crates that scrolls). */
const TINY_CARGO_BAY = 80;

/**
 * The help slot (the help button, and NEXT JOB or LET'S COUNT in its place): one place per layout,
 * in every context (ACCESSIBILITY.md: the hint button is always in the same place). Since M8.1 it
 * stands in the cabin's top corner, never in Lifty's band, so his words get the band's width: at the
 * top right beside the settings button where the room right of the indicator allows, else at the
 * top left (the mission banner gives that corner up).
 */
export function helpSlot(layout: GameLayout): Box {
  const { cabin } = layout;
  const ind = cabinGeometry(cabin, layout.bandHeight).indicator;
  const right = cabin.x + cabin.width - 8 - SETTINGS_SIZE - 16 - HELP_SIZE.width;
  if (right >= cabin.x + ind.x + ind.w + GAP) return { x: right, y: cabin.y + 8, ...HELP_SIZE };
  return { x: cabin.x + 8, y: cabin.y + 8, width: Math.max(64, Math.min(HELP_SIZE.width, ind.x - 16)), height: HELP_SIZE.height };
}

/** Lifty's drawing size in a layout: one size in every context (D142); his words never make him grow. */
export function liftyFigureSize(layout: GameLayout): number {
  const figureBand = cabinGeometry(layout.cabin, figureBandHeight(layout.cabin.width)).band.h;
  return Math.min(liftySize(Math.min(layout.lifty.width, bandWidthFor(layout.cabin.width)), figureBand), Math.max(0, Math.floor(layout.lifty.height - 4)));
}

/**
 * Lifty's figure, bubble and help button for a context, all inside the band (the help button in
 * the cabin's top corner: helpSlot). Lifty stands at one end of the band and his words take the rest.
 */
export function liftyPlacement(layout: GameLayout, context: LiftyContext, opts: { help: boolean } = { help: true }): LiftyPlacement {
  let band = bandFor(layout, context);
  const towardRight = context === 'panelHelp' || context === 'shaftMap';
  const attends: LiftyPlacement['attends'] = context === 'panelHelp' ? 'panel' : context === 'shaftMap' ? 'shaft' : context === 'cargo' || context === 'rescue' ? 'below' : 'learner';
  // One size in every context; only a band too short for him (a tiny cabin's cargo) makes him smaller.
  const size = Math.max(0, Math.min(liftyFigureSize(layout), Math.floor(band.height - 4)));
  const fig = Math.round(kept(size));
  const help = helpSlot(layout);
  // A short cabin's band can start a few points under the help slot's foot: the words start below it.
  const touch = opts.help && overlaps(help, band) ? help.y + help.height + 4 - band.y : 0;
  if (touch > 0 && touch <= SLOT_OVERLAP) band = { ...band, y: band.y + touch, height: band.height - touch };
  // Space in the band that the help button does not take (only a band moved to the top shares it).
  const reserve = opts.help && overlaps(help, band);
  let left = band.x;
  let right = band.x + band.width;
  if (reserve) {
    if (help.x > band.x + band.width / 2) right = help.x - GAP;
    else left = help.x + help.width + GAP;
  }
  // A band at the top (tiny cabin, cargo) shares the corner with the help button: Lifty stands under it.
  if (reserve && band.y === help.y && help.x <= band.x + 8) {
    const small = Math.max(0, Math.min(help.width, band.y + band.height - (help.y + help.height + GAP)));
    const figure: Box = { x: band.x + small * LIFTY_CANVAS.emptyLeft, y: help.y + help.height + GAP, width: kept(small), height: small };
    return { figure, help, bubble: { x: left, y: band.y, width: right - left, height: band.height }, side: 'left', attends };
  }
  const figY = band.y + (band.height - size) / 2;
  if (!towardRight) {
    // The empty strip behind Lifty hangs to the left of the band's edge (nothing is drawn there).
    const figure: Box = { x: left, y: figY, width: fig, height: size };
    return { figure, help, bubble: { x: left + fig + GAP, y: band.y, width: right - (left + fig + GAP), height: band.height }, side: 'left', attends };
  }
  const figure: Box = { x: right - fig, y: figY, width: fig, height: size };
  return { figure, help, bubble: { x: left, y: band.y, width: figure.x - GAP - left, height: band.height }, side: 'right', attends };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The mission banner (top-left HUD) gives its corner to the help button where the top right has no room for it. */
export const helpUsesCorner = (layout: GameLayout) => helpSlot(layout).x === layout.cabin.x + 8;

/**
 * The mission banner (objective and current step): the cabin's top-left corner, left of the floor
 * indicator and above Lifty's band, so it never covers them. Null where the help button takes that
 * corner or there is no readable room (narrow cabins: the banner hides, as before M8.1).
 */
export function bannerBox(layout: GameLayout): Box | null {
  if (helpUsesCorner(layout)) return null;
  const { cabin } = layout;
  const ind = cabinGeometry(cabin, layout.bandHeight).indicator;
  const width = Math.min(BANNER_MAX_WIDTH, ind.x - 8 - GAP);
  const height = layout.lifty.y - GAP - (cabin.y + 8);
  return width < BANNER_MIN_WIDTH || height < 2 * lineHeightFor(layout.text.label, 'label') + 12 ? null : { x: cabin.x + 8, y: cabin.y + 8, width, height };
}
const BANNER_MAX_WIDTH = 300;
const BANNER_MIN_WIDTH = 150;

/** The maintenance readout (free ride): at most this wide, and never narrower than its text needs. */
export const READOUT_SIZE = { width: 176, minWidth: 156, height: 64 };

/**
 * Where the free-ride maintenance readout goes: the cabin's bottom-left corner, beside the door,
 * never over the door opening (the landing and its touchable object must stay visible). Null when
 * there is no room beside the door (narrow windows).
 */
export function maintenanceReadoutBox(layout: GameLayout): Box | null {
  const { cabin } = layout;
  const door = cabinGeometry(cabin, layout.bandHeight).door;
  const x = cabin.x + 12;
  const y = cabin.y + cabin.height - 12 - READOUT_SIZE.height;
  // Below the door: full width. Beside it: only as wide as the gap allows.
  if (y >= cabin.y + door.y + door.h) return { x, y, width: READOUT_SIZE.width, height: READOUT_SIZE.height };
  const width = Math.min(READOUT_SIZE.width, cabin.x + door.x - 8 - x);
  return width < READOUT_SIZE.minWidth ? null : { x, y, width, height: READOUT_SIZE.height };
}

/** How long Lifty takes to move to a new place: instantly under reduced motion. */
export const liftyMoveMs = (reducedMotion: boolean) => (reducedMotion ? 0 : 320);


// ---------- words ----------

export { BUBBLE_PAD };

/**
 * Largest dialogue size (sizes.dialogue.min..max) at which `text` fits the bubble without scrolling,
 * estimated for the reading face (ui/layout.ts linesAt). Null when it does not fit even at the
 * minimum: then the bubble shows it at the minimum and scrolls (never smaller). The same estimate
 * sizes the text on screen, so a line the tests accept is a line the screen shows whole.
 */
export function fitLine(text: string, bubble: Pick<Box, 'width' | 'height'>, range: TextSizes['dialogue'] = { min: 20, max: 24 }): number | null {
  for (let size = range.max; size >= range.min; size--) {
    if (wordsHeight(text, bubble.width, size) <= bubble.height) return size;
  }
  return null;
}

/** How many lines of `text` the bubble shows at once at `size` (the rest scrolls). */
export const bubbleLines = (bubble: Pick<Box, 'height'>, size: number) => Math.floor((bubble.height - BUBBLE_PAD.y * 2) / lineHeightFor(size, 'dialogue'));
