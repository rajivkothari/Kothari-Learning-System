// The spelling tray (tiles.ts): tap a tile to place it, tap a slot or UNDO to take a letter back, CLEAR.
import * as fc from 'fast-check';

import { attempt, clear, createTray, filled, firstFreeTile, isFull, isUsed, placeTile, removeSlot, slotLetter, undo } from './tiles';

describe('spelling tray', () => {
  it('places tiles into the first empty slot, in order', () => {
    let t = createTray('rgeax', 4);
    expect(t.slots).toEqual([null, null, null, null]);
    t = placeTile(t, 1); // g
    t = placeTile(t, 2); // e
    expect(slotLetter(t, 0)).toBe('g');
    expect(slotLetter(t, 1)).toBe('e');
    expect(isUsed(t, 1)).toBe(true);
    expect(filled(t)).toBe(2);
    t = placeTile(placeTile(t, 3), 0);
    expect(attempt(t)).toBe('gear');
    expect(isFull(t)).toBe(true);
  });

  it('a used tile, an unknown tile or a full row changes nothing (rapid taps place once)', () => {
    const t1 = placeTile(createTray('cab', 3), 0);
    expect(placeTile(t1, 0)).toBe(t1);
    expect(placeTile(t1, 9)).toBe(t1);
    const full = placeTile(placeTile(t1, 1), 2);
    const more = createTray('cabx', 3);
    const fullMore = placeTile(placeTile(placeTile(more, 0), 1), 2);
    expect(placeTile(fullMore, 3)).toBe(fullMore);
    expect(attempt(full)).toBe('cab');
  });

  it('a tapped slot gives its letter back and the next tile fills that gap', () => {
    let t = createTray('bolt', 4);
    for (const id of [0, 1, 2, 3]) t = placeTile(t, id);
    t = removeSlot(t, 1);
    expect(slotLetter(t, 1)).toBeNull();
    expect(isUsed(t, 1)).toBe(false);
    expect(attempt(t)).toBeNull();
    t = placeTile(t, 1);
    expect(attempt(t)).toBe('bolt');
    expect(removeSlot(createTray('bolt', 4), 2)).toEqual(createTray('bolt', 4));
  });

  it('UNDO takes back the latest letter; CLEAR takes back all of them', () => {
    let t = createTray('ship', 4);
    t = placeTile(placeTile(placeTile(t, 0), 1), 2);
    t = undo(t);
    expect(filled(t)).toBe(2);
    expect(isUsed(t, 2)).toBe(false);
    t = removeSlot(t, 0);
    t = undo(t);
    expect(filled(t)).toBe(0);
    const empty = createTray('ship', 4);
    expect(undo(empty)).toBe(empty);
    expect(clear(empty)).toBe(empty);
    expect(filled(clear(placeTile(placeTile(empty, 3), 2)))).toBe(0);
  });

  it('keeps letters only, lower case', () => {
    const t = createTray('Ge-A r1', 4);
    expect(t.tiles.map((x) => x.letter).join('')).toBe('gear');
    expect(firstFreeTile(t, 'a')).toBe(2);
  });

  it('never holds a tile in two slots, whatever is tapped', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.record({ k: fc.constant('place' as const), i: fc.integer({ min: 0, max: 7 }) }), fc.record({ k: fc.constant('take' as const), i: fc.integer({ min: 0, max: 4 }) }), fc.constant({ k: 'undo' as const, i: 0 }), fc.constant({ k: 'clear' as const, i: 0 }))), (moves) => {
        let t = createTray('cablexo', 5);
        for (const m of moves) t = m.k === 'place' ? placeTile(t, m.i) : m.k === 'take' ? removeSlot(t, m.i) : m.k === 'undo' ? undo(t) : clear(t);
        const used = t.slots.filter((s) => s !== null);
        expect(new Set(used).size).toBe(used.length);
        expect(t.order.length).toBe(used.length);
      }),
    );
  });
});
