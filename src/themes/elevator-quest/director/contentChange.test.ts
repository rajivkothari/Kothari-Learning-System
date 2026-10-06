// Audit P1: an app update can change content or a generator under an in-progress Floor 15. The
// stored item then no longer regenerates identically. The instance ends as "abandoned" (its
// evidence kept), and the learner gets a fresh instance instead of an error screen.
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { FLOOR15 } from '../content/floor15';
import { chooseFloor15Instance } from '../sessionCore';
import { CONTENT, LEARNER, answerCorrectly, openSession, settled, tempDir, virtualTime, type Session } from '../testing/headless';

const ID = 'content-change-1';

async function playOneItem(file: string) {
  const s = await openSession(file, virtualTime(), { instanceId: ID });
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
  await answerCorrectly(s);
  s.director.dispose();
  await s.db.close();
}

/** Simulate an update: rewrite the stored checkpoint as content that no longer matches it. */
async function tamper(file: string, change: (state: Record<string, unknown>) => void) {
  const db = openNodeDatabase(file);
  const row = await db.get<{ state: string }>('SELECT state FROM mission_instances WHERE id = ?', [ID]);
  const state = JSON.parse(row!.state) as Record<string, unknown>;
  change(state);
  await db.run('UPDATE mission_instances SET state = ? WHERE id = ?', [JSON.stringify(state), ID]);
  await db.close();
}

async function events(s: Pick<Session, 'db'>) {
  return s.db.all<{ type: string; payload: string }>('SELECT type, payload FROM learning_events ORDER BY seq');
}

describe('content changed under an active Floor 15 (audit P1)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  const cases: [string, (state: Record<string, unknown>) => void][] = [
    ['a generator now gives a different item for the stored seed', (st) => void ((st.item as { signature: string }).signature = 'item-from-an-older-generator')],
    ['the stored mission version is no longer installed', (st) => void (st.missionVersion = 999)],
  ];

  for (const [name, change] of cases) {
    it(`${name}: abandoned with evidence kept, then a fresh instance`, async () => {
      await playOneItem(tmp.file);
      await tamper(tmp.file, change);

      const time = virtualTime();
      const db = openNodeDatabase(tmp.file);
      const rt = await openGameRuntime(db, CONTENT, time);
      const before = await events({ db });
      expect(before.filter((e) => e.type === 'attempt')).toHaveLength(1);
      expect((await rt.missionCompatibility(ID)).ok).toBe(false);

      const abandoned: string[] = [];
      expect(await chooseFloor15Instance(rt, LEARNER, FLOOR15.missionId, (id, reason) => abandoned.push(`${id}: ${reason}`))).toBeNull();
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]).toContain(ID);

      // Evidence: everything before is untouched; one "abandoned" completion record is added.
      const after = await events({ db });
      expect(after.slice(0, before.length)).toEqual(before);
      expect(after).toHaveLength(before.length + 1);
      expect(JSON.parse(after.at(-1)!.payload)).toMatchObject({ kind: 'mission', instanceId: ID, outcome: 'abandoned' });
      expect(await db.get('SELECT status FROM mission_instances WHERE id = ?', [ID])).toEqual({ status: 'abandoned' });
      expect(await rt.unlocks(LEARNER)).toEqual([]); // an abandoned mission is never a completion
      expect(await rt.latestMission(LEARNER, FLOOR15.missionId)).toEqual({ id: ID, status: 'abandoned' });

      // Retrying the same recovery changes nothing (stable command id, one completion record).
      const again = await rt.abandonMission(ID, { commandId: `abandon:${ID}` });
      expect(again.duplicate).toBe(true);
      expect(await events({ db })).toHaveLength(after.length);
      // An abandoned instance accepts no answers.
      await rt.activate(ID);
      const late = await rt.submit(ID, { commandId: 'late', value: 5 });
      expect(late.intents).toEqual([{ type: 'RESPONSE_REJECTED', reason: 'missionAbandoned' }]);
      await db.close();

      // The learner reopens Floor 15 and plays a fresh instance.
      const s = await openSession(tmp.file, virtualTime());
      expect(s.director.instanceId()).not.toBe(ID);
      s.director.pressDoorOpen();
      expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
      await answerCorrectly(s);
      expect((await events(s)).filter((e) => e.type === 'attempt')).toHaveLength(2);
      s.director.dispose();
      await s.db.close();
    });
  }

  it('an unchanged active instance is resumed, never abandoned', async () => {
    await playOneItem(tmp.file);
    const db = openNodeDatabase(tmp.file);
    const rt = await openGameRuntime(db, CONTENT, virtualTime());
    expect(await rt.missionCompatibility(ID)).toEqual({ ok: true });
    expect(await chooseFloor15Instance(rt, LEARNER, FLOOR15.missionId, () => {
      throw new Error('abandoned a compatible instance');
    })).toBe(ID);
    expect((await events({ db })).some((e) => e.type === 'completion' && JSON.parse(e.payload).outcome === 'abandoned')).toBe(false);
    await db.close();
  });
});
