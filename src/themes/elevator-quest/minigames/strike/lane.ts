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
//
// Arcade puzzle bowling (issue #3): a lane setup adds visible, learnable variation, never randomness:
//   formations  where the pins stand (five numbered pins across, in a V, or the classic racks)
//   surfaces    patches across the lane: oil (the ball slides, spin barely bites) and grip (spin
//               bites hard and the ball slows)
//   obstacle    a fixed post on the lane the ball bounces off, so a straight ball cannot get past it
//   bumpers     GUIDED SHOT's simpler geometry: rails instead of gutters
// The preview path draws all of them, so what a child sees is what the ball will do.

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

export type RackKind = 'ten' | 'five' | 'wide' | 'vee';
export interface PinSpot {
  x: number;
  y: number;
}

const ROW = 0.264;
const GAP = 0.3048;
/**
 * Ten pins in four rows from the head pin, or five numbered pins: two in front and three behind
 * (`five`), one row across the lane (`wide`, a split: the outside pins need an aimed ball each way),
 * or a V pointing at the bowler (`vee`: the front pin shields the middle, the back corners are far apart).
 */
export function rack(kind: RackKind): PinSpot[] {
  if (kind === 'wide') return [-2, -1, 0, 1, 2].map((i) => ({ x: i * GAP * 0.92, y: LANE.head + ROW }));
  if (kind === 'vee') return [-2, -1, 0, 1, 2].map((i) => ({ x: i * GAP * 0.85, y: LANE.head + Math.abs(i) * ROW }));
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

export type SurfaceKind = 'oil' | 'grip';
/** A patch of lane surface, a rectangle in lane metres. */
export interface Surface {
  kind: SurfaceKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** A fixed round post on the lane. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}
export interface LaneSetup {
  rack: RackKind;
  surfaces?: readonly Surface[];
  obstacle?: Obstacle | null;
  /** Rails instead of gutters (GUIDED SHOT). */
  bumpers?: boolean;
}
/** How each surface changes the roll: spin's bite and the rolling drag (multipliers). */
export const SURFACE = { oil: { hook: 0.2, drag: 0.25 }, grip: { hook: 2.2, drag: 6 } } as const;
const E_POST = 0.55;
const E_RAIL = 0.5;

/** A rack kind on a plain lane, or a full setup. */
export const setupOf = (s: RackKind | LaneSetup): LaneSetup => (typeof s === 'string' ? { rack: s } : s);
/** The surface under a point, or null (plain lane). */
export function surfaceAt(setup: LaneSetup, x: number, y: number): Surface | null {
  for (const s of setup.surfaces ?? []) if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return s;
  return null;
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

/** One step of the ball on its own: spin's hook grows from HOOK_FROM over HOOK_SPAN metres; a surface changes its bite and drag. */
function roll(b: BallState, spin: number, dt: number, setup?: LaneSetup): void {
  const grow = clamp((b.y - HOOK_FROM) / HOOK_SPAN, 0, 1);
  const surface = setup ? surfaceAt(setup, b.x, b.y) : null;
  const feel = surface ? SURFACE[surface.kind] : null;
  b.vx += clamp(spin, -1, 1) * SPIN_ACCEL * grow * (feel?.hook ?? 1) * dt;
  const v = Math.hypot(b.vx, b.vy);
  if (v > 0) {
    const k = Math.max(0, v - ROLL_DRAG * (feel?.drag ?? 1) * dt) / v;
    b.vx *= k;
    b.vy *= k;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

const EDGE = LANE.width / 2;
const inGutter = (x: number) => Math.abs(x) > EDGE;

/** A moving disc against a fixed post: pushed out and bounced. True when they touch. */
function bounceOffPost(d: { x: number; y: number; vx: number; vy: number }, r: number, post: Obstacle): boolean {
  const dx = d.x - post.x;
  const dy = d.y - post.y;
  const dist = Math.hypot(dx, dy);
  const min = r + post.r;
  if (dist >= min || dist === 0) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  d.x = post.x + nx * min;
  d.y = post.y + ny * min;
  const vn = d.vx * nx + d.vy * ny;
  if (vn < 0) {
    d.vx -= (1 + E_POST) * vn * nx;
    d.vy -= (1 + E_POST) * vn * ny;
  }
  return true;
}
/** The ball against the rails (bumpers): kept on the lane and sent back in. */
function rail(b: BallState): void {
  const lim = EDGE - BALL_R;
  if (Math.abs(b.x) > lim) {
    b.x = Math.sign(b.x) * lim;
    if (Math.sign(b.vx) === Math.sign(b.x)) b.vx = -b.vx * E_RAIL;
  }
}

/**
 * The path the ball will take on its own (no pins), for the aim preview: points every `every` metres
 * of travel up to the pins or the gutter. `gutter` is true when it leaves the lane first.
 */
export function previewPath(shot: Shot, every = 0.75, setup?: RackKind | LaneSetup): { points: PinSpot[]; gutter: boolean } {
  const s = setup ? setupOf(setup) : undefined;
  const b = launch(shot);
  const points: PinSpot[] = [{ x: b.x, y: b.y }];
  let next = every;
  for (let i = 0; i < 20_000 && b.y < LANE.head && b.vy > 0; i++) {
    roll(b, shot.spin, DT, s);
    if (s?.obstacle && bounceOffPost(b, BALL_R, s.obstacle)) {
      points.push({ x: b.x, y: b.y });
      next = b.y + every;
    }
    if (s?.bumpers) rail(b);
    else if (inGutter(b.x)) {
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
export function simulate(shot: Shot, lane: RackKind | LaneSetup, standing?: readonly boolean[]): Roll {
  const setup = setupOf(lane);
  const post = setup.obstacle ?? null;
  const spots = rack(setup.rack);
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
          roll(b, shot.spin, DT, setup);
          if (post) bounceOffPost(b, BALL_R, post);
          if (setup.bumpers) rail(b);
          else if (inGutter(b.x) && b.y < LANE.head - 0.4) {
            gutter = true;
            b.x = Math.sign(b.x) * (EDGE + LANE.gutter / 2);
            b.vx = 0;
          }
        }
        // Past the pit, stopped, or sent back toward the bowler by the post: the ball is out of play.
        if (b.y > LANE.pit || b.vy <= 0 || Math.hypot(b.vx, b.vy) < 0.2) ballGone = true;
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
        if (post) bounceOffPost(p, PIN_R, post);
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

/** Whether every pin in `targets` is down after a roll (pins already down before it count as down). */
export function targetsDown(roll: Roll, targets: readonly number[], standing?: readonly boolean[]): boolean {
  return targets.length > 0 && targets.every((i) => roll.down[i] === true || (standing !== undefined && standing[i] === false));
}

/**
 * GUIDED SHOT's aim guide: a shot that knocks every target pin on this setup, searched in a fixed
 * order (straight first, then gentle spin; the aim nearest the centre first), or null. Deterministic.
 * The screen draws it as a guide line; it never moves the child's controls or bowls.
 */
export function guideShot(lane: RackKind | LaneSetup, targets: readonly number[], opts: { spin: boolean; standing?: readonly boolean[]; preferSpin?: boolean } = { spin: true }): Shot | null {
  const setup = setupOf(lane);
  const standing = opts.standing;
  const spots = rack(setup.rack);
  const up = targets.filter((i) => standing?.[i] !== false);
  if (up.length === 0) return null;
  const nearest = Math.min(...up.map((i) => spots[i]?.y ?? LANE.head));
  // Cheap first: the ball's own path (no pins) must reach the targets' row near one of them.
  const worth = (shot: Shot) => {
    const path = previewPath(shot, 0.5, setup);
    const end = path.points[path.points.length - 1]!;
    if (path.gutter || end.y < Math.min(nearest, LANE.head) - 0.05) return false;
    return up.some((i) => Math.abs((spots[i]?.x ?? 0) - end.x) < 0.45);
  };
  // A challenge about spin (Word Strike) shows a hooked shot first; otherwise the straightest that works.
  const spins = !opts.spin ? [0] : opts.preferSpin ? [-0.6, 0.6, -1, 1, 0] : [0, -0.6, 0.6, -1, 1];
  const aims = [0];
  for (let k = 1; k <= 10; k++) aims.push(-k / 10, k / 10);
  for (const spin of spins)
    for (const power of [0.7, 0.95, 0.45])
      for (const aim of aims) {
        const shot = { aim, power, spin };
        if (worth(shot) && targetsDown(simulate(shot, setup, standing), targets, standing)) return shot;
      }
  return null;
}
