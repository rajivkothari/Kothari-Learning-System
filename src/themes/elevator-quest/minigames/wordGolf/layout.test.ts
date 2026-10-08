// Word Golf's layout (layout.ts) at the windows the game supports: everything inside the window,
// nothing overlapping, the course never stretched, controls at least 64 pt.
import { textClass, textSizes } from '../../ui/textRoles';
import { HOLES } from './course';
import { MIN_TARGET, fitCourse, golfLayout, slotSize, toCourse, toScreen } from './layout';

const WINDOWS = [
  { name: 'Fire HD 8 landscape', width: 960, height: 600 },
  { name: 'Fire HD 8 portrait', width: 600, height: 960 },
  { name: 'iPad landscape', width: 1180, height: 820 },
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'iPad mini landscape', width: 1133, height: 744 },
  { name: 'large iPad landscape', width: 1366, height: 1024 },
  { name: 'Split View 1/2', width: 590, height: 820 },
  { name: 'Split View 1/3', width: 375, height: 820 },
  { name: 'Slide Over', width: 320, height: 820 },
];
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
type B = { x: number; y: number; width: number; height: number };
const inside = (b: B, w: number, h: number) => b.x >= -0.01 && b.y >= -0.01 && b.x + b.width <= w + 0.01 && b.y + b.height <= h + 0.01;
const overlaps = (a: B, b: B) => a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;

describe('Word Golf layout', () => {
  it.each(WINDOWS)('$name: everything inside the window, nothing on top of anything else', ({ width, height }) => {
    const text = textSizes(textClass({ width, height }));
    const l = golfLayout({ width, height }, NO_INSETS, text);
    for (const b of [l.top, l.back, l.title, l.course, l.panel, l.card, l.summary]) expect(inside(b, width, height)).toBe(true);
    expect(overlaps(l.back, l.course)).toBe(false);
    expect(overlaps(l.back, l.panel)).toBe(false);
    expect(overlaps(l.course, l.panel)).toBe(false);
    expect(overlaps(l.back, l.card)).toBe(false);
    expect(overlaps(l.back, l.title)).toBe(false);
    // BACK TO ELEVATOR is always a full-size control.
    expect(l.back.height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(l.back.width).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(l.tile).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(l.control).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it.each(WINDOWS)('$name: the whole course is drawn inside its box, unstretched, big enough to play', ({ width, height }) => {
    const text = textSizes(textClass({ width, height }));
    const l = golfLayout({ width, height }, NO_INSETS, text);
    for (const h of HOLES) {
      const corners = [
        { x: 0, y: 0 },
        { x: h.size.w, y: 0 },
        { x: 0, y: h.size.h },
        { x: h.size.w, y: h.size.h },
      ].map((p) => toScreen(l.view, p));
      for (const c of corners) {
        expect(c.x).toBeGreaterThanOrEqual(l.course.x - 0.01);
        expect(c.x).toBeLessThanOrEqual(l.course.x + l.course.width + 0.01);
        expect(c.y).toBeGreaterThanOrEqual(l.course.y - 0.01);
        expect(c.y).toBeLessThanOrEqual(l.course.y + l.course.height + 0.01);
      }
    }
    // The ball is at least 5 pt across the radius in every supported window.
    expect(l.view.scale * 2.5).toBeGreaterThanOrEqual(5);
  });

  it('lays the course and the panel side by side in landscape and stacks them in portrait', () => {
    const fire = (w: number, h: number) => golfLayout({ width: w, height: h }, NO_INSETS, textSizes('standard'));
    expect(fire(960, 600).orientation).toBe('landscape');
    expect(fire(960, 600).panel.x).toBeGreaterThan(fire(960, 600).course.x + fire(960, 600).course.width - 1);
    const p = fire(600, 960);
    expect(p.orientation).toBe('portrait');
    expect(p.panel.y).toBeGreaterThanOrEqual(p.course.y + p.course.height);
    // The spelling card's area runs from under the top bar to the foot; the card rises from the foot as tall as its words.
    expect(p.cardAnchor).toBe('bottom');
    expect(p.card.y + p.card.height).toBe(p.panel.y + p.panel.height);
    expect(p.card.y).toBeGreaterThanOrEqual(p.top.y + p.top.height);
    // Landscape: the panel gets the width the upright course does not need.
    const l = fire(960, 600);
    expect(l.panel.width).toBeGreaterThan(500);
    expect(l.view.rotated).toBe(false);
  });

  it('keeps the safe area clear', () => {
    const insets = { top: 24, right: 44, bottom: 20, left: 44 };
    const l = golfLayout({ width: 1180, height: 820 }, insets, textSizes('roomy'));
    expect(l.back.x).toBeGreaterThanOrEqual(44);
    expect(l.back.y).toBeGreaterThanOrEqual(24);
    expect(l.panel.x + l.panel.width).toBeLessThanOrEqual(1180 - 44);
    expect(l.panel.y + l.panel.height).toBeLessThanOrEqual(820 - 20);
  });

  it('maps course points to the screen and back, upright or turned a quarter', () => {
    for (const box of [
      { x: 10, y: 20, width: 300, height: 500 },
      { x: 0, y: 0, width: 700, height: 300 },
    ]) {
      const v = fitCourse(box, { w: 100, h: 150 });
      const p = { x: 31, y: 97 };
      const back = toCourse(v, toScreen(v, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
    expect(fitCourse({ x: 0, y: 0, width: 700, height: 300 }, { w: 100, h: 150 }).rotated).toBe(true);
    expect(fitCourse({ x: 0, y: 0, width: 300, height: 500 }, { w: 100, h: 150 }).rotated).toBe(false);
    // Turned, the tee (near end) is on the left and the far end on the right; still a turn, not a mirror.
    const v = fitCourse({ x: 0, y: 0, width: 700, height: 300 }, { w: 100, h: 150 });
    expect(toScreen(v, { x: 50, y: 140 }).x).toBeLessThan(toScreen(v, { x: 50, y: 10 }).x);
    const a = toScreen(v, { x: 0, y: 0 });
    const b = toScreen(v, { x: 10, y: 0 });
    const c = toScreen(v, { x: 0, y: 10 });
    expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeGreaterThan(0);
  });

  it('sizes the answer slots to the word, never under 44 pt (UNDO and CLEAR are full size)', () => {
    expect(slotSize(400, 4, 64, 8)).toBe(72);
    expect(slotSize(300, 8, 64, 8)).toBe(44);
    expect(slotSize(560, 6, 64, 8)).toBeGreaterThanOrEqual(64);
  });
});
