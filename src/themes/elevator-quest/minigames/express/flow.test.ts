/// <reference types="node" />
// Elevator Express V0.1 over the real runtime (node:sqlite) and the shipped express-route mission,
// driven headless with a fake clock: only the four decisions are evidence; driving, steering, bumps,
// bolts, throws (hits, wide throws, the tow back) never are; leaving and an app restart resume the
// route; the playtest tally counts what it should.
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import expressJson from '../../../../../content/themes/elevator-quest/minigames/express.json';
import missionsJson from '../../../../../content/missions/core.json';
import { THEME_PACK_ID } from '../../content/floor15';
import { EXPRESS, placeOnStreet, validateExpressCopy } from '../../content/minigames';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameSound } from '../types';
import { createExpressFlow, lineText, type ExpressFlow, type Task } from './flow';
import { END, REACH, ROUTE, STOP_KINDS, door, kitBuilding } from './route';

const LEARNER = 'learner-a';
const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };

async function world(learner = LEARNER) {
  const tmp = tempDir();
  const clock = fakeClock();
  let db = openNodeDatabase(tmp.file);
  let rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  await rt.createLearner({ id: learner, themePack: THEME_PACK_ID });
  let n = 0;
  let t = 1_000_000;
  const restart = async () => {
    rt.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  };
  const open = async (who = learner) => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: who, game: miniGameById('express')!, clock, newInstanceId: () => `express-${who}-${clock.now()}-${++n}` });
    const flow = createExpressFlow({ session: h.session, sound: silent });
    await flow.start(t);
    return { flow, session: h.session, close: () => h.close() };
  };
  const attempts = async (who = learner) => (await loadLearningEvents(db, who)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));
  const rows = async () => (await attempts()).map((a) => [a.activityId, a.outcome, a.wrongTries, a.assistance]);
  /** Advance the clock in 50 ms ticks until `until` holds (or give up). */
  const drive = async (f: ExpressFlow, until: () => boolean, maxMs = 120_000) => {
    for (let ms = 0; ms < maxMs && !until(); ms += 50) {
      t += 50;
      f.tick(t);
      await Promise.resolve();
    }
    expect(until()).toBe(true);
  };
  const now = () => t;
  const wait = (ms: number) => (t += ms);
  return { open, restart, attempts, rows, drive, now, wait, rt: () => rt, done: async () => { await db.close(); tmp.cleanup(); } };
}

/** The answer, worked out from the task the way a child would (the flow never compares). */
const answerOf = (task: Task) =>
  task.kind === 'floor' ? task.start + (task.direction === 'up' ? task.change : -task.change) : task.kind === 'power' ? task.needed - task.present : placeOnStreet(EXPRESS.street, EXPRESS.notes[task.note]!.relation, EXPRESS.notes[task.note]!.ref);
const optionFor = (task: Task, right: boolean) => task.options.find((o) => (o.value === answerOf(task)) === right)!.id;

/** Drive to the next stop, answer it right, drive into reach of the kit's building and throw. */
async function deliverNext(w: Awaited<ReturnType<typeof world>>, f: ExpressFlow) {
  await w.drive(f, () => f.view().stage === 'task');
  await f.choose(optionFor(f.view().task!, true), w.now());
  const carry = f.view().carrying!;
  expect(carry).not.toBeNull();
  await w.drive(f, () => carry.doorX - f.xAt(w.now()) <= (REACH.min + REACH.max) / 2);
  await f.throwIt(w.now());
  expect(f.view().carrying).toBeNull();
}

describe('Elevator Express V0.1', () => {
  it('ships a route that matches the mission and copy whose street notes point at the right building', () => {
    const r = validateExpressCopy(expressJson);
    expect(r.issues).toEqual([]);
    const broken = { ...expressJson, notes: { ...expressJson.notes, 'after-hospital': { ...expressJson.notes['after-hospital'], relation: 'before' } } };
    expect(validateExpressCopy(broken).issues.map((i) => i.code)).toContain('note.place');
    const mission = missionsJson.missions.find((m) => m.id === 'express-route')!;
    const kind = (id: string) => (id.startsWith('express.move') ? 'floor' : id === 'power-cells.fill' ? 'power' : 'place');
    expect(mission.steps.map((s) => kind((s as { activityId: string }).activityId))).toEqual(STOP_KINDS);
    // Every stop has a kit building ahead of it and before the next stop; the street is all there.
    ROUTE.stops.forEach((s, i) => {
      const b = s.kind === 'place' ? kitBuilding(i, 'bakery') : kitBuilding(i, null);
      expect(b).not.toBeNull();
      expect(door(b!)).toBeGreaterThan(s.x + REACH.min);
      expect(door(b!)).toBeLessThan(ROUTE.stops[i + 1]?.x ?? END);
    });
    expect(ROUTE.buildings.filter((b) => b.role === 'street').map((b) => b.place)).toEqual(EXPRESS.street);
    expect(ROUTE.parcels).toBeGreaterThanOrEqual(8);
    expect(ROUTE.things.filter((t) => t.kind !== 'bolt').length).toBeGreaterThanOrEqual(15);
  });

  it('a full route: four first-try decisions are four independent attempts; driving, bumps, bolts and parcels record nothing', async () => {
    const w = await world();
    try {
      const { flow } = await w.open();
      expect(flow.view().stage).toBe('intro');
      flow.go(w.now());
      // Steer through the first stretch, throw at parcel buildings on the way.
      for (let i = 0; i < 30; i++) {
        w.wait(200);
        flow.steer(i % 4 < 2 ? 1 : -1, w.now());
        await flow.throwIt(w.now());
      }
      expect(await w.attempts()).toHaveLength(0);
      for (let k = 0; k < 4; k++) await deliverNext(w, flow);
      await w.drive(flow, () => flow.view().stage === 'done');
      const v = flow.view();
      expect(v.touched.length).toBeGreaterThan(0);
      expect(v.delivered.length).toBeGreaterThanOrEqual(4);
      expect(lineText(v)).toContain(String(v.delivered.length));
      expect(await w.rows()).toEqual([
        ['express.move-up', 'correct', 0, 'independent'],
        ['reading.street.place', 'correct', 0, 'independent'],
        ['power-cells.fill', 'correct', 0, 'independent'],
        ['express.move-down', 'correct', 0, 'independent'],
      ]);
      await Promise.resolve();
      expect(flow.view().notes).toMatchObject({ starts: 1, completions: 1, attempts: 4, wrong: 0, exits: 0 });
    } finally {
      await w.done();
    }
  });

  it('a wrong decision greys out and is never sent twice; the right one after it is a retry', async () => {
    const w = await world();
    try {
      const { flow } = await w.open();
      flow.go(w.now());
      await w.drive(flow, () => flow.view().stage === 'task');
      const wrong = optionFor(flow.view().task!, false);
      await flow.choose(wrong, w.now());
      expect(flow.view()).toMatchObject({ stage: 'task', tried: [wrong], line: { key: 'wrongFloor' } });
      await flow.choose(wrong, w.now());
      expect(await w.attempts()).toHaveLength(0);
      await flow.choose(optionFor(flow.view().task!, true), w.now());
      expect(flow.view().stage).toBe('driving');
      expect(await w.rows()).toEqual([['express.move-up', 'correct', 1, 'retry']]);
      expect(flow.view().notes).toMatchObject({ attempts: 2, wrong: 1 });
    } finally {
      await w.done();
    }
  });

  it('a wide throw and a building driven past bring the kit back (robot, tow): no new decision, no evidence; one throw per kit counts', async () => {
    const w = await world();
    try {
      const { flow } = await w.open();
      flow.go(w.now());
      await w.drive(flow, () => flow.view().stage === 'task');
      await flow.choose(optionFor(flow.view().task!, true), w.now());
      const carry = flow.view().carrying!;
      // Too early: wide. The kit stays on board.
      await flow.throwIt(w.now());
      expect(flow.view()).toMatchObject({ carrying: carry, line: { key: 'missed' } });
      // Drive past the building without throwing: towed back, still carrying.
      await w.drive(flow, () => flow.view().towUntil > 0);
      expect(flow.view().x).toBeLessThan(carry.doorX - REACH.max);
      expect(flow.view().carrying).toEqual(carry);
      await w.drive(flow, () => flow.view().running);
      await w.drive(flow, () => carry.doorX - flow.xAt(w.now()) <= 200);
      await flow.throwIt(w.now());
      expect(flow.view().carrying).toBeNull();
      // Throwing again (the same building, many times) adds nothing.
      for (let i = 0; i < 5; i++) {
        w.wait(500);
        await flow.throwIt(w.now());
      }
      expect(await w.rows()).toEqual([['express.move-up', 'correct', 0, 'independent']]);
      expect(flow.view().notes.deliveryRetries).toBe(2);
      expect(flow.view().stop).toBe(1);
    } finally {
      await w.done();
    }
  });

  it('help climbs the givens (clue), the ladder (visual support), SHOW ME (demonstrated); the answer after it is demonstrated', async () => {
    const w = await world();
    try {
      const { flow } = await w.open();
      flow.go(w.now());
      await w.drive(flow, () => flow.view().stage === 'task');
      await flow.hint();
      expect(flow.view()).toMatchObject({ hint: { kind: 'highlightGiven' }, line: { key: 'givensFloor' } });
      const wrongs = flow.view().task!.options.filter((o) => o.value !== answerOf(flow.view().task!));
      await flow.choose(wrongs[0]!.id, w.now());
      await flow.hint();
      expect(flow.view()).toMatchObject({ hint: { kind: 'numberLine' }, line: { key: 'ladderFloor' } });
      await flow.choose(wrongs[1]!.id, w.now());
      await flow.hint();
      expect(flow.view().hint).toMatchObject({ kind: 'showAnswer', revealed: answerOf(flow.view().task!) });
      await flow.choose(optionFor(flow.view().task!, true), w.now());
      expect(await w.rows()).toEqual([['express.move-up', 'correct', 2, 'demonstrated']]);
      expect(flow.view().notes.help).toBe(3);
    } finally {
      await w.done();
    }
  });

  it('leaving mid-carry and coming back resumes the route at GO! with the kit on board; delivering it adds no evidence', async () => {
    const w = await world();
    try {
      const first = await w.open();
      first.flow.go(w.now());
      await deliverNext(w, first.flow);
      await w.drive(first.flow, () => first.flow.view().stage === 'task');
      await first.flow.choose(optionFor(first.flow.view().task!, true), w.now());
      const carry = first.flow.view().carrying!;
      w.wait(800);
      first.flow.tick(w.now());
      const x = first.flow.view().x;
      await first.flow.leave(w.now());
      first.flow.dispose();
      await first.close();
      const again = await w.open();
      expect(again.flow.view()).toMatchObject({ stage: 'intro', carrying: carry, stop: 1, line: { key: 'resume' } });
      expect(Math.abs(again.flow.view().x - x)).toBeLessThan(2);
      again.flow.go(w.now());
      await w.drive(again.flow, () => carry.doorX - again.flow.xAt(w.now()) <= 200);
      await again.flow.throwIt(w.now());
      expect(again.flow.view().stop).toBe(2);
      expect((await w.rows()).length).toBe(2);
      expect(again.flow.view().notes).toMatchObject({ starts: 1, resumes: 1, exits: 1 });
    } finally {
      await w.done();
    }
  });

  it('an app restart between the answer and its save still finds the kit packed (the decision is not asked again)', async () => {
    const w = await world();
    try {
      const first = await w.open();
      first.flow.go(w.now());
      await w.drive(first.flow, () => first.flow.view().stage === 'task');
      // The answer reaches the runtime, then the app dies before the game saves.
      const task = first.flow.view().task!;
      await first.session.submit({ mode: 'choice', optionId: optionFor(task, true) });
      first.flow.dispose();
      await w.restart();
      const again = await w.open();
      expect(again.flow.view().carrying).toMatchObject({ stop: 0, kind: 'floor', value: answerOf(task) });
      again.flow.go(w.now());
      await w.drive(again.flow, () => again.flow.view().carrying!.doorX - again.flow.xAt(w.now()) <= 200);
      await again.flow.throwIt(w.now());
      expect(again.flow.view().stop).toBe(1);
      expect(await w.rows()).toEqual([['express.move-up', 'correct', 0, 'independent']]);
    } finally {
      await w.done();
    }
  });

  it('Start Over (a new learner generation) starts a fresh route and a fresh tally', async () => {
    const w = await world();
    try {
      const { flow } = await w.open();
      flow.go(w.now());
      await deliverNext(w, flow);
      await flow.leave(w.now());
      await w.rt().createLearner({ id: 'learner-a-g-2', themePack: THEME_PACK_ID });
      const fresh = await w.open('learner-a-g-2');
      expect(fresh.flow.view()).toMatchObject({ stage: 'intro', x: 0, stop: 0, carrying: null, delivered: [], line: { key: 'intro' } });
      expect(fresh.flow.view().notes).toMatchObject({ starts: 1, exits: 0, attempts: 0 });
      expect(await w.attempts('learner-a-g-2')).toHaveLength(0);
    } finally {
      await w.done();
    }
  });
});
