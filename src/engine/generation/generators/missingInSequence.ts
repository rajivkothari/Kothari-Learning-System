// "A pattern goes up (or down) by S: A, A+S, A+2S, ... One term is missing. Which?"
// Skip counting from a start that need not be a multiple of S, with a gap in the middle (fill
// it in) or at the end (what comes next). The first term is always shown, so the count starts
// from something given. Theme-neutral: lights in a row, stepping stones, house numbers.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    /** The bounded line: every term of the pattern lies on it. */
    bounds: Range,
    /** Allowed steps of the pattern (distinct), e.g. [2] or [5]. */
    steps: z.array(z.number().int().min(2).max(10)).min(1),
    /** How many terms the pattern shows, the gap included. */
    length: z.tuple([z.number().int().min(3).max(8), z.number().int().min(3).max(8)]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]'),
    direction: z.enum(['up', 'down', 'either']),
    /** Where the gap is: between two shown terms, at the end (the next term), or either. Never the first term. */
    missing: z.enum(['middle', 'last', 'any']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => new Set(p.steps).size === p.steps.length, { message: 'steps must be distinct', path: ['steps'] })
  .refine((p) => p.missing !== 'middle' || p.length[1] >= 3, { message: 'a middle gap needs at least three terms', path: ['length'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';
interface Pattern {
  first: number;
  step: number;
  length: number;
  missing: number;
}

function gaps(p: Params, length: number): number[] {
  const middle = Array.from({ length: Math.max(0, length - 2) }, (_, i) => i + 1);
  if (p.missing === 'middle') return middle;
  if (p.missing === 'last') return [length - 1];
  return [...middle, length - 1];
}

function combos(p: Params, dir: Dir): Pattern[] {
  const sign = dir === 'up' ? 1 : -1;
  const inside = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
  const out: Pattern[] = [];
  for (const step of p.steps) {
    for (let length = p.length[0]; length <= p.length[1]; length++) {
      for (let first = p.bounds[0]; first <= p.bounds[1]; first++) {
        if (!inside(first + sign * step * (length - 1))) continue;
        for (const missing of gaps(p, length)) out.push({ first, step, length, missing });
      }
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS = {
  countedByOnes: 'quantity.countedByOnes',
  skippedATerm: 'quantity.skippedATerm',
} as const;

export const missingInSequence = defineGenerator<Params>({
  id: 'quantity.missingInSequence',
  version: 1,
  concept: 'missingInSequence',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('missingInSequence: no pattern fits inside bounds');
    const direction = rng.pick(usable);
    const { first, step, length, missing } = rng.pick(combos(p, direction));
    const sign = direction === 'up' ? 1 : -1;
    const correct = first + sign * step * missing;
    const before = correct - sign * step;
    const last = missing === length - 1;

    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      // Counted on by one from the term before the gap (or back by one from the term after it).
      { value: before + sign, misconception: MISCONCEPTIONS.countedByOnes },
      ...(last ? [] : [{ value: correct + sign * step - sign, misconception: MISCONCEPTIONS.countedByOnes }]),
      // The next term after the one asked for: one whole step too far.
      { value: correct + sign * step, ...(last ? { misconception: MISCONCEPTIONS.skippedATerm } : {}) },
      // Untagged fillers: wrong, no single likely cause.
      { value: before },
      { value: correct + 2 },
      { value: correct - 2 },
      { value: correct + 3 },
      { value: correct - 3 },
    ];
    return {
      prompt: { first, step, direction, length, missing, low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { first, step, missing, direction } = prompt;
    if (typeof first !== 'number' || typeof step !== 'number' || typeof missing !== 'number') throw new ContentGenerationError('missingInSequence: bad prompt');
    return first + (direction === 'down' ? -1 : 1) * step * missing;
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});
