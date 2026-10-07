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
import type { ActivityView, MissionView, PresentationIntent, RescueView, ResponseCheck } from '../../../engine';
import type { CommandOutcome, GameRuntime } from '../../../runtime/gameRuntime';
import { createCueMapper, type AudioCue, type CueMapper } from '../audio/cues';
import { FLOOR15, LINES, MAINTENANCE_UNLOCK, PACING, PROGRESS, RANK_UNLOCK, UNLOCK_LABELS, helpLabel, helpLine, misconceptionLine, replayLine, rescueFocusLine, rescueLine, type MoveTask } from '../content/floor15';
import { LANDINGS, REACTION_MS, exploreSpots, floor15Restored, type ExploreSpotEntry } from '../content/landings';
import { OBJECTIVES, objectiveFor, type ObjectVisual, type ObjectiveEntry } from '../content/objectives';
import { chooseReinforcement, replayMs, type StrategyReinforcement } from '../../../presentation/reinforcement/strategy';
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
  status: 'loading' | 'overload' | 'underload' | 'accepted';
}

export interface TaskView {
  kind: 'panel' | 'shaft' | 'cargo';
  stepId: string;
  move: MoveTask | null;
  /** Where the givens are anchored: the car's floor, or a beacon elsewhere in the shaft. */
  reference: 'start' | 'beacon';
  cargo: CargoView | null;
  wrongTries: number;
}

/**
 * Concept Rescue practice board. The learner counts a DIFFERENT example one cell at a time, then
 * says where it ends. Cells are floors (a move) or load spaces (a capacity), never the real job.
 */
export interface RescueStageView {
  kind: 'move' | 'fill';
  phase: 'counting' | 'ask' | 'checking' | 'right';
  /** Cells on the practice board, low to high. */
  cells: number[];
  /** Where counting starts. Never counted itself. Fill: the last occupied space (0 when empty). */
  origin: number;
  direction: 'up' | 'down';
  /** How many cells to count: the example's given. */
  steps: number;
  /** Cells counted so far, in order. */
  counted: number[];
  /** Fill only: the practice car's limit and what is already aboard. */
  capacity: number | null;
  aboard: number | null;
  /** Fill asks for a count: the learner picks one of these. A move asks for a cell. */
  choices: number[] | null;
  /** The instruction shown on the board. */
  caption: string;
  /** Misconception-specific framing, only when the evidence was strong. */
  focus: string | null;
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
  countAlong: { from: number; direction: 'up' | 'down'; steps: number } | null;
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
  /** Bumps once each time Floor 15 comes back: the panel lamps sweep bottom to top. 0: never. */
  sweep: number;
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
  loadCrate(): void;
  unloadCrate(): void;
  setMotion(motion: Motion): void;
  playAgain(): Promise<void>;
  /** After a correct answer, once the success has settled: go on to the next job. The only way on. */
  nextJob(): void;
  /** Load a mission object (repair kit, toolbox, parts) into the lift. Optional; never evidence. */
  collect(objectId: string): void;
  /** Free ride, doors open: touch the landing's spot. A reaction every time; a discovery once. */
  inspect(spotId: string): void;
  openLog(): void;
  closeLog(): void;
  /** After stage "error": reload the mission from its last durable save and carry on from there. */
  recover(): Promise<void>;
  instanceId(): string;
  /** Resolves when no commit or help request is in flight (tests, orderly shutdown). */
  idle(): Promise<void>;
  dispose(): void;
}

type TripKind = 'answer' | 'reposition' | 'finale' | 'free';

/** The item currently accepting a panel answer. Null: no press can be an answer right now. */
interface AnswerWindow {
  token: number;
  itemSignature: string;
}

interface PendingAnswer {
  value: number;
  check: ResponseCheck;
  arrived: boolean;
  outcome: CommandOutcome | null;
  floor: number;
}

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

/** Build the practice board for a rescue example. Pure; the example comes from the engine. */
export function rescueBoard(r: RescueView, min: number, max: number): Omit<RescueStageView, 'caption' | 'focus'> | null {
  const p = r.example.prompt;
  if (r.example.concept === 'positionAfterMove' && typeof p.start === 'number' && typeof p.change === 'number') {
    const direction = p.direction === 'down' ? 'down' : 'up';
    const end = direction === 'down' ? p.start - p.change : p.start + p.change;
    const lo = Math.max(min, Math.min(p.start, end) - 1);
    const hi = Math.min(max, Math.max(p.start, end) + 1);
    return { kind: 'move', phase: 'counting', cells: range(lo, hi), origin: p.start, direction, steps: p.change, counted: [], capacity: null, aboard: null, choices: null };
  }
  if (r.example.concept === 'fillToCapacity' && typeof p.capacity === 'number' && typeof p.aboard === 'number') {
    const room = p.capacity - p.aboard;
    return { kind: 'fill', phase: 'counting', cells: range(1, p.capacity), origin: p.aboard, direction: 'up', steps: room, counted: [], capacity: p.capacity, aboard: p.aboard, choices: range(1, p.capacity) };
  }
  return null;
}

function moveOf(activity: ActivityView): MoveTask | null {
  const { start, change, direction } = activity.prompt;
  if (typeof start !== 'number' || typeof change !== 'number') return null;
  return { start, change, direction: direction === 'down' ? 'down' : 'up' };
}

export function createFloor15Director(deps: DirectorDeps): Director {
  const { runtime, clock, schedule } = deps;
  let instanceId = deps.instanceId;
  let motion: Motion = deps.motion;
  let config: ElevatorConfig = { minFloor: FLOOR15.floors.min, maxFloor: FLOOR15.floors.max, timing: timingFor(motion) };
  let cues: CueMapper = createCueMapper({ decelFadeMs: config.timing.decelMs });
  const listeners = new Set<(v: DirectorView) => void>();
  let wake: { cancel(): void } | null = null;
  let disposed = false;
  let seq = 0;
  let commands = 0;
  let inFlight: Promise<unknown> = Promise.resolve();

  let mission: MissionView | null = null;
  let revision = 0;
  let tripKind: TripKind | null = null;
  let pending: PendingAnswer | null = null;
  let changedPlan = false;
  /** How the in-window answer was chosen: on the panel, or on the shaft map (an observation). */
  let answerVia: 'panel' | 'shaft' | null = null;
  let pressVia: 'panel' | 'shaft' = 'panel';
  /** The current job came back from a Concept Rescue (same item, or a fresh one in its place). */
  let afterRescue = false;
  /** Why a reposition ride started: the task line that follows depends on it. */
  let repositionCause: 'advance' | 'rescueReturn' = 'advance';
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
  let lastReactionAt = -Infinity;
  /** The committed outcome of a correct answer, waiting for NEXT JOB. */
  let pendingAdvance: CommandOutcome | null = null;
  /** The next job's tools, held back while its hall call is answered. */
  let jobTools: Partial<DirectorView> | null = null;

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
    power: 'off',
    rescue: null,
    maintenanceUnlocked: false,
    rank: null,
    hallCall: null,
    reaction: null,
    discoveries: [],
    logOpen: false,
    sweep: 0,
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
    set({ stage: 'error', saving: false, trouble: kind, help: null, highlights: [] });
    say(kind === 'save' ? LINES.saveStuck : LINES.commitTrouble, 'concerned');
    log('trouble', { kind, detail });
  }

  /** Reload the durable checkpoint into memory after a failed commit. Fails safely. */
  function reloadCheckpoint(after?: () => void) {
    void runtime.activate(instanceId).then(
      (r) => {
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
    void track(runtime.remember(deps.learnerId, key).catch((e: unknown) => log('memory.error', { key, error: String(e) })));
    return true;
  }
  const discoveriesNow = () => [...memory].filter((k) => k.startsWith(DISCOVERY_PREFIX)).sort();

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
    apply({ type: 'setPanel', at: clock.now(), enabled: answerWindow !== null, disabledFloors: [] });
    log('answer.window', { open: answerWindow !== null, token: answerWindow?.token ?? null });
  }

  /** No press can answer until a window opens again. The panel locks (taps still click). */
  function closeAnswerWindow(reason: string, lockPanel = true) {
    if (answerWindow) log('answer.window', { open: false, token: answerWindow.token, reason });
    answerWindow = null;
    destinationToken = null;
    if (lockPanel) apply({ type: 'setPanel', at: clock.now(), enabled: false });
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
        if (tripKind === 'free') {
          quiet();
          set({ reaction: null });
        }
        if (tripKind === 'answer') {
          // The call must come from the open window, for the item that is still on screen.
          const valid = answerWindow !== null && destinationToken === answerWindow.token && currentSignature() === answerWindow.itemSignature;
          if (valid) lockAnswer(e.to);
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
    pendingAdvance = null;
    changedPlan = false;
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
      rescue: null,
      replay: null,
      saving: false,
      hallCall: null,
      logOpen: false,
      success: null,
      props: [],
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

    if (activity.concept === 'fillToCapacity') {
      const { capacity, aboard, waiting } = activity.prompt as { capacity: number; aboard: number; waiting: number };
      const cargo: CargoView = { capacity, aboard, waiting, loaded: 0, status: 'loading' };
      // The cargo bay takes the cabin view, crates and all; the dock prop would only peek through its gaps.
      set({ ...base, stage: 'cargo', power: 'on', task: { kind: 'cargo', stepId: activity.stepId, move: null, reference: 'start', cargo, wrongTries: activity.wrongTries }, help: helpView });
      if (view.elevator.phase !== 'idleOpen') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      if (activity.rescue?.status === 'active') return startRescue(activity.rescue);
      const cargoLine = cause === 'rescueReturn' ? rescueLine('backFill', { capacity, aboard }) : LINES.cargo(capacity, aboard);
      say(cause === 'resume' ? `${LINES.resume} ${cargoLine}` : cargoLine, 'helping');
      log('task', { stepId: activity.stepId, kind: 'cargo', capacity, aboard, waiting, challenge: activity.challenge });
      return;
    }

    const move = moveOf(activity);
    if (!move) {
      set(base);
      fail('content', `no move in ${activity.stepId}`);
      return;
    }
    const reference: TaskView['reference'] = activity.challenge === 'stretch' ? 'beacon' : 'start';
    const kind: TaskView['kind'] = activity.representation === 'verticalScale' ? 'shaft' : 'panel';
    const task: TaskView = { kind, stepId: activity.stepId, move, reference, cargo: null, wrongTries: activity.wrongTries };
    // The job's own tools (help, beacon, shaft map) appear with the job, not during the call before it.
    const tools: Partial<DirectorView> = { help: helpView, beacon: reference === 'beacon' ? move.start : null, shaftMode: kind === 'shaft' ? 'map' : 'status' };
    const hallCall = cause === 'advance' && reference === 'start' && view.elevator.floor !== move.start && activity.rescue?.status !== 'active';
    // A reference object (the beacon) stands on its given floor for the whole job: it is a given.
    const ref = objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'reference');
    set({ ...base, power: 'on', task, ...(hallCall ? {} : tools), props: ref ? [propFor(ref, move.start)] : [] });
    jobTools = hallCall ? tools : null;
    log('task', { stepId: activity.stepId, kind, ...move, reference, challenge: activity.challenge, cued: activity.cued, item: activity.item });

    if (activity.rescue?.status === 'active') {
      if (reference === 'start' && view.elevator.floor !== move.start) apply({ type: 'place', at: clock.now(), floor: move.start, doors: 'open' });
      return startRescue(activity.rescue);
    }

    if (reference === 'start' && view.elevator.floor !== move.start) {
      if (cause === 'advance') return offerHallCall(move.start);
      if (cause === 'rescueReturn') {
        // Back from a test run: a real ride to the job's floor, which the lift takes by itself.
        // Travel runs at the theme's auto-ride pace; the doors keep their normal feel.
        set({ stage: 'reposition' });
        apply({ type: 'setPanel', at: clock.now(), enabled: false });
        say(LINES.reposition(move.start), 'systemCheck');
        tripKind = 'reposition';
        repositionCause = cause;
        const phase = view.elevator.phase;
        if ((phase === 'idleOpen' || phase === 'idleClosed') && PACING.autoRideTimeScale !== 1) {
          autoRideRestore = config.timing;
          setTiming(autoRideTiming(config.timing, PACING.autoRideTimeScale));
        }
        apply({ type: 'press', floor: move.start, at: clock.now(), source: 'system' });
        return;
      }
      apply({ type: 'place', at: clock.now(), floor: move.start, doors: 'open' });
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
    const activity = mission?.activity;
    const task = view.task;
    if (!activity || !task?.move) return;
    tripKind = 'answer';
    if (jobTools) {
      set(jobTools);
      jobTools = null;
    }
    // A resumed task never starts behind closed doors.
    if (view.elevator.phase === 'idleClosed') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
    const line = cause === 'rescueReturn' ? backLine(task) : taskLine(activity, task);
    set({ stage: 'task' });
    openAnswerWindow();
    say(cause === 'resume' ? `${LINES.resume} ${line}` : line, 'neutral');
  }

  function backLine(task: TaskView): string {
    const m = task.move as MoveTask;
    const vars = { start: m.start, change: m.change, dir: m.direction, rel: m.direction === 'down' ? 'below' : 'above' };
    return rescueLine(task.reference === 'beacon' ? 'backBeacon' : 'back', vars);
  }

  function taskLine(activity: ActivityView, task: TaskView): string {
    const move = task.move as MoveTask;
    if (activity.challenge === 'stretch') return LINES.stretch(move);
    if (activity.challenge === 'masteryEncounter') return LINES.encounterRoute(move);
    if (task.kind === 'shaft') return LINES.shaft(move);
    return LINES.cued(move, activity.item.index);
  }

  function helpFor(activity: ActivityView, offered: boolean): DirectorView['help'] {
    const next = activity.scaffolds.available[0];
    if (!next) return null;
    return { stepId: next.stepId, label: helpLabel(next.kind), offered: offered || next.mode === 'offer' };
  }

  // ---------- Concept Rescue ----------
  //
  // The job pauses. Lifty explains the idea (misconception-specific only when the engine saw strong
  // evidence), then the learner counts a DIFFERENT example cell by cell and says where it ends. The
  // example's answer is taught, so it is never evidence. Then back to the job, which the learner
  // still solves. The real answer is never shown.

  function startRescue(r: RescueView) {
    const board = rescueBoard(r, FLOOR15.floors.min, FLOOR15.floors.max);
    if (!board) {
      fail('content', 'no rescue board');
      return;
    }
    const focus = rescueFocusLine(r.focus);
    tripKind = null;
    closeAnswerWindow('rescue');
    set({ stage: 'rescue', rescue: { ...board, caption: exampleCaption(board), focus }, help: null, highlights: [], countAlong: null, beacon: null });
    say(`${rescueLine('intro')} ${focus ?? rescueLine(board.kind === 'fill' ? 'generalFill' : 'general')}`, 'helping');
    log('rescue.start', { stepId: mission?.activity?.stepId, focus: r.focus, example: r.example.signature });
  }

  function exampleCaption(b: Pick<RescueStageView, 'kind' | 'origin' | 'steps' | 'direction' | 'capacity' | 'aboard'>): string {
    return b.kind === 'fill'
      ? rescueLine('exampleFill', { exCapacity: b.capacity ?? 0, exAboard: b.aboard ?? 0 })
      : rescueLine('example', { exStart: b.origin, exChange: b.steps, exDir: b.direction });
  }

  function rescueTap(n: number) {
    const r = view.rescue;
    if (view.stage !== 'rescue' || !r || view.saving) return;
    if (r.phase === 'counting') {
      const sign = r.direction === 'down' ? -1 : 1;
      const expected = r.origin + sign * (r.counted.length + 1);
      if (n !== expected) {
        log('rescue.count', { tapped: n, ok: false });
        say(rescueLine('notNext'), 'thinking');
        return;
      }
      const counted = [...r.counted, n];
      const done = counted.length >= r.steps;
      const step = r.kind === 'fill' ? rescueLine('countStepFill', { n: counted.length }) : rescueLine('countStep', { floor: n, n: counted.length });
      const ask = r.kind === 'fill' ? rescueLine('askFill') : rescueLine('ask', { exChange: r.steps });
      log('rescue.count', { tapped: n, ok: true, counted: counted.length });
      audioExtra({ at: clock.now(), action: 'play', slot: 'floorButtonPress' });
      set({ rescue: { ...r, counted, phase: done ? 'ask' : 'counting', caption: done ? ask : r.caption } });
      say(done ? `${step} ${ask}` : step, 'helping');
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
            set({ rescue: { ...now, phase: 'counting', counted: [], caption: exampleCaption(now) } });
            say(rescueLine('exampleRetry', { exStart: now.origin }), 'helping');
            return;
          }
          const sign = now.direction === 'down' ? -1 : 1;
          const exAnswer = now.kind === 'fill' ? now.steps : now.origin + sign * now.steps;
          const right = now.kind === 'fill' ? rescueLine('exampleRightFill', { exAnswer }) : rescueLine('exampleRight', { exAnswer, exChange: now.steps });
          set({ rescue: { ...now, phase: 'right', caption: right } });
          say(right, 'satisfied');
          log('rescue.complete', { returnTo: complete.returnTo });
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

  function lockAnswer(value: number) {
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
    pending = { value, check, arrived: false, outcome: null, floor: value };
    log('answer', { value, window, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs, changedPlan });
    // A routine ride needs no words: the job stays on screen while the lift works.
    set({ stage: 'riding', highlights: [], countAlong: null, lifty: { ...view.lifty, mood: 'thinking' } });
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
    const found = objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'destination');
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

  function submit(response: { value: number }) {
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
    if (kind === 'reposition') {
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
    if (result.correct) {
      const activity = mission.activity;
      const move = task?.move ?? null;
      const replay = move && activity
        ? chooseReinforcement({
            kind: 'move',
            ...move,
            reference: task?.reference ?? 'start',
            challenge: activity.challenge,
            observed: [...(answerVia === 'shaft' ? (['usedNumberLine'] as const) : []), ...(changedPlan || (task?.wrongTries ?? 0) > 0 ? (['changedPlan'] as const) : [])],
          })
        : null;
      const found = activity ? objectiveFor(OBJECTIVES, activity.stepId, activity.item.index, 'destination') : null;
      log('task.done', { stepId: task?.stepId, ms: clock.now() - taskStartedAt });
      beginSuccess(p.outcome, found?.found ?? '', successPraise(), replay, true);
      return;
    }
    // Wrong floor: the world already showed where we went. Explain it in building terms.
    const move = task?.move ?? null;
    const tag = result.misconception;
    const explained = tag ? misconceptionLine(tag, move, null) : null;
    const reference = task?.reference === 'beacon' ? 'beacon' : 'start';
    const arrivedLine = move ? LINES.arrivedWrong(p.floor, move, reference) : '';
    // What is missing here says the most: "No repair kit here." (and the beacon, if we are at it).
    const activityNow = mission.activity;
    const missing = activityNow ? objectiveFor(OBJECTIVES, activityNow.stepId, activityNow.item.index, 'destination')?.absent ?? null : null;
    // Only a given (reference) object can stand here after a wrong answer: the beacon on its floor.
    const standingHere = view.props.find((x) => x.floor === p.floor && x.state === 'present');
    const seen = standingHere ? (OBJECTIVES.objectives.find((o) => o.id === standingHere.id)?.found ?? null) : null;
    const world = [missing, seen].filter(Boolean).join(' ');
    const regenerated = intents.some((i) => i.type === 'ITEM_REGENERATED');
    const offer = intents.find((i): i is Extract<PresentationIntent, { type: 'OFFER_SCAFFOLD' }> => i.type === 'OFFER_SCAFFOLD');
    const rescue = intents.find((i): i is Extract<PresentationIntent, { type: 'CONCEPT_RESCUE' }> => i.type === 'CONCEPT_RESCUE');
    const next = p.outcome.view.activity;
    if (rescue) {
      // The world shows where we went first. Then the job pauses for a practice run.
      mission = p.outcome.view;
      set({ stage: 'pause', task: task ? { ...task, wrongTries: next?.wrongTries ?? task.wrongTries + 1 } : task, help: null, highlights: [], countAlong: null });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      say([world, explained ?? arrivedLine].filter(Boolean).join(' '), 'concerned');
      schedule(() => startRescue(rescue.rescue), pauseFor(motion));
      return;
    }
    set({
      stage: 'task',
      task: task ? { ...task, wrongTries: next?.wrongTries ?? task.wrongTries + 1 } : task,
      help: next ? helpFor(next, Boolean(offer)) : null,
      // Explain the counting convention only: the first floor after the start is "1". Counting all
      // the way would show the destination for free; the full count is the guided help step.
      countAlong: tag === 'quantity.countedStartingPosition' && move ? { from: move.start, direction: move.direction, steps: 1 } : null,
      shaftMode: tag === 'quantity.countedStartingPosition' && view.shaftMode === 'status' ? 'map' : view.shaftMode,
    });
    mission = p.outcome.view;
    changedPlan = false;
    say([world, explained ?? arrivedLine, explained || world ? '' : LINES.tryFromHere].filter(Boolean).join(' '), 'concerned');
    if (regenerated) {
      schedule(() => {
        say(LINES.regenerated, 'neutral');
        enter(p.outcome!.view, 'advance');
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
    set({ stage: 'success', success: arrival ? 'arrival' : 'animating', highlights: [], countAlong: null, help: null });
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
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
    log('answer', { value: cargo.loaded, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs: clock.now() - start });
    // The car's load sensor is world physics: it knows the total, not the right answer.
    const overload = cargo.aboard + cargo.loaded > cargo.capacity;
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
            // Observed: the learner loaded these crates, exactly filling the car.
            const replay = chooseReinforcement({ kind: 'capacity', capacity: cargo.capacity, aboard: cargo.aboard, loaded: cargo.loaded, challenge: mission?.activity?.challenge ?? 'practice', observed: ['loadedExactly'] });
            beginSuccess(outcome, LINES.praise.cargo, afterRescue ? LINES.praise.afterRescue : '', replay, false);
            return;
          }
          mission = outcome.view;
          const tag = result.misconception;
          const explained = tag ? misconceptionLine(tag, null, cargo) : null;
          const status: CargoView['status'] = overload ? 'overload' : 'underload';
          const next = outcome.view.activity;
          const rescue = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'CONCEPT_RESCUE' }> => i.type === 'CONCEPT_RESCUE');
          if (rescue) {
            set({ task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: null });
            say([overload ? LINES.overload(cargo.capacity) : LINES.underload, explained].filter(Boolean).join(' '), 'concerned');
            schedule(() => startRescue(rescue.rescue), pauseFor(motion));
            return;
          }
          set({ task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: next ? helpFor(next, outcome.intents.some((i) => i.type === 'OFFER_SCAFFOLD')) : null });
          say([overload ? LINES.overload(cargo.capacity) : LINES.underload, explained].filter(Boolean).join(' '), 'concerned');
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
    return core ? { floor: FLOOR15.repairFloor, spotId: core.id, seq: (view.reaction?.seq ?? 0) + 1 } : null;
  }

  // ---------- free ride and exploration ----------

  function enterFreeRide(line: string) {
    closeAnswerWindow('freeRide', false);
    tripKind = 'free';
    set({ stage: 'freeRide', highlights: [], hallCall: null });
    apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: [] });
    say(line, 'satisfied');
    log('freeRide', {});
  }

  /** The spot on this floor the learner can touch now, if any (the dormant core does nothing). */
  function spotHere(spotId?: string): ExploreSpotEntry | null {
    const floor = view.elevator.floor;
    if (floor === FLOOR15.repairFloor && !view.floor15Restored) return null;
    const spots = exploreSpots(LANDINGS, floor);
    return (spotId ? spots.find((s) => s.id === spotId) : spots.find((s) => !memory.has(s.discovery))) ?? null;
  }

  /**
   * Free-ride arrival: the floor first. After a short beat, if something here is still undiscovered,
   * Lifty names what to touch. Otherwise Lifty stays quiet. Nothing waits on the beat.
   */
  function arrivalBeat() {
    const floor = view.elevator.floor;
    schedule(() => {
      if (view.stage !== 'freeRide' || view.logOpen || view.elevator.phase !== 'idleOpen' || view.elevator.floor !== floor) return;
      const spot = spotHere();
      if (spot) say(LINES.exploreHint(spot.object), 'helping');
    }, motion === 'reduced' ? 300 : 900);
  }

  function inspect(spotId: string) {
    if (view.stage !== 'freeRide' || view.logOpen || view.elevator.phase !== 'idleOpen') return;
    const spot = spotHere(spotId);
    if (!spot) return;
    const now = clock.now();
    const floor = view.elevator.floor;
    const last = view.reaction;
    // One reaction at a time: taps during a reaction do not restart it (no rapid flicker).
    if (last && last.floor === floor && last.spotId === spot.id && now - lastReactionAt < REACTION_MS[motion]) return;
    lastReactionAt = now;
    set({ reaction: { floor, spotId: spot.id, seq: (last?.seq ?? 0) + 1 } });
    audioExtra({ at: now, action: 'play', slot: 'landingReaction' });
    const first = remember(spot.discovery);
    log('inspect', { floor, spot: spot.id, first });
    if (!first) return;
    set({ discoveries: discoveriesNow() });
    say(spot.line, 'satisfied');
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
      revision = activated.revision;
      const unlocks = (await runtime.unlocks(deps.learnerId)).map((u) => u.unlockId);
      for (const key of await runtime.memories(deps.learnerId)) memory.add(key);
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
            const task = view.task;
            const move = task?.move ?? null;
            const cargo = task?.cargo ? { capacity: task.cargo.capacity, aboard: task.cargo.aboard } : null;
            const kind = shown.scaffold.kind;
            const revealed = typeof shown.revealedValue === 'number' ? shown.revealedValue : null;
            set({
              saving: false,
              help: shown.nextAvailable[0] ? { stepId: shown.nextAvailable[0].stepId, label: helpLabel(shown.nextAvailable[0].kind), offered: false } : null,
              highlights: kind === 'showAnswer' && revealed !== null ? [revealed] : kind === 'highlightGiven' && move ? [move.start] : view.highlights,
              shaftMode: kind === 'numberLine' || kind === 'countStrategy' ? 'numberLine' : view.shaftMode,
              // The counting strategy shows how to START counting (at most two floors), never the stop.
              countAlong: kind === 'countStrategy' && move ? { from: move.start, direction: move.direction, steps: Math.min(2, move.change - 1) } : view.countAlong,
            });
            say(helpLine(kind, move, cargo, revealed), 'helping');
          },
          () => {
            set({ saving: false });
            reloadCheckpoint();
          },
        ),
      );
    },

    rescueTap,

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

    setMotion(next) {
      if (next === motion && pendingMotion === null) return;
      motion = next;
      pendingMotion = next;
      set({ motion: next });
      applyPendingMotion();
    },

    async playAgain() {
      if (!deps.newInstanceId) return;
      set({ logOpen: false, reaction: null });
      instanceId = deps.newInstanceId();
      await runtime.startMission({ learnerId: deps.learnerId, missionId: FLOOR15.missionId, instanceId });
      const activated = await runtime.activate(instanceId);
      revision = activated.revision;
      log('mission.replay', { instanceId });
      enter(activated.view, 'advance');
    },

    async recover() {
      if (view.stage !== 'error' || disposed) return;
      log('trouble.retry', { kind: view.trouble });
      set({ trouble: null, saving: true });
      // Let a ride that was under way finish first (the doors stay shut while it moves).
      for (let i = 0; i < 200 && (isMoving(view.elevator) || view.elevator.phase === 'arrived'); i++) await new Promise<void>((r) => schedule(r, 100));
      try {
        const activated = await runtime.activate(instanceId);
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
    collect,

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
      set({ logOpen: true });
      log('log.open', { inspected: view.discoveries.length });
    },

    closeLog() {
      if (!view.logOpen) return;
      set({ logOpen: false });
      log('log.close', {});
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
      disposed = true;
      wake?.cancel();
      deps.onAudio?.(cues.activeLoops().map((slot) => ({ at: clock.now(), action: 'loopStop', slot, fadeMs: 200 })));
      runtime.deactivate(instanceId);
    },
  };

}

const DISCOVERY_PREFIX = 'eq.discovery.';
/** After a correct answer the doors open on what we found, with nothing in front of it, this long. */
export const ARRIVAL_BEAT_MS = { normal: 800, reduced: 250 };

function propFor(o: ObjectiveEntry, floor: number): MissionProp {
  return { id: o.id, floor, visual: o.visual, state: 'present', interactive: o.interaction === 'collect', label: o.label, action: o.action ?? null };
}
const DOOR_CLOSE_TIP = 'eq.tip.door-close';
/** The DOOR CLOSE tip waits until the learner has sent the lift somewhere this many times. */
const DOOR_CLOSE_TIP_AFTER = 3;

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
