/// <reference types="node" />
// Express rides and B1 (D191), headless through the real director, runtime and SQLite. An express
// ride is a short ride the lift takes itself, from the directory, in free play or between jobs while
// NEXT JOB waits: never during a job, never an answer, never help, nothing recorded as learning. B1
// is a place below the numbered floors, never a floor number: the car stands at the bottom of the
// shaft and its doors open onto the basement instead of the lobby.
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { BASEMENT } from '../content/landings';
import { gameEntrance } from '../minigames/hostEntrance';
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { computeLayout } from '../ui/layout';
import { fitLine, liftyContext, liftyPlacement } from '../ui/liftyPlacement';
import { EXPRESS_INTRO_MS, EXPRESS_TIP, expressReady, visitKey, type DirectorView } from './director';

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

describe('the panel B1 button (D194)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('free play: rides to B1 at the usual pace from anywhere, and is a no-op in B1; nothing recorded', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await toFreeRide(s);
    const before = await evidence(s);
    s.director.pressFloor(9);
    expect(await s.time.runUntil(() => s.view().elevator.floor === 9 && atRest(s)())).toBe(true);
    const normal = s.view().timing.perFloorMs;
    const t0 = s.time.now();
    s.director.pressBasement();
    expect(s.view().express).toEqual({ to: BASEMENT });
    expect(s.view().timing.perFloorMs).toBe(normal); // not the directory's quick ride
    expect(s.view().lifty.line).not.toBe(LINES.expressRide);
    expect(await s.time.runUntil(atRest(s))).toBe(true);
    expect(s.time.now() - t0).toBeGreaterThan(3_000);
    expect(s.view()).toMatchObject({ basement: true });
    expect(s.view().elevator.floor).toBe(1);
    // B1 is never a numbered floor: no press of 0, nothing lit, nothing beyond the shaft.
    expect(s.view().elevator.lit).toEqual([]);
    const at = s.view();
    s.director.pressBasement();
    await s.time.advance(1_000);
    expect(s.view()).toMatchObject({ basement: true, express: null, elevator: { floor: 1, phase: 'idleOpen' } });
    expect(s.view().stage).toBe(at.stage);
    // From the lobby too: the doors cycle onto the basement.
    s.director.pressFloor(1);
    expect(await s.time.runUntil(() => !s.view().basement && atRest(s)())).toBe(true);
    s.director.pressBasement();
    expect(await s.time.runUntil(() => s.view().basement && atRest(s)())).toBe(true);
    await s.director.idle();
    expect(await evidence(s)).toEqual(before);
    s.director.dispose();
    await s.db.close();
  });

  it('during a job and before the power is on: never a ride, never an answer; Lifty says why, then her job line comes back', async () => {
    const s = await openSession(tmp.file, virtualTime());
    // Power off: nothing at all.
    const intro = s.view();
    s.director.pressBasement();
    await s.time.advance(500);
    expect({ stage: s.view().stage, lifty: s.view().lifty.line, express: s.view().express }).toEqual({ stage: intro.stage, lifty: intro.lifty.line, express: null });
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    const job = { task: s.view().task, panel: s.view().elevator.panelEnabled, floor: s.view().elevator.floor, lit: s.view().elevator.lit };
    const line = s.view().lifty.line;
    const before = await evidence(s);
    s.director.pressBasement();
    expect(s.view().lifty.line).toBe(LINES.basementLater);
    expect(s.view().express).toBeNull();
    expect(s.view().basement).toBe(false);
    await s.time.advance(5_000);
    expect(s.view().lifty.line).toBe(line);
    expect({ task: s.view().task, panel: s.view().elevator.panelEnabled, floor: s.view().elevator.floor, lit: s.view().elevator.lit }).toEqual(job);
    expect(await evidence(s)).toEqual(before);
    // The job still answers normally, independent.
    s.director.pressFloor(solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ outcome: 'correct', assistance: 'independent' });
    s.director.dispose();
    await s.db.close();
  });
});

describe('the express introduction (D192)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());
  const tips = async (s: Session) => (await s.db.all<{ memory_key: string }>("SELECT memory_key FROM world_memory WHERE memory_key LIKE 'eq.tip.%' ORDER BY seq")).map((r) => r.memory_key);

  it('once, the first time free play opens: Lifty says how, the DIRECTORY plate is ringed; never again after a restart; nothing recorded', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time);
    await toFreeRide(s);
    const before = await evidence(s);
    expect(s.view().lifty.line).not.toBe(LINES.directory.expressIntro);
    await time.advance(EXPRESS_INTRO_MS + 100);
    expect(s.view().lifty.line).toBe(LINES.directory.expressIntro);
    expect(s.view().directoryHint).toBe(true);
    // Opening the directory puts the ring away.
    s.director.directoryOpened();
    expect(s.view().directoryHint).toBe(false);
    s.director.directoryClosed();
    await s.director.idle();
    expect(await tips(s)).toContain(EXPRESS_TIP);
    expect(await evidence(s)).toEqual(before);
    s.director.dispose();
    await s.db.close();
    // Back in free play after a restart: not again.
    s = await openSession(tmp.file, time);
    expect(await time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
    await time.advance(EXPRESS_INTRO_MS * 3);
    expect(s.view().lifty.line).not.toBe(LINES.directory.expressIntro);
    expect(s.view().directoryHint).toBe(false);
    s.director.dispose();
    await s.db.close();
  });

  it('waits for a quiet moment (a ride under way), and is met already if the directory was opened in free play', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await toFreeRide(s);
    s.director.pressFloor(2); // a long ride down: the introduction waits for the doors
    await time.advance(EXPRESS_INTRO_MS + 100);
    expect(s.view().lifty.line).not.toBe(LINES.directory.expressIntro);
    expect(await time.runUntil(() => s.view().lifty.line === LINES.directory.expressIntro, 30_000)).toBe(true);
    expect(s.view().elevator.phase).toBe('idleOpen');
    s.director.dispose();
    await s.db.close();

    const t2 = tempDir();
    const time2 = virtualTime();
    const u = await openSession(t2.file, time2);
    await toFreeRide(u);
    u.director.directoryOpened();
    u.director.directoryClosed();
    await time2.advance(EXPRESS_INTRO_MS * 3);
    expect(u.view().lifty.line).not.toBe(LINES.directory.expressIntro);
    await u.director.idle();
    expect(await tips(u)).toContain(EXPRESS_TIP);
    u.director.dispose();
    await u.db.close();
    t2.cleanup();
  });

  it('fits Lifty\'s bubble in free play on a Fire HD 8, landscape and portrait', () => {
    const view = { stage: 'freeRide', shaftMode: 'status', highlights: [], countAlong: null, task: null } as unknown as DirectorView;
    for (const [width, height] of [[960, 600], [600, 960]] as const) {
      const bubble = liftyPlacement(computeLayout({ width, height }, { top: 0, right: 0, bottom: 0, left: 0 }), liftyContext(view), { help: false }).bubble;
      expect({ width, fits: fitLine(LINES.directory.expressIntro, bubble) !== null }).toEqual({ width, fits: true });
    }
  });
});
