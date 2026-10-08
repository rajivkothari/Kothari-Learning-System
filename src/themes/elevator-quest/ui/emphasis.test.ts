// Emphasis (M8.1): a math job's line marks its numbers and direction words only; marks cut the words
// without losing or repeating a character.
import { LINES } from '../content/floor15';
import { DIRECTION_WORDS, givenMarks, segments } from './emphasis';

const marked = (text: string) => segments(text, givenMarks(text)).filter((s) => s.marked).map((s) => s.text);

describe('emphasis', () => {
  it('marks the numbers and the direction words of a job line, whole words only', () => {
    const line = LINES.job('twoMoves', { start: 18, change: 9, dir: 'down', changeTwo: 6, dirTwo: 'up' });
    expect(marked(line)).toEqual(['18', '9', 'down', '6', 'up']);
    expect(marked('Upstairs, downtown, 12 above 3 below.')).toEqual(['12', 'above', '3', 'below']);
    expect(DIRECTION_WORDS).toEqual(['up', 'down', 'above', 'below']);
  });

  it('cuts text at its marks and puts it back together exactly (overlapping, unordered and out-of-range marks too)', () => {
    const text = 'The crew left it in the Workshop, next to the drill.';
    for (const marks of [[], [[24, 32]], [[46, 51], [4, 8]], [[4, 12], [8, 16]], [[-3, 3], [50, 99]]] as [number, number][][]) {
      const parts = segments(text, marks);
      expect(parts.map((p) => p.text).join('')).toBe(text);
      expect(parts.every((p) => p.text.length > 0)).toBe(true);
    }
    expect(segments(text, [[24, 32]]).filter((p) => p.marked).map((p) => p.text)).toEqual(['Workshop']);
    expect(segments('', [])).toEqual([{ text: '', marked: false }]);
  });
});
