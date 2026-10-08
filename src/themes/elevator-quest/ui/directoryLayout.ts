// The building directory's layout (M8.1). Pure: no React, so the layout tests can check it.
//
// The sheet's rows have a fixed height so all twenty emblems can share ONE Skia canvas behind them:
// on the web every canvas is a WebGL context and browsers drop the oldest past about sixteen, and on
// a Fire tablet one canvas is cheaper than twenty.
/** Row height (at least 56 pt; tested). */
export const ROW_H = 58;
const GAP = 6;
const PAD = 8;
export const ICON = 40;
export const NUMBER_W = 40;

/**
 * Where each directory row goes, in the plate's content (pure; tested). Rows run down the first column
 * and on into the second (top floor first), as a lobby directory reads.
 */
export function directoryGrid(count: number, width: number, columns: 1 | 2) {
  const colW = (width - PAD * 2 - GAP * (columns - 1)) / columns;
  const perColumn = Math.ceil(count / columns);
  const cells = Array.from({ length: count }, (_, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const x = PAD + col * (colW + GAP);
    const y = PAD + row * (ROW_H + GAP);
    return { x, y, w: colW, h: ROW_H, icon: { x: x + NUMBER_W + 6, y: y + (ROW_H - ICON) / 2, w: ICON, h: ICON } };
  });
  return { cells, height: PAD * 2 + perColumn * (ROW_H + GAP) - GAP };
}

/** Two columns where a column still holds the number, the icon and a long name at the directory size. */
export const directoryColumns = (width: number): 1 | 2 => (width >= 540 ? 2 : 1);

/** Where to scroll so the car's row sits in the middle of a viewport `height` tall (0 at the top). */
export function scrollToRow(grid: ReturnType<typeof directoryGrid>, index: number, height: number): number {
  const cell = grid.cells[index];
  if (!cell || height <= 0) return 0;
  return Math.max(0, Math.min(grid.height - height, cell.y - (height - cell.h) / 2));
}

/** The DIRECTORY control's content: the word beside the icon, or under it in a narrow plate. */
export const DIRECTORY_ROW_MIN = 168;
