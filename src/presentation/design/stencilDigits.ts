// Stencil digits as plain rectangles: painted floor numbers on a landing wall, maintenance
// labels. Pure geometry, so the renderer draws them as vector shapes with no font lookup
// (Skia's matchFont found no face in the web preview; vectors also look the same everywhere).
//
// Seven-segment layout with stencil bridges: each segment stops short of its neighbours,
// the gap reads as a painted stencil rather than an LCD.

export interface SegmentRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
type Shape = Segment | 'bc' | 'fe';

const DIGIT_SEGMENTS: Record<string, Segment[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

/** Cell proportions relative to digit height. */
export const STENCIL = { width: 0.56, stroke: 0.12, bridge: 0.03, spacing: 0.18 } as const;

function segmentRect(s: Shape): SegmentRect {
  // Bars run the full width; uprights sit between them. The bridges (B) keep every segment
  // apart, which is what makes it read as a painted stencil rather than an LCD.
  const W = STENCIL.width;
  const T = STENCIL.stroke;
  const B = STENCIL.bridge;
  const upper = { y: T + B, h: 0.5 - T / 2 - B - (T + B) };
  const lower = { y: 0.5 + T / 2 + B, h: 1 - T - B - (0.5 + T / 2 + B) };
  switch (s) {
    case 'a':
      return { x: 0, w: W, y: 0, h: T };
    case 'g':
      return { x: 0, w: W, y: 0.5 - T / 2, h: T };
    case 'd':
      return { x: 0, w: W, y: 1 - T, h: T };
    case 'f':
      return { x: 0, w: T, ...upper };
    case 'b':
      return { x: W - T, w: T, ...upper };
    case 'e':
      return { x: 0, w: T, ...lower };
    case 'c':
      return { x: W - T, w: T, ...lower };
    case 'bc':
      return { x: W - T, w: T, y: upper.y, h: lower.y + lower.h - upper.y };
    case 'fe':
      return { x: 0, w: T, y: upper.y, h: lower.y + lower.h - upper.y };
  }
}

/**
 * Without a middle bar, an upper and lower upright on the same side merge into one, so a "1"
 * reads as a stroke, not a colon. Bridges stay at every corner.
 */
function shapesFor(digit: string): Shape[] {
  const segs = DIGIT_SEGMENTS[digit] ?? [];
  if (segs.includes('g')) return segs;
  const out: Shape[] = segs.filter((x) => !['b', 'c', 'e', 'f'].includes(x));
  if (segs.includes('b') && segs.includes('c')) out.push('bc');
  else out.push(...segs.filter((x) => x === 'b' || x === 'c'));
  if (segs.includes('f') && segs.includes('e')) out.push('fe');
  else out.push(...segs.filter((x) => x === 'e' || x === 'f'));
  return out;
}

/** Rectangles for a run of digits, top-left at (x, y), digits `height` tall. Non-digits are skipped. */
export function stencilText(text: string, x: number, y: number, height: number): { rects: SegmentRect[]; width: number } {
  const digits = [...text].filter((c) => c in DIGIT_SEGMENTS);
  const advance = (STENCIL.width + STENCIL.spacing) * height;
  const rects = digits.flatMap((c, i) =>
    shapesFor(c).map((s) => {
      const r = segmentRect(s);
      return { x: x + i * advance + r.x * height, y: y + r.y * height, w: r.w * height, h: r.h * height };
    }),
  );
  const width = digits.length === 0 ? 0 : digits.length * advance - STENCIL.spacing * height;
  return { rects, width };
}

export const segmentsFor = (digit: string): readonly string[] => DIGIT_SEGMENTS[digit] ?? [];
