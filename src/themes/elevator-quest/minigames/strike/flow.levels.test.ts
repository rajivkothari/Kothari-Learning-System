/// <reference types="node" />
// Strike Lab's warm-up across levels (issue #3, D3): one free warm-up ball per visit (opening Strike
// Lab until BACK TO ELEVATOR), never one per mission. Stage 2 adds Pin Pursuit, Word Strike and Physics
// Lab as missions of the same game; until then this file stands one in: the shipped power-repair
// mission (one power puzzle) is registered as a second Strike challenge, here only, through a module
// mock. The session switches between the game's missions the way a level map will (deps.mission).
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameEntry, MiniGameSound } from '../types';
import { createStrikeFlow, resultActions, type StrikeFlow, type Task } from './flow';
import { guideShot, simulate, targetsDown, type Shot } from './lane';

const LEVEL_TWO = 'power-repair';

jest.mock('./challenges', () => {
  const actual = jest.requireActual<typeof import('./challenges')>('./challenges');
  const CHALLENGES = [...actual.CHALLENGES, { id: 'level-two', missionId: 'power-repair', steps: [{ lane: { rack: 'five' }, targets: [0] }], spinEarned: false }];
  return { ...actual, CHALLENGES, challengeFor: (missionId: string) => CHALLENGES.find((c) => c.missionId === missionId) ?? null };
});

const LEARNER = 'learner-a';
const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };
/** Strike Lab with two levels: its own mission and the stand-in. */
const GAME: MiniGameEntry = { ...miniGameById('strike')!, missions: ['strike-lab', LEVEL_TWO] };

async function world() {
  const tmp = tempDir();
  const clock = fakeClock();
  let db = openNodeDatabase(tmp.file);
  let rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  await rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  const restart = async () => {
    rt.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  };
  /** A level from the level map (mission), or the entrance's PLAY (none: the session resumes what it can). */
  const open = async (mission?: string) => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: GAME, ...(mission ? { mission } : {}), clock, newInstanceId: () => `strike-${clock.now()}-${++n}` });
    const flow = createStrikeFlow({ session: h.session, sound: silent });
    await flow.start(clock.now());
    return { flow, session: h.session, close: () => h.close() };
  };
  const rows = async () =>
    (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [[e.event.attempt.activityId, e.event.attempt.outcome, e.event.attempt.assistance]] : []));
  return { open, restart, rows, clock, done: async () => { await db.close(); tmp.cleanup(); } };
}

const settleWrites = () => new Promise((r) => setTimeout(r, 50));
function rightOption(t: Task): string {
  if (t.kind !== 'smart') throw new Error('a power puzzle');
  return t.options.find((o) => o.value === t.needed - t.present)!.id;
}
/** One ball that leaves an objective pin standing. */
function missBall(f: StrikeFlow) {
  const v = f.view();
  for (let a = -10; a <= 10; a++) {
    const shot: Shot = { aim: a / 10, spin: 0, power: 0.6 };
    if (!targetsDown(simulate(shot, v.lane, v.standing), v.targets, v.standing)) {
      f.setShot(shot);
      f.bowl();
      f.settle();
      return;
    }
  }
  throw new Error('no missing shot');
}

describe('Strike Lab: one warm-up ball per visit, across levels (D3)', () => {
  it('switching levels, and reloading, never grants another warm-up; BACK TO ELEVATOR ends the visit', async () => {
    const w = await world();
    // Level one: the visit's warm-up ball, then a right answer and a missed first ball.
    let s = await w.open('strike-lab');
    expect(s.session.missionId).toBe('strike-lab');
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', mode: 'practice' });
    s.flow.bowl();
    s.flow.settle();
    s.flow.proceed();
    await s.flow.choose(rightOption(s.flow.view().task!));
    missBall(s.flow);
    await settleWrites();
    s.flow.dispose();
    await s.close();

    // Switch to level two in the same visit: no warm-up, straight to its puzzle.
    s = await w.open(LEVEL_TWO);
    expect(s.session.missionId).toBe(LEVEL_TWO);
    expect(s.flow.view()).toMatchObject({ challenge: 'level-two', practiceUsed: true });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', mode: 'objective', lane: { rack: 'five' } });
    await s.flow.choose(rightOption(s.flow.view().task!));
    expect(s.flow.view()).toMatchObject({ stage: 'aim', attempt: 1, targets: [0] });
    missBall(s.flow);
    await settleWrites();
    s.flow.dispose();

    // A reload inside the visit, back in through the entrance: still no warm-up, and the bowled frame
    // stays spent. (Level two is one step, so its right answer completed the mission: the session
    // resumes that held answer through the entrance, D196.)
    await w.restart();
    s = await w.open();
    expect(s.session.missionId).toBe(LEVEL_TWO);
    expect(s.flow.view().practiceUsed).toBe(true);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'result', frameOver: true, attempt: 1 });
    expect(resultActions(s.flow.view())).toEqual(['retry']);
    s.flow.dispose();
    await s.close();

    // Back to level one: the session ended its unfinished instance (D196), but the shot it earned is
    // still owed: it comes back first, where its frame stood, with no question and no warm-up.
    s = await w.open('strike-lab');
    expect(s.flow.view().practiceUsed).toBe(true);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'result', frameOver: true, carried: true, attempt: 1, targets: [0], task: null });
    expect(resultActions(s.flow.view())).toEqual(['retry']);
    s.flow.retry();
    const v = s.flow.view();
    s.flow.setShot(guideShot(v.lane, v.targets, { spin: v.spinOpen })!);
    s.flow.bowl();
    s.flow.settle();
    expect(s.flow.view().outcome).toBe('cleared');
    await s.flow.next(w.clock.now());
    // Played out: on to this level's puzzle (its new instance), nothing asked twice.
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', carried: false, step: 0 });
    expect(s.flow.view().notes.earned['strike-lab']).toBeUndefined();

    // BACK TO ELEVATOR ends the visit; the next visit starts with one warm-up.
    await s.flow.leave(w.clock.now());
    await s.close();
    s = await w.open('strike-lab');
    expect(s.flow.view().practiceUsed).toBe(false);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', mode: 'practice' });
    expect(s.flow.view().notes.practice).toBe(1);

    // Only the committed answers are evidence: no warm-up, roll, miss, reload or switch added any.
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 'independent'],
      ['power-cells.fill', 'correct', 'independent'],
    ]);
    await w.done();
  });
});
