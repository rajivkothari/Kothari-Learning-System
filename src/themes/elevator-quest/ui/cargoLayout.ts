// Cargo bay layout. Pure math, testable for every window size.
//
// Crates are child touch targets, so they never shrink below CRATE (64 pt, ACCESSIBILITY.md).
// When a side cannot show all its crates at that size, the side scrolls instead. Dragging a
// crate is a horizontal gesture (toward the other side), so vertical swipes stay free to scroll,
// and tapping a crate always works.

export const CRATE = 64;
export const CRATE_GAP = 6;
export const SIDE_PAD = 8;
export const SIDE_HEADER = 34;
export const SIDE_GAP = 12;
const METER = 28;

export interface CargoSide {
  width: number;
  perRow: number;
  rows: number;
  contentHeight: number;
  /** The grid area's height inside the side (below the header). */
  viewportHeight: number;
  scroll: boolean;
}

export interface CargoLayout {
  crate: number;
  dock: CargoSide;
  car: CargoSide;
}

function side(width: number, height: number, items: number): CargoSide {
  const inner = Math.max(CRATE, width - SIDE_PAD * 2);
  const perRow = Math.max(1, Math.floor((inner + CRATE_GAP) / (CRATE + CRATE_GAP)));
  const rows = Math.ceil(items / perRow);
  const contentHeight = rows === 0 ? 0 : rows * CRATE + (rows - 1) * CRATE_GAP;
  const viewportHeight = Math.max(0, height - SIDE_HEADER - SIDE_PAD * 2);
  return { width, perRow, rows, contentHeight, viewportHeight, scroll: contentHeight > viewportHeight };
}

/** `box` is the whole cargo bay; `counts.inCar` includes the units already aboard. */
export function cargoLayout(box: { width: number; height: number }, counts: { onDock: number; inCar: number }, showMeter: boolean): CargoLayout {
  const half = Math.max(CRATE + SIDE_PAD * 2, (box.width - (showMeter ? METER : 0) - SIDE_GAP) / 2);
  return { crate: CRATE, dock: side(half, box.height, counts.onDock), car: side(half, box.height, counts.inCar) };
}

/**
 * Where the cargo bay sits inside the cabin view. Always inside it (it used to spill over
 * Lifty's strip in short cabins). Short cabins drop the top inset and hide the checklist so
 * the crates get the room.
 */
export function cargoBoxFor(cabin: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number; hideStatus: boolean } {
  const short = cabin.height < 360;
  const top = short ? 8 : 64;
  return { x: cabin.x + 12, y: cabin.y + top, width: Math.max(0, cabin.width - 24), height: Math.max(0, cabin.height - top - 12), hideStatus: short };
}
