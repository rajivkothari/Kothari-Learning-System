// The crown that opens Comfort: a grown-up's door. It opens only after a two-second hold, while a ring of
// gold beads fills around it; a quick tap gives a small wiggle and nothing else. A screen reader's activate
// opens it at once (the hold is a guard against a child's tap, not against assistive technology).
// Reduced Motion (`still`): the ring still fills (it is the only sign of the hold) but nothing wiggles.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { MagicIcon } from './MagicArt';
import { magic as P } from './palette';

/** How long the crown is held before Comfort opens. */
export const CROWN_HOLD_MS = 2000;
const BEADS = 16;
const SIZE = 64;
const RING = 40;

/**
 * `called`: something on screen is pointing a grown-up at the crown (a hearing game tapped while Sound is off). The crown
 * answers with a gold ring and one swell (the ring alone when pictures are still). It opens nothing: Comfort stays behind the hold.
 */
export function CrownGate({ label, still, onOpen, disabled = false, called = false }: { label: string; still: boolean; onOpen: () => void; disabled?: boolean; called?: boolean }) {
  const fill = useSharedValue(0);
  const tilt = useSharedValue(0);
  const swell = useSharedValue(1);
  useEffect(() => {
    if (called && !still) swell.set(withSequence(withTiming(1.2, { duration: 160 }), withTiming(1, { duration: 220 })));
    else swell.set(1);
  }, [called, still, swell]);
  const hold = Gesture.LongPress().enabled(!disabled).minDuration(CROWN_HOLD_MS).maxDistance(40)
    .onBegin(() => {
      'worklet';
      fill.set(withTiming(1, { duration: CROWN_HOLD_MS, easing: Easing.linear }));
    })
    .onStart(() => {
      'worklet';
      runOnJS(onOpen)();
    })
    .onFinalize((_e, opened) => {
      'worklet';
      cancelAnimation(fill);
      fill.set(0);
      if (!opened && !still) tilt.set(withSequence(withTiming(-12, { duration: 70 }), withTiming(12, { duration: 90 }), withTiming(-7, { duration: 80 }), withTiming(0, { duration: 70 })));
    });
  const crown = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }, { scale: swell.get() }] }));
  return <GestureDetector gesture={hold}>
    <Animated.View testID="comfort-crown" accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => { if (!disabled) onOpen(); }} style={s.wrap}>
      {Array.from({ length: BEADS }, (_, i) => <Bead key={i} index={i} fill={fill} />)}
      <Animated.View style={[s.button, called && s.called, crown]}><MagicIcon kind="crown" size={38} /></Animated.View>
      {called ? <View testID="comfort-crown-called" pointerEvents="none" style={s.marker} /> : null}
    </Animated.View>
  </GestureDetector>;
}

/** One bead of the ring, lit once the hold has gone past it. */
function Bead({ index, fill }: { index: number; fill: SharedValue<number> }) {
  const a = -Math.PI / 2 + (index / BEADS) * 2 * Math.PI;
  const x = SIZE / 2 + RING * Math.cos(a) - 4;
  const y = SIZE / 2 + RING * Math.sin(a) - 4;
  const lit = useAnimatedStyle(() => ({ opacity: fill.get() * BEADS > index + 0.5 ? 1 : 0 }));
  return <Animated.View pointerEvents="none" style={[s.bead, { left: x, top: y }, lit]} />;
}

const s = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
  button: { width: SIZE, height: SIZE, borderRadius: 24, borderWidth: 2, borderColor: P.edge, backgroundColor: P.paper, alignItems: 'center', justifyContent: 'center' },
  called: { borderColor: P.gold, borderWidth: 5, backgroundColor: P.cream, boxShadow: `0 0 18px ${P.gold}` },
  marker: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  bead: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: P.gold, borderWidth: 1, borderColor: P.bark, zIndex: 2 },
});
