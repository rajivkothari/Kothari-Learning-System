// The Ice Bowling and Garden Golf screen fits every supported window: nothing off the screen, nothing on
// top of anything else, and every control a finger must hit at least 64 pt.
import { EAR_RING, MIN_TOUCH, aimAt, letterLayout, type Rect } from './layout';
import { spots } from './play';

/** iPad landscape and portrait, iPad Pro 12.9, iPad mini landscape, Fire HD 8 both ways, Split View 1/2 and 1/3. */
export const WINDOWS: readonly [number, number][] = [[1180, 820], [820, 1180], [1366, 1024], [1133, 744], [960, 600], [600, 960], [590, 820], [375, 820]];
const TOP = 96;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe('letter game layout', () => {
  for (const [width, height] of WINDOWS) {
    for (const count of [3, 4]) {
      for (const bottom of [0, 24]) {
        it(`${width}x${height}, ${count} letters, inset ${bottom}: fits, with nothing overlapping and nothing under 64 pt`, () => {
          const l = letterLayout({ width, height, top: TOP, bottom, count });
          const screen = { x: 0, y: TOP, w: width, h: height - bottom - TOP };
          const earWithRing = { x: l.ear.x - EAR_RING, y: l.ear.y - EAR_RING, w: l.ear.w + 2 * EAR_RING, h: l.ear.h + 2 * EAR_RING };
          for (const r of [l.panel, l.lane, l.action, l.picture, earWithRing, l.text, ...l.targets]) expect(inside(r, screen)).toBe(true);
          // The three regions, and the pieces of the ask inside its panel.
          expect(overlaps(l.panel, l.lane)).toBe(false);
          expect(overlaps(l.action, l.lane)).toBe(false);
          for (const r of [l.picture, earWithRing, l.text]) expect(inside(r, l.panel)).toBe(true);
          expect(overlaps(l.picture, earWithRing)).toBe(false);
          expect(overlaps(l.picture, l.text)).toBe(false);
          expect(overlaps(earWithRing, l.text)).toBe(false);
          if (l.side) expect(inside(l.action, l.panel)).toBe(true);
          else expect(overlaps(l.action, l.panel)).toBe(false);
          // Touch sizes.
          expect(l.ear.w).toBeGreaterThanOrEqual(MIN_TOUCH);
          expect(l.ear.h).toBeGreaterThanOrEqual(MIN_TOUCH);
          expect(l.action.h).toBeGreaterThanOrEqual(MIN_TOUCH);
          expect(l.action.w).toBeGreaterThanOrEqual(160);
          expect(l.picture.w).toBeGreaterThanOrEqual(96);
          expect(l.text.w).toBeGreaterThanOrEqual(100);
          expect(l.text.h).toBeGreaterThanOrEqual(44);
          // The pins or flags: in the lane, in lane order at their spots, apart, and big enough.
          expect(l.targets).toHaveLength(count);
          l.targets.forEach((t, i) => {
            expect(inside(t, l.lane)).toBe(true);
            expect(t.w).toBeGreaterThanOrEqual(MIN_TOUCH);
            expect(t.h).toBeGreaterThanOrEqual(MIN_TOUCH);
            expect(Math.abs(t.x + t.w / 2 - l.laneX(spots(count)[i]!))).toBeLessThanOrEqual(1);
            if (i > 0) expect(t.x - (l.targets[i - 1]!.x + l.targets[i - 1]!.w)).toBeGreaterThanOrEqual(6);
          });
          expect(l.letter).toBeGreaterThanOrEqual(30);
          // The ball rests in the lane under the targets, with room to roll.
          const resting = { x: l.rest.x - l.ball / 2, y: l.rest.y - l.ball / 2, w: l.ball, h: l.ball };
          expect(inside(resting, l.lane)).toBe(true);
          expect(resting.y - (l.targets[0]!.y + l.targets[0]!.h)).toBeGreaterThanOrEqual(40);
          expect(l.crossY).toBeLessThan(l.rest.y);
          expect(l.crossY).toBeGreaterThan(l.lane.y);
        });
      }
    }
  }

  it('uses the side arrangement only in short landscape windows', () => {
    const sides = WINDOWS.filter(([width, height]) => letterLayout({ width, height, top: TOP, bottom: 0, count: 4 }).side);
    expect(sides).toEqual([[960, 600]]);
  });

  it('turns a tap on the lane into an aim', () => {
    const l = letterLayout({ width: 1180, height: 820, top: TOP, bottom: 0, count: 4 });
    expect(aimAt(l, l.lane.x)).toBe(-1);
    expect(aimAt(l, l.lane.x + l.lane.w)).toBe(1);
    expect(aimAt(l, l.lane.x + l.lane.w / 2)).toBe(0);
    expect(aimAt(l, -500)).toBe(-1);
    for (const s of spots(4)) expect(aimAt(l, l.laneX(s))).toBeCloseTo(s, 5);
  });
});
