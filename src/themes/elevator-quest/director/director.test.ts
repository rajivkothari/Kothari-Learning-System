// Floor 15, headless: the real director, runtime, and SQLite on virtual time.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, waitSettled, type Session } from '../testing/headless';

const arrivals = (s: Session) => s.log.entries().filter((e) => e.kind === 'elevator.arrive').map((e) => e.data.floor);
const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');

async function wakeTheLift(s: Session) {
  expect(s.view()).toMatchObject({ stage: 'intro', power: 'off' });
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

describe('Floor 15 director', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('plays the whole mission: wake, ride, wrong floor, help, stretch, encounter, finale, unlocks', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);

    // First job: its floor calls the lift (a hall call the learner presses), then the learner operates it.
    let v = s.view();
    expect(v).toMatchObject({ stage: 'task', power: 'on', task: { kind: 'panel', stepId: 'cued-moves', reference: 'start' } });
    expect(v.elevator.floor).toBe(v.task!.move!.start);
    expect(s.log.entries().some((e) => e.kind === 'elevator.depart' && e.data.kind === 'reposition')).toBe(true);
    expect(v.lifty.line).toContain(`Floor ${v.task!.move!.start}`);

    // Wrong floor: the elevator really goes there, THEN the world explains.
    const right = solve(s);
    const wrong = right + (right < 20 ? 1 : -1);
    s.director.pressFloor(wrong);
    expect(s.view().elevator.lit).toEqual([wrong]);
    await time.runUntil(() => s.view().stage === 'riding');
    expect(s.view().lifty.mood).toBe('thinking'); // no verdict while moving
    await waitSettled(s);
    v = s.view();
    expect(v.elevator.floor).toBe(wrong);
    expect(arrivals(s).at(-1)).toBe(wrong);
    expect(v).toMatchObject({ stage: 'task', lifty: { mood: 'concerned' } });
    expect(v.task!.wrongTries).toBe(1);
    expect(v.lifty.line).not.toMatch(/quantity\.|misconception|wrong!/i);
    // Automatic feedback may explain the counting convention, never count to the destination.
    if (v.countAlong) expect(v.countAlong.steps).toBe(1);

    // Optional help: a clue rings the starting floor. Nothing forced.
    expect(v.help).toMatchObject({ label: 'CLUE' });
    s.director.requestHelp();
    await time.runUntil(() => !s.view().saving);
    expect(s.view().highlights).toEqual([v.task!.move!.start]);
    expect(s.view().lifty.mood).toBe('helping');

    // Retry from where we are: the car is at the wrong floor, the problem is unchanged.
    await answerCorrectly(s);
    v = s.view();
    expect(v.task?.stepId).toBe('cued-moves'); // second item of the first step
    await answerCorrectly(s);

    // Second representation: the shaft map is an input too.
    v = s.view();
    expect(v).toMatchObject({ stage: 'task', shaftMode: 'map', task: { kind: 'shaft', stepId: 'second-representation' } });
    s.director.pressFloor(solve(s), 'shaft');
    await time.runUntil(() => settled(s)() && s.view().task?.stepId === 'reference-stretch');

    // Stretch: the reference point is a beacon, not where the car is.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'panel', reference: 'beacon' });
    expect(v.beacon).toBe(v.task!.move!.start);
    expect(v.lifty.line).toMatch(/beacon/);
    expect(v.lifty.line).not.toMatch(/stretch/i);
    await answerCorrectly(s);

    // Encounter stage 1: route to the dock.
    v = s.view();
    expect(v.task).toMatchObject({ stepId: 'capacity-encounter', kind: 'panel' });
    await answerCorrectly(s);

    // Encounter stage 2: load the car. Overload is refused by the car itself; revise; go.
    v = s.view();
    expect(v.stage).toBe('cargo');
    const cargo = v.task!.cargo!;
    const need = solve(s);
    for (let i = 0; i <= need; i++) s.director.loadCrate();
    s.director.pressDoorClose();
    await time.runUntil(() => !s.view().saving);
    expect(s.view().task!.cargo).toMatchObject({ status: 'overload', loaded: need + 1 });
    expect(s.view().elevator.phase).toBe('idleOpen'); // doors refuse to close
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'overloadTone')).toBe(true);
    s.director.unloadCrate();
    s.director.pressDoorClose();
    await time.runUntil(() => s.view().stage === 'finale' && !s.view().saving);
    expect(cargo.capacity).toBeGreaterThan(cargo.aboard);

    // Finale: only the repair floor makes sense now.
    v = s.view();
    expect(v.highlights).toEqual([FLOOR15.repairFloor]);
    s.director.pressFloor(FLOOR15.repairFloor - 1);
    expect(s.view().elevator.lit).toEqual([]);
    s.director.pressFloor(FLOOR15.repairFloor);
    // Completion happens in the world: no card. The floor comes back, the lamps sweep once, Lifty
    // names the rank and the clipboard, and the lift is the learner's.
    await time.runUntil(() => s.view().stage === 'freeRide');
    v = s.view();
    expect(v).toMatchObject({ stage: 'freeRide', power: 'on', maintenanceUnlocked: true, floor15Restored: true, rank: 'ENGINEER RANK 1', sweep: 1, lifty: { line: LINES.rankEarned } });
    expect(v).not.toHaveProperty('overlay');
    expect(v.elevator.panelEnabled).toBe(true);
    expect(v.progress.every((p) => p.done)).toBe(true);
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'completion')).toBe(true);

    // Durable facts.
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'")).toBe(1);
    expect((await s.rt.unlocks(LEARNER)).map((u) => u.unlockId).sort()).toEqual(['eq.landing.floor-15-restored', 'eq.rank.engineer-1', 'eq.system.maintenance-panel']);
    const attempts = await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
    expect(attempts).toBe(answers(s).filter((a) => a.data.correct === true).length + 0); // one attempt per solved item
    const replay = await s.rt.replayFromHistory(LEARNER);
    expect(canonicalJson(await s.rt.learnerState(LEARNER))).toBe(canonicalJson(replay.state));

    // Free ride afterwards: the elevator is the reward. No commands reach the learning runtime.
    const rows = await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');
    s.director.pressFloor(3);
    expect(await time.runUntil(() => s.view().elevator.floor === 3 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(rows);

    // Replay for fun: unlocks are not granted again.
    await s.director.playAgain();
    await wakeTheLift(s);
    for (let guard = 0; guard < 12 && s.view().stage !== 'finale'; guard++) await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide');
    expect(s.view()).toMatchObject({ sweep: 2, lifty: { line: LINES.completeAgain } });
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(3); // replaying never duplicates an unlock
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
  });

  it('finishes even when the loading dock is Floor 15 itself (no ride needed)', async () => {
    const time = virtualTime();
    // Seed found by search: this instance's encounter route ends at Floor 15.
    const s = await openSession(tmp.file, time, { instanceId: 'dock15-44' });
    await wakeTheLift(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    expect(s.view().elevator.floor).toBe(FLOOR15.repairFloor);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
    expect(s.log.entries().filter((e) => e.kind === 'mission.complete')).toHaveLength(1);
    s.director.dispose();
    await s.db.close();
  });

  it('button mashing creates one ride, one answer, and one attempt', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const target = solve(s);
    for (let i = 0; i < 10; i++) s.director.pressFloor(target);
    await time.advance(200);
    for (let i = 0; i < 10; i++) s.director.pressFloor(target);
    await time.runUntil(() => s.view().stage === 'riding');
    for (let i = 0; i < 10; i++) s.director.pressFloor(i + 1); // mashing other floors mid-ride
    await waitSettled(s);
    expect(answers(s)).toHaveLength(1);
    expect(s.log.entries().filter((e) => e.kind === 'commit')).toHaveLength(1);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    // One chime and one call-registered tone per real ride, however hard the panel was mashed.
    const rides = s.log.entries().filter((e) => e.kind === 'elevator.depart').length;
    expect(s.audio.filter((c) => c.action === 'play' && c.slot === 'arrivalChime').length).toBe(s.log.entries().filter((e) => e.kind === 'elevator.arrive').length);
    expect(s.audio.filter((c) => c.action === 'play' && c.slot === 'floorButtonActivate').length).toBe(rides);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart' && e.data.kind === 'answer')).toHaveLength(1);
    s.director.dispose();
    await s.db.close();
  });

  it('choosing the floor the car is on is an answer evaluated in place, without a ride', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const here = s.view().elevator.floor;
    const departs = s.log.entries().filter((e) => e.kind === 'elevator.depart').length;
    s.director.pressFloor(here);
    await time.runUntil(() => s.view().stage === 'task' && s.view().task!.wrongTries === 1);
    expect(answers(s)).toEqual([expect.objectContaining({ data: expect.objectContaining({ value: here, correct: false }) })]);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart')).toHaveLength(departs);
    // The panel is live again for the next try.
    s.director.pressFloor(solve(s));
    expect(s.view().elevator.lit).toEqual([solve(s)]);
    s.director.dispose();
    await s.db.close();
  });

  it('a misconception is explained in building terms without giving the answer away', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const move = s.view().task!.move!;
    expect(move.direction).toBe('up'); // the first step is cued "up"
    s.director.pressFloor(solve(s) - 1); // counted the starting floor
    await time.runUntil(() => settled(s)() && s.view().task!.wrongTries === 1);
    const v = s.view();
    expect(v.lifty.line).toBe(`One floor short. Floor ${move.start} is where we start. Count the floors after ${move.start}.`);
    expect(v.countAlong).toEqual({ from: move.start, direction: 'up', steps: 1 });
    expect(v.highlights).toEqual([]);
    s.director.dispose();
    await s.db.close();
  });

  it('a change of plan before departure is praised and counts as one answer', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const right = solve(s);
    s.director.pressFloor(right === 20 ? 19 : right + 1);
    await time.advance(200);
    s.director.pressFloor(right);
    await time.runUntil(() => s.view().stage === 'success');
    expect(answers(s)).toEqual([expect.objectContaining({ data: expect.objectContaining({ value: right, correct: true, changedPlan: true }) })]);
    expect(s.view().lifty.line.startsWith('You changed your plan. That worked.')).toBe(true);
    s.director.dispose();
    await s.db.close();
  });

  it('switching motion mid-ride waits for the stop, so the trip keeps one consistent profile', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { motion: 'reduced' });
    await wakeTheLift(s);
    s.director.pressFloor(solve(s) === 20 ? 1 : 20);
    await time.runUntil(() => s.view().elevator.phase === 'traveling');
    const timing = s.view().timing;
    s.director.setMotion('normal');
    expect(s.view().timing).toBe(timing); // unchanged while moving
    const floors: number[] = [];
    await time.runUntil(() => {
      floors.push(s.view().elevator.indicator);
      return s.view().elevator.phase === 'idleOpen';
    });
    for (let i = 1; i < floors.length; i++) expect(Math.abs(floors[i]! - floors[i - 1]!)).toBeLessThanOrEqual(1);
    expect(s.view().timing).not.toBe(timing); // applied at the stop
    expect(s.view().motion).toBe('normal');
    s.director.dispose();
    await s.db.close();
  });

  it('reduced motion plays the same mission with the same learning record, faster', async () => {
    const play = async (motion: 'normal' | 'reduced', file: string) => {
      const time = virtualTime();
      const s = await openSession(file, time, { motion, instanceId: 'same-seed' });
      const t0 = time.now();
      await wakeTheLift(s);
      for (let guard = 0; guard < 12 && s.view().stage !== 'finale'; guard++) await answerCorrectly(s);
      const events = (await s.db.all<{ id: string }>('SELECT id FROM learning_events ORDER BY seq')).map((r) => r.id);
      const tasks = s.log.entries().filter((e) => e.kind === 'task').map((e) => ({ ...e.data }));
      const elapsed = time.now() - t0;
      s.director.dispose();
      await s.db.close();
      return { events, tasks, elapsed };
    };
    const other = tempDir();
    const normal = await play('normal', tmp.file);
    const reduced = await play('reduced', other.file);
    other.cleanup();
    expect(reduced.events).toEqual(normal.events);
    expect(reduced.tasks).toEqual(normal.tasks);
    expect(reduced.elapsed).toBeLessThan(normal.elapsed * 0.6);
  });
});
