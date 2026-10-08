// Text roles for reading in the game (M8.1). Pure: no React, so the layout tests can check them.
//
// The learner reads above grade level but is young: what to do is the biggest text on screen, the
// story and Lifty's words come next, and no word a child must read is smaller than 16 pt. Sizes are
// per window class, never shrunk to fit: a box that is too small for its words reflows, grows, or
// scrolls instead (ui/layout.ts, ui/liftyPlacement.ts, ui/readingCardLayout.ts).
//
//   question   what to do: a reading job's instruction, the question over the cards
//   dialogue   Lifty's words (fitted between min and max to the bubble; below min it scrolls)
//   passage    a note's or a card's sentences, the Archive book
//   choice     the words on a choice card
//   directory  a floor's name in the building directory (its number is a step bigger)
//   label      secondary words: titles, the mission banner, button words, notes
//
// palette.ts turns a size into a text style; components never set these sizes as literals.

export interface TextSizes {
  question: number;
  dialogue: { min: number; max: number };
  passage: number;
  choice: number;
  directory: number;
  directoryNumber: number;
  label: number;
}

/** Line height for each role, as a multiple of the size. */
export const LINE_HEIGHT = { question: 1.25, dialogue: 1.3, passage: 1.35, choice: 1.25, directory: 1.2, label: 1.25 } as const;

/** The smallest each role may ever be, at any window size (tested). */
export const TEXT_FLOOR: TextSizes = { question: 24, dialogue: { min: 20, max: 24 }, passage: 20, choice: 20, directory: 18, directoryNumber: 20, label: 16 };

const ROOMY: TextSizes = { question: 28, dialogue: { min: 20, max: 24 }, passage: 24, choice: 24, directory: 22, directoryNumber: 24, label: 18 };
const STANDARD: TextSizes = { question: 26, dialogue: { min: 20, max: 24 }, passage: 22, choice: 22, directory: 20, directoryNumber: 22, label: 16 };
const COMPACT: TextSizes = TEXT_FLOOR;

export type TextClass = 'roomy' | 'standard' | 'compact';

/**
 * The window's text class, from the cabin view the words live in: roomy on large iPads, standard on a
 * full Fire or iPad window, compact in split views and Slide Over.
 */
export function textClass(cabin: { width: number; height: number }): TextClass {
  if (cabin.width >= 680 && cabin.height >= 760) return 'roomy';
  if (cabin.width >= 440 && cabin.height >= 400) return 'standard';
  return 'compact';
}

export const textSizes = (c: TextClass): TextSizes => (c === 'roomy' ? ROOMY : c === 'standard' ? STANDARD : COMPACT);

/** Line height in pt for a size and a role. */
export const lineHeightFor = (size: number, role: keyof typeof LINE_HEIGHT) => Math.round(size * LINE_HEIGHT[role]);
