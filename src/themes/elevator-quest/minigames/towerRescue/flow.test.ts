/// <reference types="node" />
// Tower Rescue V0.1 over the real runtime (node:sqlite) and the shipped mission: diagnosing and
// RUN TEST record nothing; the installed cell is the only evidence; a wrong cell and help keep the
// retry and assistance distinctions; leaving and coming back resumes the same repair.
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { TOWER_RESCUE, validateTowerRescueCopy } from '../../content/minigames';
import towerRescueJson from '../../../../../content/themes/elevator-quest/minigames/towerRescue.json';
import { miniGameById } from '../catalog';
import { openMiniGameSession } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import { createTowerRescueFlow, lineText, type TowerRescueFlow } from './flow';

const LEARNER = 'learner-a';

async function world() {
  const tmp = tempDir();
  const clock = fakeClock();
  let db = openNodeDatabase(tmp.file);
  let rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  await rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  /** The app is killed and starts again: memory gone, the database file reopened. */
  const restart = async () => {
    rt.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  };
  const open = async () => {
    const h = await openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: miniGameById('tower-rescue')!, clock, newInstanceId: () => `tower-rescue-${LEARNER}-${clock.now()}-${++n}` });
    const flow = createTowerRescueFlow({ session: h.session });
    await flow.start();
    return { flow, close: () => h.close() };
  };
  const attempts = async () => (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));
  return { open, attempts, restart, done: () => tmp.cleanup() };
}

/** The test knows the answer from the prompt (the view never carries it). */
const cells = (f: TowerRescueFlow) => {
  const item = f.view().item!;
  const right = item.cells.find((c) => c.value === item.needed - item.present)!;
  return { right, wrong: item.cells.filter((c) => c !== right) };
};
const findStopped = (f: TowerRescueFlow) => {
  f.begin();
  for (const s of TOWER_RESCUE.systems) if (s.id !== f.view().clue!.offline) f.inspect(s.id);
  f.inspect(f.view().clue!.offline);
};

describe('Tower Rescue V0.1', () => {
  it('ships valid copy whose lines never carry a number', () => {
    const r = validateTowerRescueCopy(towerRescueJson);
    expect(r.issues).toEqual([]);
    expect(validateTowerRescueCopy({ ...towerRescueJson, clues: [{ offline: 'fans', text: 'Report: the fans stopped.' }] }).issues.map((i) => i.code)).toEqual(['clue.notLift']);
    const leaky = { ...towerRescueJson, lines: { ...towerRescueJson.lines, showMe: 'Use the 7 cell.' } };
    expect(validateTowerRescueCopy(leaky).issues.map((i) => i.code)).toContain('leak.digits');
  });

  it('a first-try repair: diagnosing and RUN TEST record nothing, the installed cell is one independent attempt', async () => {
    const w = await world();
    try {
      const { flow, close } = await w.open();
      expect(flow.view().stage).toBe('intro');
      findStopped(flow);
      expect(flow.view().stage).toBe('repair');
      expect(await w.attempts()).toHaveLength(0);
      const item = flow.view().item!;
      expect(item.cells.length).toBe(4);
      expect(item.needed).toBeGreaterThan(item.present);
      await flow.install(cells(flow).right.id);
      expect(flow.view().stage).toBe('powered');
      flow.runTest();
      expect(flow.view().stage).toBe('testing');
      await flow.testPlayed();
      expect(flow.view().stage).toBe('done');
      expect(lineText(flow.view())).toContain(TOWER_RESCUE.systems.find((s) => s.id === flow.view().clue!.offline)!.name);
      const a = await w.attempts();
      expect(a.map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 0, 'independent']]);
      await close();
    } finally {
      await w.done();
    }
  });

  it('a wrong cell counts as one miss, greys out and shows its consequence; after help the right cell is never independent', async () => {
    const w = await world();
    try {
      const { flow, close } = await w.open();
      findStopped(flow);
      const { right, wrong } = cells(flow);
      const item = flow.view().item!;
      await flow.install(wrong[0]!.id);
      expect(flow.view()).toMatchObject({ stage: 'repair', tried: [wrong[0]!.id], miss: { cellId: wrong[0]!.id, dir: item.present + wrong[0]!.value < item.needed ? 'low' : 'high' } });
      // The same wrong cell cannot be sent again (the runtime still counts one miss).
      await flow.install(wrong[0]!.id);
      expect(await w.attempts()).toHaveLength(0);
      // Help: point at the gap (a clue), on request.
      expect(flow.view().help).not.toBeNull();
      await flow.hint();
      expect(flow.view().hint?.kind).toBe('highlightGiven');
      await flow.install(right.id);
      expect(flow.view().stage).toBe('powered');
      const a = await w.attempts();
      expect(a.map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 1, 'clue']]);
      await close();
    } finally {
      await w.done();
    }
  });

  it('SHOW ME reveals the right cell, and the answer after it is demonstrated', async () => {
    const w = await world();
    try {
      const { flow, close } = await w.open();
      findStopped(flow);
      const { right, wrong } = cells(flow);
      await flow.install(wrong[0]!.id);
      await flow.install(wrong[1]!.id);
      // The ladder: gap (clue), power bar (visual support), then SHOW ME.
      await flow.hint();
      await flow.hint();
      expect(flow.view().help?.kind).toBe('showAnswer');
      await flow.hint();
      expect(flow.view().hint).toEqual({ kind: 'showAnswer', revealed: right.value });
      await flow.install(right.id);
      const a = await w.attempts();
      expect(a.map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 2, 'demonstrated']]);
      await close();
    } finally {
      await w.done();
    }
  });

  it('an app restart mid-repair (memory gone, file reopened) resumes the same item, its miss counted once and the cell still greyed', async () => {
    const w = await world();
    try {
      const first = await w.open();
      findStopped(first.flow);
      const key = first.flow.view().item!.key;
      const { right, wrong } = cells(first.flow);
      await first.flow.install(wrong[0]!.id);
      await w.restart();
      const again = await w.open();
      expect(again.flow.view()).toMatchObject({ stage: 'repair', tried: [wrong[0]!.id] });
      expect(again.flow.view().item!.key).toBe(key);
      await again.flow.install(right.id);
      expect((await w.attempts()).map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 1, 'retry']]);
      await again.close();
    } finally {
      await w.done();
    }
  });

  it('leaving and coming back resumes the same repair with the found system and the greyed cell; after the repair, RUN TEST waits', async () => {
    const w = await world();
    try {
      const first = await w.open();
      findStopped(first.flow);
      const key = first.flow.view().item!.key;
      const { right, wrong } = cells(first.flow);
      await first.flow.install(wrong[0]!.id);
      first.flow.dispose();
      await first.close();
      const second = await w.open();
      expect(second.flow.view()).toMatchObject({ stage: 'repair', tried: [wrong[0]!.id] });
      expect(second.flow.view().item!.key).toBe(key);
      await second.flow.install(right.id);
      second.flow.dispose();
      await second.close();
      const third = await w.open();
      expect(third.flow.view().stage).toBe('powered');
      third.flow.runTest();
      await third.flow.testPlayed();
      expect(third.flow.view().stage).toBe('done');
      expect((await w.attempts()).map((x) => [x.outcome, x.wrongTries, x.assistance])).toEqual([['correct', 1, 'retry']]);
      await third.close();
      // The next visit is a new drill.
      const fourth = await w.open();
      expect(fourth.flow.view().stage).toBe('intro');
      await fourth.close();
    } finally {
      await w.done();
    }
  });
});
