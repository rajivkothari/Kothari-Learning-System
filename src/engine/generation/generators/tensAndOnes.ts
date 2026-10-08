// "Start at X. Move one ten (T tens), then O ones, the same way. Where do you end?"
// Place value on a bounded line: a ten is one jump of ten steps, then the ones are counted on.
// From zero it builds a teen number (1 ten and 7 ones is 17); from another start it is "ten more"
// or "ten less" and then some ones. Theme-neutral: a ten-step jump on any line.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    /** The bounded line: where every landing must be. Its low end may be 0 (start from zero). */
    bounds: Range,
    start: Range,
    /** Jumps of ten. */
    tens: z.tuple([z.number().int().min(1).max(9), z.number().int().min(1).max(9)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]'),
    /** Ones after the tens (0: a jump of ten only). */
    ones: z.tuple([z.number().int().min(0).max(9), z.number().int().min(0).max(9)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]'),
    direction: z.enum(['up', 'down', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';
interface Move {
  start: number;
  tens: number;
  ones: number;
}

function combos(p: Params, dir: Dir): Move[] {
  const sign = dir === 'up' ? 1 : -1;
  const inside = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
  const out: Move[] = [];
  for (let start = Math.max(p.start[0], p.bounds[0]); start <= Math.min(p.start[1], p.bounds[1]); start++) {
    for (let tens = p.tens[0]; tens <= p.tens[1]; tens++) {
      const afterTens = start + sign * 10 * tens;
      if (!inside(afterTens)) continue;
      for (let ones = p.ones[0]; ones <= p.ones[1]; ones++) if (inside(afterTens + sign * ones)) out.push({ start, tens, ones });
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS = {
  countedTenAsOne: 'quantity.countedTenAsOne',
  ignoredTheOnes: 'quantity.ignoredTheOnes',
  ignoredTheTen: 'quantity.ignoredTheTen',
  reversedDirection: 'quantity.reversedDirection',
  countedStartingPosition: 'quantity.countedStartingPosition',
  countedOneExtra: 'quantity.countedOneExtra',
} as const;

export const tensAndOnes = defineGenerator<Params>({
  id: 'quantity.tensAndOnes',
  version: 1,
  concept: 'tensAndOnes',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('tensAndOnes: no start, tens and ones fit inside bounds');
    const direction = rng.pick(usable);
    const { start, tens, ones } = rng.pick(combos(p, direction));
    const sign = direction === 'up' ? 1 : -1;
    const correct = start + sign * (10 * tens + ones);

    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      // Each ten taken as one step: the place-value slip.
      { value: start + sign * (tens + ones), misconception: MISCONCEPTIONS.countedTenAsOne },
      // Half the move: only the tens, or only the ones.
      ...(ones > 0 ? [{ value: start + sign * 10 * tens, misconception: MISCONCEPTIONS.ignoredTheOnes }] : []),
      ...(ones > 0 ? [{ value: start + sign * ones, misconception: MISCONCEPTIONS.ignoredTheTen }] : []),
      { value: start - sign * (10 * tens + ones), misconception: MISCONCEPTIONS.reversedDirection },
      // Counting the ten step by step: the usual off-by-one causes.
      { value: correct - sign, misconception: MISCONCEPTIONS.countedStartingPosition },
      { value: correct + sign, misconception: MISCONCEPTIONS.countedOneExtra },
      { value: correct + 2 },
      { value: correct - 2 },
    ];
    return {
      prompt: { start, tens, ones, direction, low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { start, tens, ones, direction } = prompt;
    if (typeof start !== 'number' || typeof tens !== 'number' || typeof ones !== 'number') throw new ContentGenerationError('tensAndOnes: bad prompt');
    return start + (direction === 'down' ? -1 : 1) * (10 * tens + ones);
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});
