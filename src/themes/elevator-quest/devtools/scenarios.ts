// DEVELOPER TOOLING ONLY. Visual review scenarios: each one brings the REAL game to a
// representative state through real runtime commands and real director actions on a test
// learner. No fake component gallery, no fake records. Used by the developer panel and by
// scripts/web-screenshots.js (?scenario=<id>).
import type { Director, DirectorView } from '../director/director';
import type { Floor15Session } from '../sessionCore';
import { jumpTo, simulateMisses, thresholds, wrongValues, type DevContext } from './floor15Tools';

/** What a scenario may do. Implemented by the developer shell. */
export interface DevDriver {
  ctx: DevContext;
  learnerId(): string;
  /** Switch to a brand-new empty generation of the "fresh-learner" profile. */
  freshLearner(): Promise<string>;
  /** Remount the game on an instance (undefined = the learner's latest), resolving with the new session. */
  mount(instanceId?: string): Promise<Floor15Session>;
  /** Unmount the game so runtime-level actions cannot race a live director. */
  unmount(): Promise<void>;
  waitFor(pred: () => boolean, label: string, timeoutMs?: number): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface Scenario {
  id: string;
  label: string;
  run(d: DevDriver): Promise<void>;
}

const view = (s: Floor15Session): DirectorView => s.director.getView();
const atRest = (v: DirectorView) => v.elevator.phase === 'idleOpen' || v.elevator.phase === 'idleClosed';
export const settled = (s: Floor15Session) => () => {
  const v = view(s);
  return !v.saving && atRest(v) && ['intro', 'task', 'cargo', 'rescue', 'finale', 'freeRide'].includes(v.stage);
};

async function at(d: DevDriver, jumpId: string): Promise<Floor15Session> {
  const id = await jumpTo(d.ctx, d.learnerId(), jumpId);
  const s = await d.mount(id);
  await d.waitFor(settled(s), `settled at ${jumpId}`);
  return s;
}

/** A wrong floor for the visible job, without a misconception tag when one exists. */
function wrongFloor(s: Floor15Session, d: DevDriver, director: Director): number {
  const id = director.instanceId();
  const untagged = wrongValues(d.ctx.runtime, id, 'untagged');
  return untagged[0] ?? wrongValues(d.ctx.runtime, id, 'any')[0] ?? 1;
}

async function wrongFloorArrival(d: DevDriver): Promise<Floor15Session> {
  const s = await at(d, 'practice');
  s.director.pressFloor(wrongFloor(s, d, s.director));
  await d.waitFor(() => view(s).task?.wrongTries === 1 && settled(s)(), 'wrong-floor arrival', 30_000);
  return s;
}

async function withMisses(d: DevDriver, n: number, kind: Parameters<typeof simulateMisses>[4]): Promise<Floor15Session> {
  const id = await jumpTo(d.ctx, d.learnerId(), 'practice');
  await simulateMisses(d.ctx, d.learnerId(), id, n, kind);
  const s = await d.mount(id);
  await d.waitFor(settled(s), 'settled after misses', 30_000);
  return s;
}

async function help(d: DevDriver, s: Floor15Session, times: number) {
  for (let i = 0; i < times; i++) {
    s.director.requestHelp();
    await d.waitFor(() => !view(s).saving, 'help shown');
  }
}

/** Count the test run cell by cell, as a learner would. */
export async function countTestRun(d: DevDriver, s: Floor15Session, upTo?: number) {
  const r = view(s).rescue;
  if (!r) return;
  const sign = r.direction === 'down' ? -1 : 1;
  const steps = Math.min(r.steps, upTo ?? r.steps);
  for (let k = r.counted.length + 1; k <= steps; k++) {
    s.director.rescueTap(r.origin + sign * k);
    await d.sleep(150);
  }
}

/** Answer the test run's final question correctly (the stop, or the count that fits). */
export async function answerTestRun(d: DevDriver, s: Floor15Session) {
  await countTestRun(d, s);
  const r = view(s).rescue;
  if (!r || r.phase !== 'ask') return;
  s.director.rescueTap(r.kind === 'fill' ? r.steps : r.origin + (r.direction === 'down' ? -1 : 1) * r.steps);
  await d.waitFor(() => !view(s).saving, 'test run answered');
}

const rescueMisses = (d: DevDriver) => thresholds(d.ctx.content).rescue ?? 5;
const visualMisses = (d: DevDriver) => thresholds(d.ctx.content).visual ?? 3;

export const SCENARIOS: readonly Scenario[] = [
  { id: 'start', label: 'Mission start (power off)', run: async (d) => void (await at(d, 'start')) },
  { id: 'idle', label: 'Elevator idle at a job', run: async (d) => void (await at(d, 'practice')) },
  {
    id: 'selected',
    label: 'Button selected (doors closing)',
    run: async (d) => {
      const s = await at(d, 'practice');
      s.director.pressFloor(wrongFloor(s, d, s.director));
      await d.sleep(350);
    },
  },
  {
    id: 'traveling',
    label: 'Traveling',
    run: async (d) => {
      const s = await at(d, 'practice');
      s.director.pressFloor(wrongFloor(s, d, s.director));
      await d.waitFor(() => view(s).elevator.phase === 'traveling', 'traveling', 15_000);
      await d.sleep(400);
    },
  },
  { id: 'wrong-floor', label: 'Wrong-floor arrival + Lifty feedback', run: async (d) => void (await wrongFloorArrival(d)) },
  {
    id: 'clue',
    label: 'Clue (first help)',
    run: async (d) => {
      const s = await wrongFloorArrival(d);
      await help(d, s, 1);
    },
  },
  { id: 'shaft-map', label: 'Shaft map job', run: async (d) => void (await at(d, 'shaft')) },
  {
    id: 'visual-scaffold',
    label: 'Visual scaffold (shaft map as number line)',
    run: async (d) => {
      const s = await withMisses(d, visualMisses(d), 'untagged');
      await help(d, s, 2);
    },
  },
  {
    id: 'count-strategy',
    label: 'Counting strategy (third help)',
    run: async (d) => {
      const s = await withMisses(d, visualMisses(d), 'untagged');
      await help(d, s, 3);
    },
  },
  { id: 'stretch', label: 'Stretch: beacon job', run: async (d) => void (await at(d, 'stretch')) },
  { id: 'rescue-generic', label: 'Concept Rescue, general explanation', run: async (d) => void (await withMisses(d, rescueMisses(d), 'untagged')) },
  {
    id: 'rescue-misconception',
    label: 'Concept Rescue, misconception-specific',
    run: async (d) => void (await withMisses(d, rescueMisses(d), { tag: 'quantity.countedStartingPosition' })),
  },
  {
    id: 'rescue-counting',
    label: 'Concept Rescue, counting the test run',
    run: async (d) => {
      const s = await withMisses(d, rescueMisses(d), 'untagged');
      await countTestRun(d, s, 1);
    },
  },
  {
    id: 'rescue-ask',
    label: 'Concept Rescue, "where does it stop?"',
    run: async (d) => {
      const s = await withMisses(d, rescueMisses(d), 'untagged');
      await countTestRun(d, s);
    },
  },
  {
    id: 'rescue-return',
    label: 'Concept Rescue, back to the real job',
    run: async (d) => {
      const s = await withMisses(d, rescueMisses(d), 'untagged');
      await answerTestRun(d, s);
      await d.waitFor(() => view(s).stage === 'task' && settled(s)(), 'back on the job', 30_000);
    },
  },
  { id: 'cargo', label: 'Cargo encounter', run: async (d) => void (await at(d, 'cargo')) },
  {
    id: 'overload',
    label: 'Cargo overload',
    run: async (d) => {
      const s = await at(d, 'cargo');
      const c = view(s).task!.cargo!;
      for (let i = 0; i < c.waiting; i++) s.director.loadCrate();
      s.director.pressDoorClose();
      await d.waitFor(() => view(s).task?.cargo?.status === 'overload' && !view(s).saving, 'overload');
    },
  },
  { id: 'finale', label: 'Finale ride', run: async (d) => void (await at(d, 'finale')) },
  {
    id: 'completion',
    label: 'Mission complete + Engineer Rank unlock (fresh learner)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'finale');
      s.director.pressFloor(15);
      await d.waitFor(() => view(s).overlay !== null && view(s).power === 'on', 'completion', 60_000);
    },
  },
  {
    id: 'floor-15-restored',
    label: 'Floor 15 landing, restored (after completion)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'finale');
      s.director.pressFloor(15);
      await d.waitFor(() => view(s).overlay !== null && view(s).floor15Restored, 'completion', 60_000);
      s.director.freeRide();
      await d.waitFor(settled(s), 'free ride at 15');
    },
  },
  // Floor tour: a free ride (no answers, nothing recorded) to look at each landing. Floor 15 is
  // dormant here because this test learner has not completed the mission.
  ...Array.from({ length: 20 }, (_, i): Scenario => ({
    id: `floor-${i + 1}`,
    label: `Landing: floor ${i + 1}`,
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'practice');
      s.director.freeRide();
      s.director.pressFloor(i + 1);
      await d.waitFor(() => settled(s)() && view(s).elevator.floor === i + 1, `free ride to ${i + 1}`, 60_000);
    },
  })),
];
