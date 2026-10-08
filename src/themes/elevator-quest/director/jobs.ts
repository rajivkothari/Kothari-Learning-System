// Floor 15 jobs: how each theme-neutral question becomes a job in the building. Pure: no React.
//
// A job says where the car waits (the anchor), which floors the job names (the givens a clue may
// point at), how a counting clue walks the shaft, and the words its lines may use. Everything here
// comes from the givens. Nothing computes the answer: correctness comes from runtime.check.
//
//   positionAfterMove      "The repair kit is 7 floors up"            a panel answer
//   positionAfterTwoMoves  "From 7, go up 4, then down 2"              a panel answer
//   startBeforeMove        "They rode up 5 and got off here, on 12"   a panel answer (undo the ride)
//   equalJumps             "The express stops at 3, 6, and on up"     a panel answer (skip count)
//   distanceBetween        "We're on 6. The crew is on 13"            a count on the trip meter
//   fillToCapacity, combineGroups                                      the cargo bay
import type { ActivityView } from '../../../engine';
import { FLOOR15, moveVarsFor, type MoveTask } from '../content/floor15';

export type JobShape = 'move' | 'twoMoves' | 'startFloor' | 'express' | 'tripMeter';

/**
 * A two-part trip may be ridden in two legs. The engine tags the floor where the first part ends
 * with this misconception when it is given as the answer; ridden from the trip's start, the director
 * treats it as the first leg instead (a step, never scored) and the next floor is the answer.
 */
export const FIRST_LEG_TAG = 'quantity.ignoredSecondMove';

export interface FloorJob {
  shape: JobShape;
  /** Where the car waits for the job. Null: anywhere (the express runs from the bottom of the building). */
  anchor: number | null;
  /** The move a learner counts from the anchor, in the words of a move job. Null when there is none. */
  move: MoveTask | null;
  /** Floors the job names: what the "point at the givens" clue lights. */
  givens: number[];
  /**
   * How the counting clue walks the shaft: from a floor, in a direction, by a stride. `before`: how
   * many counts fit before the count would reach the floor the job is about (a clue stops short).
   */
  count: { from: number; direction: 'up' | 'down'; stride: number; before: number };
  /** Words for this job's lines. Givens only. */
  vars: Record<string, string | number>;
  /** Trip meter jobs: the car rides `value` floors from `from` in `direction`, at most `max`. */
  meter: { from: number; direction: 'up' | 'down'; max: number } | null;
}

/** Concepts the cargo bay answers (a count of crates loaded), not the panel. */
export const CARGO_CONCEPTS: readonly string[] = ['fillToCapacity', 'combineGroups'];

const opposite = (d: 'up' | 'down'): 'up' | 'down' => (d === 'up' ? 'down' : 'up');
const dirOf = (v: unknown): 'up' | 'down' => (v === 'down' ? 'down' : 'up');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** The job for a floor activity, or null when the prompt is not one this theme can stage. */
export function jobOf(activity: Pick<ActivityView, 'concept' | 'prompt'>): FloorJob | null {
  const p = activity.prompt;
  switch (activity.concept) {
    case 'positionAfterMove': {
      const [start, change] = [num(p.start), num(p.change)];
      if (start === null || change === null) return null;
      const move: MoveTask = { start, change, direction: dirOf(p.direction) };
      return { shape: 'move', anchor: start, move, givens: [start], count: { from: start, direction: move.direction, stride: 1, before: change - 1 }, vars: moveVarsFor(move), meter: null };
    }
    case 'positionAfterTwoMoves': {
      const [start, change, change2] = [num(p.start), num(p.change), num(p.change2)];
      if (start === null || change === null || change2 === null) return null;
      const move: MoveTask = { start, change, direction: dirOf(p.direction) };
      const dir2 = dirOf(p.direction2);
      return { shape: 'twoMoves', anchor: start, move, givens: [start], count: { from: start, direction: move.direction, stride: 1, before: change - 1 }, vars: { ...moveVarsFor(move), changeTwo: change2, dirTwo: dir2 }, meter: null };
    }
    case 'startBeforeMove': {
      const [end, change] = [num(p.end), num(p.change)];
      if (end === null || change === null) return null;
      const rode = dirOf(p.direction);
      // Undo the ride: count back from where it ended. In a move's words, a move from the end.
      const move: MoveTask = { start: end, change, direction: opposite(rode) };
      return { shape: 'startFloor', anchor: end, move, givens: [end], count: { from: end, direction: move.direction, stride: 1, before: change - 1 }, vars: { ...moveVarsFor(move), end, rode }, meter: null };
    }
    case 'equalJumps': {
      const [step, count] = [num(p.step), num(p.count)];
      if (step === null || count === null) return null;
      // The first two stops are part of the question; counting starts at the bottom of the shaft.
      return { shape: 'express', anchor: null, move: null, givens: [step, 2 * step], count: { from: 0, direction: 'up', stride: step, before: count - 1 }, vars: { step, firstStop: step, secondStop: 2 * step, count }, meter: null };
    }
    case 'distanceBetween': {
      const [from, to] = [num(p.from), num(p.to)];
      if (from === null || to === null || from === to) return null;
      const direction = to > from ? 'up' : 'down';
      const max = direction === 'up' ? FLOOR15.floors.max - from : from - FLOOR15.floors.min;
      return { shape: 'tripMeter', anchor: from, move: null, givens: [from, to], count: { from, direction, stride: 1, before: Math.abs(to - from) - 1 }, vars: { from, to }, meter: { from, direction, max } };
    }
    default:
      return null;
  }
}

/** The cargo bay's givens for a cargo concept. Orders: two groups to load (and more waiting). */
export function cargoOf(activity: Pick<ActivityView, 'concept' | 'prompt'>): { capacity: number; aboard: number; waiting: number; orders: [number, number] | null } | null {
  const p = activity.prompt;
  if (activity.concept === 'fillToCapacity') {
    const [capacity, aboard, waiting] = [num(p.capacity), num(p.aboard), num(p.waiting)];
    return capacity === null || aboard === null || waiting === null ? null : { capacity, aboard, waiting, orders: null };
  }
  if (activity.concept === 'combineGroups') {
    const [first, second, waiting] = [num(p.first), num(p.second), num(p.waiting)];
    // No limit to respect: the car takes the whole dock. Only the orders say how many to load.
    return first === null || second === null || waiting === null ? null : { capacity: waiting, aboard: 0, waiting, orders: [first, second] };
  }
  return null;
}
