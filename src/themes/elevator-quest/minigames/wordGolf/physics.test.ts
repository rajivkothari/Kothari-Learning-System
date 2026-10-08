// Putting physics (physics.ts): deterministic, bounded, always slowing down, and aim and power matter.
import * as fc from 'fast-check';

import { HOLES, geometryOf } from './course';
import { PHYS, angleTo, canRest, clampPower, insidePolygon, launch, normalizeAngle, simulateShot, type HoleGeometry, type Vec } from './physics';

const geos = HOLES.map(geometryOf);
const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const open: HoleGeometry = { green: box(0, 0, 100, 150), walls: [], bumpers: [], tee: { x: 50, y: 130 }, cup: { x: 50, y: 40 } };

const shotArb = fc.record({ angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), power: fc.double({ min: 0, max: 1, noNaN: true }) });
const holeArb = fc.integer({ min: 0, max: geos.length - 1 });

/** A start spot on the green where a ball can rest (the tee, or a point found from the arbitrary seed). */
function startFor(g: HoleGeometry, fx: number, fy: number): Vec {
  const xs = g.green.map((p) => p.x);
  const ys = g.green.map((p) => p.y);
  const p = { x: Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * fx, y: Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * fy };
  return canRest(p, g) ? p : g.tee;
}

describe('putting physics', () => {
  it('never produces a number that is not a number, and the ball never leaves the green', () => {
    fc.assert(
      fc.property(holeArb, shotArb, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (h, shot, fx, fy) => {
        const g = geos[h]!;
        const r = simulateShot(g, startFor(g, fx, fy), shot);
        for (const p of r.path) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          expect(insidePolygon(p, g.green)).toBe(true);
        }
        expect(r.speeds.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
        expect(r.path).toHaveLength(r.speeds.length);
        expect(canRest(r.rest, g) || r.outcome === 'cup').toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('only ever slows down: friction, every bounce and every lip-out take speed away', () => {
    fc.assert(
      fc.property(holeArb, shotArb, (h, shot) => {
        const r = simulateShot(geos[h]!, geos[h]!.tee, shot);
        for (let i = 1; i < r.speeds.length; i++) expect(r.speeds[i]!).toBeLessThanOrEqual(r.speeds[i - 1]! + 1e-9);
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic: the same hole, start, aim and power give the same path', () => {
    fc.assert(
      fc.property(holeArb, shotArb, (h, shot) => {
        const a = simulateShot(geos[h]!, geos[h]!.tee, shot);
        const b = simulateShot(geos[h]!, geos[h]!.tee, shot);
        expect(b).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });

  it('always ends: in the cup, at rest, or back where it started (never stuck mid-roll)', () => {
    fc.assert(
      fc.property(holeArb, shotArb, (h, shot) => {
        const r = simulateShot(geos[h]!, geos[h]!.tee, shot);
        expect(['cup', 'rest', 'out', 'stuck']).toContain(r.outcome);
        expect(r.path.length).toBeLessThanOrEqual(PHYS.maxFrames + PHYS.dropFrames + 1);
        if (r.outcome === 'out' || r.outcome === 'stuck') expect(r.rest).toEqual(geos[h]!.tee);
        if (r.outcome === 'cup') expect(r.rest).toEqual(geos[h]!.cup);
      }),
      { numRuns: 200 },
    );
  });

  it('launches along the aim, harder with more power', () => {
    const r = simulateShot(open, open.tee, { angle: -Math.PI / 2, power: 0.3 });
    expect(r.path[5]!.x).toBeCloseTo(50, 6);
    expect(r.path[5]!.y).toBeLessThan(130);
    const soft = simulateShot(open, open.tee, { angle: Math.PI, power: 0.2 });
    const hard = simulateShot(open, open.tee, { angle: Math.PI, power: 0.35 });
    expect(Math.abs(hard.rest.x - 50)).toBeGreaterThan(Math.abs(soft.rest.x - 50));
    expect(Math.hypot(launch({ angle: 0, power: 1 }).x, launch({ angle: 0, power: 1 }).y)).toBeCloseTo(PHYS.vMax, 6);
  });

  it('a medium putt straight at the cup drops; a slow one stops short; a hard one lips out', () => {
    const at = angleTo(open.tee, open.cup);
    expect(simulateShot(open, open.tee, { angle: at, power: 0.55 }).outcome).toBe('cup');
    const short = simulateShot(open, open.tee, { angle: at, power: 0.3 });
    expect(short.outcome).toBe('rest');
    expect(short.rest.y).toBeGreaterThan(open.cup.y);
    const hard = simulateShot(open, open.tee, { angle: at, power: 1 });
    expect(hard.events.some((e) => e.kind === 'lipOut')).toBe(true);
    expect(hard.outcome).not.toBe('cup');
  });

  it('takes the ball only below the capture speed: a fast ball over the hole rolls on', () => {
    // Started right next to the cup, aimed through it: fast lips out, slow drops.
    const from = { x: 50, y: 52 };
    const fast = simulateShot(open, from, { angle: -Math.PI / 2, power: 0.9 });
    expect(fast.events[0]?.kind).toBe('lipOut');
    expect(fast.outcome).not.toBe('cup');
    const slow = simulateShot(open, from, { angle: -Math.PI / 2, power: 0.15 });
    expect(slow.outcome).toBe('cup');
    expect(slow.path[slow.path.length - 1]).toEqual(open.cup);
  });

  it('bounces off rails and posts and keeps less speed than it came with', () => {
    const posts: HoleGeometry = { ...open, bumpers: [{ x: 50, y: 80, r: 6 }] };
    const r = simulateShot(posts, posts.tee, { angle: -Math.PI / 2, power: 0.6 });
    const hit = r.events.find((e) => e.kind === 'bumper');
    expect(hit).toBeDefined();
    expect(r.speeds[hit!.frame]!).toBeLessThan(r.speeds[hit!.frame - 1]!);
    // Straight back down after a head-on hit.
    expect(r.path[hit!.frame + 3]!.y).toBeGreaterThan(r.path[hit!.frame]!.y);
    const wall = simulateShot(open, open.tee, { angle: 0, power: 0.8 });
    expect(wall.events.some((e) => e.kind === 'wall')).toBe(true);
  });

  it('never passes through a wall, even at full power into a corner', () => {
    const walled: HoleGeometry = { ...open, walls: [{ a: { x: 0, y: 90 }, b: { x: 100, y: 90 } }], cup: { x: 50, y: 40 } };
    for (let a = -170; a <= -10; a += 5) {
      const r = simulateShot(walled, walled.tee, { angle: (a * Math.PI) / 180, power: 1 });
      expect(r.path.every((p) => p.y > 90)).toBe(true);
    }
  });

  it('puts a ball that cannot rest where it was back at the tee before the putt', () => {
    const r = simulateShot(open, { x: -20, y: 40 }, { angle: 0, power: 0.2 });
    expect(r.path[0]).toEqual(open.tee);
  });

  it('keeps aim and power inside their ranges', () => {
    expect(clampPower(5)).toBe(1);
    expect(clampPower(-1)).toBeGreaterThan(0);
    expect(clampPower(Number.NaN)).toBeGreaterThan(0);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBeCloseTo(-Math.PI / 2, 9);
  });
});
