import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { magic as P } from './palette';

/** A small child presses and holds. A press of up to this long is still a tap. */
export const PRESS_MAX_MS = 3000;

interface Props extends Omit<ViewProps, 'style'> {
  onPress: () => void;
  disabled?: boolean;
  /**
   * Held for now (the game is talking): the control still shows its press, so the touch is answered, but
   * it does not fire, and it reports `aria-disabled`. Unlike `disabled` it is not greyed by this component.
   */
  locked?: boolean;
  /** A touch came down while `locked`: the screen answers it some other way (the listening badge). Never an activation. */
  onLocked?: () => void;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}
/** One gesture family for all kingdom controls: a drag must never strand RN-web's touch responder. */
export function MagicalPressable({ onPress, disabled = false, locked = false, onLocked, style, children, accessibilityState, ...rest }: Props) {
  const scale = useSharedValue(1);
  const fire = () => { if (!locked) onPress(); };
  const held = () => { if (locked) onLocked?.(); };
  const tap = Gesture.Tap().enabled(!disabled).maxDuration(PRESS_MAX_MS)
    .onBegin(() => { 'worklet'; scale.set(0.96); runOnJS(held)(); })
    .onEnd((_e, ok) => { 'worklet'; if (ok) runOnJS(fire)(); })
    .onFinalize(() => { 'worklet'; scale.set(1); });
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const off = disabled || locked;
  return <GestureDetector gesture={tap}><Animated.View {...rest} accessible accessibilityRole="button" accessibilityState={{ ...accessibilityState, disabled: off }} aria-disabled={off} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { if (!off) onPress(); }} style={[typeof style === 'function' ? style({ pressed: false }) : style, animated]}>{children}</Animated.View></GestureDetector>;
}

/** One swell and back: about 0.4 Hz, far under the 3 Hz flashing limit. */
const SWELL_MS = 1250;
/**
 * A gold ring around a control (the ear). While `on` it swells slowly; under Reduced Motion (`still`) it is
 * a static ring; off, it is invisible and keeps its space, so nothing beside it moves when it comes and goes.
 */
export function Glow({ on, still, radius, children, testID }: { on: boolean; still: boolean; radius: number; children: ReactNode; testID?: string }) {
  const swell = useSharedValue(0);
  useEffect(() => {
    if (on && !still) swell.set(withRepeat(withTiming(1, { duration: SWELL_MS, easing: Easing.inOut(Easing.quad) }), -1, true));
    else { cancelAnimation(swell); swell.set(0); }
    return () => cancelAnimation(swell);
  }, [on, still, swell]);
  const ring = useAnimatedStyle(() => ({ opacity: !on ? 0 : still ? 1 : 0.4 + 0.6 * swell.get(), transform: [{ scale: on && !still ? 1 + 0.05 * swell.get() : 1 }] }));
  return <View style={g.wrap}>
    <Animated.View testID={on ? testID : undefined} pointerEvents="none" style={[g.ring, { borderRadius: radius + GLOW_PAD }, ring]} />
    {children}
  </View>;
}
/** The space a Glow keeps around its child on every side. */
export const GLOW_PAD = 7;
const g = StyleSheet.create({
  wrap: { padding: GLOW_PAD },
  ring: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 5, borderColor: P.gold, backgroundColor: P.transparent, boxShadow: `0 0 14px ${P.gold}` },
});
