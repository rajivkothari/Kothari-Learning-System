// Save / resume at every major Floor 15 boundary. World state (car floor, doors, crates)
// is presentation and is rebuilt coherently; learning state comes from SQLite.
import { FLOOR15 } from '../content/floor15';
import { LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { count } from '../../../runtime/testing/harness';

const ID = 'floor15-resume';

/** Simulated process death: no orderly shutdown, nothing flushed beyond what was committed. */
async function restart(s: Session, file: string, time: VirtualTime): Promise<Session> {
  s.director.dispose();
  await s.db.close();
  const next = await openSession(file, time, { instanceId: ID });
  await time.runUntil(settled(next));
  return next;
}

async function wake(s: Session) {
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
}

describe('Floor 15 save and resume', () => {
  let tmp: ReturnType<typeof tempDir>;
  let time: VirtualTime;
  beforeEach(() => {
    tmp = tempDir();
    time = virtualTime();
  });
  afterEach(() => tmp.cleanup());

  it('before the first activity: the lift is still asleep', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    s = await restart(s, tmp.file, time);
    expect(s.view()).toMatchObject({ stage: 'intro', power: 'off' });
    expect(s.view().elevator.phase).toBe('idleClosed');
    s.director.dispose();
    await s.db.close();
  });

  it('after a correct destination: the next job, car parked at its start, doors open', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    s.director.pressFloor(solve(s));
    await time.runUntil(() => s.view().stage === 'success');
    s = await restart(s, tmp.file, time);
    const v = s.view();
    expect(v.stage).toBe('task');
    expect(v.task!.stepId).toBe('cued-moves');
    expect(v.elevator).toMatchObject({ floor: v.task!.move!.start, phase: 'idleOpen', lit: [] });
    expect(v.lifty.line).toMatch(/^Welcome back/);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    s.director.dispose();
    await s.db.close();
  });

  it('after an incorrect destination: the same job, the miss is remembered', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    const move = s.view().task!.move!;
    const right = solve(s);
    s.director.pressFloor(right === 20 ? 19 : right + 1);
    await time.runUntil(() => settled(s)() && s.view().task?.wrongTries === 1);
    s = await restart(s, tmp.file, time);
    expect(s.view().task).toMatchObject({ move, wrongTries: 1 });
    expect(solve(s)).toBe(right);
    s.director.dispose();
    await s.db.close();
  });

  it('after using help: the help ladder continues where it was', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    expect(s.view().help?.label).toBe('CLUE');
    s.director.requestHelp();
    await time.runUntil(() => !s.view().saving);
    const after = s.view().help;
    s = await restart(s, tmp.file, time);
    expect(s.view().help?.stepId ?? null).toBe(after?.stepId ?? null);
    expect(s.view().help?.label).not.toBe('CLUE');
    s.director.dispose();
    await s.db.close();
  });

  it('immediately after a step completes, during the encounter, and after it', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    await answerCorrectly(s);
    await answerCorrectly(s); // finishes the first step
    s = await restart(s, tmp.file, time);
    expect(s.view().task?.stepId).toBe('second-representation');
    while (!(s.view().stage === 'cargo' && s.view().task?.stepId === 'capacity-encounter')) await answerCorrectly(s);
    const cargo = s.view().task!.cargo!;
    s.director.loadCrate();
    s.director.loadCrate();
    s = await restart(s, tmp.file, time);
    expect(s.view().stage).toBe('cargo');
    expect(s.view().task!.cargo).toMatchObject({ capacity: cargo.capacity, aboard: cargo.aboard, waiting: cargo.waiting, loaded: 0 });
    await answerCorrectly(s);
    expect(s.view().stage).toBe('finale');
    s = await restart(s, tmp.file, time);
    expect(s.view()).toMatchObject({ stage: 'finale', highlights: [FLOOR15.repairFloor] });
    expect(s.view().elevator.disabledFloors).not.toContain(FLOOR15.repairFloor);
    s.director.dispose();
    await s.db.close();
  });

  it('around completion: a crash while saving the completion retries cleanly; after it, the mission stays complete', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.dispose();
    await s.db.close();

    // Reopen with a fault on the mission completion record: the commit fails mid-transaction.
    let armed = true;
    s = await openSession(tmp.file, time, {
      instanceId: ID,
      faults: { failBefore: (sql, p) => armed && sql.includes('INTO learning_events') && String(p[0]).startsWith('completion:mission:') },
    });
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'finale' && !s.view().saving && s.view().lifty.line.includes('logbook'));
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(0);
    armed = false;
    s = await restart(s, tmp.file, time);
    expect(s.view().stage).toBe('finale');
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide');
    expect(s.view()).toMatchObject({ rank: 'ENGINEER RANK 1', maintenanceUnlocked: true, floor15Restored: true });
    s = await restart(s, tmp.file, time);
    expect(s.view()).toMatchObject({ stage: 'freeRide', rank: 'ENGINEER RANK 1', maintenanceUnlocked: true, floor15Restored: true });
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'")).toBe(1);
    expect((await s.rt.unlocks(LEARNER)).length).toBe(3);
    s.director.dispose();
    await s.db.close();
  });

  it('reopening the app after completion goes to free ride at the restored floor, not a fresh intro (no instance id given)', async () => {
    let s = await openSession(tmp.file, time);
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide');
    const done = s.director.instanceId();
    s.director.dispose();
    await s.db.close();
    // A cold start picks the instance itself, as the app does.
    s = await openSession(tmp.file, time);
    expect(s.director.instanceId()).toBe(done);
    expect(s.view()).toMatchObject({ stage: 'freeRide', maintenanceUnlocked: true, floor15Restored: true });
    expect(s.view().elevator).toMatchObject({ floor: FLOOR15.repairFloor, phase: 'idleOpen', panelEnabled: true });
    // Play again starts a new instance, with the intro.
    await s.director.playAgain();
    expect(s.director.instanceId()).not.toBe(done);
    expect(s.view().stage).toBe('intro');
    s.director.dispose();
    await s.db.close();
  });

  it('process death mid-ride restores a stopped car at a floor, never between floors', async () => {
    let s = await openSession(tmp.file, time, { instanceId: ID });
    await wake(s);
    s.director.pressFloor(solve(s));
    await time.runUntil(() => s.view().elevator.phase === 'traveling');
    s = await restart(s, tmp.file, time);
    const v = s.view();
    expect(v.elevator.phase).toBe('idleOpen');
    expect(Number.isInteger(v.elevator.floor)).toBe(true);
    expect(['task', 'cargo']).toContain(v.stage);
    s.director.dispose();
    await s.db.close();
  });
});
