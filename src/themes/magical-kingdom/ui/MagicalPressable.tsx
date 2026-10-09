import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

interface Props extends Omit<ViewProps, 'style'> {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}
/** One gesture family for all kingdom controls: a drag must never strand RN-web's touch responder. */
export function MagicalPressable({ onPress, disabled = false, style, children, accessibilityState, ...rest }: Props) {
  const scale = useSharedValue(1);
  const tap = Gesture.Tap().enabled(!disabled)
    .onBegin(() => { 'worklet'; scale.set(0.96); })
    .onEnd((_e, ok) => { 'worklet'; if (ok) runOnJS(onPress)(); })
    .onFinalize(() => { 'worklet'; scale.set(1); });
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <GestureDetector gesture={tap}><Animated.View {...rest} accessible accessibilityRole="button" accessibilityState={{ ...accessibilityState, disabled }} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { if (!disabled) onPress(); }} style={[typeof style === 'function' ? style({ pressed: false }) : style, animated]}>{children}</Animated.View></GestureDetector>;
}
