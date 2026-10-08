// Emphasis in words on screen (M8.1). Pure: no React.
//
// A reading job's marks come from its content (ReadingView.lineMarks / askMarks, from reading.json
// `emphasis`). A math job's line marks its givens with a small fixed vocabulary: the numbers and the
// direction words. A job line never contains its answer (content/floor15.ts fills it from the givens
// only); the screen marks a line only while nothing on the panel is ringed (a demonstrated step could
// name the answer), see GameScreen.
export type Mark = readonly [number, number];

/** Direction words a move job turns on. Whole words only, any case. */
export const DIRECTION_WORDS = ['up', 'down', 'above', 'below'] as const;

const GIVENS = new RegExp(`\\b(\\d+|${DIRECTION_WORDS.join('|')})\\b`, 'gi');

/** The numbers and direction words of a line, as [start, end) ranges. */
export function givenMarks(text: string): Mark[] {
  return [...text.matchAll(GIVENS)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
}

export interface Segment {
  text: string;
  marked: boolean;
}

/** `text` cut at its marks (ranges clamped to the text, overlapping or unordered ranges merged). */
export function segments(text: string, marks: readonly Mark[] | undefined): Segment[] {
  const ranges = [...(marks ?? [])]
    .map(([a, b]) => [Math.max(0, Math.min(text.length, a)), Math.max(0, Math.min(text.length, b))] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) out.push({ text: text.slice(at, a), marked: false });
    out.push({ text: text.slice(a, b), marked: true });
    at = b;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), marked: false });
  return out;
}
