// The live place sign fitted to its plate (M8.2). Pure: no React, no Skia.
//
// The sign is native text sized up front (adjustsFontSizeToFit is native-only). On a large doorway
// the illustrated landing's sign reads "<floor> · <NAME>" on one line (D136). On a small one (Fire HD 8
// portrait, about 200 pt of doorway) a long name used to be cut off ("7 · PLATFORM HEI…"): its size was
// held at 7 pt and the rest ellipsised. Now the sign takes the first of these layouts that reads at
// SIGN_READABLE or larger, and otherwise the largest of them: the numbered line; the numbered sign on
// two lines (the number stays with the first word); the name alone (the indicator above the doors
// still shows the floor); the name on two lines. Every layout fits its plate by the estimate, so the
// name is never cut off.

/** Average glyph width in ems for the sign's heavy capitals, letter spacing included (the estimate CabinScene has always used). */
export const SIGN_GLYPH = 0.92;
/** A sign smaller than this (pt) tries the next layout. */
export const SIGN_READABLE = 10;
/** One line fills half the plate's height; each of two lines a little less. */
const ONE_LINE = 0.5;
const TWO_LINES = 0.45;

export interface SignFit {
  lines: string[];
  /** Font size in pt. */
  size: number;
}

/** The split of words into two lines with the shorter longest line, or null for a single word. */
export function twoLines(words: readonly string[], keep = 0): [string, string] | null {
  let best: [string, string] | null = null;
  for (let i = Math.max(1, keep); i < words.length; i++) {
    const pair: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    if (!best || Math.max(pair[0].length, pair[1].length) < Math.max(best[0].length, best[1].length)) best = pair;
  }
  return best;
}

/**
 * Fit the sign to a plate `w` by `h` pt. `numbered`: the illustrated sign ("<floor> · <NAME>"), ending
 * with `name`; null on a vector landing, whose sign is the name alone.
 */
export function fitSign(numbered: string | null, name: string, plate: { w: number; h: number }): SignFit {
  const one = (t: string): SignFit => ({ lines: [t], size: Math.min(plate.h * ONE_LINE, plate.w / (t.length * SIGN_GLYPH)) });
  const two = (pair: [string, string] | null): SignFit | null => (pair ? { lines: pair, size: Math.min(plate.h * TWO_LINES, plate.w / (Math.max(pair[0].length, pair[1].length) * SIGN_GLYPH)) } : null);
  const nameWords = name.split(' ').filter(Boolean);
  const candidates: SignFit[] = [];
  if (numbered) {
    candidates.push(one(numbered));
    // The number and its mark stay on the first line, with at least the name's first word.
    const prefix = numbered.endsWith(name) ? numbered.slice(0, numbered.length - name.length).trim() : null;
    if (prefix) {
      const pair = twoLines(nameWords);
      const numberedPair = pair ? two([`${prefix} ${pair[0]}`, pair[1]]) : null;
      if (numberedPair) candidates.push(numberedPair);
    }
  }
  candidates.push(one(name));
  const namePair = two(twoLines(nameWords));
  if (namePair) candidates.push(namePair);
  return candidates.find((c) => c.size >= SIGN_READABLE) ?? candidates.reduce((a, b) => (b.size > a.size ? b : a));
}
