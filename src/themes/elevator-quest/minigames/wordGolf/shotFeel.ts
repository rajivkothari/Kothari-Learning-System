// How a word's shot plays (D197): timings and sounds as data. Pure: the controller schedules them, the
// screen draws them, the tests check them. The flight itself is decided before it plays (fairway.ts);
// this file only says how long each part of the picture takes.
//
//   address  the golfer sets up (the word's letters settle into the club)
//   swing    backswing: anticipation, the club goes back
//   impact   the club meets the ball (golfHit)
//   flight   the ball rises and falls along an arc, longer for a longer flight
//   bounce   two small hops where it lands
//   roll     it rolls to rest (golfRoll), or splashes
//   settle   a still beat before the result card
// Reduced Motion: no swing and no arc: the ball slides to where it lands and settles (a short, plain
// move), the same sounds at the same points, fewer of them.
import type { Landing } from './fairway';

export interface ShotTiming {
  swingMs: number;
  impactMs: number;
  flightMs: number;
  bounceMs: number;
  rollMs: number;
  settleMs: number;
  /** Total: when the controller lands the ball and the result card opens. */
  totalMs: number;
  /** The arc's height at its top, as a share of the flight's length (the screen scales the ball and its shadow with it). */
  arc: number;
}

/** The parts of a shot, for a landing. Longer flights take a little longer; never more than about 2.8 s. */
export function shotTiming(l: Pick<Landing, 'flight' | 'rest' | 'land' | 'splash'>, reduced: boolean): ShotTiming {
  if (reduced) {
    const flightMs = 420;
    return { swingMs: 0, impactMs: 0, flightMs, bounceMs: 0, rollMs: 0, settleMs: 120, totalMs: flightMs + 120, arc: 0 };
  }
  const swingMs = 420;
  const impactMs = 90;
  const flightMs = Math.round(Math.min(1450, 650 + l.flight * 4));
  const rolled = Math.hypot(l.rest.x - l.land.x, l.rest.y - l.land.y);
  const bounceMs = l.splash ? 0 : 300;
  const rollMs = l.splash ? 380 : Math.round(Math.min(520, 120 + rolled * 40));
  const settleMs = 220;
  return { swingMs, impactMs, flightMs, bounceMs, rollMs, settleMs, totalMs: swingMs + impactMs + flightMs + bounceMs + rollMs + settleMs, arc: 0.22 };
}

export interface ShotBeat {
  at: number;
  slot: 'golfHit' | 'golfRoll' | 'tilePlace';
  /** A loop starts (true) or stops (false); absent for one-shot sounds. */
  loop?: boolean;
}

/** The sounds of a shot (approved slots only). The splash and the club have no slots of their own yet (D197). */
export function shotBeats(t: ShotTiming, l: Pick<Landing, 'splash'>): ShotBeat[] {
  const impact = t.swingMs;
  const touchdown = t.swingMs + t.impactMs + t.flightMs;
  const beats: ShotBeat[] = [{ at: impact, slot: 'golfHit' }];
  if (!l.splash && t.rollMs > 0) {
    beats.push({ at: touchdown + t.bounceMs, slot: 'golfRoll', loop: true });
    beats.push({ at: touchdown + t.bounceMs + t.rollMs, slot: 'golfRoll', loop: false });
  }
  return beats;
}

/** The ball's place along a shot at a time (screen and tests share it): 0..1 of the flight, then the roll. */
export function shotProgress(t: ShotTiming, ms: number): { stage: 'swing' | 'flight' | 'bounce' | 'roll' | 'rest'; k: number } {
  const a = t.swingMs + t.impactMs;
  if (ms < a) return { stage: 'swing', k: a === 0 ? 1 : ms / a };
  if (ms < a + t.flightMs) return { stage: 'flight', k: (ms - a) / t.flightMs };
  const b = a + t.flightMs;
  if (ms < b + t.bounceMs) return { stage: 'bounce', k: (ms - b) / t.bounceMs };
  const c = b + t.bounceMs;
  if (ms < c + t.rollMs) return { stage: 'roll', k: (ms - c) / t.rollMs };
  return { stage: 'rest', k: 1 };
}
