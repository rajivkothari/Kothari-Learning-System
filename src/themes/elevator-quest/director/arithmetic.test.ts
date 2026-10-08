// The wider arithmetic in Floor 15 (D148): two orders in the cargo bay, a two-part trip, where did
// the crew get on, the trip meter, and the express. Headless on virtual time, through the real
// runtime. The director never computes an answer: every right value here comes from solve().
import type { RescueView } from '../../../engine';
import { LINES } from '../content/floor15';
import { CLASSIC_CONTENT, answerCorrectly, answerWith, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { rescueBoard } from './director';
import { jobOf } from './jobs';
import { buildReport } from './playtestLog';

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

/** Play correctly until the job of `stepId` is waiting. */
async function reach(s: Session, stepId: string) {
  for (let guard = 0; guard < 20 && s.view().task?.stepId !== stepId; guard++) await answerCorrectly(s);
  expect(s.view().task?.stepId).toBe(stepId);
  expect(await s.time.runUntil(() => settled(s)())).toBe(true);
}

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;

/** Answer once (wrong or right) and wait until the job waits again, a correction waits, or it moves on. */
async function answerOnce(s: Session, value: number) {
  const before = answers(s);
  answerWith(s, value);
  expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving && ((s.view().rescueReady && s.view().elevator.phase === 'idleOpen') || (settled(s)() && (s.view().stage === 'task' || s.view().stage === 'cargo' || s.view().stage === 'success'))))).toBe(true);
}

const attemptsFor = async (s: Session, stepId: string) =>
  (await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq")).map((r) => JSON.parse(r.payload) as Record<string, unknown>).filter((a) => String(a.activityInstanceId).endsWith(`:${stepId}`));

/** LET'S COUNT, then count the board cell by cell as it asks, and say where it stops (or how many). */
async function workCorrection(s: Session): Promise<string[]> {
  if (s.view().rescueReady) s.director.beginRescue();
  expect(await s.time.runUntil(() => s.view().stage === 'rescue')).toBe(true);
  const said: string[] = [s.view().lifty.line];
  for (let guard = 0; guard < 40 && s.view().rescue?.phase === 'counting'; guard++) {
    const r = s.view().rescue!;
    s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * (r.counted.length + 1));
    said.push(s.view().lifty.line);
  }
  const r = s.view().rescue!;
  expect(r.phase).toBe('ask');
  const sign = r.direction === 'down' ? -1 : 1;
  s.director.rescueTap(r.asks === 'cell' ? r.origin + sign * r.stride * r.steps : r.kind === 'fill' ? r.countFrom + r.steps : r.steps);
  expect(await s.time.runUntil(() => s.view().rescue?.phase === 'right')).toBe(true);
  said.push(s.view().lifty.line);
  expect(await s.time.runUntil(() => (s.view().stage === 'task' || s.view().stage === 'cargo') && settled(s)())).toBe(true);
  said.push(s.view().lifty.line);
  return said;
}

const signatureOf = (s: Session) => s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature;

describe('Floor 15: the wider arithmetic, with corrections (D148, D149)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let s: Session;
  beforeEach(async () => {
    tmp = tempDir();
    // Pools pinned to the D148 jobs (one of each kind); the M8 jobs have their own tests (numberSense.test.ts).
    s = await openSession(tmp.file, virtualTime(), { autoNextJob: true, content: CLASSIC_CONTENT });
    await wake(s);
  });
  afterEach(async () => {
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('two orders: one order only is named, the load meter shows the load, the correction counts on, and a fresh load follows', async () => {
    await reach(s, 'two-groups');
    const cargo = s.view().task!.cargo!;
    const [a, b] = cargo.orders!;
    const first = signatureOf(s);
    expect(s.view().elevator.panelEnabled).toBe(false);
    await answerOnce(s, Math.max(a, b));
    const v = s.view();
    expect(v).toMatchObject({ stage: 'pause', rescueReady: true, shaftMode: 'numberLine', task: { cargo: { status: 'mismatch' } } });
    expect(v.lifty.line).toContain(LINES.ordersWrong({ orderA: a, orderB: b }));
    expect(v.lifty.line).toContain("That's one order.");
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'overloadTone')).toBe(false);
    s.director.beginRescue();
    // The correction counts on from the first order, on the learner's own orders.
    expect(s.view().rescue).toMatchObject({ corrective: true, example: 'orders', countFrom: a, aboard: a, steps: b });
    const said = await workCorrection(s);
    expect(said.at(-2)).toBe(`${a + b} crates: ${a}, then ${b} more.`);
    expect(said.at(-1)).toMatch(/^New job\. Two orders: /);
    expect(signatureOf(s)).not.toBe(first);
    answerWith(s, solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success' || s.view().task?.stepId !== 'two-groups')).toBe(true);
    const replay = s.log.entries().filter((e) => e.kind === 'replay').at(-1)!;
    expect(replay.data).toMatchObject({ strategy: 'combine', evidence: 'suggested' });
    expect(s.log.entries().filter((e) => e.kind === 'correction.followUp').at(-1)!.data).toMatchObject({ stepId: 'two-groups', correct: true, helpUsed: false });
  });

  it('a two-part trip can be ridden in two legs: the first part is a step, never an answer, and the trip counts as solved alone', async () => {
    await reach(s, 'two-moves');
    const job = s.view().task!.job!;
    expect(s.view().elevator.floor).toBe(job.anchor);
    const middle = Number(job.vars.start) + (job.vars.dir === 'up' ? 1 : -1) * Number(job.vars.change);
    const right = solve(s);
    s.director.pressFloor(middle);
    expect(await s.time.runUntil(() => settled(s)() && s.view().elevator.floor === middle && s.view().stage === 'task')).toBe(true);
    const v = s.view();
    expect(v).toMatchObject({ stage: 'task', rescueReady: false, mismatch: null, task: { stepId: 'two-moves', wrongTries: 0 } });
    expect(v.lifty.line).toBe(`First part done: Floor ${middle}. Now ${job.vars.changeTwo} floors ${job.vars.dirTwo}.`);
    expect(v.lifty.line).not.toContain(`Floor ${right}`);
    expect(await attemptsFor(s, 'two-moves')).toEqual([]); // the leg is not an answer
    await answerCorrectly(s);
    expect(await attemptsFor(s, 'two-moves')).toEqual([expect.objectContaining({ outcome: 'correct', wrongTries: 0, assistance: 'independent' })]);
    expect(s.log.entries().filter((e) => e.kind === 'answer.leg')).toHaveLength(1);
    expect(buildReport(s.log, { device: {}, skillsBefore: null, skillsNow: null, progression: [], unlocks: [] })).toContain('Two-part trips ridden in two legs: 1');
  });

  it('a two-part trip: the leg happens once; choosing the first part\'s floor again is the answer, and a real miss is still corrected', async () => {
    await reach(s, 'two-moves');
    const job = s.view().task!.job!;
    const middle = Number(job.vars.start) + (job.vars.dir === 'up' ? 1 : -1) * Number(job.vars.change);
    s.director.pressFloor(middle);
    expect(await s.time.runUntil(() => settled(s)() && s.view().elevator.floor === middle && s.view().stage === 'task')).toBe(true);
    await answerOnce(s, middle); // already here: this time it is the answer
    expect(s.view()).toMatchObject({ stage: 'pause', rescueReady: true });
    expect(s.view().lifty.line).toContain(`Then it goes ${job.vars.changeTwo} floors ${job.vars.dirTwo}`);
  });

  it('where did they get on: the clues count back from where they got off; riding on instead of back is named and drawn', async () => {
    await reach(s, 'start-unknown');
    const job = s.view().task!.job!;
    expect(s.view().elevator.floor).toBe(job.vars.end);
    // Help can be asked for before any miss: the counting clue counts back from here, and stops short.
    for (const label of ['CLUE', 'SHAFT MAP', 'HOW TO COUNT']) {
      expect(s.view().help?.label).toBe(label);
      s.director.requestHelp();
      await s.time.runUntil(() => !s.view().saving);
    }
    const back = job.vars.rode === 'up' ? 'down' : 'up';
    expect(s.view().countAlong).toMatchObject({ from: job.vars.end, direction: back });
    expect(s.view().countAlong!.steps).toBeLessThan(Number(job.vars.change));
    expect(s.view().lifty.line).toContain(`Put your finger on Floor ${job.vars.end}. The next floor ${back} is 1.`);
    // Ride the same way again: the crew rode up to get here, so going further up is the wrong idea.
    const change = Number(job.vars.change);
    const again = Number(job.vars.end) + (job.vars.rode === 'up' ? 1 : -1) * change;
    if (again >= 1 && again <= 20) {
      await answerOnce(s, again);
      expect(s.view().lifty.line).toContain(`They rode ${job.vars.rode} to get here`);
      // The shaft map shows where a ride from that floor would have ended: not where they got off.
      const ends = Math.max(1, Math.min(20, again + (job.vars.rode === 'up' ? change : -change)));
      expect(s.view().mismatch).toEqual({ from: again, to: ends });
    }
  });

  it('the trip meter: floor buttons stay locked, GO rides the count; a miss shows where it went and the correction comes', async () => {
    await reach(s, 'compare-distance');
    const v = s.view();
    const meter = v.task!.meter!;
    const job = v.task!.job!;
    expect(v.task!.kind).toBe('meter');
    expect(v.elevator.floor).toBe(meter.from);
    expect(v.elevator.panelEnabled).toBe(false);
    expect(v.beacon).toBe(job.vars.to);
    // A floor press is not an answer here.
    const pressed = answers(s);
    s.director.pressFloor(Number(job.vars.to));
    await s.time.advance(3000);
    expect(answers(s)).toBe(pressed);
    expect(s.view().elevator.floor).toBe(meter.from);
    // The meter stays inside the building.
    for (let i = 0; i < 40; i++) s.director.meterStep(-1);
    expect(s.view().task!.meter!.value).toBe(0);
    for (let i = 0; i < 40; i++) s.director.meterStep(1);
    expect(s.view().task!.meter!.value).toBe(meter.max);
    // Counting both ends: one too many. The ride really goes that far, and the shaft map shows it.
    const right = solve(s);
    await answerOnce(s, right + 1);
    const sign = meter.direction === 'up' ? 1 : -1;
    expect(s.view().elevator.floor).toBe(meter.from + sign * (right + 1));
    expect(s.view().mismatch).toEqual({ from: meter.from, to: meter.from + sign * (right + 1) });
    expect(s.view().lifty.line).toContain('One floor too many.');
    expect(s.view().rescueReady).toBe(true);
    // The correction: count the floors on the way, say how many. Then a fresh trip, from its own floor.
    const said = await workCorrection(s);
    expect(said.at(-2)).toMatch(/^\d+ floors\. Floor \d+ was where we started, so it was not counted\.$/);
    const fresh = s.view().task!;
    expect(fresh).toMatchObject({ kind: 'meter', stepId: 'compare-distance', meter: { value: 0 } });
    expect(s.view().elevator.floor).toBe(fresh.meter!.from);
    expect(s.view().elevator.panelEnabled).toBe(false);
    // A miss on the fresh trip: no second correction; the lift shows where the count went, then
    // takes itself back to the job's floor, because the count is measured from there.
    const freshRight = solve(s);
    const wrong = freshRight + 1 <= fresh.meter!.max ? freshRight + 1 : freshRight - 1;
    const before = answers(s);
    answerWith(s, wrong);
    expect(await s.time.runUntil(() => answers(s) > before && s.view().stage === 'reposition')).toBe(true);
    expect(s.view().rescueReady).toBe(false);
    expect(await s.time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
    expect(s.view().elevator.floor).toBe(fresh.meter!.from);
    expect(s.view().task).toMatchObject({ kind: 'meter', wrongTries: 1, meter: { value: wrong } });
    // The right count: the crew is on the landing.
    answerWith(s, freshRight);
    expect(await s.time.runUntil(() => s.view().stage === 'success' && s.view().props.some((p) => p.id === 'crew-measured'))).toBe(true);
    expect(s.view().elevator.floor).toBe(s.view().task!.job!.vars.to);
    expect(s.log.entries().filter((e) => e.kind === 'correction.followUp').at(-1)!.data).toMatchObject({ stepId: 'compare-distance', correct: false });
  });

  it('the express: the clue lights the first two stops, the count clue jumps by the stop size, adding is named', async () => {
    await reach(s, 'number-sense');
    const job = s.view().task!.job!;
    const [step, count] = [Number(job.vars.step), Number(job.vars.count)];
    expect(s.view().help?.label).toBe('CLUE');
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().highlights).toEqual([step, 2 * step]);
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().help?.label).toBe('HOW TO COUNT');
    s.director.requestHelp();
    await s.time.runUntil(() => !s.view().saving);
    expect(s.view().countAlong).toEqual({ from: 0, direction: 'up', steps: 2, stride: step });
    const added = step + count;
    if (added !== solve(s) && added !== step * (count - 1) && added !== step * (count + 1)) {
      await answerOnce(s, added);
      expect(s.view().lifty.line).toContain(`That adds ${step} and ${count}.`);
    } else {
      await answerOnce(s, step * (count - 1));
      expect(s.view().lifty.line).toContain('One stop short.');
    }
    expect(s.view().mismatch).toBeNull(); // a move from the bottom says nothing about stops
    expect(s.view().rescueReady).toBe(true);
  });

  it('a two-part correction: the second part is counted from where the first stopped, then a fresh trip', async () => {
    await reach(s, 'two-moves');
    const job = s.view().task!.job!;
    const signature = signatureOf(s);
    await answerOnce(s, solve(s) + 2 <= 20 ? solve(s) + 2 : solve(s) - 2);
    s.director.beginRescue();
    const board = s.view().rescue!;
    expect(board).toMatchObject({ corrective: true, example: 'twoMoves', part: 0, origin: job.anchor });
    expect(board.caption).toMatch(/^From Floor \d+: \d+ floors (up|down), then \d+ floors (up|down)\. Tap the next floor\.$/);
    const middle = board.parts[1]!.origin;
    const said = await workCorrection(s);
    expect(said[0]).toMatch(/^Let's count it together\./);
    expect(said.some((l) => l.includes(`First part done, at Floor ${middle}.`))).toBe(true);
    expect(said.at(-2)).toMatch(/Two parts, counted one after the other/);
    expect(said.at(-1)).toMatch(/^New job\. Two-part trip/);
    expect(signatureOf(s)).not.toBe(signature);
    expect(s.view().task?.stepId).toBe('two-moves');
    expect(s.view().elevator.floor).toBe(s.view().task!.job!.anchor);
  });
});

describe('test-run boards for the new jobs', () => {
  const rescue = (concept: string, prompt: Record<string, unknown>): RescueView => ({ status: 'active', focus: null, example: { concept, prompt, answer: 0, signature: 'x' } }) as unknown as RescueView;

  it('a two-part trip is counted in two parts; the second starts where the first stopped', () => {
    const b = rescueBoard(rescue('positionAfterTwoMoves', { start: 5, change: 4, direction: 'up', change2: 2, direction2: 'down' }), 1, 20)!;
    expect(b).toMatchObject({ example: 'twoMoves', asks: 'cell', origin: 5, direction: 'up', steps: 4 });
    expect(b.parts).toEqual([
      { origin: 5, direction: 'up', steps: 4 },
      { origin: 9, direction: 'down', steps: 2 },
    ]);
    expect(b.cells[0]).toBe(4);
    expect(b.cells.at(-1)).toBe(10);
  });

  it('where did it start counts back from the end; the express jumps a stop at a time from the bottom', () => {
    expect(rescueBoard(rescue('startBeforeMove', { end: 12, change: 5, direction: 'up' }), 1, 20)).toMatchObject({ example: 'startFloor', origin: 12, direction: 'down', steps: 5, stride: 1 });
    expect(rescueBoard(rescue('equalJumps', { step: 3, count: 4 }), 1, 20)).toMatchObject({ example: 'express', origin: 0, direction: 'up', steps: 4, stride: 3, cells: Array.from({ length: 13 }, (_, i) => i + 1) });
  });

  it('distance and two orders ask for a count; orders count on from the first order', () => {
    const d = rescueBoard(rescue('distanceBetween', { from: 6, to: 13 }), 1, 20)!;
    expect(d).toMatchObject({ example: 'tripMeter', asks: 'count', origin: 6, direction: 'up', steps: 7 });
    expect(d.choices).toContain(7);
    const o = rescueBoard(rescue('combineGroups', { first: 3, second: 4, waiting: 9 }), 1, 20)!;
    expect(o).toMatchObject({ kind: 'fill', example: 'orders', asks: 'count', origin: 3, aboard: 3, steps: 4, countFrom: 3 });
    expect(o.choices).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
  });
});

describe('jobs from prompts', () => {
  it('each new concept becomes a job anchored on a given, never on the answer', () => {
    expect(jobOf({ concept: 'positionAfterTwoMoves', prompt: { start: 7, change: 4, direction: 'up', change2: 2, direction2: 'down' } })).toMatchObject({ shape: 'twoMoves', anchor: 7, givens: [7], meter: null });
    expect(jobOf({ concept: 'startBeforeMove', prompt: { end: 12, change: 5, direction: 'up' } })).toMatchObject({ shape: 'startFloor', anchor: 12, move: { start: 12, change: 5, direction: 'down' }, vars: { end: 12, rode: 'up', dir: 'down' } });
    expect(jobOf({ concept: 'equalJumps', prompt: { step: 3, count: 4 } })).toMatchObject({ shape: 'express', anchor: null, givens: [3, 6], count: { from: 0, stride: 3, before: 3 } });
    expect(jobOf({ concept: 'distanceBetween', prompt: { from: 13, to: 6 } })).toMatchObject({ shape: 'tripMeter', anchor: 13, givens: [13, 6], meter: { from: 13, direction: 'down', max: 12 } });
    expect(jobOf({ concept: 'distanceBetween', prompt: { from: 6, to: 6 } })).toBeNull();
    expect(jobOf({ concept: 'fillToCapacity', prompt: {} })).toBeNull();
  });
});
