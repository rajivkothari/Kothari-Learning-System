/// <reference types="node" />
// Tower Rescue's ten levels (D196) over the real runtime (node:sqlite) and the shipped missions:
// every level plays to SYSTEM RESTORED with one attempt per step and nothing else recorded; a wrong
// choice is one miss with its consequence and help keeps the assistance distinctions; a longer
// level resumes at its step after a restart; a level asked for ends another level left open; the
// next new session is the first level not finished; and every generated item of every level can be
// shown and solved (exactly one choice is right, the station draws it).
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { TOWER_RESCUE } from '../../content/minigames';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameSession } from '../types';
import { createTowerRescueFlow, dialSettings, pairParts, repairFrom, type TowerRescueFlow } from './flow';
import { LEVELS, LEVEL_MISSIONS, levelAfter, nextLevel, openLevels, stationFor, type Station } from './levels';

const LEARNER = 'learner-a';
const GAME = miniGameById('tower-rescue')!;

async function world() {
  const tmp = tempDir();
  const clock = fakeClock();
  let db = openNodeDatabase(tmp.file);
  let rt: GameRuntime = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  await rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  const restart = async () => {
    rt.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  };
  const open = async (mission?: string, instance?: string) => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: GAME, clock, ...(mission ? { mission } : {}), newInstanceId: () => instance ?? `tower-rescue-${LEARNER}-${clock.now()}-${++n}` });
    const flow = createTowerRescueFlow({ session: h.session });
    await flow.start();
    return { flow, session: h.session, close: async () => (flow.dispose(), await h.close()) };
  };
  const attempts = async () => (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));
  const status = (m: string) => rt.latestMission(LEARNER, m);
  return { open, attempts, restart, status, done: () => tmp.cleanup() };
}

/** The right choice, from runtime.check (records nothing): the test never computes an answer itself. */
const rightOf = (session: MiniGameSession, f: TowerRescueFlow) => {
  const item = f.view().item!;
  const right = item.choices.filter((c) => session.check({ mode: 'choice', optionId: c.id })?.correct);
  expect(right).toHaveLength(1);
  return { right: right[0]!, wrong: item.choices.filter((c) => c !== right[0]) };
};
/** START, and the play diagnosis when the level has one (all running systems first, then the stopped one). */
const toWork = (f: TowerRescueFlow) => {
  f.begin();
  const clue = f.view().clue;
  if (clue) {
    for (const s of TOWER_RESCUE.systems) if (s.id !== clue.offline) f.inspect(s.id);
    f.inspect(clue.offline);
  }
  expect(f.view().stage).toBe('repair');
};
/** Every step right first time, then RUN TEST to done. Returns the stations met. */
async function playLevel(f: TowerRescueFlow, session: MiniGameSession): Promise<Station[]> {
  toWork(f);
  const stations: Station[] = [];
  for (;;) {
    stations.push(f.view().item!.station);
    await f.install(rightOf(session, f).right.id);
    if (f.view().stage === 'powered') break;
    expect(f.view().stage).toBe('stepDone');
    await f.advance();
    expect(f.view().stage).toBe('repair');
  }
  f.runTest();
  await f.testPlayed();
  expect(f.view().stage).toBe('done');
  return stations;
}

const EXPECTED: Record<string, Station[]> = {
  power: ['cells'],
  fans: ['dial'],
  pair: ['pair'],
  sensor: ['sensor'],
  gears: ['gears'],
  route: ['route'],
  safety: ['checklist', 'cells'],
  inspect: ['inspect', 'cells'],
  delivery: ['cells', 'route'],
  chief: ['inspect', 'pair', 'route'],
};

describe('Tower Rescue levels (D196)', () => {
  it('ten levels, each a mission of the catalog entry, the first the original repair', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Object.keys(EXPECTED));
    expect(LEVELS[0]!.mission).toBe('power-repair');
    expect(new Set([GAME.missionId, ...(GAME.missions ?? [])])).toEqual(new Set(LEVEL_MISSIONS));
    // Open in order: the first not finished, and every finished one stays open to replay.
    expect([...openLevels([])]).toEqual(['power-repair']);
    expect([...openLevels(['power-repair', 'repair-dial'])]).toEqual(['power-repair', 'repair-dial', 'repair-pair']);
    expect(nextLevel(['power-repair']).mission).toBe('repair-dial');
    expect(nextLevel(LEVEL_MISSIONS).mission).toBe(LEVEL_MISSIONS[LEVEL_MISSIONS.length - 1]);
    expect(levelAfter('repair-chief')).toBeNull();
  });

  it.each(LEVELS.map((l) => [l.n, l.id, l.mission] as const))('level %i (%s): first try to SYSTEM RESTORED, one independent attempt per step, nothing else recorded', async (_n, id, mission) => {
    const w = await world();
    try {
      const { flow, session, close } = await w.open(mission);
      expect(session.missionId).toBe(mission);
      expect(flow.view()).toMatchObject({ stage: 'intro', level: { id } });
      const stations = await playLevel(flow, session);
      expect(stations).toEqual(EXPECTED[id]);
      const a = await w.attempts();
      expect(a.map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual(stations.map(() => ['correct', 0, 'independent']));
      expect((await w.status(mission))?.status).toBe('completed');
      expect(flow.view().finished).toContain(mission);
      await close();
    } finally {
      await w.done();
    }
  });

  it.each(LEVELS.map((l) => [l.n, l.id, l.mission] as const))('level %i (%s): a wrong choice is one miss with its consequence and greys out; help is the ladder; the right one after it is never independent', async (_n, _id, mission) => {
    const w = await world();
    try {
      const { flow, session, close } = await w.open(mission);
      toWork(flow);
      const { right, wrong } = rightOf(session, flow);
      const station = flow.view().item!.station;
      await flow.install(wrong[0]!.id);
      expect(flow.view()).toMatchObject({ stage: 'repair', tried: [wrong[0]!.id], miss: { cellId: wrong[0]!.id } });
      const wrongKey = { cells: ['tooLow', 'tooHigh'], pair: ['pairLow', 'pairHigh'], dial: ['dialWrong'], gears: ['gearsWrong'], route: ['routeWrong'], sensor: ['sensorWrong'], checklist: ['checklistWrong'], inspect: ['inspectWrong'] }[station];
      expect(wrongKey).toContain(flow.view().line.key);
      // The same choice cannot be sent twice.
      await flow.install(wrong[0]!.id);
      expect(await w.attempts()).toHaveLength(0);
      // Help: the first step of the activity's ladder.
      expect(flow.view().help).not.toBeNull();
      await flow.hint();
      expect(flow.view().hint?.kind).toBe('highlightGiven');
      await flow.install(right.id);
      const a = await w.attempts();
      expect(a.map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 1, 'clue']]);
      await close();
    } finally {
      await w.done();
    }
  });

  it('SHOW ME on a reading station reveals the answer; the right choice after it is demonstrated', async () => {
    const w = await world();
    try {
      const { flow, session, close } = await w.open('repair-sensor');
      toWork(flow);
      const { right, wrong } = rightOf(session, flow);
      await flow.install(wrong[0]!.id);
      await flow.hint();
      expect(flow.view().help?.kind).toBe('showAnswer');
      await flow.hint();
      expect(flow.view().hint).toEqual({ kind: 'showAnswer', revealed: right.value });
      expect(flow.view().line.key).toBe('readShowMe');
      await flow.install(right.id);
      expect((await w.attempts()).map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 1, 'demonstrated']]);
      await close();
    } finally {
      await w.done();
    }
  });

  it('a longer level resumes at its step after a restart (memory gone, file reopened), with what the first step found', async () => {
    const w = await world();
    try {
      const first = await w.open('repair-inspection');
      toWork(first.flow);
      const found = rightOf(first.session, first.flow).right;
      await first.flow.install(found.id);
      expect(first.flow.view()).toMatchObject({ stage: 'stepDone', system: found.value, line: { key: 'inspectFound' } });
      // Leaving during the step's moment: it comes back.
      await first.close();
      await w.restart();
      const again = await w.open();
      expect(again.session.missionId).toBe('repair-inspection');
      expect(again.flow.view()).toMatchObject({ stage: 'stepDone', system: found.value });
      await again.flow.advance();
      expect(again.flow.view()).toMatchObject({ stage: 'repair', step: { index: 1, count: 2 }, item: { station: 'cells' } });
      const { right, wrong } = rightOf(again.session, again.flow);
      await again.flow.install(wrong[0]!.id);
      await again.close();
      await w.restart();
      const third = await w.open();
      expect(third.flow.view()).toMatchObject({ stage: 'repair', step: { index: 1 }, tried: [wrong[0]!.id], system: found.value });
      await third.flow.install(right.id);
      expect(third.flow.view().stage).toBe('powered');
      expect(third.flow.view().payoff).toBe(found.value === 'fans' ? 'fans' : 'lift');
      third.flow.runTest();
      await third.flow.testPlayed();
      expect((await w.attempts()).map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([
        ['correct', 0, 'independent'],
        ['correct', 1, 'retry'],
      ]);
      await third.close();
    } finally {
      await w.done();
    }
  });

  it('a V0.1 save (before the levels) still resumes the original repair with its greyed cell', async () => {
    const w = await world();
    try {
      const first = await w.open('power-repair');
      toWork(first.flow);
      const { wrong } = rightOf(first.session, first.flow);
      await first.flow.install(wrong[0]!.id);
      const item = first.flow.view().item!;
      // Write the save as V0.1 wrote it.
      await first.session.saveGame({ v: 1, found: true, checked: [], tried: [wrong[0]!.id], pending: null, item: { key: item.key, needed: item.needed, present: item.present, cells: item.cells }, installed: null });
      await first.close();
      const again = await w.open();
      expect(again.flow.view()).toMatchObject({ stage: 'repair', tried: [wrong[0]!.id], item: { key: item.key, station: 'cells' } });
      await again.close();
    } finally {
      await w.done();
    }
  });

  it('a level asked for ends another level left open (its evidence kept); a new session is the first level not finished', async () => {
    const w = await world();
    try {
      const first = await w.open('repair-pair');
      toWork(first.flow);
      const { wrong } = rightOf(first.session, first.flow);
      await first.flow.install(wrong[0]!.id);
      await first.close();
      const other = await w.open('repair-dial');
      expect(other.session.missionId).toBe('repair-dial');
      expect((await w.status('repair-pair'))?.status).toBe('abandoned');
      await playLevel(other.flow, other.session);
      await other.close();
      // Nothing open: the first level not finished (the original repair).
      const next = await w.open();
      expect(next.session.missionId).toBe('power-repair');
      expect(next.session.completedMissions).toEqual(['repair-dial']);
      await playLevel(next.flow, next.session);
      await next.close();
      const after = await w.open();
      expect(after.session.missionId).toBe('repair-pair');
      expect(after.flow.view().finished.sort()).toEqual(['power-repair', 'repair-dial']);
      await after.close();
      // The abandoned level's item never became an attempt; the two finished levels are one each.
      expect((await w.attempts()).map((a) => a.outcome)).toEqual(['correct', 'correct']);
    } finally {
      await w.done();
    }
  });

  it.each(LEVELS.map((l) => [l.n, l.id, l.mission] as const))('level %i (%s): 25 generated variations, every item shown by its station and solvable (exactly one right choice)', async (_n, _id, mission) => {
    const w = await world();
    try {
      const keys = new Set<string>();
      for (let i = 0; i < 25; i++) {
        const { flow, session, close } = await w.open(mission, `tower-rescue-${LEARNER}-var-${mission}-${i}`);
        toWork(flow);
        for (;;) {
          const v = flow.view();
          const item = v.item!;
          keys.add(item.key);
          const c = session.challenge()!;
          expect(stationFor(c.activityId, c.prompt)).toBe(item.station);
          expect(repairFrom(c)).not.toBeNull();
          // What each station draws is there: the authored answer is never in the item's givens.
          expect('answer' in item.prompt).toBe(false);
          if (item.station === 'pair') for (const ch of item.choices) expect(pairParts(ch.value)).not.toBeNull();
          if (item.station === 'dial') expect(dialSettings(item).filter((x) => x === null)).toHaveLength(1);
          if (item.station === 'route' || item.station === 'gears') for (const ch of item.choices) expect(Number(ch.value)).toBeGreaterThanOrEqual(1);
          if (item.station === 'sensor' || item.station === 'checklist' || item.station === 'inspect') expect(TOWER_RESCUE.reports[String(c.prompt.item)]).toBeDefined();
          await flow.install(rightOf(session, flow).right.id);
          if (flow.view().stage === 'powered') break;
          await flow.advance();
        }
        await close();
      }
      // Replays vary: more than one item across the sample.
      expect(keys.size).toBeGreaterThan(1);
    } finally {
      await w.done();
    }
  });
});
