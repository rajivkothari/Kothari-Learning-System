// Spelling from letter tiles (M9): one authored word per item, never in the prompt.
import { normalizeTextAnswer, evaluateResponse } from '../../evaluation/evaluate';
import type { GeneratedItem } from '../../content/item';
import { canonicalJson } from '../../random/hash';
import { SHIPPED_PACK } from '../../testing/support';
import { checkGeneratedItem } from '../../validation/validateContent';
import { generateItem } from '../generator';
import { BUILT_IN_GENERATORS } from '../registry';
import { SPELLING_MISCONCEPTIONS, canSpell, patternIndex, spelling } from './spelling';

const TAGS = new Set<string>(Object.values(SPELLING_MISCONCEPTIONS));
const TEXT = { mode: 'text', maxLength: 12 } as const;

const params = {
  words: [
    { id: 'a1', word: 'cab', pattern: 'a', syllables: 1, misspellings: [{ value: 'cob', misconception: SPELLING_MISCONCEPTIONS.shortVowel }, { value: 'kab' }] },
    { id: 'a2', word: 'box', pattern: 'o', syllables: 1, misspellings: [{ value: 'bax', misconception: SPELLING_MISCONCEPTIONS.shortVowel }] },
    { id: 'a3', word: 'gate', pattern: 'a_e', syllables: 1, misspellings: [{ value: 'gat', misconception: SPELLING_MISCONCEPTIONS.silentE }, { value: 'gaet', misconception: SPELLING_MISCONCEPTIONS.letterOrder }] },
    { id: 'a4', word: 'button', pattern: 'tt', syllables: 2, misspellings: [{ value: 'buton', misconception: SPELLING_MISCONCEPTIONS.doubleLetter }] },
  ],
  extraTiles: { min: 2, max: 4 },
};

type Words = typeof params.words;
const many = (p: unknown, n = 300) => Array.from({ length: n }, (_, i) => generateItem(spelling, p, `s${i}`));
const answerOf = (item: GeneratedItem) => item.response.options.find((o) => o.correct)!.value as string;

/** Every spelling activity the app ships, with its words. */
const SHIPPED = SHIPPED_PACK.activities.filter((a) => a.generator.id === 'literacy.spelling').map((a) => ({ activity: a, params: a.params as { words: Words; extraTiles: { min: number; max: number } } }));

describe('literacy.spelling@1', () => {
  it('excludeTiles keeps those letters out of the extras and leaves activities without it unchanged', () => {
    const words = [
      { id: 'a1', word: 'cat', pattern: 'a', syllables: 1, misspellings: [{ value: 'cta' }] },
      { id: 'a2', word: 'pig', pattern: 'i', syllables: 1, misspellings: [{ value: 'pgi' }] },
    ];
    const base = { words, extraTiles: { min: 2, max: 2 } };
    const tiles = (p: unknown) => many(p, 40).map((i) => String(i.prompt.tiles));
    expect(tiles(base).some((t) => t.includes('k'))).toBe(true);
    const without = tiles({ ...base, excludeTiles: 'k' });
    expect(without.every((t) => !t.includes('k') && t.length === 5)).toBe(true);
    // A letter of the word itself is never excluded from its own tiles.
    const cats = many({ ...base, excludeTiles: 'c' }, 40).filter((i) => i.prompt.wordId === 'a1');
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((i) => String(i.prompt.tiles).includes('c'))).toBe(true);
    expect(() => generateItem(spelling, { ...base, excludeTiles: 'K' }, 's0')).toThrow();
  });

  it('is registered with the built-in generators', () => {
    expect(BUILT_IN_GENERATORS.get('literacy.spelling@1')).toBe(spelling);
  });

  it('reaches every word, and one word is always the same item (one signature, the same tiles)', () => {
    const byId = new Map<string, Set<string>>();
    for (const item of many(params)) byId.set(item.prompt.wordId as string, (byId.get(item.prompt.wordId as string) ?? new Set()).add(canonicalJson(item.prompt)));
    expect([...byId.keys()].sort()).toEqual(params.words.map((w) => w.id).sort());
    for (const prompts of byId.values()) expect(prompts.size).toBe(1);
    expect(spelling.countVariants(params)).toBe(params.words.length);
  });

  it('never puts the word in the prompt: the id, the pattern and the tiles in order never spell it', () => {
    for (const { params: p } of [{ params }, ...SHIPPED]) {
      for (const item of many(p, 200)) {
        const word = answerOf(item);
        for (const [key, value] of Object.entries(item.prompt)) if (typeof value === 'string') expect({ key, has: value.includes(word) }).toEqual({ key, has: false });
        expect(item.prompt.length).toBe(word.length);
      }
    }
  });

  it('the word can always be built from its tiles, with 2 to 4 extra letters that are not in the word', () => {
    for (const { params: p } of [{ params }, ...SHIPPED]) {
      for (const w of p.words) {
        const item = many(p, 400).find((i) => i.prompt.wordId === w.id);
        expect(item).toBeDefined();
        const tiles = item!.prompt.tiles as string;
        expect(tiles).toMatch(/^[a-z]+$/);
        expect(canSpell(w.word, tiles)).toBe(true);
        const extra = tiles.length - w.word.length;
        expect(extra).toBeGreaterThanOrEqual(p.extraTiles.min);
        expect(extra).toBeLessThanOrEqual(p.extraTiles.max);
        const left = [...tiles];
        for (const ch of w.word) left.splice(left.indexOf(ch), 1);
        for (const ch of left) expect(w.word.includes(ch)).toBe(false);
        expect(item!.prompt.patternAt).toBe(patternIndex(w.word, w.pattern));
        expect(item!.prompt.syllables).toBe(w.syllables);
      }
    }
  });

  it('a family rack (D197): the word, then onsets of the other family words; the word is never in order; activities without it are untouched', () => {
    const fam = {
      words: [
        { id: 'f1', word: 'cat', pattern: 'at', syllables: 1, misspellings: [{ value: 'kat' }] },
        { id: 'f2', word: 'hat', pattern: 'at', syllables: 1, misspellings: [{ value: 'het', misconception: SPELLING_MISCONCEPTIONS.shortVowel }] },
        { id: 'f3', word: 'mat', pattern: 'at', syllables: 1, misspellings: [{ value: 'mot', misconception: SPELLING_MISCONCEPTIONS.shortVowel }] },
        { id: 'f4', word: 'bat', pattern: 'at', syllables: 1, misspellings: [{ value: 'bet', misconception: SPELLING_MISCONCEPTIONS.shortVowel }] },
      ],
      extraTiles: { min: 2, max: 3 },
      rack: 'family' as const,
    };
    for (const item of many(fam, 80)) {
      const word = answerOf(item);
      const tiles = String(item.prompt.tiles);
      expect(canSpell(word, tiles)).toBe(true);
      expect(tiles.includes(word)).toBe(false);
      expect(tiles.length).toBe(word.length + 3);
      // Every extra letter is another family word's onset: the rack is the rime and a choice of onsets.
      const extras = [...tiles].filter((ch, i) => tiles.indexOf(ch) === i && !word.includes(ch));
      expect(extras.every((ch) => ['c', 'h', 'm', 'b'].includes(ch))).toBe(true);
      expect(fam.words.filter((w) => w.word !== word && canSpell(w.word, tiles)).length).toBeGreaterThan(0);
      // One word, one rack, whatever the seed.
      expect(generateItem(spelling, fam, `again-${word}`).prompt.tiles === tiles || generateItem(spelling, fam, `again-${word}`).prompt.wordId !== item.prompt.wordId).toBe(true);
    }
    // Too few onsets for the extras the activity asks for: refused when the item is made.
    expect(() => generateItem(spelling, { ...fam, words: fam.words.slice(0, 2), extraTiles: { min: 2, max: 2 } }, 's0')).toThrow(/fewer than 2/);
  });

  it('the extra letters never let another word of the same activity be spelled (family racks aside)', () => {
    for (const { activity, params: p } of SHIPPED.filter((s) => (s.params as { rack?: string }).rack !== 'family')) {
      for (const item of many(p, 300)) {
        const word = answerOf(item);
        for (const other of p.words) if (other.word !== word) expect({ activity: activity.id, word, other: other.word, spellable: canSpell(other.word, item.prompt.tiles as string) }).toMatchObject({ spellable: false });
      }
    }
  });

  it('is deterministic and structurally valid; the solver needs the params, and reads the word from them', () => {
    for (const item of many(params, 100)) {
      expect(canonicalJson(generateItem(spelling, params, item.seed))).toBe(canonicalJson(item));
      expect(checkGeneratedItem(item, spelling, TAGS, params)).toEqual([]);
      expect(spelling.solve(item.prompt, params)).toBe(answerOf(item));
    }
    const item = many(params, 1)[0]!;
    expect(() => spelling.solve(item.prompt)).toThrow(/needs the activity params/);
    expect(checkGeneratedItem(item, spelling, TAGS).map((p) => p.code)).toEqual(['item.unsolvable']);
    expect(() => spelling.solve({ ...item.prompt, tiles: 'zzzzz' }, params)).toThrow(/cannot spell/);
    expect(() => spelling.solve({ ...item.prompt, wordId: 'nope' }, params)).toThrow(/no word/);
  });

  it('a text answer is compared ignoring case and anything that is not a letter; misspellings surface their cause', () => {
    const item = many(params).find((i) => i.prompt.wordId === 'a3')!;
    for (const value of ['gate', 'GATE', ' Gate ', 'g-a-t-e', 'g a t e']) expect(evaluateResponse(item, { mode: 'value', value }, TEXT)).toMatchObject({ valid: true, correct: true, value: 'gate' });
    expect(evaluateResponse(item, { mode: 'value', value: 'Gat' }, TEXT)).toMatchObject({ correct: false, value: 'gat', misconception: SPELLING_MISCONCEPTIONS.silentE });
    expect(evaluateResponse(item, { mode: 'value', value: 'gaet' }, TEXT)).toMatchObject({ correct: false, misconception: SPELLING_MISCONCEPTIONS.letterOrder });
    const plain = evaluateResponse(item, { mode: 'value', value: 'gote' }, TEXT);
    expect(plain).toMatchObject({ valid: true, correct: false, value: 'gote' });
    expect('misconception' in plain && plain.misconception).toBeFalsy();
    // Without the text spec the comparison stays exact (value answers are unchanged).
    expect(evaluateResponse(item, { mode: 'value', value: 'GATE' })).toMatchObject({ correct: false });
    expect(normalizeTextAnswer(' Ca-b!7 ')).toBe('cab');
  });

  it('refuses words that would leak or not work: an id with the word, a pattern not in it, a misspelling that is the word, a repeated word', () => {
    const issues = (p: unknown) => spelling.checkParams(p).map((i) => i.message);
    const base = params.words[0]!;
    expect(issues({ ...params, words: [{ ...base, id: 'cab-1' }, params.words[1]] }).join()).toMatch(/contains the word/);
    expect(issues({ ...params, words: [{ ...base, pattern: 'sh' }, params.words[1]] }).join()).toMatch(/is not in/);
    expect(issues({ ...params, words: [{ ...base, pattern: 'cab' }, params.words[1]] }).join()).toMatch(/shorter than the word/);
    expect(issues({ ...params, words: [{ ...base, misspellings: [{ value: 'cab' }] }, params.words[1]] }).join()).toMatch(/cannot be the word/);
    expect(issues({ ...params, words: [base, { ...params.words[1]!, word: 'cab' }] }).join()).toMatch(/listed twice/);
    expect(issues({ ...params, words: [base] }).length).toBeGreaterThan(0);
    expect(issues({ ...params, extraTiles: { min: 1, max: 4 } }).length).toBeGreaterThan(0);
    expect(issues({ ...params, extraTiles: { min: 4, max: 3 } }).length).toBeGreaterThan(0);
  });

  it('declares only spelling.* tags', () => {
    for (const tag of spelling.misconceptions) expect(tag).toMatch(/^spelling\.[a-zA-Z]+$/);
  });
});
