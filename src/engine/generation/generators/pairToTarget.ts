// "Make T with two of these numbers." A set of distinct numbers in which exactly one pair adds to the
// target; the learner picks the pair. Every pair of the set is an option, so whichever two numbers a
// learner picks is a listed answer (a wrong pair is a real, diagnosable answer, never refused).
// Theme-neutral: numbered pins, cards, stones, coins.
//
// The prompt holds the target, the count and the numbers in ascending order (n1..nK). An answer is the
// pair written low first with a plus between: "4+5".
import { z } from 'zod';

import type { Prompt } from '../../content/item';
import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    target: Range,
    /** The numbers on offer come from this range (all distinct). */
    values: Range,
    /** How many numbers: 4 gives 6 pairs, 5 gives 10. */
    count: z.number().int().min(3).max(5),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

export const PAIR_MISCONCEPTIONS = {
  /** The pair adds to one more or one less than the target: a slip in adding or counting on. */
  offByOne: 'quantity.pairOffByOne',
} as const;

/** The canonical answer for a pair: low first. */
export const pairValue = (a: number, b: number) => `${Math.min(a, b)}+${Math.max(a, b)}`;

/** The numbers of a prompt, ascending. */
export function pairNumbers(prompt: Prompt): number[] {
  const count = prompt.count;
  if (typeof count !== 'number') throw new ContentGenerationError('pairToTarget: bad prompt');
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    const n = prompt[`n${i}`];
    if (typeof n !== 'number') throw new ContentGenerationError('pairToTarget: bad prompt');
    out.push(n);
  }
  return out;
}

function pairsOf(nums: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) out.push([nums[i]!, nums[j]!]);
  return out;
}

const pairCount = (count: number) => (count * (count - 1)) / 2;

export const pairToTarget = defineGenerator<Params>({
  id: 'quantity.pairToTarget',
  version: 1,
  concept: 'pairToTarget',
  misconceptions: Object.values(PAIR_MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => pairCount(p.count),

  generate(p, rng) {
    const [lo, hi] = p.values;
    // The smaller number of each pair of distinct numbers in range that makes t.
    const firstsFor = (t: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((a) => t - a > a && t - a <= hi);
    const targets: number[] = [];
    for (let t = p.target[0]; t <= p.target[1]; t++) if (firstsFor(t).length > 0) targets.push(t);
    if (targets.length === 0) throw new ContentGenerationError('pairToTarget: no target in range is a sum of two distinct values in range');
    for (let tries = 0; tries < 40; tries++) {
      const target = rng.pick(targets);
      const a = rng.pick(firstsFor(target));
      const nums = [a, target - a];
      // Add the others one by one; none may complete a second pair to the target.
      for (const v of rng.shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i))) {
        if (nums.length === p.count) break;
        if (nums.includes(v) || nums.includes(target - v)) continue;
        nums.push(v);
      }
      if (nums.length < p.count) continue;
      nums.sort((x, y) => x - y);
      const prompt: Prompt = { target, count: p.count };
      nums.forEach((n, i) => (prompt[`n${i + 1}`] = n));
      const correct = pairValue(a, target - a);
      // Every other pair is an option: the off-by-one slips first.
      const others = pairsOf(nums).filter(([x, y]) => x + y !== target);
      const tagged: Distractor[] = others.filter(([x, y]) => Math.abs(x + y - target) === 1).map(([x, y]) => ({ value: pairValue(x, y), misconception: PAIR_MISCONCEPTIONS.offByOne }));
      const rest: Distractor[] = others.filter(([x, y]) => Math.abs(x + y - target) !== 1).map(([x, y]) => ({ value: pairValue(x, y) }));
      return { prompt, correct, distractors: [...tagged, ...rest] };
    }
    throw new ContentGenerationError('pairToTarget: these params give no set with exactly one pair to the target');
  },

  solve(prompt) {
    const target = prompt.target;
    if (typeof target !== 'number') throw new ContentGenerationError('pairToTarget: bad prompt');
    const hits = pairsOf(pairNumbers(prompt)).filter(([x, y]) => x + y === target);
    if (hits.length !== 1) throw new ContentGenerationError(`pairToTarget: ${hits.length} pairs make ${target}`);
    return pairValue(hits[0]![0], hits[0]![1]);
  },
});
