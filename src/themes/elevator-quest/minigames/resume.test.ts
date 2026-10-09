// Leaving and coming back to a mini-game, over the REAL runtime and SQLite with the games' real
// missions (M9.1): a half-played delivery or hole comes back as it was after BACK TO ELEVATOR, an app
// reload (a fresh runtime over the same file) or a crash (the process ends before or after a save),
// and no answer is ever recorded twice. The mock session is not used here: its rules are only a
// model of these.
import type { SqlValue } from '../../../persistence/driver';
import { loadLearningEvents } from '../../../persistence/store';
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../runtime/testing/harness';
import spellingPack from '../../../../content/packs/spelling.json';
import { THEME_PACK_ID } from '../content/floor15';
import { miniGameById } from './catalog';
import { createCargoFlow, type CargoFlow } from './cargo/cargoFlow';
import { loadFor, type CargoLoad } from './cargo/cargoState';
import type { CargoMission } from './cargo/mission';
import { inflightKey, openMiniGameSession, saveKey, type MiniGameSessionHandle } from './session';
import { GAME_TEST_CONTENT } from './testing/gameContent';
import type { MiniGameSession, MiniGameSound } from './types';
import { createWordGolf, type Timers, type WordGolfController } from './wordGolf/controller';
import { HOLES } from './wordGolf/course';
import { WG_COPY } from './wordGolf/copy';
import { goodPutt, tilesFor } from './wordGolf/testPlay';

const LEARNER = 'learner-a';
type Clock = ReturnType<typeof fakeClock>;
type Fail = (sql: string, params: readonly SqlValue[]) => boolean;

/** A runtime over `file`. `plan.fail`, when set, makes matching statements throw: the process is gone. */
async function world(file: string, clock: Clock) {
  const plan: { fail: Fail | null } = { fail: null };
  const db = openNodeDatabase(file, { failBefore: (sql, params) => plan.fail?.(sql, params) ?? false });
  const rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  if (!(await rt.getLearner(LEARNER))) await rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  const open = (id: 'word-golf' | 'cargo-commander') => openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: miniGameById(id)!, clock, newInstanceId: () => `${id}-${LEARNER}-${clock.now()}-${++n}` });
  return { db, rt, plan, open };
}
type World = Awaited<ReturnType<typeof world>>;

/** Every write is a save of `game` (the gameplay setting) whose text matches `keep`: the rest never lands. */
const savesOnly = (game: string, keep: (text: string) => boolean = () => false): Fail => (_sql, params) => params.includes(saveKey(game)) && !keep(String(params[2]));
const everythingBut = (game: string, keep: (text: string) => boolean): Fail => (_sql, params) => !(params.includes(saveKey(game)) && keep(String(params[2])));

const settle = () => new Promise<void>((r) => setImmediate(r));
const attempts = async (w: World) => (await loadLearningEvents(w.db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));

/** The process ends: nothing more is written, memory is gone, the file stays. */
async function crash(w: World) {
  await settle();
  w.rt.dropMemory();
  await w.db.close();
}

const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };

// ---------------------------------------------------------------- Cargo Commander

function cargoOn(session: MiniGameSession) {
  const pending: (() => void)[] = [];
  const flow = createCargoFlow({
    session,
    sound: silent,
    reducedMotion: () => true,
    now: () => 0,
    schedule: (fn) => {
      pending.push(fn);
      return () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      };
    },
  });
  return { flow, runSaves: async () => (pending.splice(0).forEach((f) => f()), await settle()) };
}

/** The right load value for the delivery on screen, found through the runtime's pure check (tests only). */
function rightValue(session: MiniGameSession, m: CargoMission): number {
  for (let v = m.range.min; v <= m.range.max; v += 1) if (session.check({ mode: 'value', value: v })?.correct) return v;
  throw new Error('no right value');
}

function wrongLoad(m: CargoMission, right: number): CargoLoad {
  if (m.kind !== 'exactLoad') return right + 1 <= m.range.max ? { crates: [], sacks: Math.floor((right + 1) / 10), boxes: (right + 1) % 10 } : { crates: [], sacks: Math.floor((right - 1) / 10), boxes: (right - 1) % 10 };
  const one = m.crates.find((c) => c.weight !== right)!;
  return { crates: [one.id], sacks: 0, boxes: 0 };
}

/** Put exactly `load` in the freight (taking off what is there first). Loading is free play: nothing is sent. */
function setLoad(flow: CargoFlow, load: CargoLoad) {
  const now = () => flow.view().cargo!.load;
  for (const id of now().crates) flow.act({ type: 'unloadCrate', id });
  while (now().sacks > 0) flow.act({ type: 'removeSack' });
  while (now().boxes > 0) flow.act({ type: 'removeBox' });
  for (const id of load.crates) flow.act({ type: 'loadCrate', id });
  for (let i = 0; i < load.sacks; i += 1) flow.act({ type: 'addSack' });
  for (let i = 0; i < load.boxes; i += 1) flow.act({ type: 'addBox' });
  expect(flow.view().cargo!.load).toEqual(load);
}

/** Part of the right load (never the whole of it, never empty). */
function partOf(m: CargoMission, right: number): CargoLoad {
  const full = loadFor(m, right)!;
  if (m.kind === 'exactLoad') return full.crates.length > 1 ? { ...full, crates: full.crates.slice(0, 1) } : { crates: [m.crates.find((c) => !full.crates.includes(c.id))!.id], sacks: 0, boxes: 0 };
  return full.sacks > 0 ? { crates: [], sacks: full.sacks, boxes: 0 } : { crates: [], sacks: 0, boxes: Math.max(1, full.boxes - 1) };
}

async function shipRight(session: MiniGameSession, flow: CargoFlow) {
  const m = flow.view().mission!;
  setLoad(flow, loadFor(m, rightValue(session, m))!);
  await flow.weigh();
  expect(flow.view().cargo!.phase).toBe('shipping');
  flow.arrived();
  await settle();
}

interface Visit {
  w: World;
  h: MiniGameSessionHandle;
  flow: CargoFlow;
  runSaves: () => Promise<void>;
}

async function cargoVisit(file: string, clock: Clock, w?: World): Promise<Visit> {
  const world_ = w ?? (await world(file, clock));
  const h = await world_.open('cargo-commander');
  const { flow, runSaves } = cargoOn(h.session);
  await flow.start();
  return { w: world_, h, flow, runSaves };
}

/** BACK TO ELEVATOR: the screen saves first, then the host closes the session. */
async function leave(v: Visit) {
  await v.flow.flush();
  v.flow.dispose();
  await v.h.close();
}

type Exit = 'back' | 'reload' | 'crashAfterSave' | 'crashBeforeSave';

describe('Cargo Commander resumes the delivery on screen (real runtime)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it.each<Exit>(['back', 'reload', 'crashAfterSave', 'crashBeforeSave'])('every delivery, left half-loaded (%s), comes back as the same delivery; one record per delivery', async (exit) => {
    const clock = fakeClock();
    let v = await cargoVisit(tmp.file, clock);
    const instance = v.h.session.instanceId;
    for (let d = 1; d <= 5; d += 1) {
      const m = v.flow.view().mission!;
      const right = rightValue(v.h.session, m);
      const part = partOf(m, right);
      // Load part of it; the debounced save runs (or, crashing before the save, never lands).
      if (exit === 'crashBeforeSave') {
        await v.runSaves();
        v.w.plan.fail = savesOnly('cargo-commander');
      }
      setLoad(v.flow, part);
      if (exit !== 'crashBeforeSave') await v.runSaves();
      const durable = exit === 'crashBeforeSave' ? null : part;
      if (exit === 'back') {
        await leave(v);
        v = await cargoVisit(tmp.file, clock, v.w);
      } else {
        if (exit === 'reload') await leave(v);
        else v.flow.dispose();
        await crash(v.w);
        v = await cargoVisit(tmp.file, clock);
      }
      const back = v.flow.view();
      expect({ instance: v.h.session.instanceId, key: back.mission!.key, load: back.cargo!.load, notice: back.notice }).toEqual({
        instance,
        key: m.key,
        load: durable ?? { crates: [], sacks: 0, boxes: 0 },
        notice: durable ? 'resume' : null,
      });
      expect(await attempts(v.w)).toHaveLength(d - 1);
      await shipRight(v.h.session, v.flow);
      expect((await attempts(v.w)).map((a) => a.outcome)).toEqual(Array(d).fill('correct'));
      await v.flow.next();
      await settle();
    }
    expect(v.flow.view().status).toBe('done');
    expect(await v.w.rt.latestMission(LEARNER, 'cargo-commander')).toEqual({ id: instance, status: 'completed' });
    await leave(v);
    await v.w.db.close();
  });

  it('a wrong WEIGH is never counted again after coming back, whichever way the visit ended', async () => {
    for (const exit of ['back', 'reload', 'crashAfterCommit', 'crashBeforeCommit'] as const) {
      const t = tempDir();
      try {
        const clock = fakeClock();
        let v = await cargoVisit(t.file, clock);
        // A delivery done first, so the one that misses is not the visit's first.
        await shipRight(v.h.session, v.flow);
        await v.flow.next();
        const m = v.flow.view().mission!;
        const right = rightValue(v.h.session, m);
        const wrong = wrongLoad(m, right);
        setLoad(v.flow, wrong);
        await v.runSaves();
        const isWeighing = (text: string) => text.includes('"phase":"weighing"');
        // The process dies after the WEIGH's own save: before its commit, or after it (the result's save never lands).
        if (exit === 'crashAfterCommit') v.w.plan.fail = savesOnly('cargo-commander', isWeighing);
        if (exit === 'crashBeforeCommit') v.w.plan.fail = everythingBut('cargo-commander', isWeighing);
        await v.flow.weigh();
        const committed = exit !== 'crashBeforeCommit';
        expect(v.h.session.challenge()?.wrongTries ?? 0).toBe(committed ? 1 : 0);
        if (exit === 'back') {
          await leave(v);
          v = await cargoVisit(t.file, clock, v.w);
        } else {
          if (exit === 'reload') await leave(v);
          else v.flow.dispose();
          await crash(v.w);
          v = await cargoVisit(t.file, clock);
        }
        expect({ key: v.flow.view().mission!.key, load: v.flow.view().cargo!.load }).toEqual({ key: m.key, load: wrong });
        const submitsBefore = v.h.session.challenge()!.wrongTries;
        expect(submitsBefore).toBe(committed ? 1 : 0);
        // WEIGH the same load again: a committed miss only shows its reading; an uncommitted one is the first try.
        await v.flow.weigh();
        expect(v.h.session.challenge()!.wrongTries).toBe(1);
        expect(v.flow.view().cargo!.readout).toMatchObject({ value: v.flow.view().cargo!.readout!.value, result: expect.stringMatching(/heavy|light|notRight/) });
        await v.flow.weigh();
        expect(v.h.session.challenge()!.wrongTries).toBe(1);
        await shipRight(v.h.session, v.flow);
        const rows = await attempts(v.w);
        expect(rows.map((a) => [a.outcome, a.wrongTries, a.assistance])).toEqual([
          ['correct', 0, 'independent'],
          ['correct', 1, 'retry'],
        ]);
        await leave(v);
        await v.w.db.close();
      } finally {
        t.cleanup();
      }
    }
  });
});

// ---------------------------------------------------------------- Word Golf

const WORDS: Record<string, string> = Object.fromEntries(
  (spellingPack as { activities: { params: { words: { id: string; word: string }[] } }[] }).activities.flatMap((a) => a.params.words.map((x) => [x.id, x.word] as const)),
);

function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let id = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      id += 1;
      q.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clear: (h) => void q.delete(h as number),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    },
  };
}

interface GolfVisit {
  w: World;
  h: MiniGameSessionHandle;
  ctl: WordGolfController;
  timers: ReturnType<typeof fakeTimers>;
}

async function golfVisit(file: string, clock: Clock, w?: World): Promise<GolfVisit> {
  const world_ = w ?? (await world(file, clock));
  const h = await world_.open('word-golf');
  const timers = fakeTimers();
  const ctl = createWordGolf({ session: h.session, sound: silent, holes: HOLES, copy: WG_COPY, clues: () => null, timers, reducedMotion: true });
  await ctl.start();
  await settle();
  return { w: world_, h, ctl, timers };
}

async function putt(v: GolfVisit) {
  for (let i = 0; i < 6 && v.ctl.getView().state.phase === 'aim'; i++) {
    const s = v.ctl.getView().state;
    const p = goodPutt(HOLES[s.hole]!, s.ball);
    v.ctl.setAim(p.angle);
    v.ctl.setPower(p.power);
    v.ctl.shoot();
    v.timers.advance(10_000);
    await settle();
  }
}

describe('Word Golf restores an earned putt (real runtime)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it.each(['back', 'reload', 'crashBeforeSave'] as const)('on every hole: the word is committed, the visit ends (%s) before the golf save: the putt is waiting, the word is not asked again', async (exit) => {
    const clock = fakeClock();
    let v = await golfVisit(tmp.file, clock);
    const instance = v.h.session.instanceId;
    const asked: string[] = [];
    for (let hole = 0; hole < 3; hole += 1) {
      if (v.ctl.getView().state.phase === 'intro') await v.ctl.begin();
      expect(v.ctl.getView().state).toMatchObject({ hole, phase: 'spell' });
      const item = v.ctl.getView().item!;
      expect(v.h.session.challenge()!.stepId).toBe(`hole-${hole + 1}`);
      const word = WORDS[item.wordId!]!;
      asked.push(word);
      for (const id of tilesFor(item.tiles, word)) v.ctl.place(id);
      await settle();
      // The golf save after CHECK never lands: the process ends right after the commit.
      if (exit === 'crashBeforeSave') v.w.plan.fail = savesOnly('word-golf');
      await v.ctl.check();
      await settle();
      expect(v.ctl.getView().state.phase).toBe('earned');
      expect(await attempts(v.w)).toHaveLength(hole + 1);
      if (exit === 'back') {
        await v.ctl.exit(() => undefined);
        v.ctl.dispose();
        await v.h.close();
        v = await golfVisit(tmp.file, clock, v.w);
      } else {
        if (exit === 'reload') await v.ctl.exit(() => undefined);
        v.ctl.dispose();
        await crash(v.w);
        v = await golfVisit(tmp.file, clock);
      }
      expect(v.h.session.instanceId).toBe(instance);
      expect(v.ctl.getView().state).toMatchObject({ hole, phase: 'earned' });
      expect(v.ctl.getView().state.words[hole]).toBe(word);
      expect(v.ctl.getView().item).toBeNull();
      v.ctl.takeShot();
      await putt(v);
      expect(await attempts(v.w)).toHaveLength(hole + 1);
      if (hole < 2) {
        expect(v.ctl.getView().state.phase).toBe('sunk');
        await v.ctl.nextHole();
        await settle();
      }
    }
    await settle();
    expect(v.ctl.getView().state.phase).toBe('summary');
    expect(v.ctl.getView().state.words).toEqual(asked);
    const rows = await attempts(v.w);
    expect(rows.map((a) => [a.outcome, a.missionInstanceId])).toEqual(Array(3).fill(['correct', instance]));
    expect(new Set(rows.map((a) => a.itemSignature)).size).toBe(3);
    expect(await v.w.rt.latestMission(LEARNER, 'word-golf')).toEqual({ id: instance, status: 'completed' });
    // Finished: the save and the note are cleared, and the next visit is a new game.
    const settings = await v.w.rt.settings(LEARNER);
    expect([settings[saveKey('word-golf')], settings[inflightKey('word-golf')]]).toEqual(['', '']);
    v.ctl.dispose();
    await v.h.close();
    const next = await golfVisit(tmp.file, clock, v.w);
    expect({ fresh: next.h.session.instanceId !== instance, phase: next.ctl.getView().state.phase }).toEqual({ fresh: true, phase: 'intro' });
    next.ctl.dispose();
    await next.h.close();
    await next.w.db.close();
  });

  it('a putt waiting after the next word was already fetched (the save behind by a hole) is still earned, never asked again', async () => {
    const clock = fakeClock();
    let v = await golfVisit(tmp.file, clock);
    await v.ctl.begin();
    const item = v.ctl.getView().item!;
    for (const id of tilesFor(item.tiles, WORDS[item.wordId!]!)) v.ctl.place(id);
    await v.ctl.check();
    await settle();
    const saved = await v.h.session.loadGame();
    // The session moves on to hole 2's word, but the golf save still says hole 1 is being spelled.
    v.ctl.dispose();
    await v.h.session.next();
    await v.h.session.saveGame({ ...(saved as object), phase: 'spell', words: [null, null, null] });
    await v.h.close();
    v = await golfVisit(tmp.file, clock, v.w);
    expect(v.ctl.getView().state).toMatchObject({ hole: 0, phase: 'earned' });
    expect(await attempts(v.w)).toHaveLength(1);
    v.ctl.dispose();
    await v.h.close();
    await v.w.db.close();
  });
});
