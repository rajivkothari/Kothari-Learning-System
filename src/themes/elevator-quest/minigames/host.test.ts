// The mini-game host and the director's pause (M9), headless over the real director, runtime and
// SQLite on virtual time: opening a game pauses the elevator (no answer window, no evidence, nothing
// completed or abandoned), BACK TO ELEVATOR gives it back unchanged at the same floor with the doors
// open, and a restart in a game comes back at that landing with the game still on offer.
import { canonicalJson } from '../../../engine';
import { activeTestLearner } from '../../../runtime/devSeed';
import { THEME_PACK_ID } from '../content/floor15';
import { createFloor15Director } from '../director/director';
import { createPlaytestLog } from '../director/playtestLog';
import { jumpTo } from '../devtools/floor15Tools';
import { openSession, settled, solve, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { HOST_KEY, createMiniGameHost, readHostRecord, type MiniGameHost } from './host';
import { gameEntrance } from './hostEntrance';
import { GAME_TEST_CONTENT, TEST_CATALOG, learningRows, openTestRuntime } from './testing/gameContent';
import type { MiniGameSession } from './types';

const BASE = 'learner-test-a';

async function at(file: string, time: VirtualTime, jump: string): Promise<{ s: Session; host: MiniGameHost; learner: string }> {
  const { db, rt } = await openTestRuntime(file, time);
  const learner = await activeTestLearner(rt, BASE, THEME_PACK_ID);
  const instanceId = await jumpTo({ db, runtime: rt, content: GAME_TEST_CONTENT, now: () => time.now() }, learner, jump);
  await db.close();
  const s = await openSession(file, time, { learnerId: learner, instanceId, content: GAME_TEST_CONTENT, autoNextJob: false });
  expect(await time.runUntil(settled(s))).toBe(true);
  return { s, host: hostFor(s, learner, time), learner };
}

const hostFor = (s: Session, learner: string, time: VirtualTime) =>
  createMiniGameHost({ runtime: s.rt, learnerId: learner, director: s.director, clock: time, audio: { handle: (c) => void s.audio.push(...c) }, catalog: TEST_CATALOG, log: (k, d) => s.log.record(time.now(), k, d), newInstanceId: (g) => `${g.id}-${time.now()}` });

/** Free ride after the real finale (the restoration), then a ride to `floor`. */
async function freeRideAt(file: string, time: VirtualTime, floor: number) {
  const t = await at(file, time, 'finale');
  t.s.director.pressFloor(15);
  expect(await time.runUntil(() => t.s.view().stage === 'freeRide' && settled(t.s)())).toBe(true);
  t.s.director.pressFloor(floor);
  expect(await time.runUntil(() => t.s.view().elevator.floor === floor && t.s.view().elevator.phase === 'idleOpen')).toBe(true);
  await time.advance(2000);
  return t;
}

/** What the elevator's mission looks like durably and in the director, for "unchanged" checks. */
async function elevatorState(t: { s: Session; learner: string }) {
  const id = t.s.director.instanceId();
  const row = await t.s.db.get<{ status: string; revision: number }>('SELECT status, revision FROM mission_instances WHERE id = ?', [id]);
  const v = t.s.view();
  // The game's own commits (its GAME_PROGRESS, its completion) go to the game, never to the director.
  return { row, stage: v.stage, floor: v.elevator.floor, phase: v.elevator.phase, task: canonicalJson(v.task), rank: v.rank, maintenance: v.maintenanceUnlocked, restored: v.floor15Restored, lifty: v.lifty.line, unlockLogs: t.s.log.entries().filter((e) => e.kind === 'unlock').length, learner: canonicalJson(await t.s.rt.learnerState(t.learner)) };
}

const windowLog = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer.window');

async function done(t: { s: Session; host: MiniGameHost }) {
  await t.host.dispose();
  await t.s.director.idle();
  t.s.director.dispose();
  await t.s.db.close();
}

describe('mini-game host', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('free ride at Floor 20: PLAY pauses the elevator, BACK TO ELEVATOR gives it back at the same floor with the doors open; nothing is recorded', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 20);
    expect(gameEntrance(t.s.view())?.id).toBe('word-golf');
    const before = await elevatorState(t);
    const rows = await learningRows(t.s.db);
    expect(await t.host.open('word-golf')).toBe(true);
    expect(t.s.view().miniGame).toEqual({ id: 'word-golf', floor: 20 });
    expect(gameEntrance(t.s.view())).toBeNull();
    expect(t.host.get().phase).toBe('open');
    // The record that survives a restart.
    expect(readHostRecord(await t.s.rt.settings(t.learner))).toEqual({ v: 1, game: 'word-golf', floor: 20 });
    // Paused: the elevator's checkpoint is out of memory, the panel is locked, a stray tap does nothing.
    expect(() => t.s.rt.currentView(t.s.director.instanceId())).toThrow(/not active/);
    expect(t.s.view().elevator.panelEnabled).toBe(false);
    t.s.director.pressFloor(5);
    t.s.director.touchObject('ball');
    await time.advance(60_000);
    expect(t.s.view().elevator).toMatchObject({ floor: 20, phase: 'idleOpen', destination: null });
    expect(t.s.log.entries().filter((e) => e.kind === 'minigame.ignored').map((e) => e.data.action)).toEqual(['pressFloor', 'touchObject']);
    // No machine loop runs under the game.
    const stops = t.s.audio.filter((c) => c.action === 'loopStop' && c.slot === 'ambientMachinery');
    expect(stops.length).toBeGreaterThan(0);

    await t.host.close();
    expect(t.host.get().phase).toBe('elevator');
    expect(t.s.view().miniGame).toBeNull();
    expect(t.s.view().elevator.panelEnabled).toBe(true);
    expect(await elevatorState(t)).toEqual(before);
    expect(await learningRows(t.s.db)).toEqual(rows);
    expect((await t.s.rt.settings(t.learner))[HOST_KEY]).toBe('');
    // The building works as before: a ride.
    t.s.director.pressFloor(4);
    expect(await time.runUntil(() => t.s.view().elevator.floor === 4 && t.s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(gameEntrance(t.s.view())?.id).toBe('cargo-commander');
    await done(t);
  });

  it('a job waiting at Floor 20 is paused, not answered, completed or abandoned; it resumes with the same item and a fresh window', async () => {
    const time = virtualTime();
    const t = await at(tmp.file, time, 'calls-top');
    const v = t.s.view();
    expect({ stage: v.stage, floor: v.elevator.floor }).toEqual({ stage: 'task', floor: 20 });
    const id = t.s.director.instanceId();
    const item = t.s.rt.currentView(id).view.activity!.itemSignature;
    const right = solve(t.s);
    const before = await elevatorState(t);
    const rows = await learningRows(t.s.db);
    expect(await t.host.open('word-golf')).toBe(true);
    // The answer window closed with the pause; the panel is locked.
    expect(windowLog(t.s).at(-1)!.data).toMatchObject({ open: false, reason: 'minigame' });
    t.s.director.pressFloor(right);
    t.s.director.requestHelp();
    await time.advance(120_000);
    expect(t.s.view().elevator).toMatchObject({ floor: 20, phase: 'idleOpen', destination: null, lit: [] });
    expect(await learningRows(t.s.db)).toEqual(rows);
    expect(t.s.log.entries().filter((e) => e.kind === 'answer')).toHaveLength(0);

    await t.host.close();
    expect(await elevatorState(t)).toEqual(before);
    expect(t.s.rt.currentView(id).view.activity!.itemSignature).toBe(item);
    // The same job takes a fresh window, and the answer counts once.
    expect(windowLog(t.s).at(-1)!.data).toMatchObject({ open: true });
    t.s.director.pressFloor(right);
    const attemptsNow = async () => (await t.s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'", []))?.n ?? 0;
    const attemptsBefore = await attemptsNow();
    expect(await time.runUntil(() => t.s.view().stage === 'success')).toBe(true);
    await t.s.director.idle();
    expect(await attemptsNow()).toBe(attemptsBefore + 1);
    await done(t);
  });

  it('the game is its own instance: its answer is its evidence, the elevator mission is untouched', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 4);
    const before = await elevatorState(t);
    const rows = await learningRows(t.s.db);
    await t.host.open('cargo-commander');
    const st = t.host.get();
    if (st.phase !== 'open') throw new Error(`not open: ${st.phase}`);
    const game: MiniGameSession = st.session;
    expect(game.story()?.eventKey).toBe('cargo.brief');
    await game.next();
    const c = game.challenge()!;
    let right = 1;
    for (let v = c.answer.mode === 'value' ? c.answer.min : 1; v <= 20; v++) if (game.check({ mode: 'value', value: v })?.correct) right = v;
    expect(await game.submit({ mode: 'value', value: right })).toMatchObject({ correct: true, done: true });
    const after = await learningRows(t.s.db);
    // One attempt and the game's completion record; no progression or unlock for a low-tier game here.
    expect(after.events).toBeGreaterThan(rows.events);
    const evs = await t.s.db.all<{ payload: string }>('SELECT payload FROM learning_events ORDER BY seq', []);
    const mine = evs.map((e) => JSON.parse(e.payload) as { missionInstanceId?: string }).filter((e) => e.missionInstanceId === game.instanceId);
    expect(mine.length).toBe(after.events - rows.events);
    await t.host.close();
    expect(await elevatorState(t)).toEqual({ ...before, learner: (await elevatorState(t)).learner });
    expect(t.s.view().elevator).toMatchObject({ floor: 4, phase: 'idleOpen' });
    await done(t);
  });

  it('an orderly stop (leaving, Start Over) closes the game without resuming and clears the record; the game stays unfinished', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 20);
    await t.host.open('word-golf');
    expect(readHostRecord(await t.s.rt.settings(t.learner))).not.toBeNull();
    await t.host.dispose();
    expect((await t.s.rt.settings(t.learner))[HOST_KEY]).toBe('');
    expect(await t.s.rt.findActiveMission(t.learner, 'test-word-golf')).not.toBeNull();
    expect(await t.host.open('word-golf')).toBe(false);
    t.s.director.dispose();
    await t.s.db.close();
  });

  it('is refused where the landing offers no game, or offers another one; nothing changes', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 4);
    expect(await t.host.open('word-golf')).toBe(false);
    expect(t.s.view().miniGame).toBeNull();
    t.s.director.pressFloor(5);
    expect(await time.runUntil(() => t.s.view().elevator.floor === 5 && t.s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(await t.host.open('cargo-commander')).toBe(false);
    expect(t.s.director.openGame('cargo-commander')).toBe(false);
    // A floor lit and waiting: the lift is about to leave, no game.
    t.s.director.pressFloor(4);
    expect(await time.runUntil(() => t.s.view().elevator.floor === 4 && t.s.view().elevator.phase === 'idleOpen')).toBe(true);
    t.s.director.pressFloor(9);
    expect(t.s.view().elevator.destination).toBe(9);
    expect(t.s.director.openGame('cargo-commander')).toBe(false);
    expect(t.host.get().phase).toBe('elevator');
    await done(t);
  });

  it('a game whose mission is not installed says so, and BACK TO ELEVATOR still resumes the elevator', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 20);
    const host = createMiniGameHost({ runtime: t.s.rt, learnerId: t.learner, director: t.s.director, clock: time, audio: { handle: () => {} }, catalog: TEST_CATALOG.map((g) => ({ ...g, missionId: 'no-such-mission' })) });
    expect(await host.open('word-golf')).toBe(true);
    expect(host.get()).toMatchObject({ phase: 'failed', reason: 'missing' });
    await host.close();
    expect(host.get().phase).toBe('elevator');
    expect(t.s.view()).toMatchObject({ miniGame: null, stage: 'freeRide' });
    expect(t.s.view().elevator).toMatchObject({ floor: 20, phase: 'idleOpen' });
    await host.dispose();
    await done(t);
  });

  it('after a restart in a game: back at that landing with the doors open, the game offered again and resumed where it was', async () => {
    const time = virtualTime();
    const t = await freeRideAt(tmp.file, time, 20);
    await t.host.open('word-golf');
    const st = t.host.get();
    if (st.phase !== 'open') throw new Error('not open');
    const gameInstance = st.session.instanceId;
    await st.session.saveGame({ hole: 2 });
    // The app dies with the game open: no BACK TO ELEVATOR, nothing closed.
    const elevatorInstance = t.s.director.instanceId();
    t.s.director.dispose();
    await t.s.db.close();

    const { db, rt } = await openTestRuntime(tmp.file, time);
    const record = readHostRecord(await rt.settings(t.learner));
    expect(record).toEqual({ v: 1, game: 'word-golf', floor: 20 });
    const log = createPlaytestLog();
    const director = createFloor15Director({ runtime: rt, learnerId: t.learner, instanceId: elevatorInstance, clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', log, resumeAt: record!.floor });
    await director.start();
    expect(await time.runUntil(() => director.getView().elevator.phase === 'idleOpen')).toBe(true);
    expect(director.getView()).toMatchObject({ stage: 'freeRide', miniGame: null });
    expect(director.getView().elevator.floor).toBe(20);
    expect(gameEntrance(director.getView())?.id).toBe('word-golf');
    const host = createMiniGameHost({ runtime: rt, learnerId: t.learner, director, clock: time, audio: { handle: () => {} }, catalog: TEST_CATALOG });
    await host.refresh();
    expect(host.unfinished()).toEqual(['word-golf']);
    await host.open('word-golf');
    const again = host.get();
    if (again.phase !== 'open') throw new Error('not open again');
    expect({ id: again.session.instanceId, resumed: again.session.resumed, saved: await again.session.loadGame() }).toEqual({ id: gameInstance, resumed: true, saved: { hole: 2 } });
    await host.dispose();
    director.dispose();
    await db.close();
  });

  it('after a restart in a game during a job elsewhere: back at that landing, the job a hall call away', async () => {
    const time = virtualTime();
    const { db, rt } = await openTestRuntime(tmp.file, time);
    const learner = await activeTestLearner(rt, BASE, THEME_PACK_ID);
    const instanceId = await jumpTo({ db, runtime: rt, content: GAME_TEST_CONTENT, now: () => time.now() }, learner, 'practice');
    const anchor = rt.view(instanceId).then((v) => v.activity!.prompt.start as number);
    const director = createFloor15Director({ runtime: rt, learnerId: learner, instanceId, clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', log: createPlaytestLog(), resumeAt: 4 });
    await director.start();
    await time.advance(1000);
    const v = director.getView();
    expect({ stage: v.stage, floor: v.elevator.floor, phase: v.elevator.phase, hallCall: v.hallCall }).toEqual({ stage: 'call', floor: 4, phase: 'idleOpen', hallCall: await anchor });
    expect(gameEntrance(v)?.id).toBe('cargo-commander');
    // A floor that is no mini-game's landing is ignored (an old or damaged record).
    const other = createFloor15Director({ runtime: rt, learnerId: learner, instanceId, clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', resumeAt: 7 });
    director.dispose();
    await other.start();
    await time.advance(1000);
    expect(other.getView().elevator.floor).toBe(await anchor);
    other.dispose();
    await db.close();
  });
});
