// Visual tokens and pure visual helpers: no rendering needed.
import { ENGINEER_WORLD, PALETTES, STORY_WORLD, accomplishment, celBands, contrast, luminance, motionScale, parallaxOffset } from './tokens';
import { STENCIL, segmentsFor, stencilText } from './stencilDigits';

const t = ENGINEER_WORLD;

describe('design tokens', () => {
  it('body text is readable on every surface (WCAG AA 4.5:1)', () => {
    for (const s of t.palette.surface) {
      expect(contrast(t.palette.ink, s)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.palette.inkMuted, s)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accents and state colors stand out from the surfaces (3:1 for large text and UI)', () => {
    for (const s of t.palette.surface) {
      for (const c of [t.palette.accentPrimary, t.palette.accentSecondary, t.palette.success, t.palette.warning, t.state.clue.ring]) expect(contrast(c, s)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(t.state.idle.label, t.state.idle.face)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.state.selected.label, t.state.selected.face)).toBeGreaterThanOrEqual(7);
  });

  it('surface levels step up in brightness, never down', () => {
    const l = t.palette.surface.map(luminance);
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeGreaterThan(l[i - 1]!);
  });

  it('selected and current never share a color', () => {
    expect(t.state.current.marker).not.toBe(t.state.selected.ring);
    expect(t.state.clue.ring).not.toBe(t.state.selected.ring);
  });

  it('warning and danger are distinct from the accents used for mistakes and help', () => {
    const everyday = [t.palette.accentPrimary, t.palette.accentSecondary, t.state.clue.ring];
    expect(everyday).not.toContain(t.palette.danger);
    expect(everyday).not.toContain(t.palette.warning);
  });

  it('touch targets are at least 64 pt', () => {
    expect(t.minTouchTarget).toBeGreaterThanOrEqual(64);
  });

  it('reduced motion is never slower, touch feedback is always immediate, parallax stops', () => {
    const n = motionScale(t, 'normal');
    const r = motionScale(t, 'reduced');
    for (const k of Object.keys(n) as (keyof typeof n)[]) expect(r[k]).toBeLessThanOrEqual(n[k]);
    expect(n.touchMs).toBe(0);
    expect(r.touchMs).toBe(0);
    for (const phase of [0, 0.1, 0.25, 0.6]) expect(parallaxOffset(t, 'reduced', 1, phase)).toBe(0);
    expect(accomplishment(t, 'large', 'reduced').ms).toBeLessThan(accomplishment(t, 'large', 'normal').ms);
  });

  it('parallax scrolls continuously with travel (seamless every period)', () => {
    expect(parallaxOffset(t, 'normal', 1, 3.25)).toBeCloseTo(t.parallax.normal * 0.25);
    expect(parallaxOffset(t, 'normal', 1, 3.999)).toBeCloseTo(t.parallax.normal * 0.999);
    expect(parallaxOffset(t, 'normal', 1, 4)).toBe(0);
  });

  it('parallax is bounded, and the gameplay plane never moves', () => {
    for (let p = 0; p < 1; p += 0.05) {
      expect(Math.abs(parallaxOffset(t, 'normal', 1, p))).toBeLessThan(t.parallax.normal);
      expect(parallaxOffset(t, 'normal', 0.5, p)).toBeLessThan(t.parallax.normal / 2);
      expect(parallaxOffset(t, 'normal', 0, p)).toBe(0);
    }
  });

  it('cel bands are three distinct values in order: shadow < base < light', () => {
    for (const base of [t.palette.metal, t.palette.paint, t.palette.floor]) {
      const b = celBands(base);
      expect(luminance(b.shadow)).toBeLessThan(luminance(b.base));
      expect(luminance(b.base)).toBeLessThan(luminance(b.light));
      expect(luminance(b.edge)).toBeLessThan(luminance(b.shadow));
    }
  });

  it('Story World swaps the display face without touching body or UI text', () => {
    expect(STORY_WORLD.type.display.family).not.toEqual(ENGINEER_WORLD.type.display.family);
    expect(STORY_WORLD.type.reading).toEqual(ENGINEER_WORLD.type.reading);
    expect(STORY_WORLD.type.ui).toEqual(ENGINEER_WORLD.type.ui);
    expect(STORY_WORLD.minTouchTarget).toBe(ENGINEER_WORLD.minTouchTarget);
    expect(Object.keys(PALETTES).sort()).toEqual(['engineer-world', 'story-world']);
  });
});

describe('stencil digits', () => {
  it('draws each digit with the expected segments', () => {
    expect(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => segmentsFor(d).length)).toEqual([6, 2, 5, 5, 4, 5, 6, 3, 7, 6]);
    const shapes = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => [...segmentsFor(d)].sort().join('')));
    expect(shapes.size).toBe(10);
  });

  it('draws a "1" as one stroke and a "0" with continuous sides (no colon look)', () => {
    expect(stencilText('1', 0, 0, 100).rects).toHaveLength(1);
    expect(stencilText('7', 0, 0, 100).rects).toHaveLength(2);
    expect(stencilText('0', 0, 0, 100).rects).toHaveLength(4);
    expect(stencilText('8', 0, 0, 100).rects).toHaveLength(7);
  });

  it('keeps every segment inside its cell, with stencil gaps between segments', () => {
    for (const d of '0123456789') {
      const { rects, width } = stencilText(d, 10, 20, 100);
      expect(width).toBeCloseTo(STENCIL.width * 100);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(r.y).toBeGreaterThanOrEqual(20 - 1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(10 + width + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(120 + 1e-9);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
      // Stencil: no two segments touch.
      for (const a of rects)
        for (const b of rects) {
          if (a === b) continue;
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(overlapX > 0 && overlapY > 0).toBe(false);
        }
    }
  });

  it('lays out multi-digit numbers left to right and skips anything that is not a digit', () => {
    const fifteen = stencilText('15', 0, 0, 50);
    expect(fifteen.rects).toHaveLength(1 + 5); // a "1" is one full-height stroke
    expect(fifteen.width).toBeCloseTo((2 * STENCIL.width + STENCIL.spacing) * 50);
    expect(stencilText('F-15', 0, 0, 50).rects).toEqual(fifteen.rects);
    expect(stencilText('', 0, 0, 50)).toEqual({ rects: [], width: 0 });
  });
});
