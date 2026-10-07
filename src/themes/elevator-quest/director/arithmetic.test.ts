// The wider arithmetic in Floor 15 (D148): two orders in the cargo bay, a two-part trip, where did
// the crew get on, the trip meter, and the express. Headless on virtual time, through the real
// runtime. The director never computes an answer: every right value here comes from solve().
import type { RescueView } from '../../../engine';
import { LINES } from '../content/floor15';
import { answerCorrectly, answerWith, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { rescueBoard } from './director';
import { jobOf } from './jobs';

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

/** Answer once (wrong or right) and wait until the job waits again or moves on. */
async function answerOnce(s: Session, value: number) {
  const before = answers(s);
  answerWith(s, value);
  expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving && settled(s)() && (s.view().stage === 'task' || s.view().stage === 'cargo' || s.view().stage === 'success'))).toBe(true);
}

describe('Floor 15: the wider arithmetic', () => {
  let tmp: ReturnType<typeof tempDir>;
  let s: Session;
  beforeEach(async () => {
    tmp = tempDir();
    s = await openSession(tmp.file, virtualTime(), { autoNextJob: true });
    await wake(s);
  });
  afterEach(async () => {
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('two orders: loading one order only is named, the car never claims an overload, and both orders load', async () => {
    await reach(s, 'two-groups');
    const cargo = s.view().task!.cargo!;
    const [a, b] = cargo.orders!;
    expect(s.view().elevator.panelEnabled).toBe(false);
    await answerOnce(s, Math.max(a, b));
    const v = s.view();
    expect(v.task!.cargo!.status).toBe('mismatch');
    expect(v.lifty.line).toContain(LINES.ordersWrong({ orderA: a, orderB: b }));
    expect(v.lifty.line).toContain("That's one order.");
    expect(s.audio.some((c) => c.action === 'play' && c.slot === 'overloadTone')).toBe(false);
    s.director.unloadCrate(); // the bay keeps what was loaded: adjust it
    answerWith(s, solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success' || s.view().task?.stepId !== 'two-groups')).toBe(true);
    const replay = s.log.entries().filter((e) => e.kind === 'replay').at(-1)!;
    expect(replay.data).toMatchObject({ strategy: 'combine', evidence: 'suggested' });
  });

  it('a two-part trip waits at its first floor; stopping after the first part is named, without the answer', async () => {
    await reach(s, 'two-moves');
    const job = s.view().task!.job!;
    expect(s.view().elevator.floor).toBe(job.anchor);
    const middle = Number(job.vars.start) + (job.vars.dir === 'up' ? 1 : -1) * Number(job.vars.change);
    await answerOnce(s, middle);
    const v = s.view();
    expect(v.elevator.floor).toBe(middle);
    expect(v.lifty.line).toContain(`Then it goes ${job.vars.changeTwo} floors ${job.vars.dirTwo}`);
    expect(v.lifty.line).not.toContain(`Floor ${solve(s)}`);
  });

  it('where did they get on: the car waits where they got off; riding on instead of back is named', async () => {
    await reach(s, 'start-unknown');
    const job = s.view().task!.job!;
    expect(s.view().elevator.floor).toBe(job.vars.end);
    // Ride the same way again: the crew rode up to get here, so going further up is the wrong idea.
    const again = Number(job.vars.end) + (job.vars.rode === 'up' ? 1 : -1) * Number(job.vars.change);
    if (again >= 1 && again <= 20) {
      await answerOnce(s, again);
      expect(s.view().lifty.line).toContain(`They rode ${job.vars.rode} to get here`);
    }
    // The counting clue counts back from where they got off, and stops short.
    for (const label of ['CLUE', 'SHAFT MAP', 'HOW TO COUNT']) {
      expect(s.view().help?.label).toBe(label);
      s.director.requestHelp();
      await s.time.runUntil(() => !s.view().saving);
    }
    const back = job.vars.rode === 'up' ? 'down' : 'up';
    expect(s.view().countAlong).toMatchObject({ from: job.vars.end, direction: back });
    expect(s.view().countAlong!.steps).toBeLessThan(Number(job.vars.change));
    expect(s.view().lifty.line).toContain(`Put your finger on Floor ${job.vars.end}. The next floor ${back} is 1.`);
  });

  it('the trip meter: floor buttons stay locked, GO rides the count, a miss shows where it went and returns to the job floor', async () => {
    await reach(s, 'distance');
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
    // Counting both ends: one too many. The ride really goes that far.
    const right = solve(s);
    const before = answers(s);
    answerWith(s, right + 1);
    expect(await s.time.runUntil(() => answers(s) > before && s.view().stage === 'reposition')).toBe(true);
    const sign = meter.direction === 'up' ? 1 : -1;
    expect(s.view().elevator.floor).toBe(meter.from + sign * (right + 1));
    expect(s.view().lifty.line).toContain('One floor too many.');
    // Then the lift takes itself back to the job's floor, and the same job waits for a new count.
    expect(await s.time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
    expect(s.view().elevator.floor).toBe(meter.from);
    expect(s.view().elevator.panelEnabled).toBe(false);
    expect(s.view().task).toMatchObject({ kind: 'meter', wrongTries: 1, meter: { value: right + 1 } });
    // The right count: the crew is on the landing.
    answerWith(s, right);
    expect(await s.time.runUntil(() => s.view().stage === 'success' && s.view().props.some((p) => p.id === 'crew-measured'))).toBe(true);
    expect(s.view().elevator.floor).toBe(job.vars.to);
  });

  it('the express: the clue lights the first two stops, the count clue jumps by the stop size, adding is named', async () => {
    await reach(s, 'equal-jumps');
    const job = s.view().task!.job!;
    const [step, count] = [Number(job.vars.step), Number(job.vars.count)];
    const added = step + count;
    if (added !== solve(s) && added !== step * (count - 1) && added !== step * (count + 1)) {
      await answerOnce(s, added);
      expect(s.view().lifty.line).toContain(`That adds ${step} and ${count}.`);
    } else {
      await answerOnce(s, step * (count - 1));
      expect(s.view().lifty.line).toContain('One stop short.');
    }
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
  });

  /** Miss until the job pauses for a test run. Each miss is a different wrong value than the answer. */
  async function missToRescue(s: Session) {
    for (let i = 0; i < 5 && s.view().stage !== 'rescue'; i++) {
      const right = solve(s);
      const max = s.view().task?.meter?.max ?? 20;
      const before = answers(s);
      answerWith(s, right + 2 <= max ? right + 2 : right - 2);
      expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving && (s.view().stage === 'rescue' || (settled(s)() && s.view().stage === 'task')))).toBe(true);
    }
    expect(await s.time.runUntil(() => s.view().stage === 'rescue')).toBe(true);
  }

  /** Count the test run cell by cell as the board asks, then say where it stops (or how many). */
  async function workTestRun(s: Session): Promise<string[]> {
    const said: string[] = [];
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
    expect(await s.time.runUntil(() => s.view().stage === 'task' && settled(s)())).toBe(true);
    return said;
  }

  it('a two-part test run: the second part is counted from where the first stopped, then back to the same job', async () => {
    await reach(s, 'two-moves');
    const signature = s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature;
    await missToRescue(s);
    const board = s.view().rescue!;
    expect(board).toMatchObject({ example: 'twoMoves', part: 0 });
    const middle = board.parts[1]!.origin;
    const said = await workTestRun(s);
    expect(said.some((l) => l.includes(`First part done, at Floor ${middle}.`))).toBe(true);
    expect(said.at(-1)).toMatch(/Two parts, counted one after the other/);
    expect(s.rt.currentView(s.director.instanceId()).view.activity!.itemSignature).toBe(signature);
    expect(s.view().task?.stepId).toBe('two-moves');
    expect(s.view().elevator.floor).toBe(s.view().task!.job!.anchor);
  });

  it('a trip meter test run asks how many floors, then the lift goes back to the job floor for the real count', async () => {
    await reach(s, 'distance');
    const from = s.view().task!.meter!.from;
    await missToRescue(s);
    expect(s.view().rescue).toMatchObject({ example: 'tripMeter', asks: 'count' });
    const said = await workTestRun(s);
    expect(said.at(-1)).toMatch(/floors\. Floor \d+ was where we started, so it was not counted\./);
    expect(s.view().task).toMatchObject({ kind: 'meter', stepId: 'distance' });
    expect(s.view().elevator.floor).toBe(from);
    expect(s.view().elevator.panelEnabled).toBe(false);
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
