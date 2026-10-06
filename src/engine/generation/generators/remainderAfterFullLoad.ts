// "There are T things. One trip carries C. After one full trip, how many remain?"
// Subtraction applied in a planning context, used as a higher-order encounter stage.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const ParamsSchema = z
  .object({
    capacity: z.tuple([z.number().int().min(1), z.number().int().min(1)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]'),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

export const MISCONCEPTIONS = {
  answeredWithCapacity: 'quantity.answeredWithCapacity',
  answeredWithTotal: 'quantity.answeredWithTotal',
  addedInsteadOfSubtracted: 'quantity.addedInsteadOfSubtracted',
} as const;

function pairs(p: Params): { total: number; capacity: number }[] {
  const out: { total: number; capacity: number }[] = [];
  for (let capacity = p.capacity[0]; capacity <= p.capacity[1]; capacity++) {
    // More than one trip's worth, at most two trips' worth.
    for (let total = capacity + 1; total <= capacity * 2; total++) out.push({ total, capacity });
  }
  return out;
}

export const remainderAfterFullLoad = defineGenerator<Params>({
  id: 'quantity.remainderAfterFullLoad',
  version: 1,
  concept: 'remainderAfterFullLoad',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = pairs(p);
    if (all.length === 0) throw new ContentGenerationError('remainderAfterFullLoad: empty parameter space');
    const { total, capacity } = rng.pick(all);
    const correct = total - capacity;
    const candidates: Distractor[] = [
      { value: capacity, misconception: MISCONCEPTIONS.answeredWithCapacity },
      { value: total, misconception: MISCONCEPTIONS.answeredWithTotal },
      { value: total + capacity, misconception: MISCONCEPTIONS.addedInsteadOfSubtracted },
      { value: correct + 1 },
      { value: Math.max(1, correct - 1) },
      { value: correct + 2 },
    ];
    return { prompt: { total, capacity }, correct, distractors: candidates };
  },

  solve(prompt) {
    const { total, capacity } = prompt;
    if (typeof total !== 'number' || typeof capacity !== 'number') throw new ContentGenerationError('remainderAfterFullLoad: bad prompt');
    return total - capacity;
  },

  countVariants: (p) => pairs(p).length,
});
