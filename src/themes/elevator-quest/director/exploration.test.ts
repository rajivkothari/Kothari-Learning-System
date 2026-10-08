// The building as the game: hall calls between jobs, in-world completion, free-ride exploration,
// the Engineer Log and the DOOR CLOSE tip. None of it is learning evidence, progression or value.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { LANDINGS, REACTION_MS, engineerLog, exploreSpots, explorableFloors } from '../content/landings';
import { LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;
const windowsOpened = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer.window' && e.data.open === true).length;

/** Everything learning or progression could have written. Exploration must leave all of it alone. */
async function learningSnapshot(s: Session, learnerId = LEARNER) {
  return {
    events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
    progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
    state: canonicalJson(await s.rt.learnerState(learnerId)),
  };
}

const memoryRows = (s: Session, learnerId = LEARNER) => s.db.all<{ memory_key: string }>('SELECT memory_key FROM world_memory WHERE learner_id = ? ORDER BY seq', [learnerId]);
/** Discoveries only (the DOOR CLOSE tip is remembered during the mission's hall calls too). */
const discoveryRows = async (s: Session, learnerId = LEARNER) => (await memoryRows(s, learnerId)).filter((r) => r.memory_key.startsWith('eq.discovery.'));

async function toFreeRide(s: Session) {
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
  while (s.view().stage !== 'finale') await answerCorrectly(s);
  s.director.pressFloor(FLOOR15.repairFloor);
  expect(await s.time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
}

async function rideTo(s: Session, floor: number) {
  if (s.view().elevator.floor !== floor) s.director.pressFloor(floor);
  expect(await s.time.runUntil(() => s.view().elevator.floor === floor && s.view().elevator.phase === 'idleOpen')).toBe(true);
}

async function restart(s: Session, file: string, time: VirtualTime, learnerId = LEARNER) {
  await s.director.idle();
  s.director.dispose();
  await s.db.close();
  return openSession(file, time, { learnerId });
}

describe('hall calls', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the next job calls the lift; only its floor lights; pressing it rides there; the job opens on arrival', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const v = s.view();
    const call = v.hallCall!;
    expect(call).toBe(s.rt.currentView(s.director.instanceId()).view.activity!.prompt.start);
    expect(v.lifty.line).toBe(LINES.hallCall(call));
    expect(v.elevator.panelEnabled).toBe(true);
    expect([...v.elevator.disabledFloors].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1).filter((f) => f !== call));
    expect(windowsOpened(s)).toBe(0);

    // Another floor does not light. Lifty repeats which button.
    const other = call === 1 ? 2 : call - 1;
    s.director.pressFloor(other);
    expect(s.view().elevator.lit).toEqual([]);
    expect(s.view().stage).toBe('call');

    // The call floor lights and the lift goes. Nothing about it is an answer.
    s.director.pressFloor(call);
    expect(s.view()).toMatchObject({ stage: 'reposition', hallCall: null });
    expect(s.view().elevator.lit).toEqual([call]);
    expect(s.view().elevator.panelEnabled).toBe(false);
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect(s.view().elevator.floor).toBe(call);
    expect(windowsOpened(s)).toBe(1); // opened at the calling floor, not before
    expect(answers(s)).toBe(0);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(0);
    expect(s.log.entries().filter((e) => e.kind === 'elevator.depart' && e.data.kind === 'reposition')).toHaveLength(1);
  });

  it('rapid taps on the call floor and everywhere else during the call ride never answer the job', async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoHallCalls: false });
    s.director.pressDoorOpen();
    await s.time.runUntil(() => s.view().stage === 'call');
    const call = s.view().hallCall!;
    for (let i = 0; i < 10; i++) s.director.pressFloor(call);
    for (const phase of ['doorsClosing', 'departing', 'traveling', 'arrived', 'doorsOpening'] as const) {
      await s.time.runUntil(() => s.view().elevator.phase === phase, 30_000);
      for (let f = 1; f <= 20; f++) s.director.pressFloor(f);
    }
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    await s.time.advance(10_000);
    expect(answers(s)).toBe(0);
    expect(s.view().elevator.lit).toEqual([]);
    expect(s.view().task?.wrongTries).toBe(0);
  });

  it('each job after a correct answer is offered as a hall call (never on the floor the car is already on)', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    await answerCorrectly(s);
    await answerCorrectly(s);
    const calls = s.log.entries().filter((e) => e.kind === 'hallCall');
    const taken = s.log.entries().filter((e) => e.kind === 'hallCall.taken');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(taken.map((e) => e.data.floor)).toEqual(calls.map((e) => e.data.floor));
  });

  it('a hall call survives a restart as the job itself, at its floor', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time, { autoHallCalls: false, instanceId: 'call-restart' });
    s.director.pressDoorOpen();
    await time.runUntil(() => s.view().stage === 'call');
    const call = s.view().hallCall!;
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
    s = await openSession(tmp.file, time, { instanceId: 'call-restart' });
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    expect(s.view().elevator.floor).toBe(call);
    expect(answers(s)).toBe(0);
  });
});

describe('routine rides are quiet', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('an answer ride keeps the job on screen instead of announcing the floor', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    const job = s.view().lifty.line;
    s.director.pressFloor(solve(s));
    await s.time.runUntil(() => s.view().stage === 'riding');
    expect(s.view().lifty).toMatchObject({ line: job, mood: 'thinking' });
    expect(s.view().lifty.line).not.toMatch(/^Heading to/);
  });
});

describe('in-world completion', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('restores the floor in place: no card, one sweep, the core wakes, rank and clipboard, then free ride', async () => {
    const s = await openSession(tmp.file, virtualTime());
    s.director.pressDoorOpen();
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    const seen: { stage: string; sweep: number; power: string; restored: boolean; panel: boolean; line: string }[] = [];
    const stop = s.director.subscribe((v) => seen.push({ stage: v.stage, sweep: v.sweep, power: v.power, restored: v.floor15Restored, panel: v.elevator.panelEnabled, line: v.lifty.line }));
    s.director.pressFloor(FLOOR15.repairFloor);
    await s.time.runUntil(() => s.view().stage === 'freeRide');
    stop();
    // The order: restoring, then restored with one sweep and Lifty's line, then the rank line with free controls.
    const restoredAt = seen.findIndex((x) => x.restored);
    expect(seen.slice(0, restoredAt).some((x) => x.power === 'restoring')).toBe(true);
    expect(seen[restoredAt]).toMatchObject({ stage: 'complete', sweep: 1, panel: false });
    expect(seen.some((x) => x.stage === 'complete' && x.line === LINES.complete)).toBe(true);
    expect(new Set(seen.map((x) => x.sweep))).toEqual(new Set([0, 1]));
    expect(s.view()).toMatchObject({ stage: 'freeRide', rank: 'ENGINEER RANK 1', maintenanceUnlocked: true, lifty: { line: LINES.rankEarned } });
    expect(s.view().reaction).toMatchObject({ floor: FLOOR15.repairFloor, spotId: 'core' });
    expect(s.view().elevator).toMatchObject({ floor: FLOOR15.repairFloor, phase: 'idleOpen', panelEnabled: true, disabledFloors: [] });
    // The core waking is not a discovery: the learner has not touched it.
    expect(s.view().discoveries).toEqual([]);
    expect(await discoveryRows(s)).toEqual([]);
    // Free ride is usable at once, and the replay stays reachable (from the Engineer Log).
    s.director.pressFloor(3);
    expect(await s.time.runUntil(() => s.view().elevator.floor === 3 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    s.director.openLog();
    expect(s.view().logOpen).toBe(true);
    await s.director.playAgain();
    expect(s.view()).toMatchObject({ stage: 'intro', logOpen: false });
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks')).toBe(3);
  });
});

describe('exploration in free ride', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('touching a spot reacts every time, is discovered once, and writes nothing a learner is judged by', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await toFreeRide(s);
    const before = await learningSnapshot(s);
    await rideTo(s, 6);
    // A reading job's touch during the mission played its own reaction sound: count from here.
    const reactionSounds = () => s.audio.filter((c) => c.action === 'play' && c.slot === 'landingReaction').length;
    const soundsBefore = reactionSounds();
    // Floor first: after a beat Lifty names the thing to touch.
    await time.advance(1000);
    expect(s.view().lifty.line).toBe(LINES.exploreHint('traction motor wheel'));
    s.director.inspect('motor');
    expect(s.view().reaction).toMatchObject({ floor: 6, spotId: 'motor' });
    const first = s.view().reaction!.seq;
    expect(s.view().lifty.line).toBe(exploreSpots(LANDINGS, 6)[0]!.line);
    expect(s.view().discoveries).toEqual(['eq.discovery.floor-6']);
    expect(reactionSounds() - soundsBefore).toBe(1);
    // A tap during the reaction does not restart it (no flicker from rapid taps).
    s.director.inspect('motor');
    expect(s.view().reaction!.seq).toBe(first);
    // Afterwards it reacts again, silently, and is not discovered again.
    await time.advance(REACTION_MS.normal);
    const line = s.view().lifty.seq;
    s.director.inspect('motor');
    expect(s.view().reaction!.seq).toBe(first + 1);
    expect(s.view().lifty.seq).toBe(line);
    expect(s.view().discoveries).toEqual(['eq.discovery.floor-6']);
    await s.director.idle();
    expect(await discoveryRows(s)).toEqual([{ memory_key: 'eq.discovery.floor-6' }]);
    expect(await learningSnapshot(s)).toEqual(before);
    expect(s.log.entries().filter((e) => e.kind === 'inspect').map((e) => e.data.first)).toEqual([true, false]);
  });

  it('nothing reacts outside free ride, behind closed doors, on a floor without a spot, or with an unknown spot', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    s.director.inspect('motor'); // during a job
    expect(s.view().reaction).toBeNull();
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen');
    const seq = s.view().reaction?.seq ?? 0;
    await rideTo(s, 8);
    s.director.inspect('motor'); // the motor is on Floor 6, not here
    s.director.inspect('nothing');
    expect(s.view().reaction).toBeNull();
    await rideTo(s, 6);
    s.director.pressDoorClose();
    await time.runUntil(() => s.view().elevator.phase === 'idleClosed');
    s.director.inspect('motor'); // doors shut
    expect(s.view().reaction?.seq ?? 0).toBeLessThanOrEqual(seq);
    expect(s.view().discoveries).toEqual([]);
  });

  it('discoveries persist across a restart, belong to one learner, and arrivals there stay quiet', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time);
    await toFreeRide(s);
    await rideTo(s, 5);
    s.director.inspect('fan');
    await rideTo(s, 18);
    s.director.inspect('telescope');
    s = await restart(s, tmp.file, time);
    expect(s.view()).toMatchObject({ stage: 'freeRide', discoveries: ['eq.discovery.floor-18', 'eq.discovery.floor-5'] });
    // A found floor: arriving there, Lifty has nothing new to say.
    await rideTo(s, 5);
    await time.advance(1000);
    expect(s.view().lifty.line).toBe('');
    s.director.inspect('fan');
    await s.director.idle();
    expect((await discoveryRows(s)).map((r) => r.memory_key)).toEqual(['eq.discovery.floor-5', 'eq.discovery.floor-18']);

    // Another learner on the same device starts with nothing found.
    await s.rt.createLearner({ id: 'learner-b', themePack: 'elevator-quest' });
    const other = await restart(s, tmp.file, time, 'learner-b');
    expect(other.view().discoveries).toEqual([]);
    expect(await memoryRows(other, 'learner-b')).toEqual([]);
    other.director.dispose();
    await other.db.close();
  });

  it('a motor found when the Machine Room was on Floor 7 stays found on Floor 6: no second first-time line, nothing rewritten (D130)', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time);
    await toFreeRide(s);
    // An older build stored the discovery under the Machine Room's old floor.
    expect(await s.rt.remember(LEARNER, 'eq.discovery.floor-7')).toBe(true);
    s = await restart(s, tmp.file, time);
    expect(s.view().discoveries).toEqual(['eq.discovery.floor-7']);
    const before = await learningSnapshot(s);
    await rideTo(s, 6);
    await time.advance(1000);
    expect(s.view().lifty.line).toBe(''); // already found: no hint
    s.director.inspect('motor');
    expect(s.view().reaction).toMatchObject({ floor: 6, spotId: 'motor' });
    expect(s.log.entries().filter((e) => e.kind === 'inspect').map((e) => e.data.first)).toEqual([false]);
    await s.director.idle();
    // Append-only memory: the old row stays as it was, and no new key is written for the same place.
    expect(await discoveryRows(s)).toEqual([{ memory_key: 'eq.discovery.floor-7' }]);
    expect(engineerLog(LANDINGS, s.view().discoveries, { restored: () => true }).find((r) => r.floor === 6)!.inspected).toBe(true);
    expect(await learningSnapshot(s)).toEqual(before);
  });

  it('the Engineer Log opens only in free ride once the clipboard is earned, shows found facts only, and closes', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    s.director.openLog();
    expect(s.view().logOpen).toBe(false); // no clipboard yet, and a job is on
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await time.runUntil(() => s.view().stage === 'freeRide');
    const restored = { restored: (f: number) => f === FLOOR15.repairFloor && s.view().floor15Restored };
    let rows = engineerLog(LANDINGS, s.view().discoveries, restored);
    expect(rows.map((r) => r.floor)).toEqual(explorableFloors(LANDINGS));
    expect(rows.every((r) => !r.inspected && r.fact === null)).toBe(true);
    await rideTo(s, 17);
    s.director.inspect('plans');
    rows = engineerLog(LANDINGS, s.view().discoveries, restored);
    expect(rows.filter((r) => r.inspected).map((r) => r.floor)).toEqual([17]);
    expect(rows.find((r) => r.floor === 17)!.fact).toBe(exploreSpots(LANDINGS, 17)[0]!.fact);
    expect(rows.find((r) => r.floor === 15)!.system).toBe('powered');
    await time.advance(REACTION_MS.normal);
    const seq = s.view().reaction!.seq;
    s.director.openLog();
    expect(s.view().logOpen).toBe(true);
    s.director.inspect('plans'); // the log is in front: the landing is not touchable through it
    expect(s.view().reaction!.seq).toBe(seq);
    s.director.closeLog();
    expect(s.view().logOpen).toBe(false);
  });
});

describe('the DOOR CLOSE tip', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('comes once per learner, after a few rides, while the doors wait; DOOR CLOSE still works the same', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time);
    const said: { stage: string; phase: string; waiting: boolean }[] = [];
    let lastSeq = -1;
    s.director.subscribe((v) => {
      if (v.lifty.line !== LINES.doorCloseTip || v.lifty.seq === lastSeq) return;
      lastSeq = v.lifty.seq;
      said.push({ stage: v.stage, phase: v.elevator.phase, waiting: v.elevator.destination !== null });
    });
    await toFreeRide(s);
    // Said once, during a hall-call ride while the doors waited (never during a job).
    expect(said).toEqual([{ stage: 'reposition', phase: 'idleOpen', waiting: true }]);
    expect(s.log.entries().filter((e) => e.kind === 'tip')).toHaveLength(1);
    expect(s.log.entries().filter((e) => e.kind === 'hallCall.taken').length).toBeGreaterThanOrEqual(1);
    // Free rides do not bring it back, and DOOR CLOSE behaves as it always has.
    s.director.pressFloor(4);
    expect(s.view().lifty.line).not.toBe(LINES.doorCloseTip);
    s.director.pressDoorClose();
    expect(s.view().elevator.phase).toBe('doorsClosing');
    await s.director.idle();
    expect((await memoryRows(s)).map((r) => r.memory_key)).toEqual(['eq.tip.door-close']);
    expect(await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE payload LIKE '%door-close%'")).toBe(0);
    s = await restart(s, tmp.file, time);
    await rideTo(s, 2);
    s.director.pressFloor(9);
    expect(s.log.entries().filter((e) => e.kind === 'tip')).toHaveLength(0);
  });

  it('never appears for a learner who already closes the doors to go sooner', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoHallCalls: false });
    s.director.pressDoorOpen();
    await time.runUntil(() => s.view().stage === 'call');
    s.director.pressFloor(s.view().hallCall!);
    s.director.pressDoorClose();
    await s.director.idle();
    expect((await memoryRows(s)).map((r) => r.memory_key)).toEqual(['eq.tip.door-close']);
    expect(s.log.entries().filter((e) => e.kind === 'tip')).toHaveLength(0);
  });
});

describe('hall calls come before the job', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it("the job's help, beacon and shaft map appear with the job, not during its call", async () => {
    const s = await openSession(tmp.file, virtualTime(), { autoHallCalls: false });
    s.director.pressDoorOpen();
    await s.time.runUntil(() => s.view().stage === 'call');
    expect(s.view()).toMatchObject({ help: null, beacon: null, shaftMode: 'status', highlights: [] });
    s.director.pressFloor(s.view().hallCall!);
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    // Help exists for this job's policy; it shows now that the job is on screen.
    expect(s.view().help).not.toBeNull();
  });
});
