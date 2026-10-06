import * as fc from 'fast-check';

import { canonicalJson, hashString, hashValue } from './hash';
import { createRng } from './rng';

describe('seeded rng', () => {
  it('same seed gives the same sequence', () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const a = createRng(seed);
        const b = createRng(seed);
        for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
      }),
    );
  });

  it('int stays inside inclusive bounds', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 500 }), (seed, min, span) => {
        const rng = createRng(seed);
        for (let i = 0; i < 25; i++) {
          const v = rng.int(min, min + span);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(min + span);
        }
      }),
    );
  });

  it('shuffle returns a permutation and leaves the input untouched', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.integer()), (seed, items) => {
        const copy = [...items];
        const out = createRng(seed).shuffle(items);
        expect(items).toEqual(copy);
        expect([...out].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
      }),
    );
  });

  it('rejects empty ranges and empty picks', () => {
    const rng = createRng('x');
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('hashing', () => {
  it('canonical JSON ignores object key order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.integer(), fc.string(), fc.boolean())), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(obj));
        expect(hashValue(reversed)).toBe(hashValue(obj));
      }),
    );
  });

  it('is pinned: changing the hash would orphan stored item signatures', () => {
    // If this fails, the hash algorithm changed. Stored evidence would stop recognizing
    // exact replays. Bump generator versions or migrate signatures before changing it.
    // Values computed from the current implementation on 2026-10-06.
    expect(hashString('')).toBe('027ae52ecfc796215593990d4b41437c');
    expect(hashString('positionAfterMove')).toBe('09849badf836b5ba3c1480df82790eb5');
  });
});
