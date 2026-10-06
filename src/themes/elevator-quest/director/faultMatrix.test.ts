// Crash matrix on the real Floor 15 content (audit P1). At each durable boundary a fault aborts
// the commit mid-transaction (after its learning events were written, before the checkpoint), and
// the process dies. On restart nothing partial may remain, and redoing the action records it
// exactly once.
import type { SqlValue } from '../../../persistence/driver';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15 } from '../content/floor15';
import { LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';

const ID = 'floor15-faults';

interface Fault {
  armed: boolean;
  hits: number;
  match: (sql: string, params: readonly SqlValue[]) => boolean;
}

const checkpointWrite = (sql: string) => sql.includes('UPDATE mission_instances');

async function open(file: string, time: VirtualTime, fault: Fault): Promise<Session> {
  return openSession(file, time, {
    instanceId: ID,
    faults: {
      failBefore: (sql, params) => {
        if (!fault.armed || !fault.match(sql, params)) return false;
        fault.hits += 1;
        return true;
      },
    },
  });
}

/** Process death: no orderly shutdown. Reopen with the fault disarmed. */
async function crashAndRestart(s: Session, file: string, time: VirtualTime, fault: Fault): Promise<Session> {
  fault.armed = false;
  s.director.dispose();
  await s.db.close();
  const next = await open(file, time, fault);
  await time.runUntil(settled(next));
  return next;
}

/** Everything durable that a partial commit could leave behind. */
async function durable(s: Session) {
  const row = await s.db.get<{ revision: number; last_command_id: string | null; state: string }>('SELECT revision, last_command_id, state FROM mission_instances WHERE id = ?', [ID]);
  return {
    attempts: await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'"),
    completions: await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'completion'"),
    progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
    revision: row?.revision ?? null,
    lastCommand: row?.last_command_id ?? null,
    state: row?.state ?? null,
  };
}

const wrongFloor = (s: Session) => {
  const right = solve(s);
  return right >= 19 ? right - 2 : right + 2;
};
const answered = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

async function miss(s: Session) {
  const before = answered(s);
  s.director.pressFloor(wrongFloor(s));
  expect(await s.time.runUntil(() => answered(s) > before && !s.view().saving && (s.view().stage === 'rescue' || (s.view().stage === 'task' && settled(s)())))).toBe(true);
}

/** Count the rescue example and say where it ends. */
function solveRescue(s: Session) {
  const r = s.view().rescue!;
  const sign = r.direction === 'down' ? -1 : 1;
  for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
  s.director.rescueTap(r.origin + sign * r.steps);
}

const signature = (s: Session) => s.rt.currentView(s.director.instanceId()).view.activity?.itemSignature ?? null;
const wrongTries = (s: Session) => s.view().task?.wrongTries ?? null;

describe('Floor 15 crash matrix (real content)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let time: VirtualTime;
  let fault: Fault;
  beforeEach(() => {
    tmp = tempDir();
    time = virtualTime();
    fault = { armed: false, hits: 0, match: checkpointWrite };
  });
  afterEach(() => tmp.cleanup());

  /** Arm, act, wait for the fault to fire, crash, restart. Returns the restarted session. */
  async function crashDuring(s: Session, act: () => void): Promise<Session> {
    fault.armed = true;
    act();
    expect(await time.runUntil(() => fault.hits > 0, 60_000)).toBe(true);
    return crashAndRestart(s, tmp.file, time, fault);
  }

  it('a correct value answer: nothing kept, the same job comes back, and the redo records one attempt', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    const before = await durable(s);
    const sig = signature(s);
    s = await crashDuring(s, () => s.director.pressFloor(solve(s)));
    expect(await durable(s)).toEqual(before); // the attempt written inside the aborted commit is gone
    expect(signature(s)).toBe(sig);
    await answerCorrectly(s);
    expect((await durable(s)).attempts).toBe(before.attempts + 1);
  });

  it('a wrong value answer: the miss is not kept', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    const before = await durable(s);
    s = await crashDuring(s, () => s.director.pressFloor(wrongFloor(s)));
    expect(await durable(s)).toEqual(before);
    expect(wrongTries(s)).toBe(0);
    await miss(s);
    expect(wrongTries(s)).toBe(1);
  });

  it('the miss that starts Concept Rescue: no half-started rescue; the next miss starts it once', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    for (let i = 0; i < 4; i++) await miss(s);
    const before = await durable(s);
    s = await crashDuring(s, () => s.director.pressFloor(wrongFloor(s)));
    expect(await durable(s)).toEqual(before);
    expect(s.view().stage).toBe('task');
    expect(wrongTries(s)).toBe(4);
    await miss(s);
    await time.runUntil(() => s.view().stage === 'rescue');
    expect(s.view().stage).toBe('rescue');
  });

  it('the rescue answer and the return to the job: the rescue is still open after the crash, and is never evidence', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    const job = s.view().task!.move!;
    for (let i = 0; i < 5; i++) await miss(s);
    await time.runUntil(() => s.view().stage === 'rescue');
    const before = await durable(s);
    s = await crashDuring(s, () => solveRescue(s));
    expect(await durable(s)).toEqual(before);
    await time.runUntil(() => s.view().stage === 'rescue');
    expect(s.view().rescue).toMatchObject({ counted: [] });
    solveRescue(s);
    expect(await time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
    expect(s.view().task!.move).toEqual(job);
    const after = await durable(s);
    expect(after.attempts).toBe(before.attempts); // the practice example never becomes an attempt
  });

  it('the fresh-item path (a new variant after many misses): no half-replaced item; the redo replaces it once', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    for (let i = 0; i < 5; i++) await miss(s);
    await time.runUntil(() => s.view().stage === 'rescue');
    solveRescue(s);
    await time.runUntil(() => s.view().stage === 'task' && settled(s)());
    while ((wrongTries(s) ?? 0) < 7) await miss(s);
    const before = await durable(s);
    const sig = signature(s);
    s = await crashDuring(s, () => s.director.pressFloor(wrongFloor(s)));
    expect(await durable(s)).toEqual(before);
    expect(signature(s)).toBe(sig);
    expect(wrongTries(s)).toBe(7);
    await miss(s);
    expect(signature(s)).not.toBe(sig);
    const after = await durable(s);
    expect(after.attempts).toBe(before.attempts + 1); // the replaced item is one incorrect attempt
    const last = await s.db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq DESC LIMIT 1");
    expect(JSON.parse(last!.payload)).toMatchObject({ outcome: 'incorrect', itemSignature: sig });
  });

  it('completion and its unlocks commit together; replaying the mission never duplicates an unlock', async () => {
    let s = await open(tmp.file, time, fault);
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    const before = await durable(s);
    fault.match = (sql) => sql.includes('INTO unlocks'); // after the completion record, inside the same commit
    s = await crashDuring(s, () => s.director.pressFloor(FLOOR15.repairFloor));
    expect(await durable(s)).toEqual(before);
    expect(s.view().stage).toBe('finale');
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().overlay !== null);
    const done = await durable(s);
    expect(done.completions).toBe(before.completions + 1);
    expect(done.unlocks).toBe(3);

    // Play again to the end: a second completion record, the same three unlocks.
    await s.director.playAgain();
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().overlay !== null);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'")).toBe(2);
    expect((await s.rt.unlocks(LEARNER)).map((u) => u.unlockId).sort()).toEqual(['eq.landing.floor-15-restored', 'eq.rank.engineer-1', 'eq.system.maintenance-panel']);
  });
});
