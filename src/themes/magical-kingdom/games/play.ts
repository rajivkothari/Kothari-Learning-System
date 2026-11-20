// The ball in Ice Bowling and Garden Golf. Pure: no clock, no randomness, nothing to do with learning.
// The letter is already answered when the ball rolls; this is the game's reward, and it always ends well.
//
// The lane is one unit wide each side of its middle: x runs from -1 (left edge) to 1 (right edge). The
// pins or flags stand at spots(n). The screen turns a tap on the lane into an aim (an x), or a tap on a
// pin or flag into that spot's x, and draws what these functions return.

/** How near a pin the ball must pass to knock it down (the ball and the pin are each about this wide together). */
export const REACH = 0.3;
/** How near a hole the first putt must stop to drop in; each later putt is pulled in from a little further. */
export const CLOSE = 0.2;
export const PULL = 0.1;

const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(-1, x)) : 0);
const round = (x: number) => Math.round(x * 1000) / 1000;

/** The x of each of n pins or flags, left to right. Three: -0.75, 0, 0.75. Four: -0.75, -0.25, 0.25, 0.75. */
export function spots(n: number): number[] {
  if (n <= 1) return n === 1 ? [0] : [];
  return Array.from({ length: n }, (_, i) => round(-0.75 + (1.5 * i) / (n - 1)));
}

export interface Bowl {
  /** Where the ball crosses the pins. */
  x: number;
  /** Pins this ball knocked down (indexes), left to right. */
  down: number[];
  /** Every pin is down. */
  cleared: boolean;
  /** The last ball was off the shining pin and curved to it. */
  steered: boolean;
}

/**
 * Bowling. `up[i]` says whether pin i still stands; `target` is the shining pin. The ball knocks down
 * the standing pins it reaches, and reaching the shining pin knocks them all down. The last ball always
 * reaches it: off target, it curves in.
 */
export function bowl(aim: number, up: readonly boolean[], target: number, last: boolean): Bowl {
  const xs = spots(up.length);
  const standing = xs.map((_, i) => i).filter((i) => up[i]);
  const goal = xs[target];
  let x = round(clamp(aim));
  const reaches = goal !== undefined && Math.abs(x - goal) <= REACH;
  const steered = !reaches && last && goal !== undefined;
  if (steered) x = goal;
  if (reaches || last) return { x, down: standing, cleared: true, steered };
  return { x, down: standing.filter((i) => Math.abs(x - xs[i]!) <= REACH), cleared: false, steered: false };
}

export interface Putt {
  /** Where the ball stops across the green: the hole when it drops. */
  x: number;
  sunk: boolean;
  /** The last putt was off the hole and rolled in anyway. */
  steered: boolean;
}

/**
 * Golf. `count` flags stand at spots(count); `target` is the shining flag, whose hole the ball wants.
 * `attempt` counts putts from 0. The ball drops when it stops close to the hole (a little further
 * counts on each later putt), and the last putt always drops.
 */
export function putt(aim: number, count: number, target: number, attempt: number, last: boolean): Putt {
  const hole = spots(count)[target];
  const x = round(clamp(aim));
  if (hole === undefined) return { x, sunk: last, steered: false };
  const close = Math.abs(x - hole) <= CLOSE + PULL * Math.max(0, attempt);
  if (close || last) return { x: hole, sunk: true, steered: !close };
  return { x, sunk: false, steered: false };
}
