import { MIN_BUTTON, computeLayout, panelRows, type Box } from './layout';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// Logical sizes (points / dp). Fire HD 8 is 1280x800 px; at its density that is about 960x600 dp.
const SIZES: [string, number, number][] = [
  ['Fire HD 8 landscape', 960, 600],
  ['Fire HD 8 portrait', 600, 960],
  ['Fire HD 10 landscape', 1280, 800],
  ['iPad 10.2 landscape', 1080, 810],
  ['iPad 10.2 portrait', 810, 1080],
  ['iPad Pro 12.9 landscape', 1366, 1024],
  ['iPad split 2/3 landscape', 694, 768],
  ['iPad split 1/2 portrait', 507, 1024],
  ['iPad Slide Over', 320, 1024],
  ['iPad split 1/3 landscape', 320, 768],
  ['narrow iPad window', 504, 820],
];

const inside = (b: Box, w: number, h: number) => b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('Floor 15 layout', () => {
  it.each(SIZES)('%s (%i x %i): buttons stay usable and regions never overlap', (_name, w, h) => {
    const l = computeLayout({ width: w, height: h }, NO_INSETS);
    expect(l.button).toBeGreaterThanOrEqual(MIN_BUTTON);
    expect(inside(l.panel, w, h)).toBe(true);
    expect(inside(l.cabin, w, h)).toBe(true);
    expect(inside(l.lifty, w, h)).toBe(true);
    expect(overlap(l.panel, l.cabin)).toBe(false);
    expect(overlap(l.panel, l.lifty)).toBe(false);
    expect(overlap(l.cabin, l.lifty)).toBe(false);
    expect(l.cabin.height).toBeGreaterThan(0);
    // The buttons really fit inside the panel: nothing is clipped.
    expect(l.columns * l.button + (l.columns - 1) * l.gap).toBeLessThanOrEqual(l.panel.width);
    expect(l.cramped).toBe(false);
    // The elevator stays dominant: the cabin gets a real share of the screen.
    expect(l.cabin.height).toBeGreaterThanOrEqual(w >= 400 ? Math.min(240, h * 0.3) : 90);
    expect(l.cabin.width).toBeGreaterThanOrEqual(Math.min(300, w - 24));
  });

  it('a short narrow window keeps buttons at the minimum so the cabin keeps its room', () => {
    const l = computeLayout({ width: 504, height: 820 }, NO_INSETS);
    expect(l.button).toBe(MIN_BUTTON);
    expect(l.cabin.height).toBeGreaterThanOrEqual(240);
  });

  it('prefers landscape and gives the cabin the larger share there', () => {
    const l = computeLayout({ width: 960, height: 600 }, NO_INSETS);
    expect(l.orientation).toBe('landscape');
    expect(l.cabin.width).toBeGreaterThan(l.panel.width);
    expect(l.cramped).toBe(false);
  });

  it('respects safe-area insets', () => {
    const l = computeLayout({ width: 1180, height: 820 }, { top: 24, right: 0, bottom: 20, left: 0 });
    expect(l.cabin.y).toBeGreaterThanOrEqual(24);
    expect(l.panel.y + l.panel.height).toBeLessThanOrEqual(820 - 20 + 0.5);
  });

  it('orders the panel like a real elevator: highest floors on top, floor 1 bottom-left', () => {
    expect(panelRows(4)).toEqual([
      [17, 18, 19, 20],
      [13, 14, 15, 16],
      [9, 10, 11, 12],
      [5, 6, 7, 8],
      [1, 2, 3, 4],
    ]);
    expect(panelRows(5).at(-1)).toEqual([1, 2, 3, 4, 5]);
  });
});
