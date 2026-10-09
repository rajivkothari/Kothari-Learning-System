// Cargo Commander's load, gauge and WEIGH rules. Pure: no React, no runtime, no clock.
//
// Loading and unloading are free exploration: nothing here is evidence and nothing reaches the
// session. WEIGH is the only answer: the FIRST weigh of a load gives the value to submit. Weighing a
// value already weighed for this delivery only shows the readout again (the same answer is never
// sent twice, so a learner who puts a box back and weighs again is not counted twice). An empty load
// can never be weighed: an answer is never read from nothing.
//
// The gauge shows the load at once while loading (its needle and its tens), with the capacity line and
// the target mark; the exact number appears only on WEIGH (`readout`). Changing the load after a weigh
// clears the readout: the scale has to weigh the new load.
import { z } from 'zod';

import { BOX, MAX_BOXES, MAX_SACKS, SACK, isFillerKind, type CargoMission } from './mission';

export interface CargoLoad {
  /** exactLoad: crate ids in the freight, in the order loaded. */
  crates: readonly string[];
  /** Filler kinds: 10 kg sacks and 1 kg boxes in the freight. */
  sacks: number;
  boxes: number;
}

export type WeighResult = 'right' | 'heavy' | 'light' | 'notRight';

export interface Readout {
  /** What the scale reads (everything on it, the cargo already aboard included). */
  total: number;
  /** The value that was submitted for this load (the crates, or the filler). */
  value: number;
  /** Null while the runtime has not answered yet. */
  result: WeighResult | null;
}

export type CargoPhase = 'loading' | 'weighing' | 'shipping' | 'shipped';

export interface CargoState {
  key: string;
  load: CargoLoad;
  phase: CargoPhase;
  /** Values already weighed (submitted) for this delivery, oldest first. */
  weighed: readonly number[];
  /** The scale's exact reading after a WEIGH, until the load changes. */
  readout: Readout | null;
  /** Load changes after the first WEIGH. Recorded for the playtest log; never a score, never a penalty. */
  revisions: number;
  /** SHOW ME was used on this delivery (its load was put in for the learner). */
  shown: boolean;
}

export const EMPTY_LOAD: CargoLoad = { crates: [], sacks: 0, boxes: 0 };

export function initialCargo(mission: CargoMission): CargoState {
  return { key: mission.key, load: EMPTY_LOAD, phase: 'loading', weighed: [], readout: null, revisions: 0, shown: false };
}

// ---- Reading a load ----

export const crateTotal = (mission: CargoMission, load: CargoLoad) => load.crates.reduce((sum, id) => sum + (mission.crates.find((c) => c.id === id)?.weight ?? 0), 0);
export const fillerTotal = (load: CargoLoad) => load.sacks * SACK + load.boxes * BOX;

/** What the scale reads: everything in the freight, the cargo already aboard included. */
export const scaleTotal = (mission: CargoMission, load: CargoLoad) => mission.base + (isFillerKind(mission.kind) ? fillerTotal(load) : crateTotal(mission, load));

/** The answer value this load gives on WEIGH, per kind (mission.ts): the crates chosen, or the filler. */
export const committedValue = (mission: CargoMission, load: CargoLoad) => (isFillerKind(mission.kind) ? fillerTotal(load) : crateTotal(mission, load));

/** Is the load on the scale above, below or at what the givens ask for. World physics, not scoring. */
export function direction(mission: CargoMission, load: CargoLoad): 'heavy' | 'light' | 'even' {
  const t = scaleTotal(mission, load);
  return t > mission.goal ? 'heavy' : t < mission.goal ? 'light' : 'even';
}

export interface GaugeView {
  /** The needle's place, 0..1 of the dial (clamped). */
  fraction: number;
  /** Whole tens on the scale now (the tens lamps). */
  tens: number;
  /** The scale's top. */
  max: number;
  /** Over the freight's capacity line: a genuine warning (yellow), never a wrong-answer signal. */
  over: boolean;
  capacity: number | null;
  mark: CargoMission['mark'];
}

export function gaugeView(mission: CargoMission, load: CargoLoad): GaugeView {
  const total = scaleTotal(mission, load);
  return {
    fraction: Math.max(0, Math.min(1, total / mission.scaleMax)),
    tens: Math.floor(Math.min(total, mission.scaleMax) / 10),
    max: mission.scaleMax,
    over: mission.capacity !== null && total > mission.capacity,
    capacity: mission.capacity,
    mark: mission.mark,
  };
}

// ---- Changing the load ----

export type CargoAction = { type: 'loadCrate'; id: string } | { type: 'unloadCrate'; id: string } | { type: 'addSack' } | { type: 'removeSack' } | { type: 'addBox' } | { type: 'removeBox' };

/** Whether an action can happen now (the screen dims a pile that is empty or full). */
export function canApply(mission: CargoMission, state: CargoState, action: CargoAction): boolean {
  if (state.phase !== 'loading') return false;
  const filler = isFillerKind(mission.kind);
  const { load } = state;
  const value = committedValue(mission, load);
  switch (action.type) {
    case 'loadCrate': {
      const crate = mission.crates.find((c) => c.id === action.id);
      return !filler && crate !== undefined && !load.crates.includes(action.id) && value + crate.weight <= mission.range.max;
    }
    case 'unloadCrate':
      return !filler && load.crates.includes(action.id);
    case 'addSack':
      return filler && load.sacks < MAX_SACKS && value + SACK <= mission.range.max;
    case 'removeSack':
      return filler && load.sacks > 0;
    case 'addBox':
      return filler && load.boxes < MAX_BOXES && value + BOX <= mission.range.max;
    case 'removeBox':
      return filler && load.boxes > 0;
  }
}

function nextLoad(load: CargoLoad, action: CargoAction): CargoLoad {
  switch (action.type) {
    case 'loadCrate':
      return { ...load, crates: [...load.crates, action.id] };
    case 'unloadCrate':
      return { ...load, crates: load.crates.filter((id) => id !== action.id) };
    case 'addSack':
      return { ...load, sacks: load.sacks + 1 };
    case 'removeSack':
      return { ...load, sacks: load.sacks - 1 };
    case 'addBox':
      return { ...load, boxes: load.boxes + 1 };
    case 'removeBox':
      return { ...load, boxes: load.boxes - 1 };
  }
}

/** Apply a loading action. Returns the same state object when nothing can change (a tap on an empty pile). */
export function applyAction(mission: CargoMission, state: CargoState, action: CargoAction): CargoState {
  if (!canApply(mission, state, action)) return state;
  return { ...state, load: nextLoad(state.load, action), readout: null, revisions: state.weighed.length > 0 ? state.revisions + 1 : state.revisions };
}

// ---- WEIGH ----

/** WEIGH is offered when the load is in the answer range (never empty) and nothing is in flight. */
export function canWeigh(mission: CargoMission, state: CargoState): boolean {
  if (state.phase !== 'loading') return false;
  const v = committedValue(mission, state.load);
  return v >= Math.max(1, mission.range.min) && v <= mission.range.max;
}

export interface WeighStep {
  state: CargoState;
  /** The value to submit, or null: nothing to send (already weighed, or WEIGH not possible). */
  submit: number | null;
}

/**
 * Press WEIGH. A load whose value was already weighed shows its reading again without sending
 * anything; a new value moves to "weighing" and must be sent (then `weighResult`).
 */
export function weigh(mission: CargoMission, state: CargoState): WeighStep {
  if (!canWeigh(mission, state)) return { state, submit: null };
  const value = committedValue(mission, state.load);
  const total = scaleTotal(mission, state.load);
  if (state.weighed.includes(value)) {
    // Only a value the runtime refused is ever in `weighed` while loading (a right one ships).
    return { state: { ...state, readout: readingAgain(mission, state.load) }, submit: null };
  }
  return { state: { ...state, phase: 'weighing', weighed: [...state.weighed, value], readout: { total, value, result: null } }, submit: value };
}

/** The reading of a load already weighed and refused: its total and its direction, never sent again. */
function readingAgain(mission: CargoMission, load: CargoLoad): Readout {
  const d = direction(mission, load);
  return { total: scaleTotal(mission, load), value: committedValue(mission, load), result: d === 'even' ? 'notRight' : d };
}

/** The runtime's answer to a WEIGH. Right: the freight ships. Not right: the reading stays with a direction. */
export function weighResult(mission: CargoMission, state: CargoState, correct: boolean): CargoState {
  if (state.phase !== 'weighing' || !state.readout) return state;
  if (correct) return { ...state, phase: 'shipping', readout: { ...state.readout, result: 'right' } };
  const d = direction(mission, state.load);
  return { ...state, phase: 'loading', readout: { ...state.readout, result: d === 'even' ? 'notRight' : d } };
}

/** The submit did not go through (storage trouble): nothing was answered, so the value may be weighed again. */
export function weighFailed(state: CargoState): CargoState {
  if (state.phase !== 'weighing') return state;
  return { ...state, phase: 'loading', weighed: state.weighed.slice(0, -1), readout: null };
}

/** The doors have closed and the freight has gone: the next delivery waits for the learner (no timer). */
export const shipped = (state: CargoState): CargoState => (state.phase === 'shipping' ? { ...state, phase: 'shipped' } : state);

// ---- SHOW ME ----

/**
 * The load that gives `value` (a demonstrated help step's answer): the crates that add up to it, or
 * the tens as sacks and the ones as boxes. Null when no load can (content mismatch).
 */
export function loadFor(mission: CargoMission, value: number): CargoLoad | null {
  if (isFillerKind(mission.kind)) {
    if (!Number.isInteger(value) || value < 0) return null;
    const sacks = Math.floor(value / SACK);
    const boxes = value - sacks * SACK;
    return sacks <= MAX_SACKS ? { crates: [], sacks, boxes } : null;
  }
  // The smallest set of crates that adds up to the value (the generator makes it unique).
  const n = mission.crates.length;
  let best: string[] | null = null;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let sum = 0;
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        const c = mission.crates[i]!;
        sum += c.weight;
        ids.push(c.id);
      }
    }
    if (sum === value && (!best || ids.length < best.length)) best = ids;
  }
  return best ? { crates: best, sacks: 0, boxes: 0 } : null;
}

/** SHOW ME: the right load goes into the freight for the learner, who still presses WEIGH. */
export function demonstrate(mission: CargoMission, state: CargoState, value: number): CargoState {
  if (state.phase !== 'loading') return state;
  const load = loadFor(mission, value);
  if (!load) return { ...state, shown: true };
  return { ...state, load, readout: null, shown: true };
}

// ---- Saving and resuming (gameplay only, never evidence) ----

const SavedSchema = z
  .object({
    v: z.literal(1),
    key: z.string().min(1),
    load: z.object({ crates: z.array(z.string()).max(12), sacks: z.number().int().min(0).max(MAX_SACKS), boxes: z.number().int().min(0).max(MAX_BOXES) }).strict(),
    phase: z.enum(['loading', 'weighing', 'shipping', 'shipped']),
    weighed: z.array(z.number().int()).max(50),
    revisions: z.number().int().min(0),
    shown: z.boolean(),
  })
  .strict();
export type SavedCargo = z.infer<typeof SavedSchema>;

export function saveCargo(state: CargoState): SavedCargo {
  return { v: 1, key: state.key, load: { crates: [...state.load.crates], sacks: state.load.sacks, boxes: state.load.boxes }, phase: state.phase, weighed: [...state.weighed], revisions: state.revisions, shown: state.shown };
}

/**
 * Resume a saved game onto the delivery on screen, or start it fresh. Only the same delivery resumes;
 * a load that no longer fits it (another item, a crate that is not there, past the range) restarts
 * it empty. A delivery that was shipping or shipped is not resumed: its item was answered, the
 * runtime has moved on.
 *
 * A WEIGH that was in flight when the app stopped (saved as "weighing") is settled from `misses`,
 * the runtime's own count of wrong answers on this item (the challenge's wrongTries): when the
 * runtime counted it (the commit landed before the app stopped) its value stays weighed, so weighing
 * that load again only shows its reading and is never sent, and never counted, a second time; when it
 * did not, its value is forgotten and the learner can weigh it again. Without `misses` an in-flight
 * value is always forgotten. A load whose value was already weighed comes back with its reading.
 */
export function restoreCargo(raw: unknown, mission: CargoMission, misses?: number): CargoState {
  const fresh = initialCargo(mission);
  const parsed = SavedSchema.safeParse(raw);
  if (!parsed.success) return fresh;
  const s = parsed.data;
  if (s.key !== mission.key || s.phase === 'shipping' || s.phase === 'shipped') return fresh;
  const filler = isFillerKind(mission.kind);
  const ids = new Set(mission.crates.map((c) => c.id));
  if (filler ? s.load.crates.length > 0 : s.load.sacks > 0 || s.load.boxes > 0 || s.load.crates.some((id) => !ids.has(id)) || new Set(s.load.crates).size !== s.load.crates.length) return fresh;
  const load: CargoLoad = { crates: s.load.crates, sacks: s.load.sacks, boxes: s.load.boxes };
  if (committedValue(mission, load) > mission.range.max) return fresh;
  const counted = s.phase === 'weighing' && misses !== undefined && s.weighed.length <= misses;
  const weighed = s.phase === 'weighing' && !counted ? s.weighed.slice(0, -1) : s.weighed;
  const readout = weighed.includes(committedValue(mission, load)) ? readingAgain(mission, load) : null;
  return { key: s.key, load, phase: 'loading', weighed, readout, revisions: s.revisions, shown: s.shown };
}
