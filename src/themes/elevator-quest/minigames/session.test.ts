// The mini-game session adapter (M9) against the real runtime and SQLite: one instance per play
// session, resumed when unfinished; evidence only through submit; idempotent commands, so leaving
// and coming back, sending again, or restarting the app never adds an attempt; gameplay saves are
// settings, never learning records.
import { MissionDefinitionSchema, type Response } from '../../../engine';
import { loadLearningEvents } from '../../../persistence/store';
import { fakeClock, tempDir } from '../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../content/floor15';
import { startOverLearner } from '../sessionCore';
import { GAME_SETTING_PREFIX, SAVE_LIMIT, inflightKey, openMiniGameSession, saveKey, type MiniGameSessionHandle } from './session';
import { cargoInstanceFor, miniGameById } from './catalog';
import coreMissions from '../../../../content/missions/core.json';
import twoDigitPack from '../../../../content/packs/two-digit.json';
import { cargoActivities, chooseCargoSession } from './cargo/tiers';
import { learningRows, openTestRuntime, testGame } from './testing/gameContent';
import type { MiniGameSession } from './types';

const LEARNER = 'learner-a';

async function setup(file: string, clock = fakeClock()) {
  const opened = await openTestRuntime(file, clock);
  if (!(await opened.rt.getLearner(LEARNER))) await opened.rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  const open = (id: 'word-golf' | 'cargo-commander' = 'word-golf') => openMiniGameSession({ runtime: opened.rt, learnerId: LEARNER, game: testGame(id), clock, newInstanceId: () => `${id}-test-${++n}` });
  return { ...opened, clock, open };
}

/** The right and a wrong response for the item on screen, found through the runtime's pure check (tests only). */
function answers(s: MiniGameSession): { right: Response; wrong: Response } {
  const c = s.challenge()!;
  const candidates: Response[] = c.answer.mode === 'choice' ? c.options.map((o) => ({ mode: 'choice', optionId: o.id })) : Array.from({ length: 20 }, (_, i) => ({ mode: 'value', value: i + 1 }));
  const right = candidates.find((r) => s.check(r)?.correct === true)!;
  const wrong = candidates.find((r) => s.check(r)?.correct === false)!;
  return { right, wrong };
}

const attempts = async (db: Awaited<ReturnType<typeof setup>>['db']) => (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));

describe('mini-game session', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('starts an instance, and the next visit resumes the unfinished one', async () => {
    const t = await setup(tmp.file);
    const first = await t.open();
    expect(first.session.resumed).toBe(false);
    expect(first.session.challenge()).not.toBeNull();
    const key = first.session.challenge()!.key;
    await first.close();
    const again = await t.open();
    expect({ id: again.session.instanceId, resumed: again.session.resumed, key: again.session.challenge()!.key }).toEqual({ id: first.session.instanceId, resumed: true, key });
    await again.close();
    await t.db.close();
  });

  it('records only through submit: a miss, then a right answer, held back until next()', async () => {
    const t = await setup(tmp.file);
    const { session, close } = await t.open();
    const before = await learningRows(t.db);
    const { right, wrong } = answers(session);
    // check() is instant and writes nothing.
    expect(session.check(right)).toEqual({ correct: true, misconception: null });
    expect(session.check(wrong)?.correct).toBe(false);
    expect(await learningRows(t.db)).toEqual(before);
    // The view never carries the answer: no field of the challenge holds it.
    expect(Object.values(session.challenge()!.prompt)).not.toContain('answer');

    const miss = await session.submit(wrong);
    expect(miss).toMatchObject({ status: 'answered', correct: false, evidence: 'incorrect', fresh: false, done: false });
    expect(session.challenge()!.wrongTries).toBe(1);
    expect((await attempts(t.db)).length).toBe(0); // a retry-able miss resolves nothing yet

    const hit = await session.submit(answers(session).right);
    expect(hit).toMatchObject({ status: 'answered', correct: true, evidence: 'retry', done: false });
    const recorded = await attempts(t.db);
    expect(recorded.map((a) => [a.outcome, a.assistance, a.missionInstanceId])).toEqual([['correct', 'retry', session.instanceId]]);
    // The engine moved on; the session holds the next item back for the game's moment.
    expect(session.progress().phase).toBe('solved');
    expect(session.challenge()).toBeNull();
    expect(session.solvedAnswer()).toEqual({ value: (right as { value: number }).value, evidence: 'retry' });
    expect(await session.submit(right)).toEqual({ status: 'refused', reason: 'noChallenge' });
    expect(session.check(right)).toBeNull();
    const next = await session.next();
    expect(next).not.toBeNull();
    expect(next!.item.index).toBe(1);
    expect(session.progress()).toMatchObject({ phase: 'challenge', solved: 1 });
    await close();
    await t.db.close();
  });

  it('help goes through useScaffold; a right answer after SHOW ME is recorded as demonstrated, never independent', async () => {
    const t = await setup(tmp.file);
    const { session, close } = await t.open();
    expect(session.challenge()!.help).toMatchObject({ kind: 'highlightGiven', assistance: 'clue', offered: false });
    const clue = await session.help();
    expect(clue).toMatchObject({ kind: 'highlightGiven', assistance: 'clue', revealed: null });
    // The reading ladder offers SHOW ME only after a miss (the pack's policy decides, not the game).
    if (!session.challenge()!.help) await session.submit(answers(session).wrong);
    expect(session.challenge()!.help).toMatchObject({ kind: 'showAnswer', assistance: 'demonstrated' });
    const show = await session.help();
    expect(show!.revealed).not.toBeNull();
    expect(session.challenge()!.revealed).toBe(show!.revealed);
    expect(await session.help()).toBeNull();
    expect((await learningRows(t.db)).events).toBe(0); // help is checkpoint state, not an attempt
    const r = await session.submit({ mode: 'value', value: show!.revealed as number });
    expect(r).toMatchObject({ status: 'answered', correct: true, evidence: 'demonstrated' });
    expect((await attempts(t.db)).map((a) => a.assistance)).toEqual(['demonstrated']);
    await close();
    await t.db.close();
  });

  it('a second answer while one is in flight is refused; sending an answer again never adds an attempt', async () => {
    const t = await setup(tmp.file);
    const { session, close } = await t.open();
    const { right } = answers(session);
    const [a, b] = await Promise.all([session.submit(right), session.submit(right)]);
    expect([a.status, b]).toEqual(['answered', { status: 'refused', reason: 'busy' }]);
    expect((await attempts(t.db)).length).toBe(1);
    // The same command id again (what a retry after a lost reply sends): the stored result, no write.
    const id = `${session.instanceId}:mg:r1:submit`;
    const again = await t.rt.submit(session.instanceId, { commandId: id, basedOn: 1, value: (right as { value: number }).value });
    expect(again.duplicate).toBe(true);
    expect((await attempts(t.db)).length).toBe(1);
    await close();
    await t.db.close();
  });

  it('leaving and coming back, or restarting the app, never adds an attempt; a right answer just before a restart is still waiting for the game', async () => {
    const clock = fakeClock();
    let t = await setup(tmp.file, clock);
    let h: MiniGameSessionHandle = await t.open();
    const id = h.session.instanceId;
    await h.session.submit(answers(h.session).right);
    const rows = await learningRows(t.db);
    expect(rows.events).toBe(1);
    // Leave and come back (BACK TO ELEVATOR, PLAY again): the same instance, nothing written.
    await h.close();
    h = await t.open();
    expect(h.session.instanceId).toBe(id);
    expect(await learningRows(t.db)).toEqual(rows);
    // It came back "solved": the right answer is read back from the stored result (same command id).
    expect(h.session.progress().phase).toBe('solved');
    expect(h.session.solvedAnswer()?.evidence).toBe('independent');
    // The app is killed before next(): a fresh process, a fresh runtime over the same file.
    t.rt.dropMemory();
    await t.db.close();
    t = await setup(tmp.file, clock);
    h = await t.open();
    expect({ id: h.session.instanceId, phase: h.session.progress().phase }).toEqual({ id, phase: 'solved' });
    expect(await learningRows(t.db)).toEqual(rows);
    // Once the game moved on, a restart shows the next item and still writes nothing.
    await h.session.next();
    const key = h.session.challenge()!.key;
    await h.close();
    t.rt.dropMemory();
    await t.db.close();
    t = await setup(tmp.file, clock);
    h = await t.open();
    expect({ phase: h.session.progress().phase, key: h.session.challenge()!.key }).toEqual({ phase: 'challenge', key });
    expect(await learningRows(t.db)).toEqual(rows);
    await h.close();
    await t.db.close();
  });

  it('an answer that never committed is dropped on restart (the child answers again), never sent behind their back', async () => {
    const clock = fakeClock();
    const t = await setup(tmp.file, clock);
    const h = await t.open();
    // As if the app died after noting the answer but before the commit.
    await t.rt.putSetting(LEARNER, inflightKey('word-golf'), JSON.stringify({ v: 1, instanceId: h.session.instanceId, commandId: `${h.session.instanceId}:mg:r1:submit`, basedOn: 1, response: answers(h.session).right, evidence: 'independent' }));
    await h.close();
    const again = await t.open();
    expect(again.session.progress().phase).toBe('challenge');
    expect((await learningRows(t.db)).events).toBe(0);
    expect((await t.rt.settings(LEARNER))[inflightKey('word-golf')]).toBe('');
    await again.close();
    await t.db.close();
  });

  it('gameplay calls (saves, loads, checks, reads) never write learning records or move the checkpoint', async () => {
    const t = await setup(tmp.file);
    const { session, close } = await t.open();
    const before = await learningRows(t.db);
    const revision = t.rt.currentView(session.instanceId).revision;
    const { right, wrong } = answers(session);
    for (let shot = 0; shot < 40; shot++) {
      // A golf shot, a crate moved, a replay: the game saves its state as it likes.
      void session.saveGame({ hole: 1, ball: { x: shot, y: 2 * shot }, crates: [shot % 3] });
      session.check(shot % 2 ? right : wrong);
      session.challenge();
      session.progress();
      session.story();
    }
    await session.saveGame({ hole: 2, ball: { x: 1, y: 1 }, crates: [] });
    expect(await session.loadGame()).toEqual({ hole: 2, ball: { x: 1, y: 1 }, crates: [] });
    expect(await learningRows(t.db)).toEqual(before);
    expect(t.rt.currentView(session.instanceId).revision).toBe(revision);
    await expect(session.saveGame({ big: 'x'.repeat(SAVE_LIMIT) })).rejects.toThrow(/at most/);
    await close();
    await t.db.close();
  });

  it("a save belongs to its instance: a new game never loads the last one's state; finish() clears it and the next visit starts anew", async () => {
    const t = await setup(tmp.file);
    let h = await t.open('cargo-commander');
    expect(h.session.story()).toEqual({ stepId: 'brief', eventKey: 'cargo.brief' });
    expect(h.session.challenge()).toBeNull();
    expect(await h.session.next()).not.toBeNull(); // the story beat is acknowledged
    await h.session.saveGame({ crates: [3, 4] });
    const r = await h.session.submit(answers(h.session).right);
    expect(r).toMatchObject({ correct: true, done: true });
    expect(h.session.progress()).toMatchObject({ phase: 'solved', done: false });
    expect(await h.session.next()).toBeNull();
    expect(h.session.progress()).toMatchObject({ phase: 'done', done: true });
    expect(await h.session.loadGame()).toEqual({ crates: [3, 4] });
    await h.session.finish();
    expect(await h.session.submit({ mode: 'value', value: 1 })).toEqual({ status: 'refused', reason: 'closed' });
    expect((await t.rt.settings(LEARNER))[saveKey('cargo-commander')]).toBe('');
    await h.close();
    const first = h.session.instanceId;
    h = await t.open('cargo-commander');
    expect({ fresh: h.session.instanceId !== first, resumed: h.session.resumed, saved: await h.session.loadGame() }).toEqual({ fresh: true, resumed: false, saved: null });
    await h.close();
    await t.db.close();
  });

  it('a game with one mission per tier resumes any of them and starts the one chooseMission picks', async () => {
    const t = await setup(tmp.file);
    const game = { ...testGame('word-golf'), missionId: 'test-word-golf', missions: ['test-word-golf', 'test-cargo-commander'], chooseMission: () => 'test-cargo-commander' };
    const h = await openMiniGameSession({ runtime: t.rt, learnerId: LEARNER, game, clock: t.clock, newInstanceId: () => 'tiered-1' });
    expect(h.session.story()?.eventKey).toBe('cargo.brief'); // the chosen mission
    await h.close();
    const again = await openMiniGameSession({ runtime: t.rt, learnerId: LEARNER, game: { ...game, chooseMission: () => 'test-word-golf' }, clock: t.clock, newInstanceId: () => 'tiered-2' });
    expect({ id: again.session.instanceId, resumed: again.session.resumed }).toEqual({ id: 'tiered-1', resumed: true });
    await again.close();
    await t.db.close();
  });

  it('a game may pick its new instance id (it seeds the pools): kept when it starts with the base, else the base', async () => {
    const t = await setup(tmp.file);
    const seen: string[] = [];
    const game = { ...testGame('word-golf'), chooseInstanceId: (_l: unknown, base: string, mission: string) => (seen.push(mission), `${base}-tier7`) };
    const h = await openMiniGameSession({ runtime: t.rt, learnerId: LEARNER, game, clock: t.clock, newInstanceId: () => 'wg-base' });
    expect({ id: h.session.instanceId, seen }).toEqual({ id: 'wg-base-tier7', seen: ['test-word-golf'] });
    await h.session.submit(answers(h.session).right);
    await h.session.next();
    await h.session.submit(answers(h.session).right);
    await h.session.next();
    await h.session.submit(answers(h.session).right);
    await h.close();
    const odd = await openMiniGameSession({ runtime: t.rt, learnerId: LEARNER, game: { ...game, chooseInstanceId: () => 'elsewhere' }, clock: t.clock, newInstanceId: () => 'wg-base-2' });
    expect(odd.session.instanceId).toBe('wg-base-2');
    await odd.close();
    await t.db.close();
  });

  it("Cargo Commander starts the instance EC's tiers choose: its pools give the planned loads", async () => {
    const t = await setup(tmp.file);
    const game = miniGameById('cargo-commander')!;
    const h = await openMiniGameSession({ runtime: t.rt, learnerId: LEARNER, game, clock: t.clock, newInstanceId: () => 'cargo-base' });
    const expected = cargoInstanceFor(await t.rt.learnerState(LEARNER), 'cargo-base', 'cargo-commander');
    expect(h.session.instanceId).toBe(expected);
    if (h.session.story()) await h.session.next();
    const mission = MissionDefinitionSchema.parse(coreMissions.missions.find((m) => m.id === 'cargo-commander'));
    const plan = chooseCargoSession({ base: 'cargo-base', state: await t.rt.learnerState(LEARNER), mission, activities: cargoActivities(mission, twoDigitPack as { activities: { id: string; skills: string[] }[] }) });
    // The runtime presents what the search planned (the engine's pool choice from the same id).
    expect({ id: plan.instanceId, first: h.session.challenge()!.activityId }).toEqual({ id: h.session.instanceId, first: plan.activities[0] });
    await h.close();
    await t.db.close();
  });

  it('Start Over leaves game progress behind with the old learner (D143): saves and the open-game record stay', async () => {
    const t = await setup(tmp.file);
    await t.rt.putSetting(LEARNER, 'motion', 'reduced');
    await t.rt.putSetting(LEARNER, saveKey('word-golf'), JSON.stringify({ v: 1, instanceId: 'x', state: { hole: 3 } }));
    await t.rt.putSetting(LEARNER, `${GAME_SETTING_PREFIX}host`, JSON.stringify({ v: 1, game: 'word-golf', floor: 20 }));
    const next = await startOverLearner(t.rt, LEARNER, THEME_PACK_ID);
    const kept = await t.rt.settings(next);
    expect(kept).toEqual({ motion: 'reduced' });
    await t.db.close();
  });
});
