// Logical geometry for the Device Lab elevator scene (stage units, 1600 x 1000).
// Pure and worklet-safe so the same numbers drive Skia drawing and UI-thread animation.

export const FLOORS = 6;
export const SHAFT = { x: 640, y: 140, width: 320, bottom: 960 } as const;
export const FLOOR_HEIGHT = (SHAFT.bottom - SHAFT.y) / FLOORS;
export const CAR = { width: 220, height: 120, inset: 4 } as const;
export const CAR_X = SHAFT.x + (SHAFT.width - CAR.width) / 2;

/** Top edge of the car when stopped at `floor` (1 = ground). */
export function carTopForFloor(floor: number): number {
  'worklet';
  const clamped = Math.min(FLOORS, Math.max(1, Math.round(floor)));
  return SHAFT.bottom - (clamped - 1) * FLOOR_HEIGHT - CAR.height - CAR.inset;
}

/** Nearest floor for a car top position. Used for the floor indicator. */
export function floorForCarTop(top: number): number {
  'worklet';
  const raw = (SHAFT.bottom - CAR.height - CAR.inset - top) / FLOOR_HEIGHT + 1;
  return Math.min(FLOORS, Math.max(1, Math.round(raw)));
}

/** Travel time grows with distance but stays short enough to feel responsive. */
export function travelMs(fromFloor: number, toFloor: number): number {
  'worklet';
  const floors = Math.abs(toFloor - fromFloor);
  return floors === 0 ? 0 : Math.min(2400, 450 + 260 * floors);
}

/** Counterweight moves opposite to the car within the shaft. */
export function counterweightTop(carTop: number): number {
  'worklet';
  const minTop = carTopForFloor(FLOORS);
  const maxTop = carTopForFloor(1);
  return minTop + (maxTop - carTop);
}
