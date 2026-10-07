// Pure visual logic for Floor 15: button states, Lifty poses, cabin geometry.
import { STENCIL } from '../../../presentation/design/stencilDigits';
import { ENGINEER_WORLD as t } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';
import { SWEEP_MS, buttonLook, callBreath, sweepLamp } from './buttonLook';
import { cabinGeometry } from './cabinGeometry';
import { LIFTY_A11Y, liftyPose } from './liftyPose';
import { rescueLayout } from './rescueLayout';
import { CRATE, CRATE_GAP, cargoLayout } from './cargoLayout';
import { liftyPlacement, sceneBoxes } from './liftyPlacement';
import { computeLayout } from './layout';
import { NORMAL_TIMING, createElevator, reduce } from '../sim/elevator';
import { tripMotion } from './tripMotion';

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

describe('cargo bay layout', () => {
  const boxes = [
    [240, 160],
    [480, 180],
    [700, 420],
    [1100, 600],
    [351, 300],
  ] as const;

  it('never shrinks a crate below the 64 pt touch target, whatever the window and load', () => {
    for (const [width, height] of boxes)
      for (const onDock of [0, 3, 9, 13])
        for (const inCar of [2, 6, 15])
          for (const meter of [false, true]) {
            const l = cargoLayout({ width, height }, { onDock, inCar }, meter);
            expect(l.crate).toBeGreaterThanOrEqual(64);
            for (const side of [l.dock, l.car]) {
              expect(side.perRow).toBeGreaterThanOrEqual(1);
              // A row of crates fits inside its side.
              expect(side.perRow * (CRATE + CRATE_GAP) - CRATE_GAP).toBeLessThanOrEqual(Math.max(CRATE, side.width - 16) + 0.5);
            }
          }
  });

  it('scrolls a side only when its crates do not fit, instead of shrinking them', () => {
    const roomy = cargoLayout({ width: 1100, height: 600 }, { onDock: 9, inCar: 6 }, false);
    expect(roomy.dock.scroll).toBe(false);
    expect(roomy.car.scroll).toBe(false);
    const narrow = cargoLayout({ width: 480, height: 180 }, { onDock: 13, inCar: 15 }, false);
    expect(narrow.dock.scroll).toBe(true);
    expect(narrow.car.scroll).toBe(true);
    expect(narrow.crate).toBe(64);
  });
});

describe('cargo bay placement', () => {
  it('always sits inside the cabin view, below Lifty, never over the panel, and shows at least one row of crates', () => {
    for (const [w, h] of [[375, 820], [320, 768], [504, 820], [960, 600], [600, 960], [820, 1180], [1180, 820], [1366, 1024]] as const) {
      const layout = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      const { cabin } = layout;
      const b = sceneBoxes(layout, 'status', 'cargo').cargo;
      const band = liftyPlacement(layout, 'cargo');
      expect(b.y + b.height).toBeLessThanOrEqual(cabin.y + cabin.height);
      expect(b.x + b.width).toBeLessThanOrEqual(cabin.x + cabin.width);
      expect(b.y).toBeGreaterThanOrEqual(Math.max(band.figure.y + band.figure.height, band.bubble.y + band.bubble.height));
      // Split View 1/3 and Slide Over stay cramped (one partial row that scrolls), as before.
      if (cabin.width >= 400) expect({ size: [w, h], oneRow: cargoLayout(b, { onDock: 6, inCar: 6 }, false).dock.viewportHeight >= CRATE }).toEqual({ size: [w, h], oneRow: true });
      else expect(b.height).toBeGreaterThanOrEqual(80);
    }
  });
});

describe('travel animation runs only while travelling (audit: frame callbacks)', () => {
  const timing = { ...NORMAL_TIMING };
  it('is inactive at rest, with doors moving, and while departing; active while travelling', () => {
    let s = createElevator({ minFloor: 1, maxFloor: 20, timing }, 3, 0, 'open');
    const seen: [string, boolean][] = [[s.phase, tripMotion(s, timing).moving]];
    s = reduce({ minFloor: 1, maxFloor: 20, timing }, s, { type: 'press', floor: 9, at: 1 }).state;
    for (let at = 1; at < 30_000; at += 50) {
      s = reduce({ minFloor: 1, maxFloor: 20, timing }, s, { type: 'tick', at }).state;
      seen.push([s.phase, tripMotion(s, timing).moving]);
    }
    for (const [phase, moving] of seen) expect(moving).toBe(phase === 'traveling' || phase === 'decelerating');
    expect(seen.some(([, m]) => m)).toBe(true);
    expect(seen.at(-1)![1]).toBe(false);
  });
});

describe('hall calls, service dots and the panel sweep on the buttons', () => {
  it('a hall call is its own state, distinct from selected, clue and current, and not by color alone', () => {
    const call = buttonLook({ ...flags, call: true }, t);
    expect(call.state).toBe('call');
    expect(call.callRing).toBe(t.state.call.ring);
    expect(call.lamp).toBe(0); // not lit: pressing it is what lights it
    for (const other of [buttonLook({ ...flags, lit: true }, t), buttonLook({ ...flags, clue: true }, t), buttonLook({ ...flags, current: true }, t)]) {
      expect(other.state).not.toBe('call');
      expect(other.callRing).toBeNull();
    }
    expect(call.callRing).not.toBe(t.state.clue.ring);
    expect(call.callRing).not.toBe(t.state.selected.ring);
    // Once pressed, the call is a lit destination like any other.
    expect(buttonLook({ ...flags, call: true, lit: true }, t).state).toBe('selected');
    expect(buttonLook({ ...flags, call: true, disabled: true }, t)).toMatchObject({ state: 'disabled', callRing: null });
  });

  it('the call ring breathes slowly (never a flash) and is still under reduced motion', () => {
    expect(t.state.call.pulseHz).toBeLessThan(3);
    const samples = Array.from({ length: 400 }, (_, i) => callBreath(i * 10, t.state.call.pulseHz, false));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(new Set(Array.from({ length: 50 }, (_, i) => callBreath(i * 37, t.state.call.pulseHz, true)))).toEqual(new Set([1]));
  });

  it('an inspected floor gets a quiet service dot, never a ring or a lamp', () => {
    const dot = buttonLook({ ...flags, serviced: true }, t);
    expect(dot).toMatchObject({ state: 'idle', serviceDot: t.state.service.dot, lamp: 0, clueRing: null, callRing: null });
    expect(buttonLook(flags, t).serviceDot).toBeNull();
  });

  it('the panel sweep lights each lamp once, bottom to top, then fades all together', () => {
    const steps = Array.from({ length: 101 }, (_, i) => i / 100);
    for (const pos of [0, 0.25, 0.5, 1]) {
      const curve = steps.map((s) => sweepLamp(s, pos, false));
      // One rise and one fall: no lamp turns off and on again.
      let changes = 0;
      for (let i = 2; i < curve.length; i++) if (Math.sign(curve[i]! - curve[i - 1]!) !== Math.sign(curve[i - 1]! - curve[i - 2]!) && curve[i]! !== curve[i - 1]!) changes++;
      expect(changes).toBeLessThanOrEqual(2);
      expect(curve[0]).toBe(0);
      expect(curve.at(-1)).toBe(0);
    }
    const firstOn = (pos: number) => steps.find((s) => sweepLamp(s, pos, false) > 0.4)!;
    expect(firstOn(0)).toBeLessThan(firstOn(0.5));
    expect(firstOn(0.5)).toBeLessThan(firstOn(1));
    // Reduced motion: every lamp together, no travelling sweep.
    expect(sweepLamp(0.3, 0, true)).toBe(sweepLamp(0.3, 1, true));
    expect(SWEEP_MS.normal / 1000).toBeGreaterThan(1); // one slow sweep, under 1 Hz
  });
});
