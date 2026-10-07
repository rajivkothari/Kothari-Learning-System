// Several learners on one device: everything durable is scoped to the learner id the caller
// supplies. Nothing one learner does shows up in another learner's game or record.
import type { GameRuntime } from './gameRuntime';
import { CORE_CONTENT, count, fakeClock, open, tempDir } from './testing/harness';

const MISSION = 'positions-and-capacity';

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
    const out = view.narrative ? await rt.acknowledge(id, { commandId: `${id}-${n}`, basedOn: revision }) : await rt.submit(id, { commandId: `${id}-${n}`, value: solve(rt, id), basedOn: revision });
    revision = out.revision;
  }
  throw new Error('did not finish');
}

describe('learner isolation', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('keeps mission progress, unlocks, settings, and evidence per learner', async () => {
    const { db, rt } = await open(tmp.file, fakeClock(), undefined, CORE_CONTENT);
    await rt.createLearner({ id: 'learner-a', themePack: 'elevator-quest' });
    await rt.createLearner({ id: 'learner-b', themePack: 'elevator-quest' });
    await rt.startMission({ learnerId: 'learner-a', missionId: MISSION, instanceId: 'a-1' });
    await rt.startMission({ learnerId: 'learner-b', missionId: MISSION, instanceId: 'b-1' });

    await playToEnd(rt, 'a-1');
    // B misses the first job once, works through the correction, then solves the fresh job; the second job is left open.
    let { revision } = await rt.activate('b-1');
    revision = (await rt.acknowledge('b-1', { commandId: 'b-ack', basedOn: revision })).revision;
    const right = solve(rt, 'b-1');
    revision = (await rt.submit('b-1', { commandId: 'b-miss', value: right === 20 ? 19 : right + 1, basedOn: revision })).revision;
    const correction = rt.currentView('b-1').view.activity!.rescue!;
    revision = (await rt.rescueAnswer('b-1', { commandId: 'b-correct', value: correction.example.answer, basedOn: revision })).revision;
    revision = (await rt.submit('b-1', { commandId: 'b-solve', value: solve(rt, 'b-1'), basedOn: revision })).revision;
    const nextRight = solve(rt, 'b-1');
    await rt.submit('b-1', { commandId: 'b-miss-2', value: nextRight === 20 ? 19 : nextRight + 1, basedOn: revision });
    await rt.putSetting('learner-a', 'motion', 'reduced');

    // Mission progress
    expect(await rt.findActiveMission('learner-a', MISSION)).toBeNull();
    expect(await rt.findActiveMission('learner-b', MISSION)).toBe('b-1');
    expect(rt.currentView('b-1').view.activity!.wrongTries).toBe(1);
    // Unlocks
    expect((await rt.unlocks('learner-a')).map((u) => u.unlockId)).toEqual(['test.core-badge']);
    expect(await rt.unlocks('learner-b')).toEqual([]);
    // Settings
    expect(await rt.settings('learner-a')).toEqual({ motion: 'reduced' });
    expect(await rt.settings('learner-b')).toEqual({});
    // Evidence
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = 'learner-b' AND type = 'attempt'")).toBe(2); // the corrected job (missed) and the fresh one
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = 'learner-b' AND type = 'completion'")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = 'learner-a' AND type = 'attempt'")).toBeGreaterThan(1);
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = 'learner-b' AND payload LIKE '%learner-a%'")).toBe(0);
    const b = await rt.learnerState('learner-b');
    const a = await rt.learnerState('learner-a');
    expect(b).not.toEqual(a);
    expect(await rt.progressionEvents('learner-b')).toEqual([]);
    // A full replay of B's history sees only B.
    const replayB = await rt.replayFromHistory('learner-b');
    expect(replayB.state).toEqual(b);
  });

  it('a mission instance belongs to one learner', async () => {
    const { rt } = await open(tmp.file, fakeClock(), undefined, CORE_CONTENT);
    await rt.createLearner({ id: 'learner-a', themePack: 'elevator-quest' });
    await rt.createLearner({ id: 'learner-b', themePack: 'elevator-quest' });
    await rt.startMission({ learnerId: 'learner-a', missionId: MISSION, instanceId: 'shared-id' });
    await expect(rt.startMission({ learnerId: 'learner-b', missionId: MISSION, instanceId: 'shared-id' })).rejects.toThrow(/another learner/);
    expect(await rt.findActiveMission('learner-b', MISSION)).toBeNull();
  });

  it('survives a restart with both learners intact', async () => {
    const clock = fakeClock();
    const first = await open(tmp.file, clock, undefined, CORE_CONTENT);
    await first.rt.createLearner({ id: 'learner-a', themePack: 'elevator-quest' });
    await first.rt.createLearner({ id: 'learner-b', themePack: 'elevator-quest' });
    await first.rt.startMission({ learnerId: 'learner-a', missionId: MISSION, instanceId: 'a-1' });
    await playToEnd(first.rt, 'a-1');
    await first.rt.putSetting('learner-b', 'output', 'quiet');
    first.rt.dropMemory();

    const again = await open(tmp.file, clock, undefined, CORE_CONTENT);
    expect((await again.rt.unlocks('learner-a')).length).toBe(1);
    expect(await again.rt.unlocks('learner-b')).toEqual([]);
    expect(await again.rt.settings('learner-a')).toEqual({});
    expect(await again.rt.settings('learner-b')).toEqual({ output: 'quiet' });
  });
});
