// Concept Rescue board layout. Pure math, testable for every window size.
//
// The board takes the stage while the job is paused. A move is counted along a strip of floor
// cells: vertical (floors stacked, like the shaft) when it fits with full-size targets,
// otherwise horizontal (low to high, left to right). A capacity is counted along a row of load
// spaces that wraps. Every cell is at least the minimum touch target.
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
  // Horizontal, wrapping into as few lines as the width needs.
  for (let cell = maxCell; cell >= minTarget; cell -= 2) {
    const perLine = Math.max(1, Math.floor((inner.w + gap) / (cell + gap)));
    const lines = Math.ceil(cells / perLine);
    if (lines * cell + (lines - 1) * gap <= inner.h) return { board: area, orientation: 'horizontal', cell, gap, perLine };
  }
  const perLine = Math.max(1, Math.floor((inner.w + gap) / (minTarget + gap)));
  return { board: area, orientation: 'horizontal', cell: minTarget, gap, perLine };
}
