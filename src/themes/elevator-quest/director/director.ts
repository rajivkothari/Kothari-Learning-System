// Floor 15 mission director: the Elevator Quest theme adapter.
//
// It turns theme-neutral runtime intents into an elevator world:
//   SHOW_ACTIVITY(positionAfterMove, start 8, change 7, up)  ->  "repair kit is 7 floors up", car waits at 8
//   learner presses 14 on the panel                          ->  a real ride to 14, THEN feedback from the world
//   STEP_COMPLETE                                             ->  checklist line done
//   MISSION_COMPLETE + UNLOCK_GRANTED                          ->  power restored, rank, maintenance panel
//
// What it never does: decide correctness, compute an answer, judge mastery, or invent help.
// Correctness comes from runtime.check (pure, in memory); help comes from the activity's
// scaffolding policy; advancement comes only from committed results.
//
// Corrections (D149). A miss on a practice job shows its consequence in the world (the ride to the
// floor chosen, its move drawn on the shaft map against the job's; a wrong load on the load meter),
// Lifty gives one short cue, and LET'S COUNT waits for the learner. The correction is a Concept
// Rescue on the learner's own job: they count it through on the board. The engine then resolves
// that job as missed and a fresh job of the same kind follows, which the learner solves. Nothing
// counted on the board is evidence; the fresh job is recorded as guided, never independent.
//
// Jobs (jobs.ts). A move, a two-part trip, where-did-it-start and the express are answered on the
// panel (a floor). The trip meter is answered with a count: GO rides that many floors from the job's
// floor, so the world shows the consequence the same way. Cargo jobs are answered in the cargo bay.
//
// Flow of a panel answer:
//   tap 14 -> pressed state (UI thread) + click -> button lights -> doors close -> DEPARTURE
//   at departure the destination is locked: runtime.check (instant) + runtime.submit (durable)
//   the ride plays out -> doors open at 14 -> feedback from the evaluation; advancement from the commit
//
// Answer windows (audit P0). A learner press becomes an academic answer only if it happened while
// that exact item was the active, answer-accepting item. The window opens when a job is presented
// (or re-presented after a miss) and closes the moment an answer is locked, or the job is paused,
// left, or replaced. While it is closed the panel is locked: taps click but cannot light a floor.
// Opening a window cancels any call left over from before it. At departure the call must carry the
// open window's token and the item must still be the window's item, or it is discarded.
//
// Hall calls. Between jobs the next job's floor calls the lift ("We've got a call on Floor 8") and
// the learner presses that floor to go. A hall call is a ride, never an answer: no window opens,
// only the calling floor can light, and the answer window opens at that floor as before.
//
// Child-paced success (D122). After a correct answer the floor shows first (a short arrival beat),
// then Lifty names what we found and the success replay plays, then everything settles and waits.
// Only NEXT JOB (nextJob) moves on to the next job. No timer ever advances the academic sequence,
// and the panel stays locked the whole time, so no tap can answer the next item.
//
// Mission objects (D123). The thing a job talks about stands on the landing: placed at the arrival
// floor only when the locked answer checked correct, so it never shows the way, and absent at a
// wrong floor ("No repair kit here."). Session state only: never stored, never evidence.
//
// Reading jobs (M8). A short note (content/themes/elevator-quest/reading.json, keyed by the item id in
// the prompt) says what to do: touch a thing on a landing (the car goes to that landing like any job,
// and the item's options become the landing's answer targets; a screen that cannot show them touchable
// offers the same options as cards), ride to a floor (a panel answer, like a move), or pick a card.
// The same answer window rules hold, an answer goes through runtime.check / submit like any other,
// and a miss shows its consequence (the thing touched, or the floor reached) with one cue, then the
// same job takes a fresh window; a second miss brings a fresh item (the reading policy). The note
// opens first (read), then folds (answer). CLUE lights the key sentence and opens the note; SHOW ME
// shows the answer (demonstrated): the thing or card glows and only it can be chosen, or the floor is
// ringed. The prompt's authored answer is never read.
//
// The building directory (M8.1). A learner never needs hidden knowledge: a ride that names places
// ("two floors above the Archive") is found with the directory, which lists every floor by name.
// Opening and closing it changes nothing about the job: no answer window, help or evidence moves.
// The first time a job needs it, Lifty introduces it once per learner (world memory, never
// evidence); a learner who already opened it is never interrupted.
//
// Sound (M8.1). A landing thing plays its own sound (its closing sound when it shuts); a right answer
// plays answerRight once as the success begins, a wrong one answerWrong once as the miss is shown,
// and a first discovery plays discovery. Slots, never files (audio/profile.ts).
//
// Exploration (free ride, after Floor 15). Some landings hold one thing to touch. Touching it
// plays a short reaction every time; the first touch is a discovery the world remembers
// (runtime.remember, a world-memory key). Discoveries are never evidence, never value, never a
// currency: they feed the Engineer Log and nothing else.
import {
  NORMAL_TIMING,
  REDUCED_TIMING,
  createElevator,
  isMoving,
  nextWakeAt,
  reduce,
  type ElevatorConfig,
  type ElevatorEvent,
  type ElevatorInput,
  type ElevatorState,
  type ElevatorTiming,
} from '../sim/elevator';
import type { ActivityView, AnswerValue, MissionView, PresentationIntent, RescueView, ResponseCheck } from '../../../engine';
import type { CommandOutcome, GameRuntime } from '../../../runtime/gameRuntime';
import { createCueMapper, type AudioCue, type CueMapper } from '../audio/cues';
import type { SoundSlot } from '../audio/profile';
import { FLOOR15, LINES, MAINTENANCE_UNLOCK, PACING, PROGRESS, RANK_UNLOCK, UNLOCK_LABELS, helpLabel, helpLine, misconceptionLine, replayLine, rescueFocusLine, rescueLine, type JobVars, type MoveTask } from '../content/floor15';
import { LANDINGS, exploreSpots, floor15Restored, landingFor, reactionMs, spotDiscovered, type ExploreSpotEntry } from '../content/landings';
import { spotKey, touchTargets } from './landingTouch';
import { OBJECTIVES, objectiveFor, type ObjectVisual, type ObjectiveEntry } from '../content/objectives';
import { READING, needsDirectory, placesIn, readingHelpLine, readingItem, readingLine, readingMarks, readingMisconceptionLine, type ReadingItem, type ReadingMode } from '../content/reading';
import { chooseReinforcement, replayMs, type StrategyReinforcement } from '../../../presentation/reinforcement/strategy';
import { FIRST_LEG_TAG, cargoOf, jobOf, rankWord, replayPlan, type FloorJob, type JobShape } from './jobs';
import type { PlaytestLog } from './playtestLog';

/** Lifty's states. A maintenance robot's display, not a face that emotes for attention. */
export type LiftyMood = 'neutral' | 'thinking' | 'helping' | 'concerned' | 'satisfied' | 'systemCheck';
/**
 * success: the answer was right; the panel is locked while Lifty reacts, so a late tap cannot answer the next job.
 * pause: the panel is locked while Lifty explains a consequence, just before a Concept Rescue.
 * rescue: Concept Rescue. The job is paused and a test-run example takes the stage.
 * call: a hall call waits for the learner to press its floor. A ride, never an answer.
 */
export type Stage = 'loading' | 'intro' | 'call' | 'reposition' | 'task' | 'riding' | 'success' | 'pause' | 'cargo' | 'rescue' | 'finale' | 'complete' | 'freeRide' | 'error';
export type Motion = 'normal' | 'reduced';

export interface CargoView {
  capacity: number;
  aboard: number;
  waiting: number;
  loaded: number;
  /** mismatch: two orders were asked for and the load is not them (the car cannot say more). */
  status: 'loading' | 'overload' | 'underload' | 'mismatch' | 'accepted';
  /** Two orders to load together, and nothing else. Null: load to the car's limit. */
  orders: [number, number] | null;
}

/** The trip meter: the learner sets how many floors, and GO rides that far from `from`. */
export interface MeterView {
  value: number;
  max: number;
  from: number;
  direction: 'up' | 'down';
}

export interface TaskView {
  /** read: a reading job answered by touching a thing or picking a card (a ride is a 'panel' job). */
  kind: 'panel' | 'shaft' | 'cargo' | 'meter' | 'read';
  stepId: string;
  /** The job as a move from the car's floor, when it is one (help, replay, the words of a move). */
  move: MoveTask | null;
  /** The job in the building's terms (jobs.ts). Null for a cargo job. */
  job: FloorJob | null;
  /** Where the givens are anchored: the car's floor, or a beacon elsewhere in the shaft. */
  reference: 'start' | 'beacon';
  cargo: CargoView | null;
  meter: MeterView | null;
  wrongTries: number;
}

/**
 * Concept Rescue practice board. The learner counts a DIFFERENT example one cell at a time, then
 * says where it ends. Cells are floors (a move) or load spaces (a capacity), never the real job.
 */
export interface RescueStageView {
  kind: 'move' | 'fill';
  /** The example's kind of job, for its words. */
  example: RescueExample;
  phase: 'counting' | 'ask' | 'checking' | 'right';
  /** Cells on the practice board, low to high. */
  cells: number[];
  /** Where counting starts (this part). Never counted itself. Fill: the last occupied space (0 when empty). */
  origin: number;
  direction: 'up' | 'down';
  /** How many taps this part takes: the example's given. */
  steps: number;
  /** Cells between taps: the express jumps a whole stop at a time. 1 otherwise. */
  stride: number;
  /** The parts to count, in order (a two-part trip has two). origin, direction and steps are parts[part]. */
  parts: { origin: number; direction: 'up' | 'down'; steps: number }[];
  part: number;
  /** Cells counted so far in this part, in order. */
  counted: number[];
  /** Fill boards: a counted space is numbered after this many (two orders: the first order is in). */
  countFrom: number;
  /** What the learner says at the end: the cell where it stops, or a count picked from `choices`. */
  asks: 'cell' | 'count';
  /** Fill only: the practice car's limit and what is already aboard. */
  capacity: number | null;
  aboard: number | null;
  /** A count is picked from these. */
  choices: number[] | null;
  /** The example's givens, for its words: a parallel example's, or (a correction) the learner's own job's. */
  words: Record<string, string | number>;
  /** A correction: the learner counts the job they just missed (a fresh job follows). Else a test run on a parallel example. */
  corrective: boolean;
  /** The instruction shown on the board. */
  caption: string;
  /** Misconception-specific framing, only when the evidence was strong. */
  focus: string | null;
}

/**
 * A reading job's note and choices (M8). Built from the item's words and the view's options: never
 * from the prompt's answer, and nothing in it says which option is right until SHOW ME (`shown`).
 */
export interface ReadingView {
  /** The item id (the words' key). Not the answer. */
  item: string;
  mode: ReadingMode;
  /** touch: the landing whose things answer it. */
  floor: number | null;
  title: string;
  lines: string[];
  /** The instruction (Lifty says it; the screen may repeat it over the cards). */
  ask: string;
  /**
   * The note is open on screen: the learner reads. Folded, the learner answers (on the landing, the
   * cards, or the panel) and can open it again. It opens when the job starts and with CLUE; SHOW ME
   * folds it for a touch or card job, so the thing shown is in view.
   */
  open: boolean;
  /** CLUE: the key sentence's index, once the clue was given. */
  highlight: number | null;
  /**
   * Words to set in bold, per sentence of `lines` (same length): character ranges [start, end).
   * The clue words of the note (reading.json `emphasis`); never the answer.
   */
  lineMarks: [number, number][][];
  /** Words to set in bold in `ask`, as `lineMarks`. */
  askMarks: [number, number][];
  /** The job takes an answer now (its answer window is open). Otherwise its things and cards are locked. */
  accepting: boolean;
  /**
   * touch and choose: every option, in the view's order, with its name; tried after a miss on it;
   * shown after SHOW ME (then only the shown one can be chosen).
   */
  options: { optionId: string; value: string; label: string; tried: boolean; shown: boolean }[];
}

export interface DirectorView {
  stage: Stage;
  motion: Motion;
  elevator: ElevatorState;
  timing: ElevatorTiming;
  objective: string;
  progress: { stepId: string; label: string; done: boolean; current: boolean }[];
  lifty: { mood: LiftyMood; line: string; seq: number };
  task: TaskView | null;
  help: { stepId: string; label: string; offered: boolean } | null;
  /** Panel buttons ringed by a clue (never the answer, except for a demonstrated step). */
  highlights: number[];
  beacon: number | null;
  shaftMode: 'status' | 'map' | 'numberLine';
  /**
   * After a miss, the move the learner's answer made, drawn on the shaft map against the job (from
   * the job's floor to where the answer went). The consequence, never the answer. Null otherwise.
   */
  mismatch: { from: number; to: number } | null;
  /** A correction (or test run) is ready and waits for the learner: LET'S COUNT starts it. */
  rescueReady: boolean;
  /** A counting clue on the shaft map. `stride`: floors per count (the express), 1 when absent. */
  countAlong: { from: number; direction: 'up' | 'down'; steps: number; stride?: number } | null;
  power: 'off' | 'on' | 'restoring';
  rescue: RescueStageView | null;
  maintenanceUnlocked: boolean;
  /** The learner's rank plate (from the unlock inventory), or null before the first completion. */
  rank: string | null;
  /** Stage "call": the floor calling the lift. The only floor that can light. Never an answer. */
  hallCall: number | null;
  /** The last landing reaction; a new seq restarts it. Presentation only. */
  reaction: { floor: number; spotId: string; seq: number } | null;
  /** Discovery keys this learner has found (world memory). Never evidence. */
  discoveries: string[];
  /** The Engineer Log (the clipboard) is open. Free ride only. */
  logOpen: boolean;
  /** Two-state landing things open now (the toolbox), as landingTouch.spotKey. Session only; the landing tidies itself when the car leaves. */
  opened: string[];
  /** A short readable card a landing thing opened (the Archive's book). Session only, never evidence. */
  card: { floor: number; spotId: string; title: string; lines: string[]; close: string } | null;
  /**
   * A job that is answered by touching a thing on the landing (read-and-touch): these objects of
   * `floor` are its answer targets while set, and exploration on that landing is off. Null: the
   * landing's objects are for exploring (director/landingTouch.ts).
   */
  answerTargets: { floor: number; objects: string[] } | null;
  /** The reading job on now (its note and choices), or null. */
  reading: ReadingView | null;
  /** Bumps once each time Floor 15 comes back: the panel lamps sweep bottom to top. 0: never. */
  sweep: number;
  /**
   * The one-time directory introduction is on (Lifty said it with this job): the DIRECTORY control
   * pulses. Cleared when the directory opens or the job ends; never shown again for this learner.
   */
  directoryHint: boolean;
  /** Floor 15's landing is restored (powered) for this learner: from the unlock inventory. */
  floor15Restored: boolean;
  /**
   * Success replay after a correct answer: one way to reach the answer, drawn in the world (the
   * shaft map, or the load meter). Presentation only: never recorded, never evidence. Null
   * otherwise, and never after a wrong answer.
   */
  replay: ReplayView | null;
  /** Waiting for a durable commit before the world can advance. */
  saving: boolean;
  /** The success sequence (stage "success" only). In "review" the NEXT JOB control is shown and waits. */
  success: SuccessPhase | null;
  /** Mission objects standing on landings for the current job. Never evidence, never stored. */
  props: MissionProp[];
  /**
   * Set with stage "error": a save failed for good ("save"), or the content cannot be shown
   * ("content"). The screen offers an adult TRY AGAIN, which reloads from the last durable save.
   */
  trouble: 'save' | 'content' | null;
}

/** A mission object on a landing (session only). */
export interface MissionProp {
  id: string;
  floor: number;
  visual: ObjectVisual;
  /** collected: loaded into the lift (it leaves the landing). */
  state: 'present' | 'collected';
  /** One optional tap loads it into the lift. */
  interactive: boolean;
  label: string;
  action: string | null;
}

/** After a correct answer: the floor first, then the replay plays, then it settles and waits for NEXT JOB. */
export type SuccessPhase = 'arrival' | 'animating' | 'review';

export interface ReplayView extends StrategyReinforcement {
  /** How many of `steps` are shown so far (all at once under reduced motion). */
  revealed: number;
  text: string;
}

export interface Scheduler {
  (fn: () => void, delayMs: number): { cancel(): void };
}

export interface DirectorDeps {
  runtime: GameRuntime;
  learnerId: string;
  instanceId: string;
  clock: { now(): number };
  schedule: Scheduler;
  motion: Motion;
  onAudio?: (cues: AudioCue[]) => void;
  log?: PlaytestLog;
  /** Make a fresh mission instance id for "play again". */
  newInstanceId?: () => string;
}

export interface Director {
  getView(): DirectorView;
  subscribe(listener: (v: DirectorView) => void): () => void;
  start(): Promise<void>;
  pressFloor(floor: number, via?: 'panel' | 'shaft'): void;
  pressDoorOpen(): void;
  pressDoorClose(): void;
  requestHelp(): void;
  /** A tap on the Concept Rescue board: a cell while counting, a cell or a choice when asked. */
  rescueTap(n: number): void;
  /** LET'S COUNT: start the correction (or test run) that is waiting after a miss. */
  beginRescue(): void;
  loadCrate(): void;
  unloadCrate(): void;
  /** Trip meter: one floor more (+1) or fewer (-1). Only while the job is waiting for an answer. */
  meterStep(delta: 1 | -1): void;
  /** Trip meter: lock the count and ride that many floors from the job's floor. */
  meterGo(): void;
  setMotion(motion: Motion): void;
  playAgain(): Promise<void>;
  /** After a correct answer, once the success has settled: go on to the next job. The only way on. */
  nextJob(): void;
  /** Load a mission object (repair kit, toolbox, parts) into the lift. Optional; never evidence. */
  collect(objectId: string): void;
  /** Free ride, doors open: touch the landing's spot. A reaction every time; a discovery once. */
  inspect(spotId: string): void;
  /**
   * A touch on a landing object (its hotspot): an answer when a job made it an answer target, else
   * the object's exploration spot (landingTouch.ts says which, and when nothing reacts).
   */
  touchObject(objectId: string): void;
  /** Put away the reading card a landing thing opened. */
  closeCard(): void;
  /**
   * Theme-internal (a read-and-touch job's flow, and tests); the screen never calls it. Makes these
   * objects on `floor` the job's answer targets, each touch handed to `onTouch`, or ends that (null).
   * The flow owns the answer: it checks its own answer window and goes through runtime.check / submit.
   */
  setAnswerTargets(targets: { floor: number; objects: string[] } | null, onTouch?: (objectId: string) => void): void;
  /**
   * A reading job's card (`value`: an option's value): the same answer, the same commands and the
   * same evidence as touching that thing. Only while the job's answer window is open, one answer per
   * window; after SHOW ME only the shown option. Anything else is ignored (and logged).
   */
  chooseReading(value: string): void;
  /** Open the reading job's note again, or fold it away (to answer: the landing, the cards or the panel in view). */
  openNote(): void;
  closeNote(): void;
  openLog(): void;
  closeLog(): void;
  /**
   * The building directory opened (the screen's DIRECTORY control). Information only: the job, its
   * answer window and its help stay exactly as they were; nothing is checked or recorded as learning.
   * The learner has met the directory now, so its introduction never comes (world memory).
   */
  directoryOpened(): void;
  /** The building directory closed. Logged only. */
  directoryClosed(): void;
  /** After stage "error": reload the mission from its last durable save and carry on from there. */
  recover(): Promise<void>;
  instanceId(): string;
  /** Resolves when no commit or help request is in flight (tests, orderly shutdown). */
  idle(): Promise<void>;
  dispose(): void;
}

/** `leg`: the first part of a two-part trip, ridden as a step (not an answer). */
type TripKind = 'answer' | 'leg' | 'reposition' | 'finale' | 'free';

/** The item currently accepting a panel answer. Null: no press can be an answer right now. */
interface AnswerWindow {
  token: number;
  itemSignature: string;
}

interface PendingAnswer {
  /** A floor, a count, or (a reading job's touch or card) an option's value. */
  value: AnswerValue;
  check: ResponseCheck;
  arrived: boolean;
  outcome: CommandOutcome | null;
  floor: number;
}

/** The kind of example on the board, for its words. A ten and some ones has three wordings. */
export type RescueExample = 'move' | 'fill' | 'orders' | Exclude<JobShape, 'move'> | 'tenJump' | 'tensFromZero';

const timingFor = (m: Motion) => (m === 'reduced' ? REDUCED_TIMING : NORMAL_TIMING);
const pauseFor = (m: Motion) => (m === 'reduced' ? PACING.successPauseReducedMs : PACING.successPauseMs);

/**
 * Timing for rides the game takes by itself (repositioning to the next job). Only travel scales:
 * doors keep their normal feel, so the world stays consistent. The ride itself always happens.
 */
export function autoRideTiming(t: ElevatorTiming, scale: number): ElevatorTiming {
  const k = Math.min(1.5, Math.max(0.3, scale));
  return { ...t, departMs: Math.round(t.departMs * k), accelMs: Math.round(t.accelMs * k), decelMs: Math.round(t.decelMs * k), perFloorMs: Math.round(t.perFloorMs * k) };
}

/**
 * Build the practice board for a rescue example. Pure; the example comes from the engine. The
 * learner counts the example's parts cell by cell, then names where it stops (or how many).
 */
export function rescueBoard(r: RescueView, min: number, max: number): Omit<RescueStageView, 'caption' | 'focus'> | null {
  const p = r.example.prompt;
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  const dir = (v: unknown): 'up' | 'down' => (v === 'down' ? 'down' : 'up');
  const back = (d: 'up' | 'down'): 'up' | 'down' => (d === 'up' ? 'down' : 'up');
  const around = (floors: number[]) => range(Math.max(min, Math.min(...floors) - 1), Math.min(max, Math.max(...floors) + 1));
  type Part = RescueStageView['parts'][number];
  const board = (b: { kind: RescueStageView['kind']; example: RescueExample; cells: number[]; parts: Part[]; words: RescueStageView['words'] } & Partial<Pick<RescueStageView, 'stride' | 'countFrom' | 'asks' | 'capacity' | 'aboard' | 'choices'>>): Omit<RescueStageView, 'caption' | 'focus'> => {
    const first = b.parts[0]!;
    return { phase: 'counting', counted: [], part: 0, stride: 1, countFrom: 0, asks: 'cell', capacity: null, aboard: null, choices: null, corrective: r.source === 'target', ...b, origin: first.origin, direction: first.direction, steps: first.steps };
  };
  switch (r.example.concept) {
    case 'positionAfterMove': {
      const [start, change] = [n(p.start), n(p.change)];
      if (start === null || change === null) return null;
      const direction = dir(p.direction);
      const end = direction === 'down' ? start - change : start + change;
      return board({ kind: 'move', example: 'move', cells: around([start, end]), parts: [{ origin: start, direction, steps: change }], words: { exStart: start, exChange: change, exDir: direction } });
    }
    case 'positionAfterTwoMoves': {
      const [start, change, change2] = [n(p.start), n(p.change), n(p.change2)];
      if (start === null || change === null || change2 === null) return null;
      const [d1, d2] = [dir(p.direction), dir(p.direction2)];
      const middle = start + (d1 === 'up' ? change : -change);
      const end = middle + (d2 === 'up' ? change2 : -change2);
      const parts = [{ origin: start, direction: d1, steps: change }, { origin: middle, direction: d2, steps: change2 }];
      return board({ kind: 'move', example: 'twoMoves', cells: around([start, middle, end]), parts, words: { exStart: start, exChange: change, exDir: d1, exChangeTwo: change2, exDirTwo: d2 } });
    }
    case 'startBeforeMove': {
      const [end, change] = [n(p.end), n(p.change)];
      if (end === null || change === null) return null;
      const rode = dir(p.direction);
      const start = end + (rode === 'up' ? -change : change);
      return board({ kind: 'move', example: 'startFloor', cells: around([start, end]), parts: [{ origin: end, direction: back(rode), steps: change }], words: { exEnd: end, exChange: change, exRode: rode, exDir: back(rode) } });
    }
    case 'equalJumps': {
      const [step, count] = [n(p.step), n(p.count)];
      if (step === null || count === null || step < 1) return null;
      return board({ kind: 'move', example: 'express', cells: range(Math.max(min, 1), Math.min(max, step * count + 1)), parts: [{ origin: 0, direction: 'up', steps: count }], stride: step, words: { exStep: step, exCount: count } });
    }
    case 'distanceBetween': {
      const [from, to] = [n(p.from), n(p.to)];
      if (from === null || to === null || from === to) return null;
      const steps = Math.abs(to - from);
      const choices = range(1, Math.min(max - min, Math.max(10, steps + 2)));
      return board({ kind: 'move', example: 'tripMeter', cells: around([from, to]), parts: [{ origin: from, direction: to > from ? 'up' : 'down', steps }], asks: 'count', choices, words: { exFrom: from, exTo: to } });
    }
    case 'fillToCapacity': {
      const [capacity, aboard] = [n(p.capacity), n(p.aboard)];
      if (capacity === null || aboard === null) return null;
      return board({ kind: 'fill', example: 'fill', cells: range(1, capacity), parts: [{ origin: aboard, direction: 'up', steps: capacity - aboard }], asks: 'count', capacity, aboard, choices: range(1, capacity), words: { exCapacity: capacity, exAboard: aboard } });
    }
    case 'combineGroups': {
      const [first, second, waiting] = [n(p.first), n(p.second), n(p.waiting)];
      if (first === null || second === null || waiting === null) return null;
      // Count on: the first order is already in; each tap is the next crate of the second.
      return board({ kind: 'fill', example: 'orders', cells: range(1, waiting), parts: [{ origin: first, direction: 'up', steps: second }], countFrom: first, asks: 'count', capacity: waiting, aboard: first, choices: range(1, waiting), words: { exOrderA: first, exOrderB: second, exNext: first + 1 } });
    }
    case 'missingInSequence': {
      // Count the lamps from the first one, a whole step at a time, up to the one that is out.
      const [first, step, length, missing] = [n(p.first), n(p.step), n(p.length), n(p.missing)];
      if (first === null || step === null || length === null || missing === null || step < 1 || missing < 1 || missing >= length) return null;
      const direction = dir(p.direction);
      const sign = direction === 'up' ? 1 : -1;
      const terms = Array.from({ length }, (_, k) => first + sign * step * k);
      const gap = terms[missing] as number;
      const pattern = terms.map((t, k) => (k === missing ? '?' : String(t))).join(', ');
      return board({ kind: 'move', example: 'sequence', cells: around([first, gap]), parts: [{ origin: first, direction, steps: missing }], stride: step, words: { exPattern: pattern, exStep: step, exFirst: first, exDir: direction } });
    }
    case 'tensAndOnes': {
      // Count the ten floor by floor (a ten is ten floors), then the ones, from where the ten ended.
      const [start, tens, ones] = [n(p.start), n(p.tens), n(p.ones)];
      if (start === null || tens !== 1 || ones === null || ones < 0) return null;
      const direction = dir(p.direction);
      const sign = direction === 'up' ? 1 : -1;
      const afterTen = start + sign * 10;
      const end = afterTen + sign * ones;
      const parts = [{ origin: start, direction, steps: 10 }, ...(ones > 0 ? [{ origin: afterTen, direction, steps: ones }] : [])];
      const example: RescueExample = start === 0 ? 'tensFromZero' : ones === 0 ? 'tenJump' : 'tens';
      const cells = start < min ? range(min, Math.min(max, end + 1)) : around([start, end]);
      return board({ kind: 'move', example, cells, parts, words: { exStart: start, exOnes: ones, exDir: direction, exChange: 10 } });
    }
    case 'orderPositions': {
      // Ride past the calls in the order of travel: from the first call met, count on to each next
      // one, up to the call asked for (so the board stops on it). The content asks for the second
      // call or later: the first call met is where the count starts.
      const calls = [n(p.first), n(p.second), ...(p.third === undefined ? [] : [n(p.third)])];
      const rank = n(p.rank);
      if (calls.some((c) => c === null) || rank === null || rank < 2 || rank > calls.length) return null;
      const direction = dir(p.direction);
      const met = (calls as number[]).sort((a, b) => (direction === 'up' ? a - b : b - a));
      const parts = met.slice(1, rank).map((c, k) => ({ origin: met[k] as number, direction, steps: Math.abs(c - (met[k] as number)) }));
      return board({ kind: 'move', example: 'order', cells: around(met), parts, words: { exDir: direction, exFirstCall: met[0] as number, exRank: rankWord(rank) } });
    }
    default:
      return null;
  }
}

/** The example's taught answer, for the words after it is said right. Never the real job's. */
function exampleAnswer(b: Pick<RescueStageView, 'kind' | 'asks' | 'parts' | 'stride' | 'countFrom'>): number {
  const last = b.parts[b.parts.length - 1]!;
  if (b.kind === 'fill') return b.countFrom + last.steps;
  if (b.asks === 'count') return last.steps;
  return last.origin + (last.direction === 'down' ? -1 : 1) * b.stride * last.steps;
}

export function createFloor15Director(deps: DirectorDeps): Director {
  const { runtime, clock } = deps;
  let instanceId = deps.instanceId;
  let motion: Motion = deps.motion;
  let config: ElevatorConfig = { minFloor: FLOOR15.floors.min, maxFloor: FLOOR15.floors.max, timing: timingFor(motion) };
  let cues: CueMapper = createCueMapper({ decelFadeMs: config.timing.decelMs });
  const listeners = new Set<(v: DirectorView) => void>();
  let wake: { cancel(): void } | null = null;
  let disposed = false;
  const timers = new Set<{ cancel(): void }>();
  const schedule: Scheduler = (fn, ms) => {
    if (disposed) return { cancel() {} };
    const timer = deps.schedule(() => {
      timers.delete(handle);
      if (!disposed) fn();
    }, ms);
    const handle = { cancel() { timer.cancel(); timers.delete(handle); } };
    timers.add(handle);
    return handle;
  };
  let seq = 0;
  let commands = 0;
  let inFlight: Promise<unknown> = Promise.resolve();

  let mission: MissionView | null = null;
  let revision = 0;
  let tripKind: TripKind | null = null;
  let pending: PendingAnswer | null = null;
  let changedPlan = false;
  /** This job's two-part trip has had its first leg ridden (once per job). */
  let legRidden = false;
  /** How the in-window answer was chosen: on the panel, or on the shaft map (an observation). */
  let answerVia: 'panel' | 'shaft' | null = null;
  let pressVia: 'panel' | 'shaft' = 'panel';
  /** The current job came back from a Concept Rescue (same item, or a fresh one in its place). */
  let afterRescue = false;
  /** Why a reposition ride started: the task line that follows depends on it. */
  let repositionCause: 'advance' | 'rescueReturn' | 'meterReturn' = 'advance';
  /** Timing in force before an automatic ride sped up travel; restored when the doors open. */
  let autoRideRestore: ElevatorTiming | null = null;
  let taskStartedAt = 0;
  /** A motion change requested mid-ride waits until the car is at rest (timing must not change under a trip). */
  let pendingMotion: Motion | null = null;
  let answerWindow: AnswerWindow | null = null;
  let windowSeq = 0;
  /** Token of the window in which the waiting destination was chosen. Null: chosen outside any window. */
  let destinationToken: number | null = null;
  /** World memory for this learner (discoveries, tips shown). Loaded at start; written once per key. */
  const memory = new Set<string>();
  /** Floors the learner lit this session (for the DOOR CLOSE tip, which waits for a few rides). */
  let learnerRides = 0;
  /** When each landing spot's running reaction ends (floor/spot key): touches before then are ignored. */
  const reactionEnds = new Map<string, number>();
  let reactionSeq = 0;
  /** The read-and-touch flow's handler for a touch on one of its answer targets. */
  let onAnswerTouch: ((objectId: string) => void) | null = null;
  /**
   * The reading job on now: its words, its options as presented (kept with the job, so a fresh item
   * waiting behind a miss never shows through), what was tried, what CLUE and SHOW ME gave.
   */
  let reading: { words: ReadingItem; item: string; options: { id: string; value: string }[]; tried: string[]; open: boolean; highlight: number | null; shown: string | null } | null = null;
  /** The committed outcome of a correct answer, waiting for NEXT JOB. */
  let pendingAdvance: CommandOutcome | null = null;
  /** The next job's tools, held back while its hall call is answered. */
  let jobTools: Partial<DirectorView> | null = null;
  /** The correction (or test run) waiting for LET'S COUNT, after a miss showed its consequence. */
  let waitingRescue: RescueView | null = null;
  /** The job came back fresh after a correction: its first answer is the follow-up worth recording. */
  let followUp: { stepId: string; helpUsed: boolean } | null = null;
  /** The last correction returned to a fresh job (its words say so). */
  let freshAfterRescue = false;
  /** The building directory is open on screen now (directoryOpened / directoryClosed). Session only. */
  let directoryOpenNow = false;

  let view: DirectorView = {
    stage: 'loading',
    motion,
    elevator: createElevator(config, FLOOR15.homeFloor, clock.now(), 'closed'),
    timing: config.timing,
    objective: FLOOR15.objective,
    progress: PROGRESS.map((p) => ({ ...p, done: false, current: false })),
    lifty: { mood: 'neutral', line: '', seq: 0 },
    task: null,
    help: null,
    highlights: [],
    beacon: null,
    shaftMode: 'status',
    countAlong: null,
    mismatch: null,
    rescueReady: false,
    power: 'off',
    rescue: null,
    maintenanceUnlocked: false,
    rank: null,
    hallCall: null,
    reaction: null,
    discoveries: [],
    logOpen: false,
    opened: [],
    card: null,
    answerTargets: null,
    reading: null,
    sweep: 0,
    directoryHint: false,
    floor15Restored: false,
    replay: null,
    saving: false,
    trouble: null,
    success: null,
    props: [],
  };

  const log = (kind: string, data: Record<string, unknown> = {}) => deps.log?.record(clock.now(), kind, data);
  const emit = () => {
    if (disposed) return;
    for (const l of listeners) l(view);
  };
  const set = (patch: Partial<DirectorView>) => {
    if (disposed) return;
    view = { ...view, ...patch };
    emit();
  };
  const say = (line: string, mood: LiftyMood = 'neutral') => set({ lifty: { line, mood, seq: ++seq } });
  /** Lifty stays in the scene with nothing to say (routine rides, arrivals with nothing new). */
  const quiet = () => {
    if (view.lifty.line) set({ lifty: { line: '', mood: 'neutral', seq: ++seq } });
  };
  const nextCommandId = () => `${instanceId}:cmd${++commands}:${clock.now()}`;
  const track = <T>(p: Promise<T>): Promise<T> => {
    inFlight = inFlight.then(() => p.catch(() => undefined));
    return p;
  };

  /**
   * Stop safely when saving keeps failing (or content cannot be shown). Never a silent spinner:
   * the screen says what happened and offers TRY AGAIN. Nothing is retried behind the learner.
   */
  function fail(kind: 'save' | 'content', detail: string) {
    closeAnswerWindow('trouble');
    pending = null;
    set({ stage: 'error', saving: false, trouble: kind, help: null, highlights: [], directoryHint: false });
    say(kind === 'save' ? LINES.saveStuck : LINES.commitTrouble, 'concerned');
    log('trouble', { kind, detail });
  }

  /** Reload the durable checkpoint into memory after a failed commit. Fails safely. */
  function reloadCheckpoint(after?: () => void) {
    void runtime.activate(instanceId).then(
      (r) => {
        if (disposed) return;
        revision = r.revision;
        after?.();
      },
      (e: unknown) => fail('save', String(e)),
    );
  }

  // ---------- world memory ----------

  /**
   * Remember a world-memory key for this learner, once. True the first time. The write is
   * idempotent and runs in its own transaction; it never touches learning records.
   */
  function remember(key: string): boolean {
    if (memory.has(key)) return false;
    memory.add(key);
    void track(runtime.remember(deps.learnerId, key).catch((e: unknown) => {
      // The optimistic discovery is not durable. Allow the next inspection to retry it.
      memory.delete(key);
      set({ discoveries: discoveriesNow() });
      log('memory.error', { key, error: String(e) });
    }));
    return true;
  }
  const discoveriesNow = () => [...memory].filter((k) => k.startsWith(DISCOVERY_PREFIX)).sort();

  /**
   * The directory's introduction, the first time a job needs it (a ride naming places, or a job line
   * naming one): once per learner, never while the directory is open, never once the learner has
   * opened it. Returns Lifty's words for it (said with the job's own line), or null.
   */
  function directoryIntro(needed: boolean): string | null {
    if (!needed || directoryOpenNow || memory.has(DIRECTORY_TIP)) return null;
    remember(DIRECTORY_TIP);
    set({ directoryHint: true });
    log('tip', { key: DIRECTORY_TIP });
    return LINES.directory.intro;
  }

  /** One sound, once, now. The mix spaces repeats of a slot (audio/profile.ts gapMs). */
  function playSound(slot: SoundSlot) {
    audioExtra({ at: clock.now(), action: 'play', slot });
  }

  // ---------- answer windows ----------

  const currentSignature = () => {
    try {
      return runtime.currentView(instanceId).view.activity?.itemSignature ?? null;
    } catch {
      return null; // not active (recovering): nothing can be answered
    }
  };

  /** Present the visible item for answering: any older call is dropped, then the panel unlocks. */
  function openAnswerWindow() {
    const itemSignature = mission?.activity?.itemSignature ?? null;
    answerWindow = itemSignature ? { token: ++windowSeq, itemSignature } : null;
    destinationToken = null;
    answerVia = null;
    apply({ type: 'cancelCall', at: clock.now() });
    // A trip meter job is answered on the meter, a reading touch or card on the landing or the cards:
    // the floor buttons stay locked.
    apply({ type: 'setPanel', at: clock.now(), enabled: answerWindow !== null && view.task?.kind !== 'meter' && view.task?.kind !== 'read', disabledFloors: [] });
    log('answer.window', { open: answerWindow !== null, token: answerWindow?.token ?? null });
    // A reading job's cards and things unlock with the window.
    if (reading) set({ reading: readingView() });
  }

  /** No press can answer until a window opens again. The panel locks (taps still click). */
  function closeAnswerWindow(reason: string, lockPanel = true) {
    if (answerWindow) log('answer.window', { open: false, token: answerWindow.token, reason });
    answerWindow = null;
    destinationToken = null;
    if (lockPanel) apply({ type: 'setPanel', at: clock.now(), enabled: false });
    if (reading && view.reading?.accepting) set({ reading: readingView() });
  }

  /** Whether a press right now may become an answer to the window's item. */
  const windowAccepts = () => answerWindow !== null && view.stage === 'task' && tripKind === 'answer' && pending === null && mission?.activity?.itemSignature === answerWindow.itemSignature;

  // ---------- elevator ----------

  function apply(input: ElevatorInput) {
    if (disposed) return;
    const r = reduce(config, view.elevator, input);
    view = { ...view, elevator: r.state };
    const audio = cues.map(r.events);
    if (audio.length) deps.onAudio?.(audio);
    for (const e of r.events) onElevatorEvent(e);
    scheduleWake();
    emit();
  }

  function scheduleWake() {
    wake?.cancel();
    wake = null;
    const at = nextWakeAt(config, view.elevator);
    if (at === null || disposed) return;
    wake = schedule(() => apply({ type: 'tick', at: clock.now() }), Math.max(0, at - clock.now()));
  }

  function audioExtra(cue: AudioCue) {
    if (disposed) return;
    const out = cues.extra(cue);
    if (out.length) deps.onAudio?.(out);
  }

  function onElevatorEvent(e: ElevatorEvent) {
    switch (e.type) {
      case 'buttonPressed': {
        const inWindow = e.source === 'learner' && e.accepted && windowAccepts();
        if (e.source === 'learner') log('panel.press', { floor: e.floor, accepted: e.accepted, reason: e.reason, window: inWindow ? answerWindow!.token : null });
        if (e.reason === 'lit' || e.reason === 'replaced') destinationToken = inWindow ? answerWindow!.token : null;
        if (inWindow && (e.reason === 'lit' || e.reason === 'replaced' || e.reason === 'here')) answerVia = pressVia;
        if (e.reason === 'replaced' && inWindow) changedPlan = true;
        // Choosing the floor the car is already on is still an answer (the job may be right here).
        if (e.reason === 'here' && inWindow && view.elevator.destination === null) answerInPlace(e.floor);
        // Already on the repair floor with the doors open at the finale: finish without a ride.
        // (With the doors closed, pressing 15 reopens them and the door opening finishes instead.)
        if (e.reason === 'here' && view.stage === 'finale' && e.floor === FLOOR15.repairFloor && e.source === 'learner' && view.elevator.phase === 'idleOpen') {
          schedule(() => finish(), motion === 'reduced' ? 250 : 700);
        }
        if (e.reason === 'unavailable' && view.stage === 'finale') say(LINES.finaleOnlyRepair, 'helping');
        if (view.stage === 'call' && e.source === 'learner' && view.hallCall !== null) {
          if (e.accepted && e.reason === 'lit' && e.floor === view.hallCall) takeHallCall(e.floor);
          else if (e.reason === 'unavailable') say(LINES.hallCall(view.hallCall), 'systemCheck');
        }
        if (e.source === 'learner' && e.accepted && e.reason === 'lit') {
          learnerRides += 1;
          maybeDoorCloseTip();
        }
        break;
      }
      case 'doorButton':
        log('door.press', { button: e.button, accepted: e.accepted });
        // Someone who already closes the doors to go sooner never needs the tip.
        if (e.button === 'close' && e.accepted && view.elevator.destination !== null) remember(DOOR_CLOSE_TIP);
        break;
      case 'departing':
        log('elevator.depart', { from: e.from, to: e.to, kind: tripKind });
        if (tripKind === 'free') quiet();
        // The landing goes out of view: its reaction, anything opened and a reading card are done.
        if (view.reaction || view.opened.length || view.card) set({ reaction: null, opened: [], card: null });
        if (tripKind === 'answer' && pending === null) {
          // The call must come from the open window, for the item that is still on screen.
          // (A trip meter answer is locked at GO, before the ride: pending is already set.)
          const valid = answerWindow !== null && destinationToken === answerWindow.token && currentSignature() === answerWindow.itemSignature;
          if (valid && isFirstLeg(e.from, e.to)) rideLeg(e.to);
          else if (valid) lockAnswer(e.to);
          else log('answer.discarded', { floor: e.to, token: destinationToken, window: answerWindow?.token ?? null });
        }
        break;
      case 'arrived':
        log('elevator.arrive', { floor: e.floor, kind: tripKind });
        if (tripKind === 'answer' && pending) placeFound(e.floor);
        break;
      case 'doorsOpened':
        if (autoRideRestore) {
          setTiming(autoRideRestore);
          autoRideRestore = null;
        }
        applyPendingMotion();
        onRideComplete();
        if (tripKind === 'free') arrivalBeat();
        break;
      default:
        break;
    }
  }

  // ---------- mission flow ----------

  function progressFor(stepId: string | null, completed: boolean) {
    const at = stepId ? PROGRESS.findIndex((p) => p.stepId === stepId) : -1;
    return PROGRESS.map((p, i) => ({ ...p, done: completed || (at >= 0 && i < at), current: !completed && i === at }));
  }

  function enter(next: MissionView, cause: 'start' | 'resume' | 'advance' | 'rescueReturn') {
    closeAnswerWindow('enter', false);
    mission = next;
    pending = null;
    jobTools = null;
    waitingRescue = null;
    if (cause !== 'rescueReturn') freshAfterRescue = false;
    pendingAdvance = null;
    changedPlan = false;
    legRidden = false;
    reading = null;
    onAnswerTouch = null;
    afterRescue = cause === 'rescueReturn' || next.activity?.rescue?.status === 'done';
    taskStartedAt = clock.now();
    const base: Partial<DirectorView> = {
      progress: progressFor(next.step?.id ?? null, next.status === 'completed'),
      task: null,
      help: null,
      highlights: [],
      beacon: null,
      shaftMode: 'status',
      countAlong: null,
      mismatch: null,
      rescueReady: false,
      rescue: null,
      replay: null,
      saving: false,
      hallCall: null,
      logOpen: false,
      card: null,
      // A read-and-touch job sets its targets when it presents itself (setAnswerTargets).
      answerTargets: null,
      reading: null,
      success: null,
      props: [],
      // The job the introduction came with is over.
      directoryHint: false,
    };

    if (next.status === 'completed') {
      // Coming back to a finished mission: the building is the game now. Stand at the restored
      // floor with the doors open, controls free.
      set({ ...base, power: 'on' });
      apply({ type: 'place', at: clock.now(), floor: FLOOR15.repairFloor, doors: 'open' });
      enterFreeRide(LINES.freeRide);
      return;
    }
    if (next.narrative?.eventKey === 'mission.intro') {
      set({ ...base, stage: 'intro', power: 'off' });
      apply({ type: 'place', at: clock.now(), floor: FLOOR15.homeFloor, doors: 'closed' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      say(LINES.intro, 'helping');
      return;
    }
    if (next.narrative) {
      // Finale: only the repair floor is a sensible destination now.
      const others = range(FLOOR15.floors.min, FLOOR15.floors.max).filter((f) => f !== FLOOR15.repairFloor);
      set({ ...base, stage: 'finale', power: 'on', highlights: [FLOOR15.repairFloor] });
      if (cause !== 'advance') apply({ type: 'place', at: clock.now(), floor: FLOOR15.finaleRestoreFloor, doors: 'open' });
      apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: others });
      tripKind = 'finale';
      say(cause === 'resume' ? `${LINES.resume} ${LINES.finale}` : LINES.finale, 'helping');
      log('task', { stepId: next.step?.id, kind: 'finale' });
      return;
    }
    const activity = next.activity;
    if (!activity) return;
    const helpView = helpFor(activity, false);

    if (activity.concept === READING_CONCEPT) {
      const words = readingItem(READING, activity.prompt.item);
      if (!words) {
        set(base);
        fail('content', `no reading words in ${activity.stepId}`);
        return;
      }
      enterReading(activity, words, helpView, base, cause);
      return;
    }

    const loads = cargoOf(activity);
    if (loads) {
      const { capacity, aboard, waiting, orders } = loads;
      const cargo: CargoView = { capacity, aboard, waiting, loaded: 0, status: 'loading', orders };
      // The cargo bay takes the cabin view, crates and all; the dock prop would only peek through its gaps.
      set({ ...base, stage: 'cargo', power: 'on', task: { kind: 'cargo', stepId: activity.stepId, move: null, job: null, reference: 'start', cargo, meter: null, wrongTries: activity.wrongTries }, help: helpView });
      if (view.elevator.phase !== 'idleOpen') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      if (activity.rescue?.status === 'active') return startRescue(activity.rescue);
      const words = orders ? ordersVars(orders) : null;
      const fresh = cause === 'rescueReturn' && freshAfterRescue;
      const jobLine = words ? LINES.job('orders', words) : LINES.cargo(capacity, aboard);
      const cargoLine = fresh
        ? `${LINES.freshJob} ${jobLine}`
        : cause === 'rescueReturn'
          ? words
            ? rescueLine('backOrders', words)
            : rescueLine('backFill', { capacity, aboard })
          : jobLine;
      if (fresh) startFollowUp(activity.stepId);
      const intro = directoryIntro(namesPlace(cargoLine));
      say([cause === 'resume' ? LINES.resume : '', cargoLine, intro ?? ''].filter(Boolean).join(' '), 'helping');
      log('task', { stepId: activity.stepId, kind: 'cargo', capacity, aboard, waiting, orders, challenge: activity.challenge });
      return;
    }

    const job = jobOf(activity);
    if (!job) {
      set(base);
      fail('content', `no job in ${activity.stepId}`);
      return;
    }
    const move = job.move;
    // A stretch move is measured from a beacon elsewhere in the shaft: the car stays where it is.
    const reference: TaskView['reference'] = activity.challenge === 'stretch' && job.shape === 'move' ? 'beacon' : 'start';
    const kind: TaskView['kind'] = job.meter ? 'meter' : activity.representation === 'verticalScale' ? 'shaft' : 'panel';
    const meter: MeterView | null = job.meter ? { value: 0, ...job.meter } : null;
    const task: TaskView = { kind, stepId: activity.stepId, move, job, reference, cargo: null, meter, wrongTries: activity.wrongTries };
    // Where the car waits for the job. The express runs from the bottom of the building: anywhere will do.
    const anchor = reference === 'start' ? job.anchor : null;
    // The beacon marks a given floor in the shaft: the reference, or the crew's floor a trip is measured to.
    const beacon = reference === 'beacon' ? job.anchor : job.shape === 'tripMeter' ? Number(job.vars.to) : null;
    // The job's own tools (help, beacon, shaft map) appear with the job, not during the call before it.
    const tools: Partial<DirectorView> = { help: helpView, beacon, shaftMode: kind === 'shaft' ? 'map' : 'status' };
    const hallCall = cause === 'advance' && anchor !== null && view.elevator.floor !== anchor && activity.rescue?.status !== 'active';
    // A reference object (the beacon) stands on its given floor for the whole job: it is a given.
    const ref = objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'reference', activity.activityId);
    set({ ...base, power: 'on', task, ...(hallCall ? {} : tools), props: ref && move ? [propFor(ref, move.start)] : [] });
    jobTools = hallCall ? tools : null;
    log('task', { stepId: activity.stepId, kind, shape: job.shape, ...job.vars, reference, challenge: activity.challenge, cued: activity.cued, item: activity.item });

    if (activity.rescue?.status === 'active') {
      if (anchor !== null && view.elevator.floor !== anchor) apply({ type: 'place', at: clock.now(), floor: anchor, doors: 'open' });
      return startRescue(activity.rescue);
    }

    if (anchor !== null && view.elevator.floor !== anchor) {
      if (cause === 'advance') return offerHallCall(anchor);
      if (cause === 'rescueReturn') {
        // Back from a test run: a real ride to the job's floor, which the lift takes by itself.
        say(LINES.reposition(anchor), 'systemCheck');
        rideBy(anchor, cause);
        return;
      }
      apply({ type: 'place', at: clock.now(), floor: anchor, doors: 'open' });
    }
    beginTask(cause);
  }

  /**
   * The next job's floor calls the lift. Only that floor can light, so the press is a ride the
   * learner operates, never an answer: no answer window is open, and none opens until the doors
   * open at the calling floor.
   */
  function offerHallCall(floor: number) {
    tripKind = 'reposition';
    repositionCause = 'advance';
    set({ stage: 'call', hallCall: floor });
    apply({ type: 'cancelCall', at: clock.now() });
    apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: range(FLOOR15.floors.min, FLOOR15.floors.max).filter((f) => f !== floor) });
    say(LINES.hallCall(floor), 'systemCheck');
    log('hallCall', { floor });
  }

  /**
   * A ride the lift takes by itself (back to the job's floor). Travel runs at the theme's auto-ride
   * pace; the doors keep their normal feel. The panel stays locked; the ride itself always happens.
   */
  function rideBy(floor: number, cause: 'rescueReturn' | 'meterReturn') {
    set({ stage: 'reposition' });
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
    tripKind = 'reposition';
    repositionCause = cause;
    const phase = view.elevator.phase;
    if ((phase === 'idleOpen' || phase === 'idleClosed') && PACING.autoRideTimeScale !== 1) {
      autoRideRestore = config.timing;
      setTiming(autoRideTiming(config.timing, PACING.autoRideTimeScale));
    }
    apply({ type: 'press', floor, at: clock.now(), source: 'system' });
  }

  function takeHallCall(floor: number) {
    set({ stage: 'reposition', hallCall: null });
    // The call is lit; the panel locks for the ride (DOOR CLOSE still works).
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
    quiet();
    log('hallCall.taken', { floor });
  }

  /** Once per learner, after a few rides, while the doors wait: how DOOR CLOSE helps. Never required. */
  function maybeDoorCloseTip() {
    if (learnerRides < DOOR_CLOSE_TIP_AFTER || memory.has(DOOR_CLOSE_TIP)) return;
    if (view.stage !== 'reposition' && view.stage !== 'freeRide') return;
    if (view.elevator.phase !== 'idleOpen' || view.elevator.destination === null) return;
    remember(DOOR_CLOSE_TIP);
    say(LINES.doorCloseTip, 'helping');
    log('tip', { key: DOOR_CLOSE_TIP });
  }

  function beginTask(cause: 'start' | 'resume' | 'advance' | 'rescueReturn') {
    if (reading) return beginReading(cause);
    const activity = mission?.activity;
    const task = view.task;
    if (!activity || !task?.job) return;
    tripKind = 'answer';
    if (jobTools) {
      set(jobTools);
      jobTools = null;
    }
    // A task never starts behind closed doors: not after a resume, and not when the doors were
    // closing behind a loaded cargo car and the next job is on this same floor.
    if (view.elevator.phase === 'idleClosed') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
    else if (view.elevator.phase === 'doorsClosing') apply({ type: 'doorOpen', at: clock.now() });
    const fresh = cause === 'rescueReturn' && freshAfterRescue;
    if (fresh) startFollowUp(activity.stepId);
    const line = fresh ? `${LINES.freshJob} ${taskLine(activity, task)}` : cause === 'rescueReturn' ? backLine(task) : taskLine(activity, task);
    set({ stage: 'task' });
    openAnswerWindow();
    const intro = directoryIntro(namesPlace(line));
    say([cause === 'resume' ? LINES.resume : '', line, intro ?? ''].filter(Boolean).join(' '), 'neutral');
  }

  function backLine(task: TaskView): string {
    const job = task.job as FloorJob;
    if (job.words) return rescueLine(job.words.back, job.vars);
    const m = task.move as MoveTask;
    const vars = { start: m.start, change: m.change, dir: m.direction, rel: m.direction === 'down' ? 'below' : 'above' };
    return rescueLine(task.reference === 'beacon' ? 'backBeacon' : 'back', vars);
  }

  function taskLine(activity: ActivityView, task: TaskView): string {
    const job = task.job as FloorJob;
    if (job.words) return LINES.job(job.words.job, job.vars);
    const move = task.move as MoveTask;
    if (activity.challenge === 'stretch') return LINES.stretch(move);
    if (activity.challenge === 'masteryEncounter') return LINES.encounterRoute(move);
    if (task.kind === 'shaft') return LINES.shaft(move);
    return LINES.cued(move, activity.item.index);
  }

  /** The words for a wrong floor: where we went, then the job's givens. */
  function arrivedWrongLine(task: TaskView, p: PendingAnswer): string {
    const job = task.job;
    if (!job) return '';
    switch (job.shape) {
      case 'move':
        return job.move ? LINES.arrivedWrong(p.floor, job.move, task.reference) : '';
      case 'twoMoves':
        return LINES.arrivedWrongJob('arrivedWrongTwo', p.floor, job.vars);
      case 'startFloor':
        return LINES.arrivedWrongJob('arrivedWrongStart', p.floor, job.vars);
      case 'express':
        return LINES.arrivedWrongJob('arrivedWrongExpress', p.floor, job.vars);
      case 'tripMeter':
        return LINES.arrivedWrongJob('arrivedWrongMeter', p.floor, { ...job.vars, value: p.value });
      default:
        return job.words ? LINES.arrivedWrongJob(job.words.wrong, p.floor, job.vars) : '';
    }
  }

  /**
   * The move a wrong answer made, for the shaft map: from the floor the job counts from to where the
   * answer went (where-did-it-start: from the floor chosen, the crew's ride as it would have gone).
   * The consequence of the answer, never the answer itself. Null where a move says nothing (the express).
   */
  function mismatchFor(task: TaskView, p: PendingAnswer): DirectorView['mismatch'] {
    const job = task.job;
    if (!job) return null;
    const inside = (f: number) => Math.max(FLOOR15.floors.min, Math.min(FLOOR15.floors.max, f));
    switch (job.shape) {
      case 'move':
      case 'twoMoves':
        return job.move && p.floor !== job.move.start ? { from: job.move.start, to: p.floor } : null;
      case 'tripMeter':
        return job.meter ? { from: job.meter.from, to: p.floor } : null;
      case 'startFloor': {
        const change = Number(job.vars.change);
        const end = inside(p.floor + (job.vars.rode === 'down' ? -change : change));
        return end !== p.floor ? { from: p.floor, to: end } : null;
      }
      case 'express':
        return null;
      default:
        return job.mismatchFrom !== null && p.floor !== job.mismatchFrom ? { from: job.mismatchFrom, to: p.floor } : null;
    }
  }

  /** A fresh job after a correction starts: watch its first answer. */
  function startFollowUp(stepId: string) {
    freshAfterRescue = false;
    followUp = { stepId, helpUsed: false };
  }

  /** The first answer on a fresh job after a correction: did the learner manage it straight away? */
  function noteFollowUp(check: ResponseCheck) {
    const f = followUp;
    if (!f || mission?.activity?.stepId !== f.stepId) return;
    followUp = null;
    log('correction.followUp', { stepId: f.stepId, correct: check.ok ? check.evaluation.correct : null, helpUsed: f.helpUsed });
  }

  /** The success replay for a job answered correctly. Presentation only. */
  function replayFor(task: TaskView | null, activity: ActivityView): StrategyReinforcement | null {
    const job = task?.job;
    if (!task || !job) return null;
    const challenge = activity.challenge;
    const observed = [...(answerVia === 'shaft' ? (['usedNumberLine'] as const) : []), ...(changedPlan || task.wrongTries > 0 ? (['changedPlan'] as const) : [])];
    const v = job.vars;
    const d = (x: unknown): 'up' | 'down' => (x === 'down' ? 'down' : 'up');
    switch (job.shape) {
      case 'move':
        return job.move ? chooseReinforcement({ kind: 'move', ...job.move, reference: task.reference, challenge, observed }) : null;
      case 'twoMoves':
        return chooseReinforcement({ kind: 'twoMoves', start: Number(v.start), change: Number(v.change), direction: d(v.dir), change2: Number(v.changeTwo), direction2: d(v.dirTwo), challenge, observed });
      case 'startFloor':
        return chooseReinforcement({ kind: 'undo', end: Number(v.end), change: Number(v.change), direction: d(v.rode), challenge, observed });
      case 'express':
        return chooseReinforcement({ kind: 'jumps', step: Number(v.step), count: Number(v.count), challenge, observed });
      case 'tripMeter':
        return chooseReinforcement({ kind: 'distance', from: Number(v.from), to: Number(v.to), challenge, observed });
      default: {
        const plan = replayPlan(job);
        return plan ? chooseReinforcement({ ...plan, challenge, observed }) : null;
      }
    }
  }

  function helpFor(activity: ActivityView, offered: boolean): DirectorView['help'] {
    const next = activity.scaffolds.available[0];
    if (!next) return null;
    return { stepId: next.stepId, label: helpLabel(next.kind), offered: offered || next.mode === 'offer' };
  }

  // ---------- reading jobs (M8) ----------
  //
  // The note's words come from the item id in the prompt; the answer never does. A touch job goes to
  // its landing like any job (a hall call between jobs), a ride or card job starts where the car is.

  /** The reading view now: the job's words and its options as the runtime listed them for this job. */
  function readingView(): ReadingView | null {
    const r = reading;
    if (!r) return null;
    const w = r.words;
    const options = w.mode === 'ride' ? [] : r.options.map(({ id, value }) => ({ optionId: id, value, label: w.options?.[value] ?? value, tried: r.tried.includes(value), shown: r.shown === value }));
    const accepting = answerWindow !== null && pending === null;
    const { lineMarks, askMarks } = readingMarks(w);
    return { item: r.item, mode: w.mode, floor: w.mode === 'touch' ? (w.floor ?? null) : null, title: w.source, lines: [...w.passage], ask: w.ask, open: r.open, highlight: r.highlight, lineMarks, askMarks, accepting, options };
  }

  function enterReading(activity: ActivityView, words: ReadingItem, helpView: DirectorView['help'], base: Partial<DirectorView>, cause: 'start' | 'resume' | 'advance' | 'rescueReturn') {
    // Help already given on this item stays given (a resume): the clue stays lit, a shown answer stays shown.
    const given = activity.scaffolds.shown.map((s) => s.kind);
    const revealed = activity.scaffolds.revealedValue;
    reading = {
      words,
      item: String(activity.prompt.item),
      options: activity.options.map((o) => ({ id: o.id, value: String(o.value) })),
      tried: [],
      open: false,
      highlight: given.includes('highlightGiven') ? words.key : null,
      shown: given.includes('showAnswer') && revealed !== null ? String(revealed) : null,
    };
    const mode = words.mode;
    const task: TaskView = { kind: mode === 'ride' ? 'panel' : 'read', stepId: activity.stepId, move: null, job: null, reference: 'start', cargo: null, meter: null, wrongTries: activity.wrongTries };
    const tools: Partial<DirectorView> = { help: helpView };
    // A touch job is answered on its landing: the car goes there first, like any job's floor.
    const anchor = mode === 'touch' ? (words.floor ?? null) : null;
    const hallCall = cause === 'advance' && anchor !== null && view.elevator.floor !== anchor;
    set({ ...base, power: 'on', task, reading: readingView(), ...(hallCall ? {} : tools) });
    jobTools = hallCall ? tools : null;
    log('task', { stepId: activity.stepId, kind: 'read', mode, item: reading.item, activityId: activity.activityId, challenge: activity.challenge, cued: activity.cued });
    if (anchor !== null && view.elevator.floor !== anchor) {
      if (hallCall) return offerHallCall(anchor);
      apply({ type: 'place', at: clock.now(), floor: anchor, doors: 'open' });
    }
    beginReading(cause);
  }

  /** The note opens, the window opens, and a touch job's things become its answer targets. */
  function beginReading(cause: 'start' | 'resume' | 'advance' | 'rescueReturn') {
    const r = reading;
    if (!r || !mission?.activity) return;
    tripKind = 'answer';
    if (jobTools) {
      set(jobTools);
      jobTools = null;
    }
    if (view.elevator.phase === 'idleClosed') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
    else if (view.elevator.phase === 'doorsClosing') apply({ type: 'doorOpen', at: clock.now() });
    // Read first: the note opens. Back to a job whose answer was already shown (a resume), a touch
    // or card job stays folded so the thing shown is in view; a ride's floor is ringed on the panel.
    const ride = r.words.mode === 'ride';
    r.open = ride || r.shown === null;
    set({ stage: 'task', reading: readingView(), ...(ride && r.shown !== null ? { highlights: [Number(r.shown)] } : {}) });
    openAnswerWindow();
    readingTargets();
    const intro = directoryIntro(needsDirectory(r.words));
    say([cause === 'resume' ? LINES.resume : '', r.words.ask, intro ?? ''].filter(Boolean).join(' '), 'neutral');
  }

  /** A touch job's answer targets: its options (only the shown one after SHOW ME). */
  function readingTargets() {
    const r = reading;
    if (!r || r.words.mode !== 'touch' || r.words.floor === undefined) return;
    const objects = r.shown !== null ? [r.shown] : r.options.map((o) => o.value);
    setAnswerTargets({ floor: r.words.floor, objects }, (id) => answerChoice(id, 'touch'));
  }

  /** A touched thing does its own thing, right or not (the consequence; never a discovery). */
  function answerReaction(objectId: string) {
    const floor = view.elevator.floor;
    const spot = exploreSpots(LANDINGS, floor).find((x) => x.target === objectId);
    if (!spot) return;
    const key = spotKey(floor, spot.id);
    reactionEnds.set(key, clock.now() + reactionMs(spot.reaction, motion));
    const opened = spot.reaction === 'open' && !view.opened.includes(key) ? [...view.opened, key] : view.opened;
    set({ reaction: { floor, spotId: spot.id, seq: ++reactionSeq }, opened });
    playSound(spotSound(spot, false));
  }

  /**
   * A touch on an answer target, or a card: the reading job's answer, if its window is open. One
   * answer per window. The same option and the same commands either way, so the evidence is the same.
   */
  function answerChoice(value: string, via: 'touch' | 'card') {
    const r = reading;
    if (!r || r.words.mode === 'ride' || !mission?.activity) return;
    // After SHOW ME only the thing shown is offered (the landing keeps only its target; the other cards lock).
    const option = r.options.find((o) => o.value === value);
    if (!windowAccepts() || !option || (r.shown !== null && value !== r.shown)) {
      log('answer.discarded', { value, via, window: answerWindow?.token ?? null, reason: !option ? 'notAnOption' : r.shown !== null && value !== r.shown ? 'notShown' : 'noWindow' });
      return;
    }
    const window = answerWindow?.token ?? null;
    closeAnswerWindow('locked');
    const start = clock.now();
    let check: ResponseCheck;
    try {
      check = runtime.check(instanceId, { mode: 'choice', optionId: option.id });
    } catch {
      check = { ok: false, reason: 'noActivity' };
    }
    pending = { value, check, arrived: false, outcome: null, floor: view.elevator.floor };
    log('answer', { value, via, window, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs: clock.now() - start });
    if (via === 'touch') answerReaction(value);
    set({ stage: 'riding', highlights: [], lifty: { ...view.lifty, mood: 'thinking' } });
    submit({ optionId: option.id });
    // A short beat while the thing reacts, then the same feedback path as a ride.
    schedule(() => {
      if (!pending) return;
      pending.arrived = true;
      present();
    }, motion === 'reduced' ? 250 : 700);
  }

  /** Feedback for a reading answer: the job's world words on success; on a miss, what happened and one cue. */
  function presentReading(p: PendingAnswer, result: Extract<PresentationIntent, { type: 'RESPONSE_RESULT' }>, outcome: CommandOutcome) {
    const r = reading as NonNullable<typeof reading>;
    const w = r.words;
    if (result.correct) {
      log('task.done', { stepId: view.task?.stepId, ms: clock.now() - taskStartedAt });
      onAnswerTouch = null;
      r.open = false;
      set({ answerTargets: null, reading: null });
      beginSuccess(outcome, w.done, successPraise(), null, w.mode === 'ride');
      return;
    }
    const value = String(p.value);
    // The place as its sign reads, in the words' case ("Sky Bridge").
    const place = landingFor(LANDINGS, p.floor, { restored: () => view.floor15Restored }).name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    const named = w.mode === 'touch' ? readingLine('touched', { label: w.options?.[value] ?? value }) : w.mode === 'ride' ? readingLine('arrived', { floor: p.floor, place }) : '';
    const cue = readingMisconceptionLine(result.misconception) ?? readingLine('again');
    const intents = outcome.intents;
    const regenerated = intents.some((i) => i.type === 'ITEM_REGENERATED');
    const offer = intents.some((i) => i.type === 'OFFER_SCAFFOLD');
    const next = outcome.view.activity;
    const task = view.task;
    if (!r.tried.includes(value)) r.tried.push(value);
    // The miss's consequence stays in view. After a second miss a fresh item replaces this one after a
    // pause (the runtime's item is already the new, unseen one): the job is locked meanwhile, and its
    // note and options stay this job's (kept in `reading`), never the next one's.
    const ringed = w.mode === 'ride' && r.shown !== null && !regenerated ? [Number(r.shown)] : [];
    set({ stage: regenerated ? 'pause' : 'task', task: task ? { ...task, wrongTries: next?.wrongTries ?? task.wrongTries + 1 } : task, help: next && !regenerated ? helpFor(next, offer) : null, highlights: ringed, reading: readingView() });
    mission = outcome.view;
    playSound('answerWrong');
    say([named, cue].filter(Boolean).join(' '), 'concerned');
    if (regenerated) {
      schedule(() => {
        say(LINES.regenerated, 'neutral');
        enter(outcome.view, 'advance');
      }, pauseFor(motion));
      return;
    }
    tripKind = 'answer';
    openAnswerWindow(); // the same job, presented again: a fresh window
  }

  /**
   * CLUE lights the key sentence and opens the note. SHOW ME shows the answer (demonstrated, no
   * credit): a ride's floor is ringed on the panel; a touch or card job's thing glows (on the landing,
   * or its card), the note folds so it is in view, and only that one can be chosen now.
   */
  function readingHelp(kind: string, revealed: AnswerValue | null, next: DirectorView['help']) {
    const r = reading as NonNullable<typeof reading>;
    const mode = r.words.mode;
    let highlights = view.highlights;
    if (kind === 'highlightGiven') {
      r.highlight = r.words.key;
      r.open = true;
    }
    if (kind === 'showAnswer' && revealed !== null) {
      r.shown = String(revealed);
      if (mode === 'ride') highlights = typeof revealed === 'number' ? [revealed] : highlights;
      else r.open = false;
    }
    set({ saving: false, help: next, highlights, reading: readingView() });
    readingTargets();
    const label = r.shown !== null && mode !== 'ride' ? (r.words.options?.[r.shown] ?? r.shown) : '';
    // CLUE: the item's own strategy line when it has one (never the answer; reading.ts validates it).
    const clue = kind === 'highlightGiven' ? (r.words.clue ?? null) : null;
    say(clue ?? readingHelpLine(kind, mode, { label, revealed: revealed ?? '' }) ?? helpLine(kind, null, null, revealed), 'helping');
  }

  // ---------- Concept Rescue ----------
  //
  // The job pauses. Lifty explains the idea (misconception-specific only when the engine saw strong
  // evidence), then the learner counts an example cell by cell and says where it ends. The example's
  // answer is taught, so it is never evidence. A test run (the encounter) counts a DIFFERENT example,
  // then the learner returns to the job and still solves it. A correction (D149) counts the learner's
  // own missed job, then a fresh job follows that differs in question and answer.

  function startRescue(r: RescueView) {
    const board = rescueBoard(r, FLOOR15.floors.min, FLOOR15.floors.max);
    if (!board) {
      waitingRescue = null;
      set({ rescueReady: false });
      fail('content', 'no rescue board');
      return;
    }
    const focus = rescueFocusLine(r.focus);
    tripKind = null;
    waitingRescue = null;
    closeAnswerWindow('rescue');
    set({ stage: 'rescue', rescue: { ...board, caption: exampleCaption(board), focus }, rescueReady: false, mismatch: null, help: null, highlights: [], countAlong: null, beacon: null, directoryHint: false });
    say(`${rescueLine(board.corrective ? 'fixIntro' : 'intro')} ${focus ?? rescueLine(RESCUE_WORDS[board.example].general)}`, 'helping');
    log(board.corrective ? 'correction.start' : 'rescue.start', { stepId: mission?.activity?.stepId, focus: r.focus, example: r.example.signature, source: r.source });
  }

  function exampleCaption(b: Pick<RescueStageView, 'example' | 'words' | 'corrective'>): string {
    return rescueLine(b.corrective ? RESCUE_WORDS[b.example].fix : RESCUE_WORDS[b.example].example, b.words);
  }

  /**
   * After a miss that starts a correction: the consequence stays in view with Lifty's cue, the
   * panel locked, and LET'S COUNT waits. The learner starts the correction when ready.
   */
  function awaitRescue(r: RescueView) {
    waitingRescue = r;
    set({ rescueReady: true });
    log('rescue.ready', { stepId: mission?.activity?.stepId, source: r.source });
  }

  function rescueTap(n: number) {
    const r = view.rescue;
    if (view.stage !== 'rescue' || !r || view.saving) return;
    if (r.phase === 'counting') {
      const sign = r.direction === 'down' ? -1 : 1;
      const expected = r.origin + sign * r.stride * (r.counted.length + 1);
      if (n !== expected) {
        log('rescue.count', { tapped: n, ok: false });
        say(rescueLine('notNext'), 'thinking');
        return;
      }
      const counted = [...r.counted, n];
      const words = RESCUE_WORDS[r.example];
      const step = rescueLine(words.step, { floor: n, n: r.countFrom + counted.length });
      log('rescue.count', { tapped: n, ok: true, counted: counted.length, part: r.part });
      audioExtra({ at: clock.now(), action: 'play', slot: 'floorButtonPress' });
      if (counted.length < r.steps) {
        set({ rescue: { ...r, counted } });
        say(step, 'helping');
        return;
      }
      const next = r.parts[r.part + 1];
      if (next) {
        // This part is counted: the next part starts where it stopped.
        const caption = rescueLine(words.leg ?? 'legTwo', { ...r.words, floor: n });
        set({ rescue: { ...r, part: r.part + 1, origin: next.origin, direction: next.direction, steps: next.steps, counted: [], caption } });
        say(`${step} ${caption}`, 'helping');
        return;
      }
      const ask = rescueLine(words.ask, r.words);
      set({ rescue: { ...r, counted, phase: 'ask', caption: ask } });
      say(`${step} ${ask}`, 'helping');
      return;
    }
    if (r.phase !== 'ask') return;
    set({ rescue: { ...r, phase: 'checking' }, saving: true });
    const commandId = nextCommandId();
    void track(
      runtime.rescueAnswer(instanceId, { commandId, basedOn: revision, value: n }).then(
        (outcome) => {
          revision = outcome.revision;
          set({ saving: false });
          const result = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'RESCUE_RESULT' }> => i.type === 'RESCUE_RESULT');
          const complete = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'CONCEPT_RESCUE_COMPLETE' }> => i.type === 'CONCEPT_RESCUE_COMPLETE');
          log('rescue.answer', { value: n, correct: result?.correct ?? null });
          const now = view.rescue ?? r;
          if (!result) {
            enter(runtime.currentView(instanceId).view, 'resume');
            return;
          }
          if (!result.correct || !complete) {
            // Count it again together. No verdict language: the board resets and the count restarts.
            const first = now.parts[0]!;
            set({ rescue: { ...now, phase: 'counting', part: 0, origin: first.origin, direction: first.direction, steps: first.steps, counted: [], caption: exampleCaption(now) } });
            say(rescueLine(RESCUE_WORDS[now.example].retry, { exStart: first.origin, ...now.words }), 'helping');
            return;
          }
          const exAnswer = exampleAnswer(now);
          const right = rescueLine(RESCUE_WORDS[now.example].right, { exAnswer, exChange: now.steps, ...now.words });
          set({ rescue: { ...now, phase: 'right', caption: right } });
          say(right, 'satisfied');
          freshAfterRescue = complete.returnTo === 'fresh';
          log(now.corrective ? 'correction.complete' : 'rescue.complete', { returnTo: complete.returnTo });
          schedule(() => enter(outcome.view, 'rescueReturn'), pauseFor(motion) + (motion === 'reduced' ? 400 : 1200));
        },
        () => {
          set({ saving: false, rescue: view.rescue ? { ...view.rescue, phase: 'ask' } : null });
          say(LINES.commitTrouble, 'thinking');
          reloadCheckpoint();
        },
      ),
    );
  }

  // ---------- answers ----------

  /**
   * A two-part trip ridden in two legs: the car leaves the trip's start for exactly the floor where the
   * first part ends (the engine's check names it, FIRST_LEG_TAG). That ride is a step, not an answer:
   * nothing is submitted or recorded. Once per job; the next floor chosen is the answer.
   */
  function isFirstLeg(from: number, to: number): boolean {
    const job = view.task?.job;
    if (legRidden || !job || job.shape !== 'twoMoves' || from !== job.anchor) return false;
    try {
      const c = runtime.check(instanceId, { mode: 'value', value: to });
      return c.ok && !c.evaluation.correct && c.evaluation.misconception === FIRST_LEG_TAG;
    } catch {
      return false;
    }
  }

  function rideLeg(floor: number) {
    legRidden = true;
    closeAnswerWindow('leg');
    tripKind = 'leg';
    log('answer.leg', { floor, stepId: mission?.activity?.stepId ?? null });
    set({ stage: 'riding', highlights: [], countAlong: null, mismatch: null, lifty: { ...view.lifty, mood: 'thinking' } });
  }

  /** `floor`: where the answer sends the car. A floor answer is its own floor; a trip meter count is not. */
  function lockAnswer(value: number, floor = value) {
    // One answer per window: nothing pressed from now on can answer this item or the next.
    const window = answerWindow?.token ?? null;
    closeAnswerWindow('locked');
    const start = clock.now();
    let check: ResponseCheck;
    try {
      check = runtime.check(instanceId, { mode: 'value', value });
    } catch {
      check = { ok: false, reason: 'noActivity' }; // not active (recovering): the commit decides
    }
    const evalMs = clock.now() - start;
    pending = { value, check, arrived: false, outcome: null, floor };
    log('answer', { value, floor, window, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs, changedPlan });
    noteFollowUp(check);
    // A routine ride needs no words: the job stays on screen while the lift works. A reading note
    // folds away so the floor reached shows (it can be opened again).
    if (reading) reading.open = false;
    set({ stage: 'riding', highlights: [], countAlong: null, mismatch: null, lifty: { ...view.lifty, mood: 'thinking' }, ...(reading ? { reading: readingView() } : {}) });
    submit({ value });
  }

  /**
   * The answer was locked and checked correct: the thing the job was about is on this landing, so
   * it is there when the doors open. A wrong floor gets nothing. Called once the car has stopped.
   */
  function placeFound(floor: number) {
    const p = pending;
    const activity = mission?.activity;
    if (!p || !activity || !p.check.ok || !p.check.evaluation.correct) return;
    const found = objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'destination', activity.activityId);
    if (found) set({ props: [...view.props.filter((x) => x.id !== found.id), propFor(found, floor)] });
  }

  function answerInPlace(floor: number) {
    lockAnswer(floor);
    placeFound(floor);
    say(LINES.alreadyHere(floor), 'thinking');
    // A short beat, as if the car checked its position, then the same feedback path as a ride.
    schedule(() => {
      if (!pending) return;
      pending.arrived = true;
      present();
    }, motion === 'reduced' ? 250 : 700);
  }

  function submit(response: { value: number } | { optionId: string }) {
    const commandId = nextCommandId();
    const basedOn = revision;
    const startedAt = clock.now();
    set({ saving: true });
    const attempt = (n: number): Promise<void> =>
      runtime.submit(instanceId, { commandId, basedOn, ...response }).then(
        (outcome) => {
          log('commit', { commandId, ms: clock.now() - startedAt, ok: true, duplicate: outcome.duplicate });
          revision = outcome.revision;
          if (pending) pending.outcome = outcome;
          set({ saving: false });
          present();
        },
        async (e: unknown) => {
          log('commit', { commandId, ms: clock.now() - startedAt, ok: false, error: String(e), attempt: n });
          if (disposed) return;
          if (n >= 3) return fail('save', String(e));
          say(LINES.commitTrouble, 'thinking');
          // The runtime dropped its in-memory checkpoint; reload it, then retry the SAME command id.
          try {
            const reloaded = await runtime.activate(instanceId);
            revision = reloaded.revision;
          } catch (again: unknown) {
            return fail('save', String(again));
          }
          return attempt(n + 1);
        },
      );
    void track(attempt(1));
  }

  function onRideComplete() {
    const kind = tripKind;
    if (kind === 'leg') {
      // The first part of a two-part trip is done: the same job waits, and the next floor is the answer.
      tripKind = 'answer';
      const vars = view.task?.job?.vars;
      set({ stage: 'task' });
      if (vars) say(LINES.firstLegDone(view.elevator.floor, vars), 'helping');
      openAnswerWindow();
      return;
    }
    if (kind === 'reposition') {
      if (repositionCause === 'meterReturn') {
        // Back on the job's floor after a measured trip that missed: the same job, a fresh window.
        repositionCause = 'advance';
        tripKind = 'answer';
        set({ stage: 'task' });
        openAnswerWindow();
        return;
      }
      beginTask(repositionCause);
      return;
    }
    if (kind === 'answer' && pending) {
      pending.arrived = true;
      present();
      return;
    }
    if (kind === 'finale' && view.elevator.floor === FLOOR15.repairFloor) {
      finish();
    }
  }

  /** Feedback needs both: the ride finished (the world showed the consequence) and the commit. */
  function present() {
    const p = pending;
    if (!p || !p.arrived || !p.outcome || !mission) return;
    pending = null;
    const intents = p.outcome.intents;
    const result = intents.find((i): i is Extract<PresentationIntent, { type: 'RESPONSE_RESULT' }> => i.type === 'RESPONSE_RESULT');
    const task = view.task;
    if (!result) {
      // Stale or rejected: the checkpoint did not change. Re-read it from memory and carry on.
      log('answer.rejected', { intents: intents.map((i) => i.type) });
      enter(runtime.currentView(instanceId).view, 'resume');
      return;
    }
    if (reading) return presentReading(p, result, p.outcome);
    if (result.correct) {
      const activity = mission.activity;
      const replay = activity ? replayFor(task, activity) : null;
      const found = activity ? objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'destination', activity.activityId) : null;
      log('task.done', { stepId: task?.stepId, ms: clock.now() - taskStartedAt });
      beginSuccess(p.outcome, found?.found ?? '', successPraise(), replay, true);
      return;
    }
    // Wrong floor: the world already showed where we went. Explain it in building terms.
    const job = task?.job ?? null;
    const tag = result.misconception;
    const explained = tag ? misconceptionLine(tag, job?.vars ?? null, null) : null;
    const arrivedLine = task ? arrivedWrongLine(task, p) : '';
    // What is missing here says the most: "No repair kit here." (and the beacon, if we are at it).
    const activityNow = mission.activity;
    const missing = activityNow ? objectiveFor(OBJECTIVES, activityNow.stepId, activityNow.item.index, 'destination', activityNow.activityId)?.absent ?? null : null;
    // Only a given (reference) object can stand here after a wrong answer: the beacon on its floor.
    const standingHere = view.props.find((x) => x.floor === p.floor && x.state === 'present');
    const seen = standingHere ? (OBJECTIVES.objectives.find((o) => o.id === standingHere.id)?.found ?? null) : null;
    const world = [missing, seen].filter(Boolean).join(' ');
    const regenerated = intents.some((i) => i.type === 'ITEM_REGENERATED');
    const offer = intents.find((i): i is Extract<PresentationIntent, { type: 'OFFER_SCAFFOLD' }> => i.type === 'OFFER_SCAFFOLD');
    const rescue = intents.find((i): i is Extract<PresentationIntent, { type: 'CONCEPT_RESCUE' }> => i.type === 'CONCEPT_RESCUE');
    const next = p.outcome.view.activity;
    const mismatch = task ? mismatchFor(task, p) : null;
    if (rescue) {
      // The world shows where we went first, and the shaft map shows the move the answer made.
      // Then the correction waits for the learner (LET'S COUNT).
      mission = p.outcome.view;
      set({ stage: 'pause', task: task ? { ...task, wrongTries: next?.wrongTries ?? task.wrongTries + 1 } : task, help: null, highlights: [], countAlong: null, mismatch, shaftMode: mismatch && view.shaftMode === 'status' ? 'map' : view.shaftMode });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      playSound('answerWrong');
      say([world, explained ?? arrivedLine].filter(Boolean).join(' '), 'concerned');
      awaitRescue(rescue.rescue);
      return;
    }
    // Explain the counting convention only: the first floor after the start is "1". Counting all
    // the way would show the destination for free; the full count is the guided help step.
    const convention = (tag === 'quantity.countedStartingPosition' || tag === 'quantity.countedBothEnds') && job !== null && job.count.stride === 1;
    set({
      stage: 'task',
      task: task ? { ...task, wrongTries: next?.wrongTries ?? task.wrongTries + 1 } : task,
      // After a regeneration the old job stays on screen for its consequence, but the runtime's
      // item is already the new, unseen one: no CLUE until that job is shown (as the cargo bay does).
      help: next && !regenerated ? helpFor(next, Boolean(offer)) : null,
      countAlong: convention ? { from: job.count.from, direction: job.count.direction, steps: 1 } : null,
      mismatch,
      shaftMode: (convention || mismatch) && view.shaftMode === 'status' ? 'map' : view.shaftMode,
    });
    mission = p.outcome.view;
    changedPlan = false;
    // A trip meter counts from the job's floor, so "we can go from here" is not true: the lift goes back.
    const meterFrom = task?.meter && !regenerated && view.elevator.floor !== task.meter.from ? task.meter.from : null;
    playSound('answerWrong');
    say([world, explained ?? arrivedLine, explained || world || meterFrom !== null ? '' : LINES.tryFromHere].filter(Boolean).join(' '), 'concerned');
    if (regenerated) {
      schedule(() => {
        say(LINES.regenerated, 'neutral');
        enter(p.outcome!.view, 'advance');
      }, pauseFor(motion));
    } else if (meterFrom !== null) {
      set({ stage: 'reposition' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      tripKind = 'reposition';
      schedule(() => {
        if (view.stage === 'reposition' && tripKind === 'reposition') rideBy(meterFrom, 'meterReturn');
      }, pauseFor(motion));
    } else {
      tripKind = 'answer';
      openAnswerWindow(); // the same job, presented again: a fresh window
    }
  }

  function noteAdvance(outcome: CommandOutcome) {
    const unlocks = outcome.intents.filter((i): i is Extract<PresentationIntent, { type: 'UNLOCK_GRANTED' }> => i.type === 'UNLOCK_GRANTED');
    for (const u of unlocks) log('unlock', { id: u.unlockId });
    set({ progress: progressFor(outcome.view.step?.id ?? null, outcome.view.status === 'completed') });
  }

  /** Waking the lift is not a job: it moves on by itself after a short pause. */
  function advanceAfterPause(outcome: CommandOutcome) {
    noteAdvance(outcome);
    schedule(() => enter(outcome.view, 'advance'), pauseFor(motion));
  }

  /** Specific praise only where it says something the world does not: stretch, a changed plan, after a test run. */
  function successPraise(): string {
    const activity = mission?.activity;
    if (activity?.challenge === 'stretch') return LINES.praise.stretch;
    if (activity?.challenge === 'masteryEncounter') return '';
    if (afterRescue) return LINES.praise.afterRescue;
    if (changedPlan || (view.task?.wrongTries ?? 0) > 0) return LINES.praise.afterMiss;
    return '';
  }

  /**
   * The success sequence. arrival: the panel locks and Lifty is quiet so the floor (and what we
   * found) shows first. animating: Lifty names it and the replay plays. review: everything stays,
   * NEXT JOB waits. The commit is already durable; only nextJob() moves on.
   */
  function beginSuccess(outcome: CommandOutcome, world: string, praise: string, replay: StrategyReinforcement | null, arrival: boolean) {
    pendingAdvance = outcome;
    noteAdvance(outcome);
    // The job's help goes with the job: its slot belongs to NEXT JOB now.
    set({ stage: 'success', success: arrival ? 'arrival' : 'animating', highlights: [], countAlong: null, help: null, directoryHint: false });
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
    playSound('answerRight');
    const play = () => {
      if (view.stage !== 'success' || pendingAdvance !== outcome) return;
      set({ success: 'animating' });
      const shown = showReplay(replay);
      say([world, praise, shown?.text].filter(Boolean).join(' '), 'satisfied');
      // The animation may finish by itself; understanding is not timed. Then it waits.
      const settle = motion === 'reduced' ? 0 : shown ? replayMs(shown.intensity, motion) : 600;
      schedule(() => {
        if (view.stage !== 'success' || pendingAdvance !== outcome) return;
        set({ success: 'review' });
        log('success.review', {});
      }, settle);
    };
    if (arrival) {
      quiet();
      schedule(play, motion === 'reduced' ? ARRIVAL_BEAT_MS.reduced : ARRIVAL_BEAT_MS.normal);
    } else play();
  }

  function collect(objectId: string) {
    const prop = view.props.find((x) => x.id === objectId);
    if (view.stage !== 'success' || !prop || !prop.interactive || prop.state !== 'present' || prop.floor !== view.elevator.floor || view.elevator.phase !== 'idleOpen') return;
    set({ props: view.props.map((x) => (x.id === objectId ? { ...x, state: 'collected' as const } : x)) });
    audioExtra({ at: clock.now(), action: 'play', slot: 'landingReaction' });
    log('collect', { id: objectId });
  }

  /**
   * Show a success replay: the steps appear one at a time (all at once under reduced motion).
   * Presentation only. No answer window is open while it plays: the next job opens its own.
   */
  function showReplay(r: StrategyReinforcement | null): ReplayView | null {
    if (!r) return null;
    const text = replayLine(r.textKey, r.textVars) ?? '';
    const replay: ReplayView = { ...r, text, revealed: motion === 'reduced' ? r.steps.length : 1 };
    set({ replay });
    log('replay', { strategy: r.strategy, steps: r.steps, evidence: r.evidenceBasis, observed: r.observed, intensity: r.intensity });
    if (motion !== 'reduced') {
      const every = Math.min(380, (replayMs(r.intensity, motion) * 0.6) / Math.max(1, r.steps.length - 1));
      for (let k = 2; k <= r.steps.length; k++) {
        schedule(() => {
          if (view.replay?.steps === replay.steps) set({ replay: { ...view.replay, revealed: k } });
        }, every * (k - 1));
      }
    }
    return replay;
  }

  // ---------- cargo ----------

  function cargoSubmit() {
    const task = view.task;
    const cargo = task?.cargo;
    if (!task || !cargo || view.saving) return;
    if (cargo.loaded === 0) {
      say(LINES.emptyLoad, 'helping');
      return;
    }
    const start = clock.now();
    const check = runtime.check(instanceId, { mode: 'value', value: cargo.loaded });
    noteFollowUp(check);
    log('answer', { value: cargo.loaded, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs: clock.now() - start });
    // The car's load sensor is world physics: it knows the total, not the right answer. With two
    // orders the car takes the whole dock, so only the check can say the load is not the orders.
    const overload = cargo.orders === null && cargo.aboard + cargo.loaded > cargo.capacity;
    const correct = check.ok && check.evaluation.correct;
    const commandId = nextCommandId();
    const startedAt = clock.now();
    set({ saving: true });
    if (!correct && overload) audioExtra({ at: clock.now(), action: 'play', slot: 'overloadTone' });
    void track(
      runtime.submit(instanceId, { commandId, basedOn: revision, value: cargo.loaded }).then(
        (outcome) => {
          log('commit', { commandId, ms: clock.now() - startedAt, ok: true });
          revision = outcome.revision;
          set({ saving: false });
          const result = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'RESPONSE_RESULT' }> => i.type === 'RESPONSE_RESULT');
          if (!result) return enter(runtime.currentView(instanceId).view, 'resume');
          if (result.correct) {
            set({ task: { ...task, cargo: { ...cargo, status: 'accepted' } } });
            log('task.done', { stepId: task.stepId, ms: clock.now() - taskStartedAt });
            const challenge = mission?.activity?.challenge ?? 'practice';
            // Observed: the learner loaded these crates, exactly filling the car. Two orders: the game
            // saw the total loaded, not how it was worked out, so the sum is a suggestion.
            const replay = cargo.orders
              ? chooseReinforcement({ kind: 'combine', first: cargo.orders[0], second: cargo.orders[1], challenge, observed: [] })
              : chooseReinforcement({ kind: 'capacity', capacity: cargo.capacity, aboard: cargo.aboard, loaded: cargo.loaded, challenge, observed: ['loadedExactly'] });
            beginSuccess(outcome, cargo.orders ? LINES.praise.orders : LINES.praise.cargo, afterRescue ? LINES.praise.afterRescue : '', replay, false);
            return;
          }
          mission = outcome.view;
          // An overload already sounded the car's load tone: one sound for one miss.
          if (!overload) playSound('answerWrong');
          const tag = result.misconception;
          const words = cargo.orders ? ordersVars(cargo.orders) : null;
          const explained = tag ? misconceptionLine(tag, words, cargo) : null;
          const status: CargoView['status'] = words ? 'mismatch' : overload ? 'overload' : 'underload';
          const world = words ? LINES.ordersWrong(words) : overload ? LINES.overload(cargo.capacity) : LINES.underload;
          const next = outcome.view.activity;
          if (outcome.intents.some((i) => i.type === 'ITEM_REGENERATED')) {
            // The old load is no longer the runtime's item. Lock it while its consequence
            // is shown, then rebuild the bay and instructions from the new checkpoint.
            set({ stage: 'pause', task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: null });
            say([world, explained].filter(Boolean).join(' '), 'concerned');
            schedule(() => enter(outcome.view, 'advance'), pauseFor(motion));
            return;
          }
          const rescue = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'CONCEPT_RESCUE' }> => i.type === 'CONCEPT_RESCUE');
          // The consequence on the load meter: what is in the car against the limit (or the count, for orders).
          if (rescue) {
            set({ stage: 'pause', task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: null, shaftMode: 'numberLine' });
            say([world, explained].filter(Boolean).join(' '), 'concerned');
            awaitRescue(rescue.rescue);
            return;
          }
          set({ task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: next ? helpFor(next, outcome.intents.some((i) => i.type === 'OFFER_SCAFFOLD')) : null, shaftMode: 'numberLine' });
          say([world, explained].filter(Boolean).join(' '), 'concerned');
        },
        (e: unknown) => {
          log('commit', { commandId, ms: clock.now() - startedAt, ok: false, error: String(e) });
          set({ saving: false });
          say(LINES.commitTrouble, 'thinking');
          reloadCheckpoint();
        },
      ),
    );
  }

  // ---------- finale ----------

  function finish() {
    if (view.stage !== 'finale') return; // exactly once
    const commandId = nextCommandId();
    set({ stage: 'complete', power: 'restoring', saving: true, highlights: [] });
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
    quiet(); // the floor first: Lifty speaks once the power is back
    audioExtra({ at: clock.now(), action: 'play', slot: 'powerRestore' });
    void track(
      runtime.acknowledge(instanceId, { commandId, basedOn: revision }).then(
        (outcome) => {
          revision = outcome.revision;
          mission = outcome.view;
          const unlocks = outcome.intents.filter((i): i is Extract<PresentationIntent, { type: 'UNLOCK_GRANTED' }> => i.type === 'UNLOCK_GRANTED').map((u) => u.unlockId);
          for (const id of unlocks) log('unlock', { id });
          log('mission.complete', { unlocks });
          const firstTime = outcome.intents.some((i) => i.type === 'GAME_PROGRESS' && i.signal.kind === 'missionComplete' && i.signal.firstTime);
          set({ saving: false, progress: progressFor(null, true) });
          // In the world, no card: the floor comes back, its core wakes, the panel lamps sweep once,
          // Lifty says so, then the rank and the clipboard, then the lift is the learner's.
          schedule(() => {
            audioExtra({ at: clock.now(), action: 'play', slot: 'completion' });
            set({
              power: 'on',
              maintenanceUnlocked: view.maintenanceUnlocked || unlocks.includes(MAINTENANCE_UNLOCK),
              floor15Restored: view.floor15Restored || floor15Restored(unlocks),
              rank: view.rank ?? (unlocks.includes(RANK_UNLOCK) ? (UNLOCK_LABELS[RANK_UNLOCK] ?? null) : null),
              sweep: view.sweep + 1,
              reaction: restorationReaction(),
            });
            say(LINES.complete, 'satisfied');
            schedule(() => {
              if (view.stage === 'complete') enterFreeRide(firstTime ? LINES.rankEarned : LINES.completeAgain);
            }, motion === 'reduced' ? 1600 : 2800);
          }, motion === 'reduced' ? 600 : 1800);
        },
        (e: unknown) => {
          log('commit', { commandId, ok: false, error: String(e) });
          set({ stage: 'finale', saving: false, power: 'on' });
          say(LINES.commitTrouble, 'thinking');
          reloadCheckpoint(() => {
            tripKind = 'finale';
            apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: range(FLOOR15.floors.min, FLOOR15.floors.max).filter((f) => f !== FLOOR15.repairFloor) });
          });
        },
      ),
    );
  }

  /** The core on the restored floor wakes as the power comes back (its reaction, not a discovery). */
  function restorationReaction(): DirectorView['reaction'] {
    const core = exploreSpots(LANDINGS, FLOOR15.repairFloor)[0];
    return core ? { floor: FLOOR15.repairFloor, spotId: core.id, seq: ++reactionSeq } : null;
  }

  // ---------- free ride and exploration ----------

  function enterFreeRide(line: string) {
    closeAnswerWindow('freeRide', false);
    tripKind = 'free';
    set({ stage: 'freeRide', highlights: [], hallCall: null, directoryHint: false });
    apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: [] });
    say(line, 'satisfied');
    log('freeRide', {});
  }

  /** The first spot on this floor still to be found, if it can be touched now (the dormant core does nothing). */
  function spotHere(): ExploreSpotEntry | null {
    const floor = view.elevator.floor;
    if (floor === FLOOR15.repairFloor && !view.floor15Restored) return null;
    return exploreSpots(LANDINGS, floor).find((s) => !spotDiscovered(s, memory)) ?? null;
  }

  /**
   * Free-ride arrival: the floor first. After a short beat, if something here is still undiscovered,
   * Lifty names what to touch. Otherwise Lifty stays quiet. Nothing waits on the beat.
   */
  function arrivalBeat() {
    const floor = view.elevator.floor;
    schedule(() => {
      if (view.stage !== 'freeRide' || view.logOpen || view.card || view.elevator.phase !== 'idleOpen' || view.elevator.floor !== floor) return;
      const spot = spotHere();
      if (spot) say(LINES.exploreHint(spot.object), 'helping');
    }, motion === 'reduced' ? 300 : 900);
  }

  function inspect(spotId: string) {
    const target = touchTargets(view).find((t) => t.spot?.id === spotId);
    if (target?.spot && target.mode !== 'answer') react(target.spot, target.mode === 'explore');
  }

  function touchObject(objectId: string) {
    const target = touchTargets(view).find((t) => t.object.id === objectId);
    if (!target) return;
    if (target.mode === 'answer') {
      log('touch.answer', { floor: view.elevator.floor, object: objectId });
      onAnswerTouch?.(objectId);
      return;
    }
    if (target.spot) react(target.spot, target.mode === 'explore');
  }

  /**
   * A landing thing reacts. Every touch plays its reaction (and the toolbox opens or shuts); a touch
   * while its own reaction still runs is ignored, so rapid taps cannot restart a motion or flicker.
   * Exploring (`full`), the first touch is a discovery: world memory, never evidence, and Lifty says
   * its line; a card opens. Between jobs (quiet) the thing only reacts.
   */
  function react(spot: ExploreSpotEntry, full: boolean) {
    const now = clock.now();
    const floor = view.elevator.floor;
    const key = spotKey(floor, spot.id);
    if (now < (reactionEnds.get(key) ?? -Infinity)) return;
    reactionEnds.set(key, now + reactionMs(spot.reaction, motion));
    const closing = spot.reaction === 'open' && view.opened.includes(key);
    const opened = spot.reaction === 'open' ? (closing ? view.opened.filter((k) => k !== key) : [...view.opened, key]) : view.opened;
    set({ reaction: { floor, spotId: spot.id, seq: ++reactionSeq }, opened });
    playSound(spotSound(spot, closing));
    if (!full) {
      log('inspect', { floor, spot: spot.id, first: false, quiet: true });
      return;
    }
    if (spot.card) set({ card: { floor, spotId: spot.id, title: spot.card.title, lines: [...spot.card.lines], close: spot.card.close } });
    // A place found under its old floor's key (it moved, D130) counts as found: no second "first".
    const first = !spotDiscovered(spot, memory) && remember(spot.discovery);
    log('inspect', { floor, spot: spot.id, first });
    if (!first) return;
    set({ discoveries: discoveriesNow() });
    playSound('discovery');
    say(spot.line, 'satisfied');
  }

  function closeCard() {
    if (!view.card) return;
    log('card.close', { spot: view.card.spotId });
    set({ card: null });
  }

  function setAnswerTargets(targets: { floor: number; objects: string[] } | null, onTouch?: (objectId: string) => void) {
    onAnswerTouch = targets ? (onTouch ?? null) : null;
    set({ answerTargets: targets ? { floor: targets.floor, objects: [...targets.objects] } : null, ...(targets ? { card: null } : {}) });
  }

  function setTiming(timing: ElevatorTiming) {
    config = { ...config, timing };
    cues = createCueMapperPreserving(cues, timing.decelMs);
    set({ timing });
    scheduleWake();
  }

  function applyPendingMotion() {
    const phase = view.elevator.phase;
    if (pendingMotion === null || (phase !== 'idleOpen' && phase !== 'idleClosed')) return;
    const next = pendingMotion;
    pendingMotion = null;
    setTiming(timingFor(next));
  }

  function createCueMapperPreserving(old: CueMapper, decelFadeMs: number): CueMapper {
    // Loops already playing keep playing; the new mapper takes ownership of them.
    const fresh = createCueMapper({ decelFadeMs });
    for (const slot of old.activeLoops()) fresh.extra({ at: clock.now(), action: 'loopStart', slot });
    return fresh;
  }

  // ---------- public API ----------

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start() {
      const activated = await runtime.activate(instanceId);
      if (disposed) { runtime.deactivate(instanceId); return; }
      revision = activated.revision;
      const unlocks = (await runtime.unlocks(deps.learnerId)).map((u) => u.unlockId);
      for (const key of await runtime.memories(deps.learnerId)) memory.add(key);
      if (disposed) return;
      view = {
        ...view,
        maintenanceUnlocked: unlocks.includes(MAINTENANCE_UNLOCK),
        floor15Restored: floor15Restored(unlocks),
        rank: unlocks.includes(RANK_UNLOCK) ? (UNLOCK_LABELS[RANK_UNLOCK] ?? null) : null,
        discoveries: discoveriesNow(),
      };
      log('mission.activate', { instanceId, step: activated.view.step?.id ?? null, status: activated.view.status, revision });
      audioExtra({ at: clock.now(), action: 'loopStart', slot: 'ambientMachinery' });
      const intro = activated.view.narrative?.eventKey === 'mission.intro' && activated.revision === 1;
      enter(activated.view, intro ? 'advance' : 'resume');
    },

    pressFloor(floor, via = 'panel') {
      // Every press reaches the machine: it clicks, and the machine decides (locked, moving, here, lit).
      // A press while a commit is pending is still mechanical only: the panel is locked until then.
      if (via === 'shaft') log('shaft.tap', { floor });
      pressVia = via;
      apply({ type: 'press', floor, at: clock.now() });
      pressVia = 'panel';
    },

    pressDoorOpen() {
      if (view.stage === 'intro' && !view.saving) {
        apply({ type: 'doorOpen', at: clock.now() });
        set({ power: 'on', saving: true });
        say(LINES.introDone, 'satisfied');
        const commandId = nextCommandId();
        void track(
          runtime.acknowledge(instanceId, { commandId, basedOn: revision }).then(
            (outcome) => {
              revision = outcome.revision;
              set({ saving: false });
              log('task.done', { stepId: 'intro' });
              advanceAfterPause(outcome);
            },
            () => {
              set({ saving: false });
              say(LINES.commitTrouble, 'thinking');
              reloadCheckpoint();
            },
          ),
        );
        return;
      }
      apply({ type: 'doorOpen', at: clock.now() });
    },

    pressDoorClose() {
      if (view.stage === 'cargo') {
        // In the cargo bay, Door Close asks the car to weigh the load and go. The doors only
        // actually close once the load is accepted.
        audioExtra({ at: clock.now(), action: 'play', slot: 'doorButtonPress' });
        log('door.press', { button: 'close', accepted: true, cargo: true });
        cargoSubmit();
        return;
      }
      apply({ type: 'doorClose', at: clock.now() });
    },

    requestHelp() {
      const help = view.help;
      if (!help || view.saving || (view.stage !== 'task' && view.stage !== 'cargo')) return;
      const commandId = nextCommandId();
      set({ saving: true });
      void track(
        runtime.useScaffold(instanceId, { commandId, scaffoldStepId: help.stepId, basedOn: revision }).then(
          (outcome) => {
            revision = outcome.revision;
            mission = outcome.view;
            const shown = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'SCAFFOLD_SHOWN' }> => i.type === 'SCAFFOLD_SHOWN');
            if (!shown) {
              set({ saving: false, help: outcome.view.activity ? helpFor(outcome.view.activity, false) : null });
              return;
            }
            log('help', { kind: shown.scaffold.kind, assistance: shown.scaffold.assistance, stepId: view.task?.stepId });
            if (followUp) followUp.helpUsed = true;
            if (reading) {
              const after = shown.nextAvailable[0];
              readingHelp(shown.scaffold.kind, shown.revealedValue, after ? { stepId: after.stepId, label: helpLabel(after.kind), offered: false } : null);
              return;
            }
            const task = view.task;
            const job = task?.job ?? null;
            const orders = task?.cargo?.orders ?? null;
            const cargo = task?.cargo ? { capacity: task.cargo.capacity, aboard: task.cargo.aboard } : null;
            const kind = shown.scaffold.kind;
            const revealed = typeof shown.revealedValue === 'number' ? shown.revealedValue : null;
            // A demonstrated count on the trip meter sets the meter: the learner still presses GO.
            const meter = task?.meter && kind === 'showAnswer' && revealed !== null ? { ...task.meter, value: Math.max(0, Math.min(task.meter.max, revealed)) } : null;
            set({
              saving: false,
              help: shown.nextAvailable[0] ? { stepId: shown.nextAvailable[0].stepId, label: helpLabel(shown.nextAvailable[0].kind), offered: false } : null,
              highlights: kind === 'showAnswer' && revealed !== null && !task?.meter ? [revealed] : kind === 'highlightGiven' && job ? job.givens : view.highlights,
              shaftMode: kind === 'numberLine' || kind === 'countStrategy' ? 'numberLine' : view.shaftMode,
              // The counting strategy shows how to START counting (at most two counts), never the stop.
              countAlong: kind === 'countStrategy' && job ? { from: job.count.from, direction: job.count.direction, steps: Math.max(0, Math.min(2, job.count.before)), ...(job.count.stride > 1 ? { stride: job.count.stride } : {}) } : view.countAlong,
              ...(meter && task ? { task: { ...task, meter } } : {}),
            });
            const jobKey = job?.words ? job.words.help : orders ? 'orders' : null;
            say(helpLine(kind, job?.vars ?? (orders ? ordersVars(orders) : null), cargo, revealed, jobKey), 'helping');
          },
          () => {
            set({ saving: false });
            reloadCheckpoint();
          },
        ),
      );
    },

    rescueTap,

    beginRescue() {
      const r = waitingRescue;
      if (!r || !view.rescueReady || view.saving) return;
      audioExtra({ at: clock.now(), action: 'play', slot: 'doorButtonPress' });
      startRescue(r);
    },

    loadCrate() {
      const task = view.task;
      if (view.stage !== 'cargo' || !task?.cargo || view.saving || task.cargo.status === 'accepted') return;
      if (task.cargo.loaded >= task.cargo.waiting) return;
      set({ task: { ...task, cargo: { ...task.cargo, loaded: task.cargo.loaded + 1, status: 'loading' } } });
      audioExtra({ at: clock.now(), action: 'play', slot: 'doorOpened' });
      log('cargo.load', { loaded: task.cargo.loaded + 1 });
    },

    unloadCrate() {
      const task = view.task;
      if (view.stage !== 'cargo' || !task?.cargo || view.saving || task.cargo.status === 'accepted' || task.cargo.loaded === 0) return;
      set({ task: { ...task, cargo: { ...task.cargo, loaded: task.cargo.loaded - 1, status: 'loading' } } });
      audioExtra({ at: clock.now(), action: 'play', slot: 'doorOpened' });
      log('cargo.unload', { loaded: task.cargo.loaded - 1 });
    },

    meterStep(delta) {
      const task = view.task;
      const m = task?.meter;
      if (!task || !m || !windowAccepts()) return;
      const value = Math.max(0, Math.min(m.max, m.value + delta));
      if (value === m.value) return;
      set({ task: { ...task, meter: { ...m, value } } });
      audioExtra({ at: clock.now(), action: 'play', slot: 'floorButtonPress' });
      log('meter.step', { value });
    },

    meterGo() {
      const m = view.task?.meter;
      if (!m || !windowAccepts()) return;
      audioExtra({ at: clock.now(), action: 'play', slot: 'doorButtonPress' });
      if (m.value === 0) {
        say(LINES.meter.empty, 'helping');
        return;
      }
      // The count is the answer; the ride shows it. The car goes that many floors toward the crew.
      const floor = m.from + (m.direction === 'up' ? m.value : -m.value);
      log('meter.go', { value: m.value, floor });
      lockAnswer(m.value, floor);
      apply({ type: 'press', floor, at: clock.now(), source: 'system' });
    },

    setMotion(next) {
      if (next === motion && pendingMotion === null) return;
      motion = next;
      pendingMotion = next;
      set({ motion: next });
      applyPendingMotion();
    },

    async playAgain() {
      if (!deps.newInstanceId || disposed || view.stage !== 'freeRide' || view.saving) return;
      // Close the replay control synchronously: a second tap cannot create another run.
      set({ stage: 'loading', saving: true, logOpen: false, reaction: null });
      closeAnswerWindow('replay');
      const previous = instanceId;
      const next = deps.newInstanceId();
      try {
        await runtime.startMission({ learnerId: deps.learnerId, missionId: FLOOR15.missionId, instanceId: next });
        if (disposed) return;
        runtime.deactivate(previous);
        instanceId = next;
        const activated = await runtime.activate(instanceId);
        if (disposed) return;
        revision = activated.revision;
        // A replay may be requested during a free ride: reset that presentation, not its history.
        for (const timer of timers) timer.cancel();
        for (const slot of cues.activeLoops()) audioExtra({ at: clock.now(), action: 'loopStop', slot, fadeMs: 200 });
        audioExtra({ at: clock.now(), action: 'loopStart', slot: 'ambientMachinery' });
        set({ elevator: createElevator(config, FLOOR15.homeFloor, clock.now(), 'closed') });
        log('mission.replay', { instanceId });
        enter(activated.view, 'advance');
      } catch (e) {
        fail('save', String(e));
      }
    },

    async recover() {
      if (view.stage !== 'error' || disposed) return;
      log('trouble.retry', { kind: view.trouble });
      set({ trouble: null, saving: true });
      // Let a ride that was under way finish first (the doors stay shut while it moves).
      for (let i = 0; !disposed && i < 200 && (isMoving(view.elevator) || view.elevator.phase === 'arrived'); i++) await new Promise<void>((r) => deps.schedule(r, 100));
      if (disposed) return;
      try {
        const activated = await runtime.activate(instanceId);
        if (disposed) return;
        revision = activated.revision;
        set({ saving: false });
        // The car may have stopped anywhere: stand it at its floor with the doors open first.
        apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
        tripKind = 'answer';
        enter(activated.view, 'resume');
      } catch (e) {
        fail('save', String(e));
      }
    },

    inspect,
    touchObject,
    closeCard,
    setAnswerTargets,
    collect,

    chooseReading(value) {
      answerChoice(value, 'card');
    },

    openNote() {
      if (!reading || reading.open || (view.stage !== 'task' && view.stage !== 'riding' && view.stage !== 'pause')) return;
      reading.open = true;
      set({ reading: readingView() });
      log('note', { open: true });
    },

    closeNote() {
      if (!reading || !reading.open) return;
      reading.open = false;
      set({ reading: readingView() });
      log('note', { open: false });
    },

    nextJob() {
      const outcome = pendingAdvance;
      if (view.stage !== 'success' || view.success !== 'review' || !outcome) return;
      pendingAdvance = null;
      log('nextJob', {});
      // The cargo bay closes its doors as the loaded car leaves.
      if (view.task?.kind === 'cargo') apply({ type: 'doorClose', at: clock.now() });
      enter(outcome.view, 'advance');
    },

    openLog() {
      if (view.stage !== 'freeRide' || !view.maintenanceUnlocked || view.logOpen) return;
      set({ logOpen: true, card: null });
      log('log.open', { inspected: view.discoveries.length });
    },

    closeLog() {
      if (!view.logOpen) return;
      set({ logOpen: false });
      log('log.close', {});
    },

    directoryOpened() {
      if (disposed) return;
      directoryOpenNow = true;
      // Met now: the introduction never comes. World memory only: never evidence, no command.
      const first = remember(DIRECTORY_TIP);
      log('directory', { open: true, stage: view.stage, floor: view.elevator.floor, first, hint: view.directoryHint });
      if (view.directoryHint) set({ directoryHint: false });
    },

    directoryClosed() {
      if (disposed) return;
      directoryOpenNow = false;
      log('directory', { open: false, stage: view.stage });
    },

    instanceId: () => instanceId,
    idle: async () => {
      let before: Promise<unknown>;
      do {
        before = inFlight;
        await before;
      } while (before !== inFlight);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const timer of timers) timer.cancel();
      listeners.clear();
      deps.onAudio?.(cues.activeLoops().map((slot) => ({ at: clock.now(), action: 'loopStop', slot, fadeMs: 200 })));
      runtime.deactivate(instanceId);
    },
  };

}

/** Words for each kind of test run (rescue copy keys). */
/** Words for each kind of test run (rescue copy keys). `fix`: the caption when it is a correction on the learner's own job. */
/** The board's words by example: a copy key (rescue.lines) for each moment. `leg`: between parts (default legTwo). */
const RESCUE_WORDS: Record<RescueExample, { general: string; example: string; fix: string; step: string; ask: string; right: string; retry: string; leg?: string }> = {
  move: { general: 'general', example: 'example', fix: 'fixMove', step: 'countStep', ask: 'ask', right: 'exampleRight', retry: 'exampleRetry' },
  twoMoves: { general: 'generalTwo', example: 'exampleTwo', fix: 'fixTwo', step: 'countStep', ask: 'askTwo', right: 'exampleRightTwo', retry: 'exampleRetry' },
  startFloor: { general: 'generalStart', example: 'exampleStart', fix: 'fixStart', step: 'countStep', ask: 'askStart', right: 'exampleRightStart', retry: 'exampleRetry' },
  express: { general: 'generalJumps', example: 'exampleJumps', fix: 'fixJumps', step: 'countStepJump', ask: 'askJumps', right: 'exampleRightJumps', retry: 'exampleRetryJumps' },
  tripMeter: { general: 'generalDistance', example: 'exampleDistance', fix: 'fixDistance', step: 'countStep', ask: 'askDistance', right: 'exampleRightDistance', retry: 'exampleRetry' },
  fill: { general: 'generalFill', example: 'exampleFill', fix: 'fixFill', step: 'countStepFill', ask: 'askFill', right: 'exampleRightFill', retry: 'exampleRetry' },
  orders: { general: 'generalOrders', example: 'exampleOrders', fix: 'fixOrders', step: 'countStepOrders', ask: 'askOrders', right: 'exampleRightOrders', retry: 'exampleRetryOrders' },
  // M8. These jobs are practice only (corrections on the learner's own job), so a parallel test run
  // never shows them: its caption reuses the correction's words.
  sequence: { general: 'generalSequence', example: 'fixSequence', fix: 'fixSequence', step: 'countStepSequence', ask: 'askSequence', right: 'exampleRightSequence', retry: 'exampleRetrySequence' },
  tens: { general: 'generalTens', example: 'fixTens', fix: 'fixTens', step: 'countStep', ask: 'askTwo', right: 'exampleRightTens', retry: 'exampleRetry', leg: 'legTens' },
  tenJump: { general: 'generalTens', example: 'fixTenJump', fix: 'fixTenJump', step: 'countStep', ask: 'ask', right: 'exampleRightTenJump', retry: 'exampleRetry' },
  tensFromZero: { general: 'generalTens', example: 'fixTensFromZero', fix: 'fixTensFromZero', step: 'countStep', ask: 'askTwo', right: 'exampleRightTensFromZero', retry: 'exampleRetryTensFromZero', leg: 'legTens' },
  order: { general: 'generalOrder', example: 'fixOrder', fix: 'fixOrder', step: 'countStepOrder', ask: 'askOrder', right: 'exampleRightOrder', retry: 'exampleRetryOrder', leg: 'legOrder' },
};

/** Two orders in the words of the copy. */
const ordersVars = ([orderA, orderB]: [number, number]): JobVars => ({ orderA, orderB });

const DISCOVERY_PREFIX = 'eq.discovery.';
/** The concept of an authored item (the reading pack's generator): a reading job. */
const READING_CONCEPT = 'authoredItem';
/** After a correct answer the doors open on what we found, with nothing in front of it, this long. */
export const ARRIVAL_BEAT_MS = { normal: 800, reduced: 250 };

function propFor(o: ObjectiveEntry, floor: number): MissionProp {
  return { id: o.id, floor, visual: o.visual, state: 'present', interactive: o.interaction === 'collect', label: o.label, action: o.action ?? null };
}
const DOOR_CLOSE_TIP = 'eq.tip.door-close';
/** The directory's one-time introduction (world memory: shown, or the learner opened it first). */
export const DIRECTORY_TIP = 'eq.tip.directory';
/** The directory's place names, as job lines write them ("Test Lab"). */
const DIRECTORY_NAMES = LANDINGS.floors.map((f) => f.name);
/** A job line names a place in the building: the directory is how to find it. */
const namesPlace = (line: string) => placesIn(line, DIRECTORY_NAMES).length > 0;

/** A landing thing's own sound (its closing sound as it shuts), else the generic reaction. */
function spotSound(spot: ExploreSpotEntry, closing: boolean): SoundSlot {
  return closing && spot.closeSound ? spot.closeSound : (spot.sound ?? 'landingReaction');
}
/** The DOOR CLOSE tip waits until the learner has sent the lift somewhere this many times. */
const DOOR_CLOSE_TIP_AFTER = 3;

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
