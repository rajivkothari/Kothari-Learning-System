// A physical elevator floor button. The pressed (depressed) look is driven on the UI thread
// by the gesture itself, so it appears on the next frame no matter what JS is doing.
// Registration happens on touch-down, like a real contact closing. Illumination follows the
// simulation's state: a lit call stays lit until its floor is serviced.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { eq } from './palette';

export interface FloorButtonProps {
  label: string;
  size: number;
  lit: boolean;
  /** Car is stopped at this floor. */
  current?: boolean;
  /** Ringed by a clue. */
  highlight?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

export const FloorButton = memo(function FloorButton({ label, size, lit, current = false, highlight = false, disabled = false, accessibilityLabel, onPress }: FloorButtonProps) {
  const pressed = useSharedValue(0);

  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .hitSlop(6)
    .onBegin(() => {
      'worklet';
      pressed.set(1); // immediate: no easing on the way in
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 160 }));
    });

  const face = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * pressed.get() }],
    shadowOpacity: 0.5 - 0.35 * pressed.get(),
  }));

  const ring = lit ? eq.amber : highlight ? eq.clue : eq.steel;
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: lit, disabled }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onPress()}
        style={[styles.bezel, { width: size, height: size, borderRadius: size / 2 }, highlight && !lit && styles.clueBezel, disabled && styles.disabled]}
      >
        <Animated.View style={[styles.face, { width: size - 12, height: size - 12, borderRadius: (size - 12) / 2, borderColor: ring }, lit && styles.litFace, face]}>
          <Text allowFontScaling={false} style={[styles.label, { fontSize: Math.round(size * 0.36) }, lit && styles.litLabel, disabled && styles.disabledLabel]}>
            {label}
          </Text>
          {current ? <View style={styles.currentDot} /> : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  bezel: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: eq.brushedA,
    borderWidth: 1,
    borderColor: eq.steelLight,
  },
  clueBezel: { borderColor: eq.clue, borderWidth: 3 },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: eq.charcoal,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  litFace: { backgroundColor: '#24190A', shadowColor: eq.amber, shadowRadius: 10, shadowOpacity: 0.9 },
  label: { color: eq.text, fontWeight: '700', letterSpacing: 0.5 },
  litLabel: { color: eq.amberSoft },
  disabled: { opacity: 0.4 },
  disabledLabel: { color: eq.textDim },
  currentDot: { position: 'absolute', bottom: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: eq.coolWhite },
});
