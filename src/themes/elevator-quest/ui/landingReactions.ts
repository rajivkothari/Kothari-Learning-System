// How a touched landing thing moves, as pure functions of the reaction's progress (0 to 1). The
// renderer (ui/LandingSpots.tsx) calls them on the UI thread every frame; tests call them in Node,
// so both agree. No React, no Skia.
//
// Every reaction starts and ends at rest, never loops, and under Reduced Motion nothing travels or
// turns: the same information arrives as a still glow or a direct change of state (ACCESSIBILITY.md).
import { PUTT_MS } from '../content/landings';

export interface Point {
  x: number;
  y: number;
}

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

/** Active between the start and the end (the still peak under Reduced Motion). */
const active = (p: number) => {
  'worklet';
  return p > 0 && p < 1;
};

/** spin: radians turned so far. Ease out (a push, then it coasts to a stop); whole turns, so it ends as it began. */
export function spinAngle(p: number, turns: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 0;
  const q = clamp01(p);
  return (1 - (1 - q) * (1 - q)) * turns * Math.PI * 2;
}

/** tilt: radians, out and back once. */
export function tiltAngle(p: number, amount: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 0;
  return Math.sin(Math.PI * clamp01(p)) * amount;
}

/**
 * bounce: how much taller the thing is than at rest (1 = rest). It only ever stretches up from its
 * base, never squashes below it, so the art underneath never shows. A big boing, then a small one.
 */
export function bounceStretch(p: number, amount: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 1;
  const q = clamp01(p);
  const lift = q < 0.55 ? Math.sin((Math.PI * q) / 0.55) : 0.35 * Math.sin((Math.PI * (q - 0.55)) / 0.45);
  return 1 + amount * Math.max(0, lift);
}

/** lower: how far the load has gone down (canvas units of `drop`): down, a pause, back up. */
export function lowerDrop(p: number, drop: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 0;
  const q = clamp01(p);
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (q < 0.4) return drop * ease(q / 0.4);
  if (q < 0.6) return drop;
  return drop * (1 - ease((q - 0.6) / 0.4));
}

/**
 * glow: the light's opacity (0 at rest). One slow rise and fall: well under 3 Hz, never a flash.
 * Reduced Motion: held still at its peak while the reaction runs.
 */
export const GLOW_PEAK = 0.5;
export function glowOpacity(p: number, reduced: boolean): number {
  'worklet';
  if (reduced) return active(p) ? GLOW_PEAK : 0;
  return GLOW_PEAK * Math.sin(Math.PI * clamp01(p));
}

/**
 * lights: lamp `i` of `n` comes on in turn (each once), they stay on, then all go out together.
 * Never a chase or a blink. Reduced Motion: all on, still, while the reaction runs.
 */
export function lampLevel(i: number, n: number, p: number, reduced: boolean): number {
  'worklet';
  if (!active(p)) return 0;
  if (reduced) return 1;
  const on = 0.05 + (0.5 * i) / Math.max(1, n);
  const rise = clamp01((p - on) / 0.08);
  const fall = clamp01((1 - p) / 0.15);
  return Math.min(rise, fall);
}

/** open: the closed and open states' opacity and the small lift of the lid as it moves (fraction of its height). */
export function openPose(open: number, reduced: boolean): { closed: number; opened: number; lift: number } {
  'worklet';
  const v = reduced ? (open >= 0.5 ? 1 : 0) : clamp01(open);
  return { closed: 1 - v, opened: v, lift: reduced ? 0 : -0.06 * Math.sin(Math.PI * v) };
}

export interface PuttPose {
  /** How far along the path the ball is (0 at rest, 1 at the hole). */
  along: number;
  /** The ball's size against rest (smaller far away, and as it drops into the cup). */
  scale: number;
  opacity: number;
  /** The cup's soft ring of light: opacity and size against the hole. */
  ring: number;
  ringScale: number;
}

/**
 * putt: the ball rolls to the hole (quick, then slowing), drops in, the cup answers with one soft
 * ring, the ball waits in the hole, then settles back at rest on its own. Rest is the same at the
 * start and the end, so the next touch putts again. Reduced Motion: a short straight move to the
 * cup, the same ring held still, then the ball is simply back.
 */
export function puttPose(p: number, reduced: boolean): PuttPose {
  'worklet';
  const ms = reduced ? PUTT_MS.reduced : PUTT_MS.normal;
  const total = ms.roll + ms.drop + ms.rest + ms.back;
  const t = clamp01(p) * total;
  const rest: PuttPose = { along: 0, scale: 1, opacity: 1, ring: 0, ringScale: 1 };
  if (p <= 0 || p >= 1) return rest;
  const sunk = ms.roll + ms.drop;
  const ringFor = (since: number): Pick<PuttPose, 'ring' | 'ringScale'> => {
    if (reduced) return { ring: 0.6, ringScale: 1 };
    const k = clamp01(since / 700);
    return { ring: 0.6 * Math.sin(Math.PI * k), ringScale: 0.7 + 0.8 * k };
  };
  if (t < ms.roll) {
    const k = t / ms.roll;
    const along = reduced ? k : 1 - (1 - k) * (1 - k);
    return { along, scale: 1 - 0.2 * along, opacity: 1, ring: 0, ringScale: 1 };
  }
  if (t < sunk) {
    const k = (t - ms.roll) / ms.drop;
    return { along: 1, scale: 0.8 * (1 - 0.6 * k), opacity: 1 - k, ...ringFor(t - ms.roll) };
  }
  if (t < sunk + ms.rest) return { along: 1, scale: 0.5, opacity: 0, ...ringFor(t - ms.roll) };
  const k = ms.back > 0 ? (t - sunk - ms.rest) / ms.back : 1;
  return { along: 0, scale: 1, opacity: k, ring: 0, ringScale: 1 };
}

/**
 * putt: the flag's stretch out from its pole (1 = rest) as the ball drops in: two soft flaps, the
 * second smaller, over about 700 ms (under 3 Hz). It only ever stretches, never shrinks, so the
 * painted flag underneath never shows. Reduced Motion: still.
 */
export const FLAG_STRETCH = 0.15;
export function flagStretch(p: number, reduced: boolean): number {
  'worklet';
  if (reduced || p <= 0 || p >= 1) return 1;
  const ms = PUTT_MS.normal;
  const t = clamp01(p) * (ms.roll + ms.drop + ms.rest + ms.back) - ms.roll;
  const k = t / 700;
  if (k <= 0 || k >= 1) return 1;
  const flap = k < 0.5 ? Math.sin(Math.PI * (k / 0.5)) : 0.45 * Math.sin(Math.PI * ((k - 0.5) / 0.5));
  return 1 + FLAG_STRETCH * Math.max(0, flap);
}

/**
 * slide: a drawer slides out toward you, waits a moment, and slides back. Its strip of the art grows
 * about its centre (`scale`, never below 1, up to 1 + SLIDE_GROW) and sits lower (`dy`, a fraction
 * of its height), never more than half the growth, so the grown strip still covers the painted
 * drawer underneath. Reduced Motion: still (a glow shows the touch instead).
 */
export const SLIDE_GROW = 0.3;
export function slidePose(p: number, reduced: boolean): { scale: number; dy: number } {
  'worklet';
  if (reduced) return { scale: 1, dy: 0 };
  const q = clamp01(p);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const out = q < 0.3 ? ease(q / 0.3) : q < 0.6 ? 1 : 1 - ease((q - 0.6) / 0.4);
  const scale = 1 + SLIDE_GROW * out;
  return { scale, dy: (scale - 1) * 0.5 };
}

/**
 * The putt's path: a gentle curve from the ball to the hole (a putt that breaks a little), as a
 * quadratic curve whose bend is a sixth of the distance, to the left of the line of travel.
 */
export function puttPoint(from: Point, to: Point, along: number): Point {
  'worklet';
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c = { x: mx + dy / 6, y: my - dx / 6 };
  const t = clamp01(along);
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y };
}
