// The words that frame a spelling item, by word id: a sentence with a gap, a meaning clue and a sound
// hint. They are theme content (EC: content/themes/elevator-quest/minigames/wordGolf.json), never the
// word itself, and never shown with it. Pure.
//
// The game reads them through a ClueSource, so the screen works (with the generic prompt, the sound
// pattern and the beats from the item) before or without the theme's words, and tests can pass their own.

export interface WordClue {
  /** A short sentence with "___" where the word goes. Never contains the word. */
  blank: string | null;
  /** What the word means, in other words. Never contains the word or its stem. */
  meaning: string | null;
  /** A sound or syllable hint (the phonics help step). */
  phonics: string | null;
}

export type ClueSource = (wordId: string) => WordClue | null;

export const NO_CLUES: ClueSource = () => null;

/** The gap in a blank sentence, split so the screen can draw it as a box. */
export function splitBlank(sentence: string): { before: string; after: string } | null {
  const at = sentence.indexOf('___');
  if (at < 0) return null;
  return { before: sentence.slice(0, at), after: sentence.slice(at).replace(/^_+/, '') };
}
