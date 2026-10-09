// The browser persistence adapter (sql.js, image saved after every commit) under the real game
// runtime. The store here is memory; in the browser it is IndexedDB. "Reload" = a new database
// and runtime opened from the saved image, exactly what a page reload does.
import { memoryByteStore } from '../persistence/sqljsDatabase';
import { openSqlJsTestDatabase } from '../persistence/testing/sqljsNode';
import { canonicalJson } from '../engine';
import { openGameRuntime, type GameRuntime } from './gameRuntime';
import { CORE_CONTENT, count, fakeClock, rightAnswer } from './testing/harness';

const MISSION = 'positions-and-capacity';

async function open(store: ReturnType<typeof memoryByteStore>, clock = fakeClock()) {
  const db = await openSqlJsTestDatabase(store);
  const rt = await openGameRuntime(db, CORE_CONTENT, clock);
  return { db, rt, clock };
}

function solve(rt: GameRuntime, id: string): number {
  const a = rt.currentView(id).view.activity!.answer;
  if (a.mode !== 'value') throw new Error('expected value mode');
  for (let v = a.min; v <= a.max; v++) {
    const c = rt.check(id, { mode: 'value', value: v });
    if (c.ok && c.evaluation.correct) return v;
  }
  throw new Error('unsolvable');
}

async function playToEnd(rt: GameRuntime, id: string) {
  let { revision } = await rt.activate(id);
  for (let n = 0; n < 60; n++) {
    const { view } = rt.currentView(id);
    if (view.status === 'completed') return;
    const out = view.narrative ? await rt.acknowledge(id, { commandId: `${id}-${n}`, basedOn: revision }) : await rt.submit(id, { commandId: `${id}-${n}`, ...rightAnswer(rt, id), basedOn: revision });
    revision = out.revision;
  }
  throw new Error('did not finish');
}

describe('browser persistence (sql.js + saved image)', () => {
  it('saves after every commit and resumes the same mission after a reload', async () => {
    const store = memoryByteStore();
    const clock = fakeClock();
    const a = await open(store, clock);
    await a.rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
    await a.rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'w1' });
    let { revision } = await a.rt.activate('w1');
    revision = (await a.rt.acknowledge('w1', { commandId: 'ack', basedOn: revision })).revision;
    const right = solve(a.rt, 'w1');
    await a.rt.submit('w1', { commandId: 'miss', value: right === 20 ? 19 : right + 1, basedOn: revision });
    const before = a.rt.currentView('w1').view;
    expect(store.bytes()).not.toBeNull();
    // No close: a page reload just stops. Only what was saved survives.
    const b = await open(store, clock);
    expect(await b.rt.findActiveMission('learner-test-a', MISSION)).toBe('w1');
    const after = (await b.rt.activate('w1')).view;
    expect(after.activity!.itemSignature).toBe(before.activity!.itemSignature);
    expect(after.activity!.wrongTries).toBe(1);
  });

  it('keeps attempt history, unlocks, settings, and completion across a reload', async () => {
    const store = memoryByteStore();
    const clock = fakeClock();
    const a = await open(store, clock);
    await a.rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
    await a.rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'w1' });
    await playToEnd(a.rt, 'w1');
    await a.rt.putSetting('learner-test-a', 'motion', 'reduced');
    const attempts = await count(a.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
    const stateBefore = await a.rt.learnerState('learner-test-a');

    const b = await open(store, clock);
    expect(await count(b.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(attempts);
    expect(await count(b.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'")).toBe(1);
    expect((await b.rt.unlocks('learner-test-a')).map((u) => u.unlockId)).toEqual(['test.core-badge']);
    expect(await b.rt.settings('learner-test-a')).toEqual({ motion: 'reduced' });
    expect((await b.rt.view('w1')).status).toBe('completed');
    expect(await b.rt.learnerState('learner-test-a')).toEqual(stateBefore);
  });

  it('keeps learners isolated', async () => {
    const store = memoryByteStore();
    const { rt } = await open(store);
    for (const id of ['learner-test-a', 'learner-test-b']) await rt.createLearner({ id, themePack: 'elevator-quest' });
    await rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'a1' });
    await playToEnd(rt, 'a1');
    await rt.putSetting('learner-test-b', 'output', 'quiet');
    const b = await open(store);
    expect(await b.rt.unlocks('learner-test-b')).toEqual([]);
    expect(await b.rt.settings('learner-test-a')).toEqual({});
    expect(await b.rt.settings('learner-test-b')).toEqual({ output: 'quiet' });
    expect(await b.rt.findActiveMission('learner-test-b', MISSION)).toBeNull();
    await expect(b.rt.startMission({ learnerId: 'learner-test-b', missionId: MISSION, instanceId: 'a1' })).rejects.toThrow(/another learner/);
  });

  it('is idempotent: a repeated command id is a duplicate, before and after a reload', async () => {
    const store = memoryByteStore();
    const clock = fakeClock();
    const a = await open(store, clock);
    await a.rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
    await a.rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'w1' });
    await a.rt.activate('w1');
    await a.rt.acknowledge('w1', { commandId: 'ack' });
    const value = solve(a.rt, 'w1');
    const first = await a.rt.submit('w1', { commandId: 'tap-1', value });
    const again = await a.rt.submit('w1', { commandId: 'tap-1', value });
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    const b = await open(store, clock);
    await b.rt.activate('w1');
    expect((await b.rt.submit('w1', { commandId: 'tap-1', value })).duplicate).toBe(true);
    expect(await count(b.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
  });

  it('keeps append-only tables append-only', async () => {
    const { db } = await open(memoryByteStore());
    await db.run("INSERT INTO learners (id, theme_pack, created_at) VALUES ('l1', 't', 1)");
    await db.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('e1', 'l1', 'attempt', 'i1', 1, '{}')");
    await expect(db.run("UPDATE learning_events SET payload = 'x' WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    await expect(db.run("DELETE FROM learning_events WHERE id = 'e1'")).rejects.toThrow(/append-only/);
  });

  it('a failed save is not a commit: memory goes back to the last saved image', async () => {
    const store = memoryByteStore();
    const { db, rt } = await open(store);
    await rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
    store.failNextSave();
    await expect(rt.putSetting('learner-test-a', 'motion', 'reduced')).rejects.toThrow(/Injected save failure/);
    expect(await rt.settings('learner-test-a')).toEqual({});
    expect(await db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    await rt.putSetting('learner-test-a', 'motion', 'reduced');
    expect(await (await open(store)).rt.settings('learner-test-a')).toEqual({ motion: 'reduced' });
  });

  it('a rolled-back transaction leaves nothing behind', async () => {
    const store = memoryByteStore();
    const { db } = await open(store);
    const saved = store.bytes();
    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO learners (id, theme_pack, created_at) VALUES ('l2', 't', 1)");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.get("SELECT id FROM learners WHERE id = 'l2'")).toBeNull();
    expect(store.bytes()).toBe(saved);
  });

  describe('saves: every change is saved before it resolves', () => {
    const counting = (inner = memoryByteStore()) => {
      let saves = 0;
      const store = { ...inner, save: async (b: Uint8Array) => { await inner.save(b); saves += 1; } };
      return { store, inner, saves: () => saves };
    };

    it('saves each change before resolving, and a reload shows everything', async () => {
      const c = counting();
      const db = await openSqlJsTestDatabase(c.store);
      const rt = await openGameRuntime(db, CORE_CONTENT, fakeClock());
      await rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
      let n = c.saves();
      const expectSaved = async (what: string, act: () => Promise<unknown>, saved: boolean) => {
        await act();
        expect([what, c.saves() - n]).toEqual([what, saved ? 1 : 0]);
        n = c.saves();
      };
      await expectSaved('a preference', () => rt.putSetting('learner-test-a', 'motion', 'reduced'), true);
      await expectSaved('a game save', () => rt.putSetting('learner-test-a', 'eq.mg.word-golf.save', '{"ball":1}'), true);
      await expectSaved('a changed game save', () => rt.putSetting('learner-test-a', 'eq.mg.word-golf.save', '{"ball":2}'), true);
      await expectSaved('the host record', () => rt.putSetting('learner-test-a', 'eq.mg.host', '{"game":"word-golf"}'), true);
      await expectSaved('clearing it', () => rt.putSetting('learner-test-a', 'eq.mg.host', ''), true);
      await expectSaved('a new world memory', () => rt.remember('learner-test-a', 'eq.discovery.floor-1'), true);
      await expectSaved('a new learner (Start Over)', () => rt.createLearner({ id: 'learner-test-a-r2', themePack: 'elevator-quest' }), true);
      await expectSaved('a mission start', () => rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'w1' }), true);
      let { revision } = await rt.activate('w1');
      await expectSaved('a story step', async () => (revision = (await rt.acknowledge('w1', { commandId: 'ack', basedOn: revision })).revision), true);
      await expectSaved('an answer', async () => (revision = (await rt.submit('w1', { commandId: 'a1', value: solve(rt, 'w1'), basedOn: revision })).revision), true);
      await expectSaved('the same answer again (a duplicate)', () => rt.submit('w1', { commandId: 'a1', value: 0 }), false);
      await expectSaved('an abandon', () => rt.abandonMission('w1', { commandId: 'abandon' }), true);
      const b = await openGameRuntime(await openSqlJsTestDatabase(c.inner), CORE_CONTENT, fakeClock());
      expect(await b.settings('learner-test-a')).toEqual({ motion: 'reduced', 'eq.mg.word-golf.save': '{"ball":2}', 'eq.mg.host': '' });
      expect(await b.memories('learner-test-a')).toEqual(['eq.discovery.floor-1']);
      expect(await b.getLearner('learner-test-a-r2')).not.toBeNull();
      expect((await b.view('w1')).status).toBe('abandoned');
      expect(canonicalJson(await b.learnerState('learner-test-a'))).toBe(canonicalJson(await rt.learnerState('learner-test-a')));
    });

    it('a schema statement is always saved, though it changes no row', async () => {
      const c = counting();
      const db = await openSqlJsTestDatabase(c.store);
      const n = c.saves();
      await db.exec('CREATE TABLE scratch_m91 (x INTEGER)');
      expect(c.saves()).toBe(n + 1);
      const reloaded = await openSqlJsTestDatabase(c.inner);
      expect(await reloaded.get("SELECT name FROM sqlite_master WHERE name = 'scratch_m91'")).toEqual({ name: 'scratch_m91' });
    });

    it('every kind of change that fails to save rejects and leaves no trace after a reload', async () => {
      const store = memoryByteStore();
      const clock = fakeClock();
      const a = await open(store, clock);
      await a.rt.createLearner({ id: 'learner-test-a', themePack: 'elevator-quest' });
      await a.rt.startMission({ learnerId: 'learner-test-a', missionId: MISSION, instanceId: 'w1' });
      let { revision } = await a.rt.activate('w1');
      revision = (await a.rt.acknowledge('w1', { commandId: 'ack', basedOn: revision })).revision;
      const attempts = async (rt: GameRuntime) => (await rt.replayFromHistory('learner-test-a')).state;
      const before = canonicalJson(await attempts(a.rt));
      const failing: [string, () => Promise<unknown>][] = [
        ['a game save', () => a.rt.putSetting('learner-test-a', 'eq.mg.cargo-commander.save', '{"crates":[1]}')],
        ['the host record', () => a.rt.putSetting('learner-test-a', 'eq.mg.host', '{"game":"cargo-commander"}')],
        ['a world memory', () => a.rt.remember('learner-test-a', 'eq.discovery.floor-4')],
        ['Start Over', () => a.rt.createLearner({ id: 'learner-test-a-r2', themePack: 'elevator-quest' })],
        ['an answer', () => a.rt.submit('w1', { commandId: 'a1', value: solve(a.rt, 'w1'), basedOn: revision })],
      ];
      for (const [, act] of failing) {
        store.failNextSave();
        await expect(act()).rejects.toThrow(/Injected save failure/);
      }
      const b = await open(store, clock);
      expect(await b.rt.settings('learner-test-a')).toEqual({});
      expect(await b.rt.memories('learner-test-a')).toEqual([]);
      expect(await b.rt.getLearner('learner-test-a-r2')).toBeNull();
      expect(canonicalJson(await attempts(b.rt))).toBe(before);
      expect((await b.rt.activate('w1')).revision).toBe(revision);
    });
  });
});

