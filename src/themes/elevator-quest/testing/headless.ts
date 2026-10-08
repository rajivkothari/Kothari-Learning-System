/// <reference types="node" />
// Headless Floor 15: the real director, runtime, and SQLite (node:sqlite), on virtual time.
// Test-only. No rendering, no audio device.
import type { SqlDatabase } from '../../../persistence/driver';
import { openNodeDatabase, type FaultPlan } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../../runtime/gameRuntime';
import { CORE_CONTENT, tempDir } from '../../../runtime/testing/harness';
import type { AudioCue } from '../audio/cues';
import { FLOOR15, THEME_PACK_ID, UNLOCK_RULES } from '../content/floor15';
import { createFloor15Director, type Director, type DirectorView, type Motion } from '../director/director';
import { createPlaytestLog, type PlaytestLog } from '../director/playtestLog';
import { chooseFloor15Instance } from '../sessionCore';

export const LEARNER = 'learner-a';
export const CONTENT = { ...CORE_CONTENT, unlocks: UNLOCK_RULES };

/**
 * The shipped content with the practice jobs' correction replaced by the generic rescue (a
 * parallel example after five misses, back to the same item). For tests about the help ladder's
 * own mechanics: with the shipped policy, the ladder runs on the fresh job after a correction.
 */
export const LADDER_CONTENT = {
  ...CONTENT,
  pack: {
    ...CONTENT.pack,
    scaffoldingPolicies: CONTENT.pack.scaffoldingPolicies.map((p) => (p.conceptRescue?.example === 'target' ? { ...p, conceptRescue: { afterWrongTries: 5, returnTo: 'same' as const, example: 'parallel' as const } } : p)),
  },
};

/**
 * Content with pool steps pinned to one member each (M8): for tests that walk a known sequence of
 * jobs. Unpinned pools still choose by the instance's seed, as in play.
 */
export function pinPools<C extends typeof CONTENT>(content: C, picks: Readonly<Record<string, string>>): C {
  const missions = content.missions.map((m) => ({
    ...m,
    steps: m.steps.map((s) => {
      const pick = s.kind === 'activity' ? picks[s.id] : undefined;
      if (s.kind !== 'activity' || pick === undefined) return s;
      if (!(s.activityIds ?? [s.activityId]).includes(pick)) throw new Error(`"${pick}" is not in step "${s.id}"`);
      return { kind: 'activity' as const, id: s.id, activityId: pick, items: s.items };
    }),
  }));
  return { ...content, missions };
}

/** The jobs the mission had before pools (D148): one of each kind, in a known order. */
export const CLASSIC_PICKS = {
  'second-representation': 'move-down.scale.cued',
  'two-groups': 'combine-groups.objects',
  'two-moves': 'two-moves.line.cued',
  'number-sense': 'equal-jumps.line.cued',
  'compare-distance': 'distance.meter',
  stretch: 'move-either.reference.stretch',
} as const;
export const CLASSIC_CONTENT = pinPools(CONTENT, CLASSIC_PICKS);

export interface VirtualTime {
  now(): number;
  schedule(fn: () => void, delayMs: number): { cancel(): void };
  /** Run timers in order until `until` returns true or `maxMs` of virtual time passes. */
  runUntil(until: () => boolean, maxMs?: number): Promise<boolean>;
  advance(ms: number): Promise<void>;
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};

export function virtualTime(start = 1_791_244_800_000): VirtualTime {
  let now = start;
  let id = 0;
  const timers: { at: number; id: number; fn: () => void; cancelled: boolean }[] = [];
  const nextTimer = () => timers.filter((t) => !t.cancelled).sort((a, b) => a.at - b.at || a.id - b.id)[0];
  return {
    now: () => now,
    schedule(fn, delayMs) {
      const t = { at: now + Math.max(0, delayMs), id: ++id, fn, cancelled: false };
      timers.push(t);
      return { cancel: () => void (t.cancelled = true) };
    },
    async runUntil(until, maxMs = 600_000) {
      const end = now + maxMs;
      await flush();
      while (!until()) {
        const t = nextTimer();
        if (!t || t.at > end) return until();
        t.cancelled = true;
        now = Math.max(now, t.at);
        t.fn();
        await flush();
      }
      return true;
    },
    async advance(ms) {
      const end = now + ms;
      await flush();
      for (;;) {
        const t = nextTimer();
        if (!t || t.at > end) break;
        t.cancelled = true;
        now = Math.max(now, t.at);
        t.fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

export interface Session {
  db: SqlDatabase;
  rt: GameRuntime;
  director: Director;
  time: VirtualTime;
  log: PlaytestLog;
  audio: AudioCue[];
  view(): DirectorView;
}

let instances = 0;

/**
 * `autoHallCalls` (default true): press each hall call's floor shortly after it is offered, as a
 * learner would, so tests about jobs need not drive the rides between them. Hall-call tests turn it off.
 * `autoNextJob` (default true): press NEXT JOB shortly after a success settles, for the same reason.
 * Tests about the child-paced success turn it off.
 */
export async function openSession(file: string, time: VirtualTime, opts: { instanceId?: string; motion?: Motion; faults?: FaultPlan; learnerId?: string; autoHallCalls?: boolean; autoNextJob?: boolean; content?: typeof CONTENT } = {}): Promise<Session> {
  const db = openNodeDatabase(file, opts.faults);
  const rt = await openGameRuntime(db, opts.content ?? CONTENT, time);
  const learnerId = opts.learnerId ?? LEARNER;
  if (!(await rt.getLearner(learnerId))) await rt.createLearner({ id: learnerId, themePack: THEME_PACK_ID });
  const instanceId = opts.instanceId ?? (await chooseFloor15Instance(rt, learnerId, FLOOR15.missionId)) ?? `floor15-${++instances}`;
  await rt.startMission({ learnerId, missionId: FLOOR15.missionId, instanceId });
  const log = createPlaytestLog();
  const audio: AudioCue[] = [];
  const director = createFloor15Director({
    runtime: rt,
    learnerId,
    instanceId,
    clock: time,
    schedule: (fn, ms) => time.schedule(fn, ms),
    motion: opts.motion ?? 'normal',
    onAudio: (cues) => audio.push(...cues),
    log,
    newInstanceId: () => `floor15-${++instances}`,
  });
  if (opts.autoHallCalls ?? true) {
    let answering: number | null = null;
    director.subscribe((v) => {
      if (v.stage !== 'call' || v.hallCall === null || answering === v.hallCall) return;
      const floor = v.hallCall;
      answering = floor;
      time.schedule(() => {
        answering = null;
        const now = director.getView();
        if (now.stage === 'call' && now.hallCall === floor) director.pressFloor(floor);
      }, 400);
    });
  }
  if (opts.autoNextJob ?? true) {
    let waiting = false;
    director.subscribe((v) => {
      if (v.stage !== 'success' || v.success !== 'review' || waiting) return;
      waiting = true;
      time.schedule(() => {
        waiting = false;
        director.nextJob();
      }, 300);
    });
  }
  await director.start();
  return { db, rt, director, time, log, audio, view: () => director.getView() };
}

/** The right value for the visible task, found through the runtime's pure check (tests only). */
export function solve(s: Session): number {
  const id = s.director.instanceId();
  const view = s.rt.currentView(id).view;
  const a = view.activity?.answer;
  if (!a || a.mode !== 'value') throw new Error('no value task');
  for (let v = a.min; v <= a.max; v++) {
    const c = s.rt.check(id, { mode: 'value', value: v });
    if (c.ok && c.evaluation.correct) return v;
  }
  throw new Error('unsolvable');
}

/**
 * The right option of a choice task (a reading job answered by touching a thing or picking a
 * card), found through the runtime's pure check, never from the prompt (tests only). Returns the
 * option's value: a landing object id, or a card's word.
 */
export function solveChoice(s: Session): string {
  const id = s.director.instanceId();
  const activity = s.rt.currentView(id).view.activity;
  if (!activity || activity.answer.mode !== 'choice') throw new Error('no choice task');
  for (const o of activity.options) {
    const c = s.rt.check(id, { mode: 'choice', optionId: o.id });
    if (c.ok && c.evaluation.correct) return String(o.value);
  }
  throw new Error('unsolvable');
}

/** A choice task waits now (a reading job's touch or cards). A reading ride is a value task, answered on the panel. */
export function isChoiceTask(s: Session): boolean {
  return s.rt.currentView(s.director.instanceId()).view.activity?.answer.mode === 'choice';
}

/**
 * Answer a reading job with the option `value` the way a child would: a touch job by touching that
 * thing on its landing (it must be one of the open landing's answer targets), a card job by picking
 * its card. `via: 'card'` picks the card for a touch job too (the screen's fallback when the landing
 * art is not shown). Does not wait.
 */
export function answerReading(s: Session, value: string, via: 'auto' | 'card' = 'auto') {
  const reading = s.view().reading;
  if (!reading) throw new Error('no reading job');
  if (reading.mode === 'ride') throw new Error('a reading ride is answered on the panel (answerWith)');
  if (reading.mode === 'touch' && via === 'auto') {
    const targets = s.view().answerTargets;
    if (!targets || targets.floor !== s.view().elevator.floor || !targets.objects.includes(value)) {
      throw new Error(`"${value}" is not an answer target here: ${JSON.stringify({ targets, floor: s.view().elevator.floor })}`);
    }
    s.director.touchObject(value);
  } else {
    s.director.chooseReading(value);
  }
}

export const settled = (s: Session) => () => {
  const v = s.view();
  const waiting = v.stage === 'task' || v.stage === 'cargo' || v.stage === 'finale' || v.stage === 'intro' || v.stage === 'freeRide';
  const doorsAtRest = v.elevator.phase === 'idleOpen' || (v.stage === 'finale' && v.elevator.phase === 'idleClosed');
  return !v.saving && waiting && doorsAtRest;
};

export async function waitSettled(s: Session) {
  const ok = await s.time.runUntil(settled(s));
  if (!ok) throw new Error(`Did not settle: ${JSON.stringify({ stage: s.view().stage, phase: s.view().elevator.phase, saving: s.view().saving })}`);
}

const taskCount = (s: Session) => s.log.entries().filter((e) => e.kind === 'task').length;

/**
 * Give `value` as the answer the way a child would: a floor on the panel, crates in the cargo bay,
 * a count on the trip meter (then GO), or (a string) a reading job's thing or card. Does not wait.
 */
export function answerWith(s: Session, value: number | string) {
  const task = s.view().task;
  if (typeof value === 'string') {
    answerReading(s, value);
  } else if (s.view().stage === 'cargo') {
    while (s.view().task!.cargo!.loaded < value) s.director.loadCrate();
    while (s.view().task!.cargo!.loaded > value) s.director.unloadCrate();
    s.director.pressDoorClose();
  } else if (task?.meter) {
    while (s.view().task!.meter!.value < value) s.director.meterStep(1);
    while (s.view().task!.meter!.value > value) s.director.meterStep(-1);
    s.director.meterGo();
  } else {
    s.director.pressFloor(value);
  }
}

/**
 * Answer the visible task correctly (panel, shaft, meter, cargo, or a reading job's touch or card)
 * and wait until the next task is settled.
 */
export async function answerCorrectly(s: Session) {
  const before = taskCount(s);
  answerWith(s, isChoiceTask(s) ? solveChoice(s) : solve(s));
  const ok = await s.time.runUntil(() => settled(s)() && taskCount(s) > before);
  if (!ok) throw new Error(`No next task after a correct answer: ${JSON.stringify({ stage: s.view().stage, phase: s.view().elevator.phase })}`);
}

/** Play correctly until the job of `stepId` waits, settled. False if it never comes. */
export async function reachStep(s: Session, stepId: string): Promise<boolean> {
  for (let guard = 0; guard < 20 && s.view().task?.stepId !== stepId; guard++) await answerCorrectly(s);
  return s.view().task?.stepId === stepId && (await s.time.runUntil(settled(s)));
}

export { tempDir };
