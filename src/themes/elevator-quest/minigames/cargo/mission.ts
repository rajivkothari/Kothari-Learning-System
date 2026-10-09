// Cargo Commander: what one delivery is, read from the engine's item. Pure: no React, no runtime.
//
// The engine's item carries the givens (prompt fields) and checks the answer. This module only turns
// the givens into a world: crates on the dock, cargo already aboard, a capacity line, order slips, a
// pallet to match. It never decides whether an answer is right (the runtime does, on WEIGH). It does
// know where the load SHOULD come to on the scale (`goal`), because a real scale shows whether a
// freight is over its line or short of its order; the screen uses that only after the runtime has
// said a WEIGH was not right, for the direction words ("Too heavy." / "Not enough yet.").
//
// The answer value per kind (what WEIGH submits, `committedValue` in cargoState.ts):
//   exactLoad          the crates chosen (their total); the target is given
//   capacityRemaining  the filler (10 kg sacks and 1 kg boxes) put on top of the load already aboard
//   missingAmount      the filler put on top of what the order already has
//   twoDeliveries      the filler: both orders in one trip, so the whole load
//   compare            the filler added to the lighter pallet to make it match the heavier one
//   twoStep            the filler put on top of two orders already aboard, up to the capacity line

export const CARGO_KINDS = ['exactLoad', 'capacityRemaining', 'missingAmount', 'twoDeliveries', 'compare', 'twoStep'] as const;
export type CargoKind = (typeof CARGO_KINDS)[number];

/** Kinds where the learner builds the answer from 10 kg sacks and 1 kg boxes (tens and ones): every kind but exactLoad. */
export const isFillerKind = (k: CargoKind) => k !== 'exactLoad';

/** The two filler pieces: a sack is a ten, a box is a one. */
export const SACK = 10;
export const BOX = 1;
/** The most of each the freight floor takes (what the screen can draw at a readable size). */
export const MAX_SACKS = 15;
export const MAX_BOXES = 19;

export interface CargoCrate {
  id: string;
  weight: number;
}

/** The engine item as Cargo Commander reads it (a structural subset of the session's challenge view). */
export interface CargoItemLike {
  activityId: string;
  concept: string;
  prompt: Readonly<Record<string, number | string | boolean>>;
  /** Answer domain of a value answer, when the view carries it. Loads never go past it. */
  answer?: { mode: string; min?: number; max?: number } | null | undefined;
}

export interface CargoMission {
  kind: CargoKind;
  /** Stable id of this delivery: the save is only resumed onto the same delivery. */
  key: string;
  /** The givens, by name, for the hints' placeholders. Never the answer. */
  givens: Readonly<Record<string, number>>;
  /** The item's prompt as the engine gave it (the brief is filled from it: content/minigames.ts cargoBrief). */
  prompt: CargoItemLike['prompt'];
  /** exactLoad: the crates on the dock, in the item's order. Empty for the filler kinds. */
  crates: readonly CargoCrate[];
  /** Weight already on the scale that the learner does not move (cargo aboard, an order's start, the lighter pallet). */
  base: number;
  /** That weight as the pallets the learner sees in the freight (one, or two for twoStep), each with its number. */
  basePallets: readonly number[];
  /** What the scale reads when the load is right. Used for the direction words after a miss, never shown for twoDeliveries. */
  goal: number;
  /** A mark on the gauge at a given number: the target, the order, the other pallet. Null when there is none to show. */
  mark: { value: number; role: 'target' | 'order' | 'pallet' } | null;
  /** The freight's capacity line (a given), when the delivery has one. */
  capacity: number | null;
  /** twoDeliveries: the two order slips. */
  orders: readonly [number, number] | null;
  /** compare: the pallet that stays as it is (heavier) and the one the learner adds to (lighter). */
  pallets: { heavy: number; light: number } | null;
  /** The gauge's top (a multiple of 50), chosen from givens so it never points at the answer. */
  scaleMax: number;
  /** The committed value never leaves this range (the activity's answer domain, if known). */
  range: { min: number; max: number };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function pick(prompt: CargoItemLike['prompt'], names: readonly string[]): number | null {
  for (const n of names) {
    const v = num(prompt[n]);
    if (v !== null) return v;
  }
  return null;
}

/** The kind: a `kind` prompt field, else the concept (exact, or its last dotted part). */
export function cargoKindOf(item: Pick<CargoItemLike, 'concept' | 'prompt'>): CargoKind | null {
  const fromPrompt = item.prompt.kind;
  if (typeof fromPrompt === 'string' && (CARGO_KINDS as readonly string[]).includes(fromPrompt)) return fromPrompt as CargoKind;
  const tail = item.concept.split('.').pop() ?? '';
  for (const k of CARGO_KINDS) if (item.concept === k || tail === k) return k;
  return null;
}

/** exactLoad's crates: a list field (the generator's `parts`, "12,23,35") or numbered fields (crate1, crate2, ...). */
function cratesOf(prompt: CargoItemLike['prompt']): number[] {
  for (const name of ['parts', 'crates', 'weights']) {
    const v = prompt[name];
    if (typeof v === 'string') {
      const parts = v.split(/[\s,;|]+/).filter(Boolean).map(Number);
      if (parts.length > 0 && parts.every((n) => Number.isFinite(n) && n > 0)) return parts;
    }
  }
  const numbered: number[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const v = pick(prompt, [`crate${i}`, `weight${i}`, `c${i}`]);
    if (v === null) break;
    numbered.push(v);
  }
  return numbered;
}

/**
 * A delivery's save key, stable across visits, reloads and crashes: the mission step, the item's
 * place in it and the item's signature (the session's challenge key), all read from the runtime's
 * checkpoint. Two deliveries with the same givens in a row are different steps, so they never share
 * a save; a fresh item after several misses has a new signature. Never a count kept by one visit.
 */
export const deliveryKey = (c: { stepId: string; item: { index: number }; key: string }) => `${c.stepId}#${c.item.index}#${c.key}`;

/** The gauge's top: the smallest of 100, 150, 200 (then 50s) that leaves room above everything shown. */
function scaleFor(highest: number): number {
  let top = 100;
  while (top < highest + 10) top += 50;
  return top;
}

/**
 * The delivery for an engine item, or null when the item is not a cargo item this screen can draw
 * (the screen then says so calmly and offers BACK, never a broken scale).
 * `key` names this delivery for the save (deliveryKey).
 */
export function missionFromItem(item: CargoItemLike, key: string): CargoMission | null {
  const kind = cargoKindOf(item);
  if (!kind) return null;
  const p = item.prompt;
  const spec = item.answer && item.answer.mode === 'value' && typeof item.answer.min === 'number' && typeof item.answer.max === 'number' ? { min: item.answer.min, max: item.answer.max } : null;
  const filler = { min: 1, max: MAX_SACKS * SACK + MAX_BOXES * BOX };
  const clampRange = (r: { min: number; max: number }) => (spec ? { min: Math.max(r.min, spec.min), max: Math.min(r.max, spec.max) } : r);
  const base = { prompt: item.prompt, crates: [] as CargoCrate[], orders: null, pallets: null, capacity: null, mark: null, basePallets: [] as number[] } as const;
  switch (kind) {
    case 'exactLoad': {
      const target = pick(p, ['target', 'total', 'goal']);
      const weights = cratesOf(p);
      if (target === null || weights.length === 0) return null;
      const crates = weights.map((weight, i) => ({ id: `c${i + 1}`, weight }));
      const all = weights.reduce((a, b) => a + b, 0);
      return { ...base, kind, key, givens: { target }, crates, base: 0, goal: target, mark: { value: target, role: 'target' }, scaleMax: scaleFor(target + 20), range: clampRange({ min: 1, max: all }) };
    }
    case 'capacityRemaining': {
      const capacity = pick(p, ['capacity', 'max', 'limit']);
      const loaded = pick(p, ['loaded', 'aboard', 'have']);
      if (capacity === null || loaded === null) return null;
      return { ...base, kind, key, givens: { capacity, loaded }, base: loaded, basePallets: [loaded], goal: capacity, capacity, scaleMax: scaleFor(capacity), range: clampRange(filler) };
    }
    case 'missingAmount': {
      const order = pick(p, ['order', 'target', 'total']);
      const have = pick(p, ['have', 'loaded', 'start']);
      if (order === null || have === null) return null;
      return { ...base, kind, key, givens: { order, have }, base: have, basePallets: [have], goal: order, mark: { value: order, role: 'order' }, scaleMax: scaleFor(order), range: clampRange(filler) };
    }
    case 'twoDeliveries': {
      const a = pick(p, ['a', 'orderA', 'first']);
      const b = pick(p, ['b', 'orderB', 'second']);
      if (a === null || b === null) return null;
      // The scale's top comes from the bigger order alone (twice it), so it never hints at the total.
      return { ...base, kind, key, givens: { a, b }, base: 0, goal: a + b, orders: [a, b], scaleMax: scaleFor(2 * Math.max(a, b)), range: clampRange(filler) };
    }
    case 'compare': {
      const a = pick(p, ['a', 'left', 'first']);
      const b = pick(p, ['b', 'right', 'second']);
      if (a === null || b === null) return null;
      const heavy = Math.max(a, b);
      const light = Math.min(a, b);
      return { ...base, kind, key, givens: { a, b, heavy, light }, base: light, basePallets: [light], goal: heavy, mark: { value: heavy, role: 'pallet' }, pallets: { heavy, light }, scaleMax: scaleFor(heavy), range: clampRange(filler) };
    }
    case 'twoStep': {
      // Two orders are already aboard; fill the rest of the freight up to its capacity line.
      const capacity = pick(p, ['capacity', 'max', 'limit']);
      const a = pick(p, ['a', 'orderA', 'first']);
      const b = pick(p, ['b', 'orderB', 'second']);
      if (capacity === null || a === null || b === null) return null;
      return { ...base, kind, key, givens: { capacity, a, b }, base: a + b, basePallets: [a, b], goal: capacity, capacity, scaleMax: scaleFor(capacity), range: clampRange(filler) };
    }
  }
}
