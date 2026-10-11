import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { magic as P } from './palette';

export interface DropZone { x: number; y: number; width: number; height: number }
export function DragToken({ label, onPlace, target, disabled, children, selected = false, testID }: { label: string; onPlace: () => void; target: () => DropZone | null; disabled: boolean; selected?: boolean; children: React.ReactNode; testID?: string }) {
  const x = useSharedValue(0), y = useSharedValue(0);
  const drop = (atX: number, atY: number) => {
    const z = target();
    if (!disabled && z && atX >= z.x && atX <= z.x + z.width && atY >= z.y && atY <= z.y + z.height) onPlace();
  };
  const pan = Gesture.Pan().enabled(!disabled).minDistance(7)
    .onUpdate((e) => { 'worklet'; x.set(e.translationX); y.set(e.translationY); })
    .onEnd((e) => { 'worklet'; runOnJS(drop)(e.absoluteX, e.absoluteY); })
    .onFinalize(() => { 'worklet'; x.set(0); y.set(0); });
  const tap = Gesture.Tap().enabled(!disabled).onEnd((_e, ok) => { 'worklet'; if (ok) runOnJS(onPlace)(); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }], zIndex: x.get() || y.get() ? 30 : 5 }));
  return <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
    <Animated.View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { if (!disabled) onPlace(); }} testID={testID} style={[styles.token, selected && styles.selected, disabled && styles.disabled, style]}>
      <View pointerEvents="none">{children}</View>
    </Animated.View>
  </GestureDetector>;
}
const styles = StyleSheet.create({ wrap: { zIndex: 5 }, token: { width: 68, height: 76, borderRadius: 18, backgroundColor: P.paper, borderWidth: 2, borderColor: P.edge, alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${P.shadow}` }, selected: { borderColor: P.deep, borderWidth: 3, backgroundColor: P.ice }, disabled: { opacity: 0.35 }, pressed: { transform: [{ scale: 0.94 }] } });
