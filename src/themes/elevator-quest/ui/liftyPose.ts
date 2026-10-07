// Lifty's poses. Pure: tested without rendering.
//
// Lifty is a compact maintenance robot: a boxy body, a small digital display for a face, one
// articulated arm with a pointer tip, a tool clip, and a few small status lamps. No big eyes,
// no baby proportions, no bouncing. States change the DISPLAY glyph, the arm, and one accent
// lamp. Two slow loops only: the system-check scan line, and a barely visible hover (D133, a few
// pixels at 0.4 Hz, the robot's lift unit holding it up). Both stop under reduced motion.
import type { Hex, ThemeTokens } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';

export type DisplayGlyph = 'idle' | 'dots' | 'arrow' | 'level' | 'check' | 'scan';

export interface LiftyPose {
  glyph: DisplayGlyph;
  /** Display and lamp color. Concern is warm amber, never red: a wrong floor is not danger. */
  accent: Hex;
  /** Upper-arm angle in degrees from hanging down (0) to raised forward (90+). */
  shoulderDeg: number;
  /** Forearm angle relative to the upper arm. */
  elbowDeg: number;
  /** Head tilt in degrees. Small. */
  tiltDeg: number;
  /** The scan line moves only in system check, and only with normal motion. */
  scanning: boolean;
}

export function liftyPose(mood: LiftyMood, t: ThemeTokens, motion: 'normal' | 'reduced'): LiftyPose {
  const p = t.palette;
  switch (mood) {
    case 'thinking':
      return { glyph: 'dots', accent: p.accentPrimary, shoulderDeg: 20, elbowDeg: 70, tiltDeg: -4, scanning: false };
    case 'helping':
      return { glyph: 'arrow', accent: p.accentSecondary, shoulderDeg: 80, elbowDeg: 10, tiltDeg: 0, scanning: false };
    case 'concerned':
      return { glyph: 'level', accent: p.accentPrimary, shoulderDeg: 10, elbowDeg: 20, tiltDeg: 5, scanning: false };
    case 'satisfied':
      return { glyph: 'check', accent: p.success, shoulderDeg: 55, elbowDeg: 35, tiltDeg: 0, scanning: false };
    case 'systemCheck':
      return { glyph: 'scan', accent: p.accentSecondary, shoulderDeg: 30, elbowDeg: 40, tiltDeg: 0, scanning: motion === 'normal' };
    case 'neutral':
    default:
      return { glyph: 'idle', accent: p.accentSecondary, shoulderDeg: 8, elbowDeg: 12, tiltDeg: 0, scanning: false };
  }
}

/** Plain-language description for screen readers. */
export const LIFTY_A11Y: Record<LiftyMood, string> = {
  neutral: 'Lifty is ready',
  thinking: 'Lifty is working',
  helping: 'Lifty is pointing something out',
  concerned: 'Lifty is checking where we are',
  satisfied: 'Lifty shows a check mark',
  systemCheck: 'Lifty is running a system check',
};

/**
 * Lifty's hover: one slow, small rise and fall (D133). A full cycle takes 2.5 s (0.4 Hz, under the
 * 0.5 Hz ceiling and far under the 3 Hz flashing limit). The travel is 2% of the figure's size,
 * never more than 3 points. Reduced Motion: no hover at all.
 */
export const LIFTY_HOVER = { cycleMs: 2500, fraction: 0.02, maxPx: 3 } as const;

export function hoverAmplitude(size: number, reduced: boolean): number {
  return reduced ? 0 : Math.min(LIFTY_HOVER.maxPx, size * LIFTY_HOVER.fraction);
}
