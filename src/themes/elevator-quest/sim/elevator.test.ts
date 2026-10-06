import {
  NORMAL_TIMING,
  REDUCED_TIMING,
  carPosition,
  createElevator,
  doorOpenFraction,
  nextWakeAt,
  reduce,
  run,
  type ElevatorConfig,
  type ElevatorEvent,
  type ElevatorInput,
  type ElevatorState,
} from './elevator';

const NORMAL: ElevatorConfig = { minFloor: 1, maxFloor: 20, timing: NORMAL_TIMING };
const REDUCED: ElevatorConfig = { minFloor: 1, maxFloor: 20, timing: REDUCED_TIMING };
const T = 1_000_000;

const types = (events: ElevatorEvent[]) => events.map((e) => e.type);
const tick = (at: number): ElevatorInput => ({ type: 'tick', at });
const press = (floor: number, at: number, source?: 'learner' | 'system'): ElevatorInput => ({ type: 'press', floor, at, source });

/** Ride to the end: press, then tick far into the future. */
function ride(config: ElevatorConfig, from: number, to: number) {
  return run(config, createElevator(config, from, T), [press(to, T), tick(T + 60_000)]);
}

describe('elevator simulation', () => {
  it('runs the full authentic sequence for a normal trip, in order', () => {
    const { state, events } = ride(NORMAL, 8, 15);
    const main = types(events).filter((t) => t !== 'floorPassed');
    expect(main).toEqual([
      'buttonPressed',
      'buttonLit',
      'doorsClosing',
      'doorsClosed',
      'departing',
      'travelStarted',
      'decelerating',
      'arrived',
      'buttonCleared',
      'chime',
      'doorsOpening',
      'doorsOpened',
    ]);
    expect(state).toMatchObject({ phase: 'idleOpen', floor: 15, indicator: 15, destination: null, lit: [] });
    // Event times never go backwards.
    for (let i = 1; i < events.length; i++) expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
  });

  it('doors close before travel; the car never moves with the doors open', () => {
    const { events } = ride(NORMAL, 3, 9);
    const closed = events.find((e) => e.type === 'doorsClosed')!.at;
    const started = events.find((e) => e.type === 'travelStarted')!.at;
    const opening = events.find((e) => e.type === 'doorsOpening')!.at;
    const arrived = events.find((e) => e.type === 'arrived')!.at;
    expect(started).toBeGreaterThan(closed);
    expect(opening).toBeGreaterThan(arrived);
  });

  it('the indicator steps through every floor in order, never jumping to the target', () => {
    const up = ride(NORMAL, 8, 15).events.filter((e) => e.type === 'floorPassed').map((e) => (e as { floor: number }).floor);
    expect(up).toEqual([9, 10, 11, 12, 13, 14, 15]);
    const down = ride(NORMAL, 14, 9).events.filter((e) => e.type === 'floorPassed').map((e) => (e as { floor: number }).floor);
    expect(down).toEqual([13, 12, 11, 10, 9]);
  });

  it('the indicator shows the departure floor at the start of travel and the target only near the end', () => {
    const r = run(NORMAL, createElevator(NORMAL, 8, T), [press(15, T)]);
    let s = r.state;
    const started = run(NORMAL, s, [tick(T + 60_000)]).events.find((e) => e.type === 'travelStarted')!.at;
    s = run(NORMAL, s, [tick(started + 50)]).state;
    expect(s.indicator).toBe(8);
    expect(s.direction).toBe('up');
  });

  it('chime comes after the stop, and doors open after the chime', () => {
    const { events } = ride(NORMAL, 2, 5);
    const at = (type: string) => events.find((e) => e.type === type)!.at;
    expect(at('chime')).toBeGreaterThan(at('arrived'));
    expect(at('doorsOpening')).toBeGreaterThan(at('chime'));
    expect(events.filter((e) => e.type === 'chime')).toHaveLength(1);
  });

  it('the selected button stays lit until its floor is serviced, then goes out', () => {
    let s = createElevator(NORMAL, 4, T);
    s = reduce(NORMAL, s, press(10, T)).state;
    expect(s.lit).toEqual([10]);
    const mid = run(NORMAL, s, [tick(T + 3000)]).state;
    expect(mid.lit).toEqual([10]);
    const done = run(NORMAL, s, [tick(T + 60_000)]);
    expect(done.state.lit).toEqual([]);
    expect(done.events).toContainEqual(expect.objectContaining({ type: 'buttonCleared', floor: 10, reason: 'serviced' }));
  });

  it('rapid repeated presses of the same floor light it once and start one trip', () => {
    const inputs: ElevatorInput[] = Array.from({ length: 12 }, (_, i) => press(15, T + i * 40));
    const r = run(NORMAL, createElevator(NORMAL, 8, T), [...inputs, tick(T + 60_000)]);
    expect(r.events.filter((e) => e.type === 'buttonLit')).toHaveLength(1);
    expect(r.events.filter((e) => e.type === 'travelStarted')).toHaveLength(1);
    expect(r.events.filter((e) => e.type === 'chime')).toHaveLength(1);
    expect(r.events.filter((e) => e.type === 'buttonPressed' && e.reason === 'alreadyLit')).toHaveLength(11);
  });

  it('mashing during travel never restarts or redirects the trip', () => {
    const start = run(NORMAL, createElevator(NORMAL, 3, T), [press(12, T), tick(T + 3500)]);
    expect(start.state.phase === 'traveling' || start.state.phase === 'decelerating').toBe(true);
    const mashed = run(NORMAL, start.state, [press(5, T + 3510), press(12, T + 3520), press(20, T + 3530), { type: 'doorOpen', at: T + 3540 }, { type: 'doorClose', at: T + 3550 }, tick(T + 60_000)]);
    expect(mashed.state.floor).toBe(12);
    expect(mashed.events.filter((e) => e.type === 'travelStarted')).toHaveLength(0);
    expect(mashed.events.filter((e) => e.type === 'buttonPressed').every((e) => !(e as { accepted: boolean }).accepted)).toBe(true);
    expect(mashed.events).toContainEqual(expect.objectContaining({ type: 'doorButton', button: 'open', accepted: false }));
  });

  it('a different floor before departure replaces the destination (a change of plan)', () => {
    const r = run(NORMAL, createElevator(NORMAL, 8, T), [press(14, T), press(15, T + 300), tick(T + 60_000)]);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'buttonCleared', floor: 14, reason: 'replaced' }));
    expect(r.events.filter((e) => e.type === 'travelStarted')).toEqual([expect.objectContaining({ to: 15 })]);
    expect(r.state.floor).toBe(15);
  });

  it('pressing the current floor with no call does nothing but click', () => {
    const r = run(NORMAL, createElevator(NORMAL, 8, T), [press(8, T), tick(T + 10_000)]);
    expect(types(r.events)).toEqual(['buttonPressed']);
    expect(r.state.phase).toBe('idleOpen');
  });

  it('Door Close shortens the wait; Door Open holds and reopens closing doors', () => {
    const waited = run(NORMAL, createElevator(NORMAL, 8, T), [press(10, T), tick(T + 60_000)]);
    const hurried = run(NORMAL, createElevator(NORMAL, 8, T), [press(10, T), { type: 'doorClose', at: T + 100 }, tick(T + 60_000)]);
    const startOf = (r: typeof waited) => r.events.find((e) => e.type === 'doorsClosing')!.at;
    expect(startOf(hurried)).toBe(T + 100);
    expect(startOf(waited)).toBe(T + NORMAL_TIMING.dwellMs);

    const closing = run(NORMAL, createElevator(NORMAL, 8, T), [press(10, T), { type: 'doorClose', at: T + 10 }, tick(T + 400)]).state;
    expect(closing.phase).toBe('doorsClosing');
    const fraction = doorOpenFraction(closing, NORMAL_TIMING, T + 400);
    const reopened = reduce(NORMAL, closing, { type: 'doorOpen', at: T + 400 });
    expect(reopened.events).toContainEqual(expect.objectContaining({ type: 'doorsOpening', reopened: true }));
    // Doors reverse from where they were, not from fully shut.
    expect(doorOpenFraction(reopened.state, NORMAL_TIMING, T + 400)).toBeCloseTo(fraction, 5);
    // The call is still waiting and departs after the dwell.
    const later = run(NORMAL, reopened.state, [tick(T + 60_000)]);
    expect(later.state.floor).toBe(10);
  });

  it('door controls cannot create impossible states while moving or leveling', () => {
    const states: ElevatorState[] = [];
    let s = createElevator(NORMAL, 1, T);
    // Mash both door buttons from the moment the doors start closing until the ride is over.
    s = run(NORMAL, s, [press(20, T), { type: 'doorClose', at: T + 1 }]).state;
    for (let t = T + 2000; t < T + 20_000; t += 37) {
      const r = run(NORMAL, s, [{ type: 'doorOpen', at: t }, { type: 'doorClose', at: t + 1 }, tick(t + 2)]);
      s = r.state;
      states.push(s);
    }
    expect(states.some((x) => x.phase === 'traveling')).toBe(true);
    expect(states.some((x) => x.phase === 'arrived')).toBe(true);
    expect(states.at(-1)!.floor).toBe(20);
    for (const x of states) {
      const doors = doorOpenFraction(x, NORMAL_TIMING, x.now);
      if (x.phase === 'traveling' || x.phase === 'decelerating' || x.phase === 'departing' || x.phase === 'arrived') expect(doors).toBe(0);
      expect(x.floor >= 1 && x.floor <= 20).toBe(true);
    }
  });

  it('rejects unavailable floors and a locked panel, but system dispatch still works', () => {
    let s = createElevator(NORMAL, 5, T);
    s = reduce(NORMAL, s, { type: 'setPanel', at: T, enabled: true, disabledFloors: [13] }).state;
    expect(reduce(NORMAL, s, press(13, T)).events).toEqual([expect.objectContaining({ type: 'buttonPressed', accepted: false, reason: 'unavailable' })]);
    expect(reduce(NORMAL, s, press(25, T)).events[0]).toMatchObject({ accepted: false, reason: 'unavailable' });
    s = reduce(NORMAL, s, { type: 'setPanel', at: T, enabled: false }).state;
    expect(reduce(NORMAL, s, press(9, T)).events[0]).toMatchObject({ accepted: false, reason: 'panelLocked' });
    expect(run(NORMAL, s, [press(9, T, 'system'), tick(T + 60_000)]).state.floor).toBe(9);
  });

  it('reduced motion keeps the same sequence and floor-by-floor indicator, only faster', () => {
    const normal = ride(NORMAL, 6, 13);
    const reduced = ride(REDUCED, 6, 13);
    expect(types(reduced.events)).toEqual(types(normal.events));
    expect(reduced.state).toMatchObject({ floor: 13, phase: 'idleOpen' });
    const span = (r: typeof normal) => r.events.at(-1)!.at - r.events[0]!.at;
    expect(span(reduced)).toBeLessThan(span(normal) / 2);
    // Each floor is still shown for a visible moment.
    const passes = reduced.events.filter((e) => e.type === 'floorPassed').map((e) => e.at);
    for (let i = 1; i < passes.length - 1; i++) expect(passes[i]! - passes[i - 1]!).toBeGreaterThanOrEqual(100);
  });

  it('is deterministic and independent of tick granularity', () => {
    const coarse = run(NORMAL, createElevator(NORMAL, 2, T), [press(17, T), tick(T + 60_000)]);
    const fine: ElevatorInput[] = [press(17, T)];
    for (let t = T; t <= T + 60_000; t += 16) fine.push(tick(t));
    const smooth = run(NORMAL, createElevator(NORMAL, 2, T), fine);
    expect(smooth.events).toEqual(coarse.events);
    expect(smooth.state).toEqual({ ...coarse.state });
  });

  it('car position moves smoothly and monotonically, ending exactly on the floor', () => {
    let s = run(NORMAL, createElevator(NORMAL, 8, T), [press(15, T), tick(T + 2700)]).state;
    let last = 8;
    for (let t = T + 2700; t < T + 9000; t += 20) {
      s = reduce(NORMAL, s, tick(t)).state;
      const p = carPosition(s, NORMAL_TIMING, t);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      expect(p).toBeLessThanOrEqual(15 + 1e-9);
      last = p;
    }
    expect(carPosition(reduce(NORMAL, s, tick(T + 60_000)).state, NORMAL_TIMING, T + 60_000)).toBe(15);
  });

  it('nextWakeAt predicts the next event, so a driver can sleep between changes', () => {
    let s = reduce(NORMAL, createElevator(NORMAL, 4, T), press(9, T)).state;
    for (let i = 0; i < 40; i++) {
      const wake = nextWakeAt(NORMAL, s);
      if (wake === null) break;
      const r = reduce(NORMAL, s, tick(wake));
      expect(r.events.length).toBeGreaterThan(0);
      s = r.state;
    }
    expect(s).toMatchObject({ phase: 'idleOpen', floor: 9 });
  });

  it('place restores a coherent stopped car for recovery, and refuses while moving', () => {
    const moving = run(NORMAL, createElevator(NORMAL, 3, T), [press(12, T), tick(T + 3500)]).state;
    expect(reduce(NORMAL, moving, { type: 'place', at: T + 3500, floor: 7, doors: 'open' }).state.floor).toBe(3);
    const placed = reduce(NORMAL, createElevator(NORMAL, 3, T), { type: 'place', at: T, floor: 7, doors: 'closed' }).state;
    expect(placed).toMatchObject({ floor: 7, indicator: 7, phase: 'idleClosed', lit: [], destination: null });
  });
});
