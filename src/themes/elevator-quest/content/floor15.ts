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
/** A two-part trip: a move, then a second move back the other way. */
const TWO = [...MOVE, 'changeTwo', 'dirTwo'] as const;
/** Where did it start? The ride that happened ({rode}), and the count back from its end ({dir} is back). */
const START = ['end', 'change', 'rode', 'dir'] as const;
/** The express: equal jumps from the bottom of the shaft, the first two stops shown. */
const JUMPS = ['step', 'firstStop', 'secondStop', 'count'] as const;
/** The trip meter: two floors, and the learner measures the trip between them. */
const METER = ['from', 'to'] as const;
/** Two orders to load together. */
const ORDERS = ['orderA', 'orderB'] as const;
/** Every placeholder a job's words may use (misconception and help lines). */
const JOB_VARS = ['start', 'change', 'dir', 'dirOpposite', 'first', 'changeTwo', 'dirTwo', 'end', 'rode', 'step', 'firstStop', 'secondStop', 'count', 'from', 'to', 'orderA', 'orderB'] as const;

/** Every line Floor 15 needs, and the placeholders each may use. */
export const CONTRACT: CopyContract = {
  lines: {
    intro: ['repairFloor'],
    introDone: [],
    resume: [],
    reposition: ['floor'],
    hallCall: ['floor'],
    cuedFirst: MOVE,
    cuedNext: MOVE,
    shaft: MOVE,
    stretch: REL,
    encounterRoute: REL,
    cargo: ['capacity', 'aboard'],
    twoMoves: TWO,
    startFloor: START,
    express: JUMPS,
    tripMeter: METER,
    orders: ORDERS,
    arrivedWrongTwo: ['floor', ...TWO],
    arrivedWrongStart: ['floor', ...START],
    arrivedWrongExpress: ['floor', ...JUMPS],
    arrivedWrongMeter: ['floor', 'value', ...METER],
    ordersWrong: ORDERS,
    orderPlate: ORDERS,
    checkOrder: [],
    meterTitle: [],
    meterUnit: [],
    meterGo: [],
    meterFewer: [],
    meterMore: [],
    meterEmpty: [],
    finale: ['repairFloor'],
    finaleOnlyRepair: ['repairFloor'],
    alreadyHere: ['floor'],
    arrivedWrong: ['floor', ...MOVE],
    arrivedWrongBeacon: ['floor', ...REL],
    tryFromHere: [],
    regenerated: [],
    overload: ['capacity'],
    underload: [],
    emptyLoad: [],
    crateLabels: [],
    complete: ['repairFloor'],
    completeAgain: ['repairFloor'],
    rankEarned: [],
    freeRide: [],
    nextJob: [],
    exploreHint: ['object'],
    doorCloseTip: [],
    logTitle: [],
    logInspected: [],
    logNotInspected: [],
    logUnknown: [],
    logPowered: [],
    logUnpowered: [],
    logOpen: [],
    logClose: [],
    logReplay: ['repairFloor'],
    directoryOpen: [],
    signNumbered: ['floor', 'name'],
    directoryTitle: [],
    directoryNote: [],
    directoryClose: [],
    commitTrouble: [],
    saveStuck: [],
    troubleTitle: [],
    troubleBody: [],
    troubleRetry: [],
    troubleExit: [],
  },
  praise: ['afterMiss', 'afterRescue', 'stretch', 'cargo', 'orders'],
  misconceptionVars: [...JOB_VARS, 'capacity', 'aboard'],
  helpVars: [...JOB_VARS, 'revealed', 'capacity', 'aboard'],
  helpJobs: ['twoMoves', 'startFloor', 'express', 'tripMeter', 'orders'],
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
    generalTwo: [],
    generalStart: [],
    generalJumps: [],
    generalDistance: [],
    generalOrders: [],
    exampleTwo: ['exStart', 'exChange', 'exDir', 'exChangeTwo', 'exDirTwo'],
    legTwo: ['floor', 'exChangeTwo', 'exDirTwo'],
    exampleStart: ['exEnd', 'exChange', 'exRode', 'exDir'],
    exampleJumps: ['exStep'],
    countStepJump: ['floor', 'n'],
    askJumps: ['exCount'],
    askTwo: [],
    askStart: ['exChange'],
    exampleDistance: ['exFrom', 'exTo'],
    askDistance: [],
    exampleOrders: ['exOrderA', 'exOrderB'],
    countStepOrders: ['n'],
    askOrders: [],
    exampleRightTwo: ['exAnswer'],
    exampleRightStart: ['exAnswer', 'exChange', 'exRode', 'exEnd'],
    exampleRightJumps: ['exAnswer', 'exCount', 'exStep'],
    exampleRightDistance: ['exAnswer', 'exFrom'],
    exampleRightOrders: ['exAnswer', 'exOrderA', 'exOrderB'],
    exampleRetryJumps: ['exStep'],
    exampleRetryOrders: ['exOrderA', 'exNext'],
    backTwo: TWO,
    backStart: START,
    backJumps: JUMPS,
    backMeter: METER,
    backOrders: ORDERS,
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
    twoLegs: ['path'],
    undo: ['end', 'change', 'result'],
    skipCount: ['step', 'path'],
    difference: ['from', 'to', 'change'],
    combine: ['first', 'second', 'total'],
  },
  replaySuggested: ['countOn', 'countBack', 'bridgeToTen', 'bridgeThroughTen', 'makeTen', 'backToTen', 'decompose', 'distance', 'referenceOffset', 'partWhole', 'twoLegs', 'undo', 'skipCount', 'difference', 'combine'],
};

/** Success replay words for a strategy key, filled with its values. */
export function replayLine(key: string, vars: Record<string, string | number>): string | null {
  const template = COPY.replay[key];
  return template ? fill(template, vars) : null;
}

export const PROGRESS = COPY.progress;
export const UNLOCK_RULES: UnlockRule[] = COPY.unlocks.map((u) => ({ id: u.id, when: u.when }));
export const UNLOCK_LABELS: Record<string, string> = Object.fromEntries(COPY.unlocks.map((u) => [u.id, u.label]));
export const RANK_UNLOCK = 'eq.rank.engineer-1';
export const MAINTENANCE_UNLOCK = 'eq.system.maintenance-panel';
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
  hallCall: (floor: number) => line('hallCall', { floor }),
  cued: (t: MoveTask, n: number) => line(n === 0 ? 'cuedFirst' : 'cuedNext', moveVars(t)),
  shaft: (t: MoveTask) => line('shaft', moveVars(t)),
  stretch: (t: MoveTask) => line('stretch', moveVars(t)),
  encounterRoute: (t: MoveTask) => line('encounterRoute', moveVars(t)),
  cargo: (capacity: number, aboard: number) => line('cargo', { capacity, aboard }),
  /** The opening line of a job, by its key (twoMoves, startFloor, express, tripMeter, orders). */
  job: (key: string, vars: JobVars) => line(key, vars),
  /** The wrong-floor line of a job, by its key (arrivedWrongTwo, ...): the floor reached, then the givens. */
  arrivedWrongJob: (key: string, floor: number, vars: JobVars) => line(key, { floor, ...vars }),
  ordersWrong: (vars: JobVars) => line('ordersWrong', vars),
  orderPlate: (orderA: number, orderB: number) => line('orderPlate', { orderA, orderB }),
  checkOrder: line('checkOrder'),
  meter: { title: line('meterTitle'), unit: line('meterUnit'), go: line('meterGo'), fewer: line('meterFewer'), more: line('meterMore'), empty: line('meterEmpty') },
  finale: line('finale'),
  finaleOnlyRepair: line('finaleOnlyRepair'),
  alreadyHere: (floor: number) => line('alreadyHere', { floor }),
  arrivedWrong: (floor: number, t: MoveTask, ref: 'beacon' | 'start') => line(ref === 'beacon' ? 'arrivedWrongBeacon' : 'arrivedWrong', { floor, ...moveVars(t) }),
  tryFromHere: line('tryFromHere'),
  regenerated: line('regenerated'),
  /** Specific praise only (D124): the world line ("There it is") does the routine confirming. */
  praise: {
    afterMiss: praise('afterMiss'),
    afterRescue: praise('afterRescue'),
    stretch: praise('stretch'),
    cargo: praise('cargo'),
    orders: praise('orders'),
  },
  overload: (capacity: number) => line('overload', { capacity }),
  underload: line('underload'),
  emptyLoad: line('emptyLoad'),
  /** Stencils on the cargo crates, in turn (presentation only). */
  crateLabels: line('crateLabels').split(/\s+/).filter(Boolean),
  complete: line('complete'),
  completeAgain: line('completeAgain'),
  rankEarned: line('rankEarned'),
  freeRide: line('freeRide'),
  /** The one control that moves on after a success (child-paced; D122). */
  nextJob: line('nextJob'),
  exploreHint: (object: string) => line('exploreHint', { object }),
  doorCloseTip: line('doorCloseTip'),
  /** The Engineer Log (a clipboard in the cabin, after Floor 15 is restored). */
  log: {
    title: line('logTitle'),
    inspected: line('logInspected'),
    notInspected: line('logNotInspected'),
    unknown: line('logUnknown'),
    powered: line('logPowered'),
    unpowered: line('logUnpowered'),
    open: line('logOpen'),
    close: line('logClose'),
    replay: line('logReplay'),
  },
  /** The place sign on an illustrated landing: the floor number beside the name, live text (D136). */
  signNumbered: (floor: number, name: string) => line('signNumbered', { floor, name }),
  /** The building directory: a plate of floor names beside the panel. Information only, never a control (D128). */
  directory: {
    open: line('directoryOpen'),
    title: line('directoryTitle'),
    note: line('directoryNote'),
    close: line('directoryClose'),
  },
  commitTrouble: line('commitTrouble'),
  saveStuck: line('saveStuck'),
  /** Adult-facing recovery panel (a save failed for good). */
  trouble: { title: line('troubleTitle'), body: line('troubleBody'), retry: line('troubleRetry'), exit: line('troubleExit') },
};

/** A job's words: the givens a line may name (see the CONTRACT). */
export type JobVars = Record<string, string | number>;

/** A template filled only if every placeholder has a value; null otherwise (never a raw "{start}" on screen). */
function fillAll(template: string, vars: JobVars): string | null {
  const out = fill(template, vars);
  return /\{[a-zA-Z]+\}/.test(out) ? null : out;
}

/**
 * Misconception tags translated into the building's terms. `vars` are the job's words (a move's,
 * or another job's); null when the copy has no line, or the line needs words this job does not have.
 */
export function misconceptionLine(tag: string, vars: JobVars | null, cargo: CargoGivens | null): string | null {
  const template = COPY.misconceptions[tag];
  if (!template) return null;
  return fillAll(template, { ...(vars ?? {}), ...(cargo ?? {}) });
}

export const helpLabel = (kind: string) => COPY.help[kind]?.label ?? 'HELP';

/** Help words. A job key with its own words (help.<kind>.jobs) uses them; else the move or capacity line. */
export function helpLine(kind: string, vars: JobVars | null, cargo: CargoGivens | null, revealed: number | string | null, job: string | null = null): string {
  const h = COPY.help[kind];
  if (!h) return 'Here is a clue.';
  const template = (job ? h.jobs?.[job] : undefined) ?? (cargo && h.altLine ? h.altLine : h.line);
  return fillAll(template, { ...(vars ?? {}), ...(cargo ?? {}), revealed: revealed ?? '' }) ?? 'Here is a clue.';
}

/** Concept Rescue lines. `focus` is a misconception tag when the evidence is strong, else null. */
export function rescueLine(key: string, vars: Record<string, string | number> = {}): string {
  return fill(COPY.rescue.lines[key] ?? key, vars);
}
export const rescueFocusLine = (focus: string | null) => (focus ? (COPY.rescue.focus[focus] ?? null) : null);
export const moveVarsFor = moveVars;
