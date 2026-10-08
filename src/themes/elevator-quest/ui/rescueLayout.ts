// Concept Rescue board layout. Pure math, testable for every window size.
//
// The board takes the stage while the job is paused. A move is counted along a strip of floor
// cells: vertical (floors stacked, like the shaft) when it fits with full-size targets,
// otherwise horizontal (low to high, left to right) on one row when minimum targets fit across.
// Wrapped rows are balanced and left-aligned, so a strip reads on in order (7 to 10, then 11 to
// 14) and no floor is left alone under the middle. A capacity is counted along a row of load
// spaces that wraps the same way. Every cell is at least the minimum touch target.
import type { Box } from './layout';

export interface RescueLayout {
  board: Box;
  orientation: 'vertical' | 'horizontal';
  cell: number;
  gap: number;
  /** Cells per row (horizontal) or rows (vertical). */
  perLine: number;
}

export function rescueLayout(area: Box, cells: number, minTarget: number, kind: 'move' | 'fill'): RescueLayout {
  const pad = 16;
  const captionH = 96;
  const gap = 8;
  const inner = { w: area.width - pad * 2, h: area.height - pad * 2 - captionH };
  const maxCell = 84;
  const fitV = Math.floor((inner.h - (cells - 1) * gap) / cells);
  if (kind === 'move' && fitV >= minTarget) {
    const cell = Math.min(maxCell, fitV);
    return { board: area, orientation: 'vertical', cell, gap, perLine: cells };
  }
  if (kind === 'move') {
    const across = Math.floor((inner.w - (cells - 1) * gap) / cells);
    if (across >= minTarget) return { board: area, orientation: 'horizontal', cell: Math.min(maxCell, across), gap, perLine: cells };
  }
  // Horizontal, wrapping into as few lines as the width needs, the lines balanced.
  const balanced = (fit: number) => Math.ceil(cells / Math.ceil(cells / fit));
  for (let cell = maxCell; cell >= minTarget; cell -= 2) {
    const fit = Math.max(1, Math.floor((inner.w + gap) / (cell + gap)));
    const lines = Math.ceil(cells / fit);
    if (lines * cell + (lines - 1) * gap <= inner.h) return { board: area, orientation: 'horizontal', cell, gap, perLine: balanced(fit) };
  }
  const fit = Math.max(1, Math.floor((inner.w + gap) / (minTarget + gap)));
  return { board: area, orientation: 'horizontal', cell: minTarget, gap, perLine: balanced(fit) };
}
