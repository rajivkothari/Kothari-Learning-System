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
