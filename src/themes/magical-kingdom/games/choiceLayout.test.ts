// A picture game's screen fits every supported window, with and without the quest's path: nothing off
// the screen, nothing on top of anything else, every control a finger must hit at least 64 pt, and no
// stepping stone under 40 pt.
import { EAR_RING, MIN_STONE, MIN_TOUCH, choiceLayout, type Rect } from './choiceLayout';
import { WINDOWS } from './layout.test';

const TOP = 96;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const apart = (rs: Rect[]) => rs.every((a, i) => rs.every((b, j) => i >= j || !overlaps(a, b)));

describe('picture game layout', () => {
  for (const [width, height] of WINDOWS) {
    for (const quest of [false, true]) {
      for (const bottom of [0, 24]) {
        it(`${width}x${height}${quest ? ', the quest' : ''}, inset ${bottom}: fits, nothing overlapping, nothing under 64 pt`, () => {
          const l = choiceLayout({ width, height, top: TOP, bottom, quest, turns: quest ? 5 : 6 });
          const screen = { x: 0, y: TOP, w: width, h: height - bottom - TOP };
          const ear = { x: l.ear.x - EAR_RING, y: l.ear.y - EAR_RING, w: l.ear.w + 2 * EAR_RING, h: l.ear.h + 2 * EAR_RING };
          const all = [l.bar, ear, l.text, l.stage, ...l.slots, ...l.choices, l.actions, l.help, l.star, l.next, ...l.stones];
          for (const r of all) expect(inside(r, screen)).toBe(true);
          // The bar's pieces stay in the bar and apart.
          expect(inside(ear, l.bar)).toBe(true);
          expect(inside(l.text, l.bar)).toBe(true);
          expect(overlaps(ear, l.text)).toBe(false);
          expect(l.text.w).toBeGreaterThanOrEqual(width < 480 ? 120 : 140);
          // The regions do not overlap one another.
          const regions = [l.bar, ...l.slots, ...l.choices, l.help, l.star];
          if (l.pathRow && l.path) regions.push(l.path);
          expect(apart(regions)).toBe(true);
          expect(apart([l.help, l.next])).toBe(true);
          for (const r of l.slots) expect(inside(r, l.stage)).toBe(true);
          for (const r of [l.help, l.star, l.next]) expect(inside(r, l.actions)).toBe(true);
          // Touch sizes: choices, star, Help, Next, the ear, and a slot big enough to read a picture in.
          for (const r of l.choices) {
            expect(r.w).toBeGreaterThanOrEqual(MIN_TOUCH);
            expect(r.h).toBeGreaterThanOrEqual(MIN_TOUCH);
          }
          for (const r of [l.help, l.star, l.next, l.ear]) expect(r.h).toBeGreaterThanOrEqual(MIN_TOUCH);
          expect(l.next.w).toBeGreaterThanOrEqual(160);
          for (const r of l.slots) expect(r.w).toBeGreaterThanOrEqual(120);
          expect(l.printH).toBeLessThan(l.slots[0].h / 2);
          // The path: five stones then the castle, in a line, none under 40 pt; the dots otherwise.
          if (quest) {
            expect(l.dots).toBeNull();
            expect(l.stones).toHaveLength(5);
            expect(l.castle).not.toBeNull();
            const pieces = [...l.stones, l.castle!];
            for (const r of pieces) {
              expect(r.w).toBeGreaterThanOrEqual(MIN_STONE);
              expect(inside(r, l.path!)).toBe(true);
            }
            expect(apart(pieces)).toBe(true);
            if (!l.pathRow) expect(overlaps(l.path!, l.text)).toBe(false);
          } else {
            expect(l.path).toBeNull();
            expect(inside(l.dots!, l.bar)).toBe(true);
            expect(overlaps(l.dots!, l.text)).toBe(false);
          }
        });
      }
    }
  }

  it('sets the stage beside the choices only in short landscape windows', () => {
    const sides = WINDOWS.filter(([width, height]) => choiceLayout({ width, height, top: TOP, bottom: 0, quest: false }).side);
    expect(sides).toEqual([[960, 600]]);
  });

  it('gives the path its own row only where the bar has no room for 40 pt stones', () => {
    const rows = WINDOWS.filter(([width, height]) => choiceLayout({ width, height, top: TOP, bottom: 0, quest: true }).pathRow).map(([w]) => w);
    expect(rows).toEqual(expect.arrayContaining([375]));
    expect(rows).not.toContain(1180);
  });
});
