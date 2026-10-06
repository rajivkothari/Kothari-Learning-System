// "A carrier holds C. A units are already aboard. W wait to be loaded. Load as many as
// can safely go." Missing addend in a capacity context: the answer is C - A, and loading
// more than that overloads. Theme-neutral: a cart, a boat, a basket, a truck.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    capacity: Range,
    aboard: Range,
    /** How many more than fit are waiting, so overloading is possible. */
    extraWaiting: Range,
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

export const MISCONCEPTIONS = {
  ignoredExistingLoad: 'quantity.ignoredExistingLoad',
  loadedEverything: 'quantity.loadedEverything',
  countedOneExtra: 'quantity.countedOneExtra',
  answeredWithExistingLoad: 'quantity.answeredWithExistingLoad',
} as const;

function combos(p: Params): { capacity: number; aboard: number; waiting: number }[] {
  const out: { capacity: number; aboard: number; waiting: number }[] = [];
  for (let capacity = p.capacity[0]; capacity <= p.capacity[1]; capacity++) {
    for (let aboard = p.aboard[0]; aboard <= p.aboard[1]; aboard++) {
      const room = capacity - aboard;
      if (room < 1) continue;
      for (let extra = Math.max(1, p.extraWaiting[0]); extra <= p.extraWaiting[1]; extra++) out.push({ capacity, aboard, waiting: room + extra });
    }
  }
  return out;
}

export const fillToCapacity = defineGenerator<Params>({
  id: 'quantity.fillToCapacity',
  version: 1,
  concept: 'fillToCapacity',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = combos(p);
    if (all.length === 0) throw new ContentGenerationError('fillToCapacity: no capacity/aboard/waiting combination has room');
    const { capacity, aboard, waiting } = rng.pick(all);
    const correct = capacity - aboard;
    const candidates: Distractor[] = [
      { value: capacity, misconception: MISCONCEPTIONS.ignoredExistingLoad },
      { value: waiting, misconception: MISCONCEPTIONS.loadedEverything },
      { value: correct + 1, misconception: MISCONCEPTIONS.countedOneExtra },
      { value: aboard, misconception: MISCONCEPTIONS.answeredWithExistingLoad },
      { value: correct - 1 },
      { value: correct + 2 },
    ];
    return { prompt: { capacity, aboard, waiting }, correct, distractors: candidates.filter((c) => typeof c.value === 'number' && c.value >= 0) };
  },

  solve(prompt) {
    const { capacity, aboard } = prompt;
    if (typeof capacity !== 'number' || typeof aboard !== 'number') throw new ContentGenerationError('fillToCapacity: bad prompt');
    return capacity - aboard;
  },

  countVariants: (p) => combos(p).length,
});
