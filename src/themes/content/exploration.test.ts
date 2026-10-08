// Exploration content: which places can be touched, how they react, what the log shows. Landing
// objects and spots are data (content/themes/elevator-quest/landings.json); these tests hold the
// shape of that data, the vector fallback, and the reactions' timing.
import landingsJson from '../../../content/themes/elevator-quest/landings.json';
import { ENGINEER_WORLD as t } from '../../presentation/design/tokens';
import { LANDING_CANVAS } from '../elevator-quest/art/manifest';
import { FLOOR15 } from '../elevator-quest/content/floor15';
import {
  CANVAS_SAFE,
  HERO_SILHOUETTES,
  LANDINGS,
  OPEN_MS,
  PUTT_MS,
  REACTIONS,
  boxedFloors,
  engineerLog,
  explorableFloors,
  exploreSpots,
  landingFor,
  landingObjects,
  reactionMs,
  spotDiscovered,
  spotLabel,
  spotProps,
  validateLandings,
} from '../elevator-quest/content/landings';
import { REACTION_MS, bounds, heroFor, heroPose } from '../elevator-quest/ui/landingArt';

const ctx = { tokens: t, minFloor: FLOOR15.floors.min, maxFloor: FLOOR15.floors.max };
const codes = (raw: unknown) => validateLandings(raw, ctx).issues.map((i) => i.code);
type Raw = typeof landingsJson;
type RawFloor = Raw['floors'][number] & { objects?: Record<string, unknown>[]; explore?: Record<string, unknown>[] };
const edit = (f: (c: Raw, floor: (n: number) => RawFloor) => void) => {
  const c = structuredClone(landingsJson);
  f(c, (n) => c.floors.find((x) => x.floor === n)! as RawFloor);
  return c;
};
const restored = { restored: () => true };
const dormant = { restored: () => false };

/** The floors with something to touch (M8): about twelve interactions, one memorable thing a floor. */
const EXPLORE_FLOORS = [1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20];

/** The canonical landing objects (shared with the art and reading items; docs: the M8 plan). */
const CANONICAL: Record<number, string[]> = {
  1: ['gear', 'plant', 'bench'],
  2: ['toolbox', 'drill', 'workbench'],
  5: ['fan-west', 'fan-east', 'switch'],
  6: ['gear-big', 'gear-small', 'motor'],
  7: ['platform-orange', 'platform-teal', 'platform-yellow', 'spring'],
  9: ['windmill', 'banner', 'bridge'],
  11: ['radio', 'printer', 'dish'],
  13: ['crane', 'blocks', 'cart'],
  15: ['core', 'gauge-left', 'gauge-right'],
  17: ['book', 'drawers', 'map'],
  18: ['telescope', 'chart', 'crank'],
  20: ['ball', 'hole', 'windmill'],
};

describe('landing objects and exploration spots', () => {
  it('the shipped catalog validates', () => {
    expect(validateLandings(landingsJson, ctx).issues).toEqual([]);
  });

  it('twelve floors can be explored, one to three things each, every one with its own discovery key', () => {
    expect(explorableFloors(LANDINGS)).toEqual(EXPLORE_FLOORS);
    let spots = 0;
    for (const floor of EXPLORE_FLOORS) {
      const here = exploreSpots(LANDINGS, floor);
      expect(here.length).toBeGreaterThanOrEqual(1);
      expect(here.length).toBeLessThanOrEqual(3);
      spots += here.length;
      for (const s of here) expect(s.discovery === `eq.discovery.floor-${floor}` || s.discovery.startsWith(`eq.discovery.floor-${floor}.`)).toBe(true);
    }
    expect(spots).toBeGreaterThanOrEqual(12);
    expect(spots).toBeLessThanOrEqual(15);
    const keys = LANDINGS.floors.flatMap((f) => (f.explore ?? []).flatMap((s) => [s.discovery, ...(s.legacy ?? [])]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every floor carries its canonical objects, under the shared ids', () => {
    for (const [floor, ids] of Object.entries(CANONICAL)) {
      const have = landingObjects(LANDINGS, Number(floor)).map((o) => o.id);
      for (const id of ids) expect({ floor, id, present: have.includes(id) }).toEqual({ floor, id, present: true });
    }
  });

  it('the landing safe core here is the art pipeline\'s', () => {
    expect(CANVAS_SAFE).toEqual(LANDING_CANVAS.safe);
  });

  it('keeps the Machine Room\'s old key, and Floor 7\'s new spot never reuses it (D130)', () => {
    const motor = exploreSpots(LANDINGS, 6).find((s) => s.id === 'motor')!;
    expect(motor.legacy).toEqual(['eq.discovery.floor-7']);
    expect(exploreSpots(LANDINGS, 7).map((s) => s.discovery)).not.toContain('eq.discovery.floor-7');
    // The spots that existed before M8 keep their ids and keys (saves and tests point at them).
    expect(Object.fromEntries([5, 6, 15, 17, 18].map((f) => [f, exploreSpots(LANDINGS, f)[0]!.id]))).toEqual({ 5: 'fan', 6: 'motor', 15: 'core', 17: 'plans', 18: 'telescope' });
    expect([5, 6, 15, 17, 18].map((f) => exploreSpots(LANDINGS, f)[0]!.discovery)).toEqual([5, 6, 15, 17, 18].map((f) => `eq.discovery.floor-${f}`));
  });

  it('refuses a spot on a thing that is not there, a place missing on the vector landing, and a repeated or foreign key', () => {
    expect(codes(edit((_, f) => (f(6).explore![0]!.target = 'nothing')))).toContain('ref.target');
    expect(codes(edit((_, f) => delete f(20).objects!.find((o) => o.id === 'ball')!.vector))).toContain('missing.vector');
    expect(codes(edit((_, f) => (f(6).explore![0]!.discovery = 'eq.discovery.floor-8')))).toContain('ref.discovery');
    // Floor 1's keys are floor-1 or floor-1.<x>, never floor-17.
    expect(codes(edit((_, f) => (f(1).explore![0]!.discovery = 'eq.discovery.floor-17.x')))).toContain('ref.discovery');
    expect(codes(edit((_, f) => f(6).explore!.push({ ...f(6).explore![0]!, id: 'again' })))).toEqual(expect.arrayContaining(['dup.discovery']));
    expect(codes(edit((_, f) => f(17).explore!.push({ ...f(17).explore![1]!, discovery: 'eq.discovery.floor-17.other' })))).toContain('dup.spot');
    // A legacy key is still a key: it cannot also be another spot's discovery.
    expect(codes(edit((_, f) => (f(5).explore![0]!.legacy = ['eq.discovery.floor-7'])))).toContain('dup.discovery');
    // A vector hero needs a silhouette with a hero part (Floor 3's pipes have none).
    expect(codes(edit((_, f) => (f(3).objects = [{ id: 'pipe', name: 'big pipe', vector: 'hero' }])))).toContain('ref.hero');
    expect(codes(edit((_, f) => f(1).objects!.push({ id: 'gear', name: 'second gear' })))).toContain('dup.object');
  });

  it('keeps touchable things inside the safe core, and turning discs and hoists there too', () => {
    expect(codes(edit((_, f) => (f(1).objects![0]!.box = { x: 0.05, y: 0.3, w: 0.1, h: 0.1 })))).toContain('ref.safe');
    expect(codes(edit((_, f) => (f(1).explore![0]!.disc = { x: 0.2, y: 0.4, r: 0.1 })))).toContain('ref.safe');
    expect(codes(edit((_, f) => ((f(13).explore![0]!.hoist as { drop: number }).drop = 0.1)))).not.toContain('ref.safe');
    expect(codes(edit((_, f) => ((f(13).explore![0]!.hoist as { load: { y: number } }).load.y = 0.86)))).toContain('ref.safe');
    expect(codes(edit((_, f) => (f(20).explore![0]!.cup = { x: 0.9, y: 0.6 })))).toContain('ref.safe');
    expect(codes(edit((_, f) => (f(1).objects![1]!.box = f(1).objects![0]!.box)))).toContain('ref.hidden');
    for (const f of LANDINGS.floors) for (const o of f.objects ?? []) if (o.box) expect({ floor: f.floor, o: o.id, inside: o.box.x >= 0.16 && o.box.y >= 0.08 && o.box.x + o.box.w <= 0.84 + 1e-9 && o.box.y + o.box.h <= 0.92 + 1e-9 }).toMatchObject({ inside: true });
  });

  it('each reaction carries what it needs, and only that', () => {
    expect(codes(edit((_, f) => delete f(20).explore![0]!.to))).toContain('ref.to');
    expect(codes(edit((_, f) => (f(20).explore![0]!.to = 'ball')))).toContain('ref.to');
    expect(codes(edit((_, f) => (f(7).explore![0]!.to = 'platform-teal')))).toContain('ref.to');
    expect(codes(edit((_, f) => (f(7).explore![0]!.disc = { x: 0.3, y: 0.5, r: 0.05 })))).toContain('ref.disc');
    expect(codes(edit((_, f) => (f(7).explore![0]!.hoist = f(13).explore![0]!.hoist)))).toContain('ref.hoist');
    expect(codes(edit((_, f) => delete f(13).explore![0]!.hoist))).toContain('missing.hoist');
    expect(codes(edit((_, f) => (f(7).explore![0]!.openProp = 'landing.7.lid')))).toContain('ref.open');
    expect(codes(edit((_, f) => (f(9).explore![0]!.prop = 'landing.20.ball')))).toEqual(expect.arrayContaining(['ref.prop', 'dup.prop']));
    expect(codes(edit((_, f) => (f(1).explore![0]!.reaction = 'wobble')))).toContain('schema.invalid_value');
    // A spin's turns are whole (it ends as it began); a card says two or three things.
    expect(codes(edit((_, f) => (f(1).explore![0]!.turns = 0)))).toContain('schema.custom');
    expect(codes(edit((_, f) => ((f(17).explore![1]!.card as { lines: string[] }).lines = ['Only one sentence here.'])))).toContain('schema.too_small');
  });

  it('every spot can be touched on the illustrated landing and on the vector one (no dead spots)', () => {
    for (const f of LANDINGS.floors) {
      const hero = heroFor(landingFor(LANDINGS, f.floor, restored), 0.8);
      for (const s of f.explore ?? []) {
        const o = f.objects!.find((x) => x.id === s.target)!;
        // Vector: its own place, or the hero part's touch area.
        expect({ floor: f.floor, spot: s.id, vector: o.vector === 'hero' ? hero !== null : Boolean(o.vector) }).toEqual({ floor: f.floor, spot: s.id, vector: true });
        // Art: its own box, or (Floor 15's core) the art's hit; boxedFloors tells the art validator which.
        if (!o.box) expect({ floor: f.floor, spot: s.id, usesArtHit: o.vector === 'hero' && !boxedFloors(LANDINGS).includes(f.floor) }).toMatchObject({ usesArtHit: true });
      }
    }
    expect(boxedFloors(LANDINGS)).not.toContain(15);
    expect(spotProps(LANDINGS)).toEqual(expect.arrayContaining(['landing.20.ball', 'landing.2.toolbox', 'landing.2.toolbox-open']));
  });

  it('every hero silhouette has a hero part, and only those do', () => {
    for (const f of LANDINGS.floors) {
      const hero = heroFor(landingFor(LANDINGS, f.floor, restored), 0.8);
      expect({ floor: f.floor, hero: hero !== null }).toEqual({ floor: f.floor, hero: (HERO_SILHOUETTES as readonly string[]).includes(f.look.silhouette) });
    }
  });

  it('hero parts and touch areas stay inside the doorway; touch areas are generous', () => {
    for (const f of LANDINGS.floors) {
      const hero = heroFor(landingFor(LANDINGS, f.floor, restored), 0.8);
      if (!hero) continue;
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
      expect(hero.hit.x + hero.hit.w).toBeLessThanOrEqual(1);
      expect(hero.hit.y + hero.hit.h).toBeLessThanOrEqual(1);
    }
  });

  it('vector hero reactions are short, return to rest, never flash, and hold still under reduced motion', () => {
    expect(REACTION_MS.normal).toBeGreaterThanOrEqual(500);
    expect(REACTION_MS.normal).toBeLessThanOrEqual(2000);
    for (const f of LANDINGS.floors) {
      const hero = heroFor(landingFor(LANDINGS, f.floor, restored), 0.8);
      for (const p of hero?.parts ?? []) {
        const rest = heroPose(p, 0, false);
        const end = heroPose(p, 1, false);
        expect(end.dx).toBeCloseTo(rest.dx);
        expect(end.dy).toBeCloseTo(rest.dy);
        expect(end.opacity).toBeCloseTo(rest.opacity);
        // Spins end a whole number of turns round, so the part looks as it did.
        if (p.motion === 'spin') expect((end.rotate / (Math.PI * 2)) % 1).toBeCloseTo(0);
        else expect(end.rotate).toBeCloseTo(rest.rotate);
        // Opacity never drops below rest (no blink), and changes at most twice per reaction (< 3 Hz).
        let peaks = 0;
        let prev = rest.opacity;
        let rising = false;
        for (let i = 1; i <= 100; i++) {
          const pose = heroPose(p, i / 100, false);
          expect(pose.opacity).toBeGreaterThanOrEqual(Math.min(rest.opacity, p.base) - 1e-9);
          // A hop only goes up from where it stands.
          expect(pose.dy).toBeLessThanOrEqual(1e-9);
          if (pose.opacity < prev && rising) peaks++;
          rising = pose.opacity > prev;
          prev = pose.opacity;
        }
        expect(peaks / (REACTION_MS.normal / 1000)).toBeLessThan(3);
        const still = heroPose(p, 0.5, true);
        expect([still.rotate, still.dx, still.dy]).toEqual([0, 0, 0]);
      }
    }
  });

  it('reaction timing: a putt waits calmly before the ball is back; Reduced Motion is never slower', () => {
    for (const r of REACTIONS) {
      expect(reactionMs(r, 'reduced')).toBeLessThanOrEqual(reactionMs(r, 'normal'));
      expect(reactionMs(r, 'normal')).toBeGreaterThan(0);
    }
    expect(reactionMs('putt', 'normal')).toBe(PUTT_MS.normal.roll + PUTT_MS.normal.drop + PUTT_MS.normal.rest + PUTT_MS.normal.back);
    expect(PUTT_MS.normal.rest).toBeGreaterThanOrEqual(1000);
    expect(reactionMs('putt', 'normal')).toBeLessThanOrEqual(5000);
    expect(reactionMs('open', 'normal')).toBe(OPEN_MS.normal);
    expect(reactionMs('spin', 'normal')).toBe(REACTION_MS.normal);
  });

  it('labels name the object and the action', () => {
    const ball = exploreSpots(LANDINGS, 20)[0]!;
    expect(spotLabel(ball, { inspected: false, open: false })).toBe('Putt the golf ball');
    expect(spotLabel(ball, { inspected: true, open: false })).toBe('golf ball, inspected. Putt the golf ball.');
    const toolbox = exploreSpots(LANDINGS, 2)[0]!;
    expect(spotLabel(toolbox, { inspected: true, open: false })).toMatch(/Open the toolbox/);
    expect(spotLabel(toolbox, { inspected: true, open: true })).toBe('Close the toolbox');
    // Without an action of its own, a spot keeps the older words.
    expect(spotLabel({ object: 'telescope' }, { inspected: false, open: false })).toBe('Inspect the telescope');
    for (const f of LANDINGS.floors) {
      for (const s of f.explore ?? []) {
        const label = spotLabel(s, { inspected: false, open: false });
        const name = f.objects!.find((o) => o.id === s.target)!.name;
        // The words name the thing (a word of its spoken name or of its object's name).
        const words = [...s.object.split(' '), ...name.split(' ')].filter((w) => w.length >= 4);
        expect({ spot: s.id, names: words.some((w) => label.toLowerCase().includes(w.toLowerCase())) }).toEqual({ spot: s.id, names: true });
      }
    }
  });

  it('child-facing exploration words use no internal vocabulary', () => {
    const words = LANDINGS.floors.flatMap((f) => [
      ...(f.explore ?? []).flatMap((s) => [s.line, s.fact, s.object, s.action ?? '', s.closeAction ?? '', ...(s.card ? [s.card.title, s.card.close, ...s.card.lines] : [])]),
      ...(f.objects ?? []).map((o) => o.name),
    ]);
    for (const w of words) expect(w).not.toMatch(/practice|stretch|mastery|encounter|misconception|evidence|xp|points|score|reward|correct|wrong|eq\\./i);
    // No em dashes in the words (house style).
    for (const w of words) expect(w).not.toMatch(/—/);
  });

  it('the Archive book is a short readable card: two or three sentences, 15 to 60 words', () => {
    const book = exploreSpots(LANDINGS, 17).find((s) => s.id === 'book')!;
    expect(book.card).toBeDefined();
    const words = book.card!.lines.join(' ').split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(15);
    expect(words).toBeLessThanOrEqual(60);
    for (const line of book.card!.lines) expect(line).toMatch(/[.!?]$/);
  });
});

describe('Engineer Log', () => {
  it('lists the explorable places; an undiscovered place never shows its fact', () => {
    const empty = engineerLog(LANDINGS, [], dormant);
    expect(empty.map((r) => r.floor)).toEqual(EXPLORE_FLOORS);
    for (const r of empty) expect({ floor: r.floor, inspected: r.inspected, fact: r.fact }).toEqual({ floor: r.floor, inspected: false, fact: null });
    expect(empty.find((r) => r.floor === 15)!.system).toBe('unpowered');
  });

  it('shows what was found, and Floor 15 powered once restored', () => {
    const rows = engineerLog(LANDINGS, ['eq.discovery.floor-6', 'eq.discovery.floor-15', 'eq.tip.door-close'], restored);
    const six = rows.find((r) => r.floor === 6)!;
    expect(six).toMatchObject({ name: 'MACHINE ROOM', inspected: true, emblem: 'gear', system: null });
    expect(six.fact).toMatch(/sheave/);
    expect(rows.find((r) => r.floor === 15)).toMatchObject({ inspected: true, system: 'powered' });
    expect(rows.filter((r) => r.inspected).map((r) => r.floor)).toEqual([6, 15]);
  });

  it('a floor with two things counts as inspected once either is found', () => {
    const rows = engineerLog(LANDINGS, ['eq.discovery.floor-17.book'], restored);
    expect(rows.find((r) => r.floor === 17)).toMatchObject({ inspected: true, fact: exploreSpots(LANDINGS, 17).find((s) => s.id === 'book')!.fact });
  });

  it('the Machine Room moved from Floor 7 to Floor 6: a discovery recorded under the old key still counts, and not for Floor 7 (D130)', () => {
    const rows = engineerLog(LANDINGS, ['eq.discovery.floor-7'], restored);
    expect(rows.find((r) => r.floor === 6)).toMatchObject({ name: 'MACHINE ROOM', inspected: true });
    expect(rows.find((r) => r.floor === 7)).toMatchObject({ name: 'PLATFORM HEIGHTS', inspected: false, fact: null });
    expect(spotDiscovered({ discovery: 'eq.discovery.floor-6', legacy: ['eq.discovery.floor-7'] }, new Set(['eq.discovery.floor-7']))).toBe(true);
    expect(spotDiscovered({ discovery: 'eq.discovery.floor-6' }, ['eq.discovery.floor-7'])).toBe(false);
  });

  it('has no score: rows carry no numbers beyond the floor', () => {
    for (const r of engineerLog(LANDINGS, ['eq.discovery.floor-5'], restored)) expect(Object.keys(r).sort()).toEqual(['emblem', 'fact', 'floor', 'inspected', 'name', 'system']);
  });
});
