// Landing interactions (M8): every thing a learner can touch on a landing reacts in the world and
// is never learning evidence. The golf putt, the toolbox, rapid taps, Reduced Motion, the reading
// card, quiet touches between jobs, and the hook a read-and-touch job uses to make objects answer.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES, THEME_PACK_ID } from '../content/floor15';
import { LANDINGS, OPEN_MS, explorableFloors, exploreSpots, landingObjects, reactionMs } from '../content/landings';
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { activeTestLearner } from '../../../runtime/devSeed';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { CONTENT, LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { jumpTo, type DevContext } from '../devtools/floor15Tools';
import { SCENARIOS } from '../devtools/scenarios';
import { createFloor15Director, type DirectorView } from './director';
import { createPlaytestLog } from './playtestLog';
import { QUIET_STAGES, spotKey, touchMode, touchTargets, type TouchState } from './landingTouch';

/** Everything learning or progression could have written. Touching the landing must leave all of it alone. */
async function learningSnapshot(s: Session) {
  return {
    events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
    attempts: await count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'"),
    progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
    state: canonicalJson(await s.rt.learnerState(LEARNER)),
  };
}
const memoryKeys = async (s: Session) => (await s.db.all<{ memory_key: string }>('SELECT memory_key FROM world_memory WHERE learner_id = ? ORDER BY seq', [LEARNER])).map((r) => r.memory_key);

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

/** A free-ride session at a floor (a fresh learner who finished Floor 15). */
async function freeRideAt(file: string, floor: number, motion: 'normal' | 'reduced' = 'normal') {
  const s = await openSession(file, virtualTime(), { motion });
  await toFreeRide(s);
  await rideTo(s, floor);
  return s;
}

const base: TouchState = {
  stage: 'freeRide',
  success: null,
  elevator: { floor: 20, phase: 'idleOpen' } as DirectorView['elevator'],
  logOpen: false,
  card: null,
  floor15Restored: true,
  discoveries: [],
  answerTargets: null,
  opened: [],
  power: 'on',
  reading: null,
};
const at = (patch: Partial<TouchState>): TouchState => ({ ...base, ...patch });
const floor = (n: number) => ({ floor: n, phase: 'idleOpen' }) as DirectorView['elevator'];

describe('when the landing can be touched (landingTouch.ts)', () => {
  it('explore in free ride; quiet whenever the mission is on and its answer is elsewhere (D161)', () => {
    expect(touchMode(base)).toBe('explore');
    // A hall call, any math job (panel, shaft map, trip meter, cargo), a miss's pause, the whole success.
    for (const stage of QUIET_STAGES) expect({ stage, mode: touchMode(at({ stage })) }).toEqual({ stage, mode: 'quiet' });
    expect([...QUIET_STAGES].sort()).toEqual(['call', 'cargo', 'pause', 'success', 'task']);
    for (const success of ['arrival', 'animating', 'review'] as const) expect(touchMode(at({ stage: 'success', success }))).toBe('quiet');
    // The screen belongs to something else: the intro, a correction's board, the finale, a ride, loading, errors.
    for (const stage of ['riding', 'rescue', 'intro', 'finale', 'complete', 'reposition', 'loading', 'error'] as const) expect({ stage, mode: touchMode(at({ stage })) }).toEqual({ stage, mode: null });
  });

  it('nothing reacts with the doors moving or shut, behind the log or a card, under an open note, or at the dormant core', () => {
    for (const stage of ['freeRide', 'task', 'call'] as const) {
      for (const phase of ['idleClosed', 'doorsOpening', 'doorsClosing', 'traveling'] as const) expect(touchMode(at({ stage, elevator: { floor: 20, phase } as DirectorView['elevator'] }))).toBeNull();
      expect(touchMode(at({ stage, logOpen: true }))).toBeNull();
      expect(touchMode(at({ stage, card: { floor: 20, spotId: 'x', title: 't', lines: [], close: 'c' } }))).toBeNull();
      expect(touchMode(at({ stage, power: 'off' }))).toBeNull();
      // The dormant Floor 15: its core does nothing until the power is back.
      expect(touchMode(at({ stage, elevator: floor(15), floor15Restored: false }))).toBeNull();
    }
    // A reading job (ride or cards): its note open over the landing, nothing reacts; folded, quiet.
    expect(touchMode(at({ stage: 'task', reading: { open: true } }))).toBeNull();
    expect(touchMode(at({ stage: 'task', reading: { open: false } }))).toBe('quiet');
    expect(touchTargets(at({ stage: 'task', reading: { open: true } }))).toEqual([]);
  });

  it('a job that answers by touch makes its objects the targets, on its landing only, whatever the stage', () => {
    const answering = at({ stage: 'task', answerTargets: { floor: 20, objects: ['hole', 'windmill'] } });
    expect(touchMode(answering)).toBe('answer');
    // The screen offers them once the note is folded (ui/readingSurface.ts); the director decides the window.
    expect(touchMode({ ...answering, reading: { open: true } })).toBe('answer');
    expect(touchTargets(answering).map((t) => [t.object.id, t.mode, t.spot, t.label]).sort()).toEqual([
      ['hole', 'answer', null, 'hole'],
      ['windmill', 'answer', null, 'windmill'],
    ]);
    // Never the ball's putt meanwhile on the job's own landing (a touch there is never an answer).
    expect(touchTargets(answering).some((t) => t.object.id === 'ball')).toBe(false);
    // On another landing the things only react: exploring stops while the job is on.
    expect(touchMode(at({ answerTargets: { floor: 7, objects: ['spring'] } }))).toBe('quiet');
    expect(touchMode(at({ answerTargets: { floor: 7, objects: ['spring'] }, reading: { open: true } }))).toBeNull();
  });

  it('a job waiting at the rooftop: the ball can be putted quietly, labelled as always', () => {
    const job = at({ stage: 'task', elevator: floor(20) });
    expect(touchTargets(job)).toEqual([expect.objectContaining({ mode: 'quiet', spot: expect.objectContaining({ id: 'ball' }), label: 'Putt the golf ball' })]);
    // Every explorable landing offers all its spots quietly during a job (the dormant core aside).
    for (const f of explorableFloors(LANDINGS)) {
      const targets = touchTargets(at({ stage: 'task', elevator: floor(f), floor15Restored: true }));
      expect({ f, spots: targets.map((t) => [t.spot?.id, t.mode]).sort() }).toEqual({ f, spots: exploreSpots(LANDINGS, f).map((x) => [x.id, 'quiet']).sort() });
    }
  });

  it('lists each spot with its state and words, smaller things in front', () => {
    const two = touchTargets(at({ elevator: { floor: 17, phase: 'idleOpen' } as DirectorView['elevator'], discoveries: ['eq.discovery.floor-17'] }));
    expect(two.map((t) => t.spot!.id).sort()).toEqual(['book', 'plans']);
    expect(two.find((t) => t.spot!.id === 'plans')).toMatchObject({ inspected: true, label: 'plan cabinet, inspected. Touch it again to watch it work.' });
    expect(two.find((t) => t.spot!.id === 'book')).toMatchObject({ inspected: false, label: 'Read the tower book' });
    // Larger boxes first: the smaller one is drawn last, on top.
    const areas = two.map((t) => t.object.box!.w * t.object.box!.h);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
    const open = touchTargets(at({ elevator: { floor: 2, phase: 'idleOpen' } as DirectorView['elevator'], opened: [spotKey(2, 'toolbox')] }));
    expect(open[0]).toMatchObject({ open: true, label: 'Close the toolbox' });
  });
});

describe('landing interactions in the game', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('touching every thing on every landing is world play only: no attempt, no mastery, no progress; memory holds discoveries alone', async () => {
    const s = await openSession(tmp.file, virtualTime());
    await toFreeRide(s);
    const before = await learningSnapshot(s);
    const memoryBefore = await memoryKeys(s);
    const answersBefore = s.log.entries().filter((e) => e.kind === 'answer').length;
    for (const floor of explorableFloors(LANDINGS)) {
      await rideTo(s, floor);
      for (const o of landingObjects(LANDINGS, floor)) {
        s.director.touchObject(o.id);
        await s.time.advance(Math.max(...exploreSpots(LANDINGS, floor).map((x) => reactionMs(x.reaction, 'normal'))) + 50);
        s.director.closeCard();
      }
      for (const spot of exploreSpots(LANDINGS, floor)) {
        s.director.inspect(spot.id);
        await s.time.advance(reactionMs(spot.reaction, 'normal') + 50);
        s.director.closeCard();
      }
    }
    await s.director.idle();
    expect(await learningSnapshot(s)).toEqual(before);
    const added = (await memoryKeys(s)).filter((k) => !memoryBefore.includes(k));
    // One row per discovery, each once (append-only, INSERT OR IGNORE), and nothing but discoveries.
    const keys = explorableFloors(LANDINGS).flatMap((f) => exploreSpots(LANDINGS, f).map((x) => x.discovery));
    expect([...added].sort()).toEqual([...keys].sort());
    expect(s.view().discoveries.sort()).toEqual([...keys].sort());
    expect(s.log.entries().filter((e) => e.kind === 'answer')).toHaveLength(answersBefore);
  }, 60_000);

  it('golf: the ball putts to the hole, the putt ignores taps until the ball is back, then putts again', async () => {
    const s = await freeRideAt(tmp.file, 20);
    const t0 = s.time.now();
    s.director.touchObject('ball');
    expect(s.view().reaction).toMatchObject({ floor: 20, spotId: 'ball' });
    const first = s.view().reaction!.seq;
    expect(s.view().discoveries).toContain('eq.discovery.floor-20');
    expect(s.view().lifty.line).toBe(exploreSpots(LANDINGS, 20)[0]!.line);
    // The putt's own sound (landings.json `sound`), once per putt.
    const slot = exploreSpots(LANDINGS, 20)[0]!.sound ?? 'landingReaction';
    expect(slot).toBe('golfPutt');
    const sounds = () => s.audio.filter((c) => c.action === 'play' && c.slot === slot).length;
    const heard = sounds();
    // Rapid taps during the roll, the drop and the calm pause do nothing: no restart, no extra sound.
    for (const ms of [50, 400, 1200, 2500, reactionMs('putt', 'normal') - 100]) {
      await s.time.advance(t0 + ms - s.time.now());
      s.director.touchObject('ball');
      expect(s.view().reaction!.seq).toBe(first);
    }
    expect(sounds()).toBe(heard);
    await s.time.advance(t0 + reactionMs('putt', 'normal') - s.time.now());
    s.director.touchObject('ball');
    expect(s.view().reaction!.seq).toBe(first + 1);
    expect(sounds()).toBe(heard + 1);
    // The second putt is not a second discovery, and nothing is ever counted or scored.
    expect(s.view().discoveries.filter((k) => k === 'eq.discovery.floor-20')).toHaveLength(1);
    expect(s.log.entries().filter((e) => e.kind === 'inspect').map((e) => e.data.first)).toEqual([true, false]);
  });

  it('golf under Reduced Motion: the same putt, a shorter wait before the ball is back', async () => {
    const s = await freeRideAt(tmp.file, 20, 'reduced');
    s.director.touchObject('ball');
    const first = s.view().reaction!.seq;
    await s.time.advance(reactionMs('putt', 'reduced') - 50);
    s.director.touchObject('ball');
    expect(s.view().reaction!.seq).toBe(first);
    await s.time.advance(100);
    s.director.touchObject('ball');
    expect(s.view().reaction!.seq).toBe(first + 1);
    expect(reactionMs('putt', 'reduced')).toBeLessThan(reactionMs('putt', 'normal'));
  });

  it('the toolbox opens on a touch and shuts on the next; taps while the lid moves are ignored; it shuts when the car leaves', async () => {
    const s = await freeRideAt(tmp.file, 2);
    const key = spotKey(2, 'toolbox');
    s.director.touchObject('toolbox');
    expect(s.view().opened).toEqual([key]);
    expect(s.view().lifty.line).toBe(exploreSpots(LANDINGS, 2)[0]!.line); // once, the first time
    const line = s.view().lifty.seq;
    s.director.touchObject('toolbox'); // the lid is still moving
    expect(s.view().opened).toEqual([key]);
    await s.time.advance(OPEN_MS.normal);
    s.director.touchObject('toolbox');
    expect(s.view().opened).toEqual([]);
    expect(s.view().lifty.seq).toBe(line); // no second line
    await s.time.advance(OPEN_MS.normal);
    s.director.touchObject('toolbox');
    expect(s.view().opened).toEqual([key]);
    expect(touchTargets(s.view()).find((t) => t.object.id === 'toolbox')).toMatchObject({ open: true, label: 'Close the toolbox' });
    await rideTo(s, 3);
    expect(s.view().opened).toEqual([]);
    expect(s.view().reaction).toBeNull();
  });

  it('the Archive book opens a reading card: no touches through it; CLOSE, a ride or the log put it away', async () => {
    const s = await freeRideAt(tmp.file, 17);
    s.director.touchObject('book');
    expect(s.view().card).toMatchObject({ floor: 17, spotId: 'book', title: 'The Tower Book', close: 'Close the book' });
    expect(s.view().card!.lines.length).toBeGreaterThanOrEqual(2);
    expect(touchTargets(s.view())).toEqual([]);
    const seq = s.view().reaction!.seq;
    s.director.touchObject('drawers');
    expect(s.view().reaction!.seq).toBe(seq);
    s.director.closeCard();
    expect(s.view().card).toBeNull();
    await s.time.advance(1500);
    s.director.touchObject('book');
    expect(s.view().card).not.toBeNull();
    // The panel still works with the card up: a ride puts it away.
    await rideTo(s, 16);
    expect(s.view().card).toBeNull();
    await rideTo(s, 17);
    await s.time.advance(1500);
    s.director.touchObject('book');
    s.director.openLog();
    expect(s.view()).toMatchObject({ logOpen: true, card: null });
  });

  it('between jobs and during a job a touch only reacts: no discovery, no Lifty line, no answer, no evidence', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoHallCalls: false, autoNextJob: false });
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().stage === 'call' && s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(s.view().elevator.floor).toBe(1); // the lobby, where the gear is
    const before = await learningSnapshot(s);
    const line = s.view().lifty;
    s.director.touchObject('gear');
    expect(s.view().reaction).toMatchObject({ floor: 1, spotId: 'gear' });
    expect(s.view().lifty).toEqual(line);
    expect(s.view().discoveries).toEqual([]);
    expect(s.view().stage).toBe('call');
    expect(s.view().hallCall).not.toBeNull();
    // The call is still the learner's to take.
    s.director.pressFloor(s.view().hallCall!);
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    // A math job waits (its answer is a ride elsewhere): the landing's things react quietly.
    const jobFloor = s.view().elevator.floor;
    const jobLine = s.view().lifty;
    const window = s.view().task;
    const inspects = () => s.log.entries().filter((e) => e.kind === 'inspect').length;
    const touched = inspects();
    for (const o of landingObjects(LANDINGS, jobFloor)) s.director.touchObject(o.id);
    expect(inspects()).toBe(touched + exploreSpots(LANDINGS, jobFloor).length);
    expect(s.view().lifty).toEqual(jobLine);
    expect(s.view().stage).toBe('task');
    expect(s.view().task).toEqual(window);
    expect(s.view().discoveries).toEqual([]);
    await time.advance(2000);
    // The success waiting on NEXT JOB: quiet again (only where the landing has something).
    s.director.pressFloor(solve(s));
    await time.runUntil(() => s.view().success === 'review');
    expect(touchTargets(s.view()).every((t) => t.mode === 'quiet')).toBe(true);
    await s.director.idle();
    const after = await learningSnapshot(s);
    // The job's own answer wrote its record; the touches added nothing to it.
    expect(after.unlocks).toBe(before.unlocks);
    expect((await memoryKeys(s)).filter((k) => k.startsWith('eq.discovery.'))).toEqual([]);
    expect(s.log.entries().filter((e) => e.kind === 'inspect').every((e) => e.data.quiet === true)).toBe(true);
  });

  it('a read-and-touch job can make objects its answer targets: touches go to it, exploring stops, and it ends cleanly', async () => {
    const s = await freeRideAt(tmp.file, 20);
    const touched: string[] = [];
    s.director.setAnswerTargets({ floor: 20, objects: ['hole', 'windmill'] }, (id) => touched.push(id));
    expect(s.view().answerTargets).toEqual({ floor: 20, objects: ['hole', 'windmill'] });
    s.director.touchObject('hole');
    s.director.touchObject('ball'); // not a target: the putt does not play during the job
    s.director.inspect('ball');
    expect(touched).toEqual(['hole']);
    expect(s.view().reaction).toBeNull();
    expect(s.view().discoveries).not.toContain('eq.discovery.floor-20');
    // Another landing's touches never reach the job.
    s.director.setAnswerTargets({ floor: 7, objects: ['spring'] }, (id) => touched.push(id));
    s.director.touchObject('hole');
    expect(touched).toEqual(['hole']);
    s.director.setAnswerTargets(null);
    s.director.touchObject('ball');
    expect(s.view().reaction).toMatchObject({ spotId: 'ball' });
    expect(touched).toEqual(['hole']);
  });

  it('a ride reading job with its note folded: the landing\'s things react quietly and nothing is recorded or answered', async () => {
    const time = virtualTime();
    const db = openNodeDatabase(tmp.file);
    const rt = await openGameRuntime(db, CONTENT, time);
    const ctx: DevContext = { db, runtime: rt, content: CONTENT, now: () => time.now() };
    const learner = await activeTestLearner(rt, 'learner-test-a', THEME_PACK_ID);
    const instanceId = await jumpTo(ctx, learner, 'read-ride');
    const log = createPlaytestLog();
    const director = createFloor15Director({ runtime: rt, learnerId: learner, instanceId, clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', log });
    await director.start();
    const v = () => director.getView();
    expect(await time.runUntil(() => v().stage === 'task' && v().reading?.accepting === true && v().elevator.phase === 'idleOpen')).toBe(true);
    expect(v().reading).toMatchObject({ mode: 'ride', open: true });
    const floor = v().elevator.floor;
    const spots = exploreSpots(LANDINGS, floor);
    expect(spots.length).toBeGreaterThan(0); // the jump's job waits where there is something to touch
    // The note open over the landing: nothing reacts.
    for (const x of spots) director.touchObject(x.target);
    expect(v().reaction).toBeNull();
    // Folded: the landing's things react quietly (D161), and that is all.
    director.closeNote();
    expect(v().reading!.open).toBe(false);
    const events = await count(db, 'SELECT COUNT(*) AS n FROM learning_events');
    const memory = await count(db, 'SELECT COUNT(*) AS n FROM world_memory');
    const line = v().lifty;
    expect(touchTargets(v()).map((t) => t.mode)).toEqual(spots.map(() => 'quiet'));
    for (const x of spots) {
      director.touchObject(x.target);
      expect(v().reaction).toMatchObject({ floor, spotId: x.id });
    }
    await time.advance(4000);
    await director.idle();
    expect(v()).toMatchObject({ stage: 'task', discoveries: [], reading: { mode: 'ride', accepting: true } });
    expect(v().lifty).toEqual(line);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(events);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM world_memory')).toBe(memory);
    expect(log.entries().filter((e) => e.kind === 'answer')).toHaveLength(0);
    expect(log.entries().filter((e) => e.kind === 'inspect').every((e) => e.data.quiet === true)).toBe(true);
    director.dispose();
    await db.close();
  });

  it('touches during another spot\'s reaction still play their own (each thing has its own running reaction)', async () => {
    const s = await freeRideAt(tmp.file, 17);
    s.director.touchObject('drawers');
    const a = s.view().reaction!;
    s.director.touchObject('drawers');
    expect(s.view().reaction).toEqual(a);
    s.director.touchObject('book');
    expect(s.view().reaction).toMatchObject({ spotId: 'book', seq: a.seq + 1 });
  });

  it('the hint on arrival names the first thing still to find, and goes quiet when the floor is found', async () => {
    const s = await freeRideAt(tmp.file, 20);
    await s.time.advance(1000);
    expect(s.view().lifty.line).toBe(LINES.exploreHint('golf ball'));
  });
});

describe('developer previews', () => {
  it('every spot has a preview, normal and under Reduced Motion, plus the golf, toolbox and card states; ids are unique', () => {
    const ids = SCENARIOS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const floor of explorableFloors(LANDINGS)) for (const spot of exploreSpots(LANDINGS, floor)) expect(ids).toEqual(expect.arrayContaining([`touch-${floor}-${spot.id}`, `touch-${floor}-${spot.id}-reduced`]));
    expect(ids).toEqual(expect.arrayContaining(['golf-rolling', 'golf-sunk', 'golf-reset', 'golf-reduced', 'toolbox-open', 'toolbox-shut', 'archive-card', 'touch-between-jobs']));
  });
});
