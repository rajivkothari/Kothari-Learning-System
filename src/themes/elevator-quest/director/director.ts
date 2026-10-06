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
import {
  NORMAL_TIMING,
  REDUCED_TIMING,
  createElevator,
  nextWakeAt,
  reduce,
  type ElevatorConfig,
  type ElevatorEvent,
  type ElevatorInput,
  type ElevatorState,
  type ElevatorTiming,
} from '../sim/elevator';
import type { ActivityView, MissionView, PresentationIntent, ResponseCheck } from '../../../engine';
import type { CommandOutcome, GameRuntime } from '../../../runtime/gameRuntime';
import { createCueMapper, type AudioCue, type CueMapper } from '../audio/cues';
import { FLOOR15, HELP_LABELS, LINES, PROGRESS, UNLOCK_LABELS, helpLine, misconceptionLine, type MoveTask } from '../content/floor15';
import type { PlaytestLog } from './playtestLog';

export type LiftyMood = 'neutral' | 'thinking' | 'pointing' | 'success' | 'concerned';
/** success: the answer was right; the panel is locked while Lifty reacts, so a late tap cannot answer the next job. */
export type Stage = 'loading' | 'intro' | 'reposition' | 'task' | 'riding' | 'success' | 'cargo' | 'finale' | 'complete' | 'freeRide' | 'error';
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
  overlay: { title: string; lines: string[] } | null;
  maintenanceUnlocked: boolean;
  /** Waiting for a durable commit before the world can advance. */
  saving: boolean;
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
  loadCrate(): void;
  unloadCrate(): void;
  setMotion(motion: Motion): void;
  playAgain(): Promise<void>;
  freeRide(): void;
  instanceId(): string;
  /** Resolves when no commit or help request is in flight (tests, orderly shutdown). */
  idle(): Promise<void>;
  dispose(): void;
}

type TripKind = 'answer' | 'reposition' | 'finale' | 'free';

interface PendingAnswer {
  value: number;
  check: ResponseCheck;
  arrived: boolean;
  outcome: CommandOutcome | null;
  floor: number;
}

const timingFor = (m: Motion) => (m === 'reduced' ? REDUCED_TIMING : NORMAL_TIMING);
const pauseFor = (m: Motion) => (m === 'reduced' ? 700 : 1600);

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
  let helpUsed = false;
  let taskStartedAt = 0;
  /** A motion change requested mid-ride waits until the car is at rest (timing must not change under a trip). */
  let pendingMotion: Motion | null = null;

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
    overlay: null,
    maintenanceUnlocked: false,
    saving: false,
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
  const nextCommandId = () => `${instanceId}:cmd${++commands}:${clock.now()}`;
  const track = <T>(p: Promise<T>): Promise<T> => {
    inFlight = inFlight.then(() => p.catch(() => undefined));
    return p;
  };

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
      case 'buttonPressed':
        if (e.source === 'learner') log('panel.press', { floor: e.floor, accepted: e.accepted, reason: e.reason });
        if (e.reason === 'replaced' && tripKind === 'answer') changedPlan = true;
        // Choosing the floor the car is already on is still an answer (the job may be right here).
        if (e.reason === 'here' && view.stage === 'task' && tripKind === 'answer' && view.elevator.destination === null) answerInPlace(e.floor);
        // Already on the repair floor with the doors open at the finale: finish without a ride.
        // (With the doors closed, pressing 15 reopens them and the door opening finishes instead.)
        if (e.reason === 'here' && view.stage === 'finale' && e.floor === FLOOR15.repairFloor && e.source === 'learner' && view.elevator.phase === 'idleOpen') {
          schedule(() => finish(), motion === 'reduced' ? 250 : 700);
        }
        if (e.reason === 'unavailable' && view.stage === 'finale') say(LINES.finaleOnlyRepair, 'pointing');
        break;
      case 'doorButton':
        log('door.press', { button: e.button, accepted: e.accepted });
        break;
      case 'departing':
        log('elevator.depart', { from: e.from, to: e.to, kind: tripKind });
        if (tripKind === 'answer') lockAnswer(e.to);
        break;
      case 'arrived':
        log('elevator.arrive', { floor: e.floor, kind: tripKind });
        break;
      case 'doorsOpened':
        applyPendingMotion();
        onRideComplete();
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

  function enter(next: MissionView, cause: 'start' | 'resume' | 'advance') {
    mission = next;
    pending = null;
    changedPlan = false;
    helpUsed = false;
    taskStartedAt = clock.now();
    const base: Partial<DirectorView> = {
      progress: progressFor(next.step?.id ?? null, next.status === 'completed'),
      task: null,
      help: null,
      highlights: [],
      beacon: null,
      shaftMode: 'status',
      countAlong: null,
      overlay: null,
      saving: false,
    };

    if (next.status === 'completed') {
      set({ ...base, stage: 'complete', power: 'on', overlay: { title: 'MISSION COMPLETE', lines: ['Floor 15 is running.'] } });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      return;
    }
    if (next.narrative?.eventKey === 'mission.intro') {
      set({ ...base, stage: 'intro', power: 'off' });
      apply({ type: 'place', at: clock.now(), floor: FLOOR15.homeFloor, doors: 'closed' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      say(LINES.intro, 'pointing');
      return;
    }
    if (next.narrative) {
      // Finale: only the repair floor is a sensible destination now.
      const others = range(FLOOR15.floors.min, FLOOR15.floors.max).filter((f) => f !== FLOOR15.repairFloor);
      set({ ...base, stage: 'finale', power: 'on', highlights: [FLOOR15.repairFloor] });
      if (cause !== 'advance') apply({ type: 'place', at: clock.now(), floor: FLOOR15.homeFloor + 2, doors: 'open' });
      apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: others });
      tripKind = 'finale';
      say(cause === 'advance' ? LINES.finale : `${LINES.resume} ${LINES.finale}`, 'pointing');
      log('task', { stepId: next.step?.id, kind: 'finale' });
      return;
    }
    const activity = next.activity;
    if (!activity) return;
    const helpView = helpFor(activity, false);

    if (activity.concept === 'fillToCapacity') {
      const { capacity, aboard, waiting } = activity.prompt as { capacity: number; aboard: number; waiting: number };
      const cargo: CargoView = { capacity, aboard, waiting, loaded: 0, status: 'loading' };
      set({ ...base, stage: 'cargo', power: 'on', task: { kind: 'cargo', stepId: activity.stepId, move: null, reference: 'start', cargo, wrongTries: activity.wrongTries }, help: helpView });
      if (view.elevator.phase !== 'idleOpen') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      say(cause === 'advance' ? LINES.cargo(capacity, aboard) : `${LINES.resume} ${LINES.cargo(capacity, aboard)}`, 'pointing');
      log('task', { stepId: activity.stepId, kind: 'cargo', capacity, aboard, waiting, challenge: activity.challenge });
      return;
    }

    const move = moveOf(activity);
    if (!move) {
      set({ ...base, stage: 'error' });
      say('This job is not ready for the lift yet.', 'concerned');
      return;
    }
    const reference: TaskView['reference'] = activity.challenge === 'stretch' ? 'beacon' : 'start';
    const kind: TaskView['kind'] = activity.representation === 'verticalScale' ? 'shaft' : 'panel';
    const task: TaskView = { kind, stepId: activity.stepId, move, reference, cargo: null, wrongTries: activity.wrongTries };
    set({ ...base, power: 'on', task, help: helpView, beacon: reference === 'beacon' ? move.start : null, shaftMode: kind === 'shaft' ? 'map' : 'status' });
    log('task', { stepId: activity.stepId, kind, ...move, reference, challenge: activity.challenge, cued: activity.cued, item: activity.item });

    if (reference === 'start' && view.elevator.floor !== move.start) {
      if (cause === 'advance') {
        // A real ride to the next job: the learner watches the lift work before operating it.
        set({ stage: 'reposition' });
        apply({ type: 'setPanel', at: clock.now(), enabled: false });
        say(LINES.reposition(move.start));
        tripKind = 'reposition';
        apply({ type: 'press', floor: move.start, at: clock.now(), source: 'system' });
        return;
      }
      apply({ type: 'place', at: clock.now(), floor: move.start, doors: 'open' });
    }
    beginTask(cause);
  }

  function beginTask(cause: 'start' | 'resume' | 'advance') {
    const activity = mission?.activity;
    const task = view.task;
    if (!activity || !task?.move) return;
    tripKind = 'answer';
    // A resumed task never starts behind closed doors.
    if (view.elevator.phase === 'idleClosed') apply({ type: 'place', at: clock.now(), floor: view.elevator.floor, doors: 'open' });
    apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: [] });
    const line = taskLine(activity, task);
    set({ stage: 'task' });
    say(cause === 'advance' ? line : `${LINES.resume} ${line}`, 'neutral');
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
    return { stepId: next.stepId, label: HELP_LABELS[next.kind] ?? 'HELP', offered: offered || next.mode === 'offer' };
  }

  // ---------- answers ----------

  function lockAnswer(value: number) {
    const start = clock.now();
    let check: ResponseCheck;
    try {
      check = runtime.check(instanceId, { mode: 'value', value });
    } catch {
      check = { ok: false, reason: 'noActivity' }; // not active (recovering): the commit decides
    }
    const evalMs = clock.now() - start;
    pending = { value, check, arrived: false, outcome: null, floor: value };
    log('answer', { value, correct: check.ok ? check.evaluation.correct : null, misconception: check.ok && !check.evaluation.correct ? (check.evaluation.misconception ?? null) : null, evalMs, changedPlan });
    set({ stage: 'riding', highlights: [], countAlong: null });
    say(LINES.riding(value), 'thinking');
    submit({ value });
  }

  function answerInPlace(floor: number) {
    lockAnswer(floor);
    apply({ type: 'setPanel', at: clock.now(), enabled: false });
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
          if (n >= 3 || disposed) {
            set({ stage: 'error', saving: false });
            say(LINES.commitTrouble, 'concerned');
            return;
          }
          say(LINES.commitTrouble, 'thinking');
          // The runtime dropped its in-memory checkpoint; reload it, then retry the SAME command id.
          const reloaded = await runtime.activate(instanceId);
          revision = reloaded.revision;
          return attempt(n + 1);
        },
      );
    void track(attempt(1));
  }

  function onRideComplete() {
    const kind = tripKind;
    if (kind === 'reposition') {
      beginTask('advance');
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
      const praise =
        activity?.challenge === 'stretch'
          ? LINES.praise.stretch
          : activity?.challenge === 'masteryEncounter'
            ? LINES.praise.route
            : changedPlan || (task?.wrongTries ?? 0) > 0
              ? LINES.praise.afterMiss
              : helpUsed
                ? LINES.praise.withHelp
                : (activity?.item.index ?? 0) === 0
                  ? LINES.praise.firstTry
                  : LINES.praise.noClue;
      set({ stage: 'success', highlights: [], countAlong: null });
      apply({ type: 'setPanel', at: clock.now(), enabled: false });
      say(praise, 'success');
      log('task.done', { stepId: task?.stepId, ms: clock.now() - taskStartedAt });
      advanceAfterPause(p.outcome);
      return;
    }
    // Wrong floor: the world already showed where we went. Explain it in building terms.
    const move = task?.move ?? null;
    const tag = result.misconception;
    const explained = tag ? misconceptionLine(tag, move, null) : null;
    const reference = task?.reference === 'beacon' ? 'beacon' : 'start';
    const arrivedLine = move ? LINES.arrivedWrong(p.floor, move, reference) : '';
    const regenerated = intents.some((i) => i.type === 'ITEM_REGENERATED');
    const offer = intents.find((i): i is Extract<PresentationIntent, { type: 'OFFER_SCAFFOLD' }> => i.type === 'OFFER_SCAFFOLD');
    const next = p.outcome.view.activity;
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
    apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: [] });
    say([explained ?? arrivedLine, explained ? '' : LINES.tryFromHere].filter(Boolean).join(' '), 'concerned');
    if (regenerated) {
      schedule(() => {
        say(LINES.regenerated, 'neutral');
        enter(p.outcome!.view, 'advance');
      }, pauseFor(motion));
    } else {
      tripKind = 'answer';
    }
  }

  function advanceAfterPause(outcome: CommandOutcome) {
    const unlocks = outcome.intents.filter((i): i is Extract<PresentationIntent, { type: 'UNLOCK_GRANTED' }> => i.type === 'UNLOCK_GRANTED');
    for (const u of unlocks) log('unlock', { id: u.unlockId });
    set({ progress: progressFor(outcome.view.step?.id ?? null, outcome.view.status === 'completed') });
    schedule(() => enter(outcome.view, 'advance'), pauseFor(motion));
  }

  // ---------- cargo ----------

  function cargoSubmit() {
    const task = view.task;
    const cargo = task?.cargo;
    if (!task || !cargo || view.saving) return;
    if (cargo.loaded === 0) {
      say(LINES.emptyLoad, 'pointing');
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
            set({ stage: 'success', task: { ...task, cargo: { ...cargo, status: 'accepted' } } });
            say(LINES.praise.cargo, 'success');
            log('task.done', { stepId: task.stepId, ms: clock.now() - taskStartedAt });
            apply({ type: 'doorClose', at: clock.now() });
            advanceAfterPause(outcome);
            return;
          }
          mission = outcome.view;
          const tag = result.misconception;
          const explained = tag ? misconceptionLine(tag, null, cargo) : null;
          const status: CargoView['status'] = overload ? 'overload' : 'underload';
          const next = outcome.view.activity;
          set({ task: { ...task, wrongTries: task.wrongTries + 1, cargo: { ...cargo, status } }, help: next ? helpFor(next, outcome.intents.some((i) => i.type === 'OFFER_SCAFFOLD')) : null });
          say([overload ? LINES.overload(cargo.capacity) : LINES.underload, explained].filter(Boolean).join(' '), 'concerned');
        },
        (e: unknown) => {
          log('commit', { commandId, ms: clock.now() - startedAt, ok: false, error: String(e) });
          set({ saving: false });
          say(LINES.commitTrouble, 'thinking');
          void runtime.activate(instanceId).then((r) => {
            revision = r.revision;
          });
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
          schedule(() => {
            audioExtra({ at: clock.now(), action: 'play', slot: 'completion' });
            say(LINES.complete, 'success');
            set({
              power: 'on',
              maintenanceUnlocked: view.maintenanceUnlocked || unlocks.includes('eq.system.maintenance-panel'),
              overlay: { title: 'MISSION COMPLETE', lines: firstTime ? unlocks.map((u) => UNLOCK_LABELS[u] ?? u) : ['Floor 15 restored again'] },
            });
          }, motion === 'reduced' ? 600 : 1800);
        },
        (e: unknown) => {
          log('commit', { commandId, ok: false, error: String(e) });
          set({ stage: 'finale', saving: false, power: 'on' });
          say(LINES.commitTrouble, 'thinking');
          void runtime.activate(instanceId).then((r) => {
            revision = r.revision;
            tripKind = 'finale';
            apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: range(FLOOR15.floors.min, FLOOR15.floors.max).filter((f) => f !== FLOOR15.repairFloor) });
          });
        },
      ),
    );
  }

  function applyPendingMotion() {
    const phase = view.elevator.phase;
    if (pendingMotion === null || (phase !== 'idleOpen' && phase !== 'idleClosed')) return;
    config = { ...config, timing: timingFor(pendingMotion) };
    cues = createCueMapperPreserving(cues, config.timing.decelMs);
    pendingMotion = null;
    set({ timing: config.timing });
    scheduleWake();
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
      const unlocks = await runtime.unlocks(deps.learnerId);
      view = { ...view, maintenanceUnlocked: unlocks.some((u) => u.unlockId === 'eq.system.maintenance-panel') };
      log('mission.activate', { instanceId, step: activated.view.step?.id ?? null, status: activated.view.status, revision });
      audioExtra({ at: clock.now(), action: 'loopStart', slot: 'ambientMachinery' });
      const intro = activated.view.narrative?.eventKey === 'mission.intro' && activated.revision === 1;
      enter(activated.view, intro ? 'advance' : 'resume');
    },

    pressFloor(floor, via = 'panel') {
      // Every press reaches the machine: it clicks, and the machine decides (locked, moving, here, lit).
      // A press while a commit is pending is still mechanical only: the panel is locked until then.
      if (via === 'shaft') log('shaft.tap', { floor });
      if (view.saving && view.stage === 'task') {
        apply({ type: 'setPanel', at: clock.now(), enabled: false });
        apply({ type: 'press', floor, at: clock.now() });
        apply({ type: 'setPanel', at: clock.now(), enabled: true });
        return;
      }
      apply({ type: 'press', floor, at: clock.now() });
    },

    pressDoorOpen() {
      if (view.stage === 'intro' && !view.saving) {
        apply({ type: 'doorOpen', at: clock.now() });
        set({ power: 'on', saving: true });
        say(LINES.introDone, 'success');
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
              void runtime.activate(instanceId).then((r) => {
                revision = r.revision;
              });
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
      helpUsed = true;
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
              help: shown.nextAvailable[0] ? { stepId: shown.nextAvailable[0].stepId, label: HELP_LABELS[shown.nextAvailable[0].kind] ?? 'HELP', offered: false } : null,
              highlights: kind === 'showAnswer' && revealed !== null ? [revealed] : kind === 'highlightGiven' && move ? [move.start] : view.highlights,
              shaftMode: kind === 'numberLine' || kind === 'guidedCount' ? 'numberLine' : view.shaftMode,
              countAlong: kind === 'guidedCount' && move ? { from: move.start, direction: move.direction, steps: move.change } : view.countAlong,
            });
            say(helpLine(kind, move, cargo, revealed), 'pointing');
          },
          () => {
            set({ saving: false });
            void runtime.activate(instanceId).then((r) => {
              revision = r.revision;
            });
          },
        ),
      );
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

    setMotion(next) {
      if (next === motion && pendingMotion === null) return;
      motion = next;
      pendingMotion = next;
      set({ motion: next });
      applyPendingMotion();
    },

    async playAgain() {
      if (!deps.newInstanceId) return;
      instanceId = deps.newInstanceId();
      await runtime.startMission({ learnerId: deps.learnerId, missionId: FLOOR15.missionId, instanceId });
      const activated = await runtime.activate(instanceId);
      revision = activated.revision;
      log('mission.replay', { instanceId });
      enter(activated.view, 'advance');
    },

    freeRide() {
      set({ stage: 'freeRide', overlay: null, highlights: [] });
      apply({ type: 'setPanel', at: clock.now(), enabled: true, disabledFloors: [] });
      tripKind = 'free';
      say(LINES.freeRide, 'success');
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

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
