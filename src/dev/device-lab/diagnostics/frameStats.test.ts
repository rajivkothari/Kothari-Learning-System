import { median, pushSample, summarizeFrameIntervals, tapsPerSecond } from './frameStats';

describe('summarizeFrameIntervals', () => {
  it('reports ~60 fps for steady 16.67 ms frames with no slow frames', () => {
    const s = summarizeFrameIntervals(Array(60).fill(1000 / 60));
    expect(s.fps).toBeCloseTo(60, 3);
    expect(s.slowFrames).toBe(0);
    expect(s.p95Ms).toBeCloseTo(16.67, 1);
  });

  it('counts slow frames and exposes the worst one', () => {
    const s = summarizeFrameIntervals([16, 16, 16, 50, 16, 120]);
    expect(s.slowFrames).toBe(2);
    expect(s.maxMs).toBe(120);
  });

  it('ignores zero, negative, and non-finite intervals', () => {
    const s = summarizeFrameIntervals([0, -5, Number.NaN, Infinity, 20]);
    expect(s.frames).toBe(1);
    expect(s.avgMs).toBe(20);
  });

  it('returns zeros for an empty window', () => {
    expect(summarizeFrameIntervals([]).fps).toBe(0);
  });
});

describe('tapsPerSecond', () => {
  it('counts taps inside the rolling window only', () => {
    // Window is (1000, 2000]: 1500 and 1900 count, 1000 sits on the boundary and counts.
    expect(tapsPerSecond([100, 900, 1500, 1900], 2000)).toBe(2);
    expect(tapsPerSecond([1000, 1500, 1900], 2000)).toBe(3);
    // Future timestamps are ignored.
    expect(tapsPerSecond([1500, 2500], 2000)).toBe(1);
  });
});

describe('pushSample and median', () => {
  it('keeps the newest samples within the limit', () => {
    let s: number[] = [];
    for (let i = 0; i < 10; i++) s = pushSample(s, i, 4);
    expect(s).toEqual([6, 7, 8, 9]);
  });

  it('rejects invalid samples', () => {
    expect(pushSample([1], -1)).toEqual([1]);
  });

  it('computes medians for odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
