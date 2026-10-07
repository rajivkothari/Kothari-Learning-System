// "You are at A. The target is at B. How many steps apart?" Difference as distance on a bounded
// line: the answer is a count, not a position. Theme-neutral.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    bounds: Range,
    /** Where counting starts (a given). */
    from: Range,
    /** How far apart (the answer). */
    distance: Range,
    /** Which way the target lies from the start. */
    direction: z.enum(['up', 'down', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => p.distance[0] >= 1, { message: 'distance must be at least 1', path: ['distance'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';

function combos(p: Params, dir: Dir): { from: number; distance: number }[] {
  const sign = dir === 'up' ? 1 : -1;
  const out: { from: number; distance: number }[] = [];
  for (let from = Math.max(p.from[0], p.bounds[0]); from <= Math.min(p.from[1], p.bounds[1]); from++) {
    for (let distance = p.distance[0]; distance <= p.distance[1]; distance++) {
      const to = from + sign * distance;
      if (to >= p.bounds[0] && to <= p.bounds[1]) out.push({ from, distance });
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS = {
  countedBothEnds: 'quantity.countedBothEnds',
  answeredWithTarget: 'quantity.answeredWithTarget',
  answeredWithStart: 'quantity.answeredWithStart',
} as const;

export const distanceBetween = defineGenerator<Params>({
  id: 'quantity.distanceBetween',
  version: 1,
  concept: 'distanceBetween',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('distanceBetween: no start/distance pair fits inside bounds');
    const direction = rng.pick(usable);
    const { from, distance } = rng.pick(combos(p, direction));
    const to = direction === 'up' ? from + distance : from - distance;
    const span = p.bounds[1] - p.bounds[0];
    const candidates: Distractor[] = [
      { value: distance + 1, misconception: MISCONCEPTIONS.countedBothEnds },
      { value: to, misconception: MISCONCEPTIONS.answeredWithTarget },
      { value: from, misconception: MISCONCEPTIONS.answeredWithStart },
      { value: distance - 1 },
      { value: distance + 2 },
      { value: distance - 2 },
    ];
    return {
      prompt: { from, to, low: p.bounds[0], high: p.bounds[1] },
      correct: distance,
      distractors: candidates.filter((c) => typeof c.value === 'number' && c.value >= 1 && c.value <= span + 1),
    };
  },

  solve(prompt) {
    const { from, to } = prompt;
    if (typeof from !== 'number' || typeof to !== 'number') throw new ContentGenerationError('distanceBetween: bad prompt');
    return Math.abs(to - from);
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});
