// A touchable thing on a landing (doors open). The object itself is the button: a dashed ring marks
// it until it has been inspected, then a quiet ring and a check remain. The touch area is never
// smaller than the minimum target, even when the object is drawn small. The press shows on the UI
// thread at once; what the landing does is the director's reaction (director/landingTouch.ts).
// An answer target (a read-and-touch job) keeps the dashed ring and never shows a check: choosing
// it is an answer, and nothing about it says right or wrong before the job does. A touch on it
// lights the thing once (a single soft pulse, shorter under Reduced Motion): the touch reached it,
// whatever the answer. After SHOW ME the thing shown glows: a thick cyan ring and a soft fill, steady.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Box } from './layout';
import { TOKENS as T, eq } from './palette';
import { hotspotTarget } from './touchAreas';

/** The touch area math lives in ui/touchAreas.ts (pure, tested at every window size). */
export { hotspotTarget };

/** The ring marks the thing; around something small (a golf ball) it is this big, so its check never covers it. */
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
  /** Reduced Motion: the touch pulse is a short fade. */
  reduced?: boolean;
  testID?: string;
}

/** The touch pulse on an answer target: one soft light, then rest (never repeated, far under 3 Hz). */
export const PULSE_MS = { normal: 600, reduced: 150 } as const;

export const Hotspot = memo(function Hotspot({ hit, target, object, inspected, onPress, label, variant = 'explore', glow = false, reduced = false, testID }: HotspotProps) {
  const done = inspected && variant === 'explore';
  const ring = hotspotTarget(hit, target, RING_MIN);
  const pressed = useSharedValue(0);
  const pulse = useSharedValue(0);
  const answer = variant === 'answer';
  const pulseMs = reduced ? PULSE_MS.reduced : PULSE_MS.normal;
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .onBegin(() => {
      'worklet';
      pressed.set(1);
      if (answer) {
        pulse.set(1);
        pulse.set(withTiming(0, { duration: pulseMs }));
      }
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 160 }));
    });
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * pressed.get() }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.45 * pulse.get() }));
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
        {answer ? <Animated.View pointerEvents="none" style={[styles.ring, styles.pulse, ringBox, pulseStyle]} /> : null}
        <Animated.View pointerEvents="none" style={[styles.ring, glow ? styles.ringShown : done ? styles.ringDone : styles.ringNew, ringBox, ringStyle]}>
          {done ? (
            <View style={styles.check}>
              <Text allowFontScaling={false} style={styles.checkText}>
                ✓
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  target: { position: 'absolute' },
  ring: { position: 'absolute', borderRadius: 12 },
  // Shape and pattern, not color alone: a dashed outline means "something to look at".
  ringNew: { borderWidth: 2, borderStyle: 'dashed', borderColor: eq.coolWhite, opacity: 0.7 },
  ringDone: { borderWidth: 1, borderColor: eq.coolWhite, opacity: 0.45 },
  // SHOW ME: the thing shown glows. A thick solid cyan ring (the clue ring, here on the answer: the
  // demonstrated step, ART_DIRECTION.md) over a soft fill. Steady: no pulse.
  ringShown: { borderWidth: T.state.clue.widthPx + 1, borderColor: eq.clue },
  glow: { backgroundColor: eq.clue, opacity: 0.25 },
  // The touch pulse: the thing lights once under the finger, whatever the answer.
  pulse: { backgroundColor: eq.coolWhite },
  check: { position: 'absolute', right: -9, top: -9, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.ok },
  checkText: { color: eq.night, fontSize: 13, fontWeight: '900', lineHeight: 16 },
});
