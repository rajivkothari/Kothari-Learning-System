// Large touch button whose pressed state is driven on the UI thread by the gesture
// itself. The visual response never waits for JS, React state, audio, or SQLite.
// onPress runs afterwards on the JS thread.
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { pressSignal } from '../labStore';
import { MIN_TARGET, lab } from '../theme';

declare global {
  var _getAnimationTimestamp: (() => number) | undefined;
}

interface Props {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'amber' | 'success';
  size?: number;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function LabButton({ label, onPress, disabled = false, tone = 'default', size = MIN_TARGET + 12, style, accessibilityHint }: Props) {
  const pressed = useSharedValue(0);
  const base = tone === 'amber' ? lab.amberDim : tone === 'success' ? '#1F5C46' : lab.steel;
  const active = tone === 'amber' ? lab.amber : tone === 'success' ? lab.success : lab.steelLight;

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(60_000)
    .hitSlop(8)
    .onBegin(() => {
      'worklet';
      pressed.set(1); // immediate, no easing on press-in
      const now = globalThis._getAnimationTimestamp;
      if (typeof now === 'function') pressSignal.set(now());
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 140 }));
    })
    .onEnd((_e, success) => {
      'worklet';
      if (success && onPress) runOnJS(onPress)();
    });

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.07 * pressed.get() }],
    backgroundColor: interpolateColor(pressed.get(), [0, 1], [base, active]),
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => {
          if (!disabled) onPress?.();
        }}
        style={[
          styles.button,
          { minWidth: size, minHeight: size },
          animated,
          disabled && styles.disabled,
          style,
        ]}
      >
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: lab.panelBorder,
  },
  disabled: { backgroundColor: lab.disabled, borderStyle: 'dashed' },
  label: { color: lab.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  labelDisabled: { color: lab.textDim },
});
