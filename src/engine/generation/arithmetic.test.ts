// The wider arithmetic set: two-step moves, start unknown, equal jumps, distance, two groups.
// Each generator is checked with the params the core pack ships, then for its own meaning.
import * as fc from 'fast-check';

import corePack from '../../../content/packs/core.json';
import { ContentPackSchema } from '../content/pack';
import { evaluateResponse } from '../evaluation/evaluate';
import { canonicalJson } from '../random/hash';
import { checkGeneratedItem } from '../validation/validateContent';
import { generateItem, generatorKey, type RegisteredGenerator } from './generator';
import { MISCONCEPTIONS as GROUP_TAGS, combineGroups } from './generators/combineGroups';
import { MISCONCEPTIONS as DISTANCE_TAGS, distanceBetween } from './generators/distanceBetween';
import { MISCONCEPTIONS as JUMP_TAGS, equalJumps } from './generators/equalJumps';
import { MISCONCEPTIONS as TWO_TAGS, positionAfterTwoMoves } from './generators/positionAfterTwoMoves';
import { MISCONCEPTIONS as START_TAGS, startBeforeMove } from './generators/startBeforeMove';
import { BUILT_IN_GENERATORS } from './registry';

const PACK = ContentPackSchema.parse(corePack);
const catalog = new Set(PACK.misconceptions.map((m) => m.id));
const NEW = ['quantity.positionAfterTwoMoves', 'quantity.startBeforeMove', 'quantity.equalJumps', 'quantity.distanceBetween', 'quantity.combineGroups'];
const shipped = PACK.activities
  .filter((a) => NEW.includes(a.generator.id))
  .map((a) => ({ activity: a, generator: BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version)) as RegisteredGenerator }));
const paramsOf = (generatorId: string) => shipped.find((s) => s.activity.generator.id === generatorId)!.activity.params;
const many = (g: RegisteredGenerator, params: unknown, n = 300) => Array.from({ length: n }, (_, i) => generateItem(g, params, `a${i}`));
const value = (item: { prompt: Record<string, unknown> }, k: string) => item.prompt[k] as number;

describe('the core pack ships every new generator', () => {
  it('one activity per new generator, all registered', () => {
    expect(shipped.map((s) => s.activity.generator.id).sort()).toEqual([...NEW].sort());
    for (const s of shipped) expect(s.generator).toBeDefined();
  });

  it('property: same params + seed => identical item, with a valid intended-answer structure', () => {
    fc.assert(
      fc.property(fc.constantFrom(...shipped), fc.string(), ({ activity, generator }, seed) => {
        const item = generateItem(generator, activity.params, seed);
        expect(canonicalJson(item)).toBe(canonicalJson(generateItem(generator, activity.params, seed)));
        expect(checkGeneratedItem(item, generator, catalog)).toEqual([]);
        expect(item.response.options).toHaveLength((activity.params as { optionCount: number }).optionCount);
      }),
      { numRuns: 400 },
    );
  });

  it('declared variant counts are exact and reachable', () => {
    for (const { activity, generator } of shipped) {
      const seen = new Set<string>();
      for (let i = 0; i < 4000; i++) seen.add(generateItem(generator, activity.params, `v${i}`).signature);
      const declared = generator.countVariants(activity.params)!;
      expect(seen.size).toBeLessThanOrEqual(declared);
      expect(seen.size).toBeGreaterThanOrEqual(Math.floor(declared * 0.9));
    }
  });

  it('every answer the shipped activities produce fits their declared value range', () => {
    for (const { activity, generator } of shipped) {
      if (activity.answer.mode !== 'value') throw new Error(`${activity.id} must take a value`);
      for (const item of many(generator, activity.params)) {
        const correct = item.response.options.find((o) => o.correct)!.value as number;
        expect(correct).toBeGreaterThanOrEqual(activity.answer.min);
        expect(correct).toBeLessThanOrEqual(activity.answer.max);
      }
    }
  });

  it('never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    for (const { activity, generator } of shipped) many(generator, activity.params, 50);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('two moves', () => {
  const params = paramsOf('quantity.positionAfterTwoMoves');

  it('the second move goes back the other way, is a different size, and every stop is in the building', () => {
    for (const item of many(positionAfterTwoMoves, params)) {
      const [start, change, change2] = [value(item, 'start'), value(item, 'change'), value(item, 'change2')];
      const sign = item.prompt.direction === 'up' ? 1 : -1;
      expect(item.prompt.direction2).toBe(sign === 1 ? 'down' : 'up');
      expect(change2).not.toBe(change);
      const middle = start + sign * change;
      const end = middle - sign * change2;
      for (const f of [start, middle, end]) expect(f >= 1 && f <= 20).toBe(true);
      expect(item.response.options.find((o) => o.correct)!.value).toBe(end);
    }
  });

  it('diagnoses stopping after the first move, going the same way twice, and skipping the first move', () => {
    for (const item of many(positionAfterTwoMoves, params, 100)) {
      const [start, change, change2] = [value(item, 'start'), value(item, 'change'), value(item, 'change2')];
      const sign = item.prompt.direction === 'up' ? 1 : -1;
      const middle = start + sign * change;
      const end = middle - sign * change2;
      const tagOf = (v: number) => {
        const r = evaluateResponse(item, { mode: 'value', value: v });
        return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
      };
      expect(tagOf(middle)).toBe(TWO_TAGS.ignoredSecondMove);
      const both = middle + sign * change2;
      if (both >= 1 && both <= 20) expect(tagOf(both)).toBe(TWO_TAGS.sameDirectionTwice);
      const second = start - sign * change2;
      if (second >= 1 && second <= 20 && second !== middle && second !== both) expect(tagOf(second)).toBe(TWO_TAGS.ignoredFirstMove);
      expect(tagOf(end)).toBe('correct');
    }
  });
});

describe('start unknown', () => {
  const params = paramsOf('quantity.startBeforeMove');

  it('the answer undoes the move, and the start is in the building', () => {
    for (const item of many(startBeforeMove, params)) {
      const [end, change] = [value(item, 'end'), value(item, 'change')];
      const start = item.prompt.direction === 'up' ? end - change : end + change;
      expect(start >= 1 && start <= 20).toBe(true);
      expect(item.response.options.find((o) => o.correct)!.value).toBe(start);
    }
  });

  it('repeating the move is diagnosed, and the off-by-one causes are counted from the end', () => {
    for (const item of many(startBeforeMove, params, 100)) {
      const [end, change] = [value(item, 'end'), value(item, 'change')];
      const sign = item.prompt.direction === 'up' ? 1 : -1;
      const start = end - sign * change;
      const again = end + sign * change;
      const tag = (v: number) => {
        const r = evaluateResponse(item, { mode: 'value', value: v });
        return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
      };
      if (again >= 1 && again <= 20) expect(tag(again)).toBe(START_TAGS.repeatedTheMove);
      // Counting back from the end and counting the end itself as 1 lands one short of the start.
      if (start + sign !== again) expect(tag(start + sign)).toBe(START_TAGS.countedStartingPosition);
      if (start - sign >= 1 && start - sign <= 20) expect(tag(start - sign)).toBe(START_TAGS.countedOneExtra);
    }
  });
});

describe('equal jumps', () => {
  const params = paramsOf('quantity.equalJumps');

  it('jumps of 2, 3 or 5, the third jump or later, never past the top', () => {
    const steps = new Set<number>();
    for (const item of many(equalJumps, params)) {
      const [step, count] = [value(item, 'step'), value(item, 'count')];
      steps.add(step);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(step * count).toBeLessThanOrEqual(20);
      expect(item.response.options.find((o) => o.correct)!.value).toBe(step * count);
    }
    expect(steps).toEqual(new Set([2, 3, 5]));
  });

  it('diagnoses one jump short, one too far, adding instead, and the jump count', () => {
    const item = generateItem(equalJumps, { steps: [3], count: [4, 4], max: 20, optionCount: 4 }, 'x');
    const tag = (v: number) => {
      const r = evaluateResponse(item, { mode: 'value', value: v });
      return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
    };
    expect(tag(12)).toBe('correct');
    expect(tag(9)).toBe(JUMP_TAGS.oneJumpShort);
    expect(tag(15)).toBe(JUMP_TAGS.oneJumpExtra);
    expect(tag(7)).toBe(JUMP_TAGS.addedInsteadOfMultiplied);
    expect(tag(4)).toBe(JUMP_TAGS.answeredWithJumpCount);
  });

  it('rejects a count below 3 (the first two landings are part of the question)', () => {
    expect(equalJumps.checkParams({ steps: [2], count: [2, 4], max: 20, optionCount: 4 }).map((i) => i.path.join('.'))).toContain('count.0');
  });
});

describe('distance', () => {
  const params = paramsOf('quantity.distanceBetween');

  it('the answer is a count between two positions in the building, either way', () => {
    const ways = new Set<string>();
    for (const item of many(distanceBetween, params)) {
      const [from, to] = [value(item, 'from'), value(item, 'to')];
      ways.add(to > from ? 'up' : 'down');
      expect(from >= 1 && from <= 20 && to >= 1 && to <= 20).toBe(true);
      expect(item.response.options.find((o) => o.correct)!.value).toBe(Math.abs(to - from));
    }
    expect(ways).toEqual(new Set(['up', 'down']));
  });

  it('diagnoses counting both ends and answering with a position', () => {
    const item = generateItem(distanceBetween, { bounds: [1, 20], from: [6, 6], distance: [7, 7], direction: 'up', optionCount: 4 }, 'x');
    const tag = (v: number) => {
      const r = evaluateResponse(item, { mode: 'value', value: v });
      return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
    };
    expect(tag(7)).toBe('correct');
    expect(tag(8)).toBe(DISTANCE_TAGS.countedBothEnds);
    expect(tag(13)).toBe(DISTANCE_TAGS.answeredWithTarget);
    expect(tag(6)).toBe(DISTANCE_TAGS.answeredWithStart);
  });
});

describe('two groups', () => {
  const params = paramsOf('quantity.combineGroups');

  it('more is waiting than the two orders, so taking everything is never right', () => {
    for (const item of many(combineGroups, params)) {
      const [first, second, waiting] = [value(item, 'first'), value(item, 'second'), value(item, 'waiting')];
      expect(waiting).toBeGreaterThan(first + second);
      expect(first + second).toBeLessThanOrEqual(11);
      expect(item.response.options.find((o) => o.correct)!.value).toBe(first + second);
    }
  });

  it('diagnoses one order only and everything waiting', () => {
    const item = generateItem(combineGroups, { first: [3, 3], second: [4, 4], extraWaiting: [2, 2], maxTotal: 11, optionCount: 4 }, 'x');
    const tag = (v: number) => {
      const r = evaluateResponse(item, { mode: 'value', value: v });
      return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
    };
    expect(tag(7)).toBe('correct');
    expect(tag(3)).toBe(GROUP_TAGS.countedOneGroupOnly);
    expect(tag(4)).toBe(GROUP_TAGS.countedOneGroupOnly);
    expect(tag(9)).toBe(GROUP_TAGS.tookEverythingWaiting);
    expect(tag(8)).toBe(GROUP_TAGS.countedOneExtra);
  });
});
