// "Positions A, B (and C) are called. Going up (or down), which one do you reach first, second...?"
// Comparing and ordering numbers on a bounded line: the answer is the position with the asked rank
// in the order of travel. Two positions is a comparison (the lower or the higher); three is
// ordering. Theme-neutral: stops on a route, houses on a street, stations on a line.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Range = z.tuple([z.number().int(), z.number().int()]).refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

const ParamsSchema = z
  .object({
    /** Where the positions may be. */
    bounds: Range,
    /** How many positions: 2 compares, 3 orders. */
    size: z.number().int().min(2).max(3),
    /** Ranks that may be asked for (1 = reached first). */
    ranks: z.array(z.number().int().min(1).max(3)).min(1),
    /** Direction of travel: up meets the lowest first, down the highest. */
    direction: z.enum(['up', 'down', 'either']),
    /** Smallest gap between any two positions. */
    minGap: z.number().int().min(1),
    /** At least one position below 10 and one at 10 or above (one digit against two). */
    mixed: z.boolean(),
    optionCount: z.number().int().min(2).max(3),
  })
  .strict()
  .refine((p) => p.ranks.every((r) => r <= p.size), { message: 'a rank cannot exceed the number of positions', path: ['ranks'] })
  .refine((p) => new Set(p.ranks).size === p.ranks.length, { message: 'ranks must be distinct', path: ['ranks'] })
  .refine((p) => p.optionCount <= p.size, { message: 'there are only as many options as positions', path: ['optionCount'] });
type Params = z.infer<typeof ParamsSchema>;

type Dir = 'up' | 'down';

/** Every increasing set of `size` distinct positions that meets the gap and mix rules. */
function sets(p: Params): number[][] {
  const [lo, hi] = p.bounds;
  const out: number[][] = [];
  const ok = (vs: number[]) => !p.mixed || (vs.some((v) => v < 10) && vs.some((v) => v >= 10));
  for (let a = lo; a <= hi; a++) {
    for (let b = a + p.minGap; b <= hi; b++) {
      if (p.size === 2) {
        if (ok([a, b])) out.push([a, b]);
        continue;
      }
      for (let c = b + p.minGap; c <= hi; c++) if (ok([a, b, c])) out.push([a, b, c]);
    }
  }
  return out;
}

const ORDERS: Record<number, number[][]> = {
  2: [[0, 1], [1, 0]],
  3: [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]],
};

/**
 * The listings are every set in every listing order (set by set). Picked by index, so the list
 * itself is never built: listing k is set (k div orders) in order (k mod orders).
 */
function listing(p: Params, all: number[][], k: number): number[] {
  const orders = ORDERS[p.size] as number[][];
  const set = all[Math.floor(k / orders.length)] as number[];
  return (orders[k % orders.length] as number[]).map((i) => set[i] as number);
}
const listingCount = (p: Params, all: number[][]) => all.length * (ORDERS[p.size] as number[][]).length;

const directions = (p: Params): Dir[] => (p.direction === 'either' ? ['up', 'down'] : [p.direction]);
const KEYS = ['first', 'second', 'third'] as const;
const travelOrder = (vs: readonly number[], dir: Dir) => [...vs].sort((a, b) => (dir === 'up' ? a - b : b - a));
/** The order a learner gets by comparing ones digits only (ties keep the value order). */
const onesDigitOrder = (vs: readonly number[], dir: Dir) => [...vs].sort((a, b) => (dir === 'up' ? (a % 10) - (b % 10) || a - b : (b % 10) - (a % 10) || b - a));

export const MISCONCEPTIONS = {
  comparedOnesDigits: 'quantity.comparedOnesDigits',
  reversedOrder: 'quantity.reversedOrder',
  choseListedOrder: 'quantity.choseListedOrder',
} as const;

export const orderPositions = defineGenerator<Params>({
  id: 'quantity.orderPositions',
  version: 1,
  concept: 'orderPositions',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const all = sets(p);
    if (all.length === 0) throw new ContentGenerationError('orderPositions: no positions meet the gap and mix rules inside bounds');
    const direction = rng.pick(directions(p));
    const rank = rng.pick(p.ranks);
    const listed = listing(p, all, rng.int(0, listingCount(p, all) - 1));
    const at = (order: readonly number[]) => order[rank - 1] as number;
    const correct = at(travelOrder(listed, direction));
    const candidates: Distractor[] = [
      // Most specific first: a one-digit position against a two-digit one, compared by the ones digit.
      { value: at(onesDigitOrder(listed, direction)), misconception: MISCONCEPTIONS.comparedOnesDigits },
      { value: at(travelOrder(listed, direction === 'up' ? 'down' : 'up')), misconception: MISCONCEPTIONS.reversedOrder },
      { value: at(listed), misconception: MISCONCEPTIONS.choseListedOrder },
      ...listed.map((v) => ({ value: v })),
    ];
    const prompt: Record<string, number | string> = { direction, rank, low: p.bounds[0], high: p.bounds[1] };
    listed.forEach((v, i) => (prompt[KEYS[i] as string] = v));
    return { prompt, correct, distractors: candidates };
  },

  solve(prompt) {
    const { rank, direction } = prompt;
    const vs = KEYS.map((k) => prompt[k]).filter((v): v is number => typeof v === 'number');
    if (typeof rank !== 'number' || vs.length < 2 || rank < 1 || rank > vs.length) throw new ContentGenerationError('orderPositions: bad prompt');
    return travelOrder(vs, direction === 'down' ? 'down' : 'up')[rank - 1] as number;
  },

  countVariants: (p) => listingCount(p, sets(p)) * directions(p).length * p.ranks.length,
});
