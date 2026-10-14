// Rooftop Word Golf's course (D197): ten holes where the word a learner spells is the shot. Pure: no
// React, no session, no clock, no randomness.
//
// A hole is a top-down map in yards (x right, y down; the tee near the bottom, the green near the
// top): fairways, bunkers and water as polygons, rough everywhere else inside the hole, a round
// green with its pin. It is played in a fixed number of word turns (one per mission step, so the
// evidence of a hole is always the same set of words) and then putted out on the green.
//
// A turn: the ball lies somewhere (tee, fairway, rough, bunker); the word the session gives has a
// length, and a longer word carries farther (carryFor). The turn offers one to three targets inside
// that carry: a safe one (always reached), a bold one (better position, reached by a word spelled
// with no help) and, on the last turn, the green. The word is spelled; how it was spelled (the
// session's evidence: independent, retry, or helped) sets the shot's quality; the quality and the
// lie decide exactly where the ball comes to rest. Nothing is random: the same lie, word length,
// target and quality land in the same place, every time. The literacy evidence is the session's;
// golf only reads it, never the other way round.
//
//   quality   from the evidence    on a safe target        on a bold target          on the green
//   power     first try, no help   rolls 5 yd past it      reaches it, rolls on      4 yd from the pin
//   good      no help, retries     on it                   reaches it                7 yd from the pin
//   steady    any help             5 yd short of it        comes up short (`short`)  10 yd from the pin
//
// The lie the shot starts from changes it a little: from the rough a power shot plays as good and
// lands 2 yd farther from the pin; from a bunker every shot is a steady splash shot, 4 yd farther.
// A shorter approach finishes nearer the pin (D199): every yard past 50 adds a little, up to
// APPROACH.max, so a bold target that leaves a short approach pays off on the green.
//
// Wind (D199): a turn may have a wind, authored like everything else (never random). It bends the
// ball's flight (the golfer aims into it and it curves back) and the screen shows it; it never moves
// where a shot lands, so every outcome below stays the one the validator checked.
// A golden word (it has the hole's golden sound, checked after it is spelled) rolls nearer: 2.5 yd
// from the pin, or 8 yd past a fairway target. A ball that comes up short in water is dropped at
// the target's `drop`, beside the water: no lives, no lost stroke.
import { canRest, distance, insidePolygon, type HoleGeometry, type Vec } from './physics';

export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'water' | 'green' | 'out';
export type Quality = 'power' | 'good' | 'steady';
export type TargetKind = 'safe' | 'bold' | 'green';

export interface Target {
  id: string;
  kind: TargetKind;
  /** Where a reached shot comes to rest (safe and bold targets; the green uses the pin). */
  at: Vec;
  /** Bold only: where a steady shot comes to rest (in front of the hazard it tried to carry). */
  short?: Vec;
  /** Where a ball that ended in water is dropped (beside the water, on the near side). */
  drop?: Vec;
}

export interface Turn {
  targets: Target[];
  /** The wind on this turn, in hole units (x right, y down): its length is its strength, 1 to 3. */
  wind?: Vec;
}

/** Rooftop-garden things beside the hole (never in play). */
export type DecorKind = 'tree' | 'flowers' | 'rock' | 'bush';

export interface Hole {
  id: string;
  number: number;
  /** The runtime mission whose steps are this hole's words (one step per turn). */
  mission: string;
  name: string;
  intro: string;
  par: number;
  size: { w: number; h: number };
  tee: Vec;
  pin: Vec;
  green: { x: number; y: number; r: number };
  fairway: Vec[][];
  bunkers: Vec[][];
  water: Vec[][];
  turns: Turn[];
  /** Spelling patterns that make a word golden on this hole (shown after the word is spelled). */
  golden?: string[];
  /** The hole's words are word families: the screen names the family the word belongs to. */
  family?: boolean;
  /** Rooftop-garden things drawn beside the hole, in the rough and clear of play (checkHole). */
  decor?: { kind: DecorKind; x: number; y: number }[];
}

/** Yards a word of this many letters carries. Plain and visible: one letter, 25 yards more. */
export const carryFor = (letters: number) => 50 + 25 * Math.max(0, Math.round(letters));

/** How far each quality ends from a safe target, along the shot (yards; + is past it). */
export const SAFE_OFFSET: Record<Quality, number> = { power: 5, good: 0, steady: -5 };
/** How far from the pin each quality stops on the green (yards). */
export const GREEN_OFFSET: Record<Quality, number> = { power: 4, good: 7, steady: 10 };
/** A start from the rough or a bunker lands this much farther from the pin. */
export const LIE_EXTRA: Partial<Record<Lie, number>> = { rough: 2, bunker: 4 };
/** A golden word: this close to the pin, or this far past a fairway target. */
export const GOLDEN = { pin: 2.5, past: 8 } as const;
/** An approach to the green longer than `near` yards stops farther from the pin: one yard per `per`, at most `max`. */
export const APPROACH = { near: 50, per: 30, max: 2.5 } as const;
/** How far the wind bends a flight sideways at its middle: this share of the flight per unit of wind. */
export const WIND_BEND = 0.07;
/** Wind strength runs 1 to 3; decor stays this far (yards) from anything in play. */
export const WIND_MAX = 3;
export const DECOR_CLEAR = 8;
/** How far a ball rolls after it lands, by where it stops (the flight shows it bounce and roll). */
export const ROLL: Record<Lie, number> = { tee: 6, fairway: 8, rough: 2, bunker: 0, water: 0, green: 3, out: 0 };
/** Putting: yards on the hole map to putting units (the putting physics, physics.ts). */
export const PUTT_SCALE = 3;
const PUTT_MARGIN = 6;

// ---------- geometry ----------

/** Yards from a point to a polygon (0 inside it). */
function toPolygon(p: Vec, poly: readonly Vec[]): number {
  if (insidePolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k)));
  }
  return best;
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const along = (from: Vec, to: Vec): Vec => {
  const d = sub(to, from);
  const l = Math.hypot(d.x, d.y);
  return l > 1e-9 ? { x: d.x / l, y: d.y / l } : { x: 0, y: -1 };
};
const step = (p: Vec, u: Vec, d: number): Vec => ({ x: p.x + u.x * d, y: p.y + u.y * d });

/** The round green as a polygon (16 sides). */
export function greenPolygon(g: Hole['green']): Vec[] {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: g.x + Math.cos(a) * g.r, y: g.y + Math.sin(a) * g.r };
  });
}

export const onGreen = (hole: Pick<Hole, 'green'>, p: Vec) => distance(p, hole.green) <= hole.green.r;

/** What lies at a point: water over bunker over green over fairway; rough inside the hole; out beyond it. */
export function lieAt(hole: Hole, p: Vec): Lie {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > hole.size.w || p.y > hole.size.h) return 'out';
  if (hole.water.some((w) => insidePolygon(p, w))) return 'water';
  if (hole.bunkers.some((b) => insidePolygon(p, b))) return 'bunker';
  if (onGreen(hole, p)) return 'green';
  if (distance(p, hole.tee) < 0.01) return 'tee';
  if (hole.fairway.some((f) => insidePolygon(p, f))) return 'fairway';
  return 'rough';
}

// ---------- the shot ----------

/** The shot's quality from the session's evidence for the word (golf reads it; it never changes it). */
export function qualityOf(evidence: string): Quality {
  if (evidence === 'independent') return 'power';
  if (evidence === 'retry') return 'good';
  return 'steady';
}

/** The quality the lie allows: from the rough a power shot plays as good; from a bunker, a steady splash shot. */
export function playedQuality(q: Quality, lie: Lie): Quality {
  if (lie === 'bunker') return 'steady';
  if (lie === 'rough' && q === 'power') return 'good';
  return q;
}

/** Whether a spelled word has one of the hole's golden patterns (after it is spelled: never a hint). */
export const isGolden = (hole: Pick<Hole, 'golden'>, word: string) => Boolean(hole.golden?.some((p) => word.includes(p)));

export interface Landing {
  /** Where the ball first touches down (the flight's end; it bounces and rolls from here). */
  land: Vec;
  /** Where it comes to rest (the next turn starts here; on the green, the putt does). */
  rest: Vec;
  lie: Lie;
  quality: Quality;
  golden: boolean;
  /** The shot reached a bold target (false: it came up short). Null on safe and green targets. */
  carried: boolean | null;
  /** It came up short in water: where it touched down, before the drop. */
  splash: Vec | null;
  /** Yards from the start to where it lands (the flight shown). */
  flight: number;
}

/**
 * Where a word's shot ends. Deterministic: the start, its lie, the target, the quality and whether the
 * word was golden decide it.
 */
export function shotLanding(hole: Hole, from: Vec, fromLie: Lie, target: Target, rawQuality: Quality, golden: boolean): Landing {
  const quality = playedQuality(rawQuality, fromLie);
  let rest: Vec;
  let carried: boolean | null = null;
  if (target.kind === 'green') {
    const u = along(from, hole.pin);
    const off = golden ? GOLDEN.pin : GREEN_OFFSET[quality] + (LIE_EXTRA[fromLie] ?? 0) + approachExtra(distance(from, hole.pin));
    rest = step(hole.pin, u, -off);
  } else if (target.kind === 'bold' && quality === 'steady') {
    carried = false;
    rest = target.short ?? target.at;
  } else {
    const u = along(from, target.at);
    if (target.kind === 'bold') carried = true;
    const off = golden ? GOLDEN.past : target.kind === 'bold' ? Math.max(0, SAFE_OFFSET[quality]) : SAFE_OFFSET[quality];
    rest = step(target.at, u, off);
  }
  const restLie = lieAt(hole, rest);
  if (restLie === 'water') {
    const drop = target.drop ?? target.at;
    return { land: rest, rest: { ...drop }, lie: lieAt(hole, drop), quality, golden, carried, splash: { ...rest }, flight: distance(from, rest) };
  }
  const u = along(from, rest);
  const roll = Math.min(ROLL[restLie], Math.max(0, distance(from, rest) - 1));
  const land = step(rest, u, -roll);
  return { land, rest, lie: restLie, quality, golden, carried, splash: null, flight: distance(from, land) };
}

/** Yards an approach of this length adds to where it stops from the pin (a shorter approach ends nearer). */
export const approachExtra = (yards: number) => Math.min(APPROACH.max, Math.max(0, (yards - APPROACH.near) / APPROACH.per));

// ---------- wind ----------

/** The wind on a turn (null when it is calm or the turn is past the last). */
export const windOf = (hole: Pick<Hole, 'turns'>, turn: number): Vec | null => {
  const w = hole.turns[turn]?.wind;
  return w && Math.hypot(w.x, w.y) > 0.01 ? w : null;
};

/** The wind's strength as the screen names it: 1 light, 2 a breeze, 3 strong (0 calm). */
export const windStrength = (w: Vec | null): 0 | 1 | 2 | 3 => (w ? (Math.max(1, Math.min(WIND_MAX, Math.round(Math.hypot(w.x, w.y)))) as 1 | 2 | 3) : 0);

/**
 * How the wind bends a flight: the point the ball passes over halfway (its apex, seen from above). The
 * golfer aims into a crosswind and the ball curves back to land where it was always going to; a head
 * or tail wind does not bend it. The screen draws the flight as a curve through this point.
 */
export function flightApex(from: Vec, land: Vec, wind: Vec | null): Vec {
  const mid = { x: (from.x + land.x) / 2, y: (from.y + land.y) / 2 };
  if (!wind) return mid;
  const len = distance(from, land);
  if (len < 1) return mid;
  const n = { x: -(land.y - from.y) / len, y: (land.x - from.x) / len };
  const cross = wind.x * n.x + wind.y * n.y;
  return step(mid, n, -cross * WIND_BEND * len);
}

/** Yards from a point to the pin (the HUD's "to the pin"). */
export const toPin = (hole: Pick<Hole, 'pin'>, p: Vec) => Math.round(distance(p, hole.pin));

// ---------- putting (physics.ts plays it) ----------

/** The green as the putting physics sees it: putting units, the green's edge as its rails. */
export interface PuttGreen extends HoleGeometry {
  size: { w: number; h: number };
}

const toPutt = (hole: Pick<Hole, 'green'>, p: Vec): Vec => {
  const o = hole.green.r * PUTT_SCALE + PUTT_MARGIN;
  return { x: (p.x - hole.green.x) * PUTT_SCALE + o, y: (p.y - hole.green.y) * PUTT_SCALE + o };
};
/** A point on the hole map in putting units. */
export const puttPoint = toPutt;

/** The putting green for a ball resting at `ball` (hole yards). */
export function puttGreen(hole: Hole, ball: Vec): PuttGreen {
  const side = (hole.green.r * PUTT_SCALE + PUTT_MARGIN) * 2;
  return { size: { w: side, h: side }, green: greenPolygon(hole.green).map((p) => toPutt(hole, p)), walls: [], bumpers: [], tee: toPutt(hole, ball), cup: toPutt(hole, hole.pin) };
}

/** Whether a ball can be putted from a spot on the green (clear of the edge). */
export const puttable = (hole: Hole, ball: Vec) => canRest(toPutt(hole, ball), puttGreen(hole, ball));

/** The par flavour of a finished hole: never shown as a loss. */
export function parName(strokes: number, par: number): 'eagle' | 'birdie' | 'par' | 'holed' {
  if (strokes <= par - 2) return 'eagle';
  if (strokes === par - 1) return 'birdie';
  if (strokes === par) return 'par';
  return 'holed';
}

// ---------- every outcome of a hole (validation and tests) ----------

export interface Outcome {
  turn: number;
  from: Vec;
  fromLie: Lie;
  target: Target;
  quality: Quality;
  golden: boolean;
  landing: Landing;
}

/**
 * Every place a hole can be played to, turn by turn: every target, every quality and golden or not,
 * from every place the turn before can end. The validator checks each one; the tests play them.
 */
export function outcomes(hole: Hole): Outcome[] {
  const out: Outcome[] = [];
  let starts: { at: Vec; lie: Lie }[] = [{ at: hole.tee, lie: 'tee' }];
  hole.turns.forEach((turn, t) => {
    const next: { at: Vec; lie: Lie }[] = [];
    for (const s of starts)
      for (const target of turn.targets)
        for (const q of ['power', 'good', 'steady'] as const)
          for (const golden of hole.golden ? [false, true] : [false]) {
            const landing = shotLanding(hole, s.at, s.lie, target, q, golden);
            out.push({ turn: t, from: s.at, fromLie: s.lie, target, quality: q, golden, landing });
            if (!next.some((n) => distance(n.at, landing.rest) < 0.5)) next.push({ at: landing.rest, lie: landing.lie });
          }
    starts = next;
  });
  return out;
}

export interface FairwayIssue {
  code: string;
  path: string;
  message: string;
}

/**
 * The checks no play can show: the shapes are inside the hole, the green is clear of sand and water,
 * the last turn goes to the green and only it does, every bold target has where it comes up short,
 * and every outcome (outcomes()) ends where the next turn can be played from: never water (dropped),
 * never out, every flight inside the carry of the shortest word the turn can give, every reached
 * target and every drop on the fairway, every ball on the green puttable.
 */
export function checkHole(hole: Hole, at: string, shortestWord: (turn: number) => number | null): FairwayIssue[] {
  const issues: FairwayIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const inside = (p: Vec) => p.x >= 0 && p.y >= 0 && p.x <= hole.size.w && p.y <= hole.size.h;
  const shapes: [string, Vec[][]][] = [
    ['fairway', hole.fairway],
    ['bunkers', hole.bunkers],
    ['water', hole.water],
  ];
  for (const [name, polys] of shapes)
    polys.forEach((poly, i) => {
      if (poly.length < 3) err('ref.shape', `${at}.${name}.${i}`, 'A shape needs three corners');
      poly.forEach((p, k) => {
        if (!inside(p)) err('ref.shape', `${at}.${name}.${i}.${k}`, 'A corner is outside the hole');
      });
    });
  const g = hole.green;
  if (!inside({ x: g.x - g.r, y: g.y - g.r }) || !inside({ x: g.x + g.r, y: g.y + g.r })) err('ref.green', `${at}.green`, 'The green reaches outside the hole');
  for (const p of greenPolygon(g)) if (hole.water.some((w) => insidePolygon(p, w)) || hole.bunkers.some((b) => insidePolygon(p, b))) err('ref.green', `${at}.green`, 'Sand or water on the green');
  if (distance(hole.pin, g) > g.r - 8) err('ref.pin', `${at}.pin`, 'The pin needs room round it on the green');
  if (lieAt(hole, hole.tee) !== 'tee') err('ref.tee', `${at}.tee`, 'The tee must be clear of sand, water and the green');
  if (hole.turns.length === 0) err('ref.turns', `${at}.turns`, 'A hole needs a turn');
  hole.turns.forEach((turn, t) => {
    const last = t === hole.turns.length - 1;
    const path = `${at}.turns.${t}`;
    if (turn.targets.length === 0) err('ref.turns', path, 'A turn needs a target');
    const greens = turn.targets.filter((x) => x.kind === 'green').length;
    if (last && (greens !== 1 || turn.targets.length !== 1)) err('ref.green', path, 'The last turn goes to the green, and only there');
    if (!last && greens > 0) err('ref.green', path, 'Only the last turn goes to the green');
    if (!last && !turn.targets.some((x) => x.kind === 'safe')) err('ref.safe', path, 'Every turn before the green has a safe target');
    turn.targets.forEach((x, k) => {
      if (x.kind === 'bold' && !x.short) err('ref.bold', `${path}.targets.${k}`, 'A bold target says where a short shot ends');
      if (x.kind !== 'bold' && x.short) err('ref.bold', `${path}.targets.${k}`, 'Only a bold target comes up short');
      if (x.kind !== 'green' && lieAt(hole, x.at) !== 'fairway') err('ref.target', `${path}.targets.${k}`, 'A target is on the fairway');
      if (x.drop && lieAt(hole, x.drop) !== 'fairway') err('ref.drop', `${path}.targets.${k}`, 'A drop is on the fairway');
    });
  });
  hole.turns.forEach((turn, t) => {
    if (turn.wind && Math.hypot(turn.wind.x, turn.wind.y) > WIND_MAX + 0.2) err('ref.wind', `${at}.turns.${t}.wind`, `Wind is 1 to ${WIND_MAX}`);
  });
  // Decor sits in the rough, clear of everything in play, so it never hides a shot or reads as a hazard.
  const marks: Vec[] = [hole.tee, hole.pin, ...hole.turns.flatMap((t) => t.targets.flatMap((x) => [x.at, ...(x.short ? [x.short] : []), ...(x.drop ? [x.drop] : [])]))];
  (hole.decor ?? []).forEach((d, i) => {
    const path = `${at}.decor.${i}`;
    const room = Math.min(d.x, d.y, hole.size.w - d.x, hole.size.h - d.y);
    if (lieAt(hole, d) !== 'rough' || room < 4) err('ref.decor', path, 'Decor stands in the rough, inside the hole');
    const near = Math.min(...[...hole.fairway, ...hole.bunkers, ...hole.water, greenPolygon({ ...hole.green, r: hole.green.r + 3 })].map((poly) => toPolygon(d, poly)));
    if (near < DECOR_CLEAR) err('ref.decor', path, `Decor is ${Math.round(near)} yd from the play (at least ${DECOR_CLEAR})`);
    if (marks.some((m) => distance(m, d) < DECOR_CLEAR + 4)) err('ref.decor', path, 'Decor is too near the tee, the pin or a target');
  });
  const seen = new Set<string>();
  for (const o of outcomes(hole)) {
    const key = `${o.turn}:${o.target.id}:${o.quality}:${o.golden}:${o.fromLie}`;
    const path = `${at}.turns.${o.turn}.${o.target.id}`;
    const l = o.landing;
    const carry = shortestWord(o.turn);
    if (carry === null) err('ref.words', path, 'No words for this turn');
    else if (distance(o.from, l.land) > carryFor(carry) + 0.01 && !seen.has(`carry:${key}`)) {
      seen.add(`carry:${key}`);
      err('carry.short', path, `A ${carry}-letter word carries ${carryFor(carry)} yd; this shot flies ${Math.round(distance(o.from, l.land))} yd (${o.quality} from the ${o.fromLie})`);
    }
    if (l.lie === 'water' || l.lie === 'out') err('lie.lost', path, `A ${o.quality} shot ends in ${l.lie}`);
    if (o.target.kind === 'green' && (l.lie !== 'green' || !puttable(hole, l.rest))) err('lie.green', path, `A ${o.quality} approach from the ${o.fromLie} does not stop puttable on the green`);
    if (o.target.kind === 'safe' && l.lie !== 'fairway') err('lie.safe', path, `A ${o.quality} shot to a safe target ends in the ${l.lie}`);
    if (o.target.kind === 'bold' && l.carried && l.lie !== 'fairway') err('lie.bold', path, `A carried bold shot ends in the ${l.lie}`);
    if (o.target.kind === 'bold' && !l.carried && l.splash && !o.target.drop) err('ref.drop', path, 'A bold shot short in water needs a drop');
    // A bent flight stays over the hole, so the curve is always on screen.
    const apex = flightApex(o.from, l.splash ?? l.land, windOf(hole, o.turn));
    if (apex.x < 2 || apex.y < 2 || apex.x > hole.size.w - 2 || apex.y > hole.size.h - 2) err('wind.out', path, `The wind bends a ${o.quality} shot off the hole`);
  }
  return issues;
}
