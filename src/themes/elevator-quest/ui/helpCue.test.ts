// Audit P1: the help offer must be visible on Fire (Android ignores iOS shadows) and never by
// color alone. Reduced motion holds the same cue still.
import { helpCue } from './helpCue';

describe('help-offer cue', () => {
  const idle = helpCue('HINT', false, false);
  const offered = helpCue('HINT', true, false);
  const still = helpCue('HINT', true, true);

  it('an offer changes shape, not only color: thicker border, a ring, and a badge icon', () => {
    expect(offered.borderWidth).toBeGreaterThan(idle.borderWidth);
    expect([offered.ring, offered.badge]).toEqual([true, true]);
    expect([idle.ring, idle.badge]).toEqual([false, false]);
    expect(Object.keys(offered).some((k) => /shadow|glow|elevation/i.test(k))).toBe(false);
  });

  it('breathes slowly, far below 3 Hz, and never fades out completely', () => {
    expect(offered.pulse).not.toBeNull();
    expect(1000 / offered.pulse!.periodMs).toBeLessThanOrEqual(1);
    expect(Math.min(...offered.pulse!.ringOpacity)).toBeGreaterThan(0.3);
    expect(offered.pulse!.scale[1] - offered.pulse!.scale[0]).toBeLessThanOrEqual(0.08);
  });

  it('reduced motion: the same static cue, with no animation', () => {
    expect(still.pulse).toBeNull();
    expect({ ...still, pulse: null }).toEqual({ ...offered, pulse: null });
    expect(still.ringOpacity).toBe(1);
  });

  it('screen readers hear the offer once, and the button says it is ready', () => {
    expect(offered.accessibilityLabel).toMatch(/ready/i);
    expect(offered.announcement).toMatch(/help is ready/i);
    expect(idle.announcement).toBeNull();
  });
});
