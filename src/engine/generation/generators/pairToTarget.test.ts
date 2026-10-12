// "Make T with two numbers": exactly one pair makes the target, every pair is an option, slips tagged.
import { evaluateResponse } from '../../evaluation/evaluate';
import { generateItem } from '../generator';
import { BUILT_IN_GENERATORS } from '../registry';
import { PAIR_MISCONCEPTIONS, pairNumbers, pairToTarget, pairValue } from './pairToTarget';

const P = { target: [7, 12], values: [1, 9], count: 5 };
const many = (p: unknown, n = 400) => Array.from({ length: n }, (_, i) => generateItem(pairToTarget, p, `s${i}`));

describe('quantity.pairToTarget@1', () => {
  it('is registered', () => {
    expect(BUILT_IN_GENERATORS.get('quantity.pairToTarget@1')).toBe(pairToTarget);
  });

  it('gives distinct numbers in range with exactly one pair to the target, and lists every pair once', () => {
    for (const item of many(P)) {
      const nums = pairNumbers(item.prompt);
      const target = item.prompt.target as number;
      expect(new Set(nums).size).toBe(5);
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      nums.forEach((n) => expect(n >= 1 && n <= 9).toBe(true));
      expect(target >= 7 && target <= 12).toBe(true);
      const hits = [];
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) hits.push(pairValue(nums[i]!, nums[j]!));
      expect(hits).toHaveLength(1);
      expect(item.response.options).toHaveLength(10);
      expect(new Set(item.response.options.map((o) => o.value)).size).toBe(10);
      const right = item.response.options.find((o) => o.correct)!;
      expect(right.value).toBe(hits[0]);
      expect(pairToTarget.solve(item.prompt)).toBe(hits[0]);
    }
  });

  it('tags a pair one away from the target as a slip, and only those', () => {
    for (const item of many(P, 200)) {
      const target = item.prompt.target as number;
      for (const o of item.response.options.filter((x) => !x.correct)) {
        const [a, b] = String(o.value).split('+').map(Number);
        expect(o.misconception === PAIR_MISCONCEPTIONS.offByOne).toBe(Math.abs(a! + b! - target) === 1);
      }
      const wrong = item.response.options.find((o) => !o.correct)!;
      expect(evaluateResponse(item, { mode: 'choice', optionId: wrong.id })).toMatchObject({ valid: true, correct: false });
    }
  });

  it('is deterministic for a seed, and four numbers give six pairs', () => {
    expect(generateItem(pairToTarget, P, 'x')).toEqual(generateItem(pairToTarget, P, 'x'));
    const four = generateItem(pairToTarget, { ...P, count: 4 }, 'y');
    expect(four.response.options).toHaveLength(6);
  });

  it('refuses params that cannot make a target', () => {
    expect(() => generateItem(pairToTarget, { target: [30, 31], values: [1, 9], count: 4 }, 'z')).toThrow(/no target/);
  });
});
