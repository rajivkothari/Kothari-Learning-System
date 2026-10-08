// Spelling (M9): spell one authored word from letter tiles. The words are written by a person and
// listed in the activity's params; the generator picks one and lays out its tiles. The words that
// frame the job (a sentence with a blank, a meaning clue, a sound hint, the spoken word) live with
// the theme, keyed by the word's id.
//
// The prompt NEVER carries the word: { wordId, length, tiles, pattern, patternAt, syllables }.
// - tiles: the word's letters plus 2 to 4 extra letters, shuffled, as one string of letters (one tile
//   per character). The extra letters are plausible confusions of the word's own letters (another
//   vowel, b for d, m for n) topped up with common consonants, never a letter of the word, and never
//   letters that would let another word of the activity be spelled. The tiles never show the word
//   in order.
// - The tiles depend on the word (and the activity's params), not on the seed, so one word is one
//   item: the same signature every time it comes up, and a solved word coming back is an exact
//   replay. A changed word changes its tiles, so a saved item whose word was edited is detected as
//   changed content.
// - pattern: the spelling pattern the word practises ("sh", "a_e": "_" stands for one letter) and
//   patternAt: where it starts in the word, so a theme can place the pattern's letters as help.
// - The solver looks the word up in the params by id (the prompt does not have it).
//
// The answer is the word (lower case). The wrong values are the authored misspellings, each with
// its likely cause; a text answer that matches one surfaces that cause.
import { z } from 'zod';

import { createRng } from '../../random/rng';
import { ContentGenerationError, defineGenerator, generatorKey } from '../generator';

export const SPELLING_MISCONCEPTIONS = {
  shortVowel: 'spelling.shortVowel',
  silentE: 'spelling.silentE',
  vowelTeam: 'spelling.vowelTeam',
  blend: 'spelling.blend',
  digraph: 'spelling.digraph',
  doubleLetter: 'spelling.doubleLetter',
  silentLetter: 'spelling.silentLetter',
  letterOrder: 'spelling.letterOrder',
  ending: 'spelling.ending',
} as const;

const TAGS = Object.values(SPELLING_MISCONCEPTIONS) as [string, ...string[]];

const ID = 'literacy.spelling';
const VERSION = 1;

/** Where `pattern` ("_" = any one letter) first matches `word`, or -1. */
export function patternIndex(word: string, pattern: string): number {
  for (let i = 0; i + pattern.length <= word.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length && ok; j++) ok = pattern[j] === '_' || word[i + j] === pattern[j];
    if (ok) return i;
  }
  return -1;
}

const WordSchema = z
  .object({
    /** Never contains the word: ids reach places (logs, narration keys) where the word must not show. */
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'word ids are lowercase letters, digits and "-"'),
    word: z.string().regex(/^[a-z]{3,12}$/, 'a word is 3 to 12 lower-case letters'),
    pattern: z.string().regex(/^[a-z][a-z_]{0,3}[a-z]$|^[a-z]$/, 'a pattern is 1 to 5 letters; "_" (one letter) only inside it'),
    syllables: z.number().int().min(1).max(5),
    /** Likely misspellings in priority order, each with its one likely cause when there is one. */
    misspellings: z
      .array(z.object({ value: z.string().regex(/^[a-z]{2,14}$/), misconception: z.enum(TAGS).optional() }).strict())
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((w, ctx) => {
    if (w.id.includes(w.word)) ctx.addIssue({ code: 'custom', path: ['id'], message: `the id "${w.id}" contains the word` });
    if (w.pattern.length >= w.word.length) ctx.addIssue({ code: 'custom', path: ['pattern'], message: 'the pattern must be shorter than the word' });
    else if (patternIndex(w.word, w.pattern) < 0) ctx.addIssue({ code: 'custom', path: ['pattern'], message: `"${w.pattern}" is not in "${w.word}"` });
    const values = w.misspellings.map((m) => m.value);
    values.forEach((v, i) => {
      if (v === w.word) ctx.addIssue({ code: 'custom', path: ['misspellings', i, 'value'], message: 'a misspelling cannot be the word' });
      if (values.indexOf(v) !== i) ctx.addIssue({ code: 'custom', path: ['misspellings', i, 'value'], message: 'misspellings must be unique' });
    });
  });

const ParamsSchema = z
  .object({
    /** At least two, so a fresh word can replace one that was missed. */
    words: z.array(WordSchema).min(2),
    /** How many extra letters join the word's tiles (each word draws its count from this range). */
    extraTiles: z
      .object({ min: z.number().int().min(2).max(4), max: z.number().int().min(2).max(4) })
      .strict()
      .refine((r) => r.min <= r.max, { message: 'extraTiles.min must be <= extraTiles.max', path: ['max'] }),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = p.words.map((w) => w.id);
    const words = p.words.map((w) => w.word);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: 'custom', path: ['words', i, 'id'], message: `duplicate word id "${id}"` });
    });
    words.forEach((w, i) => {
      if (words.indexOf(w) !== i) ctx.addIssue({ code: 'custom', path: ['words', i, 'word'], message: `"${w}" is listed twice` });
    });
  });
type Params = z.infer<typeof ParamsSchema>;
type Word = Params['words'][number];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
/** Letters a beginning speller is likely to mix up with each letter. */
const CONFUSABLE: Readonly<Record<string, string>> = {
  a: 'eo',
  e: 'ia',
  i: 'ea',
  o: 'ua',
  u: 'oa',
  b: 'dp',
  d: 'bt',
  p: 'b',
  c: 'k',
  k: 'c',
  s: 'z',
  m: 'n',
  n: 'm',
  f: 'v',
  v: 'f',
  t: 'd',
  g: 'j',
  r: 'w',
  w: 'r',
  l: 'r',
  h: 'n',
  y: 'i',
};
/** Common letters to top up the extra tiles. */
const FILLER = ['t', 's', 'n', 'r', 'd', 'l', 'm', 'p', 'g', 'c', 'b', 'f', 'h'];
const MAX_TRIES = 48;

const letterCounts = (s: string) => {
  const m = new Map<string, number>();
  for (const ch of s) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
};

/** Whether every letter of `word` (with repeats) is among `tiles`. */
export function canSpell(word: string, tiles: string): boolean {
  const have = letterCounts(tiles);
  for (const [ch, n] of letterCounts(word)) if ((have.get(ch) ?? 0) < n) return false;
  return true;
}

/**
 * The tiles of `word`: its letters and the extra letters, shuffled. Deterministic from the word and the
 * activity's params (never the item seed). Throws when no layout keeps every other listed word out.
 */
export function spellingTiles(target: Word, params: Params): string {
  const rng = createRng(`${generatorKey(ID, VERSION)}:tiles:${target.id}:${target.word}`);
  const own = new Set(target.word);
  const others = params.words.filter((w) => w.word !== target.word).map((w) => w.word);
  const confusions = [...new Set([...target.word].flatMap((ch) => [...(CONFUSABLE[ch] ?? '')]))].filter((ch) => !own.has(ch));
  const fillers = FILLER.filter((ch) => !own.has(ch));
  const count = rng.int(params.extraTiles.min, params.extraTiles.max);
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // At most two plausible confusions (and one vowel among them), then common consonants.
    const extra: string[] = [];
    let vowels = 0;
    for (const ch of rng.shuffle(confusions)) {
      if (extra.length >= Math.min(2, count)) break;
      if (VOWELS.has(ch) && vowels >= 1) continue;
      if (VOWELS.has(ch)) vowels++;
      extra.push(ch);
    }
    for (const ch of rng.shuffle(fillers)) {
      if (extra.length >= count) break;
      if (!extra.includes(ch)) extra.push(ch);
    }
    const pool = [...target.word, ...extra];
    if (others.some((w) => canSpell(w, pool.join('')))) continue;
    for (let s = 0; s < 8; s++) {
      const tiles = rng.shuffle(pool).join('');
      if (!tiles.includes(target.word)) return tiles;
    }
  }
  throw new ContentGenerationError(`${generatorKey(ID, VERSION)}: no tile layout for word "${target.id}" keeps the other words out`);
}

export const spelling = defineGenerator<Params>({
  id: ID,
  version: VERSION,
  concept: 'spelling',
  misconceptions: TAGS,
  paramsSchema: ParamsSchema,
  /** The word and every misspelling of the word that has the most (never shown in a text answer). */
  optionCount: (p) => 1 + Math.max(...p.words.map((w) => w.misspellings.length)),

  generate(p, rng) {
    const word = rng.pick(p.words);
    return {
      prompt: {
        wordId: word.id,
        length: word.word.length,
        tiles: spellingTiles(word, p),
        pattern: word.pattern,
        patternAt: patternIndex(word.word, word.pattern),
        syllables: word.syllables,
      },
      correct: word.word,
      distractors: word.misspellings.map((m) => (m.misconception ? { value: m.value, misconception: m.misconception } : { value: m.value })),
    };
  },

  solve(prompt, params) {
    if (!params) throw new ContentGenerationError('spelling: the solver needs the activity params (the prompt never has the word)');
    const word = params.words.find((w) => w.id === prompt.wordId);
    if (!word) throw new ContentGenerationError(`spelling: no word "${String(prompt.wordId)}" in the params`);
    const tiles = String(prompt.tiles);
    if (prompt.length !== word.word.length) throw new ContentGenerationError(`spelling: "${word.id}" has ${word.word.length} letters, the prompt says ${String(prompt.length)}`);
    if (!canSpell(word.word, tiles)) throw new ContentGenerationError(`spelling: the tiles "${tiles}" cannot spell word "${word.id}"`);
    if (tiles.length - word.word.length < params.extraTiles.min || tiles.length - word.word.length > params.extraTiles.max) throw new ContentGenerationError(`spelling: word "${word.id}" has the wrong number of extra tiles`);
    return word.word;
  },

  countVariants: (p) => p.words.length,
});
