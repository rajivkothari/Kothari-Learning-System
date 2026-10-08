// The three holes (golfCourses.json): valid, and playable. A solution exists for each in one to three
// good (medium) putts; well-aimed medium putts drop; sloppy ones (bad aim, too much power) miss.
import coursesJson from '../../../../../content/themes/elevator-quest/minigames/golfCourses.json';
import { GOLF_COPY, HOLES, geometryOf, say, validateCourses } from './course';
import { closerOffer, moveCloser, newGame, nextHole, presentWord, rollDone, setAim, setPower, shoot, spelled, takeShot } from './game';
import { angleTo, simulateShot, type HoleGeometry, type Vec } from './physics';

const deg = Math.PI / 180;
const geo = (i: number) => geometryOf(HOLES[i]!);
const clone = () => JSON.parse(JSON.stringify(coursesJson)) as typeof coursesJson & { holes: { tee: Vec; cup: Vec; walls: unknown[]; green: Vec[] }[]; copy: Record<string, string> };

/** Pinned putts per hole for the simple player at each power (see simplePlayer). */
const PLAYER_TABLE: [number, number[]][] = [
  [0.4, [2, 2, 2]],
  [0.45, [1, 1, 2]],
  [0.55, [1, 1, 2]],
  [0.6, [1, 1, 2]],
];

/** Medium putts a child is likely to try: every 2 degrees, power 0.3 to 0.8. */
const GOOD_POWERS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

/**
 * The fewest putts (up to `depth`) that sink the hole from `from` using medium powers, or null.
 * From each spot it tries every aim (2 degree steps) and medium power; when none drops it follows
 * the few rests nearest the cup.
 */
function fewestPutts(g: HoleGeometry, from: Vec, depth: number): { putts: number; plan: { angle: number; power: number }[] } | null {
  const rests: { rest: Vec; shot: { angle: number; power: number }; d: number }[] = [];
  for (let a = -180; a < 180; a += 2)
    for (const power of GOOD_POWERS) {
      const shot = { angle: a * deg, power };
      const r = simulateShot(g, from, shot);
      if (r.outcome === 'cup') return { putts: 1, plan: [shot] };
      if (r.outcome === 'rest') rests.push({ rest: r.rest, shot, d: Math.hypot(r.rest.x - g.cup.x, r.rest.y - g.cup.y) });
    }
  if (depth <= 1) return null;
  rests.sort((a, b) => a.d - b.d);
  const tried: Vec[] = [];
  for (const r of rests) {
    if (tried.some((t) => Math.hypot(t.x - r.rest.x, t.y - r.rest.y) < 6)) continue;
    tried.push(r.rest);
    if (tried.length > 4) break;
    const rest = fewestPutts(g, r.rest, depth - 1);
    if (rest) return { putts: rest.putts + 1, plan: [r.shot, ...rest.plan] };
  }
  return null;
}

describe('golf courses', () => {
  it('the course file is valid', () => {
    const r = validateCourses(coursesJson);
    expect(r.issues).toEqual([]);
    expect(HOLES.map((h) => h.number)).toEqual([1, 2, 3]);
  });

  it('refuses a tee in a wall, a cup off the green, crossing rails, a dash and an unknown placeholder', () => {
    const bad = clone();
    bad.holes[0]!.tee = { x: 20, y: 60 };
    bad.holes[1]!.cup = { x: 2, y: 2 };
    bad.holes[2]!.green = [
      { x: 10, y: 10 },
      { x: 90, y: 140 },
      { x: 90, y: 10 },
      { x: 10, y: 140 },
    ];
    bad.copy.putt = 'PUTT \u2014 now';
    bad.copy.takeShot = 'TAKE {hole}';
    const codes = validateCourses(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ref.tee', 'ref.cup', 'ref.green', 'copy.dash', 'copy.placeholder']));
  });

  it('refuses score words in the copy', () => {
    const bad = clone();
    bad.copy.wordsLabel = 'Your score';
    expect(validateCourses(bad).issues.map((i) => i.code)).toContain('copy.tone');
  });

  it('every hole can be sunk in one to three medium putts, as many as it is designed for', () => {
    HOLES.forEach((h, i) => {
      const r = fewestPutts(geo(i), h.tee, 3);
      expect(r).not.toBeNull();
      expect(r!.putts).toBeLessThanOrEqual(h.shots);
    });
  });

  it('holes 1 and 2: a medium putt aimed at the flag drops', () => {
    for (const i of [0, 1]) {
      const g = geo(i);
      for (const power of [0.5, 0.55, 0.6, 0.65]) expect(simulateShot(g, g.tee, { angle: angleTo(g.tee, g.cup), power }).outcome).toBe('cup');
      // A little off the exact line still drops (a child's aim), a lot does not.
      expect(simulateShot(g, g.tee, { angle: angleTo(g.tee, g.cup) + 2 * deg, power: 0.58 }).outcome).toBe('cup');
      expect(simulateShot(g, g.tee, { angle: angleTo(g.tee, g.cup) - 2 * deg, power: 0.58 }).outcome).toBe('cup');
    }
  });

  it('holes 1 and 2: sloppy putts miss (poor aim, too much power, too little)', () => {
    for (const i of [0, 1]) {
      const g = geo(i);
      const at = angleTo(g.tee, g.cup);
      expect(simulateShot(g, g.tee, { angle: at + 12 * deg, power: 0.6 }).outcome).not.toBe('cup');
      expect(simulateShot(g, g.tee, { angle: at - 12 * deg, power: 0.6 }).outcome).not.toBe('cup');
      const hard = simulateShot(g, g.tee, { angle: at, power: 0.9 });
      expect(hard.outcome).not.toBe('cup');
      expect(hard.events.some((e) => e.kind === 'lipOut')).toBe(true);
      expect(simulateShot(g, g.tee, { angle: at, power: 0.3 }).outcome).not.toBe('cup');
    }
  });

  it('hole 1 teaches aim: putting straight up the course, without turning, misses', () => {
    const g = geo(0);
    for (const power of [0.45, 0.5, 0.55, 0.6, 0.65]) expect(simulateShot(g, g.tee, { angle: -90 * deg, power }).outcome).not.toBe('cup');
  });

  it('hole 2 needs a turn: the flag is well off the straight line', () => {
    const g = geo(1);
    expect(Math.abs(angleTo(g.tee, g.cup) / deg + 90)).toBeGreaterThan(20);
  });

  it('hole 3: aiming straight at the flag hits the wall; through the gap, then at the flag, drops', () => {
    const g = geo(2);
    const straight = simulateShot(g, g.tee, { angle: angleTo(g.tee, g.cup), power: 0.6 });
    expect(straight.outcome).not.toBe('cup');
    expect(straight.events[0]?.kind).toBe('wall');
    // Through the gap at medium power, then a medium putt at the flag from wherever it stops.
    let plans = 0;
    for (let a = -75; a <= -55; a += 5)
      for (const p of [0.5, 0.55, 0.6, 0.65]) {
        const first = simulateShot(g, g.tee, { angle: a * deg, power: p });
        if (first.outcome !== 'rest' || first.rest.y > 86) continue;
        const second = GOOD_POWERS.some((q) => simulateShot(g, first.rest, { angle: angleTo(first.rest, g.cup), power: q }).outcome === 'cup');
        if (second) plans += 1;
      }
    expect(plans).toBeGreaterThanOrEqual(8);
  });

  /**
   * The session-length check (the owner's brief: three to five minutes). A simple player: every putt
   * aimed straight at the flag at one fixed power, MOVE CLOSER taken whenever it is offered. Pure and
   * deterministic, so the putts per hole are pinned: a geometry or physics change that makes a hole
   * longer shows up here.
   */
  function simplePlayer(power: number): number[] {
    let s = newGame(HOLES);
    const putts: number[] = [];
    for (let h = 0; h < HOLES.length; h++) {
      s = takeShot(spelled(presentWord(s, { key: `k${h}`, tiles: 'abc', length: 3 }), 'abc', 'independent'));
      while (s.phase === 'aim' && s.shots < 20) {
        if (closerOffer(s, HOLES)) s = moveCloser(s, HOLES);
        s = rollDone(shoot(setPower(setAim(s, angleTo(s.ball, HOLES[h]!.cup)), power), HOLES), HOLES);
      }
      putts.push(s.shots);
      if (s.phase === 'sunk') s = nextHole(s, HOLES);
    }
    expect(s.phase).toBe('summary');
    return putts;
  }

  it('aim at the flag, mid power: one, one and two putts (hole 3 the hardest)', () => {
    expect(simplePlayer(0.5)).toEqual([1, 1, 2]);
  });

  it('a softer or harder simple player still finishes each hole in one to three putts', () => {
    expect(PLAYER_TABLE.map(([p]) => [p, simplePlayer(p)])).toEqual(PLAYER_TABLE);
    for (const [, putts] of PLAYER_TABLE) for (const n of putts) expect(n).toBeLessThanOrEqual(3);
  });

  it('every copy line fills its placeholders', () => {
    expect(say(GOLF_COPY.holesDone, { done: 2, count: 3 })).toBe('2 of 3 holes done');
    expect(say(GOLF_COPY.powerValue, { n: 5 })).not.toMatch(/[{}]/);
  });
});
