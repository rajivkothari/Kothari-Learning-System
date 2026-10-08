import { loadLearningEvents } from '../../../persistence/store';
import { CONTENT, answerCorrectly, answerWith, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
}

async function reach(s: Session, step: string) {
  for (let k = 0; k < 20 && s.view().task?.stepId !== step; k++) await answerCorrectly(s);
  expect(s.view().task?.stepId).toBe(step);
}

async function correct(s: Session) {
  s.director.beginRescue();
  for (let k = 0; k < 40 && s.view().rescue?.phase === 'counting'; k++) {
    const r = s.view().rescue!;
    s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * (r.counted.length + 1));
  }
  const r = s.view().rescue!;
  s.director.rescueTap(r.asks === 'cell' ? r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * r.steps : r.kind === 'fill' ? r.countFrom + r.steps : r.steps);
  expect(await s.time.runUntil(() => s.view().stage === 'cargo' && settled(s)())).toBe(true);
}

async function finish(s: Session) {
  await wake(s);
  for (let k = 0; k < 20 && s.view().stage !== 'finale'; k++) await answerCorrectly(s);
  expect(s.view().stage).toBe('finale');
  s.director.pressFloor(15);
  expect(await s.time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
}

describe('audit: durable state and scene ownership', () => {
  let tmp: ReturnType<typeof tempDir>;
  let s: Session;
  beforeEach(() => { tmp = tempDir(); });
  afterEach(async () => {
    if (s) { await s.director.idle(); s.director.dispose(); await s.db.close(); }
    tmp.cleanup();
  });

  it('regenerated cargo shows the new givens before another answer can be submitted', async () => {
    s = await openSession(tmp.file, virtualTime(), { instanceId: 'cargo-regeneration' });
    await wake(s);
    await reach(s, 'two-groups');
    answerWith(s, 1);
    expect(await s.time.runUntil(() => s.view().rescueReady)).toBe(true);
    await correct(s);
    const first = s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature;
    const threshold = CONTENT.pack.scaffoldingPolicies.find((p) => p.id === 'loads.counted')!.regenerateAfterWrongTries!;
    for (let k = 0; k < threshold; k++) {
      answerWith(s, 1);
      await s.director.idle();
      await s.time.advance(2000);
    }
    const now = s.rt.currentView(s.director.instanceId()).view.activity!;
    expect(now.itemSignature).not.toBe(first);
    expect(s.view()).toMatchObject({ stage: 'cargo', task: { wrongTries: 0, cargo: { loaded: 0, orders: [now.prompt.first, now.prompt.second] } } });
    await answerCorrectly(s);
    const attempts = (await loadLearningEvents(s.db, 'learner-a')).filter((e) => e.event.type === 'attempt').map((e) => e.event.type === 'attempt' ? e.event.attempt : null);
    expect(attempts.at(-1)).toMatchObject({ outcome: 'correct', itemSignature: now.itemSignature });
  });

  it('disposing during success cancels delayed scene changes and sound', async () => {
    s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await wake(s);
    answerWith(s, solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    s.director.dispose();
    const view = s.view();
    const sounds = s.audio.length;
    await s.time.advance(60_000);
    expect(s.view()).toBe(view);
    expect(s.audio).toHaveLength(sounds);
  });

  it('failed discovery saves are not shown as durable and can be retried', async () => {
    const fault = { memory: false };
    s = await openSession(tmp.file, virtualTime(), { faults: { failBefore: (sql) => fault.memory && sql.includes('INTO world_memory') } });
    await finish(s);
    fault.memory = true;
    s.director.inspect('core');
    await s.director.idle();
    expect(s.view().discoveries).toEqual([]);
    expect(await s.rt.memories('learner-a')).not.toContain('eq.discovery.floor-15');
    fault.memory = false;
    await s.time.advance(2000);
    s.director.inspect('core');
    await s.director.idle();
    expect(s.view().discoveries).toEqual(['eq.discovery.floor-15']);
    expect(await s.rt.memories('learner-a')).toContain('eq.discovery.floor-15');
  });

  it('rapid replay requests start only one new mission', async () => {
    s = await openSession(tmp.file, virtualTime());
    await finish(s);
    const before = await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM mission_instances');
    await Promise.all([s.director.playAgain(), s.director.playAgain()]);
    const after = await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM mission_instances');
    expect(after!.n).toBe(before!.n + 1);
    expect(s.view()).toMatchObject({ stage: 'intro', saving: false });
  });

  it('replay during a free ride starts a stationary cabin and cannot inherit its arrival', async () => {
    s = await openSession(tmp.file, virtualTime());
    await finish(s);
    s.director.pressFloor(6);
    await s.time.advance(1500);
    await s.director.playAgain();
    expect(s.view()).toMatchObject({ stage: 'intro', elevator: { floor: 1, phase: 'idleClosed' } });
    await s.time.advance(60_000);
    expect(s.view()).toMatchObject({ stage: 'intro', elevator: { floor: 1, phase: 'idleClosed' } });
    await wake(s);
  });

  it('a failed replay save remains recoverable without changing the completed run', async () => {
    const fault = { replay: false };
    s = await openSession(tmp.file, virtualTime(), { faults: { failBefore: (sql) => fault.replay && sql.includes('INTO mission_instances') } });
    await finish(s);
    const completed = s.director.instanceId();
    fault.replay = true;
    await s.director.playAgain();
    expect(s.view()).toMatchObject({ stage: 'error', trouble: 'save' });
    expect(s.director.instanceId()).toBe(completed);
    fault.replay = false;
    await s.director.recover();
    expect(s.view().stage).toBe('freeRide');
    await s.director.playAgain();
    expect(s.view().stage).toBe('intro');
  });
});
