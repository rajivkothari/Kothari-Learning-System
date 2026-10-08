// Where a reading card may go. Pure: no React. The card sits in the cabin, under Lifty's band, so it
// never covers the floor buttons, the door buttons, the help button (or NEXT JOB, LET'S COUNT in its
// place), Lifty or Lifty's words; in a wide cabin it also leaves the shaft map's column alone. In a
// cabin too short for that (split views), it takes the cabin under the icon row instead: it covers
// Lifty's words while it is open, never the panel, the doors' buttons or the help button.
//
// A DIRECTORY plate in a short portrait cabin's corner (ui/layout.ts) stays clear: the box ends above it
// where that leaves room to read.
//
// A reading job uses the same box for its note and, once the note is folded, for its choice cards
// (choiceColumns), so neither ever reaches a control. The doorway sits inside this box at every
// window size, which is why a touch job folds its note: nothing can be placed clear of the door.
import { NARROW_CABIN, cabinGeometry } from './cabinGeometry';
import type { Box, GameLayout } from './layout';
import { ICON_ROW, bandFor, liftyPlacement, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { lineHeightFor, type TextSizes } from './textRoles';
import { boxesOverlap, touchLimits } from './touchAreas';

const GAP = 8;
/** Below this the space under Lifty's band is too short to read a card in. */
export const MIN_CARD_HEIGHT = 200;

/** The least height a card box keeps to be worth reading in: the title, two lines and its close button. */
const cardRoom = (layout: GameLayout) => Math.min(170, MIN_CARD_HEIGHT, layout.cabin.height - 90);

/** The DIRECTORY plate where it stands in a short portrait cabin's corner (layout.placard there), else null. */
const cornerPlate = (layout: GameLayout) => {
  const { cabin } = layout;
  const p = layout.placard;
  return p && p.x < cabin.x + cabin.width && p.y < cabin.y + cabin.height ? p : null;
};

/** The area a reading card may use (see the file comment). */
export function readingCardBox(layout: GameLayout, context: LiftyContext = 'default'): Box {
  const { cabin } = layout;
  const band = bandFor(layout, context);
  const shaft = sceneBoxes(layout, 'status', context).shaft;
  const right = cabin.width < NARROW_CABIN ? cabin.x + cabin.width - GAP : Math.min(cabin.x + cabin.width - GAP, shaft.x - GAP);
  const bottom = cabin.y + cabin.height - GAP;
  const top = band.y + band.height + GAP;
  if (bottom - top >= MIN_CARD_HEIGHT) return { x: cabin.x + GAP, y: top, width: Math.max(0, right - (cabin.x + GAP)), height: bottom - top };
  const help = liftyPlacement(layout, context, { help: true }).help;
  const below = Math.max(cabin.y + ICON_ROW, help.y + help.height + GAP);
  // A DIRECTORY plate in the cabin's corner stays in view (it works with the note open), unless that
  // leaves the card too short to read: then the card takes the foot and the plate waits under it
  // (cardCoversPlate; only the shortest split views, where the doorway is off the cabin anyway).
  const plate = cornerPlate(layout);
  const foot = plate && plate.y - GAP - below >= cardRoom(layout) ? plate.y - GAP : bottom;
  return { x: cabin.x + GAP, y: below, width: Math.max(0, cabin.width - GAP * 2), height: Math.max(0, foot - below) };
}

/** The card box covers the corner DIRECTORY plate (the screen hides the plate while a card is open). */
export function cardCoversPlate(layout: GameLayout, box: Box): boolean {
  const plate = cornerPlate(layout);
  return plate !== null && boxesOverlap(plate, box);
}

/** A choice card: at least the minimum touch target tall, and wide enough for a short phrase. */
export const CHOICE = { minHeight: 64, minWidth: 140, gap: 8 } as const;
/** The cards' sheet padding (and border), around the question and the cards. */
export const SHEET_PAD = 12;
/** The question over the cards: up to two lines at the question size, and the gap under it. */
export const askHeight = (text: Pick<TextSizes, 'question'>) => 2 * lineHeightFor(text.question, 'question') + GAP;

/**
 * How many columns a reading job's cards take in `box` (the reading card box): the fewest (one card
 * per row reads best) whose rows fit the height under the question, each at least CHOICE.minHeight
 * tall; when none fits, as many as the width allows (the sheet scrolls in the smallest windows, and
 * every card stays reachable by scrolling).
 */
export function choiceColumns(box: Pick<Box, 'width' | 'height'>, count: number, text: Pick<TextSizes, 'question'> = { question: 26 }): number {
  if (count <= 1) return 1;
  const inner = { width: box.width - SHEET_PAD * 2, height: box.height - SHEET_PAD * 2 - askHeight(text) };
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
  // No doorway on screen (the shortest split views): no landing to touch, so nothing to keep clear there.
  const doorShown = g.door.y + g.door.h <= cabin.height;
  const plate = cornerPlate(layout);
  const keep: Box[] = [
    ...(doorShown ? [{ x: cabin.x + reach.x, y: cabin.y + reach.y, width: reach.width, height: reach.height }] : []),
    scene.indicator,
    lifty.figure,
    lifty.bubble,
    lifty.help,
    { x: cabin.x, y: cabin.y, width: cabin.width, height: ICON_ROW },
    layout.panel,
    layout.directory,
  ];
  const size = NOTE_BUTTON;
  const top = band.y + band.height + GAP;
  const foot = cabin.y + cabin.height - GAP - size;
  const candidates: Box[] = [
    { x: cabin.x + GAP, y: top, width: size, height: size },
    { x: cabin.x + GAP, y: foot, width: size, height: size },
    { x: scene.shaft.x, y: scene.shaft.y, width: size, height: size },
    { x: scene.shaft.x, y: foot, width: size, height: size },
    // Beside the DIRECTORY plate in a short cabin's corner.
    ...(plate ? [{ x: plate.x + plate.width + GAP, y: Math.min(plate.y, cabin.y + cabin.height - size), width: size, height: size }] : []),
  ];
  const within = (b: Box) => b.x >= cabin.x && b.y >= cabin.y && b.x + b.width <= cabin.x + cabin.width && b.y + b.height <= cabin.y + cabin.height;
  return candidates.find((c) => within(c) && keep.every((k) => !boxesOverlap(c, k))) ?? candidates[0]!;
}
