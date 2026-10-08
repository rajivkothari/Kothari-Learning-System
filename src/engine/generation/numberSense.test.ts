// The M8 math generators: skip counting from any start (missingInSequence), a ten and some ones
// (tensAndOnes), comparing and ordering (orderPositions), and version 2 of two generators (two
// moves the same way, doubles and near doubles). Each is checked with every activity the core pack
// ships for it, then for its own meaning: answers, misconception tags, bounds and variant counts.
import * as fc from 'fast-check';

import corePack from '../../../content/packs/core.json';
import { ContentPackSchema, type Activity } from '../content/pack';
import type { GeneratedItem } from '../content/item';
import { evaluateResponse } from '../evaluation/evaluate';
import { canonicalJson } from '../random/hash';
import { checkGeneratedItem } from '../validation/validateContent';
import { generateItem, generatorKey, type RegisteredGenerator } from './generator';
import { MISCONCEPTIONS_V2 as GROUP_TAGS, combineGroups, combineGroupsV2 } from './generators/combineGroups';
import { MISCONCEPTIONS as SEQ_TAGS, missingInSequence } from './generators/missingInSequence';
import { MISCONCEPTIONS as ORDER_TAGS, orderPositions } from './generators/orderPositions';
import { MISCONCEPTIONS_V2 as TWO_TAGS, positionAfterTwoMoves, positionAfterTwoMovesV2 } from './generators/positionAfterTwoMoves';
import { MISCONCEPTIONS as TEN_TAGS, tensAndOnes } from './generators/tensAndOnes';
import { BUILT_IN_GENERATORS } from './registry';

const PACK = ContentPackSchema.parse(corePack);
const catalog = new Set(PACK.misconceptions.map((m) => m.id));
const M8 = ['quantity.missingInSequence@1', 'quantity.tensAndOnes@1', 'quantity.orderPositions@1', 'quantity.positionAfterTwoMoves@2', 'quantity.combineGroups@2'];
const shipped = PACK.activities
  .filter((a) => M8.includes(generatorKey(a.generator.id, a.generator.version)))
  .map((a) => ({ activity: a, generator: BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version)) as RegisteredGenerator }));
const activity = (id: string): Activity => PACK.activities.find((a) => a.id === id)!;
const many = (g: RegisteredGenerator, params: unknown, n = 300) => Array.from({ length: n }, (_, i) => generateItem(g, params, `n${i}`));
const num = (item: GeneratedItem, k: string) => item.prompt[k] as number;
const answer = (item: GeneratedItem) => item.response.options.find((o) => o.correct)!.value as number;
/** The misconception a value would surface (value answers), 'correct', or null (untagged miss). */
const tagOf = (item: GeneratedItem, v: number) => {
  const r = evaluateResponse(item, { mode: 'value', value: v });
  return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
};

describe('the core pack ships the M8 generators', () => {
  it('every new generator (and version) is used, registered, and its tags are catalogued', () => {
    expect([...new Set(shipped.map((s) => generatorKey(s.activity.generator.id, s.activity.generator.version)))].sort()).toEqual([...M8].sort());
    for (const { generator } of shipped) {
      expect(generator).toBeDefined();
      for (const t of generator.misconceptions) expect(catalog.has(t)).toBe(true);
    }
  });

  it('property: same params + seed => identical item, with a valid intended-answer structure', () => {
    fc.assert(
      fc.property(fc.constantFrom(...shipped), fc.string(), ({ activity: a, generator }, seed) => {
        const item = generateItem(generator, a.params, seed);
        expect(canonicalJson(item)).toBe(canonicalJson(generateItem(generator, a.params, seed)));
        expect(checkGeneratedItem(item, generator, catalog)).toEqual([]);
        expect(item.response.options).toHaveLength((a.params as { optionCount: number }).optionCount);
      }),
      { numRuns: 500 },
    );
  });

  it('every answer fits the activity value range, and every tagged wrong value is in it too', () => {
    for (const { activity: a, generator } of shipped) {
      if (a.answer.mode !== 'value') throw new Error(`${a.id} must take a value`);
      for (const item of many(generator, a.params, 200)) {
        expect(answer(item)).toBeGreaterThanOrEqual(a.answer.min);
        expect(answer(item)).toBeLessThanOrEqual(a.answer.max);
        for (const d of item.diagnostics) {
          expect(d.value).not.toBe(answer(item));
          expect(typeof d.value === 'number' && d.value >= a.answer.min && d.value <= a.answer.max).toBe(true);
        }
      }
    }
  });

  it('declared variant counts are exact upper bounds, and small spaces are fully reachable', () => {
    for (const { activity: a, generator } of shipped) {
      const declared = generator.countVariants(a.params)!;
      expect(declared).toBeGreaterThan(5);
      const seen = new Set<string>();
      const samples = declared <= 400 ? 4000 : 300; // large spaces: only the upper bound is checked
      for (let i = 0; i < samples; i++) seen.add(generateItem(generator, a.params, `v${i}`).signature);
      expect(seen.size).toBeLessThanOrEqual(declared);
      if (declared <= 400) expect({ id: a.id, reached: seen.size >= Math.floor(declared * 0.9) }).toEqual({ id: a.id, reached: true });
    }
  });

  it('never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    for (const { activity: a, generator } of shipped) many(generator, a.params, 30);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('missing in a sequence (skip counting from any start)', () => {
  it('fills a gap or gives the next term, by the pattern step, up or down, every term in bounds', () => {
    for (const id of ['sequence.twos.gap', 'sequence.twos.next', 'sequence.fives']) {
      const a = activity(id);
      const ways = new Set<string>();
      for (const item of many(missingInSequence, a.params)) {
        const [first, step, length, missing] = [num(item, 'first'), num(item, 'step'), num(item, 'length'), num(item, 'missing')];
        const sign = item.prompt.direction === 'up' ? 1 : -1;
        ways.add(String(item.prompt.direction));
        expect((a.params as { steps: number[] }).steps).toContain(step);
        expect(missing).toBeGreaterThanOrEqual(1); // the first term is always shown
        expect(missing).toBeLessThan(length);
        for (let k = 0; k < length; k++) expect(first + sign * step * k).toBeGreaterThanOrEqual(1);
        for (let k = 0; k < length; k++) expect(first + sign * step * k).toBeLessThanOrEqual(20);
        expect(answer(item)).toBe(first + sign * step * missing);
        if ((a.params as { missing: string }).missing === 'middle') expect(missing).toBeLessThan(length - 1);
        if ((a.params as { missing: string }).missing === 'last') expect(missing).toBe(length - 1);
      }
      expect(ways).toEqual(new Set(['up', 'down']));
    }
  });

  it('diagnoses counting by ones beside the gap, and going a whole step past the next term', () => {
    // 4, 6, 8, ?, 12: by ones from 8 gives 9; back by one from 12 gives 11.
    const gap = generateItem(missingInSequence, { bounds: [1, 20], steps: [2], length: [5, 5], direction: 'up', missing: 'middle', optionCount: 4 }, 'x');
    const [first, missing] = [num(gap, 'first'), num(gap, 'missing')];
    const right = first + 2 * missing;
    expect(tagOf(gap, right)).toBe('correct');
    expect(tagOf(gap, right - 1)).toBe(SEQ_TAGS.countedByOnes);
    expect(tagOf(gap, right + 1)).toBe(SEQ_TAGS.countedByOnes);
    // 15, 10, 5, ? going down by 5: the next is 0 (out), so use an up pattern: 3, 8, 13, ? -> 18; 23 is out of bounds.
    const next = generateItem(missingInSequence, { bounds: [1, 20], steps: [5], length: [3, 3], direction: 'up', missing: 'last', optionCount: 4 }, 'y');
    const nRight = num(next, 'first') + 10;
    expect(tagOf(next, nRight - 4)).toBe(SEQ_TAGS.countedByOnes); // the last shown term plus one
    if (nRight + 5 <= 20) expect(tagOf(next, nRight + 5)).toBe(SEQ_TAGS.skippedATerm);
  });

  it('refuses a step of 1, a pattern of fewer than three terms, and repeated steps', () => {
    const base = { bounds: [1, 20], steps: [2], length: [4, 4], direction: 'up', missing: 'any', optionCount: 4 };
    expect(missingInSequence.checkParams({ ...base, steps: [1] })).not.toEqual([]);
    expect(missingInSequence.checkParams({ ...base, length: [2, 2] })).not.toEqual([]);
    expect(missingInSequence.checkParams({ ...base, steps: [2, 2] })).not.toEqual([]);
    expect(missingInSequence.checkParams(base)).toEqual([]);
  });
});

describe('a ten and some ones', () => {
  it('ten more or ten less: one jump of ten, either way, inside 1 to 20', () => {
    const ways = new Set<string>();
    for (const item of many(tensAndOnes, activity('tens.ten-more-less').params)) {
      const [start, tens, ones] = [num(item, 'start'), num(item, 'tens'), num(item, 'ones')];
      ways.add(String(item.prompt.direction));
      expect([tens, ones]).toEqual([1, 0]);
      expect(answer(item)).toBe(item.prompt.direction === 'up' ? start + 10 : start - 10);
    }
    expect(ways).toEqual(new Set(['up', 'down']));
  });

  it('a teen number from zero is one ten and its ones', () => {
    const answers = new Set<number>();
    for (const item of many(tensAndOnes, activity('tens.teen-from-zero').params)) {
      expect(num(item, 'start')).toBe(0);
      expect(answer(item)).toBe(10 + num(item, 'ones'));
      answers.add(answer(item));
    }
    expect([...answers].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('a ten then ones, up from below 10 or down from a teen, every landing in the building', () => {
    for (const [id, dir] of [['tens.and-ones.up', 'up'], ['tens.and-ones.down', 'down']] as const) {
      for (const item of many(tensAndOnes, activity(id).params)) {
        const [start, ones] = [num(item, 'start'), num(item, 'ones')];
        const sign = dir === 'up' ? 1 : -1;
        expect(item.prompt.direction).toBe(dir);
        expect(ones).toBeGreaterThanOrEqual(2);
        const afterTen = start + sign * 10;
        expect(afterTen >= 1 && afterTen <= 20).toBe(true);
        expect(answer(item)).toBe(afterTen + sign * ones);
      }
    }
  });

  it('diagnoses a ten taken as one, half the move, the wrong way, and the off-by-one counts', () => {
    const item = generateItem(tensAndOnes, { bounds: [1, 20], start: [3, 3], tens: [1, 1], ones: [4, 4], direction: 'up', optionCount: 4 }, 'x');
    expect(tagOf(item, 17)).toBe('correct');
    expect(tagOf(item, 8)).toBe(TEN_TAGS.countedTenAsOne); // 3 + 1 + 4
    expect(tagOf(item, 13)).toBe(TEN_TAGS.ignoredTheOnes);
    expect(tagOf(item, 7)).toBe(TEN_TAGS.ignoredTheTen);
    expect(tagOf(item, 16)).toBe(TEN_TAGS.countedStartingPosition);
    expect(tagOf(item, 18)).toBe(TEN_TAGS.countedOneExtra);
    const down = generateItem(tensAndOnes, { bounds: [1, 20], start: [6, 6], tens: [1, 1], ones: [0, 0], direction: 'up', optionCount: 4 }, 'y');
    expect(tagOf(down, 16)).toBe('correct');
    expect(tagOf(down, 7)).toBe(TEN_TAGS.countedTenAsOne);
    const from0 = generateItem(tensAndOnes, { bounds: [0, 20], start: [0, 0], tens: [1, 1], ones: [7, 7], direction: 'up', optionCount: 4 }, 'z');
    expect(tagOf(from0, 17)).toBe('correct');
    expect(tagOf(from0, 7)).toBe(TEN_TAGS.ignoredTheTen); // "17 is 7"
    expect(tagOf(from0, 8)).toBe(TEN_TAGS.countedTenAsOne); // "1 and 7 make 8"
    const back = generateItem(tensAndOnes, { bounds: [1, 20], start: [15, 15], tens: [1, 1], ones: [3, 3], direction: 'down', optionCount: 4 }, 'w');
    expect(tagOf(back, 2)).toBe('correct');
    expect(tagOf(back, 11)).toBe(TEN_TAGS.countedTenAsOne);
    expect(tagOf(back, 5)).toBe(TEN_TAGS.ignoredTheOnes);
    expect(tagOf(back, 12)).toBe(TEN_TAGS.ignoredTheTen);
  });
});

describe('comparing and ordering positions', () => {
  it('two positions, one below 10 and one from 10 up: the second in the order of travel (the higher going up)', () => {
    for (const item of many(orderPositions, activity('order.compare-two').params)) {
      const vs = [num(item, 'first'), num(item, 'second')];
      expect(item.prompt.third).toBeUndefined();
      expect(vs.some((v) => v < 10) && vs.some((v) => v >= 10)).toBe(true);
      const sorted = [...vs].sort((a, b) => (item.prompt.direction === 'up' ? a - b : b - a));
      expect(answer(item)).toBe(sorted[num(item, 'rank') - 1]);
    }
  });

  it('three positions at least 2 apart, the second or third asked, both ways', () => {
    const ranks = new Set<number>();
    for (const item of many(orderPositions, activity('order.three').params)) {
      const vs = [num(item, 'first'), num(item, 'second'), num(item, 'third')];
      const sorted = [...vs].sort((a, b) => a - b);
      expect(sorted[1]! - sorted[0]!).toBeGreaterThanOrEqual(2);
      expect(sorted[2]! - sorted[1]!).toBeGreaterThanOrEqual(2);
      ranks.add(num(item, 'rank'));
      const travel = item.prompt.direction === 'up' ? sorted : [...sorted].reverse();
      expect(answer(item)).toBe(travel[num(item, 'rank') - 1]);
      // The answer is always one of the positions given: a value answer elsewhere is a miss.
      expect(vs).toContain(answer(item));
    }
    expect(ranks).toEqual(new Set([2, 3])); // the first call met is where a count starts: the content asks for the second or later
  });

  it('diagnoses comparing ones digits, the wrong end, and the listed order', () => {
    // Listed 9, 14: going up, first is 9. Picking 14 is the ones-digit slip (4 < 9).
    const pick = (params: object, want: (i: GeneratedItem) => boolean) => {
      for (let k = 0; k < 2000; k++) {
        const i = generateItem(orderPositions, params, `p${k}`);
        if (want(i)) return i;
      }
      throw new Error('no such item');
    };
    const two = pick({ bounds: [2, 19], size: 2, ranks: [1], direction: 'up', minGap: 1, mixed: true, optionCount: 2 }, (i) => i.prompt.first === 9 && i.prompt.second === 14);
    expect(tagOf(two, 9)).toBe('correct');
    expect(tagOf(two, 14)).toBe(ORDER_TAGS.comparedOnesDigits);
    const plain = pick({ bounds: [2, 19], size: 2, ranks: [1], direction: 'up', minGap: 1, mixed: true, optionCount: 2 }, (i) => i.prompt.first === 3 && i.prompt.second === 15);
    expect(tagOf(plain, 15)).toBe(ORDER_TAGS.reversedOrder); // the ones digits agree (3 < 5): a plain reversal
    // Listed 13, 8, 17 going up, second asked: 13. 17 is second by ones digits (3, 7, 8).
    const three = pick({ bounds: [2, 19], size: 3, ranks: [2], direction: 'up', minGap: 2, mixed: false, optionCount: 3 }, (i) => i.prompt.first === 13 && i.prompt.second === 8 && i.prompt.third === 17);
    expect(tagOf(three, 13)).toBe('correct');
    expect(tagOf(three, 17)).toBe(ORDER_TAGS.comparedOnesDigits);
    // Listed 5, 12, 18 going down, first asked: 18. Lowest is the wrong end; 5 is also listed first.
    const listed = pick({ bounds: [2, 19], size: 3, ranks: [1], direction: 'down', minGap: 2, mixed: false, optionCount: 3 }, (i) => i.prompt.first === 12 && i.prompt.second === 5 && i.prompt.third === 18);
    expect(tagOf(listed, 18)).toBe('correct');
    expect(tagOf(listed, 5)).toBe(ORDER_TAGS.reversedOrder);
    expect(tagOf(listed, 12)).toBe(ORDER_TAGS.choseListedOrder);
    expect(tagOf(listed, 7)).toBeNull(); // not a position given: a miss with no likely cause
  });

  it('refuses a rank beyond the positions, and more options than positions', () => {
    const base = { bounds: [2, 19], size: 2, ranks: [1, 2], direction: 'up', minGap: 1, mixed: false, optionCount: 2 };
    expect(orderPositions.checkParams(base)).toEqual([]);
    expect(orderPositions.checkParams({ ...base, ranks: [3] })).not.toEqual([]);
    expect(orderPositions.checkParams({ ...base, optionCount: 3 })).not.toEqual([]);
  });
});

describe('version 2: two moves the same way', () => {
  it('both moves go the same way, every stop in the building', () => {
    for (const item of many(positionAfterTwoMovesV2, activity('two-moves.same-way').params)) {
      const [start, change, change2] = [num(item, 'start'), num(item, 'change'), num(item, 'change2')];
      const sign = item.prompt.direction === 'up' ? 1 : -1;
      expect(item.prompt.direction2).toBe(item.prompt.direction);
      const middle = start + sign * change;
      for (const f of [start, middle, middle + sign * change2]) expect(f >= 1 && f <= 20).toBe(true);
      expect(answer(item)).toBe(middle + sign * change2);
    }
  });

  it('diagnoses stopping after the first move, turning back for the second, and skipping the first', () => {
    const item = generateItem(positionAfterTwoMovesV2, { bounds: [1, 20], start: [4, 4], change: [5, 5], change2: [3, 3], direction: 'up', secondDirection: 'same', optionCount: 4 }, 'x');
    expect(tagOf(item, 12)).toBe('correct');
    expect(tagOf(item, 9)).toBe(TWO_TAGS.ignoredSecondMove);
    expect(tagOf(item, 6)).toBe(TWO_TAGS.reversedSecondMove);
    expect(tagOf(item, 7)).toBe(TWO_TAGS.ignoredFirstMove);
    const back = generateItem(positionAfterTwoMovesV2, { bounds: [1, 20], start: [4, 4], change: [5, 5], change2: [3, 3], direction: 'up', secondDirection: 'opposite', optionCount: 4 }, 'x');
    expect(tagOf(back, 6)).toBe('correct');
    expect(tagOf(back, 12)).toBe(TWO_TAGS.sameDirectionTwice);
  });

  it('version 1 is still registered and unchanged: its own params, no second-direction param', () => {
    expect(BUILT_IN_GENERATORS.get('quantity.positionAfterTwoMoves@1')).toBe(positionAfterTwoMoves);
    expect(positionAfterTwoMoves.checkParams({ ...activity('two-moves.line.cued').params, secondDirection: 'same' })).not.toEqual([]);
    // Pinned: a version 1 item for a fixed seed (a change here re-seeds saved evidence: bump the version instead).
    expect(generateItem(positionAfterTwoMoves, activity('two-moves.line.cued').params, 'pin').prompt).toEqual(V1_PIN_TWO);
  });
});

describe('version 2: doubles and near doubles', () => {
  it('doubles are the same size twice; near doubles are one apart', () => {
    for (const item of many(combineGroupsV2, activity('combine-groups.doubles').params)) expect(num(item, 'first')).toBe(num(item, 'second'));
    for (const item of many(combineGroupsV2, activity('combine-groups.near-doubles').params)) expect(Math.abs(num(item, 'first') - num(item, 'second'))).toBe(1);
    for (const item of many(combineGroups, activity('combine-groups.make-ten').params)) expect(num(item, 'first') + num(item, 'second')).toBeGreaterThanOrEqual(10);
  });

  it('diagnoses doubling one group of a near double before the off-by-one', () => {
    const item = generateItem(combineGroupsV2, { first: [6, 6], second: [7, 7], extraWaiting: [2, 2], maxTotal: 13, pairs: 'nearDoubles', optionCount: 4 }, 'x');
    expect(tagOf(item, 13)).toBe('correct');
    expect(tagOf(item, 12)).toBe(GROUP_TAGS.doubledOneGroup);
    expect(tagOf(item, 14)).toBe(GROUP_TAGS.doubledOneGroup);
    expect(tagOf(item, 7)).toBe(GROUP_TAGS.countedOneGroupOnly);
    expect(tagOf(item, 15)).toBe(GROUP_TAGS.tookEverythingWaiting);
  });

  it('version 1 is still registered and unchanged', () => {
    expect(BUILT_IN_GENERATORS.get('quantity.combineGroups@1')).toBe(combineGroups);
    expect(generateItem(combineGroups, activity('combine-groups.objects').params, 'pin').prompt).toEqual(V1_PIN_GROUPS);
  });
});

// Version 1 outputs for seed "pin", recorded before version 2 was added. They must never change.
const V1_PIN_TWO = { start: 9, change: 7, direction: 'down', change2: 3, direction2: 'up', low: 1, high: 20 };
const V1_PIN_GROUPS = { first: 3, second: 4, waiting: 9 };
