// Two-digit quantities (M9): adding and subtracting two-digit numbers, with or without regrouping,
// in six theme-neutral shapes. A theme decides what the numbers are (weights, loads, deliveries).
//
//   kind               prompt                                   answer
//   twoDeliveries      { a, b }                                 a + b
//   capacityRemaining  { capacity, loaded }                     capacity - loaded
//   missingAmount      { order, have }                          order - have (a missing addend)
//   compare            { a, b }                                 |a - b| (how many more)
//   twoStep            { capacity, a, b }                       capacity - a - b
//   exactLoad          { target, parts: "12,23,35", partCount }  target: exactly one set of the
//                      parts (any size) adds up to the target, so the set that hits it is unique
//
// Every prompt also carries `kind`. `regroup` decides whether the operation crosses a ten: "with"
// (adding the ones makes a new ten, or subtracting needs a ten broken into ones), "without", or
// "either". A two-step job regroups when either step does; an exact load when its parts' ones do.
// The answer is never equal to a number given (52 - 26 is never asked: answering with the 26 on the
// job would be right by accident). The numbers come from ranges in the params: `numbers` for each part
// (one of the parts of an exact load, an amount added, what is already in or in hand), `whole` for what
// the parts make or come out of (a sum, a capacity, an order, the target), `answer` for the answer. Items are drawn uniformly from every combination the params
// allow (enumerated once per params), except an exact load, which is built and checked.
import { z } from 'zod';

import type { Rng } from '../../random/rng';
import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

export const TWO_DIGIT_KINDS = ['twoDeliveries', 'capacityRemaining', 'missingAmount', 'compare', 'twoStep', 'exactLoad'] as const;
export type TwoDigitKind = (typeof TWO_DIGIT_KINDS)[number];

export const TWO_DIGIT_MISCONCEPTIONS = {
  /** Added the ones, wrote the new ten nowhere: 10 short. */
  forgotTheCarry: 'quantity.forgotTheCarry',
  /** In each column took the smaller digit from the larger (52 - 27 gives 35). */
  smallerFromLarger: 'quantity.smallerFromLarger',
  /** Broke a ten into ones but kept the ten: 10 over. */
  forgotTheBorrow: 'quantity.forgotTheBorrow',
  addedInsteadOfSubtracted: 'quantity.addedInsteadOfSubtracted',
  subtractedInsteadOfAdded: 'quantity.subtractedInsteadOfAdded',
  /** Answered with one of the numbers given. */
  answeredWithAGiven: 'quantity.answeredWithAGiven',
  /** Counted one ten too many or too few (no regrouping involved). */
  miscountedTens: 'quantity.miscountedTens',
  /** A two-step job answered after its first step. */
  stoppedAfterOneStep: 'quantity.stoppedAfterOneStep',
} as const;
const M = TWO_DIGIT_MISCONCEPTIONS;

const Range = (min: number, max: number) =>
  z
    .tuple([z.number().int().min(min).max(max), z.number().int().min(min).max(max)])
    .refine(([lo, hi]) => lo <= hi, 'range must be [low, high]');

/** Combinations one params set may enumerate (kept small so items are drawn quickly and exactly). */
export const MAX_COMBINATIONS = 400_000;

const ParamsSchema = z
  .object({
    kind: z.enum(TWO_DIGIT_KINDS),
    regroup: z.enum(['with', 'without', 'either']),
    /** Each part: one of an exact load's parts, an amount added, what is already in or in hand. Two-digit. */
    numbers: Range(10, 99),
    /** What the parts make or come out of: a sum, a capacity, an order, the target. Unused by compare. */
    whole: Range(10, 199).optional(),
    /** The answer's range. */
    answer: Range(1, 199),
    /** exactLoad only: how many parts there are, and how many of them make the target. */
    parts: z.object({ count: Range(3, 6), pick: Range(2, 4) }).strict().optional(),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict()
  .superRefine((p, ctx) => {
    if ((p.kind === 'exactLoad') !== (p.parts !== undefined)) ctx.addIssue({ code: 'custom', path: ['parts'], message: 'parts is required exactly for kind "exactLoad"' });
    if ((p.kind === 'compare') === (p.whole !== undefined)) ctx.addIssue({ code: 'custom', path: ['whole'], message: 'whole is required for every kind except "compare", and unused by it' });
    // A load is always some of the parts, never all of them (a set with fewer parts is drawn when needed).
    if (p.parts && p.parts.pick[0] >= p.parts.count[0]) ctx.addIssue({ code: 'custom', path: ['parts', 'pick'], message: 'the parts that make the target must be fewer than all the parts' });
    const span = (r: readonly [number, number]) => r[1] - r[0] + 1;
    const size = p.kind === 'exactLoad' ? 0 : span(p.numbers) * (p.kind === 'compare' || p.kind === 'twoDeliveries' ? span(p.numbers) : span(p.whole ?? [0, 0])) * (p.kind === 'twoStep' ? span(p.numbers) : 1);
    if (size > MAX_COMBINATIONS) ctx.addIssue({ code: 'custom', path: ['numbers'], message: `these ranges allow ${size} combinations; narrow them to at most ${MAX_COMBINATIONS}` });
  });
type Params = z.infer<typeof ParamsSchema>;

const ones = (n: number) => n % 10;
/** Adding x and y makes a new ten from the ones. */
export const addRegroups = (x: number, y: number) => ones(x) + ones(y) >= 10;
/** Taking y from x needs a ten broken into ones. */
export const subRegroups = (x: number, y: number) => ones(x) < ones(y);
const inRange = (v: number, r: readonly [number, number]) => v >= r[0] && v <= r[1];
const regroupOk = (p: Params, regroups: boolean) => p.regroup === 'either' || (p.regroup === 'with') === regroups;

/** Column-by-column subtraction that takes the smaller digit from the larger in each column. */
const smallerFromLarger = (x: number, y: number) => Math.abs(Math.floor(x / 10) - Math.floor(y / 10)) * 10 + Math.abs(ones(x) - ones(y));

type Combo = readonly number[];

function enumerate(p: Params): Combo[] {
  const out: Combo[] = [];
  const [nLo, nHi] = p.numbers;
  const whole = p.whole ?? [0, 0];
  switch (p.kind) {
    case 'twoDeliveries':
      for (let a = nLo; a <= nHi; a++) for (let b = nLo; b <= nHi; b++) if (inRange(a + b, whole) && inRange(a + b, p.answer) && regroupOk(p, addRegroups(a, b))) out.push([a, b]);
      break;
    case 'compare':
      for (let a = nLo; a <= nHi; a++)
        for (let b = nLo; b <= nHi; b++) {
          const d = Math.abs(a - b);
          if (a !== b && d !== a && d !== b && inRange(d, p.answer) && regroupOk(p, subRegroups(Math.max(a, b), Math.min(a, b)))) out.push([a, b]);
        }
      break;
    case 'capacityRemaining':
    case 'missingAmount':
      for (let w = whole[0]; w <= whole[1]; w++) for (let part = nLo; part <= nHi; part++) if (part < w && w - part !== part && inRange(w - part, p.answer) && regroupOk(p, subRegroups(w, part))) out.push([w, part]);
      break;
    case 'twoStep':
      for (let w = whole[0]; w <= whole[1]; w++)
        for (let a = nLo; a <= nHi; a++)
          for (let b = nLo; b <= nHi; b++) {
            const left = w - a - b;
            if (left >= 1 && left !== a && left !== b && inRange(left, p.answer) && regroupOk(p, addRegroups(a, b) || subRegroups(w, a + b))) out.push([w, a, b]);
          }
      break;
    case 'exactLoad':
      break;
  }
  return out;
}

// Enumeration is a pure function of the params: memoized by their canonical form.
const memo = new Map<string, Combo[]>();
function combos(p: Params): Combo[] {
  const key = JSON.stringify([p.kind, p.regroup, p.numbers, p.whole ?? null, p.answer]);
  let found = memo.get(key);
  if (!found) {
    found = enumerate(p);
    if (memo.size > 64) memo.clear();
    memo.set(key, found);
  }
  return found;
}

/** The sums of every non-empty set of `weights` (by bit mask). */
function subsetSums(weights: readonly number[]): number[] {
  const sums: number[] = [];
  for (let mask = 1; mask < 1 << weights.length; mask++) {
    let s = 0;
    for (let i = 0; i < weights.length; i++) if (mask & (1 << i)) s += weights[i] as number;
    sums.push(s);
  }
  return sums;
}

const EXACT_TRIES = 400;

function buildExactLoad(p: Params, rng: Rng): { parts: number[]; target: number; regroups: boolean } {
  const parts = p.parts as NonNullable<Params['parts']>;
  const whole = p.whole as [number, number];
  for (let attempt = 0; attempt < EXACT_TRIES; attempt++) {
    const count = rng.int(parts.count[0], parts.count[1]);
    const pick = rng.int(parts.pick[0], Math.min(parts.pick[1], count - 1));
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(rng.int(p.numbers[0], p.numbers[1]));
    const all = [...chosen];
    const load = all.slice(0, pick);
    const target = load.reduce((s, w) => s + w, 0);
    const onesSum = load.reduce((s, w) => s + ones(w), 0);
    if (!inRange(target, whole) || !inRange(target, p.answer) || !regroupOk(p, onesSum >= 10)) continue;
    if (subsetSums(all).filter((s) => s === target).length !== 1) continue;
    return { parts: [...all].sort((x, y) => x - y), target, regroups: onesSum >= 10 };
  }
  throw new ContentGenerationError('twoDigit exactLoad: no set of parts with exactly one load that hits the target (widen the ranges)');
}

const kindOf = (prompt: Record<string, unknown>): TwoDigitKind => {
  const k = prompt.kind;
  if (typeof k !== 'string' || !(TWO_DIGIT_KINDS as readonly string[]).includes(k)) throw new ContentGenerationError('twoDigit: prompt has no known kind');
  return k as TwoDigitKind;
};
const num = (prompt: Record<string, unknown>, key: string): number => {
  const v = prompt[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ContentGenerationError(`twoDigit: prompt.${key} is not a whole number`);
  return v;
};
/** The parts of an exact-load prompt, in order (ascending). */
export function partsOf(prompt: Record<string, unknown>): number[] {
  const raw = prompt.parts;
  if (typeof raw !== 'string' || !/^\d+(,\d+)*$/.test(raw)) throw new ContentGenerationError('twoDigit: prompt.parts is not a list of numbers');
  return raw.split(',').map(Number);
}

export const twoDigit = defineGenerator<Params>({
  id: 'quantity.twoDigit',
  version: 1,
  concept: 'twoDigit',
  misconceptions: Object.values(M),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    if (p.kind === 'exactLoad') {
      const { parts, target } = buildExactLoad(p, rng);
      // Other sums the parts can make, nearest first: the wrong totals a learner can put together.
      const others = [...new Set(subsetSums(parts))].filter((s) => s !== target).sort((x, y) => Math.abs(x - target) - Math.abs(y - target) || x - y);
      return {
        prompt: { kind: p.kind, target, parts: parts.join(','), partCount: parts.length },
        correct: target,
        distractors: others.map((value) => ({ value })),
      };
    }
    const all = combos(p);
    if (all.length === 0) throw new ContentGenerationError(`twoDigit ${p.kind}: no numbers fit the ranges and the regrouping asked for`);
    const c = rng.pick(all);
    const d: Distractor[] = [];
    let prompt: Record<string, string | number>;
    let correct: number;
    switch (p.kind) {
      case 'twoDeliveries': {
        const [a, b] = c as [number, number];
        correct = a + b;
        prompt = { kind: p.kind, a, b };
        if (addRegroups(a, b)) d.push({ value: correct - 10, misconception: M.forgotTheCarry });
        else d.push({ value: correct + 10, misconception: M.miscountedTens }, { value: correct - 10, misconception: M.miscountedTens });
        d.push({ value: Math.abs(a - b), misconception: M.subtractedInsteadOfAdded }, { value: Math.max(a, b), misconception: M.answeredWithAGiven }, { value: correct + 1 }, { value: correct - 1 });
        break;
      }
      case 'compare': {
        const [a, b] = c as [number, number];
        const [hi, lo] = [Math.max(a, b), Math.min(a, b)];
        correct = hi - lo;
        prompt = { kind: p.kind, a, b };
        d.push(...subtractionSlips(hi, lo, correct), { value: hi, misconception: M.answeredWithAGiven }, { value: a + b, misconception: M.addedInsteadOfSubtracted }, { value: correct + 1 }, { value: correct - 1 });
        break;
      }
      case 'capacityRemaining':
      case 'missingAmount': {
        const [whole, part] = c as [number, number];
        correct = whole - part;
        prompt = p.kind === 'capacityRemaining' ? { kind: p.kind, capacity: whole, loaded: part } : { kind: p.kind, order: whole, have: part };
        d.push(...subtractionSlips(whole, part, correct), { value: whole + part, misconception: M.addedInsteadOfSubtracted }, { value: whole, misconception: M.answeredWithAGiven }, { value: part, misconception: M.answeredWithAGiven }, { value: correct + 1 }, { value: correct - 1 });
        break;
      }
      case 'twoStep': {
        const [capacity, a, b] = c as [number, number, number];
        correct = capacity - a - b;
        prompt = { kind: p.kind, capacity, a, b };
        d.push({ value: capacity - a, misconception: M.stoppedAfterOneStep }, { value: capacity - b, misconception: M.stoppedAfterOneStep }, { value: a + b, misconception: M.stoppedAfterOneStep });
        // 10 over: a borrowed ten kept (second step), or a carry left out of the loads (first step). Both: no single cause.
        const borrow = subRegroups(capacity, a + b);
        const carry = addRegroups(a, b);
        if (borrow || carry) d.push(borrow && carry ? { value: correct + 10 } : { value: correct + 10, misconception: borrow ? M.forgotTheBorrow : M.forgotTheCarry });
        d.push({ value: correct + 1 }, { value: correct - 1 });
        break;
      }
    }
    return { prompt, correct, distractors: d.filter((x) => typeof x.value === 'number' && x.value >= 0 && x.value !== correct) };
  },

  solve(prompt) {
    switch (kindOf(prompt)) {
      case 'twoDeliveries':
        return num(prompt, 'a') + num(prompt, 'b');
      case 'compare':
        return Math.abs(num(prompt, 'a') - num(prompt, 'b'));
      case 'capacityRemaining':
        return num(prompt, 'capacity') - num(prompt, 'loaded');
      case 'missingAmount':
        return num(prompt, 'order') - num(prompt, 'have');
      case 'twoStep':
        return num(prompt, 'capacity') - num(prompt, 'a') - num(prompt, 'b');
      case 'exactLoad': {
        const target = num(prompt, 'target');
        const parts = partsOf(prompt);
        if (parts.length !== num(prompt, 'partCount')) throw new ContentGenerationError('twoDigit: partCount does not match the parts');
        const hits = subsetSums(parts).filter((s) => s === target).length;
        if (hits !== 1) throw new ContentGenerationError(`twoDigit: ${hits} loads hit the target ${target}, not exactly one`);
        return target;
      }
    }
  },

  countVariants: (p) => (p.kind === 'exactLoad' ? undefined : combos(p).length),
});

/**
 * The likely slips when taking `part` from `whole` (answer `correct`). When the ones differ by five the
 * two regrouping slips give the same number: it then has two likely causes, so it carries no tag.
 */
function subtractionSlips(whole: number, part: number, correct: number): Distractor[] {
  if (subRegroups(whole, part)) {
    const flipped = smallerFromLarger(whole, part);
    if (flipped === correct + 10) return [{ value: flipped }];
    return [{ value: flipped, misconception: M.smallerFromLarger }, { value: correct + 10, misconception: M.forgotTheBorrow }];
  }
  return [{ value: correct + 10, misconception: M.miscountedTens }, { value: correct - 10, misconception: M.miscountedTens }];
}
