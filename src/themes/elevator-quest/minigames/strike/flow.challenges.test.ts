/// <reference types="node" />
// Strike Lab's three arcade challenges (issue #3, stage 2) over the real runtime (node:sqlite), the
// shipped missions and the shipped catalog entry, driven headless. Each challenge changes the bowling,
// not only the question:
//   Pin Pursuit   the right pair lights two numbered pins, from a new formation each step
//   Word Strike   spin stays locked until the word is right; a post makes the spin necessary
//   Physics Lab   the test strip starts on the surface that cannot work; the child switches it
// Only the committed answers are evidence. A shot earned and not played survives a level switch, a
// reload and reopening the level, and comes back with no question and nothing recorded twice.
import spellingPack from '../../../../../content/packs/spelling.json';
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameSound } from '../types';
import { firstFreeTile } from '../wordGolf/tiles';
import { LISTED, nextChallenge } from './challenges';
import { FREE_RETRIES, createStrikeFlow, pairParts, pinsOfPair, resultActions, type StrikeFlow, type Task } from './flow';
import { guideShot, simulate, targetsDown, type Shot } from './lane';

const LEARNER = 'learner-a';
const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };
const GAME = miniGameById('strike')!;
const PURSUIT = 'strike-pin-pursuit';
const WORD = 'strike-word-strike';
const LAB = 'strike-physics-lab';
/** wordId -> the word, from the spelling pack (the item names its word only by id). */
const WORDS = new Map((spellingPack as { activities: { params: { words: { id: string; word: string }[] } }[] }).activities.flatMap((a) => a.params.words.map((w) => [w.id, w.word] as const)));

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
  /** A level from the level map, or the entrance's PLAY (none). */
  const open = async (mission?: string) => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: GAME, ...(mission ? { mission } : {}), clock, newInstanceId: () => `strike-${clock.now()}-${++n}` });
    const flow = createStrikeFlow({ session: h.session, sound: silent });
    await flow.start(clock.now());
    return { flow, session: h.session, close: () => h.close() };
  };
  const rows = async () =>
    (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [[e.event.attempt.activityId, e.event.attempt.outcome, e.event.attempt.assistance]] : []));
  const events = async () => (await loadLearningEvents(db, LEARNER)).length;
  return { open, restart, rows, events, clock, done: async () => { await db.close(); tmp.cleanup(); } };
}

const settleWrites = () => new Promise((r) => setTimeout(r, 50));
function rightOption(t: Task): string {
  if (t.kind === 'smart') return t.options.find((o) => o.value === t.needed - t.present)!.id;
  if (t.kind === 'target') return t.options.find((o) => (pairParts(o.value) ?? [0, 0]).reduce((a, b) => a + b, 0) === t.target)!.id;
  throw new Error('a spelling task has no options');
}
async function answer(f: StrikeFlow) {
  const t = f.view().task!;
  if (t.kind === 'smart') return f.choose(rightOption(t));
  if (t.kind === 'target') {
    const [a, b] = pinsOfPair(t, t.options.find((o) => o.id === rightOption(t))!.value);
    await f.pickPin(a!);
    return f.pickPin(b!);
  }
  return spellWord(f, WORDS.get(t.wordId!)!);
}
async function spellWord(f: StrikeFlow, word: string) {
  for (const letter of word) f.placeTile(firstFreeTile(f.view().tray!, letter)!);
  await f.spell();
}
/** A ball that clears the objective here (the guide search, as a skilled child aims). */
function aimToClear(f: StrikeFlow) {
  const v = f.view();
  const shot = guideShot(v.lane, v.targets, { spin: v.spinOpen, standing: v.standing });
  if (!shot) throw new Error('no shot clears this lane as it is');
  f.setShot(shot);
}
/** A ball that leaves an objective pin standing. */
function aimToMiss(f: StrikeFlow) {
  const v = f.view();
  for (const power of [0.6, 0.3, 1]) for (let a = -10; a <= 10; a++) {
    const shot: Shot = { aim: a / 10, spin: 0, power };
    if (!targetsDown(simulate(shot, v.lane, v.standing), v.targets, v.standing)) return f.setShot(shot);
  }
  throw new Error('no missing shot');
}
function ball(f: StrikeFlow) {
  f.bowl();
  f.settle();
  f.ready();
}
function clearFrame(f: StrikeFlow) {
  for (let i = 0; i < 2 && f.view().stage === 'aim'; i++) {
    aimToClear(f);
    ball(f);
  }
  expect(f.view()).toMatchObject({ stage: 'result', outcome: 'cleared' });
}
function missFrame(f: StrikeFlow) {
  for (let i = 0; i < 2 && f.view().stage === 'aim'; i++) {
    aimToMiss(f);
    ball(f);
  }
  expect(f.view()).toMatchObject({ stage: 'result', frameOver: true });
}
function warmUp(f: StrikeFlow) {
  f.begin();
  expect(f.view()).toMatchObject({ stage: 'aim', mode: 'practice' });
  ball(f);
  f.proceed();
}

describe('Strike Lab: the three arcade challenges (issue #3, stage 2)', () => {
  it('the catalog lists the three challenges; a new session opens the first not finished; the classic round only resumes', () => {
    expect(LISTED.map((c) => c.missionId)).toEqual([PURSUIT, WORD, LAB]);
    expect(GAME.missionId).toBe('strike-lab');
    expect(nextChallenge([])).toBe(PURSUIT);
    expect(nextChallenge([PURSUIT])).toBe(WORD);
    expect(nextChallenge([PURSUIT, WORD, LAB])).toBe(PURSUIT);
  });

  it('Pin Pursuit: the right pair lights two numbered pins, from five, a V and a wide row; only the pairs are evidence', async () => {
    const w = await world();
    const { flow: f } = await w.open(PURSUIT);
    expect(f.view()).toMatchObject({ challenge: 'pin-pursuit', steps: 3, line: { key: 'introPursuit' } });
    warmUp(f);
    const formations: string[] = [];
    for (let step = 0; step < 3; step++) {
      expect(f.view()).toMatchObject({ stage: 'puzzle', step });
      expect(f.view().task!.kind).toBe('target');
      formations.push(f.view().lane.rack);
      await answer(f);
      expect(f.view().targets).toHaveLength(2);
      expect(f.view()).toMatchObject({ stage: 'aim', spinOpen: true });
      clearFrame(f);
      await f.next(w.clock.now());
    }
    expect(formations).toEqual(['five', 'vee', 'wide']);
    expect(f.view().stage).toBe('done');
    expect(f.view().levels.find((l) => l.current)).toMatchObject({ id: 'pin-pursuit', done: true });
    expect(await w.rows()).toEqual([
      ['pairs.make-target', 'correct', 'independent'],
      ['pairs.make-target', 'correct', 'independent'],
      ['pairs.make-target', 'correct', 'independent'],
    ]);
    await w.done();
  });

  it('Word Strike: spin is locked until the word is right; the post makes spin necessary; a wrong word, then the right one (retry)', async () => {
    const w = await world();
    const { flow: f } = await w.open(WORD);
    expect(f.view()).toMatchObject({ challenge: 'word-strike', line: { key: 'introWord' } });
    f.begin();
    // The warm-up: spin locked (the word unlocks it).
    expect(f.view()).toMatchObject({ mode: 'practice', spinOpen: false, line: { key: 'practiceLocked' } });
    f.setShot({ spin: 1 });
    expect(f.view().shot.spin).toBe(0);
    ball(f);
    f.proceed();
    const t = f.view().task!;
    if (t.kind !== 'spell') throw new Error('Word Strike asks for a word');
    expect(f.view()).toMatchObject({ stage: 'puzzle', spinOpen: false, line: { key: 'spellAsk' } });
    expect(f.view().tray!.slots).toHaveLength(t.length);
    // The post: no straight ball gets the target, a hooked one does.
    expect(guideShot(f.view().lane, [0], { spin: false })).toBeNull();
    expect(guideShot(f.view().lane, [0], { spin: true })).not.toBeNull();
    // A wrong word: the letters go back, nothing about the bowling changes.
    const word = WORDS.get(t.wordId!)!;
    const wrong = [...word].reverse().join('') === word ? word.slice(1) + word[0] : [...word].reverse().join('');
    await spellWord(f, wrong);
    expect(f.view()).toMatchObject({ stage: 'puzzle', spinOpen: false });
    if (f.view().task!.key === t.key) {
      expect(f.view().line.key).toBe('spellWrong');
      expect(f.view().tray!.slots.every((x) => x === null)).toBe(true);
    }
    await answer(f);
    expect(f.view()).toMatchObject({ stage: 'aim', spinOpen: true, targets: [0], line: { key: 'spellReady' } });
    // Three missed frames, then GUIDED SHOT: its guide needs the spin.
    for (let i = 0; i <= FREE_RETRIES; i++) {
      missFrame(f);
      if (i < FREE_RETRIES) f.retry();
    }
    f.guided();
    expect(f.view().guide).not.toBeNull();
    expect(f.view().guide!.spin).not.toBe(0);
    f.setShot(f.view().guide!);
    ball(f);
    if (f.view().stage === 'aim') ball(f);
    expect(f.view().outcome).toBe('cleared');
    await f.next(w.clock.now());
    // Step two: another word, the five pins behind a post.
    expect(f.view()).toMatchObject({ stage: 'puzzle', step: 1, spinOpen: false, lane: { rack: 'five' } });
    await answer(f);
    clearFrame(f);
    await f.next(w.clock.now());
    expect(f.view().stage).toBe('done');
    const rows = await w.rows();
    expect(rows.every((r) => String(r[0]).startsWith('spelling.'))).toBe(true);
    expect(rows.filter((r) => r[1] === 'correct')).toHaveLength(2);
    expect(rows.find((r) => r[1] === 'correct')![2]).not.toBe('independent');
    await w.done();
  });

  it('Physics Lab: the strip starts on the surface that cannot work; switching it makes the shot; GUIDED SHOT names the surface; only the answers are evidence', async () => {
    const w = await world();
    const { flow: f } = await w.open(LAB);
    expect(f.view()).toMatchObject({ challenge: 'physics-lab', line: { key: 'introPhysics' } });
    warmUp(f);
    await answer(f);
    expect(f.view()).toMatchObject({ stage: 'aim', surface: 'oil', targets: [2], line: { key: 'surfaceReady' } });
    // On the slick strip no shot gets past the post to the target; on the grippy one, one does.
    expect(guideShot(f.view().lane, [2], { spin: true })).toBeNull();
    f.setSurface('grip');
    expect(f.view().lane.surfaces).toEqual([expect.objectContaining({ kind: 'grip' })]);
    expect(guideShot(f.view().lane, [2], { spin: true })).not.toBeNull();
    // Back to slick, three missed frames: GUIDED SHOT's guide rolls on the grippy strip, and says so.
    f.setSurface('oil');
    for (let i = 0; i <= FREE_RETRIES; i++) {
      missFrame(f);
      if (i < FREE_RETRIES) f.retry();
    }
    const before = await w.events();
    f.guided();
    expect(f.view()).toMatchObject({ mode: 'guided', surface: 'oil', guideSurface: 'grip', line: { key: 'guidedSurface' } });
    expect(f.view().guide).not.toBeNull();
    f.setSurface('grip');
    expect(f.view()).toMatchObject({ surface: 'grip', guideSurface: 'grip', line: { key: 'guidedAsk' } });
    f.setShot(f.view().guide!);
    ball(f);
    if (f.view().stage === 'aim') ball(f);
    expect(f.view().outcome).toBe('cleared');
    expect(await w.events()).toBe(before);
    await f.next(w.clock.now());
    // Step two: the strip starts grippy, and only slick works here.
    await answer(f);
    expect(f.view()).toMatchObject({ surface: 'grip', lane: { rack: 'wide' } });
    expect(guideShot(f.view().lane, [2], { spin: true })).toBeNull();
    f.setSurface('oil');
    clearFrame(f);
    await f.next(w.clock.now());
    expect(f.view().stage).toBe('done');
    expect(await w.rows()).toEqual([
      ['power-cells.fill', 'correct', 'independent'],
      ['power-cells.fill', 'correct', 'independent'],
    ]);
    await w.done();
  });

  it('levels: an earned shot survives switching levels, a reload and reopening; it comes back with no question and nothing recorded twice', async () => {
    const w = await world();
    // Pin Pursuit: warm-up, the right pair, one ball missed; then the level map opens Word Strike.
    let s = await w.open(PURSUIT);
    warmUp(s.flow);
    await answer(s.flow);
    const lit = s.flow.view().targets;
    aimToMiss(s.flow);
    ball(s.flow);
    await s.flow.switchLevel(w.clock.now());
    await settleWrites();
    s.flow.dispose();
    await s.close();
    s = await w.open(WORD);
    s.flow.begin();
    // Same visit: no warm-up; Word Strike's own question.
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', challenge: 'word-strike' });
    s.flow.dispose();
    await s.close();

    // A reload, then the level map opens Pin Pursuit again: its shot first, the frame where it stood.
    await w.restart();
    s = await w.open(PURSUIT);
    expect(s.flow.view()).toMatchObject({ challenge: 'pin-pursuit', practiceUsed: true });
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'result', carried: true, targets: lit, attempt: 1, task: null });
    expect(resultActions(s.flow.view())).toEqual(['retry']);
    s.flow.retry();
    // Leaving mid-frame and reopening through the entrance: the same shot again (it is still owed).
    await s.flow.leave(w.clock.now());
    await s.close();
    s = await w.open();
    expect(s.session.missionId).toBe(PURSUIT);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', carried: true, targets: lit, attempt: 2 });
    clearFrame(s.flow);
    await s.flow.next(w.clock.now());
    // Played out: on to this level's next question; the shot is off the notes.
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', carried: false });
    expect(s.flow.view().notes.earned[PURSUIT]).toBeUndefined();
    // The one pair answered is the one attempt on record: the carried shot asked nothing and recorded nothing.
    expect((await w.rows()).filter((r) => r[0] === 'pairs.make-target')).toEqual([['pairs.make-target', 'correct', 'independent']]);
    await w.done();
  });

  it('a held answer on a one-step-at-a-time switch: the session holds it and the notes do not play it twice', async () => {
    const w = await world();
    let s = await w.open(LAB);
    warmUp(s.flow);
    await answer(s.flow);
    s.flow.setSurface('grip');
    await settleWrites();
    s.flow.dispose();
    await w.restart();
    // Through the entrance: the session restores its held answer (same instance); the notes agree.
    s = await w.open();
    expect(s.session.missionId).toBe(LAB);
    s.flow.begin();
    expect(s.flow.view()).toMatchObject({ stage: 'aim', carried: false, solved: true, surface: 'grip', targets: [2] });
    clearFrame(s.flow);
    await s.flow.next(w.clock.now());
    expect(s.flow.view()).toMatchObject({ stage: 'puzzle', step: 1 });
    expect(await w.rows()).toEqual([['power-cells.fill', 'correct', 'independent']]);
    await w.done();
  });
});
