// Elevator Quest theme content for "Floor 15".
//
// The words live in content/themes/elevator-quest/floor15.json (schema-validated; see
// src/themes/content/missionCopy.ts). This module holds the theme's CONTRACT for that copy,
// the few structural constants of the building, and small helpers that fill templates from
// the givens of a task. Helpers use the givens only: never the answer (except a demonstrated one).
import floor15 from '../../../../content/themes/elevator-quest/floor15.json';
import { MissionCopySchema, fill, type CopyContract } from '../../content/missionCopy';
import type { UnlockRule } from '../../../runtime/unlocks';

export const COPY = MissionCopySchema.parse(floor15);

/** Structure of the building (not copy). */
/** The theme pack id stored on every learner this theme creates. */
export const THEME_PACK_ID = 'elevator-quest';

export const FLOOR15 = {
  missionId: COPY.missionId,
  title: COPY.title,
  objective: COPY.objective,
  floors: { min: 1, max: 20 },
  /** Where the lift waits before the mission starts (lobby). */
  homeFloor: 1,
  /** The repair level the finale rides to. */
  repairFloor: 15,
  /** Where the car is parked if the app reopens at the finale. */
  finaleRestoreFloor: 3,
} as const;

const MOVE = ['start', 'change', 'dir'] as const;
const REL = ['start', 'change', 'rel'] as const;

/** Every line Floor 15 needs, and the placeholders each may use. */
export const CONTRACT: CopyContract = {
  lines: {
    intro: ['repairFloor'],
    introDone: [],
    resume: [],
    reposition: ['floor'],
    cuedFirst: MOVE,
    cuedNext: MOVE,
    shaft: MOVE,
    stretch: REL,
    encounterRoute: REL,
    cargo: ['capacity', 'aboard'],
    finale: ['repairFloor'],
    finaleOnlyRepair: ['repairFloor'],
    riding: ['floor'],
    alreadyHere: ['floor'],
    arrivedWrong: ['floor', ...MOVE],
    arrivedWrongBeacon: ['floor', ...REL],
    tryFromHere: [],
    regenerated: [],
    overload: ['capacity'],
    underload: [],
    emptyLoad: [],
    complete: ['repairFloor'],
    completeAgain: ['repairFloor'],
    completeTitle: [],
    powerOnline: ['repairFloor'],
    freeRide: [],
    commitTrouble: [],
    saveStuck: [],
    troubleTitle: [],
    troubleBody: [],
    troubleRetry: [],
    troubleExit: [],
  },
  praise: ['firstTry', 'noClue', 'afterMiss', 'withHelp', 'afterRescue', 'stretch', 'route', 'cargo'],
  misconceptionVars: ['start', 'change', 'dir', 'dirOpposite', 'first', 'capacity', 'aboard'],
  helpVars: ['start', 'change', 'dir', 'revealed', 'capacity', 'aboard'],
  rescueLines: {
    intro: [],
    general: [],
    generalFill: [],
    example: ['exStart', 'exChange', 'exDir'],
    exampleFill: ['exCapacity', 'exAboard'],
    countStep: ['floor', 'n'],
    countStepFill: ['n'],
    notNext: [],
    ask: ['exChange'],
    askFill: [],
    exampleRight: ['exAnswer', 'exChange'],
    exampleRightFill: ['exAnswer'],
    exampleRetry: ['exStart'],
    back: MOVE,
    backBeacon: REL,
    backFill: ['capacity', 'aboard'],
  },
  rescueFocusVars: [],
  replayLines: {
    countOn: ['path'],
    countBack: ['path'],
    bridgeToTen: ['path'],
    bridgeThroughTen: ['path'],
    makeTen: ['start', 'change', 'result'],
    backToTen: ['start', 'change', 'result'],
    decompose: ['path'],
    distance: ['start', 'change', 'result'],
    referenceOffset: ['start', 'change', 'result', 'dir'],
    numberLineObserved: ['path'],
    partWholeObserved: ['aboard', 'loaded', 'total'],
    partWhole: ['aboard', 'loaded', 'total'],
  },
  replaySuggested: ['countOn', 'countBack', 'bridgeToTen', 'bridgeThroughTen', 'makeTen', 'backToTen', 'decompose', 'distance', 'referenceOffset', 'partWhole'],
};

/** Success replay words for a strategy key, filled with its values. */
export function replayLine(key: string, vars: Record<string, string | number>): string | null {
  const template = COPY.replay[key];
  return template ? fill(template, vars) : null;
}

export const PROGRESS = COPY.progress;
export const UNLOCK_RULES: UnlockRule[] = COPY.unlocks.map((u) => ({ id: u.id, when: u.when }));
export const UNLOCK_LABELS: Record<string, string> = Object.fromEntries(COPY.unlocks.map((u) => [u.id, u.label]));
export const PACING = COPY.pacing;

export interface MoveTask {
  start: number;
  change: number;
  direction: 'up' | 'down';
}
export interface CargoGivens {
  capacity: number;
  aboard: number;
}

const moveVars = (t: MoveTask) => ({
  start: t.start,
  change: t.change,
  dir: t.direction === 'down' ? 'down' : 'up',
  dirOpposite: t.direction === 'down' ? 'up' : 'down',
  rel: t.direction === 'down' ? 'below' : 'above',
  // Presentational counting aid ("the first floor up from 8 is 9"), not the answer.
  first: t.direction === 'down' ? t.start - 1 : t.start + 1,
});

export const line = (key: string, vars: Record<string, string | number> = {}) => fill(COPY.lines[key] ?? key, { repairFloor: FLOOR15.repairFloor, ...vars });
export const praise = (key: string) => COPY.praise[key] ?? '';

/** Lifty's lines. Functions of the task's givens only: never of the answer. */
export const LINES = {
  intro: line('intro'),
  introDone: line('introDone'),
  resume: line('resume'),
  reposition: (floor: number) => line('reposition', { floor }),
  cued: (t: MoveTask, n: number) => line(n === 0 ? 'cuedFirst' : 'cuedNext', moveVars(t)),
  shaft: (t: MoveTask) => line('shaft', moveVars(t)),
  stretch: (t: MoveTask) => line('stretch', moveVars(t)),
  encounterRoute: (t: MoveTask) => line('encounterRoute', moveVars(t)),
  cargo: (capacity: number, aboard: number) => line('cargo', { capacity, aboard }),
  finale: line('finale'),
  finaleOnlyRepair: line('finaleOnlyRepair'),
  riding: (floor: number) => line('riding', { floor }),
  alreadyHere: (floor: number) => line('alreadyHere', { floor }),
  arrivedWrong: (floor: number, t: MoveTask, ref: 'beacon' | 'start') => line(ref === 'beacon' ? 'arrivedWrongBeacon' : 'arrivedWrong', { floor, ...moveVars(t) }),
  tryFromHere: line('tryFromHere'),
  regenerated: line('regenerated'),
  praise: {
    firstTry: praise('firstTry'),
    noClue: praise('noClue'),
    afterMiss: praise('afterMiss'),
    withHelp: praise('withHelp'),
    afterRescue: praise('afterRescue'),
    stretch: praise('stretch'),
    route: praise('route'),
    cargo: praise('cargo'),
  },
  overload: (capacity: number) => line('overload', { capacity }),
  underload: line('underload'),
  emptyLoad: line('emptyLoad'),
  complete: line('complete'),
  completeAgain: line('completeAgain'),
  completeTitle: line('completeTitle'),
  powerOnline: line('powerOnline'),
  freeRide: line('freeRide'),
  commitTrouble: line('commitTrouble'),
  saveStuck: line('saveStuck'),
  /** Adult-facing recovery panel (a save failed for good). */
  trouble: { title: line('troubleTitle'), body: line('troubleBody'), retry: line('troubleRetry'), exit: line('troubleExit') },
};

/** Misconception tags translated into the building's terms. Null when the copy has none. */
export function misconceptionLine(tag: string, t: MoveTask | null, cargo: CargoGivens | null): string | null {
  const template = COPY.misconceptions[tag];
  if (!template) return null;
  const needsMove = /\{(start|change|dir|dirOpposite|first)\}/.test(template);
  const needsCargo = /\{(capacity|aboard)\}/.test(template);
  if ((needsMove && !t) || (needsCargo && !cargo)) return null;
  return fill(template, { ...(t ? moveVars(t) : {}), ...(cargo ?? {}) });
}

export const helpLabel = (kind: string) => COPY.help[kind]?.label ?? 'HELP';

export function helpLine(kind: string, t: MoveTask | null, cargo: CargoGivens | null, revealed: number | string | null): string {
  const h = COPY.help[kind];
  if (!h) return 'Here is a clue.';
  const template = cargo && h.altLine ? h.altLine : h.line;
  return fill(template, { ...(t ? moveVars(t) : {}), ...(cargo ?? {}), revealed: revealed ?? '' });
}

/** Concept Rescue lines. `focus` is a misconception tag when the evidence is strong, else null. */
export function rescueLine(key: string, vars: Record<string, string | number> = {}): string {
  return fill(COPY.rescue.lines[key] ?? key, vars);
}
export const rescueFocusLine = (focus: string | null) => (focus ? (COPY.rescue.focus[focus] ?? null) : null);
export const moveVarsFor = moveVars;
