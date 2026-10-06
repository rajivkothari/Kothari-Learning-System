// The help-offer cue. Pure: no React. Built from properties every platform renders the same way
// (border, scale, opacity, an icon). No shadow: Android ignores iOS shadow props, so a glow alone
// was invisible on Fire. No color alone: the offer also changes shape and gains a badge.
export interface HelpCue {
  /** Border width of the button face. */
  borderWidth: number;
  /** A ring drawn outside the button. */
  ring: boolean;
  /** A small badge icon on the corner of the button. */
  badge: boolean;
  /** Breathing animation, or null for a static cue (reduced motion, or no offer). */
  pulse: { periodMs: number; scale: [number, number]; ringOpacity: [number, number] } | null;
  /** Resting values when there is no pulse. */
  scale: number;
  ringOpacity: number;
  accessibilityLabel: string;
  /** Spoken once when the offer appears. */
  announcement: string | null;
}

export function helpCue(label: string, offered: boolean, still: boolean): HelpCue {
  if (!offered) return { borderWidth: 2, ring: false, badge: false, pulse: null, scale: 1, ringOpacity: 0, accessibilityLabel: `Help: ${label}`, announcement: null };
  return {
    borderWidth: 4,
    ring: true,
    badge: true,
    // 2 s per breath (0.5 Hz), far below the 3 Hz limit. Never a flash: opacity never drops to 0.
    pulse: still ? null : { periodMs: 2000, scale: [1, 1.06], ringOpacity: [0.45, 1] },
    scale: 1,
    ringOpacity: 1,
    accessibilityLabel: `Help ready: ${label}`,
    announcement: `Help is ready. ${label}.`,
  };
}
