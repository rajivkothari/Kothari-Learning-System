/// <reference types="node" />
// Strike Lab (issue #3) over the real runtime (node:sqlite) and the shipped strike-lab mission,
// driven headless: one free practice ball a game session; only the puzzle answers are evidence; the
// practice ball, aim, power, spin, rolls, pins down, TRY AGAIN, GUIDED SHOT and MOVE ON never are; a
// bowling miss after a right answer asks nothing again; two free tries, then GUIDED SHOT (rails and a
// guide, never an award) and MOVE ON; leaving, a restart and a V0.1 save resume the round.
import strikeJson from '../../../../../content/themes/elevator-quest/minigames/strike.json';
import missionsJson from '../../../../../content/missions/core.json';
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { validateStrikeCopy } from '../../content/minigames';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameSound } from '../types';
import { FREE_RETRIES, GUIDED_TRIES, MAX_FRAMES, createStrikeFlow, migrateSave, pairParts, pinsOfPair, resultActions, type StrikeFlow, type Task } from './flow';
import { LANE, guideShot, previewPath, rack, simulate, targetsDown, type Shot } from './lane';

const LEARNER = 'learner-a';
const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };

async function world(learner = LEARNER) {
  const tmp = tempDir();
  const clock = fakeClock();
  let db = openNodeDatabase(tmp.file);
  let rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  await rt.createLearner({ id: learner, themePack: THEME_PACK_ID });
  let n = 0;
  const restart = async () => {
    rt.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  };
  const open = async (who = learner) => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: who, game: miniGameById('strike')!, clock, newInstanceId: () => `strike-${who}-${clock.now()}-${++n}` });
    const flow = createStrikeFlow({ session: h.session, sound: silent });
    await flow.start(clock.now());
    return { flow, session: h.session, close: () => h.close() };
  };
  const events = async (who = learner) => (await loadLearningEvents(db, who)).map((e) => e.event);
  const attempts = async (who = learner) => (await events(who)).flatMap((e) => (e.type === 'attempt' ? [e.attempt] : []));
  const rows = async () => (await attempts()).map((a) => [a.activityId, a.outcome, a.wrongTries, a.assistance]);
  return { open, restart, events, attempts, rows, clock, rt: () => rt, done: async () => { await db.close(); tmp.cleanup(); } };
}

/** The answer worked out from the task the way a child would (the flow never compares). */
function rightOption(t: Task): string {
  if (t.kind === 'smart') return t.options.find((o) => o.value === t.needed - t.present)!.id;
  return t.options.find((o) => {
    const [a, b] = pairParts(o.value)!;
    return a + b === t.target;
  })!.id;
}
function wrongOption(t: Task): string {
  return t.options.find((o) => o.id !== rightOption(t))!.id;
}
/** Tap the two pins of an option (a target puzzle). */
async function tapPair(f: StrikeFlow, optionId: string) {
  const t = f.view().task!;
  if (t.kind !== 'target') throw new Error('not a target task');
  const [a, b] = pinsOfPair(t, t.options.find((o) => o.id === optionId)!.value);
  await f.pickPin(a!);
  await f.pickPin(b!);
}
/** Bowl one ball and let it settle (then the frame's second ball, if it has one). */
function bowl(f: StrikeFlow) {
  f.bowl();
  f.settle();
  f.ready();
}
/** Bowl until the frame is over (one or two balls). */
function finishFrame(f: StrikeFlow) {
  for (let i = 0; i < 2 && f.view().stage === 'aim'; i++) bowl(f);
  expect(f.view()).toMatchObject({ stage: 'result', frameOver: true });
}
/** A ball that misses every pin: far left with left spin. */
const GUTTER = { aim: -1, spin: -1, power: 0.5 };
/** Aim a shot that clears the objective on this lane (the guide search, as a skilled child would). */
function aimToClear(f: StrikeFlow) {
  const v = f.view();
  f.setShot(guideShot(v.lane, v.targets, { spin: v.spinOpen, standing: v.standing })!);
}
/** Aim a ball that leaves an objective pin standing (a miss, even with GUIDED SHOT's rails). */
function aimToMiss(f: StrikeFlow) {
  const v = f.view();
  for (const power of [0.3, 0.6, 1]) for (const spin of [-1, 1, 0]) for (let a = -10; a <= 10; a++) {
    const shot: Shot = { aim: a / 10, spin: v.spinOpen ? spin : 0, power };
    if (!targetsDown(simulate(shot, v.lane, v.standing), v.targets, v.standing)) return f.setShot(shot);
  }
  throw new Error('no shot misses the objective on this lane');
}
/** Bowl a whole frame that misses the objective. */
function missFrame(f: StrikeFlow) {
  for (let i = 0; i < 2 && f.view().stage === 'aim'; i++) {
    aimToMiss(f);
    bowl(f);
  }
  expect(f.view()).toMatchObject({ stage: 'result', frameOver: true, outcome: 'targetMiss' });
}
/** The free practice ball, then on to the first puzzle. */
function practiceBall(f: StrikeFlow) {
  f.begin();
  expect(f.view()).toMatchObject({ stage: 'aim', mode: 'practice', targets: [] });
  bowl(f);
  expect(f.view()).toMatchObject({ stage: 'result', frameOver: true, mode: 'practice', line: { key: 'practiceDone' } });
  expect(resultActions(f.view())).toEqual(['continue']);
  f.proceed();
  expect(f.view().stage).toBe('puzzle');
}
/** Answer right and clear the objective (step 1, the power puzzle), then NEXT. */
async function clearStep(w: Awaited<ReturnType<typeof world>>, f: StrikeFlow) {
  const t = f.view().task!;
  if (t.kind === 'smart') await f.choose(rightOption(t));
  else await tapPair(f, rightOption(t));
  aimToClear(f);
  finishFrame(f);
  expect(f.view().outcome).toBe('cleared');
  await f.next(w.clock.now());
}

describe('Strike Lab: arcade puzzle bowling (issue #3)', () => {
  it('ships valid copy, the two-step strike-lab mission, and a lane where the controls change the path', () => {
    expect(validateStrikeCopy(strikeJson).issues).toEqual([]);
    const m = (missionsJson.missions as { id: string; steps: { activityId?: string }[] }[]).find((x) => x.id === 'strike-lab')!;
    expect(m.steps.map((s) => s.activityId)).toEqual(['power-cells.fill', 'pairs.make-target']);
    const end = (shot: Parameters<typeof previewPath>[0]) => previewPath(shot).points.at(-1)!;
    const base = { aim: 0, power: 0.6, spin: 0 };
    expect(end({ ...base, aim: 0.5 }).x).toBeGreaterThan(end(base).x + 0.1);
    expect(end({ ...base, spin: 0.5 }).x).toBeGreaterThan(end(base).x + 0.1);
    // A softer ball spends longer on the lane, so the same spin curves it further.
    expect(end({ ...base, spin: 0.5, power: 0 }).x).toBeGreaterThan(end({ ...base, spin: 0.5, power: 1 }).x + 0.05);
    expect(previewPath({ ...base, aim: -1, spin: -1 }).gutter).toBe(true);
    expect(simulate(base, 'ten')).toEqual(simulate(base, 'ten'));
    expect(simulate(base, 'ten').down.filter(Boolean).length).toBeGreaterThan(5);
    expect(rack('ten')).toHaveLength(10);
    expect(rack('five').every((p) => p.y >= LANE.head)).toBe(true);
  });

  it('plays a whole round: a practice ball, then only the two answers are evidence, never the bowling', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    expect(f.view().stage).toBe('intro');
    practiceBall(f);
    expect(await w.rows()).toEqual([]);
    expect(f.view()).toMatchObject({ stage: 'puzzle', step: 0, steps: 2 });
    expect(f.view().task!.kind).toBe('smart');
    await f.choose(rightOption(f.view().task!));
    // The shot is earned: the head pin is the objective.
    expect(f.view()).toMatchObject({ stage: 'aim', mode: 'objective', attempt: 1, solved: true, targets: [0] });
    await clearStep(w, f);
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 0, 'independent']]);
    expect(f.view()).toMatchObject({ stage: 'puzzle', step: 1 });
    await tapPair(f, rightOption(f.view().task!));
    expect(f.view().targets).toHaveLength(2);
    aimToClear(f);
    finishFrame(f);
    expect(resultActions(f.view())).toEqual(['next']);
    await f.next(w.clock.now());
    expect(f.view().stage).toBe('done');
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 0, 'independent'],
      ['pairs.make-target', 'correct', 0, 'independent'],
    ]);
    expect((await w.events()).filter((e) => e.type === 'attempt')).toHaveLength(2);
    expect(f.view().notes).toMatchObject({ rounds: 1, completed: 1, attempts: 2, wrong: 0, practice: 1, cleared: 2 });
    expect(f.view().totals).toMatchObject({ cleared: 2, movedOn: 0 });
    await w.done();
  });

  it('two free tries after the earned frame, then GUIDED SHOT and MOVE ON; the bowling never asks again or records', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    await f.choose(rightOption(f.view().task!));
    const after = (await w.events()).length;
    for (let attempt = 1; attempt <= 1 + FREE_RETRIES; attempt++) {
      expect(f.view()).toMatchObject({ stage: 'aim', mode: 'objective', attempt });
      f.setShot(GUTTER);
      finishFrame(f);
      expect(f.view().outcome).toBe('targetMiss');
      if (attempt <= FREE_RETRIES) {
        expect(resultActions(f.view())).toEqual(['retry']);
        expect(f.view().line).toEqual({ key: 'tryLeft', vars: { left: FREE_RETRIES - attempt + 1 } });
        f.retry();
        expect(f.view().standing.every(Boolean)).toBe(true);
      }
    }
    expect(resultActions(f.view())).toEqual(['guided', 'moveOn']);
    f.retry(); // no third free try
    expect(f.view().stage).toBe('result');
    // GUIDED SHOT: rails and a guide line; the child's controls are not moved and nothing is bowled for them.
    f.setShot(GUTTER);
    f.guided();
    expect(f.view()).toMatchObject({ stage: 'aim', mode: 'guided', lane: { bumpers: true }, line: { key: 'guidedAsk' } });
    expect(f.view().guide).not.toBeNull();
    expect(f.view().shot).toEqual(expect.objectContaining({ aim: -1, spin: -1 }));
    // Rails: even the far-left ball stays on the lane.
    bowl(f);
    expect(f.view().roll!.gutter).toBe(false);
    if (f.view().stage === 'aim') bowl(f);
    if (f.view().outcome !== 'cleared') {
      expect(resultActions(f.view())).toEqual(['guided', 'moveOn']);
      f.guided();
    }
    // Following the guide clears the objective.
    if (f.view().stage === 'aim') {
      f.setShot(f.view().guide!);
      finishFrame(f);
    }
    expect(f.view().outcome).toBe('cleared');
    expect((await w.events()).length).toBe(after);
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 0, 'independent']]);
    expect(f.view().notes).toMatchObject({ retries: FREE_RETRIES, guided: expect.any(Number) });
    await w.done();
  });

  it('MOVE ON goes to the next puzzle without the objective cleared: nothing negative, nothing recorded', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    await f.choose(rightOption(f.view().task!));
    for (let i = 0; i <= FREE_RETRIES; i++) {
      f.setShot(GUTTER);
      finishFrame(f);
      if (i < FREE_RETRIES) f.retry();
    }
    const after = (await w.events()).length;
    await f.moveOn(w.clock.now());
    expect(f.view()).toMatchObject({ stage: 'puzzle', step: 1, totals: { cleared: 0, movedOn: 1 } });
    expect(f.view().task!.kind).toBe('target');
    expect((await w.events()).length).toBe(after + 0);
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 0, 'independent']]);
    expect(f.view().notes.movedOn).toBe(1);
    await w.done();
  });

  it('a wrong module shows its consequence and greys; the right one after it is not independent', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    const t = f.view().task!;
    if (t.kind !== 'smart') throw new Error('step 1 is the Smart Ball');
    const wrong = wrongOption(t);
    await f.choose(wrong);
    const value = t.options.find((o) => o.id === wrong)!.value;
    expect(f.view()).toMatchObject({ stage: 'puzzle', tried: [wrong], line: { key: 'smartWrong', vars: { total: t.present + value, needed: t.needed } } });
    await f.choose(wrong); // greyed: nothing sent
    await f.choose(rightOption(t));
    expect(f.view().stage).toBe('aim');
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 1, 'retry']]);
    await w.done();
  });

  it('a wrong pair says its sum; a target pin missed after the right pair is a bowling miss', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    await clearStep(w, f);
    const t = f.view().task!;
    if (t.kind !== 'target') throw new Error('step 2 is the target');
    const wrong = wrongOption(t);
    await tapPair(f, wrong);
    const [a, b] = pairParts(t.options.find((o) => o.id === wrong)!.value)!;
    expect(f.view().line).toEqual({ key: 'targetWrong', vars: { a, b, sum: a + b, target: t.target } });
    await tapPair(f, wrong); // the same pair again: said again, not sent
    expect((await w.attempts()).length).toBe(1);
    await tapPair(f, rightOption(t));
    expect(f.view().stage).toBe('aim');
    const after = (await w.events()).length;
    f.setShot(GUTTER);
    bowl(f);
    expect(f.view()).toMatchObject({ stage: 'aim', ball: 2, outcome: 'targetMiss' });
    bowl(f);
    expect(f.view()).toMatchObject({ stage: 'result', frameOver: true, outcome: 'targetMiss' });
    f.retry();
    expect(f.view()).toMatchObject({ stage: 'aim', solved: true, attempt: 2 });
    expect((await w.events()).length).toBe(after);
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 0, 'independent'],
      ['pairs.make-target', 'correct', 1, 'retry'],
    ]);
    await w.done();
  });

  it('help: point at the givens, the counting help, then SHOW ME (demonstrated)', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    const t = f.view().task!;
    await f.hint();
    expect(f.view().hint?.kind).toBe('highlightGiven');
    await f.choose(wrongOption(t));
    await f.hint();
    expect(f.view().hint?.kind).toBe('numberLine');
    const second = t.options.find((o) => o.id !== rightOption(t) && !f.view().tried.includes(o.id))!.id;
    await f.choose(second);
    await f.hint();
    expect(f.view().hint?.kind).toBe('showAnswer');
    await f.choose(rightOption(t));
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 2, 'demonstrated']]);
    expect(f.view().notes.help).toBe(3);
    await w.done();
  });

  it('one practice ball a game session, even across a reload; retries and lit targets resume', async () => {
    const w = await world();
    let s = await w.open();
    s.flow.begin();
    s.flow.bowl(); // the practice ball rolls (its save goes out at once)...
    await new Promise((r) => setTimeout(r, 50));
    s.flow.dispose(); // ...and the app closes before it settles
    await w.restart();
    s = await w.open();
    expect(s.flow.view().practiceUsed).toBe(true);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', step: 0 });
    await s.flow.choose(rightOption(s.flow.view().task!));
    s.flow.setShot(GUTTER);
    finishFrame(s.flow);
    s.flow.retry();
    expect(s.flow.view().attempt).toBe(2);
    await s.flow.leave(w.clock.now());
    await s.close();
    s = await w.open();
    expect(s.flow.view()).toMatchObject({ stage: 'intro', line: { key: 'resume' } });
    s.flow.begin();
    // The right answer is held: straight back to the earned shot, on the same try, the same objective.
    expect(s.flow.view()).toMatchObject({ stage: 'aim', mode: 'objective', attempt: 2, solved: true, targets: [0] });
    aimToClear(s.flow);
    finishFrame(s.flow);
    await s.flow.next(w.clock.now());
    await tapPair(s.flow, rightOption(s.flow.view().task!));
    const lit = s.flow.view().targets;
    s.flow.dispose(); // a crash with the right pair held
    await w.restart();
    s = await w.open();
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', step: 1, targets: lit, attempt: 1 });
    expect(await w.rows()).toHaveLength(2);
    expect(s.flow.view().notes).toMatchObject({ rounds: 1, practice: 1 });
    await w.done();
  });

  it('a Strike Lab V0.1 save resumes (D5): same puzzle, same totals, no new practice ball', async () => {
    const v1Task: Task = { kind: 'smart', key: 'k', needed: 9, present: 4, options: [{ id: 'a', value: 5 }] };
    expect(migrateSave({ v: 1, frame: 1, task: v1Task, tried: ['b'], totals: { pins: 12, strikes: 1, spares: 0 } })).toEqual({
      v: 2,
      challenge: 'classic',
      step: 0,
      task: v1Task,
      tried: ['b'],
      attempt: 0,
      guided: false,
      totals: { pins: 12, strikes: 1, cleared: 0, movedOn: 0 },
    });
    expect(migrateSave({ v: 1, frame: 3, task: null, tried: [] })?.step).toBe(2);
    expect(migrateSave({ v: 7 })).toBeNull();
    expect(migrateSave(null)).toBeNull();
    // Over the runtime: a V0.1 round saved during frame 2 comes back on step 2 with its pins.
    const w = await world();
    let s = await w.open();
    practiceBall(s.flow);
    await clearStep(w, s.flow);
    const t = s.flow.view().task!;
    await s.session.saveGame({ v: 1, frame: 2, task: t, tried: [], totals: { pins: 30, strikes: 2, spares: 1 } });
    s.flow.dispose();
    await s.close();
    s = await w.open();
    expect(s.flow.view()).toMatchObject({ practiceUsed: true, totals: { pins: 30, strikes: 2 } });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', step: 1, task: t });
    await w.done();
  });

  it('PLAY AGAIN and Start Over: a new round (a new mission instance) keeps the visit, so no new warm-up; the next visit gets one; a fresh tally for a new learner', async () => {
    const w = await world();
    let s = await w.open();
    practiceBall(s.flow);
    await clearStep(w, s.flow);
    await clearStep(w, s.flow);
    expect(s.flow.view().stage).toBe('done');
    await s.flow.again();
    await s.close();
    // A new round is a new mission instance (as a new level will be): still the same visit (D3).
    s = await w.open();
    expect(s.flow.view()).toMatchObject({ stage: 'intro', line: { key: 'intro' }, practiceUsed: true });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', step: 0, mode: 'objective' });
    // BACK TO ELEVATOR ends the visit; the next visit starts with its own warm-up ball.
    await s.flow.leave(w.clock.now());
    await s.close();
    s = await w.open();
    expect(s.flow.view().practiceUsed).toBe(false);
    practiceBall(s.flow);
    expect(s.flow.view().notes).toMatchObject({ rounds: 2, completed: 1, again: 1, practice: 2 });
    await w.rt().createLearner({ id: 'learner-b', themePack: THEME_PACK_ID });
    const b = await w.open('learner-b');
    expect(b.flow.view().notes).toMatchObject({ rounds: 1, completed: 0, again: 0, attempts: 0 });
    await w.done();
  });

  it('GUIDED SHOT is capped: two guided frames after the free tries, then only MOVE ON; nothing recorded', async () => {
    expect(MAX_FRAMES).toBe(1 + FREE_RETRIES + GUIDED_TRIES);
    const w = await world();
    const { flow: f } = await w.open();
    practiceBall(f);
    await f.choose(rightOption(f.view().task!));
    const after = (await w.events()).length;
    for (let i = 0; i <= FREE_RETRIES; i++) {
      missFrame(f);
      if (i < FREE_RETRIES) f.retry();
    }
    for (let g = 1; g <= GUIDED_TRIES; g++) {
      expect(resultActions(f.view())).toEqual(['guided', 'moveOn']);
      f.guided();
      expect(f.view()).toMatchObject({ stage: 'aim', mode: 'guided', attempt: 1 + FREE_RETRIES + g });
      missFrame(f);
    }
    expect(f.view()).toMatchObject({ attempt: MAX_FRAMES, line: { key: 'guidedDone' } });
    expect(resultActions(f.view())).toEqual(['moveOn']);
    f.guided(); // no third guided frame
    f.retry();
    expect(f.view()).toMatchObject({ stage: 'result', attempt: MAX_FRAMES });
    await f.moveOn(w.clock.now());
    expect(f.view()).toMatchObject({ stage: 'puzzle', step: 1 });
    expect((await w.events()).length).toBe(after);
    expect(f.view().notes).toMatchObject({ retries: FREE_RETRIES, guided: GUIDED_TRIES, movedOn: 1 });
    await w.done();
  });

  it('a reload never gives a fresh frame: a bowled frame comes back as its result, the guided cap holds, a cleared one offers NEXT', async () => {
    const w = await world();
    let s = await w.open();
    practiceBall(s.flow);
    await s.flow.choose(rightOption(s.flow.view().task!));
    aimToMiss(s.flow);
    bowl(s.flow); // the first ball misses; the frame still has its second
    expect(s.flow.view()).toMatchObject({ stage: 'aim', ball: 2, attempt: 1 });
    await new Promise((r) => setTimeout(r, 50));
    s.flow.dispose();
    await w.restart();
    s = await w.open();
    s.flow.begin();
    // The frame was spent when its first ball rolled: its result, the same free tries left.
    expect(s.flow.view()).toMatchObject({ stage: 'result', frameOver: true, attempt: 1, line: { key: 'tryLeft', vars: { left: FREE_RETRIES } } });
    expect(resultActions(s.flow.view())).toEqual(['retry']);
    s.flow.retry();
    missFrame(s.flow);
    s.flow.retry();
    missFrame(s.flow);
    for (let g = 0; g < GUIDED_TRIES; g++) {
      s.flow.guided();
      missFrame(s.flow);
    }
    await new Promise((r) => setTimeout(r, 50));
    s.flow.dispose();
    await w.restart();
    s = await w.open();
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'result', attempt: MAX_FRAMES, line: { key: 'guidedDone' } });
    expect(resultActions(s.flow.view())).toEqual(['moveOn']);
    await s.flow.moveOn(w.clock.now());
    // Step two: the right pair, the objective cleared, then a reload before NEXT.
    await tapPair(s.flow, rightOption(s.flow.view().task!));
    aimToClear(s.flow);
    finishFrame(s.flow);
    expect(s.flow.view().outcome).toBe('cleared');
    await new Promise((r) => setTimeout(r, 50));
    s.flow.dispose();
    await w.restart();
    s = await w.open();
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'result', outcome: 'cleared', step: 1 });
    expect(resultActions(s.flow.view())).toEqual(['next']);
    await s.flow.next(w.clock.now());
    expect(s.flow.view().stage).toBe('done');
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 0, 'independent'],
      ['pairs.make-target', 'correct', 0, 'independent'],
    ]);
    await w.done();
  });
});
