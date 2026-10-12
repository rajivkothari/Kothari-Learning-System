// An Engineer Secret on the landing (D194): an invisible touch over a small detail of the art. No ring,
// sparkle or outline, ever: before it is found nothing shows that it is there. A touch lights under the
// finger at once (on the UI thread, like every touch); when the director says it was found, stars burst
// from it and fade (a still star fading under Reduced Motion). Once over, nothing stays on screen.
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SECRET_BURST_MS } from '../content/landings';
import type { Box } from './layout';
import { eq } from './palette';

/** The touch is at least this big around the detail, so a small thing can still be found by a finger. */
export const SECRET_TOUCH_MIN = 48;
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

export function secretTouchArea(hit: Box, limits: Box): Box {
  const width = Math.max(hit.width, SECRET_TOUCH_MIN);
  const height = Math.max(hit.height, SECRET_TOUCH_MIN);
  const x = Math.min(limits.x + limits.width - width, Math.max(limits.x, hit.x + hit.width / 2 - width / 2));
  const y = Math.min(limits.y + limits.height - height, Math.max(limits.y, hit.y + hit.height / 2 - height / 2));
  return { x, y, width, height };
}

export interface SecretSpotProps {
  id: string;
  hit: Box;
  area: Box;
  label: string;
  /** The last find of this secret (a new seq plays the burst); `first`: the big one. */
  burst: { first: boolean; seq: number } | null;
  reduced: boolean;
  onPress: () => void;
}

export const SecretSpot = memo(function SecretSpot({ id, hit, area, label, burst, reduced, onPress }: SecretSpotProps) {
  const touch = useSharedValue(0);
  const play = useSharedValue(0);
  const seq = burst?.seq ?? 0;
  const big = burst?.first ?? false;
  useEffect(() => {
    if (seq === 0) return;
    play.set(0);
    play.set(withTiming(1, { duration: SECRET_BURST_MS[reduced ? 'reduced' : 'normal'], easing: Easing.out(Easing.quad) }));
  }, [play, seq, reduced]);
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .onBegin(() => {
      'worklet';
      // Immediate: a soft light under the finger, whatever the director decides.
      touch.set(1);
      touch.set(withTiming(0, { duration: reduced ? 150 : 400 }));
      runOnJS(onPress)();
    });
  const lightStyle = useAnimatedStyle(() => ({ opacity: 0.35 * touch.get() }));
  // Stars spring outward and fade (normal); a single star fades in place (Reduced Motion).
  const burstStyle = useAnimatedStyle(() => {
    const t = play.get();
    const shown = t > 0 && t < 1;
    return { opacity: shown ? 1 - t : 0, transform: [{ scale: reduced ? 1 : 0.5 + (big ? 1.1 : 0.6) * t }] };
  });
  const cx = hit.x + hit.width / 2 - area.x;
  const cy = hit.y + hit.height / 2 - area.y;
  const size = big ? 120 : 72;
  return (
    <GestureDetector gesture={tap}>
      <View testID={`secret-${id}`} accessible accessibilityRole="button" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onPress} style={[styles.area, { left: area.x, top: area.y, width: area.width, height: area.height }]}>
        <Animated.View pointerEvents="none" style={[styles.light, lightStyle]} />
        <Animated.View testID={seq ? `secret-burst-${id}` : undefined} pointerEvents="none" style={[styles.burst, { left: cx - size / 2, top: cy - size / 2, width: size, height: size }, burstStyle]}>
          {(reduced ? [0, 90] : RAYS).map((deg) => (
            <View key={deg} style={[styles.ray, { height: size * (reduced ? 0.5 : 0.45), transform: [{ rotate: `${deg}deg` }, { translateY: reduced ? 0 : -size * 0.22 }] }]} />
          ))}
          <View style={[styles.core, { width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11 }]} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  area: { position: 'absolute', overflow: 'visible' },
  light: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: eq.coolWhite },
  burst: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 5, borderRadius: 3, backgroundColor: eq.amberSoft },
  core: { backgroundColor: eq.amber },
});
