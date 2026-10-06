import * as fc from 'fast-check';

import { evaluateResponse } from '../evaluation/evaluate';
import { canonicalJson } from '../random/hash';
import { PACK } from '../testing/support';
import { checkGeneratedItem } from '../validation/validateContent';
import { createRegistry, generateItem, generatorKey, itemSignature, type RegisteredGenerator } from './generator';
import { MISCONCEPTIONS as MOVE_TAGS, positionAfterMove } from './generators/positionAfterMove';
import { BUILT_IN_GENERATORS } from './registry';

const catalog = new Set(PACK.misconceptions.map((m) => m.id));
const activities = PACK.activities.map((a) => ({
  activity: a,
  generator: BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version)) as RegisteredGenerator,
}));

describe('deterministic generation', () => {
  it('property: same template version + params + seed => identical item', () => {
    fc.assert(
      fc.property(fc.constantFrom(...activities), fc.string(), ({ activity, generator }, seed) => {
        expect(canonicalJson(generateItem(generator, activity.params, seed))).toBe(canonicalJson(generateItem(generator, activity.params, seed)));
      }),
    );
  });

  it('property: every generated item has a valid intended-answer structure', () => {
    fc.assert(
      fc.property(fc.constantFrom(...activities), fc.string(), ({ activity, generator }, seed) => {
        const item = generateItem(generator, activity.params, seed);
        expect(checkGeneratedItem(item, generator, catalog)).toEqual([]);
        expect(item.response.options).toHaveLength((activity.params as { optionCount: number }).optionCount);
      }),
      { numRuns: 300 },
    );
  });

  it('never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    for (const { activity, generator } of activities) for (let i = 0; i < 50; i++) generateItem(generator, activity.params, `s${i}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('signature depends on meaning, not seed or option order', () => {
    const params = { bounds: [1, 5], start: [2, 2], change: [1, 1], direction: 'up', optionCount: 3 };
    // Only one possible question (2 + 1), so every seed asks the same thing.
    const items = Array.from({ length: 20 }, (_, i) => generateItem(positionAfterMove, params, `seed-${i}`));
    expect(new Set(items.map((i) => i.signature)).size).toBe(1);
    expect(new Set(items.map((i) => i.response.options.map((o) => o.value).join(','))).size).toBeGreaterThan(1);
  });

  it('a new template version yields a different signature for the same prompt', () => {
    const prompt = { start: 2, change: 1, direction: 'up', low: 1, high: 5 };
    expect(itemSignature('quantity.positionAfterMove', 1, 'positionAfterMove', prompt)).not.toBe(
      itemSignature('quantity.positionAfterMove', 2, 'positionAfterMove', prompt),
    );
  });

  it('declared variant counts are exact upper bounds on what generation produces', () => {
    for (const { activity, generator } of activities) {
      const seen = new Set<string>();
      for (let i = 0; i < 4000; i++) seen.add(generateItem(generator, activity.params, `v${i}`).signature);
      const declared = generator.countVariants(activity.params);
      expect(declared).toBeDefined();
      expect(seen.size).toBeLessThanOrEqual(declared!);
      expect(seen.size).toBeGreaterThanOrEqual(Math.floor(declared! * 0.9)); // sampling reaches nearly all of them
    }
  });

  it('rejects invalid params with a located error', () => {
    const issues = positionAfterMove.checkParams({ bounds: [1, 20], start: [5, 1], change: [0, 3], direction: 'sideways', optionCount: 4 });
    expect(issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['start', 'direction']));
  });

  it('rejects a duplicate generator registration', () => {
    expect(() => createRegistry([positionAfterMove, positionAfterMove])).toThrow(/Duplicate generator quantity.positionAfterMove@1/);
  });
});

describe('misconception-aware evaluation', () => {
  const params = { bounds: [1, 20], start: [5, 10], change: [3, 6], direction: 'up', optionCount: 4 };

  it('surfaces the misconception tag of the chosen distractor', () => {
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const item = generateItem(positionAfterMove, params, `m${i}`);
      const reversed = item.response.options.find((o) => o.misconception === MOVE_TAGS.reversedDirection);
      if (!reversed) continue;
      found = true;
      const result = evaluateResponse(item, { mode: 'choice', optionId: reversed.id });
      expect(result).toEqual({ valid: true, correct: false, optionId: reversed.id, misconception: MOVE_TAGS.reversedDirection });
      // The reversed answer really is start - change.
      expect(reversed.value).toBe((item.prompt.start as number) - (item.prompt.change as number));
    }
    expect(found).toBe(true);
  });

  it('marks the correct option correct and untagged distractors without a tag', () => {
    const item = generateItem(positionAfterMove, { ...params, optionCount: 6 }, 'fill');
    const correct = item.response.options.find((o) => o.correct)!;
    expect(evaluateResponse(item, { mode: 'choice', optionId: correct.id })).toEqual({ valid: true, correct: true, optionId: correct.id });
    const untagged = item.response.options.find((o) => !o.correct && !o.misconception);
    if (untagged) expect(evaluateResponse(item, { mode: 'choice', optionId: untagged.id })).toEqual({ valid: true, correct: false, optionId: untagged.id });
  });

  it('rejects an unknown option instead of guessing', () => {
    const item = generateItem(positionAfterMove, params, 'x');
    expect(evaluateResponse(item, { mode: 'choice', optionId: 'zz' })).toEqual({ valid: false, reason: 'unknownOption', optionId: 'zz' });
  });

  it('works for the literacy generator too', () => {
    const literacy = activities.find((a) => a.activity.id === 'beginning-sound.practice')!;
    const tags = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const item = generateItem(literacy.generator, literacy.activity.params, `l${i}`);
      const word = item.prompt.word as string;
      expect(item.response.options.find((o) => o.correct)?.value).toBe(word[0]);
      item.response.options.forEach((o) => o.misconception && tags.add(o.misconception));
    }
    expect(tags).toEqual(new Set(['literacy.choseFinalSound', 'literacy.mirroredLetter']));
  });
});
