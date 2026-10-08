// Two-digit quantities (M9): arithmetic, regrouping as asked, the unique exact load, and the slips.
import type { GeneratedItem } from '../../content/item';
import { evaluateResponse } from '../../evaluation/evaluate';
import { canonicalJson } from '../../random/hash';
import { SHIPPED_PACK } from '../../testing/support';
import { checkGeneratedItem } from '../../validation/validateContent';
import { generateItem } from '../generator';
import { BUILT_IN_GENERATORS } from '../registry';
import { TWO_DIGIT_MISCONCEPTIONS as M, addRegroups, partsOf, subRegroups, twoDigit } from './twoDigit';

const TAGS = new Set<string>(Object.values(M));
const many = (p: unknown, n = 300) => Array.from({ length: n }, (_, i) => generateItem(twoDigit, p, `s${i}`));
const answerOf = (item: GeneratedItem) => item.response.options.find((o) => o.correct)!.value as number;
const tagOf = (item: GeneratedItem, value: number) => {
  const r = evaluateResponse(item, { mode: 'value', value });
  return r.valid && !r.correct ? (r.misconception ?? null) : 'correct';
};

const base = { numbers: [10, 99] as [number, number], answer: [1, 199] as [number, number], optionCount: 4 };
const P = {
  twoDeliveries: { ...base, kind: 'twoDeliveries', whole: [20, 150] },
  capacityRemaining: { ...base, kind: 'capacityRemaining', whole: [30, 99] },
  missingAmount: { ...base, kind: 'missingAmount', whole: [30, 99] },
  compare: { ...base, kind: 'compare' },
  twoStep: { ...base, kind: 'twoStep', numbers: [10, 39], whole: [50, 99] },
  exactLoad: { ...base, kind: 'exactLoad', numbers: [10, 59], whole: [30, 150], parts: { count: [3, 5], pick: [2, 3] } },
} as const;
const ALL = Object.values(P);
const with_ = (p: (typeof ALL)[number], regroup: 'with' | 'without' | 'either') => ({ ...p, regroup });

const SHIPPED = SHIPPED_PACK.activities.filter((a) => a.generator.id === 'quantity.twoDigit');

/** The answer, recomputed from the prompt by the definition of each kind. */
function expected(item: GeneratedItem): number {
  const q = item.prompt as Record<string, number>;
  switch (item.prompt.kind) {
    case 'twoDeliveries':
      return q.a! + q.b!;
    case 'compare':
      return Math.abs(q.a! - q.b!);
    case 'capacityRemaining':
      return q.capacity! - q.loaded!;
    case 'missingAmount':
      return q.order! - q.have!;
    case 'twoStep':
      return q.capacity! - q.a! - q.b!;
    default:
      return q.target!;
  }
}

/** Whether the item's operation crosses a ten (the definition the params' regroup refers to). */
function regroups(item: GeneratedItem): boolean {
  const q = item.prompt as Record<string, number>;
  switch (item.prompt.kind) {
    case 'twoDeliveries':
      return addRegroups(q.a!, q.b!);
    case 'compare':
      return subRegroups(Math.max(q.a!, q.b!), Math.min(q.a!, q.b!));
    case 'capacityRemaining':
      return subRegroups(q.capacity!, q.loaded!);
    case 'missingAmount':
      return subRegroups(q.order!, q.have!);
    case 'twoStep':
      return addRegroups(q.a!, q.b!) || subRegroups(q.capacity!, q.a! + q.b!);
    default:
      return false; // exact loads: checked against their chosen parts below
  }
}

/** The sets of parts (by index) that add up to `target`. */
function loadsHitting(parts: number[], target: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << parts.length; mask++) {
    const idx = parts.map((_, i) => i).filter((i) => mask & (1 << i));
    if (idx.reduce((s, i) => s + parts[i]!, 0) === target) out.push(idx);
  }
  return out;
}

describe('quantity.twoDigit@1', () => {
  it('is registered with the built-in generators', () => {
    expect(BUILT_IN_GENERATORS.get('quantity.twoDigit@1')).toBe(twoDigit);
  });

  it('gives the answer each kind defines, with every number inside its range', () => {
    for (const p of ALL) {
      for (const item of many(with_(p, 'either'))) {
        const q = item.prompt as Record<string, number | string>;
        expect(q.kind).toBe(p.kind);
        expect(answerOf(item)).toBe(expected(item));
        expect(answerOf(item)).toBeGreaterThanOrEqual(p.answer[0]);
        // Never right by accident: the answer is none of the numbers given.
        if (p.kind !== 'exactLoad') for (const [k, v] of Object.entries(q)) if (typeof v === 'number') expect({ k, same: v === answerOf(item) }).toEqual({ k, same: false });
        expect(answerOf(item)).toBeLessThanOrEqual(p.answer[1]);
        const parts = p.kind === 'exactLoad' ? partsOf(q) : (['a', 'b', 'loaded', 'have'] as const).filter((k) => k in q).map((k) => q[k] as number);
        for (const n of parts) expect(n >= p.numbers[0] && n <= p.numbers[1]).toBe(true);
        const whole = q.capacity ?? q.order ?? q.target ?? (p.kind === 'twoDeliveries' ? (q.a as number) + (q.b as number) : null);
        if ('whole' in p && whole !== null) expect((whole as number) >= p.whole[0] && (whole as number) <= p.whole[1]).toBe(true);
      }
    }
  });

  it('regroups exactly as asked: "with" always crosses a ten, "without" never does, "either" gives both', () => {
    for (const p of ALL.filter((x) => x.kind !== 'exactLoad')) {
      expect(many(with_(p, 'with')).every(regroups)).toBe(true);
      expect(many(with_(p, 'without')).some(regroups)).toBe(false);
      const either = many(with_(p, 'either')).map(regroups);
      expect(either.includes(true) && either.includes(false)).toBe(true);
    }
  });

  it('an exact load has exactly one set of parts that hits the target, and that set regroups as asked', () => {
    for (const regroup of ['with', 'without'] as const) {
      for (const item of many(with_(P.exactLoad, regroup))) {
        const parts = partsOf(item.prompt);
        expect(parts).toEqual([...parts].sort((x, y) => x - y));
        expect(new Set(parts).size).toBe(parts.length);
        expect(item.prompt.partCount).toBe(parts.length);
        expect(parts.length).toBeGreaterThanOrEqual(3);
        const hits = loadsHitting(parts, item.prompt.target as number);
        expect(hits).toHaveLength(1);
        const [load] = hits as [number[]];
        expect(load.length >= 2 && load.length <= 3 && load.length < parts.length).toBe(true);
        const ones = load.reduce((s, i) => s + (parts[i]! % 10), 0);
        expect(ones >= 10).toBe(regroup === 'with');
        // The other loads the parts can make are the wrong values; none of them is the target.
        for (const o of item.response.options.filter((x) => !x.correct)) expect(o.value).not.toBe(item.prompt.target);
      }
    }
  });

  it('tags the regrouping slips: a carry left out, the smaller digit taken from the larger, a borrowed ten kept', () => {
    for (const item of many(with_(P.twoDeliveries, 'with'))) expect(tagOf(item, answerOf(item) - 10)).toBe(M.forgotTheCarry);
    for (const kind of [P.capacityRemaining, P.missingAmount] as const) {
      for (const item of many(with_(kind, 'with'))) {
        const q = item.prompt as Record<string, number>;
        const [whole, part] = kind.kind === 'capacityRemaining' ? [q.capacity!, q.loaded!] : [q.order!, q.have!];
        const flipped = Math.abs(Math.floor(whole / 10) - Math.floor(part / 10)) * 10 + Math.abs((whole % 10) - (part % 10));
        if (flipped === answerOf(item) + 10) {
          // Ones that differ by five: both slips give this number, so it has no single likely cause.
          expect(tagOf(item, flipped)).toBe(flipped === whole || flipped === part ? M.answeredWithAGiven : null);
        } else {
          expect(tagOf(item, flipped)).toBe(M.smallerFromLarger);
          expect(tagOf(item, answerOf(item) + 10)).toBe(M.forgotTheBorrow);
        }
        expect(tagOf(item, whole + part)).toBe(M.addedInsteadOfSubtracted);
      }
    }
    for (const item of many(with_(P.twoStep, 'either'))) {
      const q = item.prompt as Record<string, number>;
      if (q.capacity! - q.a! !== answerOf(item)) expect(tagOf(item, q.capacity! - q.a!)).toBe(M.stoppedAfterOneStep);
    }
    for (const item of many(with_(P.twoDeliveries, 'without'))) expect([M.miscountedTens, M.subtractedInsteadOfAdded, M.answeredWithAGiven]).toContain(tagOf(item, answerOf(item) - 10));
  });

  it('is deterministic, structurally valid, and never tags the answer', () => {
    for (const p of [...ALL.map((x) => with_(x, 'either')), ...SHIPPED.map((a) => a.params)]) {
      for (const item of many(p, 120)) {
        expect(canonicalJson(generateItem(twoDigit, p, item.seed))).toBe(canonicalJson(item));
        expect(checkGeneratedItem(item, twoDigit, TAGS)).toEqual([]);
        for (const d of item.diagnostics) expect(d.value).not.toBe(answerOf(item));
      }
    }
  });

  it('counts its variants exactly (every combination is reached, none beyond)', () => {
    const small = { kind: 'twoDeliveries', regroup: 'with', numbers: [17, 23], whole: [20, 60], answer: [1, 199], optionCount: 3 };
    const n = twoDigit.countVariants(small)!;
    const seen = new Set(many(small, 3000).map((i) => i.signature));
    expect(seen.size).toBe(n);
    expect(twoDigit.countVariants(with_(P.exactLoad, 'with'))).toBeUndefined();
  });

  it('the shipped activities keep their answers in their answer domain and regroup as their skill says', () => {
    for (const a of SHIPPED) {
      const params = a.params as { regroup: string; kind: string };
      for (const item of many(params, 150)) {
        const answer = answerOf(item);
        if (a.answer.mode !== 'value') throw new Error('cargo answers are values');
        expect(answer >= a.answer.min && answer <= a.answer.max).toBe(true);
        const skillSaysRegroup = a.skills.some((s) => s.endsWith('.regroup'));
        const skillSaysNot = a.skills.some((s) => s.endsWith('.noRegroup'));
        if (skillSaysRegroup) expect(params.regroup).toBe('with');
        if (skillSaysNot) expect(params.regroup).toBe('without');
      }
    }
  });

  it('refuses params that cannot work', () => {
    const issues = (p: unknown) => twoDigit.checkParams(p).map((i) => i.message).join(' | ');
    expect(issues({ ...P.exactLoad, regroup: 'with', parts: undefined })).toMatch(/parts is required/);
    expect(issues({ ...P.twoDeliveries, regroup: 'with', parts: { count: [3, 3], pick: [2, 2] } })).toMatch(/parts is required/);
    expect(issues({ ...P.compare, regroup: 'with', whole: [20, 99] })).toMatch(/whole is required/);
    expect(issues({ ...P.capacityRemaining, regroup: 'with', whole: undefined })).toMatch(/whole is required/);
    expect(issues({ ...P.exactLoad, regroup: 'with', parts: { count: [3, 4], pick: [3, 3] } })).toMatch(/fewer than all/);
    expect(issues({ ...P.twoStep, regroup: 'with', numbers: [10, 99], whole: [10, 199] })).toMatch(/combinations/);
    expect(issues({ ...P.compare, regroup: 'with', numbers: [5, 99] })).not.toBe('');
    expect(() => generateItem(twoDigit, { ...P.twoDeliveries, regroup: 'with', numbers: [10, 14], whole: [20, 28] }, 's')).toThrow(/no numbers fit/);
  });

  it('declares only quantity.* tags', () => {
    for (const tag of twoDigit.misconceptions) expect(tag).toMatch(/^quantity\.[a-zA-Z]+$/);
  });
});
