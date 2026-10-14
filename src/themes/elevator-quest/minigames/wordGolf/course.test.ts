// The ten holes (golfCourses.json, D197): valid, every outcome playable with the words each turn can
// give, the safe route always there, the shot deterministic, and the relationship a child should see:
// a better-spelled word lands better, a longer word carries farther.
import coursesJson from '../../../../../content/themes/elevator-quest/minigames/golfCourses.json';
import coreMissions from '../../../../../content/missions/core.json';
import { SHIPPED_PACK } from '../../../../engine/testing/support';
import { GOLF_COPY, HOLES, HOLE_MISSIONS, holeFor, validateCourses } from './course';
import { APPROACH, GREEN_OFFSET, approachExtra, carryFor, flightApex, isGolden, lieAt, outcomes, playedQuality, puttGreen, puttable, qualityOf, shotLanding, toPin, windOf, windStrength, type Quality } from './fairway';
import { distance } from './physics';

type Step = { id: string; activityId?: string; activityIds?: string[] };
const MISSIONS = (coreMissions as { missions: { id: string; steps: Step[] }[] }).missions;
const wordsOf = (activityId: string) => ((SHIPPED_PACK.activities.find((a) => a.id === activityId)?.params as { words?: { word: string }[] } | undefined)?.words ?? []).map((w) => w.word);
/** The words a hole's turn can give: every word of every activity of the mission's step. */
export function turnWords(mission: string, turn: number): string[] {
  const step = MISSIONS.find((m) => m.id === mission)?.steps[turn];
  if (!step) return [];
  return (step.activityIds ?? (step.activityId ? [step.activityId] : [])).flatMap(wordsOf);
}
const shortest = (mission: string, turn: number) => {
  const w = turnWords(mission, turn);
  return w.length ? Math.min(...w.map((x) => x.length)) : null;
};
const clone = () => JSON.parse(JSON.stringify(coursesJson)) as { holes: Record<string, unknown>[]; copy: Record<string, string> };

describe('the rooftop course (D197)', () => {
  it('is valid with the words each turn can give: every outcome ends where it can be played on', () => {
    const r = validateCourses(coursesJson, shortest);
    expect(r.issues).toEqual([]);
    expect(HOLES.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(HOLE_MISSIONS[0]).toBe('word-golf');
  });

  it('every hole has a mission with one step per turn, and every turn can give words', () => {
    for (const h of HOLES) {
      const m = MISSIONS.find((x) => x.id === h.mission);
      expect({ hole: h.id, steps: m?.steps.length }).toEqual({ hole: h.id, steps: h.turns.length });
      h.turns.forEach((_, t) => expect({ hole: h.id, t, words: turnWords(h.mission, t).length > 1 }).toEqual({ hole: h.id, t, words: true }));
    }
    expect(holeFor('nope').id).toBe(HOLES[0]!.id);
  });

  it('the safe route always works: every hole can be finished taking only safe targets with only steady (helped) words', () => {
    for (const h of HOLES) {
      let at = h.tee;
      let lie = lieAt(h, at);
      for (const turn of h.turns) {
        const target = turn.targets.find((x) => x.kind === 'safe' || x.kind === 'green')!;
        const l = shotLanding(h, at, lie, target, 'steady', false);
        expect({ hole: h.id, lie: l.lie }).toEqual({ hole: h.id, lie: target.kind === 'green' ? 'green' : 'fairway' });
        at = l.rest;
        lie = l.lie;
      }
      expect(puttable(h, at)).toBe(true);
    }
  });

  it('better spelling lands better: on the green, power is nearer the pin than good, good nearer than steady', () => {
    for (const h of HOLES) {
      const last = h.turns.length - 1;
      for (const o of outcomes(h).filter((x) => x.turn === last && !x.golden && x.quality === 'power')) {
        const d = (q: Quality) => distance(shotLanding(h, o.from, o.fromLie, o.target, q, false).rest, h.pin);
        expect(d('power')).toBeLessThanOrEqual(d('good'));
        expect(d('good')).toBeLessThanOrEqual(d('steady'));
      }
    }
    expect(GREEN_OFFSET.power).toBeLessThan(GREEN_OFFSET.steady);
  });

  it('a bold target is reached by a word spelled with no help, and a helped word comes up short (never lost: water drops it beside the pool)', () => {
    let bolds = 0;
    for (const h of HOLES)
      for (const o of outcomes(h).filter((x) => x.target.kind === 'bold' && x.fromLie !== 'rough' && x.fromLie !== 'bunker' && !x.golden)) {
        bolds++;
        if (o.quality === 'steady') expect(o.landing.carried).toBe(false);
        else expect([o.landing.carried, o.landing.lie]).toEqual([true, 'fairway']);
        if (o.landing.splash) expect(o.landing.lie).toBe('fairway');
      }
    expect(bolds).toBeGreaterThan(0);
    // Hole 8 (the pool): a helped word splashes and is set down on the fairway beside it.
    const pool = HOLES.find((h) => h.id === 'water-carry')!;
    const bold = pool.turns[0]!.targets.find((t) => t.kind === 'bold')!;
    const wet = shotLanding(pool, pool.tee, 'tee', bold, 'steady', false);
    expect(wet.splash).not.toBeNull();
    expect([lieAt(pool, wet.splash!), wet.lie]).toEqual(['water', 'fairway']);
    // Hole 4 (the sand): a helped word over the sand lands in it, and the splash shot still reaches the green.
    const sand = HOLES.find((h) => h.id === 'bunker-lesson')!;
    const over = sand.turns[0]!.targets.find((t) => t.kind === 'bold')!;
    const inSand = shotLanding(sand, sand.tee, 'tee', over, 'steady', false);
    expect(inSand.lie).toBe('bunker');
    const out = shotLanding(sand, inSand.rest, 'bunker', sand.turns[1]!.targets[0]!, 'power', false);
    expect([out.lie, out.quality]).toEqual(['green', 'steady']);
  });

  it('a longer word carries farther, one letter 25 yards; the long-drive hole needs its long word', () => {
    expect([3, 4, 5, 6].map(carryFor)).toEqual([125, 150, 175, 200]);
    const long = HOLES.find((h) => h.id === 'long-drive')!;
    const drive = shotLanding(long, long.tee, 'tee', long.turns[0]!.targets[0]!, 'good', false);
    expect(drive.flight).toBeGreaterThan(carryFor(3));
    expect(Math.min(...turnWords(long.mission, 0).map((w) => w.length))).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic: the same lie, target, quality and golden word land in the same place', () => {
    for (const h of HOLES)
      for (const o of outcomes(h)) {
        const again = shotLanding(h, o.from, o.fromLie, o.target, o.quality, o.golden);
        expect(again).toEqual(o.landing);
      }
  });

  it('the lie changes the shot a little: the rough plays power as good; the sand is a steady splash', () => {
    expect([playedQuality('power', 'rough'), playedQuality('good', 'rough'), playedQuality('power', 'bunker'), playedQuality('power', 'fairway')]).toEqual(['good', 'good', 'steady', 'power']);
    expect([qualityOf('independent'), qualityOf('retry'), qualityOf('clue'), qualityOf('guided'), qualityOf('demonstrated')]).toEqual(['power', 'good', 'steady', 'steady', 'steady']);
  });

  it('every golden hole has a turn whose every word has a golden sound, so each play can roll golden at least once', () => {
    for (const h of HOLES.filter((x) => x.golden)) {
      const sure = h.turns.some((_, t) => turnWords(h.mission, t).length > 0 && turnWords(h.mission, t).every((w) => isGolden(h, w)));
      expect({ hole: h.id, sure }).toEqual({ hole: h.id, sure: true });
    }
  });

  it('a golden word (hole 5) rolls nearer, and golden is decided by the spelled word only', () => {
    const h = HOLES.find((x) => x.golden)!;
    expect(isGolden(h, 'ship')).toBe(true);
    expect(isGolden(h, 'plug')).toBe(false);
    const last = h.turns[h.turns.length - 1]!.targets[0]!;
    const from = { x: 84, y: 150 };
    expect(distance(shotLanding(h, from, 'fairway', last, 'steady', true).rest, h.pin)).toBeLessThan(distance(shotLanding(h, from, 'fairway', last, 'power', false).rest, h.pin));
    // Some of the hole's words are golden and some are not: golden is a bonus, not a rule.
    const words = h.turns.flatMap((_, t) => turnWords(h.mission, t));
    expect(words.some((w) => isGolden(h, w)) && words.some((w) => !isGolden(h, w))).toBe(true);
  });

  it('the putting green holds every approach: the ball, the cup and the edge in putting units', () => {
    for (const h of HOLES) {
      const g = puttGreen(h, { x: h.pin.x, y: h.pin.y + 10 });
      expect(g.green.length).toBe(16);
      expect(distance(g.cup, g.tee)).toBeGreaterThan(20);
    }
    expect(toPin(HOLES[0]!, HOLES[0]!.tee)).toBe(122);
  });

  it('refuses a bold target with no short spot, a turn without a safe target, a green before the last turn, sand on the green and score words', () => {
    const bad = clone();
    const turns = bad.holes[3]!.turns as { targets: { kind: string; short?: unknown }[] }[];
    delete turns[0]!.targets[1]!.short;
    (bad.holes[1]!.turns as { targets: { kind: string }[] }[])[0]!.targets[0]!.kind = 'bold';
    (bad.holes[2]!.turns as { targets: { kind: string }[] }[])[0]!.targets[0]!.kind = 'green';
    (bad.holes[4]!.bunkers as unknown[]).push([
      { x: 70, y: 40 },
      { x: 90, y: 40 },
      { x: 80, y: 60 },
    ]);
    bad.copy.birdie = 'Your score is a BIRDIE';
    const codes = validateCourses(bad, shortest).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ref.bold', 'ref.safe', 'ref.green', 'copy.tone']));
  });

  it('a turn whose words cannot carry the shot is refused (the carry check uses the shortest word)', () => {
    const codes = validateCourses(coursesJson, () => 2).issues.map((i) => i.code);
    expect(codes).toContain('carry.short');
  });

  it('the golf words never name a word the holes can ask for', () => {
    const all = new Set(HOLES.flatMap((h) => h.turns.flatMap((_, t) => turnWords(h.mission, t))));
    for (const [k, line] of Object.entries(GOLF_COPY)) {
      const named = line
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => all.has(w));
      expect({ k, named }).toEqual({ k, named: [] });
    }
  });

  describe('wind, the approach and the garden (D199)', () => {
    it('a shorter approach stops nearer the pin, so a bold landing pays off on the green', () => {
      expect(approachExtra(APPROACH.near)).toBe(0);
      expect(approachExtra(400)).toBe(APPROACH.max);
      // Hole 4: from the bold spot past the sand the same word finishes nearer than from the safe one.
      const h = holeFor('word-golf-4');
      const [safe, bold] = h.turns[0]!.targets;
      const green = h.turns[1]!.targets[0]!;
      for (const q of ['power', 'good'] as const) {
        const fromSafe = shotLanding(h, shotLanding(h, h.tee, 'tee', safe!, q, false).rest, 'fairway', green, q, false);
        const fromBold = shotLanding(h, shotLanding(h, h.tee, 'tee', bold!, q, false).rest, 'fairway', green, q, false);
        expect(distance(fromBold.rest, h.pin)).toBeLessThan(distance(fromSafe.rest, h.pin));
      }
    });

    it('wind is authored per turn (never random), 1 to 3, and bends a flight without moving where it lands', () => {
      expect(windOf(holeFor('word-golf'), 0)).toBeNull();
      const windy = HOLES.flatMap((h) => h.turns.map((_, t) => windOf(h, t))).filter((w) => w !== null);
      expect(windy.length).toBeGreaterThan(10);
      for (const w of windy) expect([1, 2, 3]).toContain(windStrength(w));
      const from = { x: 80, y: 200 };
      const land = { x: 80, y: 100 };
      // A crosswind to the right: the ball starts left of the line (aimed into it) and curves back.
      expect(flightApex(from, land, { x: 2, y: 0 }).x).toBeLessThan(80);
      expect(flightApex(from, land, { x: -2, y: 0 }).x).toBeGreaterThan(80);
      // A stronger wind bends it more; a head wind does not bend it; calm flies straight.
      expect(80 - flightApex(from, land, { x: 3, y: 0 }).x).toBeGreaterThan(80 - flightApex(from, land, { x: 1, y: 0 }).x);
      expect(flightApex(from, land, { x: 0, y: 2 })).toEqual({ x: 80, y: 150 });
      expect(flightApex(from, land, null)).toEqual({ x: 80, y: 150 });
      // Landings ignore the wind: a hole with its wind removed lands every outcome in the same place.
      for (const h of HOLES) {
        const calm = { ...h, turns: h.turns.map((t) => ({ targets: t.targets })) };
        expect(outcomes(calm).map((o) => o.landing.rest)).toEqual(outcomes(h).map((o) => o.landing.rest));
      }
    });

    it('every hole is a garden: decor beside the hole, never industrial, and the checker keeps it out of play', () => {
      for (const h of HOLES) {
        expect(h.decor?.length ?? 0).toBeGreaterThanOrEqual(4);
        for (const d of h.decor ?? []) expect(['tree', 'flowers', 'rock', 'bush']).toContain(d.kind);
      }
      const bad = clone();
      const h0 = bad.holes[0] as { decor: { kind: string; x: number; y: number }[] };
      h0.decor = [{ kind: 'tree', x: 80, y: 120 }]; // on the fairway
      expect(validateCourses(bad).issues.map((i) => i.code)).toContain('ref.decor');
      h0.decor = [{ kind: 'vent', x: 20, y: 120 }];
      expect(validateCourses(bad).ok).toBe(false);
      const windy = clone();
      ((windy.holes[1] as { turns: { wind?: unknown }[] }).turns[0]!).wind = { x: 9, y: 0 };
      expect(validateCourses(windy).issues.map((i) => i.code)).toContain('ref.wind');
    });
  });
});
