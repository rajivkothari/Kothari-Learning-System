// Where a reading card may go. Pure: no React. The card sits in the cabin, under Lifty's band, so it
// never covers the floor buttons, the door buttons, the help button (or NEXT JOB, LET'S COUNT in its
// place), Lifty or Lifty's words; in a wide cabin it also leaves the shaft map's column alone. In a
// cabin too short for that (split views), it takes the cabin under the icon row instead: it covers
// Lifty's words while it is open, never the panel, the doors' buttons or the help button.
//
// A reading job uses the same box for its note and, once the note is folded, for its choice cards
// (choiceColumns), so neither ever reaches a control. The doorway sits inside this box at every
// window size, which is why a touch job folds its note: nothing can be placed clear of the door.
import { NARROW_CABIN, cabinGeometry } from './cabinGeometry';
import type { Box, GameLayout } from './layout';
import { bandFor, liftyPlacement, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { boxesOverlap, touchLimits } from './touchAreas';

const GAP = 8;
/** Below this the space under Lifty's band is too short to read a card in. */
export const MIN_CARD_HEIGHT = 200;
/** The cabin's icon row (and the corner help button in narrow cabins) at the top of the cabin. */
const ICON_ROW = 64 + 8;

/** The area a reading card may use (see the file comment). */
export function readingCardBox(layout: GameLayout, context: LiftyContext = 'default'): Box {
  const { cabin } = layout;
  const band = bandFor(layout, context);
  const shaft = sceneBoxes(layout, 'status', context).shaft;
  const right = cabin.width < NARROW_CABIN ? cabin.x + cabin.width - GAP : Math.min(cabin.x + cabin.width - GAP, shaft.x - GAP);
  const top = band.y + band.height + GAP;
  const under = cabin.y + cabin.height - GAP - top;
  if (under >= MIN_CARD_HEIGHT) return { x: cabin.x + GAP, y: top, width: Math.max(0, right - (cabin.x + GAP)), height: under };
  const help = liftyPlacement(layout, context, { help: true }).help;
  const below = Math.max(cabin.y + ICON_ROW, help.y + help.height + GAP);
  return { x: cabin.x + GAP, y: below, width: Math.max(0, cabin.width - GAP * 2), height: Math.max(0, cabin.y + cabin.height - GAP - below) };
}

/** A choice card: at least the minimum touch target tall, and wide enough for a short phrase. */
export const CHOICE = { minHeight: 64, minWidth: 120, gap: 8 } as const;
/** The sheet's padding and the instruction over the cards (up to two lines at the reading size). */
const SHEET_PAD = 12;
const ASK_HEIGHT = 2 * 27 + 8;

/**
 * How many columns a reading job's cards take in `box` (the reading card box): the fewest (one card
 * per row reads best) whose rows fit the height under the instruction, each at least CHOICE.minHeight
 * tall; when none fits, as many as the width allows (the sheet scrolls in the smallest windows).
 */
export function choiceColumns(box: Pick<Box, 'width' | 'height'>, count: number): number {
  if (count <= 1) return 1;
  const inner = { width: box.width - SHEET_PAD * 2, height: box.height - SHEET_PAD * 2 - ASK_HEIGHT };
  const widest = Math.max(1, Math.min(count, Math.floor((inner.width + CHOICE.gap) / (CHOICE.minWidth + CHOICE.gap))));
  for (let columns = 1; columns <= widest; columns++) {
    const rows = Math.ceil(count / columns);
    if (rows * CHOICE.minHeight + (rows - 1) * CHOICE.gap <= inner.height) return columns;
  }
  return widest;
}

/** The folded note's button: the minimum touch target, square. */
export const NOTE_BUTTON = 64;

/**
 * Where the folded note's button goes when the landing or the panel is the answer (with cards, it
 * sits on the cards' sheet instead). Never over the landing's touch areas (the doorway, its frame and
 * the floor below it), the floor indicator, Lifty or Lifty's words, the help button (NEXT JOB, LET'S
 * COUNT), the cabin's icon row, the panel or the directory placard. The first place that is clear:
 * on the cabin wall beside the doorway, just under Lifty's band; lower on that wall; or (a doorway
 * too wide for the wall, Slide Over) at the top or the foot of the shaft strip, which it then covers
 * in part while a reading job waits.
 */
export function noteButtonBox(layout: GameLayout, context: LiftyContext = 'default'): Box {
  const { cabin } = layout;
  const g = cabinGeometry(cabin, layout.bandHeight);
  const band = bandFor(layout, context);
  const scene = sceneBoxes(layout, 'status', context);
  const lifty = liftyPlacement(layout, context, { help: true });
  const reach = touchLimits(g, cabin, scene.shaft.width);
  const keep: Box[] = [
    { x: cabin.x + reach.x, y: cabin.y + reach.y, width: reach.width, height: reach.height },
    scene.indicator,
    lifty.figure,
    lifty.bubble,
    lifty.help,
    { x: cabin.x, y: cabin.y, width: cabin.width, height: ICON_ROW },
    layout.panel,
    ...(layout.placard ? [layout.placard] : []),
  ];
  const size = NOTE_BUTTON;
  const top = band.y + band.height + GAP;
  const foot = cabin.y + cabin.height - GAP - size;
  const candidates: Box[] = [
    { x: cabin.x + GAP, y: top, width: size, height: size },
    { x: cabin.x + GAP, y: foot, width: size, height: size },
    { x: scene.shaft.x, y: scene.shaft.y, width: size, height: size },
    { x: scene.shaft.x, y: foot, width: size, height: size },
  ];
  const within = (b: Box) => b.x >= cabin.x && b.y >= cabin.y && b.x + b.width <= cabin.x + cabin.width && b.y + b.height <= cabin.y + cabin.height;
  return candidates.find((c) => within(c) && keep.every((k) => !boxesOverlap(c, k))) ?? candidates[0]!;
}
