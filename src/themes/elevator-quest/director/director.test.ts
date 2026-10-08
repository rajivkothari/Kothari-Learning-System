// Floor 15, headless: the real director, runtime, and SQLite on virtual time.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { CLASSIC_CONTENT, LEARNER, answerCorrectly, openSession, pinPools, settled, solve, tempDir, virtualTime, waitSettled, type Session } from '../testing/headless';

const arrivals = (s: Session) => s.log.entries().filter((e) => e.kind === 'elevator.arrive').map((e) => e.data.floor);
/** The classic math jobs, and the reading steps (version 3) pinned so that each way of answering one comes up: touch, ride, cards. */
const WHOLE_MISSION = pinPools(CLASSIC_CONTENT, { 'read-1': 'reading.details.touch', 'read-2': 'reading.sequence.ride', 'read-3': 'reading.inference.touch', 'read-4': 'reading.vocabulary.cards' });
const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');

async function wakeTheLift(s: Session) {
  expect(s.view()).toMatchObject({ stage: 'intro', power: 'off' });
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

describe('Floor 15 director', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('plays the whole mission: wake, ride, wrong floor, help, stretch, encounter, finale, unlocks', async () => {
    const time = virtualTime();
    // Pools pinned to the classic jobs (one of each kind, in a known order) and one reading job of each
    // answer mode; the newer math jobs have their own tests.
    const s = await openSession(tmp.file, time, { content: WHOLE_MISSION });
    await wakeTheLift(s);

    // First job: its floor calls the lift (a hall call the learner presses), then the learner operates it.
    let v = s.view();
    expect(v).toMatchObject({ stage: 'task', power: 'on', task: { kind: 'panel', stepId: 'cued-moves', reference: 'start' } });
    expect(v.elevator.floor).toBe(v.task!.move!.start);
    expect(s.log.entries().some((e) => e.kind === 'elevator.depart' && e.data.kind === 'reposition')).toBe(true);
    expect(v.lifty.line).toContain(`Floor ${v.task!.move!.start}`);

    // Wrong floor: the elevator really goes there, THEN the world explains (D149): the move the
    // answer made is drawn on the shaft map, Lifty gives one cue, and the correction waits.
    const job = v.task!.move!;
    const right = solve(s);
    const wrong = right + (right < 20 ? 1 : -1);
    s.director.pressFloor(wrong);
    expect(s.view().elevator.lit).toEqual([wrong]);
    await time.runUntil(() => s.view().stage === 'riding');
    expect(s.view().lifty.mood).toBe('thinking'); // no verdict while moving
    expect(await time.runUntil(() => s.view().rescueReady && !s.view().saving)).toBe(true);
    v = s.view();
    expect(v.elevator.floor).toBe(wrong);
    expect(arrivals(s).at(-1)).toBe(wrong);
    expect(v).toMatchObject({ stage: 'pause', rescueReady: true, lifty: { mood: 'concerned' }, mismatch: { from: job.start, to: wrong }, help: null });
    expect(v.elevator.panelEnabled).toBe(false);
    expect(v.lifty.line).not.toMatch(/quantity\.|misconception|wrong!/i);
    expect(v.lifty.line).not.toContain(`Floor ${right}`); // the consequence, never the answer
    // LET'S COUNT: the learner counts their own job through, then says where it stops.
    s.director.beginRescue();
    v = s.view();
    expect(v).toMatchObject({ stage: 'rescue', rescueReady: false, rescue: { corrective: true, origin: job.start, steps: job.change, direction: job.direction } });
    const sign = job.direction === 'down' ? -1 : 1;
    for (let k = 1; k <= job.change; k++) s.director.rescueTap(job.start + sign * k);
    s.director.rescueTap(right);
    // A fresh job of the same kind follows; the corrected one is never answered again.
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    v = s.view();
    expect(v.task?.stepId).toBe('cued-moves');
    expect(v.task!.move).not.toEqual(job);
    expect(v.lifty.line).toMatch(/^New job\./);

    // Optional help on the fresh job: a clue rings the starting floor. Nothing forced.
    expect(v.help).toMatchObject({ label: 'CLUE' });
    s.director.requestHelp();
    await time.runUntil(() => !s.view().saving);
    expect(s.view().highlights).toEqual([v.task!.move!.start]);
    expect(s.view().lifty.mood).toBe('helping');
    await answerCorrectly(s); // the first step has one job (version 3)

    // Read and touch: the note says which thing; the car stands at its landing, doors open, and the
    // thing is touched there. The floor buttons are not the answer.
    v = s.view();
    expect(v).toMatchObject({ stage: 'task', task: { kind: 'read', stepId: 'read-1' }, reading: { mode: 'touch', open: true } });
    expect(v.elevator).toMatchObject({ floor: v.reading!.floor, phase: 'idleOpen', panelEnabled: false });
    expect(v.answerTargets).toMatchObject({ floor: v.reading!.floor });
    await answerCorrectly(s);

    // Second representation: the shaft map is an input too.
    v = s.view();
    expect(v).toMatchObject({ stage: 'task', shaftMode: 'map', task: { kind: 'shaft', stepId: 'second-representation' } });
    s.director.pressFloor(solve(s), 'shaft');
    await time.runUntil(() => settled(s)() && s.view().task?.stepId === 'two-groups');

    // Two orders: the cargo bay, with more crates on the dock than the orders ask for.
    v = s.view();
    expect(v).toMatchObject({ stage: 'cargo', task: { kind: 'cargo', cargo: { aboard: 0 } } });
    const [orderA, orderB] = v.task!.cargo!.orders!;
    expect(v.task!.cargo!.waiting).toBeGreaterThan(orderA + orderB);
    expect(v.lifty.line).toContain(`${orderA} crates for the crew, ${orderB} for the roof`);
    await answerCorrectly(s);

    // Read and ride: the note names a floor to work out; the panel answers it, like a move.
    v = s.view();
    expect(v).toMatchObject({ stage: 'task', task: { kind: 'panel', stepId: 'read-2' }, reading: { mode: 'ride' }, answerTargets: null });
    expect(v.elevator.panelEnabled).toBe(true);
    await answerCorrectly(s);

    // A two-part trip, from the floor the job calls from.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'panel', stepId: 'two-moves', job: { shape: 'twoMoves' } });
    expect(v.elevator.floor).toBe(v.task!.job!.anchor);
    expect(v.lifty.line).toMatch(/Two-part trip: from Floor \d+, go \d+ floors (up|down), then \d+ floors (up|down)/);
    await answerCorrectly(s);

    // The express (the number-sense pool, pinned): equal jumps, the first two stops given.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'panel', stepId: 'number-sense', job: { shape: 'express' } });
    expect(v.lifty.line).toMatch(/stops at \d+, \d+, and on up/);
    await answerCorrectly(s);

    // Read and touch again (inference).
    expect(s.view()).toMatchObject({ task: { kind: 'read', stepId: 'read-3' }, reading: { mode: 'touch' } });
    await answerCorrectly(s);

    // Where did it start? The car waits where the crew got off.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'panel', stepId: 'start-unknown', job: { shape: 'startFloor' } });
    expect(v.lifty.line).toContain(`got off here, on Floor ${v.elevator.floor}`);
    await answerCorrectly(s);

    // The trip meter: the floor buttons are not the answer; the meter is. GO at zero only asks.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'meter', stepId: 'compare-distance', meter: { value: 0 } });
    expect(v.elevator.panelEnabled).toBe(false);
    expect(v.beacon).toBe(v.task!.job!.vars.to);
    s.director.meterGo();
    expect(s.view()).toMatchObject({ stage: 'task', lifty: { line: LINES.meter.empty } });
    await answerCorrectly(s);
    await time.runUntil(() => settled(s)() && s.view().task?.stepId === 'stretch');

    // Stretch (pinned to the beacon): the reference point is a beacon, not where the car is.
    v = s.view();
    expect(v.task).toMatchObject({ kind: 'panel', reference: 'beacon' });
    expect(v.beacon).toBe(v.task!.move!.start);
    expect(v.lifty.line).toMatch(/beacon/);
    expect(v.lifty.line).not.toMatch(/stretch/i);
    await answerCorrectly(s);

    // Read and choose: a word in context, answered with the cards.
    v = s.view();
    expect(v).toMatchObject({ stage: 'task', task: { kind: 'read', stepId: 'read-4' }, reading: { mode: 'choose' }, answerTargets: null });
    expect(v.reading!.options.length).toBeGreaterThanOrEqual(2);
    await answerCorrectly(s);

    // Encounter stage 1: route to the dock.
    v = s.view();
    expect(v.task).toMatchObject({ stepId: 'capacity-encounter', kind: 'panel' });
    await answerCorrectly(s);

    // Encounter stage 2: load the car. Overload is refused by the car itself; revise; go.
    v = s.view();
    expect(v.stage).toBe('cargo');
    const cargo = v.task!.cargo!;
    const need = solve(s);
    for (let i = 0; i <= need; i++) s.director.loadCrate();
    s.director.pressDoorClose();
    await time.runUntil(() => !s.view().saving);
    expect(s.view().task!.cargo).toMatchObject({ status: 'overload', loaded: need + 1 });
    expect(s.view().elevator.phase).toBe('idleOpen'); // doors refuse to close
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'overloadTone')).toBe(true);
    s.director.unloadCrate();
    s.director.pressDoorClose();
    await time.runUntil(() => s.view().stage === 'finale' && !s.view().saving);
    expect(cargo.capacity).toBeGreaterThan(cargo.aboard);

    // Finale: only the repair floor makes sense now.
    v = s.view();
    expect(v.highlights).toEqual([FLOOR15.repairFloor]);
    s.director.pressFloor(FLOOR15.repairFloor - 1);
    expect(s.view().elevator.lit).toEqual([]);
    s.director.pressFloor(FLOOR15.repairFloor);
    // Completion happens in the world: no card. The floor comes back, the lamps sweep once, Lifty
    // names the rank and the clipboard, and the lift is the learner's.
    await time.runUntil(() => s.view().stage === 'freeRide');
    v = s.view();
    expect(v).toMatchObject({ stage: 'freeRide', power: 'on', maintenanceUnlocked: true, floor15Restored: true, rank: 'ENGINEER RANK 1', sweep: 1, lifty: { line: LINES.rankEarned } });
    expect(v).not.toHaveProperty('overlay');
    expect(v.elevator.panelEnabled).toBe(true);
    expect(v.progress.every((p) => p.done)).toBe(true);
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'completion')).toBe(true);

    // Durable facts.
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'")).toBe(1);
    expect((await s.rt.unlocks(LEARNER)).map((u) => u.unlockId).sort()).toEqual(['eq.landing.floor-15-restored', 'eq.rank.engineer-1', 'eq.system.maintenance-panel']);
    const attempts = await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
    const corrections = s.log.entries().filter((e) => e.kind === 'correction.complete').length;
    expect(corrections).toBe(1);
    expect(attempts).toBe(answers(s).filter((a) => a.data.correct === true).length + corrections); // one per solved item, and the corrected job as missed
    // The fresh job after the correction is never independent evidence.
    const attemptRows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    const recorded = attemptRows.map((r) => JSON.parse(r.payload) as { outcome: string; assistance: string; conceptRescue?: boolean });
    expect(recorded.slice(0, 2)).toEqual([expect.objectContaining({ outcome: 'incorrect', conceptRescue: true }), expect.objectContaining({ outcome: 'correct', conceptRescue: true })]);
    expect(recorded[1]!.assistance).not.toBe('independent');
    const replay = await s.rt.replayFromHistory(LEARNER);
    expect(canonicalJson(await s.rt.learnerState(LEARNER))).toBe(canonicalJson(replay.state));

    // Free ride afterwards: the elevator is the reward. No commands reach the learning runtime.
    const rows = await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');
    s.director.pressFloor(3);
    expect(await time.runUntil(() => s.view().elevator.floor === 3 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(rows);

    // Replay for fun: unlocks are not granted again.
    await s.director.playAgain();
    await wakeTheLift(s);
    for (let guard = 0; guard < 20 && s.view().stage !== 'finale'; guard++) await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide');
    expect(s.view()).toMatchObject({ sweep: 2, lifty: { line: LINES.completeAgain } });
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(3); // replaying never duplicates an unlock
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
  });

  it('finishes even when the loading dock is Floor 15 itself (no ride needed)', async () => {
    const time = virtualTime();
    // Seed found by search (mission version 3): this instance's encounter route ends at Floor 15.
    const s = await openSession(tmp.file, time, { instanceId: 'dock15-92' });
    await wakeTheLift(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    expect(s.view().elevator.floor).toBe(FLOOR15.repairFloor);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
    expect(s.log.entries().filter((e) => e.kind === 'mission.complete')).toHaveLength(1);
    s.director.dispose();
    await s.db.close();
  });

  it('button mashing creates one ride, one answer, and one attempt', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const target = solve(s);
    for (let i = 0; i < 10; i++) s.director.pressFloor(target);
    await time.advance(200);
    for (let i = 0; i < 10; i++) s.director.pressFloor(target);
    await time.runUntil(() => s.view().stage === 'riding');
    for (let i = 0; i < 10; i++) s.director.pressFloor(i + 1); // mashing other floors mid-ride
    await waitSettled(s);
    expect(answers(s)).toHaveLength(1);
    expect(s.log.entries().filter((e) => e.kind === 'commit')).toHaveLength(1);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(1);
    // One chime and one call-registered tone per real ride, however hard the panel was mashed.
    const rides = s.log.entries().filter((e) => e.kind === 'elevator.depart').length;
    expect(s.audio.filter((c) => c.action === 'play' && c.slot === 'arrivalChime').length).toBe(s.log.entries().filter((e) => e.kind === 'elevator.arrive').length);
    expect(s.audio.filter((c) => c.action === 'play' && c.slot === 'floorButtonActivate').length).toBe(rides);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart' && e.data.kind === 'answer')).toHaveLength(1);
    s.director.dispose();
    await s.db.close();
  });

  it('choosing the floor the car is on is an answer evaluated in place, without a ride', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const here = s.view().elevator.floor;
    const departs = s.log.entries().filter((e) => e.kind === 'elevator.depart').length;
    s.director.pressFloor(here);
    expect(await time.runUntil(() => s.view().rescueReady && s.view().task!.wrongTries === 1)).toBe(true);
    expect(answers(s)).toEqual([expect.objectContaining({ data: expect.objectContaining({ value: here, correct: false }) })]);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart')).toHaveLength(departs);
    // The correction waits: the panel stays locked, so no tap can answer anything meanwhile.
    expect(s.view().elevator.panelEnabled).toBe(false);
    s.director.pressFloor(solve(s));
    expect(s.view().elevator.lit).toEqual([]);
    s.director.dispose();
    await s.db.close();
  });

  it('a misconception is explained in building terms without giving the answer away', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const move = s.view().task!.move!;
    expect(move.direction).toBe('up'); // the first step is cued "up"
    const short = solve(s) - 1;
    s.director.pressFloor(short); // counted the starting floor
    expect(await time.runUntil(() => s.view().rescueReady && s.view().elevator.phase === 'idleOpen')).toBe(true);
    const v = s.view();
    // The missing object first (the world's cue), then the explanation, one short actionable line.
    expect(v.lifty.line).toBe(`No repair kit here. One floor short. Floor ${move.start} is where we start. Count the floors after ${move.start}.`);
    // The shaft map shows the move the answer made (one short of the job), never the answer's floor.
    expect(v.mismatch).toEqual({ from: move.start, to: short });
    expect(v.shaftMode).toBe('map');
    expect(v.highlights).toEqual([]);
    s.director.dispose();
    await s.db.close();
  });

  it('a change of plan before departure is praised and counts as one answer', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await wakeTheLift(s);
    const right = solve(s);
    s.director.pressFloor(right === 20 ? 19 : right + 1);
    await time.advance(200);
    s.director.pressFloor(right);
    await time.runUntil(() => s.view().success === 'animating');
    expect(answers(s)).toEqual([expect.objectContaining({ data: expect.objectContaining({ value: right, correct: true, changedPlan: true }) })]);
    expect(s.view().lifty.line).toMatch(/^There it is: the repair kit\. You changed your plan\. That worked\./);
    s.director.dispose();
    await s.db.close();
  });

  it('switching motion mid-ride waits for the stop, so the trip keeps one consistent profile', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { motion: 'reduced' });
    await wakeTheLift(s);
    s.director.pressFloor(solve(s) === 20 ? 1 : 20);
    await time.runUntil(() => s.view().elevator.phase === 'traveling');
    const timing = s.view().timing;
    s.director.setMotion('normal');
    expect(s.view().timing).toBe(timing); // unchanged while moving
    const floors: number[] = [];
    await time.runUntil(() => {
      floors.push(s.view().elevator.indicator);
      return s.view().elevator.phase === 'idleOpen';
    });
    for (let i = 1; i < floors.length; i++) expect(Math.abs(floors[i]! - floors[i - 1]!)).toBeLessThanOrEqual(1);
    expect(s.view().timing).not.toBe(timing); // applied at the stop
    expect(s.view().motion).toBe('normal');
    s.director.dispose();
    await s.db.close();
  });

  it('reduced motion plays the same mission with the same learning record, faster', async () => {
    const play = async (motion: 'normal' | 'reduced', file: string) => {
      const time = virtualTime();
      const s = await openSession(file, time, { motion, instanceId: 'same-seed' });
      const t0 = time.now();
      await wakeTheLift(s);
      for (let guard = 0; guard < 20 && s.view().stage !== 'finale'; guard++) await answerCorrectly(s);
      const events = (await s.db.all<{ id: string }>('SELECT id FROM learning_events ORDER BY seq')).map((r) => r.id);
      const tasks = s.log.entries().filter((e) => e.kind === 'task').map((e) => ({ ...e.data }));
      const elapsed = time.now() - t0;
      s.director.dispose();
      await s.db.close();
      return { events, tasks, elapsed };
    };
    const other = tempDir();
    const normal = await play('normal', tmp.file);
    const reduced = await play('reduced', other.file);
    other.cleanup();
    expect(reduced.events).toEqual(normal.events);
    expect(reduced.tasks).toEqual(normal.tasks);
    expect(reduced.elapsed).toBeLessThan(normal.elapsed * 0.6);
  });
});
