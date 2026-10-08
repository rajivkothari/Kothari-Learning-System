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
//   missingInSequence      "The lamps go 4, 6, ?, 10, 12"             a panel answer (skip count from any start)
//   tensAndOnes            "From 3, one 10-floor jump up, then 4"     a panel answer (a ten and some ones)
//   orderPositions         "Calls on 13, 8 and 17. Going up..."       a panel answer (compare, order)
//   fillToCapacity, combineGroups                                      the cargo bay
import type { ActivityView } from '../../../engine';
import { FLOOR15, line, moveVarsFor, type MoveTask } from '../content/floor15';

export type JobShape = 'move' | 'twoMoves' | 'startFloor' | 'express' | 'tripMeter' | 'sequence' | 'tens' | 'order';

/**
 * Copy keys (floor15.json) for a job's own words: its opening line (`lines`), the line after a wrong
 * floor (`lines`), the line back from a test run (`rescue.lines`), and its help (`help.<kind>.jobs`).
 * A plain move has none: its lines depend on the challenge and the representation.
 */
export interface JobWords {
  job: string;
  wrong: string;
  back: string;
  help: string;
}

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
  /** The job's own copy keys; null for a plain move. */
  words: JobWords | null;
  /**
   * After a miss: the floor the shaft map draws the answer's move from (the job's floor), for jobs
   * whose shape the director does not draw itself. Null: nothing to draw.
   */
  mismatchFrom: number | null;
}

const WORDS: Record<Exclude<JobShape, 'move' | 'sequence' | 'tens' | 'order'>, JobWords> = {
  twoMoves: { job: 'twoMoves', wrong: 'arrivedWrongTwo', back: 'backTwo', help: 'twoMoves' },
  startFloor: { job: 'startFloor', wrong: 'arrivedWrongStart', back: 'backStart', help: 'startFloor' },
  express: { job: 'express', wrong: 'arrivedWrongExpress', back: 'backJumps', help: 'express' },
  tripMeter: { job: 'tripMeter', wrong: 'arrivedWrongMeter', back: 'backMeter', help: 'tripMeter' },
};
/** One family of words per kind of job: `lines.<key>`, `lines.arrivedWrong<Key>`, `rescue.lines.back<Key>`, `help.*.jobs.<key>`. */
const wordsFor = (key: string): JobWords => {
  const Key = key.charAt(0).toUpperCase() + key.slice(1);
  return { job: key, wrong: `arrivedWrong${Key}`, back: `back${Key}`, help: key };
};

/** The rank of a stop in the order of travel, in words (copy). */
export const rankWord = (rank: number): string => line(`rank${rank}`);
/** A pattern of positions with its gap, as the job shows it: "4, 6, ?, 10, 12". */
const patternText = (terms: number[], gap: number) => terms.map((t, i) => (i === gap ? '?' : String(t))).join(', ');

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
      return { shape: 'move', anchor: start, move, givens: [start], count: { from: start, direction: move.direction, stride: 1, before: change - 1 }, vars: moveVarsFor(move), meter: null, words: null, mismatchFrom: start };
    }
    case 'positionAfterTwoMoves': {
      const [start, change, change2] = [num(p.start), num(p.change), num(p.change2)];
      if (start === null || change === null || change2 === null) return null;
      const move: MoveTask = { start, change, direction: dirOf(p.direction) };
      const dir2 = dirOf(p.direction2);
      return { shape: 'twoMoves', anchor: start, move, givens: [start], count: { from: start, direction: move.direction, stride: 1, before: change - 1 }, vars: { ...moveVarsFor(move), changeTwo: change2, dirTwo: dir2 }, meter: null, words: WORDS.twoMoves, mismatchFrom: start };
    }
    case 'startBeforeMove': {
      const [end, change] = [num(p.end), num(p.change)];
      if (end === null || change === null) return null;
      const rode = dirOf(p.direction);
      // Undo the ride: count back from where it ended. In a move's words, a move from the end.
      const move: MoveTask = { start: end, change, direction: opposite(rode) };
      return { shape: 'startFloor', anchor: end, move, givens: [end], count: { from: end, direction: move.direction, stride: 1, before: change - 1 }, vars: { ...moveVarsFor(move), end, rode }, meter: null, words: WORDS.startFloor, mismatchFrom: null };
    }
    case 'equalJumps': {
      const [step, count] = [num(p.step), num(p.count)];
      if (step === null || count === null) return null;
      // The first two stops are part of the question; counting starts at the bottom of the shaft.
      return { shape: 'express', anchor: null, move: null, givens: [step, 2 * step], count: { from: 0, direction: 'up', stride: step, before: count - 1 }, vars: { step, firstStop: step, secondStop: 2 * step, count }, meter: null, words: WORDS.express, mismatchFrom: null };
    }
    case 'distanceBetween': {
      const [from, to] = [num(p.from), num(p.to)];
      if (from === null || to === null || from === to) return null;
      const direction = to > from ? 'up' : 'down';
      const max = direction === 'up' ? FLOOR15.floors.max - from : from - FLOOR15.floors.min;
      return { shape: 'tripMeter', anchor: from, move: null, givens: [from, to], count: { from, direction, stride: 1, before: Math.abs(to - from) - 1 }, vars: { from, to }, meter: { from, direction, max }, words: WORDS.tripMeter, mismatchFrom: from };
    }
    case 'missingInSequence': {
      // The hall lamps light a pattern; one is out. The pattern is all givens; the gap is the job.
      const [first, step, length, missing] = [num(p.first), num(p.step), num(p.length), num(p.missing)];
      if (first === null || step === null || length === null || missing === null || missing < 1 || missing >= length) return null;
      const direction = dirOf(p.direction);
      const sign = direction === 'up' ? 1 : -1;
      const terms = Array.from({ length }, (_, k) => first + sign * step * k);
      const shown = terms.filter((_, k) => k !== missing);
      const vars = { pattern: patternText(terms, missing), step, firstLamp: first, lampBefore: terms[missing - 1] as number, dir: direction };
      // Lamps can be seen from anywhere in the shaft: the car takes the job where it is.
      return { shape: 'sequence', anchor: null, move: null, givens: shown, count: { from: first, direction, stride: step, before: missing - 1 }, vars, meter: null, words: wordsFor('sequence'), mismatchFrom: null };
    }
    case 'tensAndOnes': {
      // The ten-floor express: one jump is 10 floors, then the ones. From zero: the bottom of the shaft.
      const [start, tens, ones] = [num(p.start), num(p.tens), num(p.ones)];
      if (start === null || tens !== 1 || ones === null || ones < 0) return null;
      const direction = dirOf(p.direction);
      const key = start === 0 ? 'tensFromZero' : ones === 0 ? 'tenJump' : 'tens';
      const fromFloor = start >= FLOOR15.floors.min;
      // A move's words for the counting lines ({start}, {first}, {dirOpposite}); none from the bottom.
      const vars = fromFloor ? { ...moveVarsFor({ start, change: 10 + ones, direction }), ones, tens, jump: 10 } : { ones, tens, jump: 10, dir: direction };
      return { shape: 'tens', anchor: fromFloor ? start : null, move: null, givens: fromFloor ? [start] : [], count: { from: start, direction, stride: 1, before: 10 + ones - 1 }, vars, meter: null, words: wordsFor(key), mismatchFrom: fromFloor ? start : null };
    }
    case 'orderPositions': {
      // Hall calls on two or three floors; going up from the bottom (or down from the top), which do we meet first, second...?
      const calls = [num(p.first), num(p.second), ...(p.third === undefined ? [] : [num(p.third)])];
      const rank = num(p.rank);
      if (calls.some((c) => c === null) || rank === null || rank < 1 || rank > calls.length) return null;
      const direction = dirOf(p.direction);
      const anchor = direction === 'up' ? FLOOR15.floors.min : FLOOR15.floors.max;
      const floors = calls as number[];
      if (floors.some((c) => c === anchor || c < FLOOR15.floors.min || c > FLOOR15.floors.max)) return null;
      const nearest = direction === 'up' ? Math.min(...floors) : Math.max(...floors);
      const [callA, callB, callC] = floors;
      const vars = { callA: callA as number, callB: callB as number, ...(callC === undefined ? {} : { callC }), dir: direction, rank: rankWord(rank), anchor };
      return { shape: 'order', anchor, move: null, givens: floors, count: { from: anchor, direction, stride: 1, before: Math.abs(nearest - anchor) - 1 }, vars, meter: null, words: wordsFor(floors.length === 2 ? 'compare' : 'order'), mismatchFrom: null };
    }
    default:
      return null;
  }
}

/** A success replay's plan for a job the director does not plan itself (the newer shapes). */
export type ReplayPlan =
  | { kind: 'move'; start: number; change: number; direction: 'up' | 'down'; reference: 'start' }
  | { kind: 'twoMoves'; start: number; change: number; direction: 'up' | 'down'; change2: number; direction2: 'up' | 'down' }
  | { kind: 'distance'; from: number; to: number };

/**
 * One way to reach the answer of a job just answered correctly, from its givens. Presentation only,
 * and only after a right answer (the director asks for it then), so it never shows the way.
 *   sequence: count on (or back) from the lamp before the gap, by the pattern's step
 *   tens: the ten, then the ones (from the bottom: from 10, the ones); a ten alone: the distance
 *   order: the calls in the order of travel
 */
export function replayPlan(job: FloorJob): ReplayPlan | null {
  const v = job.vars;
  const dir = dirOf(v.dir);
  switch (job.shape) {
    case 'sequence':
      return { kind: 'move', start: Number(v.lampBefore), change: Number(v.step), direction: dir, reference: 'start' };
    case 'tens': {
      const ones = Number(v.ones);
      if (v.start === undefined) return { kind: 'move', start: 10, change: ones, direction: 'up', reference: 'start' };
      const start = Number(v.start);
      const afterTen = start + (dir === 'up' ? 10 : -10);
      if (ones === 0) return { kind: 'distance', from: start, to: afterTen };
      return { kind: 'twoMoves', start, change: 10, direction: dir, change2: ones, direction2: dir };
    }
    case 'order': {
      const calls = [v.callA, v.callB, v.callC].filter((c): c is number => typeof c === 'number').sort((a, b) => (dir === 'up' ? a - b : b - a));
      const [a, b, c] = calls as [number, number, number | undefined];
      if (c === undefined) return { kind: 'distance', from: a, to: b };
      return { kind: 'twoMoves', start: a, change: Math.abs(b - a), direction: dir, change2: Math.abs(c - b), direction2: dir };
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
