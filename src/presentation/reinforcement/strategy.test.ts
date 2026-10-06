import * as fc from 'fast-check';

import { chooseReinforcement, intensityFor, replayMs, type ReinforcementInput } from './strategy';

const move = (start: number, change: number, direction: 'up' | 'down', extra: Partial<Extract<ReinforcementInput, { kind: 'move' }>> = {}): ReinforcementInput => ({
  kind: 'move',
  start,
  change,
  direction,
  reference: 'start',
  challenge: 'practice',
  observed: [],
  ...extra,
});

describe('success replay strategy', () => {
  it.each([
    [8, 7, 'up', 'bridgeToTen', [8, 10, 15], 'bridgeToTen'],
    [13, 6, 'down', 'bridgeThroughTen', [13, 10, 7], 'bridgeThroughTen'],
    [4, 2, 'up', 'countOn', [4, 5, 6], 'countOn'],
    [9, 3, 'down', 'countBack', [9, 8, 7, 6], 'countBack'],
    [4, 6, 'up', 'bridgeToTen', [4, 10], 'makeTen'],
    [16, 6, 'down', 'bridgeThroughTen', [16, 10], 'backToTen'],
    [11, 7, 'up', 'decompose', [11, 16, 18], 'decompose'],
    [19, 6, 'down', 'distance', [13, 19], 'distance'],
    [12, 4, 'up', 'countOn', [12, 13, 14, 15, 16], 'countOn'],
  ] as const)('%i, %i %s: %s', (start, change, direction, strategy, steps, textKey) => {
    const r = chooseReinforcement(move(start, change, direction));
    expect(r).toMatchObject({ strategy, steps, textKey, evidenceBasis: 'suggested', intensity: 'routine', representation: 'numberLine' });
  });

  it('shows what the learner was seen doing first, and only then calls it theirs', () => {
    const onMap = chooseReinforcement(move(8, 7, 'up', { observed: ['usedNumberLine'] }));
    expect(onMap).toMatchObject({ strategy: 'numberLine', evidenceBasis: 'observed', steps: [8, 15], textKey: 'numberLineObserved' });
    // A changed plan is a fact worth saying, but it does not make the strategy shown theirs.
    const changed = chooseReinforcement(move(8, 7, 'up', { observed: ['changedPlan'] }));
    expect(changed).toMatchObject({ strategy: 'bridgeToTen', evidenceBasis: 'suggested', observed: ['changedPlan'] });
  });

  it('a beacon job shows the offset from the beacon', () => {
    expect(chooseReinforcement(move(12, 5, 'down', { reference: 'beacon', challenge: 'stretch' }))).toMatchObject({ strategy: 'referenceOffset', concept: 'offsetFromReference', steps: [12, 7], intensity: 'stretch' });
  });

  it('cargo: used + remaining = total, observed when the crates were loaded', () => {
    const r = chooseReinforcement({ kind: 'capacity', capacity: 10, aboard: 4, loaded: 6, challenge: 'masteryEncounter', observed: ['loadedExactly'] });
    expect(r).toMatchObject({ strategy: 'partWhole', representation: 'loadMeter', steps: [4, 10], evidenceBasis: 'observed', answerSummary: '4 + 6 = 10', intensity: 'mastery' });
    expect(chooseReinforcement({ kind: 'capacity', capacity: 10, aboard: 4, loaded: 6, challenge: 'practice', observed: [] }).evidenceBasis).toBe('suggested');
  });

  it('intensity follows the challenge, and the stage time grows with it (shorter under reduced motion)', () => {
    expect([intensityFor('practice'), intensityFor('stretch'), intensityFor('masteryEncounter')]).toEqual(['routine', 'stretch', 'mastery']);
    for (const m of ['normal', 'reduced'] as const) expect(replayMs('routine', m)).toBeLessThan(replayMs('stretch', m));
    expect(replayMs('stretch', 'normal')).toBeLessThan(replayMs('mastery', 'normal'));
    for (const i of ['routine', 'stretch', 'mastery'] as const) expect(replayMs(i, 'reduced')).toBeLessThan(replayMs(i, 'normal'));
    // Routine successes stay brief: about one to two seconds.
    expect(replayMs('routine', 'normal')).toBeGreaterThanOrEqual(1000);
    expect(replayMs('routine', 'normal')).toBeLessThanOrEqual(2000);
  });

  it('property: deterministic, the path runs from the givens to the answer, monotonic, on the line', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 19 }), fc.constantFrom('up' as const, 'down' as const), fc.boolean(), (start, change, direction, onMap) => {
        const result = direction === 'up' ? start + change : start - change;
        fc.pre(result >= 1 && result <= 20);
        const input = move(start, change, direction, { observed: onMap ? ['usedNumberLine'] : [] });
        const r = chooseReinforcement(input);
        expect(chooseReinforcement(input)).toEqual(r);
        const ends = [r.steps[0], r.steps.at(-1)].sort((a, b) => a! - b!);
        expect(ends).toEqual([Math.min(start, result), Math.max(start, result)]);
        const inc = r.steps.every((v, i) => i === 0 || v > r.steps[i - 1]!);
        const dec = r.steps.every((v, i) => i === 0 || v < r.steps[i - 1]!);
        expect(inc || dec).toBe(true);
        for (const v of r.steps) expect(v >= 1 && v <= 20).toBe(true);
        expect(r.evidenceBasis === 'observed').toBe(onMap);
      }),
      { numRuns: 500 },
    );
  });
});
