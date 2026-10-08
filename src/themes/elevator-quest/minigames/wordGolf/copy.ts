// Every word the Word Golf screen shows, in one place. Pure.
//
// Two sources, never the same line twice:
//   - EC's wordGolf.json (content/minigames.ts): the spelling's words. Lifty's lines, the labels the
//     spelling shares (CHECK, UNDO, CLEAR, HELP, BACK TO ELEVATOR), the help words by help kind, a
//     line per misspelling cause, and each word's clues.
//   - golfCourses.json (course.ts): the putting words and the screen-reader words.
import { WORD_GOLF, spellingMisconceptionLine, wordClues, wordGolfHelp, type WordGolfCopy } from '../../content/minigames';
import { fill } from '../../../content/missionCopy';
import type { ClueSource } from './clues';
import { GOLF_COPY, type GolfCopy } from './course';

export interface WgCopy extends GolfCopy {
  title: string;
  /** "HOLE {hole}". */
  hole: string;
  check: string;
  clear: string;
  undo: string;
  hearIt: string;
  help: string;
  nextHole: string;
  back: string;
  intro: string;
  spellPrompt: string;
  notYet: string;
  earned: string;
  earnedShown: string;
  sunk: string;
  /** "Hole {hole} is done." */
  holeDone: string;
  courseDone: string;
  resume: string;
  freshWord: string;
  /** The help control's label for a help kind (the policy's), else HELP. */
  helpLabel(kind: string): string;
  /** Lifty's line for a help kind, or null. */
  helpLine(kind: string): string | null;
  /** Lifty's line for a misspelling cause (a spelling.* tag), or null. */
  causeLine(tag: string | null): string | null;
}

export function wgCopy(ec: WordGolfCopy = WORD_GOLF, golf: GolfCopy = GOLF_COPY): WgCopy {
  return {
    ...golf,
    title: ec.labels.title,
    hole: ec.labels.hole,
    check: ec.labels.check,
    clear: ec.labels.clear,
    undo: ec.labels.undo,
    hearIt: ec.labels.hearAgain,
    help: ec.labels.help,
    nextHole: ec.labels.nextHole,
    back: ec.labels.back,
    intro: ec.lines.intro,
    spellPrompt: ec.lines.spell,
    notYet: ec.lines.tryAgain,
    earned: ec.lines.spelled,
    earnedShown: ec.lines.spelledHelped,
    sunk: ec.lines.inCup,
    holeDone: ec.lines.holeDone,
    courseDone: ec.lines.courseDone,
    resume: ec.lines.resume,
    freshWord: ec.lines.fresh,
    helpLabel: (kind) => wordGolfHelp(kind, ec)?.label ?? ec.labels.help,
    helpLine: (kind) => wordGolfHelp(kind, ec)?.line ?? null,
    causeLine: (tag) => spellingMisconceptionLine(tag, ec),
  };
}

export const WG_COPY: WgCopy = wgCopy();

/** Fill a line's placeholders ({hole}, {n}, ...). */
export const line = (template: string, vars: Record<string, string | number> = {}) => fill(template, vars);

/** The theme's clues for a word id (EC). */
export const WORD_CLUES: ClueSource = (wordId) => {
  const c = wordClues(wordId);
  return c ? { blank: c.blank, meaning: c.meaning, phonics: c.phonics } : null;
};
