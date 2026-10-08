// Authored items: the generator picks one listed item; the words live with the theme.
import { evaluateResponse } from '../../evaluation/evaluate';
import { canonicalJson } from '../../random/hash';
import { createRng } from '../../random/rng';
import { checkGeneratedItem } from '../../validation/validateContent';
import { generateItem } from '../generator';
import { BUILT_IN_GENERATORS } from '../registry';
import { MISCONCEPTIONS, authoredItem } from './authoredItem';

const TAGS = new Set<string>(Object.values(MISCONCEPTIONS));

const choiceParams = {
  items: [
    { id: 'first-note', correct: 'bolt', distractors: [{ value: 'nut', misconception: MISCONCEPTIONS.choseFirstNamed }, { value: 'pin' }] },
    { id: 'second-note', correct: 'left-door', distractors: [{ value: 'right-door', misconception: MISCONCEPTIONS.mixedUpSides }] },
    { id: 'third-note', correct: 'cup', distractors: [{ value: 'jug', misconception: MISCONCEPTIONS.ignoredNegation }, { value: 'pan', misconception: MISCONCEPTIONS.choseLastNamed }, { value: 'pot' }] },
  ],
};

const valueParams = {
  items: [
    { id: 'two-above', correct: 19, distractors: [{ value: 15, misconception: MISCONCEPTIONS.wrongDirection }, { value: 17, misconception: MISCONCEPTIONS.wentToOtherPlace }, { value: 2, misconception: MISCONCEPTIONS.usedNumberAsAnswer }] },
    { id: 'not-there', correct: 2, distractors: [{ value: 4, misconception: MISCONCEPTIONS.ignoredNegation }] },
  ],
};

const many = (params: unknown, n = 400) => Array.from({ length: n }, (_, i) => generateItem(authoredItem, params, `s${i}`));
const answerOf = (item: ReturnType<typeof generateItem>) => item.response.options.find((o) => o.correct)!.value;

describe('literacy.authoredItem@1', () => {
  it('is registered with the built-in generators', () => {
    expect(BUILT_IN_GENERATORS.get('literacy.authoredItem@1')).toBe(authoredItem);
  });

  it('reaches every item, and one item always gives the same signature', () => {
    for (const params of [choiceParams, valueParams]) {
      const byId = new Map<string, Set<string>>();
      for (const item of many(params)) {
        const id = item.prompt.item as string;
        byId.set(id, (byId.get(id) ?? new Set()).add(item.signature));
      }
      expect([...byId.keys()].sort()).toEqual(params.items.map((i) => i.id).sort());
      for (const signatures of byId.values()) expect(signatures.size).toBe(1);
      const all = [...byId.values()].map((s) => [...s][0]);
      expect(new Set(all).size).toBe(params.items.length);
      expect(authoredItem.countVariants(params)).toBe(params.items.length);
    }
  });

  it('is deterministic and structurally valid: unique option values, one answer, the authored answer', () => {
    for (const params of [choiceParams, valueParams]) {
      for (const item of many(params, 200)) {
        expect(canonicalJson(generateItem(authoredItem, params, item.seed))).toBe(canonicalJson(item));
        expect(checkGeneratedItem(item, authoredItem, TAGS)).toEqual([]);
        const authored = params.items.find((i) => i.id === item.prompt.item)!;
        expect(answerOf(item)).toBe(authored.correct);
        expect(authoredItem.solve(item.prompt)).toBe(authored.correct);
        // Every distractor is listed: options are the answer plus all of them, no repeats.
        const values = item.response.options.map((o) => String(o.value));
        expect(new Set(values).size).toBe(values.length);
        expect(values.sort()).toEqual([authored.correct, ...authored.distractors.map((d) => d.value)].map(String).sort());
      }
    }
  });

  it('keeps every misconception tag on its option and in the diagnostics', () => {
    for (const params of [choiceParams, valueParams]) {
      for (const item of many(params, 100)) {
        const authored = params.items.find((i) => i.id === item.prompt.item)!;
        for (const d of authored.distractors) {
          const option = item.response.options.find((o) => o.value === d.value)!;
          expect(option.correct).toBe(false);
          expect(option.misconception).toBe(d.misconception);
          if (d.misconception) expect(item.diagnostics).toContainEqual({ value: d.value, misconception: d.misconception });
        }
        expect(item.diagnostics).toHaveLength(authored.distractors.filter((d) => d.misconception).length);
      }
    }
  });

  it('a chosen tagged option surfaces its misconception; the answer is correct', () => {
    const item = many(choiceParams).find((i) => i.prompt.item === 'second-note')!;
    const wrong = item.response.options.find((o) => o.value === 'right-door')!;
    expect(evaluateResponse(item, { mode: 'choice', optionId: wrong.id })).toMatchObject({ valid: true, correct: false, misconception: MISCONCEPTIONS.mixedUpSides });
    expect(evaluateResponse(item, { mode: 'choice', optionId: item.correctOptionId })).toMatchObject({ valid: true, correct: true });
  });

  it('lists every distractor: the option count follows the item with the most', () => {
    expect(authoredItem.draft(choiceParams, createRng('count')).optionCount).toBe(4);
    for (const item of many(choiceParams, 60)) {
      const authored = choiceParams.items.find((i) => i.id === item.prompt.item)!;
      expect(item.response.options).toHaveLength(1 + authored.distractors.length);
    }
  });

  it('refuses bad params: duplicate ids, the answer among the distractors, repeats, mixed types, unknown tags, a single item', () => {
    const issues = (params: unknown) => authoredItem.checkParams(params).map((i) => i.message);
    expect(issues(choiceParams)).toEqual([]);
    expect(issues(valueParams)).toEqual([]);

    const dupId = { items: [choiceParams.items[0]!, { ...choiceParams.items[1]!, id: 'first-note' }] };
    expect(issues(dupId)).toContain('duplicate item id "first-note"');

    const answerTwice = { items: [{ id: 'a', correct: 'bolt', distractors: [{ value: 'bolt' }] }, choiceParams.items[1]!] };
    expect(issues(answerTwice)).toContain('the answer cannot also be a distractor');

    const repeated = { items: [{ id: 'a', correct: 'bolt', distractors: [{ value: 'nut' }, { value: 'nut' }] }, choiceParams.items[1]!] };
    expect(issues(repeated)).toContain('distractor values must be unique');

    const mixed = { items: [{ id: 'a', correct: 3, distractors: [{ value: 'three' }] }, valueParams.items[1]!] };
    expect(issues(mixed).join()).toMatch(/type of its answer/);

    const unknownTag = { items: [{ id: 'a', correct: 'bolt', distractors: [{ value: 'nut', misconception: 'reading.madeUp' }] }, choiceParams.items[1]!] };
    expect(issues(unknownTag)).not.toEqual([]);

    expect(issues({ items: [choiceParams.items[0]!] })).not.toEqual([]);
    expect(issues({ items: [{ id: 'a', correct: 'bolt', distractors: [] }, choiceParams.items[1]!] })).not.toEqual([]);
    expect(issues({ items: [{ id: 'Bad Id', correct: 'bolt', distractors: [{ value: 'nut' }] }, choiceParams.items[1]!] })).not.toEqual([]);
    expect(() => generateItem(authoredItem, dupId, 's')).toThrow(/Invalid params/);
  });

  it('solve reads the authored answer and refuses a prompt without one', () => {
    expect(authoredItem.solve({ item: 'x', answer: 7 })).toBe(7);
    expect(authoredItem.solve({ item: 'x', answer: 'bolt' })).toBe('bolt');
    expect(() => authoredItem.solve({ item: 'x' })).toThrow(/no authored answer/);
    expect(() => authoredItem.solve({ answer: 7 })).toThrow(/no item id/);
  });

  it('declares only reading tags', () => {
    for (const tag of authoredItem.misconceptions) expect(tag).toMatch(/^reading\.[a-zA-Z]+$/);
    expect(new Set(authoredItem.misconceptions).size).toBe(authoredItem.misconceptions.length);
  });
});
