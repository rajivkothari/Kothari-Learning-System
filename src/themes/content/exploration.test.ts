// Free-ride exploration content: which places can be touched, how they react, what the log shows.
import landingsJson from '../../../content/themes/elevator-quest/landings.json';
import { ENGINEER_WORLD as t } from '../../presentation/design/tokens';
import { FLOOR15 } from '../elevator-quest/content/floor15';
import { HERO_SILHOUETTES, LANDINGS, engineerLog, explorableFloors, exploreSpots, landingFor, validateLandings } from '../elevator-quest/content/landings';
import { REACTION_MS, bounds, heroFor, heroPose } from '../elevator-quest/ui/landingArt';

const ctx = { tokens: t, minFloor: FLOOR15.floors.min, maxFloor: FLOOR15.floors.max };
const codes = (raw: unknown) => validateLandings(raw, ctx).issues.map((i) => i.code);
const edit = (f: (c: typeof landingsJson) => void) => {
  const c = structuredClone(landingsJson);
  f(c);
  return c;
};
const restored = { restored: () => true };
const dormant = { restored: () => false };

describe('exploration content', () => {
  it('five contrasting floors can be explored, each with one touchable hero and a discovery key', () => {
    expect(explorableFloors(LANDINGS)).toEqual([5, 7, 15, 17, 18]);
    for (const floor of explorableFloors(LANDINGS)) {
      const spots = exploreSpots(LANDINGS, floor);
      expect(spots.length).toBeGreaterThan(0);
      expect(heroFor(landingFor(LANDINGS, floor, restored), 0.8)).not.toBeNull();
      for (const s of spots) expect(s.discovery.startsWith(`eq.discovery.floor-${floor}`)).toBe(true);
    }
    const keys = explorableFloors(LANDINGS).flatMap((f) => exploreSpots(LANDINGS, f).map((s) => s.discovery));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects a spot on a landing with nothing to touch, a key for another floor, and a repeated key', () => {
    expect(codes(edit((c) => ((c.floors[0] as Record<string, unknown>).explore = [{ id: 'x', target: 'hero', discovery: 'eq.discovery.floor-1', object: 'front desk', line: 'A line long enough here.', fact: 'A fact long enough here.' }])))).toContain('ref.hero');
    expect(codes(edit((c) => (c.floors.find((f) => f.floor === 7)!.explore![0]!.discovery = 'eq.discovery.floor-8')))).toContain('ref.discovery');
    expect(
      codes(
        edit((c) => {
          const seven = c.floors.find((f) => f.floor === 7)!;
          seven.explore!.push({ ...seven.explore![0]!, id: 'again' });
        }),
      ),
    ).toContain('dup.discovery');
  });

  it('every hero silhouette has a hero part, and only those do', () => {
    for (const f of LANDINGS.floors) {
      const hero = heroFor(landingFor(LANDINGS, f.floor, restored), 0.8);
      expect({ floor: f.floor, hero: hero !== null }).toEqual({ floor: f.floor, hero: (HERO_SILHOUETTES as readonly string[]).includes(f.look.silhouette) });
    }
  });

  it('hero parts and touch areas stay inside the doorway; touch areas are generous', () => {
    for (const floor of explorableFloors(LANDINGS)) {
      const hero = heroFor(landingFor(LANDINGS, floor, restored), 0.8)!;
      for (const p of hero.parts) for (const s of p.shapes) {
        const b = bounds(s);
        expect(b.x).toBeGreaterThanOrEqual(-0.01);
        expect(b.y).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.w).toBeLessThanOrEqual(1.01);
        expect(b.y + b.h).toBeLessThanOrEqual(1.01);
      }
      // At least a fifth of the doorway's width and a quarter of its height, before the UI's 64 pt minimum.
      expect(hero.hit.w).toBeGreaterThanOrEqual(0.2);
      expect(hero.hit.h).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('reactions are short, return to rest, never flash, and hold still under reduced motion', () => {
    expect(REACTION_MS.normal).toBeGreaterThanOrEqual(500);
    expect(REACTION_MS.normal).toBeLessThanOrEqual(2000);
    for (const floor of explorableFloors(LANDINGS)) {
      for (const p of heroFor(landingFor(LANDINGS, floor, restored), 0.8)!.parts) {
        const rest = heroPose(p, 0, false);
        const end = heroPose(p, 1, false);
        expect(end.dx).toBeCloseTo(rest.dx);
        expect(end.opacity).toBeCloseTo(rest.opacity);
        // Spins end a whole number of turns round, so the part looks as it did.
        if (p.motion === 'spin') expect((end.rotate / (Math.PI * 2)) % 1).toBeCloseTo(0);
        else expect(end.rotate).toBeCloseTo(rest.rotate);
        // Opacity never drops below rest (no blink), and changes at most twice per reaction (< 3 Hz).
        let peaks = 0;
        let prev = rest.opacity;
        let rising = false;
        for (let i = 1; i <= 100; i++) {
          const o = heroPose(p, i / 100, false).opacity;
          expect(o).toBeGreaterThanOrEqual(Math.min(rest.opacity, p.base) - 1e-9);
          if (o < prev && rising) peaks++;
          rising = o > prev;
          prev = o;
        }
        expect(peaks / (REACTION_MS.normal / 1000)).toBeLessThan(3);
        const still = heroPose(p, 0.5, true);
        expect([still.rotate, still.dx]).toEqual([0, 0]);
      }
    }
  });

  it('child-facing exploration words use no internal vocabulary', () => {
    const words = explorableFloors(LANDINGS).flatMap((f) => exploreSpots(LANDINGS, f).flatMap((s) => [s.line, s.fact, s.object]));
    for (const w of words) expect(w).not.toMatch(/practice|stretch|mastery|encounter|misconception|evidence|xp|points|score|eq\\./i);
  });
});

describe('Engineer Log', () => {
  it('lists the explorable places; an undiscovered place never shows its fact', () => {
    const empty = engineerLog(LANDINGS, [], dormant);
    expect(empty.map((r) => r.floor)).toEqual([5, 7, 15, 17, 18]);
    for (const r of empty) expect({ floor: r.floor, inspected: r.inspected, fact: r.fact }).toEqual({ floor: r.floor, inspected: false, fact: null });
    expect(empty.find((r) => r.floor === 15)!.system).toBe('unpowered');
  });

  it('shows what was found, and Floor 15 powered once restored', () => {
    const rows = engineerLog(LANDINGS, ['eq.discovery.floor-7', 'eq.discovery.floor-15', 'eq.tip.door-close'], restored);
    const seven = rows.find((r) => r.floor === 7)!;
    expect(seven).toMatchObject({ name: 'MACHINE ROOM', inspected: true, emblem: 'gear', system: null });
    expect(seven.fact).toMatch(/sheave/);
    expect(rows.find((r) => r.floor === 15)).toMatchObject({ inspected: true, system: 'powered' });
    expect(rows.filter((r) => r.inspected).map((r) => r.floor)).toEqual([7, 15]);
  });

  it('has no score: rows carry no numbers beyond the floor', () => {
    for (const r of engineerLog(LANDINGS, ['eq.discovery.floor-5'], restored)) expect(Object.keys(r).sort()).toEqual(['emblem', 'fact', 'floor', 'inspected', 'name', 'system']);
  });
});
