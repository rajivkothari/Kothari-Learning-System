// World memory: what the world remembers that is not learning (places inspected, tips shown).
// Once per learner and key, durable, and invisible to the learning model.
import { canonicalJson } from '../engine';
import { CORE_CONTENT, count, fakeClock, open, tempDir } from './testing/harness';

describe('world memory', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('remembers a key once per learner, survives a restart, and keeps learners apart', async () => {
    const clock = fakeClock();
    let o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    for (const id of ['learner-a', 'learner-b']) await o.rt.createLearner({ id, themePack: 'theme.any' });
    expect(await o.rt.remember('learner-a', 'x.discovery.one')).toBe(true);
    expect(await o.rt.remember('learner-a', 'x.discovery.one')).toBe(false); // a repeat writes nothing
    expect(await o.rt.remember('learner-a', 'x.tip.two')).toBe(true);
    expect(await o.rt.memories('learner-a')).toEqual(['x.discovery.one', 'x.tip.two']);
    expect(await o.rt.memories('learner-b')).toEqual([]);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM world_memory')).toBe(2);
    await o.db.close();
    o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    expect(await o.rt.memories('learner-a')).toEqual(['x.discovery.one', 'x.tip.two']);
    expect(await o.rt.remember('learner-b', 'x.discovery.one')).toBe(true);
    await o.db.close();
  });

  it('is never learning: no event, no upgrade, no unlock, and the learner state is unchanged', async () => {
    const o = await open(tmp.file, fakeClock(), undefined, CORE_CONTENT);
    await o.rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
    const before = canonicalJson(await o.rt.learnerState('learner-a'));
    for (let i = 0; i < 5; i++) await o.rt.remember('learner-a', `x.discovery.${i % 2}`);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(0);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM progression_events')).toBe(0);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(0);
    expect(canonicalJson(await o.rt.learnerState('learner-a'))).toBe(before);
    expect(canonicalJson((await o.rt.replayFromHistory('learner-a')).state)).toBe(before);
    await o.db.close();
  });

  it('a crash while remembering leaves nothing, and the retry records it once', async () => {
    const clock = fakeClock();
    let armed = true;
    let o = await open(tmp.file, clock, { failBefore: (sql) => armed && sql.includes('INTO world_memory') }, CORE_CONTENT);
    await o.rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
    await expect(o.rt.remember('learner-a', 'x.discovery.one')).rejects.toThrow(/Injected fault/);
    armed = false;
    await o.db.close();
    o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    expect(await o.rt.memories('learner-a')).toEqual([]);
    expect(await o.rt.remember('learner-a', 'x.discovery.one')).toBe(true);
    expect(await o.rt.remember('learner-a', 'x.discovery.one')).toBe(false);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM world_memory')).toBe(1);
    await o.db.close();
  });

  it('refuses unknown learners and empty keys', async () => {
    const o = await open(tmp.file, fakeClock(), undefined, CORE_CONTENT);
    await expect(o.rt.remember('nobody', 'x.k')).rejects.toThrow(/FOREIGN KEY/);
    await o.rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
    await expect(o.rt.remember('learner-a', '')).rejects.toThrow(/Invalid memory key/);
    await o.db.close();
  });
});
