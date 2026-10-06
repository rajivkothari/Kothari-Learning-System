// Property tests: random input sequences against the elevator reducer (audit: catch variants of
// the arrival-window bug and any state the machine cannot leave).
import * as fc from 'fast-check';

import { NORMAL_TIMING, REDUCED_TIMING, createElevator, doorOpenFraction, isMoving, nextWakeAt, reduce, type ElevatorConfig, type ElevatorInput, type ElevatorState } from './elevator';

const CONFIGS: ElevatorConfig[] = [
  { minFloor: 1, maxFloor: 20, timing: NORMAL_TIMING },
  { minFloor: 1, maxFloor: 20, timing: REDUCED_TIMING },
];

type Step = { dt: number; input: Omit<ElevatorInput, 'at'> & { type: ElevatorInput['type'] } };

const floor = fc.integer({ min: -2, max: 23 }); // includes out-of-range floors
const stepArb: fc.Arbitrary<Step> = fc.record({
  dt: fc.integer({ min: 0, max: 2500 }),
  input: fc.oneof(
    fc.record({ type: fc.constant('press' as const), floor, source: fc.constantFrom('learner' as const, 'system' as const) }),
    fc.record({ type: fc.constant('doorOpen' as const) }),
    fc.record({ type: fc.constant('doorClose' as const) }),
    fc.record({ type: fc.constant('tick' as const) }),
    fc.record({ type: fc.constant('cancelCall' as const) }),
    fc.record({ type: fc.constant('setPanel' as const), enabled: fc.boolean(), disabledFloors: fc.array(fc.integer({ min: 1, max: 20 }), { maxLength: 4 }) }),
    fc.record({ type: fc.constant('place' as const), floor: fc.integer({ min: 1, max: 20 }), doors: fc.constantFrom('open' as const, 'closed' as const) }),
  ),
});

function checkInvariants(config: ElevatorConfig, s: ElevatorState) {
  // Doors are shut whenever the car moves.
  if (isMoving(s)) expect(doorOpenFraction(s, config.timing, s.now)).toBe(0);
  // Single-destination mode: at most one lit call, and it is the destination.
  expect(s.lit.length).toBeLessThanOrEqual(1);
  if (s.destination === null) expect(s.lit).toEqual([]);
  else {
    expect(s.lit).toEqual([s.destination]);
    expect(s.destination).toBeGreaterThanOrEqual(config.minFloor);
    expect(s.destination).toBeLessThanOrEqual(config.maxFloor);
  }
  expect(s.floor).toBeGreaterThanOrEqual(config.minFloor);
  expect(s.floor).toBeLessThanOrEqual(config.maxFloor);
  // The indicator stays on the trip's path.
  if (s.trip && isMoving(s)) {
    const lo = Math.min(s.trip.from, s.trip.to);
    const hi = Math.max(s.trip.from, s.trip.to);
    expect(s.indicator).toBeGreaterThanOrEqual(lo);
    expect(s.indicator).toBeLessThanOrEqual(hi);
  }
}

describe('elevator reducer under random input', () => {
  it('never throws, keeps its invariants, and always settles at a floor', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CONFIGS), fc.integer({ min: 1, max: 20 }), fc.boolean(), fc.array(stepArb, { maxLength: 60 }), (config, start, open, steps) => {
        let at = 1000;
        let s = createElevator(config, start, at, open ? 'open' : 'closed');
        for (const step of steps) {
          at += step.dt;
          s = reduce(config, s, { ...step.input, at } as ElevatorInput).state;
          checkInvariants(config, s);
        }
        // Leave it alone: every scheduled transition runs out and the car rests at a floor. Each
        // floor crossing is its own wake, so a 19-floor ride needs a few dozen ticks.
        for (let i = 0; i < 500; i++) {
          const wake = nextWakeAt(config, s);
          if (wake === null) break;
          s = reduce(config, s, { type: 'tick', at: Math.max(wake, s.now) }).state;
          checkInvariants(config, s);
        }
        expect(['idleOpen', 'idleClosed']).toContain(s.phase);
        expect(s.destination).toBeNull();
        expect(nextWakeAt(config, s)).toBeNull();
      }),
      { numRuns: 400 },
    );
  });

  it('a locked panel never lets a learner create a destination', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CONFIGS), fc.array(stepArb, { maxLength: 40 }), (config, steps) => {
        let at = 1000;
        let s = reduce(config, createElevator(config, 5, at, 'open'), { type: 'setPanel', at, enabled: false }).state;
        for (const step of steps) {
          if (step.input.type === 'setPanel' || (step.input.type === 'press' && 'source' in step.input && step.input.source === 'system')) continue;
          at += step.dt;
          const r = reduce(config, s, { ...step.input, at } as ElevatorInput);
          for (const e of r.events) if (e.type === 'buttonLit') throw new Error(`learner lit ${e.floor} on a locked panel`);
          s = r.state;
        }
      }),
      { numRuns: 300 },
    );
  });

  it('cancelCall drops a waiting call before it departs, and is ignored in motion', () => {
    const config = CONFIGS[0]!;
    let s = createElevator(config, 5, 0, 'open');
    s = reduce(config, s, { type: 'press', floor: 9, at: 10 }).state;
    expect(s.destination).toBe(9);
    const r = reduce(config, s, { type: 'cancelCall', at: 20 });
    expect(r.state).toMatchObject({ destination: null, lit: [], closeAt: null, phase: 'idleOpen' });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'buttonCleared', floor: 9, reason: 'cancelled' }));
    // In motion the call stands.
    s = reduce(config, s, { type: 'tick', at: 10 + config.timing.dwellMs + config.timing.doorCloseMs + config.timing.departMs + 50 }).state;
    expect(isMoving(s)).toBe(true);
    expect(reduce(config, s, { type: 'cancelCall', at: s.now }).state.destination).toBe(9);
  });
});
