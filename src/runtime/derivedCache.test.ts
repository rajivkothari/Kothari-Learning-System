// The derived cache is a speed-up, never a source of truth. Whatever happens to it
// (deleted, stale, from an older policy, corrupted), the runtime must arrive at the
// state a full replay of learning_events produces.
import { canonicalJson } from '../engine';
import { putCache, getCache } from '../persistence/store';
import { cacheKeyFor } from './gameRuntime';
import { CONTENT, correctOption, count, fakeClock, finish, open, tempDir, type Opened } from './testing/harness';

const LEARNER = 'learner-a';

async function playSome(o: Opened, instanceId: string, answers: number) {
  await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId });
  await o.rt.acknowledge(instanceId, { commandId: `${instanceId}-ack` });
  for (let n = 0; n < answers; n++) await o.rt.submit(instanceId, { commandId: `${instanceId}-${n}`, optionId: await correctOption(o.rt, instanceId) });
}

async function expectMatchesReplay(o: Opened) {
  const replay = await o.rt.replayFromHistory(LEARNER);
  expect(canonicalJson(await o.rt.learnerState(LEARNER))).toBe(canonicalJson(replay.state));
  return replay;
}

describe('derived cache', () => {
  let tmp: ReturnType<typeof tempDir>;
  let clock: ReturnType<typeof fakeClock>;
  let o: Opened;

  beforeEach(async () => {
    tmp = tempDir();
    clock = fakeClock();
    o = await open(tmp.file, clock);
    await o.rt.createLearner({ id: LEARNER, themePack: 'theme.quantity' });
  });
  afterEach(async () => {
    await o.db.close();
    tmp.cleanup();
  });

  const reopen = async (content = CONTENT) => {
    await o.db.close();
    o = await open(tmp.file, clock, undefined, content);
  };

  it('is written with every command and equals a full replay', async () => {
    await playSome(o, 'm1', 3);
    const replay = await expectMatchesReplay(o);
    const row = (await getCache(o.db, LEARNER))!;
    expect(row.cacheKey).toBe(cacheKeyFor(CONTENT));
    expect(row.throughSeq).toBe(await count(o.db, 'SELECT MAX(seq) AS n FROM learning_events'));
    expect(canonicalJson(JSON.parse(row.state))).toBe(canonicalJson(replay.exported));
  });

  it('rebuilds after deletion', async () => {
    await playSome(o, 'm1', 3);
    await o.db.run('DELETE FROM derived_cache');
    await reopen();
    await expectMatchesReplay(o);
    await o.rt.submit('m1', { commandId: 'after-delete', optionId: await correctOption(o.rt, 'm1') });
    expect(await getCache(o.db, LEARNER)).not.toBeNull();
    await expectMatchesReplay(o);
  });

  it('catches up from a stale snapshot by applying only the tail', async () => {
    await playSome(o, 'm1', 1);
    const stale = (await getCache(o.db, LEARNER))!;
    await finish(o.rt, 'm1', 'rest');
    // Put the older snapshot back, as if the last cache writes were lost.
    await o.db.transaction((tx) => putCache(tx, LEARNER, stale, 1));
    await reopen();
    await expectMatchesReplay(o);
  });

  it('is ignored when the policy changes, and rebuilt under the new key', async () => {
    await playSome(o, 'm1', 3);
    const stricter = { ...CONTENT, policy: { ...CONTENT.policy, id: 'policy-under-test', proficient: { ...CONTENT.policy.proficient, minSuccesses: 99 } } };
    expect(cacheKeyFor(stricter)).not.toBe(cacheKeyFor(CONTENT));
    await reopen(stricter);
    const replay = await expectMatchesReplay(o);
    expect(replay.state.policyId).toBe('policy-under-test');
    await o.rt.submit('m1', { commandId: 'under-new-policy', optionId: await correctOption(o.rt, 'm1') });
    expect((await getCache(o.db, LEARNER))!.cacheKey).toBe(cacheKeyFor(stricter));
  });

  it('survives a corrupted snapshot', async () => {
    await playSome(o, 'm1', 2);
    await o.db.run("UPDATE derived_cache SET state = '{not json'");
    await reopen();
    await expectMatchesReplay(o);
  });

  it('rebuildCache produces the same snapshot the incremental path wrote', async () => {
    await playSome(o, 'm1', 3);
    const incremental = (await getCache(o.db, LEARNER))!.state;
    await o.rt.rebuildCache(LEARNER);
    expect(canonicalJson(JSON.parse((await getCache(o.db, LEARNER))!.state))).toBe(canonicalJson(JSON.parse(incremental)));
  });
});

describe('routine practice', () => {
  it('feeds evidence and in-game signals, but repeats never re-announce an accomplishment', async () => {
    const tmp = tempDir();
    const o = await open(tmp.file, fakeClock());
    await o.rt.createLearner({ id: LEARNER, themePack: 'theme.quantity' });

    const firstTimes: boolean[] = [];
    const announced: string[] = [];
    for (let run = 1; run <= 4; run++) {
      const id = `run-${run}`;
      const intents = [...(await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: id })).intents, ...(await finish(o.rt, id, id))];
      for (const i of intents) {
        if (i.type === 'GAME_PROGRESS' && i.signal.kind === 'missionComplete') firstTimes.push(i.signal.firstTime);
        if (i.type === 'PROGRESSION_UPGRADE') announced.push(`${i.upgrade.key}->${i.upgrade.toTier}`);
      }
      // Every run still produces practice signals and learning evidence.
      expect(intents.some((i) => i.type === 'GAME_PROGRESS' && i.signal.kind === 'practiceCredit')).toBe(true);
    }

    expect(firstTimes).toEqual([true, false, false, false]);
    expect(announced.filter((a) => a.startsWith('mission:positions-and-loads'))).toEqual(['mission:positions-and-loads->normal']);
    expect(new Set(announced).size).toBe(announced.length);
    // Each opportunity key is announced at most once per tier, and lifetime value is bounded by the keys.
    const rows = await o.db.all<{ opportunity_key: string; to_tier: string }>('SELECT opportunity_key, to_tier FROM progression_events');
    expect(rows.length).toBe(announced.length);
    expect(await count(o.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBeGreaterThanOrEqual(4 * 6);

    await o.db.close();
    tmp.cleanup();
  });
});
