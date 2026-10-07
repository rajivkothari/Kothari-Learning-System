// "Jumps of S, starting from zero: S, 2S, 3S... Where is jump N?" Early multiplication as equal
// jumps on a line (skip counting). The first two landings are shown, so the count starts at 3.
// Theme-neutral: express stops, hops on a path, stepping stones.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const ParamsSchema = z
  .object({
    /** Allowed jump sizes (the facts), e.g. [2, 3, 5]. */
    steps: z.array(z.number().int().min(2).max(10)).min(1),
    /** Which jump is asked for. At least 3: the first two landings are part of the question. */
    count: z.tuple([z.number().int().min(3), z.number().int().min(3)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]'),
    /** Largest landing allowed (the end of the line). */
    max: z.number().int().min(6),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => new Set(p.steps).size === p.steps.length, { message: 'jump sizes must be distinct', path: ['steps'] });
type Params = z.infer<typeof ParamsSchema>;

function combos(p: Params): { step: number; count: number }[] {
  const out: { step: number; count: number }[] = [];
  for (const step of p.steps) for (let count = p.count[0]; count <= p.count[1]; count++) if (step * count <= p.max) out.push({ step, count });
  return out;
}

export const MISCONCEPTIONS = {
  oneJumpShort: 'quantity.oneJumpShort',
  oneJumpExtra: 'quantity.oneJumpExtra',
  addedInsteadOfMultiplied: 'quantity.addedInsteadOfMultiplied',
  answeredWithJumpCount: 'quantity.answeredWithJumpCount',
} as const;

export const equalJumps = defineGenerator<Params>({
  id: 'quantity.equalJumps',
  version: 1,
  concept: 'equalJumps',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = combos(p);
    if (all.length === 0) throw new ContentGenerationError('equalJumps: no jump size and count fit under max');
    const { step, count } = rng.pick(all);
    const correct = step * count;
    const candidates: Distractor[] = [
      { value: step * (count - 1), misconception: MISCONCEPTIONS.oneJumpShort },
      { value: step * (count + 1), misconception: MISCONCEPTIONS.oneJumpExtra },
      { value: step + count, misconception: MISCONCEPTIONS.addedInsteadOfMultiplied },
      { value: count, misconception: MISCONCEPTIONS.answeredWithJumpCount },
      { value: correct + 1 },
      { value: correct - 1 },
    ];
    return {
      prompt: { step, count, max: p.max },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && c.value >= 1 && c.value <= p.max),
    };
  },

  solve(prompt) {
    const { step, count } = prompt;
    if (typeof step !== 'number' || typeof count !== 'number') throw new ContentGenerationError('equalJumps: bad prompt');
    return step * count;
  },

  countVariants: (p) => combos(p).length,
});
