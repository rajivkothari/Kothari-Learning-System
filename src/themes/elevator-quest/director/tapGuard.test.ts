// One tap is one tap. A scripted child playtest double-tapped NEXT JOB (120, 250 and 400 ms apart):
// when the next job started on the same floor, the second tap landed on that job's CLUE and the answer
// was recorded as helped ("clue") although nobody asked; with NEXT JOB low in the doorway it landed on
// a game's entrance. These play the real director and runtime with the guard on (TAP_GUARD_MS).
import { count } from '../../../runtime/testing/harness';
import { gameEntrance } from '../minigames/hostEntrance';
import { CLASSIC_CONTENT, answerWith, isChoiceTask, openSession, pinPools, settled, solve, solveChoice, tempDir, virtualTime, type Session } from '../testing/headless';
import { TAP_GUARD_MS } from './director';

const logged = (s: Session, kind: string) => s.log.entries().filter((e) => e.kind === kind);
const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
const lastAttempt = async (s: Session) => JSON.parse((await s.db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq DESC LIMIT 1"))!.payload) as { assistance: string; outcome: string; wrongTries: number };
const answer = (s: Session) => answerWith(s, isChoiceTask(s) ? solveChoice(s) : solve(s));

/** Answer the job on screen and wait for NEXT JOB (the harness presses hall calls; NEXT JOB is ours). */
async function toNextJob(s: Session) {
  expect(await s.time.runUntil(() => settled(s)() && (s.view().stage === 'task' || s.view().stage === 'cargo'))).toBe(true);
  // A hand takes its time: never inside the guard of the press before.
  await s.time.advance(TAP_GUARD_MS);
  answer(s);
  expect(await s.time.runUntil(() => s.view().stage === 'success' && s.view().success === 'review')).toBe(true);
}

/** Play on, pressing NEXT JOB, until `when` holds right after a press of NEXT JOB. */
async function untilAfterNextJob(s: Session, when: () => boolean) {
  s.director.pressDoorOpen();
  for (let guard = 0; guard < 14; guard++) {
    await toNextJob(s);
    s.director.nextJob();
    if (when()) return true;
  }
  return false;
}

/** The next job is on this very floor, with its help in the slot NEXT JOB just left. */
const helpInTheSlot = (s: Session) => () => (s.view().stage === 'task' || s.view().stage === 'cargo') && s.view().help !== null;

describe('one tap is one tap', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it.each([120, 250, 400])('a second tap %i ms after NEXT JOB lands on CLUE and takes nothing: no help shown, none recorded, the answer independent', async (gap) => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'tap-guard', autoNextJob: false, tapGuard: true });
    expect(await untilAfterNextJob(s, helpInTheSlot(s))).toBe(true);
    const offered = s.view().help!;
    const line = s.view().lifty.line;
    await time.advance(gap);
    s.director.requestHelp();
    await s.director.idle();
    expect(logged(s, 'help')).toEqual([]);
    expect(logged(s, 'tap.guarded').map((e) => e.data)).toEqual([{ action: 'requestHelp', after: 'nextJob', ms: gap }]);
    expect(s.view()).toMatchObject({ help: offered, saving: false, highlights: [], lifty: { line } });
    // The job, answered right with no help asked for, is on record as the learner's own.
    const before = await attempts(s);
    await time.advance(TAP_GUARD_MS);
    answer(s);
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect(await attempts(s)).toBe(before + 1);
    expect(await lastAttempt(s)).toMatchObject({ assistance: 'independent', outcome: 'correct', wrongTries: 0 });
    s.director.dispose();
    await s.db.close();
  });

  it('with no guard the same tap takes the clue and the answer is recorded as helped (what the playtest found)', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'tap-guard', autoNextJob: false });
    expect(await untilAfterNextJob(s, helpInTheSlot(s))).toBe(true);
    await time.advance(250);
    s.director.requestHelp();
    await s.director.idle();
    expect(logged(s, 'help')).toHaveLength(1);
    await time.advance(TAP_GUARD_MS);
    answer(s);
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect((await lastAttempt(s)).assistance).not.toBe('independent');
    s.director.dispose();
    await s.db.close();
  });

  it('a deliberate press is taken: CLUE pressed once the guard is over (and a press held for seconds, which fires when it is let go) gives its help, recorded as help', async () => {
    for (const wait of [TAP_GUARD_MS, 2_500]) {
      const t = tempDir();
      const time = virtualTime();
      const s = await openSession(t.file, time, { instanceId: 'tap-guard', autoNextJob: false, tapGuard: true });
      expect(await untilAfterNextJob(s, helpInTheSlot(s))).toBe(true);
      await time.advance(wait);
      s.director.requestHelp();
      await s.director.idle();
      expect(logged(s, 'help')).toHaveLength(1);
      expect(logged(s, 'tap.guarded')).toEqual([]);
      await time.advance(TAP_GUARD_MS);
      answer(s);
      expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
      await s.director.idle();
      expect((await lastAttempt(s)).assistance).not.toBe('independent');
      s.director.dispose();
      await s.db.close();
      t.cleanup();
    }
  });

  it('one press of help is one rung: a double tap on CLUE does not also take the next kind of help', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { instanceId: 'tap-guard', autoNextJob: false, tapGuard: true });
    // The two-orders cargo job opens with CLUE in the slot.
    expect(await untilAfterNextJob(s, helpInTheSlot(s))).toBe(true);
    await time.advance(TAP_GUARD_MS);
    s.director.requestHelp();
    await s.director.idle();
    const next = s.view().help;
    expect(logged(s, 'help')).toHaveLength(1);
    expect(next).not.toBeNull();
    // The label under the finger is now the next rung: the double tap's second tap is not a request for it.
    await time.advance(200);
    s.director.requestHelp();
    await s.director.idle();
    expect(logged(s, 'help')).toHaveLength(1);
    expect(s.view().help).toEqual(next);
    expect(logged(s, 'tap.guarded').map((e) => e.data)).toEqual([{ action: 'requestHelp', after: 'help', ms: 200 }]);
    // Asked for on purpose, it comes.
    await time.advance(TAP_GUARD_MS);
    s.director.requestHelp();
    await s.director.idle();
    expect(logged(s, 'help')).toHaveLength(2);
    s.director.dispose();
    await s.db.close();
  });

  it('a second tap after NEXT JOB does not open the game on the landing; a press after the guard does', async () => {
    // A landing with a game is where a job ended in some missions: play until NEXT JOB leaves an entrance on screen.
    let found: Session | null = null;
    for (let i = 0; i < 40 && !found; i++) {
      const t = tempDir();
      const s = await openSession(t.file, virtualTime(), { instanceId: `tap-game-${i}`, autoNextJob: false, autoHallCalls: false, tapGuard: true });
      s.director.pressDoorOpen();
      for (let guard = 0; guard < 14 && !found; guard++) {
        if (!(await s.time.runUntil(() => (settled(s)() && s.view().stage !== 'intro') || s.view().stage === 'call'))) break;
        if (s.view().stage === 'call') {
          s.director.pressFloor(s.view().hallCall!);
          continue;
        }
        if (s.view().stage !== 'task' && s.view().stage !== 'cargo') break;
        await s.time.advance(TAP_GUARD_MS);
        answer(s);
        if (!(await s.time.runUntil(() => s.view().stage === 'success' && s.view().success === 'review'))) break;
        s.director.nextJob();
        if (gameEntrance(s.view())) found = s;
      }
      if (!found) {
        await s.director.idle();
        s.director.dispose();
        await s.db.close();
        t.cleanup();
      }
    }
    expect(found).not.toBeNull();
    const s = found!;
    const game = gameEntrance(s.view())!;
    await s.time.advance(250);
    expect(s.director.openGame(game.id)).toBe(false);
    expect(s.view().miniGame).toBeNull();
    expect(logged(s, 'tap.guarded').map((e) => e.data)).toEqual([{ action: 'openGame', after: 'nextJob', ms: 250 }]);
    await s.time.advance(TAP_GUARD_MS);
    expect(s.director.openGame(game.id)).toBe(true);
    expect(s.view().miniGame).toMatchObject({ id: game.id });
    s.director.dispose();
    await s.db.close();
  }, 120_000);

  it('a second tap after NEXT JOB does not pick a card of the reading job that opens there: no answer, no attempt', async () => {
    const time = virtualTime();
    // The last reading job is answered with cards, which come up over the cabin on the floor where the job before it ended.
    const content = pinPools(CLASSIC_CONTENT, { 'read-4': 'reading.vocabulary.cards' });
    const s = await openSession(tmp.file, time, { instanceId: 'tap-cards', content, autoNextJob: false, tapGuard: true });
    expect(await untilAfterNextJob(s, () => s.view().reading?.mode === 'choose' && s.view().stage === 'task')).toBe(true);
    const before = await attempts(s);
    const wrong = s.view().reading!.options!.find((o) => o.value !== solveChoice(s))!;
    await time.advance(300);
    s.director.chooseReading(wrong.value);
    await s.director.idle();
    expect(logged(s, 'tap.guarded').map((e) => e.data.action)).toEqual(['chooseReading']);
    expect(s.view()).toMatchObject({ stage: 'task', saving: false });
    expect(await attempts(s)).toBe(before);
    // Picked on purpose, the right card is the answer.
    await time.advance(TAP_GUARD_MS);
    s.director.chooseReading(solveChoice(s));
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect(await attempts(s)).toBe(before + 1);
    s.director.dispose();
    await s.db.close();
  });
});
