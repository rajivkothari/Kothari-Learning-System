// Elevator simulation: a deterministic, render-free state machine.
//
//   idleOpen -> doorsClosing -> departing -> traveling -> decelerating -> arrived -> doorsOpening -> idleOpen
//                    \-> idleClosed (doors shut, no call)          (Door Open while closing reverses the doors)
//
// It knows floors, buttons, doors, and motion. It does NOT know whether a destination is
// educationally right: the mission director decides what a destination means.
//
// Time is always passed in. Every input first catches the machine up to its time, so the
// result never depends on how often the caller ticks. Events carry their exact scheduled
// time, so audio and visuals can line up with the state, not with the tick.
//
// Single-destination mode (the only mode in this slice): one destination per trip. Before
// departure a different floor replaces it ("change of plan"); while moving, floor presses
// click but do nothing.

export type ElevatorPhase = 'idleOpen' | 'doorsClosing' | 'idleClosed' | 'departing' | 'traveling' | 'decelerating' | 'arrived' | 'doorsOpening';
export type Direction = 'up' | 'down';

export interface ElevatorTiming {
  doorCloseMs: number;
  doorOpenMs: number;
  /** Doors stay open this long after a floor is chosen, unless Door Close is pressed. */
  dwellMs: number;
  /** Motor engages after the doors seal, before the car moves. */
  departMs: number;
  accelMs: number;
  decelMs: number;
  /** Cruise time per floor beyond the first. */
  perFloorMs: number;
  /** Arrival chime this long after the car stops. */
  chimeDelayMs: number;
  /** Doors start opening this long after the car stops (after the chime). */
  settleMs: number;
}

/** Authentic sequence, compressed time. Tunable after playtests. */
export const NORMAL_TIMING: ElevatorTiming = {
  doorCloseMs: 1300,
  doorOpenMs: 1200,
  dwellMs: 900,
  departMs: 450,
  accelMs: 900,
  decelMs: 1000,
  perFloorMs: 380,
  chimeDelayMs: 180,
  settleMs: 650,
};

/** Reduced motion: same sequence and floor-by-floor indicator, much shorter. Never changes the task. */
export const REDUCED_TIMING: ElevatorTiming = {
  doorCloseMs: 450,
  doorOpenMs: 450,
  dwellMs: 500,
  departMs: 150,
  accelMs: 250,
  decelMs: 300,
  perFloorMs: 170,
  chimeDelayMs: 100,
  settleMs: 300,
};

export interface ElevatorConfig {
  minFloor: number;
  maxFloor: number;
  timing: ElevatorTiming;
}

export interface Trip {
  from: number;
  to: number;
  startAt: number;
  durationMs: number;
}

export interface ElevatorState {
  phase: ElevatorPhase;
  /** When the current phase began. */
  since: number;
  /** Floor the car is stopped at, or departed from while moving. */
  floor: number;
  /** What the floor indicator shows. Changes floor by floor during travel. */
  indicator: number;
  direction: Direction | null;
  destination: number | null;
  /** Illuminated floor buttons. */
  lit: readonly number[];
  trip: Trip | null;
  /** Scheduled automatic door close (a destination is waiting). */
  closeAt: number | null;
  /** Door open fraction (0 closed, 1 open) when the current door motion began. */
  doorFrom: number;
  chimed: boolean;
  panelEnabled: boolean;
  disabledFloors: readonly number[];
  /** Last time processed. Inputs earlier than this are treated as happening now. */
  now: number;
}

export type ElevatorEvent = { at: number } & (
  | { type: 'buttonPressed'; floor: number; accepted: boolean; reason: 'lit' | 'replaced' | 'alreadyLit' | 'here' | 'panelLocked' | 'unavailable' | 'inMotion'; source: 'learner' | 'system' }
  | { type: 'buttonLit'; floor: number }
  | { type: 'buttonCleared'; floor: number; reason: 'serviced' | 'replaced' }
  | { type: 'doorButton'; button: 'open' | 'close'; accepted: boolean }
  | { type: 'doorsClosing' }
  | { type: 'doorsClosed' }
  | { type: 'doorsOpening'; reopened: boolean }
  | { type: 'doorsOpened' }
  | { type: 'departing'; from: number; to: number; direction: Direction }
  | { type: 'travelStarted'; from: number; to: number; direction: Direction }
  | { type: 'floorPassed'; floor: number; direction: Direction }
  | { type: 'decelerating'; toward: number }
  | { type: 'arrived'; floor: number }
  | { type: 'chime'; floor: number; direction: Direction | null }
);

export type ElevatorInput =
  | { type: 'tick'; at: number }
  | { type: 'press'; floor: number; at: number; source?: 'learner' | 'system' }
  | { type: 'doorOpen'; at: number }
  | { type: 'doorClose'; at: number }
  | { type: 'setPanel'; at: number; enabled: boolean; disabledFloors?: readonly number[] }
  /** Recovery and scene setup: put a stopped car at a floor, doors as given. Ignored while moving. */
  | { type: 'place'; at: number; floor: number; doors: 'open' | 'closed' };

export interface ElevatorResult {
  state: ElevatorState;
  events: ElevatorEvent[];
}

export function createElevator(config: ElevatorConfig, floor: number, at: number, doors: 'open' | 'closed' = 'open'): ElevatorState {
  return {
    phase: doors === 'open' ? 'idleOpen' : 'idleClosed',
    since: at,
    floor,
    indicator: floor,
    direction: null,
    destination: null,
    lit: [],
    trip: null,
    closeAt: null,
    doorFrom: doors === 'open' ? 1 : 0,
    chimed: false,
    panelEnabled: true,
    disabledFloors: [],
    now: at,
  };
}

export const isMoving = (s: ElevatorState) => s.phase === 'departing' || s.phase === 'traveling' || s.phase === 'decelerating';

// ---------- motion profile ----------

export function tripDuration(timing: ElevatorTiming, floors: number): number {
  return floors <= 0 ? 0 : timing.accelMs + timing.decelMs + Math.max(0, floors - 1) * timing.perFloorMs;
}

/** Trapezoidal velocity profile, normalized: fraction of the distance covered at fraction u of the time. */
export function profile(u: number, a: number, b: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, u));
  const vmax = 1 / (1 - a / 2 - b / 2);
  if (t < a) return (vmax * t * t) / (2 * a);
  if (t <= 1 - b) return vmax * (a / 2 + (t - a));
  const r = 1 - t;
  return 1 - (vmax * r * r) / (2 * b);
}

/** Car position in floors (fractional) at `now`. Stopped cars sit exactly on their floor. */
export function carPosition(s: ElevatorState, timing: ElevatorTiming, now: number): number {
  if (!s.trip || (s.phase !== 'traveling' && s.phase !== 'decelerating')) return s.floor;
  const { from, to, startAt, durationMs } = s.trip;
  const u = (now - startAt) / durationMs;
  return from + (to - from) * profile(u, timing.accelMs / durationMs, timing.decelMs / durationMs);
}

/** Door open fraction at `now` (0 closed, 1 open). */
export function doorOpenFraction(s: ElevatorState, timing: ElevatorTiming, now: number): number {
  'worklet';
  switch (s.phase) {
    case 'idleOpen':
      return 1;
    case 'doorsClosing': {
      const dur = s.doorFrom * timing.doorCloseMs;
      return dur <= 0 ? 0 : Math.max(0, s.doorFrom * (1 - (now - s.since) / dur));
    }
    case 'doorsOpening': {
      const dur = (1 - s.doorFrom) * timing.doorOpenMs;
      return dur <= 0 ? 1 : Math.min(1, s.doorFrom + (1 - s.doorFrom) * ((now - s.since) / dur));
    }
    default:
      return 0;
  }
}

/** Exact time the indicator changes to `floor` during a trip (the car is half a floor away). */
function crossingTime(trip: Trip, timing: ElevatorTiming, floor: number): number {
  const d = trip.to - trip.from;
  const target = Math.abs(floor - 0.5 * Math.sign(d) - trip.from) / Math.abs(d);
  const a = timing.accelMs / trip.durationMs;
  const b = timing.decelMs / trip.durationMs;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (profile(mid, a, b) < target) lo = mid;
    else hi = mid;
  }
  return trip.startAt + Math.round(hi * trip.durationMs);
}

// ---------- reducer ----------

export function reduce(config: ElevatorConfig, state: ElevatorState, input: ElevatorInput): ElevatorResult {
  const events: ElevatorEvent[] = [];
  const s: ElevatorState = { ...state };
  const at = Math.max(input.at, state.now);
  advanceTo(config, s, at, events);
  const emit = (e: ElevatorEvent) => events.push(e);

  switch (input.type) {
    case 'tick':
      break;
    case 'setPanel':
      s.panelEnabled = input.enabled;
      s.disabledFloors = input.disabledFloors ?? [];
      break;
    case 'place':
      if (!isMoving(s) && s.phase !== 'arrived') {
        Object.assign(s, { floor: input.floor, indicator: input.floor, direction: null, destination: null, lit: [], trip: null, closeAt: null, chimed: false });
        setPhase(s, input.doors === 'open' ? 'idleOpen' : 'idleClosed', at, input.doors === 'open' ? 1 : 0);
      }
      break;
    case 'press':
      press(config, s, input.floor, at, input.source ?? 'learner', emit);
      break;
    case 'doorClose':
      if (s.phase === 'idleOpen') {
        emit({ type: 'doorButton', button: 'close', accepted: true, at });
        startClosing(s, at, emit);
      } else emit({ type: 'doorButton', button: 'close', accepted: false, at });
      break;
    case 'doorOpen':
      doorOpen(config, s, at, emit);
      break;
  }
  s.now = at;
  return { state: s, events };
}

function setPhase(s: ElevatorState, phase: ElevatorPhase, at: number, doorFrom = s.doorFrom) {
  s.phase = phase;
  s.since = at;
  s.doorFrom = doorFrom;
}

function startClosing(s: ElevatorState, at: number, emit: (e: ElevatorEvent) => void) {
  s.closeAt = null;
  setPhase(s, 'doorsClosing', at, 1);
  emit({ type: 'doorsClosing', at });
}

function depart(s: ElevatorState, at: number, emit: (e: ElevatorEvent) => void) {
  const to = s.destination as number;
  const direction: Direction = to > s.floor ? 'up' : 'down';
  s.direction = direction;
  setPhase(s, 'departing', at, 0);
  emit({ type: 'departing', from: s.floor, to, direction, at });
}

function press(config: ElevatorConfig, s: ElevatorState, floor: number, at: number, source: 'learner' | 'system', emit: (e: ElevatorEvent) => void) {
  const reject = (reason: 'panelLocked' | 'unavailable' | 'inMotion') => emit({ type: 'buttonPressed', floor, accepted: false, reason, source, at });
  if (source === 'learner' && !s.panelEnabled) return reject('panelLocked');
  if (floor < config.minFloor || floor > config.maxFloor || (source === 'learner' && s.disabledFloors.includes(floor))) return reject('unavailable');
  if (isMoving(s)) return reject('inMotion');

  const stoppedHere = floor === s.floor && (s.phase === 'idleOpen' || s.phase === 'doorsOpening' || s.phase === 'arrived' || s.phase === 'doorsClosing' || s.phase === 'idleClosed');
  if (stoppedHere && s.destination === null) {
    emit({ type: 'buttonPressed', floor, accepted: true, reason: 'here', source, at });
    // Pressing the floor you are on reopens closing doors, like a real car.
    if (s.phase === 'doorsClosing' || s.phase === 'idleClosed') reopen(config, s, at, emit);
    return;
  }
  if (floor === s.destination) return void emit({ type: 'buttonPressed', floor, accepted: true, reason: 'alreadyLit', source, at });

  if (floor === s.floor) {
    // Changing a waiting destination back to the current floor cancels the trip.
    emit({ type: 'buttonPressed', floor, accepted: true, reason: 'here', source, at });
    const old = s.destination as number;
    emit({ type: 'buttonCleared', floor: old, reason: 'replaced', at });
    s.lit = s.lit.filter((f) => f !== old);
    s.destination = null;
    s.closeAt = null;
    if (s.phase === 'doorsClosing' || s.phase === 'idleClosed') reopen(config, s, at, emit);
    return;
  }

  const replacing = s.destination;
  emit({ type: 'buttonPressed', floor, accepted: true, reason: replacing === null ? 'lit' : 'replaced', source, at });
  if (replacing !== null) {
    emit({ type: 'buttonCleared', floor: replacing, reason: 'replaced', at });
    s.lit = s.lit.filter((f) => f !== replacing);
  }
  s.destination = floor;
  s.lit = [...s.lit, floor];
  emit({ type: 'buttonLit', floor, at });
  if (s.phase === 'idleOpen') s.closeAt = at + config.timing.dwellMs;
  else if (s.phase === 'idleClosed') depart(s, at, emit);
  // doorsClosing: keeps closing, departs to the new floor. arrived/doorsOpening: closes after the doors open.
}

function reopen(config: ElevatorConfig, s: ElevatorState, at: number, emit: (e: ElevatorEvent) => void) {
  const from = doorOpenFraction(s, config.timing, at);
  s.closeAt = null;
  setPhase(s, 'doorsOpening', at, from);
  emit({ type: 'doorsOpening', reopened: true, at });
}

function doorOpen(config: ElevatorConfig, s: ElevatorState, at: number, emit: (e: ElevatorEvent) => void) {
  if (s.phase === 'idleOpen') {
    emit({ type: 'doorButton', button: 'open', accepted: true, at });
    if (s.destination !== null) s.closeAt = at + config.timing.dwellMs; // hold the doors
    return;
  }
  if (s.phase === 'doorsClosing' || s.phase === 'idleClosed') {
    emit({ type: 'doorButton', button: 'open', accepted: true, at });
    reopen(config, s, at, emit);
    return;
  }
  // Moving, leveling, or already opening: the game never opens doors between floors.
  emit({ type: 'doorButton', button: 'open', accepted: s.phase === 'doorsOpening', at });
}

/** Apply every scheduled transition up to `now`, in order, with exact times. */
function advanceTo(config: ElevatorConfig, s: ElevatorState, now: number, events: ElevatorEvent[]): void {
  const t = config.timing;
  const emit = (e: ElevatorEvent) => events.push(e);
  for (let guard = 0; guard < 1000; guard++) {
    switch (s.phase) {
      case 'idleOpen': {
        if (s.closeAt === null || s.closeAt > now) return;
        startClosing(s, s.closeAt, emit);
        break;
      }
      case 'doorsClosing': {
        const end = s.since + s.doorFrom * t.doorCloseMs;
        if (end > now) return;
        emit({ type: 'doorsClosed', at: end });
        if (s.destination !== null && s.destination !== s.floor) depart(s, end, emit);
        else setPhase(s, 'idleClosed', end, 0);
        break;
      }
      case 'idleClosed':
        return;
      case 'departing': {
        const end = s.since + t.departMs;
        if (end > now) return;
        const to = s.destination as number;
        s.trip = { from: s.floor, to, startAt: end, durationMs: tripDuration(t, Math.abs(to - s.floor)) };
        setPhase(s, 'traveling', end, 0);
        emit({ type: 'travelStarted', from: s.floor, to, direction: s.direction as Direction, at: end });
        break;
      }
      case 'traveling':
      case 'decelerating': {
        const trip = s.trip as Trip;
        const decelAt = trip.startAt + trip.durationMs - t.decelMs;
        const arriveAt = trip.startAt + trip.durationMs;
        const step = Math.sign(trip.to - trip.from);
        // Floor-by-floor indicator, at exact crossing times.
        while (s.indicator !== trip.to) {
          const next = s.indicator + step;
          const when = crossingTime(trip, t, next);
          if (when > now) break;
          if (s.phase === 'traveling' && decelAt <= when) {
            setPhase(s, 'decelerating', decelAt, 0);
            emit({ type: 'decelerating', toward: trip.to, at: decelAt });
          }
          s.indicator = next;
          emit({ type: 'floorPassed', floor: next, direction: s.direction as Direction, at: when });
        }
        if (s.phase === 'traveling') {
          if (decelAt > now) return;
          setPhase(s, 'decelerating', decelAt, 0);
          emit({ type: 'decelerating', toward: trip.to, at: decelAt });
          break;
        }
        if (arriveAt > now) return;
        s.floor = trip.to;
        s.indicator = trip.to;
        s.destination = null;
        s.lit = s.lit.filter((f) => f !== trip.to);
        s.chimed = false;
        setPhase(s, 'arrived', arriveAt, 0);
        emit({ type: 'arrived', floor: trip.to, at: arriveAt });
        emit({ type: 'buttonCleared', floor: trip.to, reason: 'serviced', at: arriveAt });
        break;
      }
      case 'arrived': {
        const chimeAt = s.since + t.chimeDelayMs;
        if (!s.chimed) {
          if (chimeAt > now) return;
          s.chimed = true;
          emit({ type: 'chime', floor: s.floor, direction: s.direction, at: chimeAt });
        }
        const openAt = s.since + t.settleMs;
        if (openAt > now) return;
        s.trip = null;
        setPhase(s, 'doorsOpening', openAt, 0);
        emit({ type: 'doorsOpening', reopened: false, at: openAt });
        break;
      }
      case 'doorsOpening': {
        const end = s.since + (1 - s.doorFrom) * t.doorOpenMs;
        if (end > now) return;
        setPhase(s, 'idleOpen', end, 1);
        s.direction = null;
        emit({ type: 'doorsOpened', at: end });
        // A floor chosen while the doors were opening departs after the usual dwell.
        if (s.destination !== null) s.closeAt = end + t.dwellMs;
        break;
      }
    }
  }
  throw new Error('Elevator simulation did not settle');
}

/** Drive a sequence of inputs and collect every event. Convenience for tests and the director. */
export function run(config: ElevatorConfig, state: ElevatorState, inputs: readonly ElevatorInput[]): ElevatorResult {
  let s = state;
  const events: ElevatorEvent[] = [];
  for (const input of inputs) {
    const r = reduce(config, s, input);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** When does the machine next change on its own? Lets a driver sleep instead of polling. */
export function nextWakeAt(config: ElevatorConfig, s: ElevatorState): number | null {
  const t = config.timing;
  switch (s.phase) {
    case 'idleOpen':
      return s.closeAt;
    case 'doorsClosing':
      return s.since + s.doorFrom * t.doorCloseMs;
    case 'idleClosed':
      return null;
    case 'departing':
      return s.since + t.departMs;
    case 'traveling':
    case 'decelerating': {
      const trip = s.trip as Trip;
      const arriveAt = trip.startAt + trip.durationMs;
      const decelAt = s.phase === 'traveling' ? arriveAt - t.decelMs : arriveAt;
      const crossing = s.indicator !== trip.to ? crossingTime(trip, t, s.indicator + Math.sign(trip.to - trip.from)) : arriveAt;
      return Math.min(crossing, decelAt, arriveAt);
    }
    case 'arrived':
      return s.chimed ? s.since + t.settleMs : s.since + t.chimeDelayMs;
    case 'doorsOpening':
      return s.since + (1 - s.doorFrom) * t.doorOpenMs;
  }
}
