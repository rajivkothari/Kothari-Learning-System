// Audit: a save that keeps failing must never leave "One moment. Saving the logbook." on screen
// forever. The director stops in a clear error state, records nothing it could not save, and an
// adult's TRY AGAIN reloads the last durable save.
import { LINES } from '../content/floor15';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

async function attempts(s: Session) {
  return (await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq")).map((r) => JSON.parse(r.payload) as { outcome: string; wrongTries: number; assistance: string; itemSignature: string });
}

/** TRY AGAIN, with virtual time running (recovery first lets a ride under way finish). */
async function tryAgain(s: Session) {
  const done = s.director.recover();
  await s.time.advance(20_000);
  await done;
}

describe('save failure recovery', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  async function brokenSave(failReads: boolean) {
    const fault = { saves: false, reads: false };
    const s = await openSession(tmp.file, virtualTime(), {
      faults: { failBefore: (sql) => (fault.saves && sql.includes('UPDATE mission_instances')) || (fault.reads && /SELECT .* FROM mission_instances/.test(sql)) },
    });
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    const signature = s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature;
    fault.saves = true;
    fault.reads = failReads;
    s.director.pressFloor(solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'error', 60_000)).toBe(true);
    return { s, fault, signature };
  }

  it('a correct answer that cannot be saved stops clearly, records nothing, and TRY AGAIN resumes the same job', async () => {
    const { s, fault, signature } = await brokenSave(false);
    expect(s.view()).toMatchObject({ stage: 'error', trouble: 'save', saving: false });
    expect(s.view().lifty.line).toBe(LINES.saveStuck);
    expect(s.view().lifty.line).not.toBe(LINES.commitTrouble);
    expect(await attempts(s)).toEqual([]); // nothing was saved, so nothing is claimed
    // Taps do nothing while stopped.
    s.director.pressFloor(3);
    await s.time.advance(5_000);
    expect(s.log.entries().filter((e) => e.kind === 'answer')).toHaveLength(1);

    fault.saves = false;
    await tryAgain(s);
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    expect(s.view().trouble).toBeNull();
    expect(s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature).toBe(signature);
    await answerCorrectly(s);
    const saved = await attempts(s);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ outcome: 'correct', wrongTries: 0, itemSignature: signature });
  });

  it('if reloading fails too, it stays in the clear error state, and a later TRY AGAIN works', async () => {
    const { s, fault } = await brokenSave(true);
    expect(s.view()).toMatchObject({ stage: 'error', trouble: 'save', saving: false });
    await tryAgain(s);
    expect(s.view()).toMatchObject({ stage: 'error', trouble: 'save', saving: false });
    expect(s.log.entries().filter((e) => e.kind === 'trouble').length).toBeGreaterThanOrEqual(2);
    fault.saves = false;
    fault.reads = false;
    await tryAgain(s);
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
  });
});
