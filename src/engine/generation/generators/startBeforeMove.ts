// "Something moved Y steps up (or down) and ended at E. Where did it start?"
// Start-unknown addition and subtraction on a bounded line: undo the move. Theme-neutral.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    bounds: Range,
    /** Where the move ended: a given. */
    end: Range,
    change: Range,
    /** Direction of the move that happened. */
    direction: z.enum(['up', 'down', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => p.change[0] >= 1, { message: 'change must be at least 1', path: ['change'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';

function combos(p: Params, dir: Dir): { end: number; change: number }[] {
  const sign = dir === 'up' ? 1 : -1;
  const out: { end: number; change: number }[] = [];
  for (let end = Math.max(p.end[0], p.bounds[0]); end <= Math.min(p.end[1], p.bounds[1]); end++) {
    for (let change = p.change[0]; change <= p.change[1]; change++) {
      const start = end - sign * change;
      if (start >= p.bounds[0] && start <= p.bounds[1]) out.push({ end, change });
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS = {
  repeatedTheMove: 'quantity.repeatedTheMove',
  countedStartingPosition: 'quantity.countedStartingPosition',
  countedOneExtra: 'quantity.countedOneExtra',
  answeredWithChange: 'quantity.answeredWithChange',
} as const;

export const startBeforeMove = defineGenerator<Params>({
  id: 'quantity.startBeforeMove',
  version: 1,
  concept: 'startBeforeMove',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('startBeforeMove: no end/change pair fits inside bounds');
    const direction = rng.pick(usable);
    const { end, change } = rng.pick(combos(p, direction));
    const sign = direction === 'up' ? 1 : -1;
    const correct = end - sign * change;

    // Counting back from the end: the same off-by-one causes as any count, in the backward direction.
    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      { value: end + sign * change, misconception: MISCONCEPTIONS.repeatedTheMove },
      { value: correct + sign, misconception: MISCONCEPTIONS.countedStartingPosition },
      { value: correct - sign, misconception: MISCONCEPTIONS.countedOneExtra },
      { value: change, misconception: MISCONCEPTIONS.answeredWithChange },
      { value: correct + 2 },
      { value: correct - 2 },
      { value: correct + 3 },
      { value: correct - 3 },
    ];
    return {
      prompt: { end, change, direction, low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { end, change, direction } = prompt;
    if (typeof end !== 'number' || typeof change !== 'number') throw new ContentGenerationError('startBeforeMove: bad prompt');
    return direction === 'up' ? end - change : end + change;
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});
