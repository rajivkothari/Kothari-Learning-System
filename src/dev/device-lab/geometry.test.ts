import { distance, shouldAppendPoint, shouldSnap, toSvgPath, traceGuidePoints } from './geometry';

describe('shouldSnap', () => {
  const target = { x: 100, y: 100 };
  it('snaps inside the forgiving radius, including the boundary', () => {
    expect(shouldSnap({ x: 160, y: 100 }, target, 60)).toBe(true);
    expect(shouldSnap({ x: 140, y: 140 }, target, 60)).toBe(true);
  });
  it('does not snap outside it', () => {
    expect(shouldSnap({ x: 161, y: 100 }, target, 60)).toBe(false);
  });
});

describe('traceGuidePoints', () => {
  it('produces samples+1 points all on the circle', () => {
    const c = { x: 500, y: 400 };
    const pts = traceGuidePoints(c, 200, 24);
    expect(pts).toHaveLength(25);
    for (const p of pts) expect(distance(p, c)).toBeCloseTo(200, 6);
  });
  it('starts top-right and ends bottom-right (an open "C")', () => {
    const c = { x: 0, y: 0 };
    const pts = traceGuidePoints(c, 100);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(first.x).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(0);
    expect(last.x).toBeGreaterThan(0);
    expect(last.y).toBeGreaterThan(0);
  });
});

describe('toSvgPath', () => {
  it('builds a move-then-line path', () => {
    expect(toSvgPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0.0 0.0 L 10.0 5.0');
    expect(toSvgPath([])).toBe('');
  });
});

describe('shouldAppendPoint', () => {
  it('always accepts the first point and filters near-duplicates', () => {
    expect(shouldAppendPoint(undefined, { x: 0, y: 0 }, 2)).toBe(true);
    expect(shouldAppendPoint({ x: 0, y: 0 }, { x: 1, y: 1 }, 2)).toBe(false);
    expect(shouldAppendPoint({ x: 0, y: 0 }, { x: 2, y: 0 }, 2)).toBe(true);
  });
});
