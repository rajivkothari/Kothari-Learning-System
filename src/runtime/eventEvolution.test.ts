// A history row this app cannot read (written by a newer app) is refused with a typed error.
// Nothing is rewritten or dropped, other learners keep working, and the row reads again once the
// app understands it.
import { LearningEventVersionError } from '../engine';
import { openNodeDatabase } from '../persistence/testing/nodeDatabase';
import { openGameRuntime } from './gameRuntime';
import { CORE_CONTENT, fakeClock, tempDir } from './testing/harness';

describe('stored learning events from another app version', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('a newer payload is refused recoverably and left exactly as stored', async () => {
    const db = openNodeDatabase(tmp.file);
    const rt = await openGameRuntime(db, CORE_CONTENT, fakeClock());
    for (const id of ['learner-a', 'learner-b']) await rt.createLearner({ id, themePack: 'theme.any' });
    const future = JSON.stringify({ schemaVersion: 2, id: 'completion:mission:x', learnerId: 'learner-a', kind: 'mission', instanceId: 'x', targetId: 'm', outcome: 'completed', occurredAt: 5, somethingNew: true });
    await db.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('completion:mission:x', 'learner-a', 'completion', 'x', 5, ?)", [future]);

    await expect(rt.learnerState('learner-a')).rejects.toThrow(LearningEventVersionError);
    await expect(rt.learnerState('learner-a')).rejects.toThrow(/Learning event \d+: completion payload is version 2/);
    expect(await db.get('SELECT payload FROM learning_events WHERE id = ?', ['completion:mission:x'])).toEqual({ payload: future });
    expect((await rt.learnerState('learner-b')).skills).toBeDefined(); // others are unaffected
    await db.close();
  });
});
