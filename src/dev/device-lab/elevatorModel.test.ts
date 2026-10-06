import { FLOORS, SHAFT, carTopForFloor, counterweightTop, floorForCarTop, travelMs } from './elevatorModel';

describe('elevator scene model', () => {
  it('maps every floor to a car position inside the shaft and back', () => {
    for (let f = 1; f <= FLOORS; f++) {
      const top = carTopForFloor(f);
      expect(top).toBeGreaterThanOrEqual(SHAFT.y);
      expect(top).toBeLessThan(SHAFT.bottom);
      expect(floorForCarTop(top)).toBe(f);
    }
  });

  it('puts higher floors higher on screen', () => {
    expect(carTopForFloor(6)).toBeLessThan(carTopForFloor(1));
  });

  it('clamps out-of-range floors', () => {
    expect(carTopForFloor(0)).toBe(carTopForFloor(1));
    expect(carTopForFloor(99)).toBe(carTopForFloor(FLOORS));
  });

  it('moves the counterweight opposite to the car', () => {
    expect(counterweightTop(carTopForFloor(1))).toBe(carTopForFloor(FLOORS));
    expect(counterweightTop(carTopForFloor(FLOORS))).toBe(carTopForFloor(1));
  });

  it('keeps travel time bounded', () => {
    expect(travelMs(3, 3)).toBe(0);
    expect(travelMs(1, 2)).toBeGreaterThan(0);
    expect(travelMs(1, 6)).toBeLessThanOrEqual(2400);
  });
});
