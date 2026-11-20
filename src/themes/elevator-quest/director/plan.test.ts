// D201, plan before press: a panel job is answered in two steps. The learner marks a floor on the
// shaft map (the plan), and only that floor button can light; the press is the ride and the answer,
// locked at departure exactly as before. The plan is never evidence. Headless, on virtual time.
import { CLASSIC_CONTENT, LEARNER, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { LINES } from '../content/floor15';

const presses = (s: Session) => s.log.entries().filter((e) => e.kind === 'panel.press');
const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');

async function wakeTheLift(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

describe('plan before press (D201)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('locks every floor until a plan names one, nudges once, and keeps the job words on screen', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { content: CLASSIC_CONTENT, plan: true });
    await wakeTheLift(s);
    let v = s.view();
    expect(v).toMatchObject({ stage: 'task', planning: true, plan: null, task: { kind: 'panel' } });
    expect(v.elevator.panelEnabled).toBe(true);
    expect(v.elevator.disabledFloors).toHaveLength(20);
    const jobLine = v.lifty.line;

    // A press before the plan: the button clicks, nothing lights, and Lifty points at the map, once.
    const right = solve(s);
    s.director.pressFloor(right);
    v = s.view();
    expect(v.elevator.lit).toEqual([]);
    expect(presses(s).at(-1)).toMatchObject({ data: { floor: right, accepted: false, reason: 'unavailable' } });
    expect(v.lifty.line.startsWith(LINES.planFirst)).toBe(true);
    expect(v.lifty.line).toContain(jobLine);
    s.director.pressFloor(right);
    expect(s.view().lifty.seq).toBe(v.lifty.seq); // the second press says nothing new
    expect(s.log.entries().filter((e) => e.kind === 'plan.nudge')).toHaveLength(2);
    expect(answers(s)).toHaveLength(0);
  });

  it('a plan lights only its floor; the press rides and answers as before; the plan is not evidence', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { content: CLASSIC_CONTENT, plan: true });
    await wakeTheLift(s);
    const right = solve(s);
    const other = right === 20 ? 19 : right + 1;
    const stateBefore = await s.rt.learnerState(LEARNER);

    s.director.planFloor(other, 'shaft');
    let v = s.view();
    expect(v.plan).toBe(other);
    expect(v.elevator.disabledFloors).not.toContain(other);
    expect(v.elevator.disabledFloors).toContain(right);
    expect(v.elevator.lit).toEqual([]);
    // A change of plan: the new floor is the one that can light.
    s.director.planFloor(right, 'shaft');
    v = s.view();
    expect(v.plan).toBe(right);
    expect(v.elevator.disabledFloors).toContain(other);
    expect(s.log.entries().filter((e) => e.kind === 'plan').map((e) => e.data)).toEqual([
      { floor: other, via: 'shaft', window: expect.any(Number), changed: false },
      { floor: right, via: 'shaft', window: expect.any(Number), changed: true },
    ]);
    // Nothing has been answered: a plan is presentation and a gate.
    expect(answers(s)).toHaveLength(0);
    expect(await s.rt.learnerState(LEARNER)).toEqual(stateBefore);

    s.director.pressFloor(right);
    expect(s.view().elevator.lit).toEqual([right]);
    expect(await time.runUntil(() => s.view().stage === 'riding')).toBe(true);
    expect(s.view()).toMatchObject({ plan: null, planning: false }); // the window closed at departure
    expect(answers(s)).toHaveLength(1);
    expect(answers(s)[0]!.data).toMatchObject({ value: right, correct: true });
  });

  it('a plan outside an open window changes nothing', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { content: CLASSIC_CONTENT, plan: true });
    expect(s.view()).toMatchObject({ stage: 'intro', planning: false });
    s.director.planFloor(7);
    expect(s.view().plan).toBeNull();
    expect(s.log.entries().filter((e) => e.kind === 'plan.ignored')).toHaveLength(1);
    await wakeTheLift(s);
    // Out of range: ignored too.
    s.director.planFloor(21);
    expect(s.view().plan).toBeNull();
  });

  it('with the knob off, a press answers at once (the earlier flow)', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { content: CLASSIC_CONTENT, plan: false });
    await wakeTheLift(s);
    expect(s.view()).toMatchObject({ planning: false, plan: null });
    expect(s.view().elevator.disabledFloors).toEqual([]);
    const right = solve(s);
    s.director.pressFloor(right);
    expect(s.view().elevator.lit).toEqual([right]);
  });

  it('a wrong plan rides to the wrong floor and the world shows it (the plan never corrects the press)', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { content: CLASSIC_CONTENT, plan: true });
    await wakeTheLift(s);
    const right = solve(s);
    const wrong = right + (right < 20 ? 1 : -1);
    s.director.planFloor(wrong);
    s.director.pressFloor(wrong);
    expect(await time.runUntil(() => s.view().rescueReady && !s.view().saving)).toBe(true);
    const v = s.view();
    expect(v.elevator.floor).toBe(wrong);
    expect(v.mismatch).toMatchObject({ to: wrong });
    expect(v).toMatchObject({ plan: null, planning: false });
    expect(answers(s)[0]!.data).toMatchObject({ value: wrong, correct: false });
  });
});
