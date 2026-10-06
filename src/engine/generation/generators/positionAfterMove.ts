// "Start at X. Move Y steps up (or down). Where do you end?"
// Theme-neutral: a presentation layer may render it as levels of a building, a number line,
// steps on a path, or anything else.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    /** The bounded line: positions that exist. */
    bounds: Range,
    start: Range,
    change: Range,
    direction: z.enum(['up', 'down', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => p.change[0] >= 1, { message: 'change must be at least 1', path: ['change'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';

function combos(p: Params, dir: Dir): { start: number; change: number }[] {
  const out: { start: number; change: number }[] = [];
  for (let start = Math.max(p.start[0], p.bounds[0]); start <= Math.min(p.start[1], p.bounds[1]); start++) {
    for (let change = p.change[0]; change <= p.change[1]; change++) {
      const end = dir === 'up' ? start + change : start - change;
      if (end >= p.bounds[0] && end <= p.bounds[1]) out.push({ start, change });
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS = {
  reversedDirection: 'quantity.reversedDirection',
  countedStartingPosition: 'quantity.countedStartingPosition',
  countedOneExtra: 'quantity.countedOneExtra',
  answeredWithChange: 'quantity.answeredWithChange',
} as const;

export const positionAfterMove = defineGenerator<Params>({
  id: 'quantity.positionAfterMove',
  version: 1,
  concept: 'positionAfterMove',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('positionAfterMove: no start/change pair fits inside bounds');
    const direction = rng.pick(usable);
    const { start, change } = rng.pick(combos(p, direction));
    const sign = direction === 'up' ? 1 : -1;
    const correct = start + sign * change;

    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      { value: start - sign * change, misconception: MISCONCEPTIONS.reversedDirection },
      { value: correct - sign, misconception: MISCONCEPTIONS.countedStartingPosition },
      { value: correct + sign, misconception: MISCONCEPTIONS.countedOneExtra },
      { value: change, misconception: MISCONCEPTIONS.answeredWithChange },
      // Untagged fillers: wrong, but no single likely cause.
      { value: correct + 2 },
      { value: correct - 2 },
      { value: correct + 3 },
      { value: correct - 3 },
    ];
    return {
      prompt: { start, change, direction, low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { start, change, direction } = prompt;
    if (typeof start !== 'number' || typeof change !== 'number') throw new ContentGenerationError('positionAfterMove: bad prompt');
    return direction === 'up' ? start + change : start - change;
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});
