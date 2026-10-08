// DEVELOPER TOOLING ONLY. Visual review scenarios: each one brings the REAL game to a
// representative state through real runtime commands and real director actions on a test
// learner. No fake component gallery, no fake records. Used by the developer panel and by
// scripts/web-screenshots.js (?scenario=<id>).
import { LANDINGS, OPEN_MS, PUTT_MS, REACTION_MS, exploreSpots, explorableFloors, reactionMs } from '../content/landings';
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

/**
 * After a wrong answer has played out: the consequence on screen and, on a practice job (D149), the
 * correction waiting for LET'S COUNT; elsewhere the same job waiting again.
 */
const consequence = (s: Floor15Session) => () => {
  const v = view(s);
  return !v.saving && (v.task?.wrongTries ?? 0) >= 1 && ((v.rescueReady && v.elevator.phase === 'idleOpen') || settled(s)());
};

async function wrongFloorArrival(d: DevDriver, jump = 'practice'): Promise<Floor15Session> {
  const s = await at(d, jump);
  s.director.pressFloor(wrongFloor(s, d, s.director));
  await d.waitFor(consequence(s), 'wrong-floor arrival', 30_000);
  return s;
}

/** A miss, LET'S COUNT, the correction counted through, then the fresh job waiting (D149). */
async function correctedThenFresh(d: DevDriver, jump = 'practice'): Promise<Floor15Session> {
  const s = await wrongFloorArrival(d, jump);
  s.director.beginRescue();
  await d.waitFor(() => view(s).stage === 'rescue', 'correction', 15_000);
  await answerTestRun(d, s);
  await d.waitFor(() => view(s).stage === 'task' && settled(s)(), 'the fresh job', 60_000);
  return s;
}

async function withMisses(d: DevDriver, n: number, kind: Parameters<typeof simulateMisses>[4], jump = 'practice'): Promise<Floor15Session> {
  const id = await jumpTo(d.ctx, d.learnerId(), jump);
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

/** Count the test run cell by cell, as a learner would: every part, a stop at a time. `upTo`: at most this many taps. */
export async function countTestRun(d: DevDriver, s: Floor15Session, upTo?: number) {
  for (let taps = 0; taps < (upTo ?? Infinity); taps++) {
    const r = view(s).rescue;
    if (!r || r.phase !== 'counting') return;
    s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * (r.counted.length + 1));
    await d.sleep(150);
  }
}

/** Answer the test run's final question correctly (the stop, or the count). */
export async function answerTestRun(d: DevDriver, s: Floor15Session) {
  await countTestRun(d, s);
  const r = view(s).rescue;
  if (!r || r.phase !== 'ask') return;
  const stop = r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * r.steps;
  s.director.rescueTap(r.asks === 'cell' ? stop : r.kind === 'fill' ? r.countFrom + r.steps : r.steps);
  await d.waitFor(() => !view(s).saving, 'test run answered');
}

/** Set the trip meter to `value` (not GO). */
async function setMeter(d: DevDriver, s: Floor15Session, value: number) {
  for (let guard = 0; guard < 40 && (view(s).task?.meter?.value ?? value) !== value; guard++) {
    s.director.meterStep(view(s).task!.meter!.value < value ? 1 : -1);
    await d.sleep(30);
  }
}

/** Load exactly `n` crates in the cargo bay, then DOOR CLOSE. */
async function loadAndGo(s: Floor15Session, n: number) {
  for (let i = 0; i < n; i++) s.director.loadCrate();
  s.director.pressDoorClose();
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

/**
 * A reading job (M8) at a jump: the note open on the job, its answer window open. Folded (`fold`):
 * what answers it shows instead (the landing's things, the panel, or the cards).
 */
async function readingAt(d: DevDriver, jump: string, fold = false, misses = 0): Promise<Floor15Session> {
  const s = misses ? await withMisses(d, misses, 'any', jump) : await at(d, jump);
  await d.waitFor(() => view(s).stage === 'task' && view(s).reading?.accepting === true && view(s).reading?.open === true && settled(s)(), `reading note at ${jump}`, 30_000);
  if (fold) {
    s.director.closeNote();
    await d.waitFor(() => view(s).reading?.open === false, 'note folded');
    await d.sleep(300); // the landing's things or the cards take the note's place
  }
  return s;
}

/** A success settled and waiting on NEXT JOB. */
const waitReview = (d: DevDriver, s: Floor15Session) => d.waitFor(() => view(s).stage === 'success' && view(s).success === 'review', 'success waiting for NEXT JOB', 60_000);

const rescueMisses = (d: DevDriver) => thresholds(d.ctx.content).rescue ?? 5;

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
    label: 'Clue (first help, asked for)',
    run: async (d) => {
      const s = await at(d, 'practice');
      await help(d, s, 1);
    },
  },
  { id: 'shaft-map', label: 'Shaft map job', run: async (d) => void (await at(d, 'shaft')) },
  {
    id: 'help-offered',
    label: 'Help offered (the fresh job after a correction, two misses on it, nothing asked for yet)',
    run: async (d) => {
      const s = await correctedThenFresh(d);
      for (let i = 0; i < 2; i++) {
        s.director.pressFloor(wrongFloor(s, d, s.director));
        await d.waitFor(() => (view(s).task?.wrongTries ?? 0) === i + 1 && settled(s)(), 'a miss on the fresh job', 60_000);
      }
      await d.waitFor(() => view(s).help?.offered === true, 'help offered', 30_000);
    },
  },
  {
    id: 'visual-scaffold',
    label: 'Visual scaffold (shaft map as number line, asked for)',
    run: async (d) => {
      const s = await at(d, 'practice');
      await help(d, s, 2);
    },
  },
  {
    id: 'count-strategy',
    label: 'Counting strategy (third help, asked for)',
    run: async (d) => {
      const s = await at(d, 'practice');
      await help(d, s, 3);
    },
  },
  { id: 'stretch', label: 'Stretch: beacon job', run: async (d) => void (await at(d, 'stretch')) },
  { id: 'rescue-generic', label: 'Correction: counting the missed job through (after a restart, no consequence first)', run: async (d) => void (await withMisses(d, rescueMisses(d), 'untagged')) },
  {
    id: 'correction-ready',
    label: 'Correction waiting: the wrong floor, the move on the shaft map, Lifty\'s cue, LET\'S COUNT',
    run: async (d) => void (await wrongFloorArrival(d)),
  },
  {
    id: 'correction-board',
    label: 'Correction: LET\'S COUNT pressed, the board on the learner\'s own job',
    run: async (d) => {
      const s = await wrongFloorArrival(d);
      s.director.beginRescue();
      await d.waitFor(() => view(s).stage === 'rescue', 'correction', 15_000);
      await countTestRun(d, s, 2);
    },
  },
  {
    id: 'correction-fresh',
    label: 'After a correction: "New job." and the fresh job',
    run: async (d) => void (await correctedThenFresh(d)),
  },
  {
    id: 'rescue-misconception',
    label: 'Concept Rescue on the encounter route (five misses sharing a tag: misconception-specific)',
    run: async (d) => void (await withMisses(d, thresholds(d.ctx.content, 'encounter.clues-only').rescue ?? 5, { tag: 'quantity.countedStartingPosition' }, 'route')),
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
    id: 'rescue-not-next',
    label: 'Concept Rescue, a count that skips ahead (Lifty thinks it through)',
    run: async (d) => {
      const s = await withMisses(d, rescueMisses(d), 'untagged');
      await countTestRun(d, s, 1);
      // Tapping the test run's start is never the next floor in the count: Lifty's "not next" line.
      const r = view(s).rescue;
      if (r?.phase === 'counting') s.director.rescueTap(r.origin);
      await d.sleep(300);
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
  {
    id: 'underload',
    label: 'Cargo underfilled: the room left outlined on the load meter',
    run: async (d) => {
      const s = await at(d, 'cargo');
      const need = rightValue(d.ctx.runtime, s.director.instanceId()) ?? 2;
      await loadAndGo(s, Math.max(1, need - 2));
      await d.waitFor(() => view(s).task?.cargo?.status === 'underload' && !view(s).saving, 'underload');
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
        await waitReview(d, s);
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
      await waitReview(d, s);
    },
  },
  // Child-paced success and mission objects (D122, D123).
  {
    id: 'success-arrival',
    label: 'Correct arrival: the repair kit, before Lifty speaks',
    run: async (d) => {
      const s = await at(d, 'practice');
      s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await d.waitFor(() => view(s).success === 'arrival' && view(s).elevator.phase === 'idleOpen', 'arrived, doors open', 60_000);
    },
  },
  {
    id: 'replay-after-rescue',
    label: 'Success replay after a Concept Rescue (waits for NEXT JOB)',
    run: async (d) => {
      const s = await withMisses(d, rescueMisses(d), 'untagged');
      await answerTestRun(d, s);
      await d.waitFor(() => view(s).stage === 'task' && settled(s)(), 'back on the job', 30_000);
      s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await waitReview(d, s);
    },
  },
  {
    id: 'collect-kit',
    label: 'Repair kit loaded into the lift',
    run: async (d) => {
      const s = await at(d, 'practice');
      s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await waitReview(d, s);
      s.director.collect('repair-kit');
      await d.sleep(700);
    },
  },
  ...([
    ['objective-toolbox', 'Toolbox at its floor (second service call)', 'practice', 1],
    ['objective-parts', 'Spare parts at their floor', 'shaft', 0],
    ['objective-crew', 'The crew at their floor (beacon job)', 'stretch', 0],
    ['objective-dock', 'The loading dock at its floor', 'route', 0],
  ] as const).map(
    ([id, label, jump, skip]): Scenario => ({
      id,
      label,
      run: async (d) => {
        const s = await at(d, jump);
        for (let i = 0; i < skip; i++) {
          s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
          await waitReview(d, s);
          s.director.nextJob();
          await d.waitFor(() => view(s).stage === 'call' && settled(s)(), 'hall call', 30_000);
          s.director.pressFloor(view(s).hallCall!);
          await d.waitFor(() => view(s).stage === 'task' && settled(s)(), 'next job', 60_000);
        }
        s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
        await waitReview(d, s);
      },
    }),
  ),
  {
    id: 'beacon',
    label: 'The beacon on its floor (rode to the beacon instead of the crew)',
    run: async (d) => {
      const s = await at(d, 'stretch');
      s.director.pressFloor(view(s).beacon ?? 1);
      await d.waitFor(consequence(s), 'at the beacon', 60_000);
    },
  },
  {
    id: 'wrong-stretch',
    label: 'Wrong floor on the beacon job: no crew here',
    run: async (d) => {
      const s = await at(d, 'stretch');
      const beacon = view(s).beacon;
      const wrong = wrongValues(d.ctx.runtime, s.director.instanceId(), 'any').find((f) => f !== beacon) ?? 1;
      s.director.pressFloor(wrong);
      await d.waitFor(consequence(s), 'wrong arrival', 60_000);
    },
  },
  // The wider arithmetic (D148): two orders, a two-part trip, where did it start, the trip meter, the express.
  { id: 'orders', label: 'Two orders (cargo bay, addition)', run: async (d) => void (await at(d, 'orders')) },
  {
    id: 'orders-mismatch',
    label: 'Two orders: only one order loaded',
    run: async (d) => {
      const s = await at(d, 'orders');
      await loadAndGo(s, Math.max(...view(s).task!.cargo!.orders!));
      await d.waitFor(() => view(s).task?.cargo?.status === 'mismatch' && !view(s).saving && view(s).rescueReady, 'mismatch');
    },
  },
  {
    id: 'replay-orders',
    label: 'Success replay (two orders)',
    run: async (d) => {
      const s = await at(d, 'orders');
      await loadAndGo(s, rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await waitReview(d, s);
    },
  },
  { id: 'two-part', label: 'Two-part trip', run: async (d) => void (await at(d, 'two-part')) },
  {
    id: 'two-part-leg',
    label: 'Two-part trip: the first part ridden, the second to go',
    run: async (d) => {
      const s = await at(d, 'two-part');
      const v = view(s).task!.job!.vars;
      const middle = Number(v.start) + (v.dir === 'up' ? 1 : -1) * Number(v.change);
      s.director.pressFloor(middle);
      await d.waitFor(() => view(s).stage === 'task' && view(s).elevator.floor === middle && view(s).elevator.phase === 'idleOpen' && !view(s).saving, 'first leg done', 60_000);
    },
  },
  {
    id: 'two-part-wrong',
    label: 'Two-part trip: both parts ridden the same way',
    run: async (d) => {
      const s = await at(d, 'two-part');
      const v = view(s).task!.job!.vars;
      const sign = v.dir === 'up' ? 1 : -1;
      const sameWay = Number(v.start) + sign * (Number(v.change) + Number(v.changeTwo));
      s.director.pressFloor(sameWay >= 1 && sameWay <= 20 ? sameWay : Number(v.start) - sign * Number(v.changeTwo));
      await d.waitFor(consequence(s), 'wrong arrival', 60_000);
    },
  },
  { id: 'start-floor', label: 'Where did the crew get on?', run: async (d) => void (await at(d, 'start-floor')) },
  {
    id: 'replay-start-floor',
    label: 'Success replay (undo the ride)',
    run: async (d) => {
      const s = await at(d, 'start-floor');
      s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await waitReview(d, s);
    },
  },
  { id: 'meter', label: 'Trip meter job', run: async (d) => void (await at(d, 'meter')) },
  {
    id: 'meter-set',
    label: 'Trip meter: a count set, before GO',
    run: async (d) => {
      const s = await at(d, 'meter');
      await setMeter(d, s, 4);
    },
  },
  {
    id: 'meter-wrong',
    label: 'Trip meter: one floor too many (where the count went, the correction waiting)',
    run: async (d) => {
      const s = await at(d, 'meter');
      const from = view(s).task!.meter!.from;
      await setMeter(d, s, (rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1) + 1);
      s.director.meterGo();
      await d.waitFor(() => view(s).rescueReady && view(s).elevator.phase === 'idleOpen' && view(s).elevator.floor !== from, 'wrong arrival', 60_000);
    },
  },
  {
    id: 'replay-meter',
    label: 'Success replay (trip meter)',
    run: async (d) => {
      const s = await at(d, 'meter');
      await setMeter(d, s, rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      s.director.meterGo();
      await waitReview(d, s);
    },
  },
  { id: 'express', label: 'Express stops (equal jumps)', run: async (d) => void (await at(d, 'express')) },
  {
    id: 'express-count',
    label: 'Express: the counting clue jumps a stop at a time',
    run: async (d) => {
      const s = await at(d, 'express');
      await help(d, s, 3);
    },
  },
  {
    id: 'replay-express',
    label: 'Success replay (skip counting)',
    run: async (d) => {
      const s = await at(d, 'express');
      s.director.pressFloor(rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1);
      await waitReview(d, s);
    },
  },
  ...(
    [
      ['rescue-two-part', 'two-part', 'Test run: a two-part trip, second part'],
      ['rescue-meter', 'meter', 'Test run: how many floors'],
      ['rescue-orders', 'orders', 'Test run: two orders, counting on'],
      ['rescue-express', 'express', 'Test run: express stops'],
    ] as const
  ).map(
    ([id, jump, label]): Scenario => ({
      id,
      label,
      run: async (d) => {
        const s = await withMisses(d, rescueMisses(d), 'untagged', jump);
        await d.waitFor(() => view(s).stage === 'rescue', 'test run');
        // Count far enough to show the board's idea: into the second part, or most of the way.
        const r = view(s).rescue!;
        await countTestRun(d, s, r.parts.length > 1 ? r.parts[0]!.steps + 1 : Math.max(1, r.steps - 1));
      },
    }),
  ),
  // M8 math jobs (pool members, reached by their jumps): the job, its success replay, and its correction board.
  ...(
    [
      ['lamps', 'lamps', 'Lamp check: a gap in a pattern of 2s'],
      ['fives', 'fives', 'Lamp check: a pattern of 5s'],
      ['ten-and-ones', 'ten-and-ones', 'Ten-floor express, then some ones'],
      ['teen', 'teen', 'Ten-floor express from the bottom'],
      ['compare', 'compare', 'Two calls: which comes second'],
      ['order', 'order', 'Three calls in order'],
      ['same-way', 'same-way', 'Two-part trip, the same way twice'],
      ['doubles', 'doubles', 'Two equal orders (doubles)'],
    ] as const
  ).flatMap(([id, jump, label]): Scenario[] => [
    { id: `m8-${id}`, label, run: async (d) => void (await at(d, jump)) },
    {
      id: `replay-m8-${id}`,
      label: `Success replay: ${label}`,
      run: async (d) => {
        const s = await at(d, jump);
        const right = rightValue(d.ctx.runtime, s.director.instanceId()) ?? 1;
        if (view(s).stage === 'cargo') {
          for (let i = 0; i < right; i++) s.director.loadCrate();
          s.director.pressDoorClose();
        } else s.director.pressFloor(right);
        await waitReview(d, s);
      },
    },
    {
      id: `rescue-m8-${id}`,
      label: `Correction: ${label}`,
      run: async (d) => {
        const s = await withMisses(d, rescueMisses(d), 'any', jump);
        await d.waitFor(() => view(s).stage === 'rescue' || view(s).rescueReady, 'correction');
        if (view(s).rescueReady) s.director.beginRescue();
        await d.waitFor(() => view(s).stage === 'rescue', 'correction board');
        const r = view(s).rescue!;
        await countTestRun(d, s, r.parts.length > 1 ? r.parts[0]!.steps + 1 : Math.max(1, r.steps - 1));
      },
    },
  ]),
  // Reading jobs (M8): each way of answering one, the note open in the answer window, then folded on
  // what answers it (the landing's things, the panel, the cards); a touch job whose landing cannot
  // offer every thing (answered with cards); CLUE and SHOW ME. Nothing is answered here.
  ...(
    [
      ['read-touch', 'Reading: the note of a touch job'],
      ['read-ride', 'Reading: the note of a ride job'],
      ['read-cards', 'Reading: the note of a card job'],
    ] as const
  ).flatMap(([jump, label]): Scenario[] => [
    { id: jump, label, run: async (d) => void (await readingAt(d, jump)) },
    { id: `${jump}-folded`, label: `${label}, folded: what answers it`, run: async (d) => void (await readingAt(d, jump, true)) },
  ]),
  {
    id: 'read-touch-cards',
    label: 'Reading: a touch job in the lobby, where not every thing is on the art: the same options as cards',
    run: async (d) => void (await readingAt(d, 'read-touch-cards', true)),
  },
  {
    id: 'read-clue',
    label: 'Reading: CLUE lights the key sentence in the note',
    run: async (d) => {
      const s = await readingAt(d, 'read-touch');
      await help(d, s, 1);
      await d.waitFor(() => view(s).reading?.highlight != null && view(s).reading?.open === true, 'clue shown');
    },
  },
  {
    id: 'read-show-me',
    label: 'Reading: SHOW ME after a miss and CLUE, the thing glows on the landing (note folded)',
    run: async (d) => {
      const s = await readingAt(d, 'read-touch', false, 1);
      await help(d, s, 2);
      await d.waitFor(() => view(s).reading?.options.some((o) => o.shown) === true, 'answer shown');
      s.director.closeNote();
      await d.waitFor(() => view(s).reading?.open === false, 'note folded');
      await d.sleep(300);
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
      // Landing interactions (M8): every spot mid-reaction, normal and under Reduced Motion.
      ...exploreSpots(LANDINGS, floor).flatMap((x): Scenario[] => [
        {
          id: `touch-${floor}-${x.id}`,
          label: `Floor ${floor}: touch the ${x.object} (${x.reaction})`,
          run: async (d) => {
            const s = await arrive(d);
            s.director.touchObject(x.target);
            await d.sleep(Math.min(reactionMs(x.reaction, 'normal') * 0.4, 700));
          },
        },
        {
          id: `touch-${floor}-${x.id}-reduced`,
          label: `Floor ${floor}: touch the ${x.object}, Reduced Motion`,
          run: async (d) => {
            const s = await arrive(d);
            s.setMotion('reduced');
            await d.waitFor(() => view(s).motion === 'reduced', 'reduced motion');
            s.director.touchObject(x.target);
            await d.sleep(Math.min(reactionMs(x.reaction, 'reduced') * 0.5, 400));
          },
        },
      ]),
    ];
  }),
  // Rooftop golf: the putt rolling, the ball in the cup, and the ball back at rest by itself.
  ...([
    ['golf-rolling', 'Rooftop golf: the putt rolling', PUTT_MS.normal.roll * 0.5],
    ['golf-sunk', 'Rooftop golf: in the cup, the cup answers', PUTT_MS.normal.roll + PUTT_MS.normal.drop + 300],
    ['golf-reset', 'Rooftop golf: the ball back at rest (touch it again)', PUTT_MS.normal.roll + PUTT_MS.normal.drop + PUTT_MS.normal.rest + PUTT_MS.normal.back + 300],
  ] as const).map(
    ([id, label, after]): Scenario => ({
      id,
      label,
      run: async (d) => {
        const s = await freeRide(d);
        await rideTo(d, s, 20);
        s.director.touchObject('ball');
        await d.sleep(after);
      },
    }),
  ),
  {
    id: 'golf-reduced',
    label: 'Rooftop golf, Reduced Motion: straight to the cup, the ring held still',
    run: async (d) => {
      const s = await freeRide(d);
      s.setMotion('reduced');
      await rideTo(d, s, 20);
      s.director.touchObject('ball');
      await d.sleep(PUTT_MS.reduced.roll + 400);
    },
  },
  // The workshop toolbox: open, then shut again.
  ...([
    ['toolbox-open', 'Workshop: the toolbox open', 1],
    ['toolbox-shut', 'Workshop: the toolbox shut again', 2],
  ] as const).map(
    ([id, label, touches]): Scenario => ({
      id,
      label,
      run: async (d) => {
        const s = await freeRide(d);
        await rideTo(d, s, 2);
        for (let i = 0; i < touches; i++) {
          s.director.touchObject('toolbox');
          await d.sleep(OPEN_MS.normal + 150);
        }
      },
    }),
  ),
  {
    id: 'archive-card',
    label: 'Archive: the tower book open as a reading card',
    run: async (d) => {
      const s = await freeRide(d);
      await rideTo(d, s, 17);
      s.director.touchObject('book');
      await d.waitFor(() => view(s).card !== null, 'reading card');
    },
  },
  {
    id: 'touch-between-jobs',
    label: 'Between jobs: the lobby gear turns during a hall call (no discovery, Lifty stays on the call)',
    run: async (d) => {
      await d.freshLearner();
      const s = await at(d, 'start');
      s.director.pressDoorOpen();
      await d.waitFor(() => view(s).stage === 'call' && settled(s)(), 'hall call', 30_000);
      s.director.touchObject('gear');
      await d.sleep(REACTION_MS.normal * 0.4);
    },
  },
  // The Engineer Log (the clipboard): nothing found, some found, everything found.
  ...([
    ['log-empty', 'Engineer Log: nothing inspected', []],
    ['log-partial', 'Engineer Log: two places inspected', [6, 17]],
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
