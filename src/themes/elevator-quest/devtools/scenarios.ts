// DEVELOPER TOOLING ONLY. Visual review scenarios: each one brings the REAL game to a
// representative state through real runtime commands and real director actions on a test
// learner. No fake component gallery, no fake records. Used by the developer panel and by
// scripts/web-screenshots.js (?scenario=<id>).
import { LANDINGS, REACTION_MS, exploreSpots, explorableFloors } from '../content/landings';
import type { Director, DirectorView } from '../director/director';
import type { Floor15Session } from '../sessionCore';
import { jumpTo, rightValue, seedDiscoveries, simulateMisses, thresholds, wrongValues, type DevContext } from './floor15Tools';

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
  return !v.saving && atRest(v) && ['intro', 'call', 'task', 'cargo', 'rescue', 'finale', 'freeRide'].includes(v.stage);
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

/**
 * Free ride for a fresh test learner: the real finale, the real restoration, then the lift is free.
 * `discoveries` seeds world memory (not learning records) before the game is mounted again.
 */
async function freeRide(d: DevDriver, discoveries: readonly string[] = []): Promise<Floor15Session> {
  await d.freshLearner();
  let s = await at(d, 'finale');
  s.director.pressFloor(15);
  await d.waitFor(() => view(s).stage === 'freeRide' && settled(s)(), 'free ride after the restoration', 60_000);
  if (discoveries.length === 0) return s;
  const id = s.director.instanceId();
  await d.unmount();
  await seedDiscoveries(d.ctx, d.learnerId(), discoveries);
  s = await d.mount(id);
  await d.waitFor(() => view(s).stage === 'freeRide' && settled(s)(), 'free ride again', 30_000);
  return s;
}

async function rideTo(d: DevDriver, s: Floor15Session, floor: number) {
  if (view(s).elevator.floor !== floor) s.director.pressFloor(floor);
  await d.waitFor(() => view(s).elevator.floor === floor && view(s).elevator.phase === 'idleOpen', `free ride to ${floor}`, 60_000);
}

const discoveryKeys = (floors: readonly number[]) => floors.flatMap((f) => exploreSpots(LANDINGS, f).map((x) => x.discovery));

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
    id: 'help-offered',
    label: 'Help offered (two misses, nothing asked for yet)',
    run: async (d) => {
      const s = await withMisses(d, 2, 'untagged');
      await d.waitFor(() => view(s).help?.offered === true, 'help offered', 30_000);
    },
  },
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
  // In-world completion, before / during / after (fresh learner each time; no card at any point).
  {
    id: 'floor-15-dormant',
    label: 'Completion, before: arrived at the dormant Floor 15',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'finale');
      s.director.pressFloor(15);
      await d.waitFor(() => view(s).stage === 'complete' && view(s).elevator.phase === 'idleOpen' && !view(s).floor15Restored, 'arrived, not yet restored', 60_000);
    },
  },
  {
    id: 'completion',
    label: 'Completion, during: Floor 15 restored, panel sweep (fresh learner)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'finale');
      s.director.pressFloor(15);
      await d.waitFor(() => view(s).floor15Restored && view(s).stage === 'complete', 'restored', 60_000);
      await d.sleep(500);
    },
  },
  {
    id: 'completion-after',
    label: 'Completion, after: rank, clipboard, free ride (fresh learner)',
    run: async (d) => void (await freeRide(d)),
  },
  // Success replay: answered correctly through the real director, photographed once every step shows.
  ...(['practice', 'stretch'] as const).map(
    (jump): Scenario => ({
      id: jump === 'practice' ? 'replay-routine' : 'replay-stretch',
      label: `Success replay (${jump === 'practice' ? 'routine' : 'stretch'})`,
      run: async (d) => {
        const s = await at(d, jump);
        s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
        await d.waitFor(() => view(s).stage === 'success' && view(s).replay !== null && view(s).replay!.revealed === view(s).replay!.steps.length, 'replay shown', 60_000);
      },
    }),
  ),
  {
    id: 'replay-cargo',
    label: 'Success replay (cargo)',
    run: async (d) => {
      const s = await at(d, 'cargo');
      const need = rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1;
      for (let i = 0; i < need; i++) s.director.loadCrate();
      s.director.pressDoorClose();
      await d.waitFor(() => view(s).stage === 'success' && view(s).replay !== null, 'cargo replay', 30_000);
    },
  },
  // Hall calls: the next job calls the lift, the learner presses that floor.
  {
    id: 'hall-call',
    label: 'Hall call offered (first job calls the lift)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'start');
      s.director.pressDoorOpen();
      await d.waitFor(() => view(s).stage === 'call' && settled(s)(), 'hall call', 30_000);
    },
  },
  {
    id: 'hall-call-ride',
    label: 'Hall call taken (riding to the calling floor)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'start');
      s.director.pressDoorOpen();
      await d.waitFor(() => view(s).stage === 'call' && settled(s)(), 'hall call', 30_000);
      s.director.pressFloor(view(s).hallCall!);
      await d.waitFor(() => view(s).elevator.phase === 'traveling', 'riding to the call', 30_000);
      await d.sleep(300);
    },
  },
  // Exploration: each inspectable landing before a touch, mid-reaction, and after the discovery.
  ...explorableFloors(LANDINGS).flatMap((floor): Scenario[] => {
    const spot = exploreSpots(LANDINGS, floor)[0]!;
    const arrive = async (d: DevDriver) => {
      const s = await freeRide(d);
      await rideTo(d, s, floor);
      await d.sleep(1200); // the floor first, then Lifty names the thing to touch
      return s;
    };
    return [
      { id: `explore-${floor}`, label: `Explore floor ${floor}: before`, run: async (d) => void (await arrive(d)) },
      {
        id: `explore-${floor}-reaction`,
        label: `Explore floor ${floor}: reaction`,
        run: async (d) => {
          const s = await arrive(d);
          s.director.inspect(spot.id);
          await d.sleep(REACTION_MS.normal * 0.4);
        },
      },
      {
        id: `explore-${floor}-after`,
        label: `Explore floor ${floor}: inspected`,
        run: async (d) => {
          const s = await arrive(d);
          s.director.inspect(spot.id);
          await d.sleep(REACTION_MS.normal + 300);
        },
      },
    ];
  }),
  // The Engineer Log (the clipboard): nothing found, some found, everything found.
  ...([
    ['log-empty', 'Engineer Log: nothing inspected', []],
    ['log-partial', 'Engineer Log: two places inspected', [7, 17]],
    ['log-complete', 'Engineer Log: every place inspected', explorableFloors(LANDINGS)],
  ] as const).map(
    ([id, label, floors]): Scenario => ({
      id,
      label,
      run: async (d) => {
        const s = await freeRide(d, discoveryKeys(floors));
        s.director.openLog();
        await d.waitFor(() => view(s).logOpen, 'log open');
      },
    }),
  ),
  // Floor tour: free ride after the restoration (no answers, nothing recorded) to look at each landing.
  ...Array.from({ length: 20 }, (_, i): Scenario => ({
    id: `floor-${i + 1}`,
    label: `Landing: floor ${i + 1}`,
    run: async (d) => {
      const s = await freeRide(d);
      await rideTo(d, s, i + 1);
    },
  })),
];
