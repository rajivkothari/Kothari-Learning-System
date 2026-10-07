// The touchable thing on a landing (free ride, doors open). The object itself is the button: a
// dashed ring marks it until it has been inspected, then a quiet ring and a check remain. The touch
// area is never smaller than the minimum target, even when the object is drawn small. The press
// shows on the UI thread at once; what the landing does is the director's reaction.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Box } from './layout';
import { TOKENS as T, eq } from './palette';

/** Grow `hit` around its centre to at least the minimum touch target, kept inside `bounds`. */
export function hotspotTarget(hit: Box, bounds: Box, min = T.minTouchTarget): Box {
  const width = Math.min(bounds.width, Math.max(min, hit.width));
  const height = Math.min(bounds.height, Math.max(min, hit.height));
  const cx = hit.x + hit.width / 2;
  const cy = hit.y + hit.height / 2;
  const x = Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, cx - width / 2));
  const y = Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, cy - height / 2));
  return { x, y, width, height };
}

export function hotspotLabel(object: string, inspected: boolean): string {
  return inspected ? `${object}, inspected. Touch it again to watch it work.` : `Inspect the ${object}`;
}

export const Hotspot = memo(function Hotspot({ hit, target, object, inspected, onPress, label }: { hit: Box; target: Box; object: string; inspected: boolean; onPress: () => void; label?: string }) {
  const pressed = useSharedValue(0);
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .onBegin(() => {
      'worklet';
      pressed.set(1);
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 160 }));
    });
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * pressed.get() }] }));
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label ?? hotspotLabel(object, inspected)}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onPress}
        style={[styles.target, { left: target.x, top: target.y, width: target.width, height: target.height }]}
      >
        <Animated.View pointerEvents="none" style={[styles.ring, inspected ? styles.ringDone : styles.ringNew, { left: hit.x - target.x, top: hit.y - target.y, width: hit.width, height: hit.height }, ringStyle]}>
          {inspected ? (
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
  check: { position: 'absolute', right: -9, top: -9, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.ok },
  checkText: { color: eq.night, fontSize: 13, fontWeight: '900', lineHeight: 16 },
});
