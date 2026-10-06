// Cabin geometry. Pure math, no React or Skia: testable for every window size.
//
// Inside the car, facing the doors. Layers, back to front:
//   background  the landing beyond the doors (wall, painted stencil floor number, hall light)
//   midground   the car's back wall: segmented panels, side light columns, ceiling panels
//   gameplay    door frame, doors, floor indicator (never moves)
//   foreground  side-wall edges, handrail, maintenance labels
// Attention order: mission status (HUD, top left) -> indicator (top center) -> doors (center)
// -> panel (beside the cabin). The indicator and doors sit on the vertical center line.
import type { Box } from './layout';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CabinGeometry {
  ceiling: Rect;
  lights: Rect[];
  indicator: Rect;
  frame: Rect;
  door: Rect;
  floorY: number;
  /** Back-wall panels either side of the frame, flat cel bands. */
  panels: Rect[];
  /** Vertical side light columns (cool), at the inner edge of the side walls. */
  sideLights: Rect[];
  /** Inset of the angled side walls at the top and bottom. */
  sideInset: number;
  handrailY: number;
  /** Painted floor number on the landing wall, centered in the doorway. */
  landingNumber: { cx: number; y: number; height: number };
  labels: { text: string; x: number; y: number; size: number }[];
}

export function cabinGeometry(box: Pick<Box, 'width' | 'height'>): CabinGeometry {
  const w = box.width;
  const h = box.height;
  const ceilH = Math.max(14, h * 0.065);
  const indH = Math.min(80, Math.max(40, h * 0.11));
  const indW = Math.max(116, Math.min(w * 0.3, indH * 2.6));
  const indY = Math.max(ceilH + 6, h * 0.07);
  const floorY = h * 0.9;
  const frameTop = indY + indH + Math.max(8, h * 0.04);
  const dy = frameTop + 14;
  const doorH = Math.max(40, floorY - dy);
  const doorW = Math.min(w * 0.5, doorH * 1.05);
  const dx = (w - doorW) / 2;
  const frame = { x: dx - 14, y: frameTop, w: doorW + 28, h: doorH + 14 };
  const sideInset = w * 0.1;

  // Back-wall panels: two per side when there is room, one otherwise.
  const leftSpan = { from: sideInset + 6, to: frame.x - 6 };
  const rightSpan = { from: frame.x + frame.w + 6, to: w - sideInset - 6 };
  const per = leftSpan.to - leftSpan.from > 160 ? 2 : 1;
  const panelTop = ceilH + 6;
  const panelH = Math.max(0, floorY - panelTop - 8);
  const panels: Rect[] = [];
  for (const span of [leftSpan, rightSpan]) {
    const width = span.to - span.from;
    if (width < 24) continue;
    const pw = (width - (per - 1) * 6) / per;
    for (let i = 0; i < per; i++) panels.push({ x: span.from + i * (pw + 6), y: panelTop, w: pw, h: panelH });
  }

  const lightW = Math.max(4, w * 0.008);
  const sideLights = [
    { x: sideInset - lightW / 2, y: panelTop + 4, w: lightW, h: Math.max(0, floorY - panelTop - 12) },
    { x: w - sideInset - lightW / 2, y: panelTop + 4, w: lightW, h: Math.max(0, floorY - panelTop - 12) },
  ];

  const lightCount = w > 520 ? 3 : 2;
  const lightW2 = (w * 0.56) / lightCount - 8;
  const lights = Array.from({ length: lightCount }, (_, i) => ({ x: w * 0.22 + i * (lightW2 + 8) + 4, y: ceilH * 0.3, w: lightW2, h: Math.max(4, ceilH * 0.4) }));

  const numberH = Math.min(doorH * 0.36, doorW * 0.42);
  const labelSize = Math.max(9, Math.min(12, w * 0.016));
  // One maintenance label, low on the left wall (the right side hosts the shaft map).
  const labels = panels.length ? [{ text: 'SERVICE CAR 2 · INSPECTED', x: panels[0]!.x + 8, y: floorY - 24, size: labelSize }].filter((l) => l.x + l.text.length * l.size * 0.62 < frame.x) : [];

  return {
    ceiling: { x: 0, y: 0, w, h: ceilH },
    lights,
    indicator: { x: (w - indW) / 2, y: indY, w: indW, h: indH },
    frame,
    door: { x: dx, y: dy, w: doorW, h: doorH },
    floorY,
    panels,
    sideLights,
    sideInset,
    handrailY: floorY - Math.max(28, h * 0.22),
    landingNumber: { cx: dx + doorW / 2, y: dy + doorH * 0.24, height: numberH },
    labels,
  };
}
