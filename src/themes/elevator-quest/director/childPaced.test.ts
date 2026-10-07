// Child-paced success (D122) and mission objects in the world (D123), on the real director.
// Understanding is never timed: after a correct answer only NEXT JOB moves on, and the panel cannot
// answer anything meanwhile. The thing a job talks about is on the landing at the right floor only.
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { OBJECTIVES, objectiveFor } from '../content/objectives';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { ARRIVAL_BEAT_MS } from './director';

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;
const windowsOpened = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer.window' && e.data.open === true).length;
const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
const learning = async (s: Session) => ({
  events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
  progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
  memory: await count(s.db, 'SELECT COUNT(*) AS n FROM world_memory'),
});

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

const review = (s: Session) => s.time.runUntil(() => s.view().stage === 'success' && s.view().success === 'review');

describe('child-paced success', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('arrival, then the replay, then it settles and waits: no timer ever starts the next job', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    const right = solve(s);
    const phases: string[] = [];
    s.director.subscribe((v) => {
      if (v.success && phases.at(-1) !== v.success) phases.push(v.success);
    });
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().success === 'arrival');
    // Floor first: Lifty is quiet while the doors open on what we found.
    expect(s.view().lifty.line).toBe('');
    expect(s.view().replay).toBeNull();
    expect(await review(s)).toBe(true);
    expect(phases).toEqual(['arrival', 'animating', 'review']);
    const settledLine = s.view().lifty.line;
    expect(settledLine).toMatch(/^There it is: the repair kit\. /);
    expect(settledLine).toContain(s.view().replay!.text);
    // A minute later nothing has moved on: the explanation is still there, still waiting.
    await s.time.advance(60_000);
    expect(s.view()).toMatchObject({ stage: 'success', success: 'review', lifty: { line: settledLine } });
    expect(s.view().replay?.revealed).toBe(s.view().replay?.steps.length);
    expect(s.log.entries().filter((e) => e.kind === 'task')).toHaveLength(1);
    // NEXT JOB moves on.
    s.director.nextJob();
    expect(s.view().stage).toBe('call');
    expect(s.view().success).toBeNull();
    expect(s.view().replay).toBeNull();
  });

  it('NEXT JOB does nothing before the success has settled, or outside a success', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    s.director.nextJob(); // during a job
    expect(s.view().stage).toBe('task');
    s.director.pressFloor(solve(s));
    await s.time.runUntil(() => s.view().success === 'arrival');
    s.director.nextJob(); // arrival beat
    expect(s.view().success).toBe('arrival');
    await s.time.runUntil(() => s.view().success === 'animating');
    s.director.nextJob(); // replay still playing
    expect(s.view().success).toBe('animating');
    await review(s);
    s.director.nextJob();
    s.director.nextJob(); // a second press is harmless
    expect(s.log.entries().filter((e) => e.kind === 'nextJob')).toHaveLength(1);
  });

  it('panel taps in every success phase never answer, never open a window, never queue a call', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    s.director.pressFloor(solve(s));
    await s.time.runUntil(() => s.view().stage === 'riding');
    const opened = windowsOpened(s);
    for (const phase of ['arrival', 'animating', 'review'] as const) {
      await s.time.runUntil(() => s.view().success === phase);
      for (let f = 1; f <= 20; f++) s.director.pressFloor(f);
      s.director.pressDoorClose();
      expect(s.view().elevator.lit).toEqual([]);
    }
    await s.time.advance(30_000);
    expect(answers(s)).toBe(1);
    expect(await attempts(s)).toBe(1);
    expect(windowsOpened(s)).toBe(opened);
    expect(s.view()).toMatchObject({ stage: 'success', success: 'review' });
  });

  it('one answer is one learning event; waiting and NEXT JOB add none', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    s.director.pressFloor(solve(s));
    await review(s);
    const atReview = await learning(s);
    expect(await attempts(s)).toBe(1);
    await s.time.advance(20_000);
    s.director.nextJob();
    await s.director.idle();
    expect(await learning(s)).toEqual(atReview);
  });

  it('reduced motion skips the travel of the replay, never the wait', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false, motion: 'reduced' });
    await wake(s);
    s.director.pressFloor(solve(s));
    await s.time.runUntil(() => s.view().success === 'arrival');
    const at = s.time.now();
    await review(s);
    expect(s.time.now() - at).toBeLessThanOrEqual(ARRIVAL_BEAT_MS.reduced);
    expect(s.view().replay!.revealed).toBe(s.view().replay!.steps.length);
    await s.time.advance(30_000);
    expect(s.view().success).toBe('review');
  });

  it('a crash while waiting resumes at the next job with the one attempt already recorded', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time, { autoNextJob: false, instanceId: 'paced-crash' });
    await wake(s);
    s.director.pressFloor(solve(s));
    await review(s);
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
    s = await openSession(tmp.file, time, { instanceId: 'paced-crash' });
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect(s.view().success).toBeNull();
    expect(s.view().task?.stepId).toBe('cued-moves');
    expect(await attempts(s)).toBe(1);
  });

  it('the success after a Concept Rescue waits for NEXT JOB too', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    const target = solve(s);
    for (let i = 0; i < 5 && s.view().stage === 'task'; i++) {
      const before = answers(s);
      s.director.pressFloor(target >= 19 ? target - 2 : target + 2);
      await s.time.runUntil(() => answers(s) > before && !s.view().saving && (s.view().stage === 'rescue' || (s.view().stage === 'task' && settled(s)())));
    }
    await s.time.runUntil(() => s.view().stage === 'rescue');
    const r = s.view().rescue!;
    const sign = r.direction === 'down' ? -1 : 1;
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    s.director.rescueTap(r.origin + sign * r.steps);
    await s.time.runUntil(() => s.view().stage === 'task' && settled(s)());
    s.director.pressFloor(target);
    await review(s);
    expect(s.view().lifty.line).toContain(LINES.praise.afterRescue);
    await s.time.advance(30_000);
    expect(s.view().success).toBe('review');
  });

  it('cargo: the accepted load waits for NEXT JOB, then the car leaves for the finale', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    while (s.view().stage !== 'cargo') await answerCorrectly(s);
    // Take over from the harness for this one.
    const s2 = s;
    const need = solve(s2);
    for (let i = 0; i < need; i++) s2.director.loadCrate();
    let reviewed = false;
    s2.director.subscribe((v) => (reviewed ||= v.success === 'review' && v.task?.kind === 'cargo'));
    s2.director.pressDoorClose();
    await s2.time.runUntil(() => s2.view().stage === 'finale');
    expect(reviewed).toBe(true);
    expect(s2.log.entries().filter((e) => e.kind === 'nextJob').length).toBeGreaterThanOrEqual(1);
  });
});

describe('mission objects in the world', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the repair kit is on the landing at the right floor before the doors open, and only there', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    const right = solve(s);
    expect(s.view().props).toEqual([]); // nothing shows the way before the answer
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().elevator.phase === 'doorsOpening');
    expect(s.view().props).toEqual([expect.objectContaining({ id: 'repair-kit', floor: right, visual: 'repairKit', state: 'present', interactive: true })]);
    expect(s.view().props[0]!.label).toBeTruthy();
    expect(s.view().props[0]!.action).toBeTruthy();
  });

  it('a wrong floor has no repair kit, and Lifty says so first', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    const wrong = right >= 19 ? right - 2 : right + 2;
    s.director.pressFloor(wrong);
    await s.time.runUntil(() => settled(s)() && s.view().task?.wrongTries === 1);
    expect(s.view().props).toEqual([]);
    expect(s.view().lifty.line).toMatch(/^No repair kit here\. /);
  });

  it('loading the kit is optional, presentation only, and never moves on by itself', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    s.director.collect('repair-kit'); // not found yet
    expect(s.view().props).toEqual([]);
    s.director.pressFloor(solve(s));
    await review(s);
    const before = await learning(s);
    s.director.collect('toolbox'); // not here
    s.director.collect('repair-kit');
    s.director.collect('repair-kit');
    expect(s.view().props[0]!.state).toBe('collected');
    expect(s.log.entries().filter((e) => e.kind === 'collect')).toHaveLength(1);
    expect(s.view().success).toBe('review');
    await s.director.idle();
    expect(await learning(s)).toEqual(before); // no evidence, and nothing stored
    s.director.nextJob();
    expect(s.view().props).toEqual([]); // session only: the next job starts clean
  });

  it('each job finds its own thing: repair kit, toolbox, spare parts, crew (beacon given), loading dock', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const found: string[] = [];
    const beacons: { floor: number; start: number }[] = [];
    s.director.subscribe((v) => {
      for (const p of v.props) if (!found.includes(p.id)) found.push(p.id);
      const b = v.props.find((p) => p.id === 'beacon');
      if (b && v.task?.move && beacons.length === 0) beacons.push({ floor: b.floor, start: v.task.move.start });
    });
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    expect(found).toEqual(['repair-kit', 'toolbox', 'spare-parts', 'beacon', 'crew', 'loading-dock']);
    // The beacon stands on the floor the job names as the beacon's: a given, not the answer.
    expect(beacons[0]!.floor).toBe(beacons[0]!.start);
  });

  it('the destination object a job gets agrees with the words of that job', () => {
    for (const o of OBJECTIVES.objectives) expect(objectiveFor(OBJECTIVES, o.step, o.items === 'rest' ? 1 : 0, o.at)?.id).toBe(o.id);
    expect(LINES.cued({ start: 3, change: 4, direction: 'up' }, 0)).toContain(objectiveFor(OBJECTIVES, 'cued-moves', 0, 'destination')!.noun);
    expect(LINES.cued({ start: 3, change: 4, direction: 'up' }, 1)).toContain(objectiveFor(OBJECTIVES, 'cued-moves', 1, 'destination')!.noun);
  });

  it('Floor 15 power stays durable world state; the mission objects never reach the database', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await s.time.runUntil(() => s.view().stage === 'freeRide');
    expect(s.view().floor15Restored).toBe(true);
    const names = await s.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(names.map((n) => n.name).filter((n) => /prop|objective/.test(n))).toEqual([]);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM world_memory WHERE memory_key LIKE '%kit%' OR memory_key LIKE '%crew%'")).toBe(0);
  });
});

describe('the success owns the help slot', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it("the job's help button leaves with the job, so NEXT JOB never shares its place", async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    expect(s.view().help).not.toBeNull();
    s.director.pressFloor(solve(s));
    await s.time.runUntil(() => s.view().success === 'arrival');
    expect(s.view().help).toBeNull();
    await review(s);
    expect(s.view().help).toBeNull();
  });
});
