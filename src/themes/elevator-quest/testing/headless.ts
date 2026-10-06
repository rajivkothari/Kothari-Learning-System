/// <reference types="node" />
// Headless Floor 15: the real director, runtime, and SQLite (node:sqlite), on virtual time.
// Test-only. No rendering, no audio device.
import type { SqlDatabase } from '../../../persistence/driver';
import { openNodeDatabase, type FaultPlan } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../../runtime/gameRuntime';
import { CORE_CONTENT, tempDir } from '../../../runtime/testing/harness';
import type { AudioCue } from '../audio/cues';
import { FLOOR15, UNLOCK_RULES } from '../content/floor15';
import { createFloor15Director, type Director, type DirectorView, type Motion } from '../director/director';
import { createPlaytestLog, type PlaytestLog } from '../director/playtestLog';
import { chooseFloor15Instance } from '../sessionCore';

export const LEARNER = 'learner-a';
export const CONTENT = { ...CORE_CONTENT, unlocks: UNLOCK_RULES };

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

export async function openSession(file: string, time: VirtualTime, opts: { instanceId?: string; motion?: Motion; faults?: FaultPlan; learnerId?: string } = {}): Promise<Session> {
  const db = openNodeDatabase(file, opts.faults);
  const rt = await openGameRuntime(db, CONTENT, time);
  const learnerId = opts.learnerId ?? LEARNER;
  if (!(await rt.getLearner(learnerId))) await rt.createLearner({ id: learnerId, themePack: 'elevator-quest' });
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

export const settled = (s: Session) => () => {
  const v = s.view();
  const waiting = v.stage === 'task' || v.stage === 'cargo' || v.stage === 'finale' || v.stage === 'intro' || v.stage === 'freeRide' || (v.stage === 'complete' && v.overlay !== null);
  const doorsAtRest = v.elevator.phase === 'idleOpen' || (v.stage === 'finale' && v.elevator.phase === 'idleClosed');
  return !v.saving && waiting && doorsAtRest;
};

export async function waitSettled(s: Session) {
  const ok = await s.time.runUntil(settled(s));
  if (!ok) throw new Error(`Did not settle: ${JSON.stringify({ stage: s.view().stage, phase: s.view().elevator.phase, saving: s.view().saving })}`);
}

const taskCount = (s: Session) => s.log.entries().filter((e) => e.kind === 'task').length;

/** Answer the visible task correctly (panel, shaft, or cargo) and wait until the next task is settled. */
export async function answerCorrectly(s: Session) {
  const before = taskCount(s);
  if (s.view().stage === 'cargo') {
    const need = solve(s);
    while (s.view().task!.cargo!.loaded < need) s.director.loadCrate();
    s.director.pressDoorClose();
  } else {
    s.director.pressFloor(solve(s));
  }
  const ok = await s.time.runUntil(() => settled(s)() && taskCount(s) > before);
  if (!ok) throw new Error(`No next task after a correct answer: ${JSON.stringify({ stage: s.view().stage, phase: s.view().elevator.phase })}`);
}

export { tempDir };
