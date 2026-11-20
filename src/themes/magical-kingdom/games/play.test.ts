import { CLOSE, PULL, REACH, bowl, putt, spots } from './play';

describe('the lane', () => {
  it('stands three and four pins or flags where the spec puts them', () => {
    expect(spots(3)).toEqual([-0.75, 0, 0.75]);
    expect(spots(4)).toEqual([-0.75, -0.25, 0.25, 0.75]);
    expect(spots(1)).toEqual([0]);
    expect(spots(0)).toEqual([]);
  });
});

describe('Ice Bowling', () => {
  const all = [true, true, true, true];

  it('a ball that reaches the shining pin knocks every standing pin down', () => {
    for (const target of [0, 1, 2, 3]) {
      const x = spots(4)[target]!;
      expect(bowl(x, all, target, false)).toEqual({ x, down: [0, 1, 2, 3], cleared: true, steered: false });
      // Close enough counts: the ball is as wide as REACH.
      expect(bowl(x + REACH - 0.01, all, target, false).cleared).toBe(true);
    }
    // Only the pins still standing fall.
    expect(bowl(0.75, [false, true, false, true], 3, false)).toEqual({ x: 0.75, down: [1, 3], cleared: true, steered: false });
  });

  it('a ball off the shining pin knocks down only what it reaches', () => {
    // Aimed at the far-left pin while the far-right one shines.
    expect(bowl(-0.75, all, 3, false)).toEqual({ x: -0.75, down: [0], cleared: false, steered: false });
    // Between two pins it takes both.
    expect(bowl(-0.5, all, 3, false).down).toEqual([0, 1]);
    // Down the gutter it takes none.
    expect(bowl(-1, [false, true, true, true], 3, false)).toEqual({ x: -1, down: [], cleared: false, steered: false });
    // A fallen pin cannot fall again.
    expect(bowl(-0.75, [false, true, true, true], 3, false).down).toEqual([]);
  });

  it('the last ball always clears: off target, it curves to the shining pin', () => {
    expect(bowl(-0.75, [false, true, true, true], 3, true)).toEqual({ x: 0.75, down: [1, 2, 3], cleared: true, steered: true });
    expect(bowl(0.75, all, 3, true)).toEqual({ x: 0.75, down: [0, 1, 2, 3], cleared: true, steered: false });
    for (let aim = -1; aim <= 1; aim += 0.05) for (const target of [0, 1, 2, 3]) expect(bowl(aim, all, target, true).cleared).toBe(true);
  });

  it('keeps the ball on the lane whatever the aim', () => {
    expect(bowl(5, all, 0, false).x).toBe(1);
    expect(bowl(-5, all, 3, false).x).toBe(-1);
    expect(bowl(Number.NaN, all, 0, false).x).toBe(0);
  });
});

describe('Garden Golf', () => {
  it('the ball drops when it stops close to the shining flag’s hole', () => {
    for (const target of [0, 1, 2]) {
      const hole = spots(3)[target]!;
      expect(putt(hole, 3, target, 0, false)).toEqual({ x: hole, sunk: true, steered: false });
      expect(putt(hole + CLOSE - 0.01, 3, target, 0, false)).toEqual({ x: hole, sunk: true, steered: false });
      expect(putt(hole + CLOSE + 0.05 > 1 ? hole - CLOSE - 0.05 : hole + CLOSE + 0.05, 3, target, 0, false).sunk).toBe(false);
    }
    // A miss stops where it was aimed.
    expect(putt(-0.75, 3, 2, 0, false)).toEqual({ x: -0.75, sunk: false, steered: false });
  });

  it('each later putt is pulled in from a little further, and the last always drops', () => {
    const off = CLOSE + PULL - 0.02;
    expect(putt(off, 3, 1, 0, false).sunk).toBe(false);
    expect(putt(off, 3, 1, 1, false)).toEqual({ x: 0, sunk: true, steered: false });
    expect(putt(-0.75, 3, 2, 1, false).sunk).toBe(false);
    expect(putt(-0.75, 3, 2, 2, true)).toEqual({ x: 0.75, sunk: true, steered: true });
    for (let aim = -1; aim <= 1; aim += 0.05) for (const target of [0, 1, 2]) expect(putt(aim, 3, target, 2, true).sunk).toBe(true);
  });

  it('three tries are enough from anywhere', () => {
    for (let aim = -1; aim <= 1; aim += 0.1) {
      let sunk = false;
      for (let attempt = 0; attempt < 3 && !sunk; attempt++) sunk = putt(aim, 3, 1, attempt, attempt === 2).sunk;
      expect(sunk).toBe(true);
    }
    expect(putt(9, 3, 0, 0, false).x).toBe(1);
  });
});
