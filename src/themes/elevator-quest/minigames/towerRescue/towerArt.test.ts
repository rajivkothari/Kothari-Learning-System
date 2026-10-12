// Tower Rescue's art placement (D195): which pieces production draws, which housing a bay takes, and
// that the moving pieces stay where the art says they belong (the car in its channel and under the
// gear, the rotor on its pivot, the robot inside the car, the breaker on its hinge).
import { EMPTY_ART, type ArtEntry } from '../../art/manifest';
import { PRODUCTION_ART } from '../../art/production';
import { CAR_ROOF, TOWER_ART_ROLES, bayPlacement, carArt, carPlacement, contain, cover, gearFloor, housing, robotPlacement, rotorPlacement, towerArt } from './towerArt';

const art = towerArt(PRODUCTION_ART);
const entry = (role: (typeof TOWER_ART_ROLES)[number]): ArtEntry => art[role]!.entry;
const close = (a: number, b: number, tol = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('Tower Rescue art (D195)', () => {
  it('production draws all 19 approved pieces; no art set draws none; a failed image falls back alone', () => {
    expect(Object.keys(art).sort()).toEqual([...TOWER_ART_ROLES].sort());
    expect(towerArt(EMPTY_ART)).toEqual({});
    const failed = towerArt(PRODUCTION_ART, new Set(['minigame.towerrescue.door-left']));
    expect(failed['door-left']).toBeUndefined();
    expect(failed.car).toBeDefined();
    // The car never draws with a vector door beside an illustrated one.
    expect(carArt(failed)).toBeNull();
    expect(carArt(art)).not.toBeNull();
  });

  it('a tall bay takes the tall housing, a short one the compact housing; no rotor, no housing', () => {
    expect(housing(art, 'lift', { w: 110, h: 340 })!.compact).toBe(false);
    expect(housing(art, 'lift', { w: 145, h: 150 })!.compact).toBe(true);
    expect(housing(art, 'fans', { w: 110, h: 340 })!.compact).toBe(false);
    expect(housing(art, 'fans', { w: 200, h: 180 })!.compact).toBe(true);
    expect(housing(art, 'lift', { w: 0, h: 0 })).toBeNull();
    const { gear: _gear, ...noGear } = art;
    expect(housing(noGear, 'lift', { w: 110, h: 340 })).toBeNull();
  });

  it('a housing fits whole on the bay floor, never stretched; the wall covers its box', () => {
    for (const box of [
      { w: 110, h: 340 },
      { w: 145, h: 150 },
      { w: 300, h: 200 },
    ]) {
      const h = housing(art, 'lift', box)!;
      expect(h.rect.w).toBeLessThanOrEqual(box.w + 0.01);
      expect(h.rect.h).toBeLessThanOrEqual(box.h + 0.01);
      close(h.rect.y + h.rect.h, box.h, 0.01);
      close(h.rect.w / h.rect.h, h.piece.entry.width / h.piece.entry.height, 0.001);
    }
    const r = contain(entry('cell'), { w: 100, h: 50 });
    expect([r.w, r.h, r.x, r.y]).toEqual([50, 50, 25, 0]);
    const wall = cover(entry('room'), { w: 440, h: 300 });
    expect(wall.w).toBeGreaterThanOrEqual(440);
    expect(wall.h).toBeGreaterThanOrEqual(300);
  });

  it('the car rests on its channel floor, centred, and its roof stops under the gear at the top', () => {
    for (const box of [
      { w: 111, h: 350 },
      { w: 100, h: 150 },
      { w: 140, h: 470 },
      { w: 200, h: 230 },
    ]) {
      const h = housing(art, 'lift', box)!;
      const ceiling = gearFloor(h, entry('gear'));
      const cp = carPlacement(h, entry('car'), ceiling);
      const car = entry('car');
      close(cp.y + car.anchor!.y * cp.size, cp.channel.y + cp.channel.h);
      close(cp.x + cp.size / 2, cp.channel.x + cp.channel.w / 2, 1);
      // At the top of the rise: the roof is at the gear's floor, never above it.
      close(cp.y - cp.travel + CAR_ROOF * cp.size, ceiling);
      expect(cp.travel).toBeGreaterThan(0);
      expect(cp.size).toBeLessThanOrEqual(h.rect.w);
    }
  });

  it('the robot stands on the car floor and stays inside the doorway at its full step-out scale', () => {
    const cp = carPlacement(housing(art, 'lift', { w: 111, h: 350 })!, entry('car'), 40);
    const robot = entry('robot-ready');
    const r = robotPlacement(cp.doorway, robot, 1.2);
    close(r.y + robot.anchor!.y * r.h, cp.doorway.y + cp.doorway.h);
    // Scaled 1.2 about the feet, the figure (its opaque height, 357 of 384 px) still fits the opening.
    expect((357 / 384) * r.h * 1.2).toBeLessThanOrEqual(cp.doorway.h);
  });

  it('rotors turn on their pivots: the gear on the motor mount, the fan centred in its opening', () => {
    for (const kind of ['lift', 'fans'] as const) {
      for (const box of [
        { w: 110, h: 340 },
        { w: 160, h: 170 },
      ]) {
        const h = housing(art, kind, box)!;
        const rotor = entry(kind === 'lift' ? 'gear' : 'fan');
        const r = rotorPlacement(h, rotor, kind);
        const pivot = { x: h.rect.x + h.piece.entry.anchor!.x * h.rect.w, y: h.rect.y + h.piece.entry.anchor!.y * h.rect.h };
        close(r.x + rotor.anchor!.x * r.w, pivot.x, 0.01);
        close(r.y + rotor.anchor!.y * r.h, pivot.y, 0.01);
        if (kind === 'fans') {
          // The blades reach just inside the opening.
          const opening = Math.min(h.piece.entry.stage!.w * h.rect.w, h.piece.entry.stage!.h * h.rect.h);
          expect(r.w * 0.72).toBeLessThanOrEqual(opening);
          expect(r.w * 0.72).toBeGreaterThan(opening * 0.9);
        }
      }
    }
  });

  it('the bay: clamps at the socket sides, the breaker on its hinge, the seated cell over the socket', () => {
    const bp = bayPlacement(92, entry('bay'), entry('clamp-left'), entry('breaker'), 0.72);
    const hinge = { x: 92 * entry('bay').anchor!.x, y: 92 * entry('bay').anchor!.y };
    close(bp.breaker.x + entry('breaker').anchor!.x * bp.breaker.w, hinge.x, 0.01);
    close(bp.breaker.y + entry('breaker').anchor!.y * bp.breaker.h, hinge.y, 0.01);
    expect(bp.clampLeft.x).toBeLessThan(bp.socket.x);
    expect(bp.clampLeft.x + bp.clampLeft.w).toBeGreaterThan(bp.socket.x);
    expect(bp.clampRight.x).toBeLessThan(bp.socket.x + bp.socket.w);
    expect(bp.clampRight.x + bp.clampRight.w).toBeGreaterThan(bp.socket.x + bp.socket.w);
    // The clamps are wide enough to read as clamps (Codex: the pistons vanish under about 8 pt).
    expect(bp.clampLeft.w).toBeGreaterThanOrEqual(8);
    close(bp.cell.x + bp.cell.w / 2, 46, 0.01);
    expect(bp.cell.w).toBeGreaterThan(bp.socket.w);
  });
});
