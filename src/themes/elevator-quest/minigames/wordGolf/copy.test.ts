// Every word the Word Golf screen can show or say (copy.ts: EC's game words plus golfCourses.json,
// the hole names and intros, filled with sample values) never names a word the spelling pack can ask
// for: a label that said "lift" or "check" would show an answer while it is being spelled.
import { SHIPPED_PACK } from '../../../../engine/testing/support';
import { WORD_GOLF, spellingWords, wordLeaks } from '../../content/minigames';
import { WG_COPY, line } from './copy';
import { GOLF_COPY, HOLES, validateCourses } from './course';
import coursesJson from '../../../../../content/themes/elevator-quest/minigames/golfCourses.json';

const WORDS = [...new Set(spellingWords(SHIPPED_PACK).map((r) => r.word))];
const SAMPLE = { hole: 2, n: 2, count: 3, done: 1, letter: 'x', name: 'Straight Shot', pattern: 'x', syllables: 2, hint: 'x' };

/** Every string the screen can show: plain lines, labels per help kind, cause lines, hole words. */
function screenWords(): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(WG_COPY)) if (typeof v === 'string') out.push([`copy.${k}`, line(v, SAMPLE)]);
  for (const kind of [...Object.keys(WORD_GOLF.help), 'unknownKind']) {
    out.push([`help.${kind}.label`, WG_COPY.helpLabel(kind)]);
    const l = WG_COPY.helpLine(kind);
    if (l) out.push([`help.${kind}.line`, l]);
  }
  for (const tag of Object.keys(WORD_GOLF.misconceptions)) out.push([`cause.${tag}`, WG_COPY.causeLine(tag) ?? '']);
  for (const h of HOLES) out.push([`hole.${h.id}.name`, h.name], [`hole.${h.id}.intro`, h.intro]);
  return out;
}

describe('Word Golf screen words', () => {
  it('the spelling pack has words to check against', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(30);
  });

  it('no line, label, hole name or screen-reader word names a spelling word (or its stem)', () => {
    const leaks = screenWords().flatMap(([path, text]) => WORDS.flatMap((w) => wordLeaks(text, w).map((found) => `${path}: "${found}" gives away "${w}"`)));
    expect(leaks).toEqual([]);
  });

  it('catches a leak if one is added', () => {
    const bad = JSON.parse(JSON.stringify(coursesJson)) as { copy: Record<string, string> };
    bad.copy.backHint = 'Goes back to the lift.';
    const words = Object.values(validateCourses(bad).courses?.copy ?? bad.copy);
    expect(words.some((t) => wordLeaks(t, 'lift').length > 0)).toBe(true);
    expect(GOLF_COPY.backHint).not.toMatch(/\blift\b/i);
  });

  it('takes the shared labels and Lifty lines from the game words (one source, never two)', () => {
    expect(WG_COPY.check).toBe(WORD_GOLF.labels.check);
    expect(WG_COPY.back).toBe(WORD_GOLF.labels.back);
    expect(WG_COPY.spellPrompt).toBe(WORD_GOLF.lines.spell);
    expect(WG_COPY.helpLabel('showAnswer')).toBe(WORD_GOLF.help.showAnswer!.label);
    expect(WG_COPY.helpLabel('noSuchKind')).toBe(WORD_GOLF.labels.help);
    expect(Object.keys(GOLF_COPY)).not.toEqual(expect.arrayContaining(['check', 'back', 'help', 'undo', 'clear']));
  });
});
