// The freight cab art is drawn whole (contain) and only into a box of about its own shape.
import { artFits, containRect } from './cargoArt';

const cab = { width: 729, height: 768 };

describe('cargo art placement', () => {
  it('fits a box of about the art\'s shape', () => {
    expect(artFits(cab, { width: 300, height: 316 })).toBe(true);
    expect(artFits(cab, { width: 280, height: 340 })).toBe(true);
  });

  it('refuses a box much taller or wider than the art (the cab would float beside the load)', () => {
    expect(artFits(cab, { width: 330, height: 620 })).toBe(false);
    expect(artFits(cab, { width: 620, height: 300 })).toBe(false);
  });

  it('refuses empty sizes', () => {
    expect(artFits(cab, { width: 0, height: 300 })).toBe(false);
    expect(artFits({ width: 0, height: 10 }, { width: 300, height: 300 })).toBe(false);
  });

  it('contain keeps the whole image inside the box, centred', () => {
    const r = containRect(cab, { x: 0, y: 0, width: 300, height: 600 });
    expect(r.w).toBeCloseTo(300);
    expect(r.h).toBeCloseTo((768 * 300) / 729);
    expect(r.y).toBeCloseTo((600 - r.h) / 2);
  });
});
