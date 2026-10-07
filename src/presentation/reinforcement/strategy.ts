// Success replay: after a correct answer, a short look at one way the answer can be reached.
// Pure and theme-neutral: no React, no theme words. A theme supplies the words (by key) and draws
// the steps in its own world.
//
// Honesty rule: the game only says the learner DID something when it saw it happen (an answer
// chosen on the number line, crates loaded, a plan changed after a miss). Anything else is offered
// as a suggestion ("One quick way: 8 -> 10 -> 15"), never as a description of what the learner
// thought. The replay is presentation only: it writes nothing and is never evidence.

export type StrategyType =
  | 'countOn'
  | 'bridgeToTen'
  | 'decompose'
  | 'countBack'
  | 'bridgeThroughTen'
  | 'distance'
  | 'referenceOffset'
  /** Observed: the answer was chosen on the number line itself. */
  | 'numberLine'
  /** Capacity: used + remaining = total. */
  | 'partWhole'
  /** Two moves: the stop in between, then the end. */
  | 'twoLegs'
  /** Start unknown: undo the move from where it ended. */
  | 'undo'
  /** Equal jumps: count by the jump size. */
  | 'skipCount'
  /** Distance: from one position to the other. */
  | 'difference'
  /** Two groups: one, then the other on top. */
  | 'combine';

export type Concept = 'moveUp' | 'moveDown' | 'offsetFromReference' | 'capacityRemaining' | 'twoMoves' | 'startUnknown' | 'equalJumps' | 'distance' | 'combineGroups';
export type EvidenceBasis = 'observed' | 'suggested';
export type Intensity = 'routine' | 'stretch' | 'mastery';
export type Representation = 'numberLine' | 'loadMeter';
/** Facts the game saw during this item. */
export type Observation = 'usedNumberLine' | 'loadedExactly' | 'changedPlan';

export interface StrategyReinforcement {
  concept: Concept;
  /** e.g. "8 + 7 = 15", "13 - 6 = 7", "4 + 6 = 10". */
  answerSummary: string;
  strategy: StrategyType;
  representation: Representation;
  /** Waypoints to show, in order (positions on the number line, or load levels). */
  steps: number[];
  /** Copy key for the theme's words, plus the values the words may use. */
  textKey: string;
  textVars: Record<string, string | number>;
  /** 'observed' only when the strategy shown is what the learner was seen doing. */
  evidenceBasis: EvidenceBasis;
  observed: Observation[];
  intensity: Intensity;
}

export type ReinforcementInput =
  | {
      kind: 'move';
      start: number;
      change: number;
      direction: 'up' | 'down';
      /** The givens were anchored to a reference point other than where the learner stood. */
      reference: 'start' | 'beacon';
      challenge: 'practice' | 'stretch' | 'masteryEncounter';
      observed: Observation[];
    }
  | { kind: 'capacity'; capacity: number; aboard: number; loaded: number; challenge: Challenge; observed: Observation[] }
  /** A move, then a second move (`direction2`) of `change2`. */
  | { kind: 'twoMoves'; start: number; change: number; direction: 'up' | 'down'; change2: number; direction2: 'up' | 'down'; challenge: Challenge; observed: Observation[] }
  /** Where did it start: a move of `change` in `direction` ended at `end`. */
  | { kind: 'undo'; end: number; change: number; direction: 'up' | 'down'; challenge: Challenge; observed: Observation[] }
  /** `count` equal jumps of `step` from zero. */
  | { kind: 'jumps'; step: number; count: number; challenge: Challenge; observed: Observation[] }
  /** How far from `from` to `to`. */
  | { kind: 'distance'; from: number; to: number; challenge: Challenge; observed: Observation[] }
  /** Two groups put together. `observed` may say they were loaded (the total), never how the learner added. */
  | { kind: 'combine'; first: number; second: number; challenge: Challenge; observed: Observation[] };

type Challenge = 'practice' | 'stretch' | 'masteryEncounter';

const TENS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const arrow = (steps: number[]) => steps.join(' → ');

export function intensityFor(challenge: 'practice' | 'stretch' | 'masteryEncounter'): Intensity {
  return challenge === 'masteryEncounter' ? 'mastery' : challenge === 'stretch' ? 'stretch' : 'routine';
}

/**
 * Pick what to show, deterministically:
 *   1. a strategy the learner was observed using,
 *   2. otherwise the simplest efficient one (a short count, then a ten to bridge, then chunks),
 *   3. drawn on the representation the learner already knows from the task.
 */
export function chooseReinforcement(input: ReinforcementInput): StrategyReinforcement {
  const intensity = intensityFor(input.challenge);
  const observed = [...input.observed];
  if (input.kind === 'capacity') {
    const { capacity, aboard, loaded } = input;
    const watched = observed.includes('loadedExactly');
    return {
      concept: 'capacityRemaining',
      answerSummary: `${aboard} + ${loaded} = ${aboard + loaded}`,
      strategy: 'partWhole',
      representation: 'loadMeter',
      steps: [aboard, aboard + loaded],
      textKey: watched ? 'partWholeObserved' : 'partWhole',
      textVars: { aboard, loaded, capacity, total: aboard + loaded },
      evidenceBasis: watched ? 'observed' : 'suggested',
      observed,
      intensity,
    };
  }
  if (input.kind !== 'move') return otherShapes(input, intensity, observed);

  const { start, change, direction, reference } = input;
  const sign = direction === 'up' ? 1 : -1;
  const result = start + sign * change;
  const concept: Concept = reference === 'beacon' ? 'offsetFromReference' : direction === 'up' ? 'moveUp' : 'moveDown';
  const answerSummary = direction === 'up' ? `${start} + ${change} = ${result}` : `${start} - ${change} = ${result}`;
  const base = { concept, answerSummary, representation: 'numberLine' as const, observed, intensity };
  const vars = (steps: number[]) => ({ path: arrow(steps), start, change, result, dir: direction });

  // 1. Observed: the learner chose the answer on the number line itself.
  if (observed.includes('usedNumberLine')) {
    const steps = [start, result];
    return { ...base, strategy: 'numberLine', steps, textKey: 'numberLineObserved', textVars: vars(steps), evidenceBasis: 'observed' };
  }
  // A move measured from a reference point (a beacon): show the offset from it.
  if (reference === 'beacon') {
    const steps = [start, result];
    return { ...base, strategy: 'referenceOffset', steps, textKey: 'referenceOffset', textVars: vars(steps), evidenceBasis: 'suggested' };
  }
  // 2. Simplest efficient suggestion: a short count, then a ten, then chunks of five.
  const run = Array.from({ length: change + 1 }, (_, i) => start + sign * i);
  const count = { ...base, strategy: direction === 'up' ? ('countOn' as const) : ('countBack' as const), steps: run, textKey: direction === 'up' ? 'countOn' : 'countBack', textVars: vars(run), evidenceBasis: 'suggested' as const };
  if (change <= 3) return count;
  const ten = TENS.find((t) => (direction === 'up' ? t > start && t < result : t < start && t > result));
  if (ten !== undefined) {
    const steps = [start, ten, result];
    const strategy = direction === 'up' ? 'bridgeToTen' : 'bridgeThroughTen';
    return { ...base, strategy, steps, textKey: strategy, textVars: vars(steps), evidenceBasis: 'suggested' };
  }
  if (result % 10 === 0) {
    // Landing exactly on a ten: the pair that makes (or leaves) the ten.
    const steps = [start, result];
    return { ...base, strategy: direction === 'up' ? 'bridgeToTen' : 'bridgeThroughTen', steps, textKey: direction === 'up' ? 'makeTen' : 'backToTen', textVars: vars(steps), evidenceBasis: 'suggested' };
  }
  if (change <= 5) return count;
  if (direction === 'up') {
    const steps = [start, start + 5, result];
    return { ...base, strategy: 'decompose', steps, textKey: 'decompose', textVars: vars(steps), evidenceBasis: 'suggested' };
  }
  // Down, no ten in the way: check it by the distance back up.
  const steps = [result, start];
  return { ...base, strategy: 'distance', steps, textKey: 'distance', textVars: vars(steps), evidenceBasis: 'suggested' };
}

/** The newer shapes: always a suggestion (the game did not see how the learner worked it out). */
function otherShapes(input: Exclude<ReinforcementInput, { kind: 'move' } | { kind: 'capacity' }>, intensity: Intensity, observed: Observation[]): StrategyReinforcement {
  const base = { observed, intensity, evidenceBasis: 'suggested' as const };
  const signed = (d: 'up' | 'down', n: number) => (d === 'up' ? n : -n);
  const op = (d: 'up' | 'down') => (d === 'up' ? '+' : '-');
  switch (input.kind) {
    case 'twoMoves': {
      const middle = input.start + signed(input.direction, input.change);
      const end = middle + signed(input.direction2, input.change2);
      const steps = [input.start, middle, end];
      return { ...base, concept: 'twoMoves', answerSummary: `${input.start} ${op(input.direction)} ${input.change} ${op(input.direction2)} ${input.change2} = ${end}`, strategy: 'twoLegs', representation: 'numberLine', steps, textKey: 'twoLegs', textVars: { path: arrow(steps) } };
    }
    case 'undo': {
      const start = input.end - signed(input.direction, input.change);
      return { ...base, concept: 'startUnknown', answerSummary: `${input.end} ${op(input.direction === 'up' ? 'down' : 'up')} ${input.change} = ${start}`, strategy: 'undo', representation: 'numberLine', steps: [input.end, start], textKey: 'undo', textVars: { end: input.end, change: input.change, result: start } };
    }
    case 'jumps': {
      const steps = Array.from({ length: input.count }, (_, i) => input.step * (i + 1));
      return { ...base, concept: 'equalJumps', answerSummary: `${input.count} × ${input.step} = ${input.step * input.count}`, strategy: 'skipCount', representation: 'numberLine', steps, textKey: 'skipCount', textVars: { step: input.step, path: arrow(steps) } };
    }
    case 'distance': {
      const change = Math.abs(input.to - input.from);
      return { ...base, concept: 'distance', answerSummary: `${Math.max(input.from, input.to)} - ${Math.min(input.from, input.to)} = ${change}`, strategy: 'difference', representation: 'numberLine', steps: [input.from, input.to], textKey: 'difference', textVars: { from: input.from, to: input.to, change } };
    }
    case 'combine': {
      const total = input.first + input.second;
      return { ...base, concept: 'combineGroups', answerSummary: `${input.first} + ${input.second} = ${total}`, strategy: 'combine', representation: 'loadMeter', steps: [input.first, total], textKey: 'combine', textVars: { first: input.first, second: input.second, total } };
    }
  }
}

/** How long the replay holds the stage, by intensity. Reduced motion: shorter and static. */
export function replayMs(intensity: Intensity, motion: 'normal' | 'reduced'): number {
  const normal = { routine: 1600, stretch: 2200, mastery: 2800 };
  const reduced = { routine: 900, stretch: 1100, mastery: 1300 };
  return (motion === 'reduced' ? reduced : normal)[intensity];
}
