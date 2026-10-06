// Pure visual logic for Floor 15: button states, Lifty poses, cabin geometry.
import { STENCIL } from '../../../presentation/design/stencilDigits';
import { ENGINEER_WORLD as t } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';
import { buttonLook } from './buttonLook';
import { cabinGeometry } from './cabinGeometry';
import { LIFTY_A11Y, liftyPose } from './liftyPose';
import { rescueLayout } from './rescueLayout';

const flags = { lit: false, current: false, clue: false, disabled: false };

describe('floor button looks', () => {
  it('selected and current are visibly different', () => {
    const selected = buttonLook({ ...flags, lit: true }, t);
    const current = buttonLook({ ...flags, current: true }, t);
    expect(selected.state).toBe('selected');
    expect(current.state).toBe('current');
    expect(selected.lamp).toBeGreaterThan(0);
    expect(current.lamp).toBe(0);
    expect(current.positionLamp).toBe(true);
    expect(selected.face).not.toBe(current.face);
  });

  it('a clue rings the button without filling or lighting it', () => {
    const clue = buttonLook({ ...flags, clue: true }, t);
    const idle = buttonLook(flags, t);
    expect(clue.clueRing).toBe(t.state.clue.ring);
    expect({ ...clue, clueRing: null }).toEqual(idle);
  });

  it('disabled overrides everything and shows no lamp or clue', () => {
    const d = buttonLook({ lit: true, current: true, clue: true, disabled: true }, t);
    expect(d).toMatchObject({ state: 'disabled', lamp: 0, clueRing: null, positionLamp: false });
    expect(d.opacity).toBeLessThan(1);
  });

  it('a lit call at the current floor keeps both signals', () => {
    expect(buttonLook({ ...flags, lit: true, current: true }, t)).toMatchObject({ state: 'selected', positionLamp: true });
  });

  it('never uses danger red', () => {
    for (const lit of [false, true])
      for (const current of [false, true])
        for (const clue of [false, true])
          for (const disabled of [false, true]) {
            const look = buttonLook({ lit, current, clue, disabled }, t);
            expect(Object.values(look)).not.toContain(t.palette.danger);
          }
  });
});

describe('Lifty poses', () => {
  const moods: LiftyMood[] = ['neutral', 'thinking', 'helping', 'concerned', 'satisfied', 'systemCheck'];

  it('every state has its own display glyph and a description', () => {
    const glyphs = moods.map((m) => liftyPose(m, t, 'normal').glyph);
    expect(new Set(glyphs).size).toBe(moods.length);
    for (const m of moods) expect(LIFTY_A11Y[m]).toMatch(/Lifty/);
  });

  it('concern is never shown in danger red', () => {
    for (const m of moods) expect(liftyPose(m, t, 'normal').accent).not.toBe(t.palette.danger);
  });

  it('only the system check animates, and never under reduced motion', () => {
    for (const m of moods) {
      expect(liftyPose(m, t, 'reduced').scanning).toBe(false);
      expect(liftyPose(m, t, 'normal').scanning).toBe(m === 'systemCheck');
    }
  });

  it('helping points: the arm is raised', () => {
    expect(liftyPose('helping', t, 'normal').shoulderDeg).toBeGreaterThan(liftyPose('neutral', t, 'normal').shoulderDeg + 45);
  });
});

describe('cabin geometry', () => {
  const sizes = [
    [420, 300],
    [560, 420],
    [700, 520],
    [960, 600],
    [744, 520],
    [1180, 700],
    [380, 330],
  ] as const;

  it('keeps every element inside the cabin and the indicator above the doors on the center line', () => {
    for (const [width, height] of sizes) {
      const g = cabinGeometry({ width, height });
      const inside = (r: { x: number; y: number; w: number; h: number }) => r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 0.5 && r.y + r.h <= height + 0.5;
      for (const r of [g.ceiling, g.indicator, g.frame, g.door, ...g.panels, ...g.sideLights, ...g.lights]) expect(inside(r)).toBe(true);
      expect(g.indicator.y + g.indicator.h).toBeLessThan(g.frame.y);
      expect(g.indicator.x + g.indicator.w / 2).toBeCloseTo(width / 2);
      expect(g.door.x + g.door.w / 2).toBeCloseTo(width / 2);
      expect(g.door.y + g.door.h).toBeLessThanOrEqual(g.floorY + 0.5);
    }
  });

  it('back-wall panels never overlap the door frame', () => {
    for (const [width, height] of sizes) {
      const g = cabinGeometry({ width, height });
      for (const p of g.panels) expect(p.x + p.w <= g.frame.x || p.x >= g.frame.x + g.frame.w).toBe(true);
    }
  });

  it('the painted floor number fits in the doorway', () => {
    for (const [width, height] of sizes) {
      const g = cabinGeometry({ width, height });
      const twoDigits = g.landingNumber.height * (2 * STENCIL.width + STENCIL.spacing);
      expect(twoDigits).toBeLessThan(g.door.w);
      expect(g.landingNumber.y + g.landingNumber.height).toBeLessThan(g.door.y + g.door.h * 0.8);
    }
  });
});

describe('test-run board layout', () => {
  it('keeps every cell at least the minimum touch target, stacking floors when they fit', () => {
    const tall = rescueLayout({ x: 0, y: 0, width: 700, height: 900 }, 6, 64, 'move');
    expect(tall.orientation).toBe('vertical');
    const short = rescueLayout({ x: 0, y: 0, width: 900, height: 450 }, 7, 64, 'move');
    expect(short.orientation).toBe('horizontal');
    for (const [w, h, n] of [
      [360, 300, 12],
      [900, 450, 7],
      [1180, 560, 10],
      [700, 900, 6],
    ] as const) {
      for (const kind of ['move', 'fill'] as const) expect(rescueLayout({ x: 0, y: 0, width: w, height: h }, n, 64, kind).cell).toBeGreaterThanOrEqual(64);
    }
  });
});
