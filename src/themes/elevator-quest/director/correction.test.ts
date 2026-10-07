// Corrections (D149), through the real director, runtime and SQLite on virtual time: a miss shows
// its consequence, LET'S COUNT starts a count on the learner's own job, and a fresh job follows.
// What matters most here: nothing about a correction becomes independent mastery evidence, and
// we can still tell from the record (and the playtest report) whether the learner managed the
// fresh job by themselves.
import { count } from '../../../runtime/testing/harness';
import { LINES } from '../content/floor15';
import { LEARNER, answerCorrectly, answerWith, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { buildReport } from './playtestLog';

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;
const attempts = async (s: Session) => (await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq")).map((r) => JSON.parse(r.payload) as Record<string, unknown>);

async function missAndWait(s: Session, value: number) {
  const before = answers(s);
  answerWith(s, value);
  expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving && s.view().rescueReady && s.view().elevator.phase === 'idleOpen')).toBe(true);
}

/** LET'S COUNT, count the board through, answer it, and wait for the fresh job. */
async function correct(s: Session) {
  s.director.beginRescue();
  for (let guard = 0; guard < 40 && s.view().rescue?.phase === 'counting'; guard++) {
    const r = s.view().rescue!;
    s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * (r.counted.length + 1));
  }
  const r = s.view().rescue!;
  const stop = r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * r.steps;
  s.director.rescueTap(r.asks === 'cell' ? stop : r.kind === 'fill' ? r.countFrom + r.steps : r.steps);
  expect(await s.time.runUntil(() => (s.view().stage === 'task' || s.view().stage === 'cargo') && settled(s)())).toBe(true);
}

describe('corrections (D149)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the board, wrong taps on it and its answer write nothing; the corrected job is one miss; the fresh job is guided, never independent', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    await missAndWait(s, right >= 19 ? right - 2 : right + 2);
    expect(await attempts(s)).toEqual([]); // a miss alone is not yet a record
    s.director.beginRescue();
    s.director.rescueTap(s.view().rescue!.origin); // not the next floor: Lifty helps, nothing is written
    expect(s.view().rescue!.counted).toEqual([]);
    const r = s.view().rescue!;
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * k);
    s.director.rescueTap(right === 20 ? 19 : right + 1); // a wrong final answer on the board
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().rescue!.phase).toBe('counting'); // count again together, no verdict
    expect(await attempts(s)).toEqual([]);
    await s.time.runUntil(() => s.view().stage === 'rescue');
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * k);
    s.director.rescueTap(right);
    expect(await s.time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
    const afterCorrection = await attempts(s);
    expect(afterCorrection).toEqual([expect.objectContaining({ outcome: 'incorrect', conceptRescue: true })]);
    await answerCorrectly(s);
    const all = await attempts(s);
    expect(all[1]).toMatchObject({ outcome: 'correct', conceptRescue: true, wrongTries: 0 });
    expect(all[1]!.assistance).not.toBe('independent');
    // The learner model agrees: nothing here reads as independent success.
    const state = await s.rt.learnerState(LEARNER);
    expect(state.skills['math.add.within20']!.dimensions.independence.rate).toBeLessThan(1);
    s.director.dispose();
    await s.db.close();
  });

  it('the playtest report says whether the fresh job was managed first try, without help', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    await missAndWait(s, right >= 19 ? right - 2 : right + 2);
    await correct(s);
    await answerCorrectly(s);
    const report = buildReport(s.log, { device: {}, skillsBefore: null, skillsNow: null, progression: [], unlocks: [] });
    expect(report).toContain('Corrections: 1 started, 1 counted through');
    expect(report).toContain('next job after a correction: cued-moves right first try, no help');
    s.director.dispose();
    await s.db.close();
  });

  it('a capacity load: the load meter opens on the miss, the room left outlined, and the encounter keeps its own test run', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    while (s.view().task?.stepId !== 'capacity-encounter' || s.view().stage !== 'cargo') await answerCorrectly(s);
    const need = solve(s);
    const before = answers(s);
    answerWith(s, need - 1);
    expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving)).toBe(true);
    // The encounter is a mastery check: the same load waits again (no correction at the first miss).
    expect(s.view()).toMatchObject({ stage: 'cargo', rescueReady: false, shaftMode: 'numberLine', task: { cargo: { status: 'underload', loaded: need - 1 } } });
    expect(s.view().lifty.line).toContain(LINES.underload);
    s.director.dispose();
    await s.db.close();
  });

  it('no timer starts the correction: it waits for LET\'S COUNT however long the learner looks', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    await missAndWait(s, right >= 19 ? right - 2 : right + 2);
    await s.time.advance(60_000);
    expect(s.view()).toMatchObject({ stage: 'pause', rescueReady: true, rescue: null });
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(0);
    s.director.dispose();
    await s.db.close();
  });
});
