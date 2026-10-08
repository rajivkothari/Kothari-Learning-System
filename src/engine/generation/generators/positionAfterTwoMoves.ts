// "Start at X. Move A one way, then B back the other way. Where do you end?"
// Two-step addition and subtraction on a bounded line. The second move always goes the other way
// and is a different size, so the trip never ends where it started. Theme-neutral.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    /** The bounded line: positions that exist. */
    bounds: Range,
    start: Range,
    /** Size of the first move. */
    change: Range,
    /** Size of the second move, back the other way. */
    change2: Range,
    /** Direction of the first move. */
    direction: z.enum(['up', 'down', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => p.change[0] >= 1 && p.change2[0] >= 1, { message: 'moves must be at least 1', path: ['change'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';
interface Trip {
  start: number;
  change: number;
  change2: number;
}

function combos(p: Params, dir: Dir): Trip[] {
  const sign = dir === 'up' ? 1 : -1;
  const inside = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
  const out: Trip[] = [];
  for (let start = Math.max(p.start[0], p.bounds[0]); start <= Math.min(p.start[1], p.bounds[1]); start++) {
    for (let change = p.change[0]; change <= p.change[1]; change++) {
      const middle = start + sign * change;
      if (!inside(middle)) continue;
      for (let change2 = p.change2[0]; change2 <= p.change2[1]; change2++) {
        if (change2 === change) continue; // back where it started: a different question
        if (inside(middle - sign * change2)) out.push({ start, change, change2 });
      }
    }
  }
  return out;
}

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);
const opposite = (d: Dir): Dir => (d === 'up' ? 'down' : 'up');

export const MISCONCEPTIONS = {
  ignoredSecondMove: 'quantity.ignoredSecondMove',
  sameDirectionTwice: 'quantity.sameDirectionTwice',
  ignoredFirstMove: 'quantity.ignoredFirstMove',
} as const;

export const positionAfterTwoMoves = defineGenerator<Params>({
  id: 'quantity.positionAfterTwoMoves',
  version: 1,
  concept: 'positionAfterTwoMoves',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = directions(p).filter((d) => combos(p, d).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('positionAfterTwoMoves: no trip fits inside bounds');
    const direction = rng.pick(usable);
    const { start, change, change2 } = rng.pick(combos(p, direction));
    const sign = direction === 'up' ? 1 : -1;
    const middle = start + sign * change;
    const correct = middle - sign * change2;

    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      { value: middle, misconception: MISCONCEPTIONS.ignoredSecondMove },
      { value: middle + sign * change2, misconception: MISCONCEPTIONS.sameDirectionTwice },
      { value: start - sign * change2, misconception: MISCONCEPTIONS.ignoredFirstMove },
      // Untagged fillers: off by one or two, no single likely cause over two moves.
      { value: correct + 1 },
      { value: correct - 1 },
      { value: correct + 2 },
      { value: correct - 2 },
    ];
    return {
      prompt: { start, change, direction, change2, direction2: opposite(direction), low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { start, change, change2, direction, direction2 } = prompt;
    if (typeof start !== 'number' || typeof change !== 'number' || typeof change2 !== 'number') throw new ContentGenerationError('positionAfterTwoMoves: bad prompt');
    const leg = (n: number, d: unknown) => (d === 'down' ? -n : n);
    return start + leg(change, direction) + leg(change2, direction2);
  },

  countVariants: (p) => directions(p).reduce((n, d) => n + combos(p, d).length, 0),
});

// Version 2: the second move may go the same way as the first ("up 4, then up 3 more": three
// numbers added), back the other way (version 1's only kind), or either. Version 1 stays registered
// unchanged for the activities and evidence that use it.
const ParamsSchemaV2 = z
  .object({
    bounds: Range,
    start: Range,
    change: Range,
    change2: Range,
    direction: z.enum(['up', 'down', 'either']),
    /** Which way the second move goes, relative to the first. */
    secondDirection: z.enum(['opposite', 'same', 'either']),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .refine((p) => p.change[0] >= 1 && p.change2[0] >= 1, { message: 'moves must be at least 1', path: ['change'] });
type ParamsV2 = z.infer<typeof ParamsSchemaV2>;
type Way = 'opposite' | 'same';

function combosV2(p: ParamsV2, dir: Dir, way: Way): Trip[] {
  const sign = dir === 'up' ? 1 : -1;
  const sign2 = way === 'same' ? sign : -sign;
  const inside = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
  const out: Trip[] = [];
  for (let start = Math.max(p.start[0], p.bounds[0]); start <= Math.min(p.start[1], p.bounds[1]); start++) {
    for (let change = p.change[0]; change <= p.change[1]; change++) {
      const middle = start + sign * change;
      if (!inside(middle)) continue;
      for (let change2 = p.change2[0]; change2 <= p.change2[1]; change2++) {
        if (way === 'opposite' && change2 === change) continue; // back where it started: a different question
        if (inside(middle + sign2 * change2)) out.push({ start, change, change2 });
      }
    }
  }
  return out;
}

const ways = (p: ParamsV2): Way[] => (p.secondDirection === 'either' ? ['opposite', 'same'] : [p.secondDirection]);
const dirsV2 = (p: ParamsV2): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);

export const MISCONCEPTIONS_V2 = {
  ...MISCONCEPTIONS,
  reversedSecondMove: 'quantity.reversedSecondMove',
} as const;

export const positionAfterTwoMovesV2 = defineGenerator<ParamsV2>({
  id: 'quantity.positionAfterTwoMoves',
  version: 2,
  concept: 'positionAfterTwoMoves',
  misconceptions: Object.values(MISCONCEPTIONS_V2),
  paramsSchema: ParamsSchemaV2,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const usable = dirsV2(p).flatMap((d) => ways(p).map((w) => ({ d, w }))).filter(({ d, w }) => combosV2(p, d, w).length > 0);
    if (usable.length === 0) throw new ContentGenerationError('positionAfterTwoMoves: no trip fits inside bounds');
    const { d: direction, w: way } = rng.pick(usable);
    const { start, change, change2 } = rng.pick(combosV2(p, direction, way));
    const sign = direction === 'up' ? 1 : -1;
    const sign2 = way === 'same' ? sign : -sign;
    const middle = start + sign * change;
    const correct = middle + sign2 * change2;

    const inBounds = (v: number) => v >= p.bounds[0] && v <= p.bounds[1];
    const candidates: Distractor[] = [
      { value: middle, misconception: MISCONCEPTIONS_V2.ignoredSecondMove },
      // The second move taken the wrong way: the same way when it goes back, back when it goes on.
      { value: middle - sign2 * change2, misconception: way === 'same' ? MISCONCEPTIONS_V2.reversedSecondMove : MISCONCEPTIONS_V2.sameDirectionTwice },
      { value: start + sign2 * change2, misconception: MISCONCEPTIONS_V2.ignoredFirstMove },
      { value: correct + 1 },
      { value: correct - 1 },
      { value: correct + 2 },
      { value: correct - 2 },
    ];
    return {
      prompt: { start, change, direction, change2, direction2: sign2 === 1 ? 'up' : 'down', low: p.bounds[0], high: p.bounds[1] },
      correct,
      distractors: candidates.filter((c) => typeof c.value === 'number' && inBounds(c.value)),
    };
  },

  solve(prompt) {
    const { start, change, change2, direction, direction2 } = prompt;
    if (typeof start !== 'number' || typeof change !== 'number' || typeof change2 !== 'number') throw new ContentGenerationError('positionAfterTwoMoves: bad prompt');
    const leg = (n: number, d: unknown) => (d === 'down' ? -n : n);
    return start + leg(change, direction) + leg(change2, direction2);
  },

  countVariants: (p) => dirsV2(p).reduce((n, d) => n + ways(p).reduce((m, w) => m + combosV2(p, d, w).length, 0), 0),
});
