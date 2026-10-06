// Success replay in the real director: shown only after a correct answer, honest about what was
// observed, never recorded, and never a way for a tap to answer the next job.
import { count } from '../../../runtime/testing/harness';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;
const events = (s: Session) => count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

/** Answer the visible move job correctly and stop at the success stage. */
async function correctToSuccess(s: Session, via: 'panel' | 'shaft' = 'panel') {
  s.director.pressFloor(solve(s), via);
  expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
}

describe('success replay', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('follows a correct answer with one suggested way, in the shaft map, and then clears', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const move = s.view().task!.move!;
    await correctToSuccess(s);
    const r = s.view().replay!;
    expect(r).toMatchObject({ representation: 'numberLine', evidenceBasis: 'suggested', intensity: 'routine', observed: [] });
    expect(r.steps[0]).toBe(r.strategy === 'distance' ? solve(s) : move.start);
    expect(s.view().lifty.line).toContain(r.text);
    expect(r.text).not.toMatch(/\byou\b/i); // a suggestion is never attributed to the learner
    expect(r.revealed).toBe(1); // the steps appear one at a time
    await s.time.runUntil(() => s.view().replay?.revealed === r.steps.length);
    expect(s.view().replay?.revealed).toBe(r.steps.length);
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect(s.view().replay).toBeNull();
  });

  it('never appears after a wrong answer', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    const before = answers(s);
    s.director.pressFloor(right >= 19 ? right - 2 : right + 2);
    let seen = false;
    const stop = s.director.subscribe((v) => (seen ||= v.replay !== null));
    await s.time.runUntil(() => answers(s) > before && settled(s)() && s.view().task?.wrongTries === 1);
    stop();
    expect(seen).toBe(false);
  });

  it('says "you" only for what it saw: an answer chosen on the shaft map', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    while (s.view().task?.kind !== 'shaft') await answerCorrectly(s);
    await correctToSuccess(s, 'shaft');
    expect(s.view().replay).toMatchObject({ strategy: 'numberLine', evidenceBasis: 'observed', observed: ['usedNumberLine'] });
    expect(s.view().replay!.text).toMatch(/^You found it on the shaft map/);
  });

  it('a panel answer on a shaft job is not claimed as a shaft-map strategy', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    while (s.view().task?.kind !== 'shaft') await answerCorrectly(s);
    await correctToSuccess(s, 'panel');
    expect(s.view().replay!.evidenceBasis).toBe('suggested');
    expect(s.view().replay!.observed).not.toContain('usedNumberLine');
  });

  it('stretch and mastery jobs get stronger replays; cargo shows the observed sum', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const seen = new Map<string, string>();
    const stop = s.director.subscribe((v) => {
      if (v.replay) seen.set(v.replay.intensity, v.replay.strategy);
      if (v.replay?.strategy === 'partWhole') seen.set('cargo', `${v.replay.evidenceBasis}:${v.replay.answerSummary}`);
    });
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    stop();
    expect(seen.get('routine')).toBeDefined();
    expect(seen.get('stretch')).toBe('referenceOffset');
    expect(seen.get('mastery')).toBeDefined();
    expect(seen.get('cargo')).toMatch(/^observed:\d+ \+ \d+ = \d+$/);
  });

  it('records nothing: no learning event, attempt or upgrade comes from a replay', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    await correctToSuccess(s);
    const atSuccess = { events: await events(s), progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events') };
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect({ events: await events(s), progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events') }).toEqual(atSuccess);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
  });

  it('taps during the replay never answer the next job', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    await correctToSuccess(s);
    const before = answers(s);
    for (let i = 0; i < 30 && s.view().stage === 'success'; i++) {
      s.director.pressFloor(1 + ((i * 7) % 20));
      await s.time.advance(60);
    }
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    await s.time.advance(10_000);
    expect(answers(s)).toBe(before);
    expect(s.view().task?.wrongTries).toBe(0);
    expect(s.view().elevator.lit).toEqual([]);
  });

  it('reduced motion shows the whole replay at once, and holds it briefly', async () => {
    const s = await openSession(tmp.file, virtualTime(), { motion: 'reduced' });
    await wake(s);
    await correctToSuccess(s);
    const r = s.view().replay!;
    expect(r.revealed).toBe(r.steps.length);
  });

  it('a crash during the replay resumes at the next job, with the one attempt it already had', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time, { instanceId: 'replay-crash' });
    await wake(s);
    await correctToSuccess(s);
    expect(s.view().replay).not.toBeNull();
    s.director.dispose();
    await s.db.close();
    s = await openSession(tmp.file, time, { instanceId: 'replay-crash' });
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect(s.view().replay).toBeNull();
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
  });
});
