// Strike Lab V0.1: the lane and a small deterministic bowling simulation. Pure (no React, no clock,
// no randomness): the same shot on the same rack always rolls the same way, so a playtest can compare
// shots and a test can pin outcomes. Units are metres and seconds; x runs across the lane (0 is the
// centre, + is right) and y runs from the foul line toward the pins.
//
// What the controls do (all three visibly change the path the preview draws):
//   aim    the launch angle, left to right
//   power  the launch speed; a slower ball spends longer on the lane, so spin curves it more
//   spin   a sideways push that grows down the lane (a hook), left or right
// Nothing here is evidence: it is the arcade half of the game.

export const LANE = {
  /** The playing surface between the gutters. */
  width: 1.06,
  gutter: 0.22,
  /** The head pin's distance from the foul line (shorter than a real lane: a child's shot is quick). */
  head: 15,
  /** Past this the ball and pins drop into the pit. */
  pit: 16.6,
} as const;
export const BALL_R = 0.11;
export const PIN_R = 0.07;
const DT = 1 / 240;
/** Recorded frames per second (the screen replays them). */
export const FPS = 60;
const STEP_PER_FRAME = Math.round(1 / DT / FPS);

export const AIM_MAX = 0.035; // radians either side
export const SPEED = { min: 5.5, max: 10 } as const;
const SPIN_ACCEL = 0.9; // m/s² sideways at full spin, once the hook has grown
const HOOK_FROM = 4;
const HOOK_SPAN = 6;
const ROLL_DRAG = 0.12;
const BALL_MASS = 7;
const PIN_MASS = 1.5;
const E_BALL_PIN = 0.7;
const E_PIN_PIN = 0.85;
const PIN_FRICTION = 2.6; // per second (exponential)
/** A pin moving faster than this has been knocked over. */
const KNOCK_SPEED = 0.3;
/** A struck pin always flies at least this fast (pins scatter: forgiving and fun). */
const MIN_FLY = 2.6;

export interface Shot {
  /** -1 (left) to 1 (right). */
  aim: number;
  /** 0 (soft) to 1 (strong). */
  power: number;
  /** -1 (curve left) to 1 (curve right). */
  spin: number;
}
export const STRAIGHT: Shot = { aim: 0, power: 0.6, spin: 0 };

export type RackKind = 'ten' | 'five';
export interface PinSpot {
  x: number;
  y: number;
}

const ROW = 0.264;
const GAP = 0.3048;
/** Ten pins in four rows from the head pin, or five (two in front, three behind) for the target frame. */
export function rack(kind: RackKind): PinSpot[] {
  if (kind === 'five') {
    return [
      { x: -GAP / 2, y: LANE.head },
      { x: GAP / 2, y: LANE.head },
      { x: -GAP, y: LANE.head + ROW },
      { x: 0, y: LANE.head + ROW },
      { x: GAP, y: LANE.head + ROW },
    ];
  }
  const out: PinSpot[] = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) out.push({ x: (i - r / 2) * GAP, y: LANE.head + r * ROW });
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const speedOf = (power: number) => SPEED.min + (SPEED.max - SPEED.min) * clamp(power, 0, 1);

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function launch(shot: Shot): BallState {
  const a = clamp(shot.aim, -1, 1) * AIM_MAX;
  const v = speedOf(shot.power);
  return { x: 0, y: 0, vx: v * Math.sin(a), vy: v * Math.cos(a) };
}

/** One step of the ball on its own: spin's hook grows from HOOK_FROM over HOOK_SPAN metres. */
function roll(b: BallState, spin: number, dt: number): void {
  const grow = clamp((b.y - HOOK_FROM) / HOOK_SPAN, 0, 1);
  b.vx += clamp(spin, -1, 1) * SPIN_ACCEL * grow * dt;
  const v = Math.hypot(b.vx, b.vy);
  if (v > 0) {
    const k = Math.max(0, v - ROLL_DRAG * dt) / v;
    b.vx *= k;
    b.vy *= k;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

const EDGE = LANE.width / 2;
const inGutter = (x: number) => Math.abs(x) > EDGE;

/**
 * The path the ball will take on its own (no pins), for the aim preview: points every `every` metres
 * of travel up to the pins or the gutter. `gutter` is true when it leaves the lane first.
 */
export function previewPath(shot: Shot, every = 0.75): { points: PinSpot[]; gutter: boolean } {
  const b = launch(shot);
  const points: PinSpot[] = [{ x: b.x, y: b.y }];
  let next = every;
  for (let i = 0; i < 20_000 && b.y < LANE.head; i++) {
    roll(b, shot.spin, DT);
    if (inGutter(b.x)) {
      points.push({ x: clamp(b.x, -EDGE, EDGE), y: b.y });
      return { points, gutter: true };
    }
    if (b.y >= next) {
      points.push({ x: b.x, y: b.y });
      next += every;
    }
  }
  points.push({ x: b.x, y: Math.min(b.y, LANE.head) });
  return { points, gutter: false };
}

export interface Roll {
  /** Recorded frames (FPS): the ball, and each pin's place. */
  ballX: number[];
  ballY: number[];
  /** Whether the ball is in a gutter at that frame. */
  ballGutter: boolean[];
  pinX: number[][];
  pinY: number[][];
  /** The frame each pin was knocked (or -1), and which way it fell (radians on the lane). */
  knockedAt: number[];
  fallAngle: number[];
  /** Pins standing before the roll that are down after it. */
  down: boolean[];
  gutter: boolean;
  /** The first frame the ball touched a pin, or -1. */
  firstHit: number;
  frames: number;
}

interface PinState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  present: boolean;
  down: boolean;
}

/** Elastic-ish collision of two discs along their normal (masses, restitution). */
function collide(a: { x: number; y: number; vx: number; vy: number }, ma: number, b: { x: number; y: number; vx: number; vy: number }, mb: number, e: number, minDist: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDist || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  // Push apart so they never stick.
  const push = (minDist - d) / 2;
  a.x -= nx * push * (mb / (ma + mb)) * 2;
  a.y -= ny * push * (mb / (ma + mb)) * 2;
  b.x += nx * push * (ma / (ma + mb)) * 2;
  b.y += ny * push * (ma / (ma + mb)) * 2;
  if (rel >= 0) return true;
  const j = (-(1 + e) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx;
  b.vy += (j / mb) * ny;
  return true;
}

/**
 * Roll one ball at the rack. `standing[i]` says whether pin i is up before the shot (a second ball
 * rolls at what the first left). Deterministic.
 */
export function simulate(shot: Shot, kind: RackKind, standing?: readonly boolean[]): Roll {
  const spots = rack(kind);
  const pins: PinState[] = spots.map((s, i) => ({ x: s.x, y: s.y, vx: 0, vy: 0, present: standing ? standing[i] !== false : true, down: false }));
  const b = launch(shot);
  let gutter = false;
  let ballGone = false;
  let firstHit = -1;
  const out: Roll = { ballX: [], ballY: [], ballGutter: [], pinX: pins.map(() => []), pinY: pins.map(() => []), knockedAt: pins.map(() => -1), fallAngle: pins.map(() => 0), down: pins.map(() => false), gutter: false, firstHit: -1, frames: 0 };
  const record = () => {
    out.ballX.push(b.x);
    out.ballY.push(b.y);
    out.ballGutter.push(gutter);
    pins.forEach((p, i) => {
      out.pinX[i]!.push(p.x);
      out.pinY[i]!.push(p.y);
    });
  };
  const knock = (p: PinState, i: number, frame: number) => {
    if (p.down) return;
    p.down = true;
    out.knockedAt[i] = frame;
    out.fallAngle[i] = Math.atan2(p.vy, p.vx);
    // A struck pin flies (at least MIN_FLY), so neighbours fall in a chain.
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0 && v < MIN_FLY) {
      p.vx *= MIN_FLY / v;
      p.vy *= MIN_FLY / v;
    }
  };
  record();
  let frame = 0;
  let quiet = 0;
  const maxFrames = FPS * 6;
  while (frame < maxFrames) {
    for (let s = 0; s < STEP_PER_FRAME; s++) {
      if (!ballGone) {
        if (gutter) {
          // In the gutter the ball runs straight on, below the pins.
          b.y += b.vy * DT;
        } else {
          roll(b, shot.spin, DT);
          if (inGutter(b.x) && b.y < LANE.head - 0.4) {
            gutter = true;
            b.x = Math.sign(b.x) * (EDGE + LANE.gutter / 2);
            b.vx = 0;
          }
        }
        if (b.y > LANE.pit || Math.hypot(b.vx, b.vy) < 0.2) ballGone = true;
      }
      if (!ballGone && !gutter) {
        pins.forEach((p, i) => {
          if (!p.present) return;
          if (collide(b, BALL_MASS, p, PIN_MASS, E_BALL_PIN, BALL_R + PIN_R)) {
            if (firstHit < 0) firstHit = frame;
            if (Math.hypot(p.vx, p.vy) > KNOCK_SPEED) knock(p, i, frame);
          }
        });
      }
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i]!;
        if (!p.present) continue;
        for (let j = i + 1; j < pins.length; j++) {
          const q = pins[j]!;
          if (!q.present) continue;
          if (collide(p, PIN_MASS, q, PIN_MASS, E_PIN_PIN, PIN_R * 2)) {
            if (Math.hypot(p.vx, p.vy) > KNOCK_SPEED) knock(p, i, frame);
            if (Math.hypot(q.vx, q.vy) > KNOCK_SPEED) knock(q, j, frame);
          }
        }
      }
      for (const p of pins) {
        if (!p.present || (p.vx === 0 && p.vy === 0)) continue;
        const k = Math.exp(-PIN_FRICTION * DT);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        // The side boards send a pin back in; the pit keeps it.
        const wall = EDGE + LANE.gutter;
        if (Math.abs(p.x) > wall) {
          p.x = Math.sign(p.x) * wall;
          p.vx = -p.vx * 0.5;
        }
        if (p.y > LANE.pit) {
          p.y = LANE.pit;
          p.vx = 0;
          p.vy = 0;
        }
        if (Math.hypot(p.vx, p.vy) < 0.02) {
          p.vx = 0;
          p.vy = 0;
        }
      }
    }
    frame++;
    record();
    const moving = pins.some((p) => p.present && Math.hypot(p.vx, p.vy) > 0.2);
    quiet = ballGone && !moving ? quiet + 1 : 0;
    if (quiet > FPS / 6) break;
  }
  out.frames = frame + 1;
  out.down = pins.map((p) => p.present && p.down);
  out.gutter = gutter;
  out.firstHit = firstHit;
  return out;
}
