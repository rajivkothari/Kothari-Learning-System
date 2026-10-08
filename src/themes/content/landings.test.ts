// Landing identities are content: schema-validated, each floor a distinct place, readable.
import landingsJson from '../../../content/themes/elevator-quest/landings.json';
import { ENGINEER_WORLD as t, contrast } from '../../presentation/design/tokens';
import { FLOOR15 } from '../elevator-quest/content/floor15';
import { LANDINGS, fullIdentity, landingFor, landingLabel, validateLandings, type LandingLook } from '../elevator-quest/content/landings';
import { NUMBER_ZONE, bounds, effectiveColor, landingArt, landingColors } from '../elevator-quest/ui/landingArt';
import { FLOOR_COUNT, panelRows } from '../elevator-quest/ui/layout';

const ctx = { tokens: t, minFloor: FLOOR15.floors.min, maxFloor: FLOOR15.floors.max };
const codes = (raw: unknown) => validateLandings(raw, ctx).issues.map((i) => i.code);
const edit = (f: (c: typeof landingsJson) => void) => {
  const c = structuredClone(landingsJson);
  f(c);
  return c;
};
const restoredAll = { restored: () => true };
const dormantAll = { restored: () => false };
const floors = Array.from({ length: 20 }, (_, i) => i + 1);
const looks = floors.map((f) => landingFor(LANDINGS, f, restoredAll));

const DISTINCT_KEYS: (keyof LandingLook)[] = ['wall', 'light', 'pattern', 'silhouette', 'emblem', 'doorway', 'window', 'signage'];

describe('landing catalog', () => {
  it('is valid: all 20 floors, once each, every name a known swatch, light and shape', () => {
    expect(validateLandings(landingsJson, ctx).issues).toEqual([]);
    expect(LANDINGS.floors.map((f) => f.floor).sort((a, b) => a - b)).toEqual(floors);
  });

  it('rejects unknown names, duplicates, gaps and identical looks', () => {
    expect(codes(edit((c) => (c.floors[0]!.look.wall = 'hotPink')))).toContain('ref.swatch');
    expect(codes(edit((c) => (c.floors[0]!.look.light = 'strobe')))).toContain('ref.light');
    expect(codes(edit((c) => (c.floors[1]!.floor = 1)))).toEqual(expect.arrayContaining(['dup.floor', 'missing.floor']));
    expect(codes(edit((c) => (c.floors[1]!.look = { ...c.floors[0]!.look })))).toContain('dup.identity');
    expect(codes(edit((c) => (c.floors[1]!.name = c.floors[0]!.name)))).toContain('dup.name');
    expect(codes(edit((c) => (c.floors[0]!.look.props = ['pot', 'pot'])))).toContain('dup.prop');
    expect(codes(edit((c) => ((c.floors[0]!.look as Record<string, unknown>).sparkles = true)))).toContain('schema.unrecognized_keys');
  });

  it('every floor is its own place: a unique wall paint, silhouette, emblem and name', () => {
    for (const key of ['wall', 'silhouette', 'emblem'] as const) expect(new Set(looks.map((l) => l.look[key])).size).toBe(20);
    expect(new Set(looks.map((l) => l.name)).size).toBe(20);
    expect(new Set(looks.map((l) => fullIdentity(l.look))).size).toBe(20);
  });

  it('any two floors differ in at least four visible features, so a floor reads before its number', () => {
    for (let a = 0; a < 20; a++)
      for (let b = a + 1; b < 20; b++) {
        const differ = DISTINCT_KEYS.filter((k) => looks[a]!.look[k] !== looks[b]!.look[k]).length;
        expect({ pair: [a + 1, b + 1], differ: differ >= 4 }).toEqual({ pair: [a + 1, b + 1], differ: true });
      }
  });

  it('place colors stay clear of the colors that carry meaning (indicator, help, success, warning, danger)', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));
    const semantic = [t.palette.accentPrimary, t.palette.accentSecondary, t.palette.success, t.palette.warning, t.palette.danger];
    for (const [name, hex] of Object.entries(t.places.swatches)) for (const s of semantic) expect({ name, far: dist(hex, s) > 60 }).toEqual({ name, far: true });
  });

  it('floors outside the catalog get a plain service landing', () => {
    for (const f of [0, 21, 99]) {
      const l = landingFor(LANDINGS, f, restoredAll);
      expect(l).toMatchObject({ fallback: true, name: 'SERVICE LEVEL', state: 'normal' });
      expect(landingArt(l, 0.6).shapes.length).toBeGreaterThan(3);
    }
  });

  it('Floor 15 is dormant until restored, and its sign is unlit while dormant', () => {
    const dormant = landingFor(LANDINGS, 15, dormantAll);
    const restored = landingFor(LANDINGS, 15, restoredAll);
    expect(dormant.state).toBe('dormant');
    expect(restored.state).toBe('restored');
    expect(dormant.look.signLit).toBe(false);
    expect(restored.look.signLit).toBe(true);
    expect(dormant.look.wall).not.toBe(restored.look.wall);
    expect(dormant.look.light).toBe('dim');
    expect(landingArt(dormant, 0.6).spill.strength).toBeLessThan(landingArt(restored, 0.6).spill.strength);
    expect(landingLabel(dormant)).toMatch(/floor 15, Primary power, power off/);
    expect(landingLabel(restored)).toMatch(/power on/);
    // Other floors have no dormant state.
    expect(landingFor(LANDINGS, 7, dormantAll).state).toBe('normal');
  });
});

describe('the tower (D127, D130)', () => {
  it('has twenty floors and no Floor 21: the panel keeps twenty numbered buttons', () => {
    expect(FLOOR15.floors).toEqual({ min: 1, max: 20 });
    expect(FLOOR_COUNT).toBe(20);
    for (const columns of [2, 4, 5]) expect(panelRows(columns).flat().sort((a, b) => a - b)).toEqual(floors);
    expect(Math.max(...LANDINGS.floors.map((f) => f.floor))).toBe(20);
    expect(LANDINGS.floors.some((f) => f.floor > 20)).toBe(false);
    expect(codes(edit((c) => (c.floors[19]!.floor = 21)))).toEqual(expect.arrayContaining(['ref.floor', 'missing.floor']));
  });

  it('is mixed: four themed destinations, the rest grounded service floors', () => {
    const destinations = LANDINGS.floors.filter((f) => f.kind === 'destination').map((f) => [f.floor, f.id, f.name]);
    expect(destinations).toEqual([
      [7, 'platform-heights', 'PLATFORM HEIGHTS'],
      [9, 'wind-ruins', 'WIND RUINS'],
      [13, 'block-builder', 'BLOCK BUILDER'],
      [20, 'rooftop-golf', 'ROOFTOP GOLF'],
    ]);
    expect(landingFor(LANDINGS, 20, restoredAll).name).toBe('ROOFTOP GOLF');
  });

  it('the Machine Room moved to Floor 6, keeps its touchable motor, and remembers its old key', () => {
    const six = LANDINGS.floors.find((f) => f.floor === 6)!;
    expect(six).toMatchObject({ id: 'machine-room', name: 'MACHINE ROOM', kind: 'service' });
    expect(six.look.silhouette).toBe('machine');
    expect(six.explore![0]).toMatchObject({ id: 'motor', discovery: 'eq.discovery.floor-6', legacy: ['eq.discovery.floor-7'] });
    // Floor 7 has its own spot since M8 (the spring), under its own key: the old one stays the motor's.
    expect(LANDINGS.floors.find((f) => f.floor === 7)!.explore!.map((s) => [s.discovery, s.legacy ?? []])).toEqual([['eq.discovery.floor-7.spring', []]]);
  });
});

describe('landing artwork', () => {
  const all = [...looks, landingFor(LANDINGS, 15, dormantAll), landingFor(LANDINGS, 0, restoredAll)];

  it('stays inside the doorway and within a small shape budget (Fire)', () => {
    for (const l of all) {
      const art = landingArt(l, 0.6);
      expect({ floor: l.floor, n: art.shapes.length <= 90 }).toEqual({ floor: l.floor, n: true });
      for (const s of art.shapes) {
        const b = bounds(s);
        expect(b.x).toBeGreaterThanOrEqual(-0.02);
        expect(b.y).toBeGreaterThanOrEqual(-0.02);
        expect(b.x + b.w).toBeLessThanOrEqual(1.02);
        expect(b.y + b.h).toBeLessThanOrEqual(1.02);
      }
    }
  });

  it('the white floor number stays readable over everything drawn behind it', () => {
    const overlaps = (b: { x: number; y: number; w: number; h: number }) => b.x < NUMBER_ZONE.x + NUMBER_ZONE.w && b.x + b.w > NUMBER_ZONE.x && b.y < NUMBER_ZONE.y + NUMBER_ZONE.h && b.y + b.h > NUMBER_ZONE.y;
    for (const l of all) {
      const colors = landingColors(l);
      for (const s of landingArt(l, 0.6).shapes) {
        const b = bounds(s);
        // Lines and thin trims (under 3% of the doorway) cannot sit behind a whole stroke of the number.
        if (s.kind === 'line' || Math.min(b.w, b.h) < 0.03 || !overlaps(b)) continue;
        const ratio = contrast(t.palette.light, effectiveColor(s, colors));
        expect({ floor: l.floor, role: s.role, readable: ratio >= 3 }).toEqual({ floor: l.floor, role: s.role, readable: true });
      }
    }
  });

  it('no light line or trim crosses the floor number (it would read as an extra stroke)', () => {
    const inside = (b: { x: number; y: number; w: number; h: number }) => b.x < NUMBER_ZONE.x + NUMBER_ZONE.w && b.x + b.w > NUMBER_ZONE.x && b.y < NUMBER_ZONE.y + NUMBER_ZONE.h && b.y + b.h > NUMBER_ZONE.y;
    for (const l of all) {
      const colors = landingColors(l);
      for (const s of landingArt(l, 0.6).shapes) {
        const b = bounds(s);
        const thin = s.kind === 'line' || Math.min(b.w, b.h) < 0.03;
        if (!thin || !inside(b)) continue;
        const ratio = contrast(t.palette.light, effectiveColor(s, colors));
        expect({ floor: l.floor, role: s.role, kind: s.kind, clear: ratio >= 3 }).toEqual({ floor: l.floor, role: s.role, kind: s.kind, clear: true });
      }
    }
  });

  it('a lit sign is readable; an unlit one is clearly dimmer', () => {
    for (const l of looks) {
      const c = landingColors(l);
      expect({ floor: l.floor, ok: contrast(c.signInk, c.signPlate) >= 4.5 }).toEqual({ floor: l.floor, ok: true });
    }
    const off = landingColors(landingFor(LANDINGS, 15, dormantAll));
    const on = landingColors(landingFor(LANDINGS, 15, restoredAll));
    expect(contrast(off.signInk, off.signPlate)).toBeLessThan(contrast(on.signInk, on.signPlate));
  });
});
