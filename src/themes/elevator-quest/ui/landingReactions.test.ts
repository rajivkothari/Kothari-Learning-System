// Landing reactions as pure poses: each starts and ends at rest, never loops or flashes, never
// uncovers the art it moves, and under Reduced Motion gives the same information without motion.
import landingsJson from '../../../../content/themes/elevator-quest/landings.json';
import { ENGINEER_WORLD } from '../../../presentation/design/tokens';
import { SOUND_SLOTS } from '../audio/profile';
import { LANDINGS, PUTT_MS, REACTIONS, exploreSpots, reactionMs, validateLandings } from '../content/landings';
import { FLAG_STRETCH, GLOW_PEAK, SLIDE_GROW, bounceStretch, flagStretch, glowOpacity, lampLevel, lowerDrop, openPose, puttPoint, puttPose, slidePose, spinAngle, tiltAngle } from './landingReactions';

const steps = (n = 200) => Array.from({ length: n + 1 }, (_, i) => i / n);
/** Times a value turns from rising to falling: the number of flashes or bounces. */
const peaks = (values: number[]) => {
  let count = 0;
  let rising = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < values[i - 1]! - 1e-9 && rising) count++;
    if (values[i]! > values[i - 1]! + 1e-9) rising = true;
    else if (values[i]! < values[i - 1]! - 1e-9) rising = false;
  }
  return count;
};

describe('landing reactions', () => {
  it('spins end whole turns round; tilts and lowerings return to rest', () => {
    for (const turns of [1, -2, 3]) {
      expect(spinAngle(0, turns, false)).toBeCloseTo(0);
      expect(spinAngle(1, turns, false) / (Math.PI * 2)).toBeCloseTo(turns);
      // Ease out: it covers most of the turn early and coasts to a stop, never going back.
      const angles = steps().map((p) => spinAngle(p, turns, false) * Math.sign(turns));
      for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThanOrEqual(angles[i - 1]! - 1e-9);
    }
    expect(tiltAngle(0, 0.2, false)).toBe(0);
    expect(tiltAngle(1, 0.2, false)).toBeCloseTo(0);
    expect(Math.max(...steps().map((p) => tiltAngle(p, 0.2, false)))).toBeCloseTo(0.2);
    expect(lowerDrop(0, 0.03, false)).toBe(0);
    expect(lowerDrop(1, 0.03, false)).toBeCloseTo(0);
    expect(Math.max(...steps().map((p) => lowerDrop(p, 0.03, false)))).toBeCloseTo(0.03);
  });

  it('a bounce only ever stretches up from its base, so the art underneath never shows', () => {
    const s = steps().map((p) => bounceStretch(p, 0.35, false));
    expect(s[0]).toBe(1);
    expect(s[s.length - 1]).toBeCloseTo(1);
    for (const v of s) expect(v).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(Math.max(...s)).toBeCloseTo(1.35);
    // A big boing and a small one: two, never a loop.
    expect(peaks(s)).toBe(2);
  });

  it('a glow rises and falls once, well under 3 Hz, and never flashes', () => {
    const o = steps().map((p) => glowOpacity(p, false));
    expect(o[0]).toBe(0);
    expect(o[o.length - 1]).toBeCloseTo(0);
    expect(Math.max(...o)).toBeCloseTo(GLOW_PEAK);
    expect(peaks(o)).toBe(1);
    expect(1 / (reactionMs('glow', 'normal') / 1000)).toBeLessThan(3);
  });

  it('lamps come on one by one, each once, and all go out together', () => {
    const n = 5;
    const onAt = (i: number) => steps(1000).find((p) => lampLevel(i, n, p, false) > 0)!;
    for (let i = 1; i < n; i++) expect(onAt(i)).toBeGreaterThan(onAt(i - 1));
    for (let i = 0; i < n; i++) {
      const level = steps(1000).map((p) => lampLevel(i, n, p, false));
      expect(peaks(level)).toBeLessThanOrEqual(1); // on once, off once: never a blink
      expect(level[0]).toBe(0);
      expect(level[level.length - 1]).toBe(0);
      expect(lampLevel(i, n, 0.8, false)).toBe(1); // all lit together before they go out
    }
  });

  it('an opening thing crossfades its two states, with a small lift only while it moves', () => {
    expect(openPose(0, false)).toEqual({ closed: 1, opened: 0, lift: -0 });
    expect(openPose(1, false).opened).toBe(1);
    expect(openPose(1, false).lift).toBeCloseTo(0);
    expect(openPose(0.5, false).lift).toBeLessThan(0);
    // Reduced Motion: a plain change of state, no lift, no half-way state.
    expect(openPose(0.4, true)).toEqual({ closed: 1, opened: 0, lift: 0 });
    expect(openPose(0.6, true)).toEqual({ closed: 0, opened: 1, lift: 0 });
  });

  it('nothing moves under Reduced Motion: the glow and lamps hold still at their peak instead', () => {
    for (const p of [0.1, 0.5, 0.9]) {
      expect(spinAngle(p, 2, true)).toBe(0);
      expect(tiltAngle(p, 0.3, true)).toBe(0);
      expect(bounceStretch(p, 0.35, true)).toBe(1);
      expect(lowerDrop(p, 0.03, true)).toBe(0);
      expect(glowOpacity(p, true)).toBe(GLOW_PEAK);
      for (let i = 0; i < 5; i++) expect(lampLevel(i, 5, p, true)).toBe(1);
    }
    expect(glowOpacity(0, true)).toBe(0);
    expect(glowOpacity(1, true)).toBe(0);
    for (const r of REACTIONS) expect(reactionMs(r, 'reduced')).toBeLessThanOrEqual(reactionMs(r, 'normal'));
  });
});

describe('the putt', () => {
  const at = (ms: number, reduced = false) => {
    const t = PUTT_MS[reduced ? 'reduced' : 'normal'];
    return puttPose(ms / (t.roll + t.drop + t.rest + t.back), reduced);
  };
  const n = PUTT_MS.normal;

  it('rests, rolls to the hole slowing down, drops in, the cup answers once, then the ball is back at rest by itself', () => {
    expect(puttPose(0, false)).toEqual({ along: 0, scale: 1, opacity: 1, ring: 0, ringScale: 1 });
    // Rolling: quick, then slower (a putt), getting smaller as it goes away.
    const early = at(n.roll * 0.25);
    const late = at(n.roll * 0.75);
    expect(early.along).toBeGreaterThan(0.25);
    expect(late.along - at(n.roll * 0.5).along).toBeLessThan(at(n.roll * 0.5).along - early.along);
    expect(late.scale).toBeLessThan(early.scale);
    expect(early.ring).toBe(0);
    // In the cup: the ball is gone and the ring rises and fades once.
    const sunk = at(n.roll + n.drop + 100);
    expect(sunk).toMatchObject({ along: 1, opacity: 0 });
    expect(sunk.ring).toBeGreaterThan(0);
    const rings = Array.from({ length: 100 }, (_, i) => at(n.roll + (i / 100) * (n.drop + n.rest)).ring);
    expect(peaks(rings)).toBe(1);
    expect(at(n.roll + n.drop + n.rest - 10).opacity).toBe(0);
    // Back at rest after the calm pause, fading in where it started: no score, no second shot needed.
    const back = at(n.roll + n.drop + n.rest + n.back / 2);
    expect(back).toMatchObject({ along: 0, scale: 1, ring: 0 });
    expect(back.opacity).toBeGreaterThan(0);
    expect(back.opacity).toBeLessThan(1);
    expect(puttPose(1, false)).toEqual(puttPose(0, false));
  });

  it('the ball leaves at once: it is visibly on its way within a few frames of the touch (M8.1)', () => {
    expect(at(0).along).toBe(0);
    expect(at(50).along).toBeGreaterThan(0.05);
    expect(at(100).along).toBeGreaterThan(0.1);
    expect(at(50).opacity).toBe(1);
    expect(at(50, true).along).toBeGreaterThan(0.15);
  });

  it('the flag answers as the ball drops in: two soft flaps out from the pole, never narrower than at rest', () => {
    const total = n.roll + n.drop + n.rest + n.back;
    const f = (ms: number, reduced = false) => flagStretch(ms / total, reduced);
    expect(f(0)).toBe(1);
    expect(f(n.roll - 10)).toBe(1); // still while the ball rolls
    const flaps = Array.from({ length: 141 }, (_, i) => f(n.roll + i * 5));
    for (const v of flaps) expect(v).toBeGreaterThanOrEqual(1);
    expect(Math.max(...flaps)).toBeCloseTo(1 + FLAG_STRETCH, 2);
    expect(peaks(flaps)).toBe(2);
    expect(2 / 0.7).toBeLessThan(3); // two flaps in 700 ms: under 3 Hz
    expect(f(n.roll + 800)).toBe(1);
    expect(f(total)).toBe(1);
    for (const ms of [n.roll + 100, n.roll + 300]) expect(f(ms, true)).toBe(1);
  });

  it('Reduced Motion: a short straight move to the cup, the same ring held still, then simply back', () => {
    const r = PUTT_MS.reduced;
    expect(r.roll).toBeLessThanOrEqual(300);
    const half = at(r.roll / 2, true);
    expect(half.along).toBeCloseTo(0.5); // straight and even, no easing flourish
    const sunk = at(r.roll + 50, true);
    expect(sunk).toMatchObject({ along: 1, opacity: 0, ringScale: 1 });
    expect(sunk.ring).toBeGreaterThan(0);
    expect(at(r.roll + r.rest - 50, true).ring).toBe(sunk.ring); // held still
    expect(puttPose(1, true)).toEqual(puttPose(0, true));
  });

  it('the path bends gently and ends in the cup', () => {
    const from = { x: 100, y: 300 };
    const to = { x: 300, y: 200 };
    expect(puttPoint(from, to, 0)).toEqual(from);
    expect(puttPoint(from, to, 1).x).toBeCloseTo(to.x);
    expect(puttPoint(from, to, 1).y).toBeCloseTo(to.y);
    const mid = puttPoint(from, to, 0.5);
    const straight = { x: 200, y: 250 };
    const off = Math.hypot(mid.x - straight.x, mid.y - straight.y);
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThan(Math.hypot(to.x - from.x, to.y - from.y) * 0.1);
  });
});

describe('the drawer', () => {
  it('slides out toward you, waits, and slides back; it always covers the painted drawer', () => {
    const poses = steps().map((p) => slidePose(p, false));
    expect(poses[0]).toEqual({ scale: 1, dy: 0 });
    expect(poses[poses.length - 1]!.scale).toBeCloseTo(1);
    for (const { scale, dy } of poses) {
      expect(scale).toBeGreaterThanOrEqual(1);
      // Lower by no more than half its growth: the grown strip still covers the original.
      expect(dy).toBeLessThanOrEqual((scale - 1) / 2 + 1e-9);
      expect(dy).toBeGreaterThanOrEqual(0);
    }
    expect(Math.max(...poses.map((x) => x.scale))).toBeCloseTo(1 + SLIDE_GROW);
    expect(peaks(poses.map((x) => x.scale))).toBe(1); // once out, once back: never a loop
    for (const p of [0.2, 0.5, 0.8]) expect(slidePose(p, true)).toEqual({ scale: 1, dy: 0 });
    expect(reactionMs('slide', 'reduced')).toBeLessThanOrEqual(reactionMs('slide', 'normal'));
  });
});

describe('the catalog checks the reactions\' own data (content/landings.ts)', () => {
  const ctx = { tokens: ENGINEER_WORLD, minFloor: 1, maxFloor: 20 };
  const codes = (edit: (spots: Record<number, Record<string, unknown>>) => void) => {
    const raw = structuredClone(landingsJson) as { floors: { floor: number; explore?: Record<string, unknown>[] }[] };
    const spots: Record<number, Record<string, unknown>> = {};
    for (const f of raw.floors) if (f.explore) spots[f.floor] = f.explore[0]!;
    edit(spots);
    return validateLandings(raw, ctx).issues.map((i) => i.code);
  };

  it('every spot names its own sound (a slot the sound profile has), and only an opening thing a closing one', () => {
    expect(validateLandings(landingsJson, ctx).issues).toEqual([]);
    for (const f of LANDINGS.floors) for (const s of f.explore ?? []) expect({ spot: s.id, sound: (SOUND_SLOTS as readonly string[]).includes(s.sound ?? '') }).toEqual({ spot: s.id, sound: true });
    expect(exploreSpots(LANDINGS, 2)[0]).toMatchObject({ sound: 'toolboxOpen', closeSound: 'toolboxClose' });
    expect(exploreSpots(LANDINGS, 20)[0]!.sound).toBe('golfPutt');
    expect(codes((s) => (s[20]!.sound = 'noSuchSound'))).toContain('ref.sound');
    expect(codes((s) => (s[20]!.closeSound = 'toolboxClose'))).toContain('ref.sound');
  });

  it('a drawer and a flag are checked: on their thing, inside the safe core, only for their reaction', () => {
    expect(exploreSpots(LANDINGS, 17).find((x) => x.id === 'plans')).toMatchObject({ reaction: 'slide' });
    expect(codes((s) => delete s[17]!.slide)).toContain('missing.slide');
    expect(codes((s) => (s[17]!.slide = { x: 0.6, y: 0.6, w: 0.1, h: 0.05 }))).toContain('ref.safe'); // off the cabinet
    expect(codes((s) => (s[1]!.flag = { x: 0.5, y: 0.4, w: 0.05, h: 0.05 }))).toContain('ref.flag');
    expect(codes((s) => (s[20]!.flag = { x: 0.9, y: 0.4, w: 0.08, h: 0.07 }))).toContain('ref.safe');
  });
});
