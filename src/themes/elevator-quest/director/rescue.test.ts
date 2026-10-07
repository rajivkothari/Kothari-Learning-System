// Floor 15 help ladder, Concept Rescue, and auto-ride pacing, headless on virtual time.
// These tests are about the ladder's own mechanics: the clues on misses 2 to 4 and a test run on a
// parallel example at miss 5. Since D149 the practice jobs correct the first miss instead, and the
// ladder runs on the fresh job after it (and in the encounter), so they pin the generic policy
// (LADDER_CONTENT). The correction itself is covered in correction.test.ts.
import { count } from '../../../runtime/testing/harness';
import { NORMAL_TIMING } from '../sim/elevator';
import { LINES, PACING } from '../content/floor15';
import { autoRideTiming } from './director';
import { LADDER_CONTENT, openSession as openShipped, settled, solve, tempDir, virtualTime, waitSettled, type Session, type VirtualTime } from '../testing/headless';

const openSession = (file: string, time: VirtualTime, opts: Parameters<typeof openShipped>[2] = {}) => openShipped(file, time, { content: LADDER_CONTENT, ...opts });

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

/** A wrong floor that is not the answer (riding there the first time, answering in place after). */
const wrongFloor = (s: Session) => {
  const right = solve(s);
  return right >= 19 ? right - 2 : right + 2;
};

const answered = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;

async function missOnce(s: Session) {
  const before = answered(s);
  s.director.pressFloor(wrongFloor(s));
  const done = () => answered(s) > before && !s.view().saving && (s.view().rescueReady || s.view().stage === 'rescue' || (s.view().stage === 'task' && settled(s)()));
  expect(await s.time.runUntil(done)).toBe(true);
  // The test run waits for the learner (LET'S COUNT, D149): press it, as a learner would.
  if (s.view().rescueReady) {
    s.director.beginRescue();
    expect(await s.time.runUntil(() => s.view().stage === 'rescue')).toBe(true);
  }
}

const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");

describe('Floor 15 help ladder and Concept Rescue', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('help is never a dead end: after the first clue the next step can be asked for', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    await missOnce(s);
    expect(s.view().help).toMatchObject({ label: 'CLUE', offered: false });
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    // Before the gap fix, nothing was available here until the next miss.
    expect(s.view().help).toMatchObject({ label: 'SHAFT MAP' });
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().shaftMode).toBe('numberLine');
    expect(s.view().help).toMatchObject({ label: 'HOW TO COUNT' });
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    // The counting strategy starts the count; it never reaches the destination.
    const move = s.view().task!.move!;
    expect(s.view().countAlong).toEqual({ from: move.start, direction: move.direction, steps: Math.min(2, move.change - 1) });
    // SHOW ME (a demonstrated answer) is never requestable early.
    expect(s.view().help).toBeNull();
  });

  it('miss 5 pauses the job for a test run on a different example, then returns the learner to the same job unsolved', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const job = s.view().task!.move!;
    const target = solve(s);
    for (let i = 0; i < 4; i++) {
      await missOnce(s);
      expect(s.view().stage).toBe('task');
    }
    await missOnce(s);
    await s.time.runUntil(() => s.view().stage === 'rescue');
    let v = s.view();
    expect(v.stage).toBe('rescue');
    expect(v.elevator.panelEnabled).toBe(false);
    expect(v.help).toBeNull();
    expect(v.highlights).toEqual([]);
    const r = v.rescue!;
    expect(r.kind).toBe('move');
    expect(r.direction).toBe(job.direction);
    const exampleStop = r.origin + (r.direction === 'down' ? -1 : 1) * r.steps;
    expect(exampleStop).not.toBe(target); // a different example, never the job's answer
    expect(v.lifty.line).not.toMatch(/wrong|fail|oops/i);
    const before = await attempts(s);

    // Tapping the start floor is not move 1.
    s.director.rescueTap(r.origin);
    expect(s.view().rescue!.counted).toEqual([]);
    expect(s.view().lifty.mood).toBe('thinking');

    // Count the moves, one floor at a time.
    const sign = r.direction === 'down' ? -1 : 1;
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    expect(s.view().rescue!.phase).toBe('ask');

    // A wrong stop resets the count without a verdict.
    s.director.rescueTap(r.origin);
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().rescue).toMatchObject({ phase: 'counting', counted: [] });
    expect(s.view().lifty.mood).toBe('helping');

    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    s.director.rescueTap(exampleStop);
    await s.time.runUntil(() => s.view().stage === 'task' && settled(s)());
    // The test run is not evidence.
    expect(await attempts(s)).toBe(before);

    v = s.view();
    expect(v.rescue).toBeNull();
    expect(v.task!.move).toEqual(job); // the same job, still unsolved
    expect(v.highlights).toEqual([]);
    expect(v.lifty.line).toContain(`Floor ${job.start}`);
    expect(v.lifty.line).toMatch(/^Now the real job/);

    // The learner does the final reasoning.
    s.director.pressFloor(target);
    await s.time.runUntil(() => s.view().success === 'animating');
    expect(s.view().lifty.line).toContain(LINES.praise.afterRescue);
    await waitSettled(s);
    const row = await s.db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq DESC LIMIT 1");
    expect(JSON.parse(row!.payload)).toMatchObject({ outcome: 'correct', assistance: 'guided', conceptRescue: true, wrongTries: 5 });
  });

  it('a rescue in progress survives closing the app', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wake(s);
    for (let i = 0; i < 5; i++) await missOnce(s);
    await time.runUntil(() => s.view().stage === 'rescue');
    const board = s.view().rescue!;
    await s.director.idle();
    s.director.dispose();
    s.rt.dropMemory();

    const again = await openSession(tmp.file, time);
    await time.runUntil(() => again.view().stage === 'rescue');
    expect(again.view().rescue).toMatchObject({ kind: board.kind, origin: board.origin, steps: board.steps, counted: [] });
  });
});

describe('auto-ride pacing', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('scales travel only, within bounds', () => {
    const t = autoRideTiming(NORMAL_TIMING, 0.5);
    expect(t.perFloorMs).toBe(Math.round(NORMAL_TIMING.perFloorMs * 0.5));
    expect(t.doorOpenMs).toBe(NORMAL_TIMING.doorOpenMs);
    expect(autoRideTiming(NORMAL_TIMING, 0.01).perFloorMs).toBe(Math.round(NORMAL_TIMING.perFloorMs * 0.3));
  });

  it('a hall call rides at the learner pace; the ride back from a test run is one the lift takes itself, faster', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    // The first job's floor calls the lift and the learner presses it: a normal ride.
    await s.time.runUntil(() => s.view().stage === 'reposition' && s.view().elevator.phase === 'traveling');
    expect(s.view().timing).toEqual(NORMAL_TIMING);
    await waitSettled(s);
    const start = s.view().task!.move!.start;
    // Five misses, then a test run. Afterwards the lift rides itself back to the job's floor.
    for (let i = 0; i < 5 && s.view().stage === 'task'; i++) await missOnce(s);
    await s.time.runUntil(() => s.view().stage === 'rescue');
    expect(s.view().elevator.floor).not.toBe(start);
    const r = s.view().rescue!;
    const sign = r.direction === 'down' ? -1 : 1;
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    s.director.rescueTap(r.origin + sign * r.steps);
    await s.time.runUntil(() => s.view().stage === 'reposition' && s.view().elevator.phase === 'traveling');
    expect(s.view().timing.perFloorMs).toBe(autoRideTiming(NORMAL_TIMING, PACING.autoRideTimeScale).perFloorMs);
    await waitSettled(s);
    expect(s.view().stage).toBe('task');
    expect(s.view().elevator.floor).toBe(start);
    expect(s.view().timing).toEqual(NORMAL_TIMING);
  });
});

describe('two learners on one device', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('each learner resumes their own Floor 15', async () => {
    const time = virtualTime();
    const a = await openSession(tmp.file, time, { learnerId: 'learner-a' });
    await wake(a);
    await missOnce(a);
    const aJob = a.view().task!.move;
    await a.director.idle();
    a.director.dispose();

    const b = await openSession(tmp.file, time, { learnerId: 'learner-b' });
    expect(b.view()).toMatchObject({ stage: 'intro', power: 'off' });
    expect(b.director.instanceId()).not.toBe(a.director.instanceId());
    b.director.dispose();
    a.rt.dropMemory();

    const aAgain = await openSession(tmp.file, time, { learnerId: 'learner-a' });
    await time.runUntil(() => settled(aAgain)());
    expect(aAgain.view().task).toMatchObject({ move: aJob, wrongTries: 1 });
  });
});
