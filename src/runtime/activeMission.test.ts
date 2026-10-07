// The active mission lives in memory. Answer evaluation and the visible checkpoint never
// touch SQLite; SQLite is the durable record and the recovery source.
import { canonicalJson, type PresentationIntent } from '../engine';
import type { SqlDatabase, SqlExecutor } from '../persistence/driver';
import { openNodeDatabase } from '../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from './gameRuntime';
import { CORE_CONTENT, count, fakeClock, tempDir } from './testing/harness';

const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

/** Wraps a database and counts every statement, including those inside transactions. */
function counting(db: SqlDatabase): SqlDatabase & { statements: string[] } {
  const statements: string[] = [];
  const wrap = (x: SqlExecutor): SqlExecutor => ({
    exec: (sql) => (statements.push(sql), x.exec(sql)),
    run: (sql, p) => (statements.push(sql), x.run(sql, p)),
    get: (sql, p) => (statements.push(sql), x.get(sql, p)),
    all: (sql, p) => (statements.push(sql), x.all(sql, p)),
  });
  return { ...wrap(db), transaction: (work) => db.transaction((tx) => work(wrap(tx))), close: () => db.close(), statements };
}

async function setup(file: string, clock = fakeClock(), faults?: Parameters<typeof openNodeDatabase>[1], content = CORE_CONTENT) {
  const db = counting(openNodeDatabase(file, faults));
  const rt = await openGameRuntime(db, content, clock);
  return { db, rt, clock };
}

/** The core content with the generic rescue (five misses, back to the same item) instead of the first-miss correction. */
const FIVE_MISSES = {
  ...CORE_CONTENT,
  pack: { ...CORE_CONTENT.pack, scaffoldingPolicies: CORE_CONTENT.pack.scaffoldingPolicies.map((p) => (p.conceptRescue ? { ...p, conceptRescue: { afterWrongTries: 5, returnTo: 'same' as const, example: 'parallel' as const } } : p)) },
};

async function started(rt: GameRuntime, id = 'm1') {
  if (!(await rt.getLearner('learner-a'))) await rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
  await rt.startMission({ learnerId: 'learner-a', missionId: 'positions-and-capacity', instanceId: id });
  await rt.activate(id);
  await rt.acknowledge(id, { commandId: 'intro' });
  return id;
}

/** The correct value for the current item, found by asking `check` (as a UI never would, but a test may). */
function solve(rt: GameRuntime, id: string): number {
  const { view } = rt.currentView(id);
  const a = view.activity!.answer;
  if (a.mode !== 'value') throw new Error('expected value mode');
  for (let v = a.min; v <= a.max; v++) {
    const c = rt.check(id, { mode: 'value', value: v });
    if (c.ok && c.evaluation.correct) return v;
  }
  throw new Error('unsolvable');
}

describe('active mission in memory', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('evaluates the visible item and redraws it without any database statement', async () => {
    const { db, rt } = await setup(tmp.file);
    const id = await started(rt);
    db.statements.length = 0;
    for (let v = 1; v <= 20; v++) rt.check(id, { mode: 'value', value: v });
    rt.currentView(id);
    solve(rt, id);
    expect(db.statements).toEqual([]);
    await db.close();
  });

  it('the instant check agrees with the committed result for every possible floor', async () => {
    // Several misses must commit in a row, so this pins the generic rescue (the shipped practice
    // policy corrects at the first miss; the check and the commit agree the same way there).
    const { db, rt } = await setup(tmp.file, fakeClock(), undefined, FIVE_MISSES);
    const id = await started(rt);
    let misses = 0;
    for (let v = 1; v <= 20; v++) {
      const check = rt.check(id, { mode: 'value', value: v });
      if (!check.ok) throw new Error('rejected');
      // Stay below the Concept Rescue threshold (5 misses): after that the item pauses for a rescue.
      if (!check.evaluation.correct && ++misses > 4) continue;
      const { revision } = rt.currentView(id);
      const out = await rt.submit(id, { commandId: `try-${v}`, value: v, basedOn: revision });
      const result = of(out.intents, 'RESPONSE_RESULT')[0]!;
      expect({ correct: result.correct, misconception: result.misconception }).toEqual({
        correct: check.evaluation.correct,
        misconception: check.evaluation.correct ? null : (check.evaluation.misconception ?? null),
      });
      if (result.correct) break;
    }
    await db.close();
  });

  it('advances the in-memory checkpoint only after the commit succeeds', async () => {
    const { db, rt } = await setup(tmp.file);
    const id = await started(rt);
    const before = rt.currentView(id);
    const pending = rt.submit(id, { commandId: 'a1', value: solve(rt, id), basedOn: before.revision });
    expect(rt.currentView(id)).toEqual(before); // not yet committed
    const out = await pending;
    expect(rt.currentView(id).revision).toBe(before.revision + 1);
    expect(canonicalJson(rt.currentView(id).view)).toBe(canonicalJson(out.view));
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    await db.close();
  });

  it('a failed commit leaves the visible checkpoint where it was and recovers from the database', async () => {
    let fail = false;
    const { db, rt } = await setup(tmp.file, fakeClock(), { failBefore: (sql) => fail && sql.includes('INTO learning_events') });
    const id = await started(rt);
    const before = rt.currentView(id);
    const answer = solve(rt, id);
    fail = true;
    await expect(rt.submit(id, { commandId: 'a1', value: answer })).rejects.toThrow(/Injected fault/);
    fail = false;
    expect(() => rt.check(id, { mode: 'value', value: answer })).toThrow(/not active/);
    expect((await rt.activate(id)).view).toEqual(before.view);
    const retried = await rt.submit(id, { commandId: 'a1', value: answer });
    expect(of(retried.intents, 'RESPONSE_RESULT')[0]?.correct).toBe(true);
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    await db.close();
  });

  it('resume after a restart reloads the same item from persistence', async () => {
    const clock = fakeClock();
    const a = await setup(tmp.file, clock);
    const id = await started(a.rt);
    await a.rt.submit(id, { commandId: 'wrong', value: solve(a.rt, id) === 1 ? 2 : 1 });
    const before = a.rt.currentView(id);
    await a.db.close();
    const b = await setup(tmp.file, clock);
    expect(() => b.rt.currentView(id)).toThrow(/not active/);
    const reloaded = await b.rt.activate(id);
    expect(canonicalJson(reloaded)).toBe(canonicalJson(before));
    expect(b.db.statements.some((s) => s.includes('FROM mission_instances'))).toBe(true);
    await b.db.close();
  });

  it('optimistic double taps cannot create duplicate attempts', async () => {
    const { db, rt } = await setup(tmp.file);
    const id = await started(rt);
    const { revision } = rt.currentView(id);
    const answer = solve(rt, id);
    // Same command delivered twice, and a second command racing the first from the same tap.
    const [one, same, racing] = await Promise.all([
      rt.submit(id, { commandId: 'tap-1', value: answer, basedOn: revision }),
      rt.submit(id, { commandId: 'tap-1', value: answer, basedOn: revision }),
      rt.submit(id, { commandId: 'tap-2', value: answer, basedOn: revision }),
    ]);
    expect(one.duplicate).toBe(false);
    expect(same.duplicate).toBe(true);
    expect(racing.intents).toEqual([{ type: 'RESPONSE_REJECTED', reason: 'stale' }]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    await db.close();
  });
});

describe('unlocks', () => {
  it('are granted once on first completion, and replays cannot farm them', async () => {
    const tmp = tempDir();
    const { db, rt } = await setup(tmp.file);
    const granted: string[] = [];
    for (let run = 1; run <= 3; run++) {
      const id = await started(rt, `run-${run}`);
      for (let n = 0; n < 40; n++) {
        const { view, revision } = rt.currentView(id);
        if (view.status === 'completed') break;
        const out = view.narrative
          ? await rt.acknowledge(id, { commandId: `k${n}`, basedOn: revision })
          : await rt.submit(id, { commandId: `k${n}`, value: solve(rt, id), basedOn: revision });
        granted.push(...of(out.intents, 'UNLOCK_GRANTED').map((u) => u.unlockId));
      }
      expect(rt.currentView(id).view.status).toBe('completed');
    }
    expect(granted).toEqual(['test.core-badge']);
    expect((await rt.unlocks('learner-a')).map((u) => u.unlockId)).toEqual(['test.core-badge']);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(1);
    await db.close();
    tmp.cleanup();
  });
});

describe('learner settings', () => {
  it('persist per learner across a restart and never touch learning data', async () => {
    const tmp = tempDir();
    const clock = fakeClock();
    const a = await setup(tmp.file, clock);
    await a.rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
    await a.rt.putSetting('learner-a', 'motion', 'reduced');
    await a.rt.putSetting('learner-a', 'output', 'quiet');
    await a.rt.putSetting('learner-a', 'output', 'muted');
    await a.db.close();
    const b = await setup(tmp.file, clock);
    expect(await b.rt.settings('learner-a')).toEqual({ motion: 'reduced', output: 'muted' });
    expect(await count(b.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(0);
    await b.db.close();
    tmp.cleanup();
  });
});
