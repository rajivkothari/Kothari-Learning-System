// Audit P0: a tap during an arrival or transition must never become the answer to a later item.
// Invariant: a learner input becomes an academic answer only if it happened while that exact item
// was the active, answer-accepting item (an open answer window).
import type { ElevatorPhase } from '../sim/elevator';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

interface StoredAttempt {
  outcome: string;
  assistance: string;
  wrongTries: number;
  misconceptions: string[];
  itemSignature: string;
}

async function attempts(s: Session): Promise<StoredAttempt[]> {
  const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
  return rows.map((r) => JSON.parse(r.payload) as StoredAttempt);
}

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');

/**
 * Seed where the second job starts on the floor where the first job ends, so no automatic
 * reposition ride overwrites a stray call. This is the audit's reproduction: found by scanning
 * seeds with the pure engine (answer of item 0 === start of item 1).
 */
const SAME_FLOOR_SEED = 'race-7';

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

/** A floor that is not the car's floor and not `avoid`. */
function strayFloor(s: Session, avoid: number): number {
  const here = s.view().elevator.floor;
  for (const f of [here + 3, here - 3, here + 5, here - 5, 2, 19]) if (f >= 1 && f <= 20 && f !== here && f !== avoid) return f;
  return 1;
}

/** Answer the visible job correctly, tap a stray floor at the given arrival phase, then settle on the next job. */
async function correctThenStray(s: Session, at: ElevatorPhase | 'success') {
  const right = solve(s);
  s.director.pressFloor(right);
  const hit = at === 'success' ? () => s.view().stage === 'success' : () => s.view().elevator.phase === at && s.view().elevator.floor === right;
  expect(await s.time.runUntil(hit)).toBe(true);
  s.director.pressFloor(strayFloor(s, right));
  const before = answers(s).length;
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task' && s.view().task?.wrongTries === 0 && answers(s).length === before, 60_000)).toBe(true);
}

describe('answer window (audit P0: arrival-window input race)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the reproduction seed really puts the next job on the same floor (no reposition ride to mask the bug)', async () => {
    const s = await openSession(tmp.file, virtualTime(), { instanceId: SAME_FLOOR_SEED });
    await wake(s);
    const right = solve(s);
    await answerCorrectly(s);
    expect(s.view().task!.move!.start).toBe(right);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart' && e.data.kind === 'reposition')).toHaveLength(1); // only the first
  });

  for (const phase of ['arrived', 'doorsOpening', 'success'] as const) {
    it(`a tap while the car is ${phase} after a correct answer never answers the next job`, async () => {
      const s = await openSession(tmp.file, virtualTime(), { instanceId: SAME_FLOOR_SEED });
      await wake(s);
      await correctThenStray(s, phase);
      // Give any queued call every chance to depart and be (wrongly) treated as an answer.
      await s.time.advance(10_000);
      expect(answers(s)).toHaveLength(1);
      expect(s.view()).toMatchObject({ stage: 'task', task: { wrongTries: 0 } });
      expect(s.view().elevator.lit).toEqual([]);
      // The next job is answered cleanly, and both records are independent first tries.
      await answerCorrectly(s);
      const recorded = await attempts(s);
      expect(recorded).toHaveLength(2);
      for (const a of recorded) expect(a).toMatchObject({ outcome: 'correct', assistance: 'independent', wrongTries: 0, misconceptions: [] });
    });
  }

  it('rapid repeated taps through the whole arrival and transition change nothing', async () => {
    const s = await openSession(tmp.file, virtualTime(), { instanceId: SAME_FLOOR_SEED });
    await wake(s);
    const right = solve(s);
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().elevator.phase === 'arrived');
    // Mash every 40 ms until the next job is on screen and settled.
    for (let i = 0; i < 400 && !(settled(s)() && s.view().stage === 'task' && answers(s).length === 1 && s.view().task?.wrongTries === 0 && i > 60); i++) {
      s.director.pressFloor(1 + (i % 20));
      await s.time.advance(40);
    }
    await s.time.advance(10_000);
    expect(answers(s)).toHaveLength(1);
    expect(s.view().task?.wrongTries).toBe(0);
    expect((await attempts(s)).every((a) => a.wrongTries === 0 && a.outcome === 'correct')).toBe(true);
  });

  it('taps during the automatic reposition ride never answer the job it is driving to', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    // The lift rides itself to the first job. Tap through every phase of that ride.
    expect(await s.time.runUntil(() => s.view().stage === 'reposition')).toBe(true);
    for (const phase of ['doorsClosing', 'departing', 'traveling', 'arrived', 'doorsOpening'] as const) {
      await s.time.runUntil(() => s.view().elevator.phase === phase, 30_000);
      s.director.pressFloor(strayFloor(s, -1));
      s.director.pressFloor(s.view().elevator.floor); // the current floor too
    }
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    await s.time.advance(10_000);
    expect(answers(s)).toHaveLength(0);
    expect(s.view().task?.wrongTries).toBe(0);
    expect(s.view().elevator.lit).toEqual([]);
  });

  it('a current-floor tap during a transition is not an answer in place', async () => {
    const s = await openSession(tmp.file, virtualTime(), { instanceId: SAME_FLOOR_SEED });
    await wake(s);
    const right = solve(s);
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().stage === 'success');
    s.director.pressFloor(right); // the floor we are on: during the pause, never an answer
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task' && answers(s).length >= 1);
    await s.time.advance(5_000);
    expect(answers(s)).toHaveLength(1);
  });

  it('taps while a wrong ride arrives do not become the next try of the same job', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    const wrong = right >= 19 ? right - 2 : right + 2;
    s.director.pressFloor(wrong);
    await s.time.runUntil(() => s.view().elevator.phase === 'doorsOpening' && s.view().elevator.floor === wrong);
    s.director.pressFloor(strayFloor(s, right));
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task' && s.view().task?.wrongTries === 1);
    await s.time.advance(10_000);
    expect(answers(s)).toHaveLength(1); // only the deliberate wrong press
    expect(s.view().task?.wrongTries).toBe(1);
    // The window is open again now: a deliberate press answers.
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().stage === 'success');
    const recorded = await attempts(s);
    expect(recorded.at(-1)).toMatchObject({ outcome: 'correct', wrongTries: 1 });
  });

  it('a press while the window is open is an answer, exactly once', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await wake(s);
    const right = solve(s);
    s.director.pressFloor(right);
    s.director.pressFloor(right);
    s.director.pressFloor(right);
    await s.time.runUntil(() => s.view().stage === 'success');
    expect(answers(s)).toHaveLength(1);
    expect(answers(s)[0]!.data.value).toBe(right);
  });
});
