import { PHASE_LABELS, breakerBox, readoutRows } from './maintenance';

describe('maintenance readout and the power breaker (D231)', () => {
  it('never shows a code name: every phase has an engineering label in plain capitals', () => {
    for (const [phase, label] of Object.entries(PHASE_LABELS)) {
      expect(label).toMatch(/^[A-Z ]+$/);
      expect(label).not.toMatch(/[a-z]/);
      if (/[A-Z]/.test(phase)) expect(label).not.toBe(phase.replace(/([A-Z])/g, ' $1').toUpperCase()); // never the split code name
    }
    expect(readoutRows('idleOpen', null, 7)).toEqual([['STATE', 'DOORS OPEN'], ['DIR', 'STANDBY'], ['CAR POS', 'FL 7']]);
    expect(readoutRows('traveling', 'up', 12)).toEqual([['STATE', 'IN TRANSIT'], ['DIR', 'UP'], ['CAR POS', 'FL 12']]);
    expect(readoutRows('decelerating', 'down', 'B1')[2]).toEqual(['CAR POS', 'B1']);
  });

  it('the breaker stands inside the doorway, low and to the right, at a readable size', () => {
    for (const door of [{ x: 100, y: 80, w: 260, h: 240 }, { x: 0, y: 0, w: 120, h: 110 }, { x: 40, y: 30, w: 520, h: 420 }]) {
      const b = breakerBox(door);
      expect(b.x).toBeGreaterThanOrEqual(door.x + door.w / 2);
      expect(b.x + b.w).toBeLessThanOrEqual(door.x + door.w);
      expect(b.y).toBeGreaterThanOrEqual(door.y + door.h / 3);
      expect(b.y + b.h).toBeLessThanOrEqual(door.y + door.h);
      expect(b.w).toBeGreaterThanOrEqual(28);
      expect(b.h).toBeGreaterThanOrEqual(40);
    }
  });
});
