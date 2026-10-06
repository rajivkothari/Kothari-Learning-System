// Lifty's poses. Pure: tested without rendering.
//
// Lifty is a compact maintenance robot: a boxy body, a small digital display for a face, one
// articulated arm with a pointer tip, a tool clip, and a few small status lamps. No big eyes,
// no baby proportions, no idle bouncing. States change the DISPLAY glyph, the arm, and one
// accent lamp. Every pose holds still: nothing loops except the slow system-check scan line,
// which stops under reduced motion.
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
