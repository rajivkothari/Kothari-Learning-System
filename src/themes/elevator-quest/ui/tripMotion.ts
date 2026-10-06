// What the per-frame travel animation needs from the elevator state. Pure: no React.
// The frame callback runs only while `moving` is true, so an idle cabin or shaft map costs no
// work per frame (audit: callbacks used to run on every frame for the whole session).
import type { ElevatorState, ElevatorTiming } from '../sim/elevator';

export interface TripMotion {
  moving: boolean;
  from: number;
  to: number;
  startAt: number;
  duration: number;
  accel: number;
  decel: number;
}

export function tripMotion(elevator: ElevatorState, timing: ElevatorTiming): TripMotion {
  const t = elevator.trip;
  const moving = (elevator.phase === 'traveling' || elevator.phase === 'decelerating') && t !== null;
  return { moving, from: t?.from ?? elevator.floor, to: t?.to ?? elevator.floor, startAt: t?.startAt ?? 0, duration: t?.durationMs ?? 1, accel: timing.accelMs, decel: timing.decelMs };
}
