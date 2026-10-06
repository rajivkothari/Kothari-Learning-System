// Pure geometry helpers used by the drag and drawing tests.
// Functions marked 'worklet' can run on the UI thread inside gesture callbacks.

export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  'worklet';
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Forgiving snap test: the dragged item snaps when its centre is within
 * `radius` of the target centre. Radius is in the same units as the points.
 */
export function shouldSnap(itemCenter: Point, targetCenter: Point, radius: number): boolean {
  'worklet';
  return distance(itemCenter, targetCenter) <= radius;
}

/**
 * Sample points along a guide shape for the tracing spike: a "C"-like arc that a
 * child would trace from top-right, around the left, to bottom-right.
 * Coordinates are in logical stage units.
 */
export function traceGuidePoints(center: Point, radius: number, samples = 48): Point[] {
  // Screen coordinates (y down): decreasing angle sweeps counter-clockwise on screen.
  const start = -Math.PI / 4; // top-right
  const sweep = Math.PI * 1.5; // 270 degrees, ending bottom-right
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = start - (sweep * i) / samples;
    pts.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return pts;
}

/** Points to an SVG path string ("M x y L x y ..."). Empty input gives "". */
export function toSvgPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const head = `M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
  return rest.reduce((acc, p) => `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, head);
}

/**
 * Drop points closer than `minDistance` to the previous kept point. Keeps strokes
 * small on fast devices without visibly changing the line.
 */
export function shouldAppendPoint(last: Point | undefined, next: Point, minDistance: number): boolean {
  'worklet';
  if (last === undefined) return true;
  return distance(last, next) >= minDistance;
}
