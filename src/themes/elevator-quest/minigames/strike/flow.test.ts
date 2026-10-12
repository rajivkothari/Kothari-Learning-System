/// <reference types="node" />
// Strike Lab V0.1 over the real runtime (node:sqlite) and the shipped strike-lab mission, driven
// headless: only the two puzzle answers are evidence; aim, power, spin, rolls, pins down, strikes,
// second balls and BOWL AGAIN never are; a bowling miss after a right answer asks nothing again;
// leaving and an app restart resume the round; the playtest tally counts what it should.
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
import { createStrikeFlow, pairParts, pinsOfPair, type StrikeFlow, type Task } from './flow';
import { LANE, previewPath, rack, simulate } from './lane';

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
/** Tap the two pins of an option (frame 2). */
async function tapPair(f: StrikeFlow, optionId: string) {
  const t = f.view().task!;
  if (t.kind !== 'target') throw new Error('not a target task');
  const [a, b] = pinsOfPair(t, t.options.find((o) => o.id === optionId)!.value);
  await f.pickPin(a!);
  await f.pickPin(b!);
}
/** Bowl one ball and let it settle. */
function bowl(f: StrikeFlow) {
  f.bowl();
  f.settle();
  f.ready();
}
/** Bowl until the frame is over (one or two balls). */
function finishFrame(f: StrikeFlow) {
  for (let i = 0; i < 2 && f.view().stage === 'aim'; i++) bowl(f);
  expect(f.view().stage).toBe('result');
}

describe('Strike Lab V0.1', () => {
  it('ships valid copy, a two-frame mission, and a lane where the controls change the path', () => {
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
    // Deterministic, and a straight centre ball knocks pins down.
    expect(simulate(base, 'ten')).toEqual(simulate(base, 'ten'));
    expect(simulate(base, 'ten').down.filter(Boolean).length).toBeGreaterThan(5);
    expect(rack('ten')).toHaveLength(10);
    expect(rack('five').every((p) => p.y >= LANE.head)).toBe(true);
  });

  it('plays a whole round: only the two answers are evidence, never the bowling', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    expect(f.view().stage).toBe('intro');
    f.begin();
    expect(f.view().stage).toBe('puzzle');
    expect(f.view().task!.kind).toBe('smart');
    await f.choose(rightOption(f.view().task!));
    expect(f.view()).toMatchObject({ stage: 'aim', solved: true, frame: 1 });
    f.setShot({ aim: 0.2, power: 0.9, spin: -0.4 });
    finishFrame(f);
    // Another go at frame 1: a fresh rack, nothing asked again.
    f.bowlAgain();
    expect(f.view().stage).toBe('aim');
    finishFrame(f);
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 0, 'independent']]);
    await f.nextFrame(w.clock.now());
    expect(f.view()).toMatchObject({ stage: 'puzzle', frame: 2 });
    await tapPair(f, rightOption(f.view().task!));
    expect(f.view()).toMatchObject({ stage: 'aim', frame: 2 });
    expect(f.view().targets).toHaveLength(2);
    finishFrame(f);
    await f.nextFrame(w.clock.now());
    expect(f.view()).toMatchObject({ stage: 'aim', frame: 3 });
    for (let i = 0; i < 3; i++) {
      finishFrame(f);
      f.bowlAgain();
    }
    finishFrame(f);
    await f.nextFrame(w.clock.now());
    expect(f.view().stage).toBe('done');
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 0, 'independent'],
      ['pairs.make-target', 'correct', 0, 'independent'],
    ]);
    const types = (await w.events()).map((e) => e.type);
    expect(types.filter((t) => t === 'attempt')).toHaveLength(2);
    expect(f.view().notes).toMatchObject({ rounds: 1, completed: 1, attempts: 2, wrong: 0, frameRetries: 4 });
    expect(f.view().notes.labBowls).toBeGreaterThanOrEqual(4);
    expect(f.view().totals.pins).toBeGreaterThan(0);
    await w.done();
  });

  it('a wrong module shows its consequence and greys; the right one after it is not independent', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    f.begin();
    const t = f.view().task!;
    if (t.kind !== 'smart') throw new Error('frame 1 is the Smart Ball');
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

  it('frame 2: a wrong pair says its sum; a target pin missed after the right pair is a bowling miss', async () => {
    const w = await world();
    const { flow: f } = await w.open();
    f.begin();
    await f.choose(rightOption(f.view().task!));
    finishFrame(f);
    await f.nextFrame(w.clock.now());
    const t = f.view().task!;
    if (t.kind !== 'target') throw new Error('frame 2 is the target');
    const wrong = wrongOption(t);
    await tapPair(f, wrong);
    const [a, b] = pairParts(t.options.find((o) => o.id === wrong)!.value)!;
    expect(f.view().line).toEqual({ key: 'targetWrong', vars: { a, b, sum: a + b, target: t.target } });
    await tapPair(f, wrong); // the same pair again: said again, not sent
    expect((await w.attempts()).length).toBe(1);
    await tapPair(f, rightOption(t));
    expect(f.view().stage).toBe('aim');
    const after = (await w.events()).length;
    // A gutter ball (far left with left spin) misses every pin: a bowling miss, nothing asked again.
    f.setShot({ aim: -1, spin: -1, power: 0.5 });
    bowl(f);
    expect(f.view()).toMatchObject({ stage: 'aim', ball: 2, outcome: 'targetMiss' });
    bowl(f);
    expect(f.view()).toMatchObject({ stage: 'result', frameOver: true, outcome: 'targetMiss' });
    f.bowlAgain();
    expect(f.view()).toMatchObject({ stage: 'aim', solved: true });
    expect(f.view().standing.every(Boolean)).toBe(true);
    for (let i = 0; i < 3; i++) bowl(f);
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
    f.begin();
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

  it('leaving and a restart resume the round: a powered ball stays powered, lit targets stay lit', async () => {
    const w = await world();
    let s = await w.open();
    s.flow.begin();
    await s.flow.choose(rightOption(s.flow.view().task!));
    await s.flow.leave(w.clock.now());
    await s.close();
    s = await w.open();
    expect(s.flow.view()).toMatchObject({ stage: 'intro', line: { key: 'resume' } });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', frame: 1, solved: true });
    finishFrame(s.flow);
    await s.flow.nextFrame(w.clock.now());
    const t = s.flow.view().task!;
    if (t.kind !== 'target') throw new Error('frame 2 is the target');
    await tapPair(s.flow, rightOption(t));
    const lit = s.flow.view().targets;
    // The app closes without leaving (a crash): the right pair is held in the runtime.
    s.flow.dispose();
    await w.restart();
    s = await w.open();
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', frame: 2, targets: lit });
    expect(s.flow.view().notes).toMatchObject({ rounds: 1, resumes: 2, exits: 1 });
    expect(await w.rows()).toHaveLength(2);
    await w.done();
  });

  it('PLAY AGAIN and Start Over: a new round for the same learner, a fresh tally for a new one', async () => {
    const w = await world();
    let s = await w.open();
    s.flow.begin();
    await s.flow.choose(rightOption(s.flow.view().task!));
    finishFrame(s.flow);
    await s.flow.nextFrame(w.clock.now());
    await tapPair(s.flow, rightOption(s.flow.view().task!));
    finishFrame(s.flow);
    await s.flow.nextFrame(w.clock.now());
    finishFrame(s.flow);
    await s.flow.nextFrame(w.clock.now());
    await s.flow.again();
    await s.close();
    s = await w.open();
    expect(s.flow.view()).toMatchObject({ stage: 'intro', line: { key: 'intro' } });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', frame: 1 });
    expect(s.flow.view().notes).toMatchObject({ rounds: 2, completed: 1, again: 1 });
    // Start Over makes a new learner: its round and its tally start from nothing.
    await w.rt().createLearner({ id: 'learner-b', themePack: THEME_PACK_ID });
    const b = await w.open('learner-b');
    expect(b.flow.view().notes).toMatchObject({ rounds: 1, completed: 0, again: 0, attempts: 0 });
    b.flow.begin();
    expect(b.flow.view()).toMatchObject({ stage: 'puzzle', frame: 1 });
    await w.done();
  });
});
