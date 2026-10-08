// "Two orders: A and B. Load both, and nothing else." Addition as putting two groups together,
// with more waiting than was asked for, so taking everything is not the answer. Theme-neutral:
// boxes, apples, blocks.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int().min(1), z.number().int().min(1)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    first: Range,
    second: Range,
    /** How many more than the two orders are waiting (not asked for). */
    extraWaiting: Range,
    /** Largest total of the two orders. */
    maxTotal: z.number().int().min(2),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

function combos(p: Params): { first: number; second: number; waiting: number }[] {
  const out: { first: number; second: number; waiting: number }[] = [];
  for (let first = p.first[0]; first <= p.first[1]; first++) {
    for (let second = p.second[0]; second <= p.second[1]; second++) {
      if (first + second > p.maxTotal) continue;
      for (let extra = p.extraWaiting[0]; extra <= p.extraWaiting[1]; extra++) out.push({ first, second, waiting: first + second + extra });
    }
  }
  return out;
}

export const MISCONCEPTIONS = {
  countedOneGroupOnly: 'quantity.countedOneGroupOnly',
  tookEverythingWaiting: 'quantity.tookEverythingWaiting',
  countedOneExtra: 'quantity.countedOneExtra',
} as const;

export const combineGroups = defineGenerator<Params>({
  id: 'quantity.combineGroups',
  version: 1,
  concept: 'combineGroups',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = combos(p);
    if (all.length === 0) throw new ContentGenerationError('combineGroups: no pair of orders fits under maxTotal');
    const { first, second, waiting } = rng.pick(all);
    const correct = first + second;
    const candidates: Distractor[] = [
      { value: waiting, misconception: MISCONCEPTIONS.tookEverythingWaiting },
      { value: Math.max(first, second), misconception: MISCONCEPTIONS.countedOneGroupOnly },
      { value: Math.min(first, second), misconception: MISCONCEPTIONS.countedOneGroupOnly },
      { value: correct + 1, misconception: MISCONCEPTIONS.countedOneExtra },
      { value: correct - 1 },
      { value: correct + 2 },
    ];
    return { prompt: { first, second, waiting }, correct, distractors: candidates.filter((c) => typeof c.value === 'number' && c.value >= 1) };
  },

  solve(prompt) {
    const { first, second } = prompt;
    if (typeof first !== 'number' || typeof second !== 'number') throw new ContentGenerationError('combineGroups: bad prompt');
    return first + second;
  },

  countVariants: (p) => combos(p).length,
});

// Version 2: the two groups may be any pair (version 1's only kind), doubles (the same size), or
// near doubles (sizes one apart): the facts a learner can reach from a double they know. Version 1
// stays registered unchanged for the activities and evidence that use it.
const ParamsSchemaV2 = z
  .object({
    first: Range,
    second: Range,
    extraWaiting: Range,
    maxTotal: z.number().int().min(2),
    /** Which pairs: any, doubles (first = second), or near doubles (one apart). */
    pairs: z.enum(['any', 'doubles', 'nearDoubles']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type ParamsV2 = z.infer<typeof ParamsSchemaV2>;

function combosV2(p: ParamsV2): { first: number; second: number; waiting: number }[] {
  const fits = (a: number, b: number) => (p.pairs === 'doubles' ? a === b : p.pairs === 'nearDoubles' ? Math.abs(a - b) === 1 : true);
  return combos(p).filter((c) => fits(c.first, c.second));
}

export const MISCONCEPTIONS_V2 = {
  ...MISCONCEPTIONS,
  doubledOneGroup: 'quantity.doubledOneGroup',
} as const;

export const combineGroupsV2 = defineGenerator<ParamsV2>({
  id: 'quantity.combineGroups',
  version: 2,
  concept: 'combineGroups',
  misconceptions: Object.values(MISCONCEPTIONS_V2),
  paramsSchema: ParamsSchemaV2,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = combosV2(p);
    if (all.length === 0) throw new ContentGenerationError('combineGroups: no pair of groups fits the rules under maxTotal');
    const { first, second, waiting } = rng.pick(all);
    const correct = first + second;
    const candidates: Distractor[] = [
      { value: waiting, misconception: MISCONCEPTIONS_V2.tookEverythingWaiting },
      // Near doubles: the double of one group, used for both (the double was right, the adjustment missed).
      ...(first !== second ? [{ value: 2 * first, misconception: MISCONCEPTIONS_V2.doubledOneGroup }, { value: 2 * second, misconception: MISCONCEPTIONS_V2.doubledOneGroup }] : []),
      { value: Math.max(first, second), misconception: MISCONCEPTIONS_V2.countedOneGroupOnly },
      { value: Math.min(first, second), misconception: MISCONCEPTIONS_V2.countedOneGroupOnly },
      { value: correct + 1, misconception: MISCONCEPTIONS_V2.countedOneExtra },
      { value: correct - 1 },
      { value: correct + 2 },
    ];
    return { prompt: { first, second, waiting }, correct, distractors: candidates.filter((c) => typeof c.value === 'number' && c.value >= 1) };
  },

  solve(prompt) {
    const { first, second } = prompt;
    if (typeof first !== 'number' || typeof second !== 'number') throw new ContentGenerationError('combineGroups: bad prompt');
    return first + second;
  },

  countVariants: (p) => combosV2(p).length,
});
