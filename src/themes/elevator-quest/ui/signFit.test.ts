// The live place sign fits its plate: the numbered line where it reads, else two lines or the name
// alone, and never cut off (M8.2: Fire HD 8 portrait used to show "7 · PLATFORM HEI…").
import manifestJson from '../../../../content/themes/elevator-quest/art/manifest.json';
import { LINES } from '../content/floor15';
import { LANDINGS } from '../content/landings';
import { SIGN_GLYPH, SIGN_READABLE, fitSign, twoLines } from './signFit';

const fits = (lines: readonly string[], size: number, plate: { w: number; h: number }) => lines.every((l) => l.length * SIGN_GLYPH * size <= plate.w + 1e-9) && size * lines.length <= plate.h + 1e-9;

describe('the place sign', () => {
  it('a roomy plate keeps the numbered sign on one line (D136)', () => {
    expect(fitSign(LINES.signNumbered(1, 'LOBBY'), 'LOBBY', { w: 155, h: 36 })).toEqual({ lines: ['1 · LOBBY'], size: 18 });
  });

  it('a long name on a narrow plate goes to two lines, the number with the first word', () => {
    const f = fitSign(LINES.signNumbered(14, 'HIGH SERVICE'), 'HIGH SERVICE', { w: 123, h: 39 });
    expect(f.lines).toEqual(['14 · HIGH', 'SERVICE']);
    expect(f.size).toBeGreaterThanOrEqual(SIGN_READABLE);
  });

  it('a small doorway drops the number (the indicator shows it) before the words get too small', () => {
    const f = fitSign(LINES.signNumbered(7, 'PLATFORM HEIGHTS'), 'PLATFORM HEIGHTS', { w: 75, h: 19 });
    expect(f.lines).toEqual(['PLATFORM', 'HEIGHTS']);
    // Before M8.2 this was "7 · PLATFORM HEIGHTS" held at 7 pt and cut off.
    expect(f.size).toBeGreaterThan(8);
  });

  it('every floor, on every plate size from Split View to a large iPad: the whole name, inside its plate, never smaller than the one-line sign', () => {
    const backgrounds = (manifestJson.assets as { kind: string; layer?: string; floor?: number; state?: string; sign?: { w: number; h: number } }[]).filter((a) => a.kind === 'landing' && a.layer === 'background' && a.sign);
    for (const doorPx of [40, 120, 196, 300, 409, 520]) {
      for (const a of backgrounds) {
        const name = LANDINGS.floors.find((f) => f.floor === a.floor)!.name;
        const numbered = LINES.signNumbered(a.floor!, name);
        const plate = { w: a.sign!.w * doorPx, h: a.sign!.h * doorPx };
        const f = fitSign(numbered, name, plate);
        const said = f.lines.join(' ');
        expect({ floor: a.floor, doorPx, whole: said === numbered || said === name }).toEqual({ floor: a.floor, doorPx, whole: true });
        expect({ floor: a.floor, doorPx, fits: fits(f.lines, f.size, plate) }).toEqual({ floor: a.floor, doorPx, fits: true });
        const oneLine = Math.min(plate.h * 0.5, plate.w / (numbered.length * SIGN_GLYPH));
        expect(f.size).toBeGreaterThanOrEqual(oneLine - 1e-9);
      }
      // A vector landing's sign is the name alone, fitted the same way.
      expect(fitSign(null, 'ROOFTOP GOLF', { w: 0.4 * doorPx, h: 0.08 * doorPx }).lines.join(' ')).toBe('ROOFTOP GOLF');
    }
  });

  it('splits words into the two most even lines', () => {
    expect(twoLines(['ENGINEERING', 'BAY'])).toEqual(['ENGINEERING', 'BAY']);
    expect(twoLines(['A', 'BB', 'CCC', 'DD'])).toEqual(['A BB', 'CCC DD']);
    expect(twoLines(['COMMUNICATIONS'])).toBeNull();
  });
});
