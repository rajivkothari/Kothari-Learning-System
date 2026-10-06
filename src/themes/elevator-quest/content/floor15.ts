// Elevator Quest theme content for the first mission, "Floor 15".
//
// The learning content (core pack + core missions) is theme-neutral. This file is where the
// fiction lives: what each step means in the building, what Lifty says, how a misconception
// is explained in elevator terms, and what unlocks. Copy is plain, warm, and specific.
// No internal tags or challenge categories ever reach the screen.
import type { UnlockRule } from '../../../runtime/unlocks';

export const FLOOR15 = {
  missionId: 'positions-and-capacity',
  title: 'Floor 15',
  objective: 'POWER RESTORATION',
  floors: { min: 1, max: 20 },
  /** Where the lift waits before the mission starts (lobby). */
  homeFloor: 1,
  /** The repair level the finale rides to. */
  repairFloor: 15,
} as const;

/** In-world checklist, one line per mission step. Never "question 3 of 7". */
export const PROGRESS: { stepId: string; label: string }[] = [
  { stepId: 'intro', label: 'Wake the lift' },
  { stepId: 'cued-moves', label: 'Run the first service calls' },
  { stepId: 'second-representation', label: 'Read the shaft map' },
  { stepId: 'reference-stretch', label: 'Find the repair crew' },
  { stepId: 'capacity-encounter', label: 'Load the service car' },
  { stepId: 'finale', label: 'Restore Floor 15' },
];

export const UNLOCK_RULES: UnlockRule[] = [
  { id: 'eq.rank.engineer-1', when: { missionCompleted: FLOOR15.missionId } },
  { id: 'eq.system.maintenance-panel', when: { missionCompleted: FLOOR15.missionId } },
];

export const UNLOCK_LABELS: Record<string, string> = {
  'eq.rank.engineer-1': 'ENGINEER RANK 1',
  'eq.system.maintenance-panel': 'MAINTENANCE PANEL UNLOCKED',
};

const dir = (d: unknown) => (d === 'down' ? 'down' : 'up');
const word = (d: unknown) => (d === 'down' ? 'below' : 'above');

export interface MoveTask {
  start: number;
  change: number;
  direction: 'up' | 'down';
}

/** Lifty's lines. Functions of the task's givens only: never of the answer. */
export const LINES = {
  intro: `The power's down on Floor ${FLOOR15.repairFloor} and the repair crew needs this lift. Press DOOR OPEN to wake her up.`,
  introDone: 'There she is. Lights, doors, motor. Let\'s get to work.',
  resume: 'Welcome back. We were in the middle of a job.',
  reposition: (floor: number) => `Next call is on Floor ${floor}. Hold on.`,

  cued: (t: MoveTask, n: number) =>
    n === 0
      ? `We're on Floor ${t.start}. The repair kit is ${t.change} floors ${dir(t.direction)}. Press the floor where it is.`
      : `Floor ${t.start}. The toolbox is ${t.change} floors ${dir(t.direction)}. Take us there.`,
  shaft: (t: MoveTask) => `Shaft map time. We're at Floor ${t.start}. The spare parts are ${t.change} floors ${dir(t.direction)}. Tap their floor on the map, or use the panel.`,
  stretch: (t: MoveTask) => `The crew radioed: "We're ${t.change} floors ${word(t.direction)} the beacon." The beacon is on Floor ${t.start}.`,
  encounterRoute: (t: MoveTask) => `Big job. The loading dock is ${t.change} floors ${word(t.direction)} Floor ${t.start}, where we are now.`,
  cargo: (capacity: number, aboard: number) => `Load the car. It can carry ${capacity} units. ${aboard} are already aboard. Load as many as can safely go, then press DOOR CLOSE.`,
  finale: `Full load. Take us to Floor ${FLOOR15.repairFloor}.`,
  finaleOnlyRepair: `The crew is waiting on Floor ${FLOOR15.repairFloor}.`,

  riding: (to: number) => `Heading to Floor ${to}.`,
  alreadyHere: (floor: number) => `We're already on Floor ${floor}.`,
  changedPlan: 'Changed your plan. Good.',

  arrivedWrong: (floor: number, t: MoveTask, ref: 'here' | 'beacon' | 'start') =>
    ref === 'beacon'
      ? `We reached Floor ${floor}. The crew is ${t.change} floors ${word(t.direction)} the beacon on Floor ${t.start}.`
      : `We reached Floor ${floor}. The job is ${t.change} floors ${dir(t.direction)} from Floor ${t.start}.`,
  tryFromHere: 'Check the panel again. We can go from here.',
  regenerated: 'New call coming in. A different job, same kind.',

  praise: {
    firstTry: 'Right floor, first try.',
    noClue: 'You solved that one without a clue.',
    afterMiss: 'You changed your plan. That worked.',
    withHelp: 'The clue helped, and you got us there.',
    stretch: 'You worked out where the beacon was. Nicely done.',
    route: 'Loading dock. Right where you said.',
    cargo: 'You checked the capacity before moving. Load accepted.',
  },

  overload: (capacity: number) => `Overload. The car only takes ${capacity} units in total. Take some off.`,
  underload: 'Safe to go, but the crew needs every unit we can carry. There is room for more.',
  emptyLoad: 'Load the crates first. Drag them into the car.',

  complete: `Floor ${FLOOR15.repairFloor} has power again. That was real engineering.`,
  freeRide: 'The lift is all yours. Ride anywhere.',
  commitTrouble: 'One moment. Saving the logbook.',
};

/** Misconception tags translated into the building's terms. Shown instead of generic feedback. */
export function misconceptionLine(tag: string, t: MoveTask | null, cargo: { capacity: number; aboard: number } | null): string | null {
  switch (tag) {
    case 'quantity.countedStartingPosition':
      return t ? `One floor short. Floor ${t.start} is where we start. Count the floors after ${t.start}.` : null;
    case 'quantity.countedOneExtra':
      return t ? `One floor too far. The first floor ${dir(t.direction)} from ${t.start} is ${t.direction === 'down' ? t.start - 1 : t.start + 1}. Count from there.` : cargo ? 'One unit too many.' : null;
    case 'quantity.reversedDirection':
      return t ? `We went the wrong way. The job is ${dir(t.direction)} from Floor ${t.start}, not ${t.direction === 'down' ? 'up' : 'down'}.` : null;
    case 'quantity.answeredWithChange':
      return t ? `${t.change} is how many floors to move, not where we stop. Start at ${t.start} and move ${t.change}.` : null;
    case 'quantity.ignoredExistingLoad':
      return cargo ? `${cargo.aboard} units were already aboard before we loaded anything.` : null;
    case 'quantity.loadedEverything':
      return cargo ? `Not everything fits in one trip. The car holds ${cargo.capacity}.` : null;
    case 'quantity.answeredWithExistingLoad':
      return cargo ? `We loaded as many as were already aboard. Check how much room is left.` : null;
    default:
      return null;
  }
}

/** How each help step looks in this theme. Keys are the scaffolding step kinds in the core pack. */
export const HELP_LABELS: Record<string, string> = {
  highlightGiven: 'CLUE',
  numberLine: 'SHAFT MAP',
  guidedCount: 'COUNT WITH LIFTY',
  showAnswer: 'SHOW ME',
};

export function helpLine(kind: string, t: MoveTask | null, cargo: { capacity: number; aboard: number } | null, revealed: number | string | null): string {
  if (cargo) {
    if (kind === 'highlightGiven') return `The plate says ${cargo.capacity} units maximum. ${cargo.aboard} are already in the car. How much room is left?`;
    if (kind === 'numberLine') return 'The load meter shows each unit. Count up to the red line.';
  }
  if (!t) return 'Here is a clue.';
  switch (kind) {
    case 'highlightGiven':
      return `Start at Floor ${t.start}. Move ${t.change} floors ${dir(t.direction)}.`;
    case 'numberLine':
      return `The shaft map shows every floor. Find ${t.start}, then count ${t.change} ${dir(t.direction)}.`;
    case 'guidedCount':
      return `Let's count together from Floor ${t.start}.`;
    case 'showAnswer':
      return `It's Floor ${String(revealed)}. ${t.start} and ${t.change} ${t.direction === 'down' ? 'down' : 'more'}. Press it and watch the indicator.`;
    default:
      return 'Here is a clue.';
  }
}
