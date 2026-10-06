// The car's position in floors, computed per frame on the UI thread while it travels, with the
// same motion profile as the simulation. Shared by the cabin (parallax) and the shaft map.
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { profile, type ElevatorState, type ElevatorTiming } from '../sim/elevator';
import { tripMotion } from './tripMotion';

export function useTripPosition(elevator: ElevatorState, timing: ElevatorTiming): SharedValue<number> {
  const motion = tripMotion(elevator, timing);
  const trip = useSharedValue(motion);
  const position = useSharedValue(elevator.floor);
  const frame = useFrameCallback(() => {
    const t = trip.get();
    const u = (Date.now() - t.startAt) / t.duration;
    position.set(t.from + (t.to - t.from) * profile(u, t.accel / t.duration, t.decel / t.duration));
  }, false);
  const { moving, from, to, startAt, duration, accel, decel } = motion;
  useEffect(() => {
    trip.set({ moving, from, to, startAt, duration, accel, decel });
    if (!moving) position.set(elevator.floor);
    // Only while travelling: no per-frame work when the car stands still.
    frame.setActive(moving);
  }, [frame, trip, position, elevator.floor, moving, from, to, startAt, duration, accel, decel]);
  return position;
}
