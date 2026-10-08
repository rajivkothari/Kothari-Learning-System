// Rooftop Word Golf: deterministic 2D putting. Pure: no React, no Skia, no clock, no randomness.
//
// One shot is simulated to its end in a fixed timestep and returned as a path (one point a frame),
// so the screen only plays the path back and the tests check the same path. Same hole, same ball,
// same aim and power: the same path, always.
//
// The model (course units; a hole is about 100 x 150):
//   - the ball rolls with a constant rolling friction plus a little drag, so it always slows down
//   - the green is a simple polygon whose edges are rails; extra wall segments and round bumpers
//     sit on it; the ball reflects off them and loses some speed every time (restitution < 1)
//   - the cup takes the ball only when the ball's centre passes over the hole slowly enough; a fast
//     ball lips out (turned aside and slowed) and rolls on; a ball that stops on the lip drops in
//   - a ball that ends off the green or pressed into a wall (it should not happen) is put back at
//     its last rest spot, so a bad shot can never leave the learner stuck
// Energy never grows: friction, every bounce and every lip-out take speed away (property-tested).

export interface Vec {
  x: number;
  y: number;
}

/** A rail or wall: a segment the ball bounces off. */
export interface Wall {
  a: Vec;
  b: Vec;
}

/** A round post the ball bounces off, a little more lively than a rail. */
export interface Bumper {
  x: number;
  y: number;
  r: number;
}

/** What the physics needs from a hole (course.ts adds names and checks the geometry). */
export interface HoleGeometry {
  /** The playing area's outline, in order (a simple polygon). Its edges are the rails. */
  green: readonly Vec[];
  /** Walls standing on the green (not the rails). */
  walls: readonly Wall[];
  bumpers: readonly Bumper[];
  tee: Vec;
  cup: Vec;
}

export interface Shot {
  /** Direction in radians, in course coordinates (x right, y down): -PI/2 points up the course. */
  angle: number;
  /** 0 to 1 (clamped to POWER.min .. 1). */
  power: number;
}

export type ShotOutcome = 'cup' | 'rest' | 'out' | 'stuck';

export type ShotEventKind = 'wall' | 'bumper' | 'lipOut' | 'cup' | 'out' | 'stuck';

export interface ShotEvent {
  /** Frame index in the path. */
  frame: number;
  kind: ShotEventKind;
}

export interface ShotResult {
  /** The ball's centre every frame (FRAME_S apart), from the start spot to where it ends. */
  path: Vec[];
  /** The ball's speed every frame (course units a second), same length as `path`. */
  speeds: number[];
  events: ShotEvent[];
  outcome: ShotOutcome;
  /** Where the next shot starts: the cup (sunk), the rest spot, or the start spot again (out, stuck). */
  rest: Vec;
}

/** Tuned so a well-aimed, medium putt drops and a hard one lips out (wordGolf.test.ts, course.test.ts). */
export const PHYS = {
  ballR: 2.5,
  cupR: 5.5,
  /** Fixed timestep: one frame of the path. */
  frameS: 1 / 60,
  /** Rolling friction (units / s^2). */
  decel: 48,
  /** Linear drag (1 / s). */
  drag: 0.35,
  /** Launch speed at full power (units / s). */
  vMax: 235,
  /** Faster than this over the hole: it lips out (forgiving for a young child; a hard putt still lips out). */
  captureSpeed: 140,
  /** A lip-out keeps this much speed and turns aside by lipTurn radians. */
  lipKeep: 0.62,
  lipTurn: 0.5,
  /** A slow ball resting this close to the cup's centre drops in (the lip). */
  dropReach: 5.5 + 2.5 * 0.5,
  wallBounce: 0.72,
  bumperBounce: 0.88,
  /** Below this speed the ball has stopped. */
  stopSpeed: 2.5,
  /** Frames to slide the captured ball to the cup's centre (the drop). */
  dropFrames: 8,
  /** A shot never runs longer than this (it cannot: friction stops a full-power ball in about 4 s). */
  maxFrames: 60 * 12,
} as const;

export const POWER = { min: 0.08, max: 1 } as const;

// ---------- vectors ----------

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec) => Math.hypot(v.x, v.y);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The point of segment ab closest to p. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return { x: a.x, y: a.y };
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

/** Even-odd point in polygon. Points exactly on an edge may go either way; callers allow a margin. */
export function insidePolygon(p: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The green's rails plus the walls on it: every segment the ball can hit. */
export function segmentsOf(hole: HoleGeometry): Wall[] {
  const rails = hole.green.map((a, i) => ({ a, b: hole.green[(i + 1) % hole.green.length]! }));
  return [...rails, ...hole.walls];
}

/** Distance from p to the nearest rail or wall. */
export function clearance(p: Vec, hole: HoleGeometry): number {
  let best = Infinity;
  for (const s of segmentsOf(hole)) best = Math.min(best, distance(p, closestOnSegment(p, s.a, s.b)));
  for (const b of hole.bumpers) best = Math.min(best, distance(p, b) - b.r);
  return best;
}

/** Whether a ball can rest at p: on the green, clear of every rail, wall and bumper. */
export function canRest(p: Vec, hole: HoleGeometry): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && insidePolygon(p, hole.green) && clearance(p, hole) >= PHYS.ballR * 0.9;
}

/** Launch velocity for a shot. */
export function launch(shot: Shot): Vec {
  const p = clampPower(shot.power);
  const v = PHYS.vMax * p;
  return { x: Math.cos(shot.angle) * v, y: Math.sin(shot.angle) * v };
}

export const clampPower = (p: number) => (Number.isFinite(p) ? Math.min(POWER.max, Math.max(POWER.min, p)) : POWER.min);

/** The shortest distance between segments ab and cd (0 when they cross). */
export function segmentDistance(a: Vec, b: Vec, c: Vec, d: Vec): number {
  const side = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return 0;
  return Math.min(distance(a, closestOnSegment(a, c, d)), distance(b, closestOnSegment(b, c, d)), distance(c, closestOnSegment(c, a, b)), distance(d, closestOnSegment(d, a, b)));
}

/** Whether a ball can roll in a straight line from a to b without touching a rail, a wall or a post. */
export function clearLine(hole: HoleGeometry, a: Vec, b: Vec): boolean {
  return segmentsOf(hole).every((s) => segmentDistance(a, b, s.a, s.b) >= PHYS.ballR) && hole.bumpers.every((p) => distance(p, closestOnSegment(p, a, b)) >= p.r + PHYS.ballR);
}

/**
 * MOVE CLOSER (offered after a few putts on one hole): a resting spot about a third of the ball's
 * distance from the cup, with a straight, clear line to the cup. Straight back toward the ball when
 * that is clear, else the nearest clear direction (10 degree steps either way). Never nearer than
 * CLOSER.min (it is still a putt), never farther than CLOSER.max; null when the ball is already about
 * that close. Deterministic. Moving the ball is play: never help, never evidence.
 */
export const CLOSER = { share: 1 / 3, min: 12, max: 35, after: 3 } as const;
export function closerSpot(hole: HoleGeometry, ball: Vec): Vec | null {
  const d = distance(ball, hole.cup);
  const r = Math.min(CLOSER.max, Math.max(CLOSER.min, d * CLOSER.share));
  if (r > d - 4) return null;
  const base = Math.atan2(ball.y - hole.cup.y, ball.x - hole.cup.x);
  for (let k = 0; k <= 18; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const a = base + (sign * k * Math.PI) / 18;
      const p = { x: hole.cup.x + Math.cos(a) * r, y: hole.cup.y + Math.sin(a) * r };
      if (canRest(p, hole) && clearLine(hole, p, hole.cup)) return p;
    }
  }
  return null;
}

/** An angle in (-PI, PI]. */
export function normalizeAngle(a: number): number {
  if (!Number.isFinite(a)) return -Math.PI / 2;
  let x = a % (Math.PI * 2);
  if (x <= -Math.PI) x += Math.PI * 2;
  if (x > Math.PI) x -= Math.PI * 2;
  return x;
}

/**
 * Simulate one shot from `from` to its end. Deterministic: plain arithmetic, fixed steps, no clock.
 * The ball starts where it rests; if that spot is not a resting place (a bad save) it starts at the tee.
 */
export function simulateShot(hole: HoleGeometry, from: Vec, shot: Shot): ShotResult {
  const start = canRest(from, hole) ? { x: from.x, y: from.y } : { x: hole.tee.x, y: hole.tee.y };
  const segments = segmentsOf(hole);
  const R = PHYS.ballR;
  let pos = { ...start };
  let vel = launch({ angle: normalizeAngle(shot.angle), power: shot.power });
  const path: Vec[] = [{ ...pos }];
  const speeds: number[] = [len(vel)];
  const events: ShotEvent[] = [];
  let lipped = false;
  let outcome: ShotOutcome | null = null;

  for (let frame = 1; frame <= PHYS.maxFrames && outcome === null; frame++) {
    // Friction first: speed only ever goes down.
    const speed0 = len(vel);
    const slowed = Math.max(0, speed0 - PHYS.decel * PHYS.frameS) * (1 - PHYS.drag * PHYS.frameS);
    vel = speed0 > 0 ? { x: (vel.x / speed0) * slowed, y: (vel.y / speed0) * slowed } : { x: 0, y: 0 };

    // Sub-steps keep each move well under the ball's radius, so the ball can never pass through a rail.
    const travel = len(vel) * PHYS.frameS;
    const n = Math.max(1, Math.ceil(travel / (R * 0.4)));
    const h = PHYS.frameS / n;
    const hit = new Set<string>();
    for (let k = 0; k < n && outcome === null; k++) {
      pos = { x: pos.x + vel.x * h, y: pos.y + vel.y * h };
      // Rails and walls (a corner is a segment's end: the push comes from that point).
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        segments.forEach((s, i) => {
          const q = closestOnSegment(pos, s.a, s.b);
          const d = sub(pos, q);
          const dist = len(d);
          if (dist >= R) return;
          const nrm = dist > 1e-9 ? { x: d.x / dist, y: d.y / dist } : unitAgainst(vel);
          pos = { x: q.x + nrm.x * R, y: q.y + nrm.y * R };
          const vn = dot(vel, nrm);
          if (vn < 0) {
            vel = { x: vel.x - (1 + PHYS.wallBounce) * vn * nrm.x, y: vel.y - (1 + PHYS.wallBounce) * vn * nrm.y };
            if (!hit.has(`w${i}`)) events.push({ frame, kind: 'wall' });
            hit.add(`w${i}`);
          }
          moved = true;
        });
        hole.bumpers.forEach((b, i) => {
          const d = sub(pos, b);
          const dist = len(d);
          if (dist >= b.r + R) return;
          const nrm = dist > 1e-9 ? { x: d.x / dist, y: d.y / dist } : unitAgainst(vel);
          pos = { x: b.x + nrm.x * (b.r + R), y: b.y + nrm.y * (b.r + R) };
          const vn = dot(vel, nrm);
          if (vn < 0) {
            vel = { x: vel.x - (1 + PHYS.bumperBounce) * vn * nrm.x, y: vel.y - (1 + PHYS.bumperBounce) * vn * nrm.y };
            if (!hit.has(`b${i}`)) events.push({ frame, kind: 'bumper' });
            hit.add(`b${i}`);
          }
          moved = true;
        });
        if (!moved) break;
      }
      // The cup.
      const toCup = distance(pos, hole.cup);
      const speed = len(vel);
      if (toCup <= PHYS.cupR) {
        // A ball that has just lipped out rides on over the rim: it cannot drop on the same pass.
        if (lipped) {
          // still on its way out
        } else if (speed <= PHYS.captureSpeed) {
          outcome = 'cup';
          events.push({ frame, kind: 'cup' });
        } else {
          // Too fast: it rides the lip, turns away from the hole's centre and loses speed.
          lipped = true;
          const side = cross(vel, sub(hole.cup, pos)) >= 0 ? -1 : 1;
          const a = side * PHYS.lipTurn;
          const c = Math.cos(a);
          const s = Math.sin(a);
          vel = { x: (vel.x * c - vel.y * s) * PHYS.lipKeep, y: (vel.x * s + vel.y * c) * PHYS.lipKeep };
          events.push({ frame, kind: 'lipOut' });
        }
      } else if (lipped && toCup > PHYS.cupR + R) {
        lipped = false;
      }
    }
    path.push({ ...pos });
    speeds.push(outcome === 'cup' ? Math.min(len(vel), speeds[speeds.length - 1]!) : len(vel));
    if (outcome !== null) break;

    if (len(vel) < PHYS.stopSpeed) {
      // Stopped. On the lip it drops in; off the green or pressed into a wall it goes back.
      if (distance(pos, hole.cup) <= PHYS.dropReach) {
        outcome = 'cup';
        events.push({ frame, kind: 'cup' });
      } else if (!insidePolygon(pos, hole.green)) {
        outcome = 'out';
        events.push({ frame, kind: 'out' });
      } else if (!canRest(pos, hole)) {
        outcome = 'stuck';
        events.push({ frame, kind: 'stuck' });
      } else {
        outcome = 'rest';
      }
      speeds[speeds.length - 1] = 0;
    } else if (!insidePolygon(pos, hole.green) || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      // Never expected (the rails hold it); a guard so nothing can leave the learner stuck.
      outcome = 'out';
      events.push({ frame, kind: 'out' });
    }
  }
  if (outcome === null) {
    outcome = 'stuck';
    events.push({ frame: path.length - 1, kind: 'stuck' });
  }
  if (outcome === 'cup') {
    // The drop: the ball slides to the cup's centre over a few frames.
    const from2 = path[path.length - 1]!;
    const v0 = speeds[speeds.length - 1]!;
    for (let i = 1; i <= PHYS.dropFrames; i++) {
      const t = i / PHYS.dropFrames;
      path.push({ x: from2.x + (hole.cup.x - from2.x) * t, y: from2.y + (hole.cup.y - from2.y) * t });
      speeds.push(v0 * (1 - t));
    }
  }
  const rest = outcome === 'cup' ? { ...hole.cup } : outcome === 'rest' ? { ...path[path.length - 1]! } : { ...start };
  return { path: sanitize(path, start), speeds, events, outcome, rest };
}

/** A unit vector against the motion (for the rare exact overlap with no direction to push). */
function unitAgainst(v: Vec): Vec {
  const l = len(v);
  return l > 1e-9 ? { x: -v.x / l, y: -v.y / l } : { x: 0, y: -1 };
}

/** No point of a path is ever not a number (a guard; the property tests check it never triggers). */
function sanitize(path: Vec[], fallback: Vec): Vec[] {
  return path.map((p) => (Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { ...fallback }));
}

/** The angle from a point to another (course coordinates). */
export const angleTo = (from: Vec, to: Vec) => Math.atan2(to.y - from.y, to.x - from.x);

/** Seconds a path takes to play at its fixed timestep. */
export const pathSeconds = (r: Pick<ShotResult, 'path'>) => Math.max(0, r.path.length - 1) * PHYS.frameS;
