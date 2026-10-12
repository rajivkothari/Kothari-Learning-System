// A touchable thing on a landing (doors open). The object itself is the button, and no outline sits
// around it (D191: the rooms read as places, not worksheets). What says "touch me" is contextual:
//   arrival   an undiscovered thing glows softly once as the landing appears (none under Reduced Motion)
//   sparkle   a small star twinkles slowly at its corner until it has been inspected (still, under Reduced Motion)
//   touch     a strong light and a press-in the moment a finger lands, every time, on the UI thread
//   Lifty     while Lifty names the thing ("Try tapping the big gear"), a soft ring shows where it is
// The touch area is never smaller than the minimum target, even when the object is drawn small. What
// the landing does is the director's reaction (director/landingTouch.ts). An answer target (a
// read-and-touch job) never shows a check or anything that says right or wrong; after SHOW ME the
// thing shown glows: a thick cyan ring and a soft fill, steady.
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import type { Box } from './layout';
import { TOKENS as T, eq } from './palette';
import { hotspotTarget } from './touchAreas';

/** The touch area math lives in ui/touchAreas.ts (pure, tested at every window size). */
export { hotspotTarget };

/** The light around something small (a golf ball) is at least this big, so it reads. */
const RING_MIN = 40;

export function hotspotLabel(object: string, inspected: boolean): string {
  return inspected ? `${object}, inspected. Touch it again to watch it work.` : `Inspect the ${object}`;
}

export interface HotspotProps {
  hit: Box;
  target: Box;
  object: string;
  inspected: boolean;
  onPress: () => void;
  label?: string;
  variant?: 'explore' | 'answer';
  /** SHOW ME pointed at this answer target: it glows until the job is answered. */
  glow?: boolean;
  /** Reduced Motion: the touch pulse is a short fade; no arrival glow; the sparkle holds still. */
  reduced?: boolean;
  /** Lifty is naming this thing now: a soft ring shows where it is (D191). */
  hinted?: boolean;
  testID?: string;
}

/** The touch pulse on an answer target: one soft light, then rest (never repeated, far under 3 Hz). */
export const PULSE_MS = { normal: 600, reduced: 150 } as const;
/** The arrival glow (once) and the sparkle's slow twinkle (2.4 s a cycle: far under 3 Hz). */
export const ARRIVAL_MS = 1_400;
const SPARKLE_MS = 1_200;

export const Hotspot = memo(function Hotspot({ hit, target, object, inspected, onPress, label, variant = 'explore', glow = false, reduced = false, hinted = false, testID }: HotspotProps) {
  const done = inspected && variant === 'explore';
  const ring = hotspotTarget(hit, target, RING_MIN);
  const pressed = useSharedValue(0);
  const pulse = useSharedValue(0);
  const arrival = useSharedValue(0);
  const twinkle = useSharedValue(1);
  const pulseMs = reduced ? PULSE_MS.reduced : PULSE_MS.normal;
  // Once, as the landing appears: an undiscovered thing glows softly and settles.
  useEffect(() => {
    if (done || reduced) return;
    arrival.set(withSequence(withDelay(250, withTiming(1, { duration: ARRIVAL_MS * 0.35, easing: Easing.out(Easing.quad) })), withTiming(0, { duration: ARRIVAL_MS * 0.65, easing: Easing.in(Easing.quad) })));
    return () => cancelAnimation(arrival);
  }, [arrival, done, reduced]);
  // The sparkle until it is found: a slow twinkle, still under Reduced Motion.
  useEffect(() => {
    if (done || reduced) {
      twinkle.set(1);
      return;
    }
    twinkle.set(withRepeat(withTiming(0.35, { duration: SPARKLE_MS, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(twinkle);
  }, [twinkle, done, reduced]);
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .onBegin(() => {
      'worklet';
      pressed.set(1);
      // Every touch lights the thing at once, whatever it is and whatever the answer.
      pulse.set(1);
      pulse.set(withTiming(0, { duration: pulseMs }));
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 160 }));
    });
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * pressed.get() }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.5 * pulse.get() }));
  const arrivalStyle = useAnimatedStyle(() => ({ opacity: 0.32 * arrival.get() }));
  const sparkleStyle = useAnimatedStyle(() => ({ opacity: twinkle.get() }));
  const ringBox = { left: ring.x - target.x, top: ring.y - target.y, width: ring.width, height: ring.height };
  return (
    <GestureDetector gesture={tap}>
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label ?? hotspotLabel(object, inspected)}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onPress}
        style={[styles.target, { left: target.x, top: target.y, width: target.width, height: target.height }]}
      >
        {glow ? <View testID={testID ? `${testID}-shown` : undefined} pointerEvents="none" style={[styles.ring, styles.glow, ringBox]} /> : null}
        {done ? null : <Animated.View pointerEvents="none" style={[styles.ring, styles.arrival, ringBox, arrivalStyle]} />}
        <Animated.View pointerEvents="none" style={[styles.ring, styles.pulse, ringBox, pulseStyle, ringStyle]} />
        {glow ? <View pointerEvents="none" style={[styles.ring, styles.ringShown, ringBox]} /> : hinted ? <View testID={testID ? `hinted:${testID}` : undefined} pointerEvents="none" style={[styles.ring, styles.hinted, ringBox]} /> : null}
        {done ? null : (
          <Animated.View testID={testID ? `sparkle:${testID}` : undefined} pointerEvents="none" style={[styles.sparkle, { left: ringBox.left + ringBox.width - 9, top: ringBox.top - 9 }, sparkleStyle]}>
            <View style={styles.sparkleV} />
            <View style={styles.sparkleH} />
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  target: { position: 'absolute' },
  ring: { position: 'absolute', borderRadius: 12 },
  // Contextual only (D191): the arrival glow, and the ring while Lifty names the thing.
  arrival: { backgroundColor: eq.coolWhite },
  hinted: { borderWidth: 3, borderColor: eq.clue, opacity: 0.9 },
  // A small four-point star at the thing's corner: something here is still to find (shape, not colour alone).
  sparkle: { position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  sparkleV: { position: 'absolute', width: 4, height: 18, borderRadius: 2, backgroundColor: eq.amberSoft },
  sparkleH: { position: 'absolute', width: 18, height: 4, borderRadius: 2, backgroundColor: eq.amberSoft },
  // SHOW ME: the thing shown glows. A thick solid cyan ring (the clue ring, here on the answer: the
  // demonstrated step, ART_DIRECTION.md) over a soft fill. Steady: no pulse.
  ringShown: { borderWidth: T.state.clue.widthPx + 1, borderColor: eq.clue },
  glow: { backgroundColor: eq.clue, opacity: 0.25 },
  // The touch pulse: the thing lights once under the finger, whatever the answer.
  pulse: { backgroundColor: eq.coolWhite },
});
