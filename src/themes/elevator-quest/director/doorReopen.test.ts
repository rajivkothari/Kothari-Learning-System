// A door that opens is not an arrival. Only the doors opening after the car has stopped at a floor
// complete a ride; a door reopened where the car already stood (DOOR OPEN while the doors closed on a
// chosen floor, DOOR CLOSE then DOOR OPEN at a call) presents no job, judges no answer and records
// nothing, and the ride it interrupted leaves again. A scripted child playtest (2026-11) found the job
// presented on the wrong floor from such a door, a wrong answer explained from there, and a
// read-and-touch job whose things were on another landing, with nothing left to press.
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { activeTestLearner } from '../../../runtime/devSeed';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { count, fakeClock } from '../../../runtime/testing/harness';
import { FLOOR15, THEME_PACK_ID } from '../content/floor15';
import { BASEMENT } from '../content/landings';
import { jumpTo } from '../devtools/floor15Tools';
import { NORMAL_TIMING, isMoving } from '../sim/elevator';
import { CONTENT, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';

const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
const events = (s: Session) => count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');
const logged = (s: Session, kind: string) => s.log.entries().filter((e) => e.kind === kind);
const atRest = (s: Session) => s.view().elevator.phase === 'idleOpen' && !s.view().saving;

/** Every view in which a job is offered (its answer can be given) while the car is not on `floor`. */
function watchOffers(s: Session, floor: () => number | null) {
  const wrong: { stage: string; at: number; line: string }[] = [];
  s.director.subscribe((v) => {
    const want = floor();
    if (want !== null && (v.stage === 'task' || v.stage === 'cargo') && v.elevator.floor !== want) wrong.push({ stage: v.stage, at: v.elevator.floor, line: v.lifty.line });
  });
  return wrong;
}

/** A dev-tools jump to one job (a fresh test learner), opened and settled. */
async function sessionAt(file: string, jump: string): Promise<Session> {
  const db = openNodeDatabase(file);
  const rt = await openGameRuntime(db, CONTENT, fakeClock());
  const learnerId = await activeTestLearner(rt, 'learner-test-a', THEME_PACK_ID);
  const instanceId = await jumpTo({ db, runtime: rt, content: CONTENT, now: () => 1_791_244_800_000 }, learnerId, jump);
  await db.close();
  const s = await openSession(file, virtualTime(), { instanceId, learnerId, autoHallCalls: false });
  return s;
}

describe('a reopened door is not an arrival', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('a hall call: the floor is pressed, DOOR OPEN while the doors close; the job waits for the real arrival, and nothing is recorded', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const home = s.view().elevator.floor;
    const call = s.view().hallCall!;
    expect(call).not.toBe(home);
    const wrong = watchOffers(s, () => call);
    s.director.pressFloor(call);
    expect(await time.runUntil(() => s.view().elevator.phase === 'doorsClosing')).toBe(true);
    // Half way shut (half of NORMAL_TIMING.doorCloseMs, so the doors' way back takes a whole number of milliseconds: the virtual
    // clock would otherwise run on fractions, which a commit's timestamp does not accept. Real clocks are whole.)
    await time.advance(NORMAL_TIMING.doorCloseMs / 2);
    s.director.pressDoorOpen();
    expect(s.view().elevator.phase).toBe('doorsOpening');
    // The doors are open again on the floor the car never left.
    expect(await time.runUntil(() => s.view().elevator.phase === 'idleOpen')).toBe(true);
    await time.advance(700);
    expect(s.view()).toMatchObject({ stage: 'reposition', elevator: { floor: home, destination: call } });
    expect(logged(s, 'doors.reopened').map((e) => e.data)).toEqual([{ stage: 'reposition', kind: 'reposition', floor: home, destination: call }]);
    // Pressing floors now answers nothing: no window is open before the job is there.
    for (const f of [2, 5, 9]) s.director.pressFloor(f);
    expect(logged(s, 'answer')).toEqual([]);
    // The car leaves again by itself and the job is presented where it is.
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    expect(s.view().elevator.floor).toBe(call);
    expect(wrong).toEqual([]);
    expect(logged(s, 'elevator.arrive').map((e) => e.data.floor)).toEqual([call]);
    await s.director.idle();
    expect(await attempts(s)).toBe(0);
    // And the job is the real one: answered from its own floor, one attempt.
    s.director.pressFloor(solve(s));
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect(await attempts(s)).toBe(1);
    s.director.dispose();
    await s.db.close();
  });

  it('a hall call: DOOR CLOSE, then DOOR OPEN, without pressing the floor: the call still waits', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const home = s.view().elevator.floor;
    const call = s.view().hallCall!;
    const wrong = watchOffers(s, () => call);
    for (const wait of [200, 2_000]) {
      // While the doors close, and after they have closed.
      s.director.pressDoorClose();
      await time.advance(wait);
      s.director.pressDoorOpen();
      expect(await time.runUntil(() => s.view().elevator.phase === 'idleOpen')).toBe(true);
      await time.advance(1_000);
      expect(s.view()).toMatchObject({ stage: 'call', hallCall: call, elevator: { floor: home } });
    }
    expect(wrong).toEqual([]);
    expect(logged(s, 'task').length).toBe(1); // the job was prepared once, and never begun here
    s.director.pressFloor(call);
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    expect(s.view().elevator.floor).toBe(call);
    await s.director.idle();
    expect(await attempts(s)).toBe(0);
    s.director.dispose();
    await s.db.close();
  });

  it("the lift's own ride back to a job after LET'S COUNT: DOOR OPEN on the way presents nothing until it is there", async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    const anchor = s.view().elevator.floor;
    // A miss rides to the wrong floor; the correction is counted through; the lift then rides back by itself.
    const right = solve(s);
    s.director.pressFloor(right >= 19 ? right - 2 : right + 2);
    expect(await time.runUntil(() => s.view().rescueReady)).toBe(true);
    const missedAt = s.view().elevator.floor;
    expect(missedAt).not.toBe(anchor);
    s.director.beginRescue();
    const r = s.view().rescue!;
    const sign = r.direction === 'down' ? -1 : 1;
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    s.director.rescueTap(r.origin + sign * r.steps);
    expect(await time.runUntil(() => s.view().stage === 'reposition' && s.view().elevator.phase === 'doorsClosing')).toBe(true);
    const before = { attempts: await attempts(s), events: await events(s) };
    // The fresh job after a correction has a floor of its own: wherever it is, it is never offered anywhere else.
    const wrong = watchOffers(s, () => s.view().task?.job?.anchor ?? null);
    await time.advance(150);
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().elevator.phase === 'idleOpen')).toBe(true);
    await time.advance(500);
    expect(s.view()).toMatchObject({ stage: 'reposition', elevator: { floor: missedAt } });
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    expect(s.view().elevator.floor).toBe(s.view().task!.job!.anchor);
    expect(s.view().elevator.floor).not.toBe(missedAt);
    expect(wrong).toEqual([]);
    expect(logged(s, 'doors.reopened').map((e) => e.data.kind)).toEqual(['reposition']);
    await s.director.idle();
    expect({ attempts: await attempts(s), events: await events(s) }).toEqual(before);
    s.director.dispose();
    await s.db.close();
  });

  it('a trip meter answer (locked at GO): DOOR OPEN before the car leaves shows no result until the car has arrived, and the answer is one attempt', async () => {
    const s = await sessionAt(tmp.file, 'meter-far');
    // The job may wait behind a hall call: take it.
    if (!(await s.time.runUntil(() => settled(s)() || s.view().stage === 'call'))) throw new Error('never settled');
    if (s.view().stage === 'call') {
      s.director.pressFloor(s.view().hallCall!);
      expect(await s.time.runUntil(settled(s))).toBe(true);
    }
    expect(s.view().task?.meter).toBeTruthy();
    const from = s.view().elevator.floor;
    const right = solve(s);
    while (s.view().task!.meter!.value < right) s.director.meterStep(1);
    s.director.meterGo();
    expect(logged(s, 'answer')).toHaveLength(1);
    const early: string[] = [];
    s.director.subscribe((v) => {
      // Before the car has left the job's floor, nothing may be presented as the outcome.
      if (v.elevator.floor === from && !isMoving(v.elevator) && v.stage !== 'riding') early.push(v.stage);
    });
    expect(await s.time.runUntil(() => s.view().elevator.phase === 'doorsClosing')).toBe(true);
    await s.time.advance(200);
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => s.view().elevator.phase === 'idleOpen')).toBe(true);
    await s.time.advance(800);
    expect(s.view()).toMatchObject({ stage: 'riding', success: null, elevator: { floor: from } });
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(s.view().elevator.floor).not.toBe(from);
    expect(early).toEqual([]);
    await s.director.idle();
    expect(await attempts(s)).toBe(1);
    s.director.dispose();
    await s.db.close();
  });

  it('a two-part trip: a door reopened on the way to the first stop keeps it a step, never an answer', async () => {
    const s = await sessionAt(tmp.file, 'two-part-wide');
    if (!(await s.time.runUntil(() => settled(s)() || s.view().stage === 'call'))) throw new Error('never settled');
    if (s.view().stage === 'call') {
      // The call ride itself is interrupted too: the job must still open on its own floor.
      const call = s.view().hallCall!;
      s.director.pressFloor(call);
      expect(await s.time.runUntil(() => s.view().elevator.phase === 'doorsClosing')).toBe(true);
      s.director.pressDoorOpen();
      expect(await s.time.runUntil(settled(s))).toBe(true);
      expect(s.view().elevator.floor).toBe(call);
    }
    const job = s.view().task!.job!;
    expect(job.shape).toBe('twoMoves');
    expect(s.view().elevator.floor).toBe(job.anchor);
    const vars = job.vars as { start: number; change: number; dir: string };
    const firstStop = vars.dir === 'up' ? vars.start + vars.change : vars.start - vars.change;
    s.director.pressFloor(firstStop);
    expect(await s.time.runUntil(() => s.view().elevator.phase === 'doorsClosing')).toBe(true);
    await s.time.advance(200);
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(s.view().elevator.floor).toBe(job.anchor);
    // The car goes on to the first stop: a step, logged as one, with no answer and no attempt.
    expect(await s.time.runUntil(() => s.view().elevator.floor === firstStop && atRest(s) && s.view().stage === 'task')).toBe(true);
    expect(logged(s, 'answer.leg')).toHaveLength(1);
    expect(logged(s, 'answer')).toEqual([]);
    await s.director.idle();
    expect(await attempts(s)).toBe(0);
    s.director.dispose();
    await s.db.close();
  });

  it('the lobby and B1 behind the same doors: DOOR OPEN while they close never swaps the place with the doors open, and the ride still ends', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide' && atRest(s))).toBe(true);
    s.director.pressFloor(1);
    expect(await time.runUntil(() => s.view().elevator.floor === 1 && atRest(s))).toBe(true);
    await time.advance(3_000);
    const before = await events(s);
    const openSwaps: string[] = [];
    let was = s.view().basement;
    s.director.subscribe((v) => {
      if (v.basement !== was && v.elevator.phase !== 'idleClosed') openSwaps.push(v.elevator.phase);
      was = v.basement;
    });
    s.director.pressBasement();
    expect(s.view().express).toEqual({ to: BASEMENT });
    await time.advance(200);
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().express === null && atRest(s), 30_000)).toBe(true);
    expect(s.view()).toMatchObject({ basement: true, stage: 'freeRide', elevator: { floor: 1, panelEnabled: true } });
    expect(openSwaps).toEqual([]);
    await s.director.idle();
    expect(await events(s)).toBe(before);
    s.director.dispose();
    await s.db.close();
  });

  it('an existing save resumes exactly as before: closed during an interrupted call ride, it reopens on the same job at its own floor', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time, { instanceId: 'saved', autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const call = s.view().hallCall!;
    const id = s.director.instanceId();
    const item = s.rt.currentView(id).view.activity!.itemSignature;
    s.director.pressFloor(call);
    await time.runUntil(() => s.view().elevator.phase === 'doorsClosing');
    s.director.pressDoorOpen();
    await time.runUntil(() => s.view().elevator.phase === 'idleOpen');
    const saved = { attempts: await attempts(s), events: await events(s) };
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
    // The app comes back: the same mission, the same job and item, standing at the job's floor with
    // its window open (a resume never needed a ride), nothing added to the record.
    s = await openSession(tmp.file, time, { instanceId: 'saved', autoHallCalls: false });
    expect(await time.runUntil(settled(s))).toBe(true);
    expect(s.view()).toMatchObject({ stage: 'task', elevator: { floor: call, phase: 'idleOpen' } });
    expect(s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature).toBe(item);
    expect({ attempts: await attempts(s), events: await events(s) }).toEqual(saved);
    s.director.pressFloor(solve(s));
    expect(await time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.director.idle();
    expect(await attempts(s)).toBe(1);
    s.director.dispose();
    await s.db.close();
  });
});
