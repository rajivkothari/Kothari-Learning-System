// A load already judged is one miss, however often DOOR CLOSE is pressed on it. A scripted child
// playtest loaded 4 for 5 and pressed DOOR CLOSE twice (90, 250 and 600 ms apart): the item's misses
// went 0 to 2, and three double taps reached the fifth-miss test run. Cargo Commander never sends the
// same load twice; the lift's own cargo bay now has the same rule.
import { count } from '../../../runtime/testing/harness';
import { answerCorrectly, openSession, reachStep, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

const logged = (s: Session, kind: string) => s.log.entries().filter((e) => e.kind === kind);
const misses = (s: Session) => s.rt.currentView(s.director.instanceId()).view.activity!.wrongTries;
const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");

function load(s: Session, n: number) {
  for (let i = 0; i < 40 && s.view().task!.cargo!.loaded < n; i++) s.director.loadCrate();
  for (let i = 0; i < 40 && s.view().task!.cargo!.loaded > n; i++) s.director.unloadCrate();
  expect(s.view().task!.cargo!.loaded).toBe(n);
}
/** The loading dock of the capacity encounter: the cargo job where misses add up (no correction at the first one). */
async function toTheDock(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
  expect(await reachStep(s, 'capacity-encounter')).toBe(true);
  if (s.view().stage !== 'cargo') await answerCorrectly(s);
  expect(s.view()).toMatchObject({ stage: 'cargo', task: { stepId: 'capacity-encounter' } });
}
async function close(s: Session) {
  s.director.pressDoorClose();
  await s.time.runUntil(() => !s.view().saving);
  await s.director.idle();
}

describe('the cargo bay: the same load is never judged twice', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it.each([90, 250, 600])('DOOR CLOSE twice on the same wrong load, %i ms apart, is one miss; three double taps do not bring the test run', async (gap) => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'cargo-repeat' });
    await toTheDock(s);
    const right = solve(s);
    const wrong = right > 1 ? right - 1 : right + 1;
    load(s, wrong);
    await close(s);
    expect(misses(s)).toBe(1);
    const shown = { status: s.view().task!.cargo!.status, line: s.view().lifty.line };
    for (let i = 0; i < 6; i++) {
      await time.advance(gap);
      await close(s);
    }
    // One miss, one commit, and the bay still says what was wrong with this load.
    expect(misses(s)).toBe(1);
    expect(s.view().task!.wrongTries).toBe(1);
    expect(logged(s, 'commit')).toHaveLength(logged(s, 'answer').length);
    expect(logged(s, 'answer.repeat')).toHaveLength(6);
    expect(s.view()).toMatchObject({ stage: 'cargo', rescueReady: false, rescue: null, task: { cargo: { loaded: wrong, status: shown.status } }, lifty: { line: shown.line } });
    s.director.dispose();
    await s.db.close();
  });

  it('a different wrong load is a new miss, and so is going back to the first one after it (D222); the right load is one attempt with three misses on it', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'cargo-repeat' });
    await toTheDock(s);
    const before = await attempts(s);
    const right = solve(s);
    // Two wrong loads the dock can hold.
    const [a, b] = Array.from({ length: s.view().task!.cargo!.waiting }, (_, i) => i + 1).filter((n) => n !== right) as [number, number];
    load(s, a);
    await close(s);
    const first = { status: s.view().task!.cargo!.status, line: s.view().lifty.line };
    load(s, b);
    // Changing the load clears the judgement on screen: the bay is loading again.
    expect(s.view().task!.cargo!.status).toBe('loading');
    await close(s);
    expect(misses(s)).toBe(2);
    // Back to the first load after another: a new try (only the load just judged is not sent again).
    load(s, a);
    await close(s);
    expect(misses(s)).toBe(3);
    expect(s.view().task!.cargo).toMatchObject({ loaded: a, status: first.status });
    // Sent again at once, it is still the same miss.
    await close(s);
    expect(misses(s)).toBe(3);
    load(s, right);
    s.director.pressDoorClose();
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect(await attempts(s)).toBe(before + 1);
    const attempt = JSON.parse((await s.db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq DESC LIMIT 1"))!.payload) as { outcome: string; wrongTries: number };
    expect(attempt).toMatchObject({ outcome: 'correct', wrongTries: 3 });
    s.director.dispose();
    await s.db.close();
  });

  it('a new item starts clean: after the correction the bay judges its own loads, the old ones forgotten', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'cargo-repeat' });
    await toTheDock(s);
    const first = s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature;
    // Different wrong loads until the test run is offered (the encounter's own rule, unchanged).
    const right = solve(s);
    const waiting = s.view().task!.cargo!.waiting;
    const wrongs = Array.from({ length: waiting }, (_, i) => i + 1).filter((n) => n !== right);
    let tried = 0;
    for (const n of wrongs) {
      if (s.view().rescueReady || s.view().stage !== 'cargo') break;
      load(s, n);
      await close(s);
      tried += 1;
      expect(logged(s, 'answer.repeat')).toEqual([]);
    }
    expect(tried).toBeGreaterThan(1);
    expect(tried).toBe(logged(s, 'answer').filter((e) => e.data.correct === false).length);
    // Whatever item waits after that, a load is judged against it afresh.
    if (s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature !== first && s.view().stage === 'cargo') {
      load(s, solve(s) > 1 ? solve(s) - 1 : solve(s) + 1);
      await close(s);
      expect(misses(s)).toBe(1);
    }
    s.director.dispose();
    await s.db.close();
  });
});
