// Pure visual logic for Floor 15: button states, Lifty poses, cabin geometry.
import { STENCIL } from '../../../presentation/design/stencilDigits';
import { ENGINEER_WORLD as t } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';
import { buttonLook } from './buttonLook';
import { cabinGeometry } from './cabinGeometry';
import { LIFTY_A11Y, liftyPose } from './liftyPose';
import { rescueLayout } from './rescueLayout';
import { CRATE, CRATE_GAP, cargoBoxFor, cargoLayout } from './cargoLayout';
import { conceptGeometry, quadBounds, standingLifty } from './conceptGeometry';
import { floorLook, reservedLandingColors } from './floorLooks';
import { MIN_BUTTON, computeLayout } from './layout';
import { panelGeometry } from './panelGeometry';

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
  it('always sits inside the cabin view, never over Lifty or the panel', () => {
    for (const [w, h] of [[375, 820], [320, 768], [504, 820], [960, 600], [600, 960], [820, 1180], [1180, 820], [1366, 1024]] as const) {
      const { cabin } = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      const b = cargoBoxFor(cabin);
      expect(b.y + b.height).toBeLessThanOrEqual(cabin.y + cabin.height);
      expect(b.x + b.width).toBeLessThanOrEqual(cabin.x + cabin.width);
      expect(b.y).toBeGreaterThanOrEqual(cabin.y);
    }
  });
});

// ---------- Concept D visual pass ----------

describe('concept cabin geometry', () => {
  const sizes = [
    [420, 300],
    [560, 420],
    [700, 520],
    [960, 600],
    [744, 520],
    [1180, 700],
    [380, 330],
    [820, 480],
  ] as const;
  const inside = (r: { x: number; y: number; w: number; h: number }, width: number, height: number) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= width + 0.5 && r.y + r.h <= height + 0.5;

  it('keeps the gameplay plane inside the cabin, the indicator above the doors on the centre line', () => {
    for (const [width, height] of sizes) {
      const g = conceptGeometry({ width, height });
      for (const r of [g.back, g.header, g.indicator, g.frame, g.door, g.threshold, ...g.panels]) expect(inside(r, width, height)).toBe(true);
      for (const q of [g.ceiling, g.floor, g.leftWall, g.rightWall, ...g.ceilingLights, ...g.handrails, ...g.sconces.map((s) => s.body)]) expect(inside(quadBounds(q), width, height)).toBe(true);
      expect(g.indicator.y + g.indicator.h).toBeLessThan(g.frame.y);
      expect(g.indicator.x + g.indicator.w / 2).toBeCloseTo(width / 2);
      expect(g.door.x + g.door.w / 2).toBeCloseTo(width / 2);
      expect(g.door.y + g.door.h).toBeLessThanOrEqual(g.floorY + 0.5);
      expect(g.door.h).toBeGreaterThan(40);
    }
  });

  it('everything converges on one vanishing point behind the doors', () => {
    for (const [width, height] of sizes) {
      const g = conceptGeometry({ width, height });
      expect(g.vp.x).toBeCloseTo(width / 2);
      expect(g.vp.y).toBeGreaterThan(g.door.y);
      expect(g.vp.y).toBeLessThan(g.door.y + g.door.h);
      // Side walls narrow toward the back plane: near edge taller than the far edge.
      expect(g.leftWall.d.y - g.leftWall.a.y).toBeGreaterThan(g.leftWall.c.y - g.leftWall.b.y);
      expect(g.rightWall.c.y - g.rightWall.b.y).toBeGreaterThan(g.rightWall.d.y - g.rightWall.a.y);
    }
  });

  it('back-wall panels and the companion zone never overlap the door frame', () => {
    for (const [width, height] of sizes) {
      const g = conceptGeometry({ width, height });
      for (const p of g.panels) expect(p.x + p.w <= g.frame.x || p.x >= g.frame.x + g.frame.w).toBe(true);
      expect(g.liftyZone.x + g.liftyZone.w).toBeLessThanOrEqual(g.frame.x);
      expect(g.liftyZone.y).toBeGreaterThan(g.indicator.y + g.indicator.h);
    }
  });

  it('the painted floor number fits in the doorway', () => {
    for (const [width, height] of sizes) {
      const g = conceptGeometry({ width, height });
      const twoDigits = g.landingNumber.height * (2 * STENCIL.width + STENCIL.spacing);
      expect(twoDigits).toBeLessThan(g.door.w);
      expect(g.landingNumber.y + g.landingNumber.height).toBeLessThan(g.door.y + g.door.h * 0.66);
    }
  });

  it('stands Lifty in the front-left foreground at a readable size, clear of the doors, on every landscape window', () => {
    for (const [w, h] of [[960, 600], [1180, 820], [1133, 744], [1366, 1024], [590, 820]] as const) {
      const l = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      if (l.orientation !== 'landscape') continue;
      const g = conceptGeometry(l.cabin);
      const s = standingLifty(l.cabin, g);
      expect(s.size).toBeGreaterThanOrEqual(72);
      expect(s.x - l.cabin.x + s.size).toBeLessThanOrEqual(g.frame.x);
      // Feet reach the strip (linking cabin and words), head stays inside the cabin.
      expect(s.y + s.size).toBeGreaterThan(l.cabin.y + l.cabin.height);
      expect(s.y).toBeGreaterThan(l.cabin.y + l.cabin.height * 0.3);
    }
  });
});

describe('floor looks', () => {
  it('gives every floor a look, with the repair deck only on the repair floor', () => {
    const decks = [];
    for (let f = 1; f <= 20; f++) {
      const look = floorLook(f, 15);
      expect(look.floor).toBe(f);
      if (look.landing === 'repairDeck') decks.push(f);
    }
    expect(decks).toEqual([15]);
  });

  it('cycles distinct paints so neighbouring floors read as different places', () => {
    const paints = [1, 2, 3, 4, 5].map((f) => floorLook(f, 15).paint);
    expect(new Set(paints).size).toBe(5);
    expect(floorLook(6, 15).paint).toBe(floorLook(1, 15).paint);
  });

  it('never paints a landing in a color that carries meaning (amber, cyan, warning, danger)', () => {
    const reserved = reservedLandingColors(t);
    for (let f = 1; f <= 20; f++) {
      const look = floorLook(f, 15);
      expect(reserved).not.toContain(look.paint);
      expect(reserved).not.toContain(look.accent);
    }
  });
});

describe('panel geometry', () => {
  it('mirrors the flex layout: every cell at least the touch target, rows in order, inside the plate', () => {
    for (const [w, h] of [[960, 600], [1180, 820], [820, 1180], [375, 820], [1366, 1024]] as const) {
      const l = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      const pg = panelGeometry({ width: l.panel.width, height: l.panel.height }, l.button, l.gap, l.columns, l.rows);
      expect(pg.floors).toHaveLength(20);
      for (const c of [...pg.floors, ...pg.doors]) {
        expect(c.w).toBeGreaterThanOrEqual(MIN_BUTTON);
        expect(c.h).toBeGreaterThanOrEqual(MIN_BUTTON);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(l.panel.width + 0.5);
      }
      expect(pg.floors[l.columns]!.y).toBeGreaterThan(pg.floors[0]!.y);
      expect(pg.doors[0].y).toBeGreaterThan(pg.floors[19]!.y);
      expect(pg.doors[1].x).toBeGreaterThan(pg.doors[0].x);
    }
  });
});
