/// <reference types="node" />
// Express rides and B1 (D191), headless through the real director, runtime and SQLite. An express
// ride is a short ride the lift takes itself, from the directory, in free play or between jobs while
// NEXT JOB waits: never during a job, never an answer, never help, nothing recorded as learning. B1
// is a place below the numbered floors, never a floor number: the car stands at the bottom of the
// shaft and its doors open onto the basement instead of the lobby.
import { count } from '../../../runtime/testing/harness';
import { FLOOR15 } from '../content/floor15';
import { BASEMENT } from '../content/landings';
import { gameEntrance } from '../minigames/hostEntrance';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { expressReady, visitKey } from './director';

const evidence = async (s: Session) => ({
  events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
  progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
  unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
});
const atRest = (s: Session) => () => s.view().express === null && s.view().elevator.phase === 'idleOpen' && settled(s)();

async function toFreeRide(s: Session) {
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
  while (s.view().stage !== 'finale') await answerCorrectly(s);
  s.director.pressFloor(FLOOR15.repairFloor);
  expect(await s.time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
}

describe('express rides (D191)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('free play: a quick ride to any floor and to B1, nothing recorded, the panel back as it was', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await toFreeRide(s);
    const before = await evidence(s);
    expect(s.view().elevator.floor).toBe(FLOOR15.repairFloor);
    const t0 = s.time.now();
    expect(s.director.expressRide(20)).toBe(true);
    expect(s.view().express).toEqual({ to: 20 });
    expect(s.view().elevator.panelEnabled).toBe(false);
    expect(expressReady(s.view())).toBe(false);
    expect(await s.time.runUntil(atRest(s))).toBe(true);
    expect(s.view().elevator.floor).toBe(20);
    // Short: five floors, doors both ways, well under the normal ride's 8 s.
    expect(s.time.now() - t0).toBeLessThan(3_000);
    expect(s.view().elevator.panelEnabled).toBe(true);
    expect(s.view().timing.perFloorMs).toBeGreaterThan(100); // the theme's own timing is back
    // Down to B1: the car stands at floor 1, the doors open onto the basement.
    expect(s.director.expressRide(BASEMENT)).toBe(true);
    expect(await s.time.runUntil(atRest(s))).toBe(true);
    expect(s.view().basement).toBe(true);
    expect(s.view().elevator.floor).toBe(1);
    expect(gameEntrance(s.view())?.id).toBe('strike');
    // The 1 button from B1 goes up to the lobby (the doors cycle), and the lobby offers its own game.
    s.director.pressFloor(1);
    expect(await s.time.runUntil(() => !s.view().basement && atRest(s)())).toBe(true);
    expect(gameEntrance(s.view())?.id).toBe('express');
    // Lobby to B1 is a door cycle too; any other floor rides up and leaves B1 behind.
    expect(s.director.expressRide(BASEMENT)).toBe(true);
    expect(await s.time.runUntil(() => s.view().basement && atRest(s)())).toBe(true);
    s.director.pressFloor(6);
    expect(await s.time.runUntil(() => s.view().elevator.floor === 6 && atRest(s)())).toBe(true);
    expect(s.view().basement).toBe(false);
    // Already there: nothing happens.
    expect(s.director.expressRide(6)).toBe(false);
    expect(s.director.expressRide(0)).toBe(false);
    expect(s.director.expressRide(21)).toBe(false);
    await s.director.idle();
    expect(await evidence(s)).toEqual(before);
    // The places visited, for the tower map: world memory only.
    expect(s.view().visited).toEqual(expect.arrayContaining([visitKey(20), visitKey(BASEMENT), visitKey(1), visitKey(6)]));
    s.director.dispose();
    await s.db.close();
  });

  it('never during a job: the directory stays information, the answer window untouched', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    const job = { task: s.view().task, panel: s.view().elevator.panelEnabled, floor: s.view().elevator.floor, lifty: s.view().lifty };
    const before = await evidence(s);
    expect(expressReady(s.view())).toBe(false);
    expect(s.director.expressRide(20)).toBe(false);
    expect(s.director.expressRide(BASEMENT)).toBe(false);
    await s.time.advance(3_000);
    expect({ task: s.view().task, panel: s.view().elevator.panelEnabled, floor: s.view().elevator.floor, lifty: s.view().lifty }).toEqual(job);
    expect(await evidence(s)).toEqual(before);
    // The job still answers normally, independent.
    s.director.pressFloor(solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    expect(JSON.parse(rows.at(-1)!.payload)).toMatchObject({ outcome: 'correct', assistance: 'independent' });
    s.director.dispose();
    await s.db.close();
  });

  it('between jobs (NEXT JOB waiting): a detour to B1 and back to the mission through a hall call', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    s.director.pressFloor(solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success' && s.view().success === 'review')).toBe(true);
    const before = await evidence(s);
    const step = s.view().task?.stepId;
    expect(expressReady(s.view())).toBe(true);
    expect(s.director.expressRide(BASEMENT)).toBe(true);
    // (settled() waits for a stage that takes input; the review waits on NEXT JOB.)
    expect(await s.time.runUntil(() => s.view().express === null && s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(s.view()).toMatchObject({ stage: 'success', success: 'review', basement: true });
    expect(s.view().elevator.panelEnabled).toBe(false); // the review keeps its panel locked
    expect(await evidence(s)).toEqual(before);
    // NEXT JOB from B1: the job never starts in the basement; the lift shows the lobby and the job calls it.
    s.director.nextJob();
    expect(s.view().basement).toBe(false);
    expect(await s.time.runUntil(() => settled(s)() && (s.view().stage === 'task' || s.view().stage === 'call'))).toBe(true);
    if (s.view().stage === 'call') {
      s.director.pressFloor(s.view().hallCall!);
      expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    }
    expect(s.view().task?.stepId).not.toBe(step);
    expect(await evidence(s)).toEqual(before);
    s.director.pressFloor(solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows.at(-1)!.payload)).toMatchObject({ outcome: 'correct', assistance: 'independent' });
    s.director.dispose();
    await s.db.close();
  });
});
