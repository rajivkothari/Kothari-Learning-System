// A physical elevator floor button: steel bezel, recessed face, engraved number, lamp ring.
// The finger-down depression runs on the UI thread from the gesture itself, so it shows on the
// next frame whatever JS is doing. Registration happens on touch-down, like a contact closing.
// Illumination follows the simulation: a lit call stays lit until serviced, then the lamp
// fades out over the light ramp instead of snapping off. See buttonLook.ts for the states.
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { motionScale } from '../../../presentation/design/tokens';
import { buttonLook, callBreath, sweepLamp } from './buttonLook';
import { TOKENS as T, eq } from './palette';

export interface FloorButtonProps {
  label: string;
  size: number;
  lit: boolean;
  /** Car is stopped at this floor. */
  current?: boolean;
  /** Ringed by a clue. */
  highlight?: boolean;
  disabled?: boolean;
  /** A hall call waits on this floor. */
  call?: boolean;
  /** This floor's landing has been inspected. */
  serviced?: boolean;
  /** Panel power sweep progress (0..1, shared by the panel) and this button's height on it (0 bottom, 1 top). */
  sweep?: SharedValue<number>;
  sweepPos?: number;
  reducedMotion?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

export const FloorButton = memo(function FloorButton({ label, size, lit, current = false, highlight = false, disabled = false, call = false, serviced = false, sweep, sweepPos = 0, reducedMotion = false, accessibilityLabel, onPress }: FloorButtonProps) {
  const look = buttonLook({ lit, current, clue: highlight, disabled, call, serviced }, T);
  const m = motionScale(T, reducedMotion ? 'reduced' : 'normal');
  const pressed = useSharedValue(0);
  const lamp = useSharedValue(look.lamp);

  useEffect(() => {
    // Lighting up is quick (the call registered); going dark is the slower "serviced" release.
    lamp.set(withTiming(look.lamp, { duration: look.lamp > lamp.get() ? m.quickMs : m.lightMs }));
  }, [lamp, look.lamp, m.quickMs, m.lightMs]);

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

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: T.state.pressed.depthPx * pressed.get() }, { scale: 1 - (1 - T.state.pressed.scale) * pressed.get() }],
  }));
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.get() }));
  // The panel sweep lights this lamp once, in its turn. Zero when no sweep is running.
  const sweepStyle = useAnimatedStyle(() => ({ opacity: sweep ? sweepLamp(sweep.get(), sweepPos, reducedMotion) : 0 }));

  // A hall call breathes slowly; reduced motion holds it still.
  const breath = useSharedValue(0);
  const callShown = look.callRing !== null;
  useEffect(() => {
    if (!callShown || reducedMotion) {
      cancelAnimation(breath);
      breath.set(0);
      return;
    }
    const period = 1000 / T.state.call.pulseHz;
    breath.set(0);
    breath.set(withRepeat(withTiming(period, { duration: period, easing: Easing.linear }), -1, false));
  }, [breath, callShown, reducedMotion]);
  const callStyle = useAnimatedStyle(() => ({ opacity: callBreath(breath.get(), T.state.call.pulseHz, reducedMotion) }));

  const r = size * 0.24;
  const inset = Math.max(6, Math.round(size * 0.1));
  const face = size - inset * 2;
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={call ? { text: 'calling the lift' } : current ? { text: 'the car is here' } : undefined}
        accessibilityHint={serviced ? 'Inspected' : undefined}
        accessibilityState={{ selected: lit, disabled }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onPress()}
        style={[styles.bezel, { width: size, height: size, borderRadius: r, backgroundColor: look.bezel, borderColor: look.rim, opacity: look.opacity }]}
      >
        {look.clueRing ? <View pointerEvents="none" style={[styles.clue, { borderRadius: r + 5, borderColor: look.clueRing, borderWidth: T.state.clue.widthPx }]} /> : null}
        {look.callRing ? (
          <Animated.View pointerEvents="none" style={[styles.clue, callStyle]}>
            <View style={[StyleSheet.absoluteFill, { borderRadius: r + 5, borderColor: look.callRing, borderWidth: T.state.call.widthPx, borderStyle: 'dashed' }]} />
            <View style={[styles.callTab, { backgroundColor: look.callRing }]}>
              <Text allowFontScaling={false} style={styles.callText}>
                CALL
              </Text>
            </View>
          </Animated.View>
        ) : null}
        {/* Cel light band on the bezel's top edge (key light from above). */}
        <View pointerEvents="none" style={[styles.bezelLight, { borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: look.bezelLight }]} />
        {/* Lamp ring behind the face. */}
        <Animated.View pointerEvents="none" style={[styles.lamp, { top: inset - 3, left: inset - 3, width: face + 6, height: face + 6, borderRadius: r * 0.8, backgroundColor: look.lampColor }, lampStyle]} />
        {sweep ? <Animated.View pointerEvents="none" style={[styles.lamp, { top: inset - 3, left: inset - 3, width: face + 6, height: face + 6, borderRadius: r * 0.8, backgroundColor: T.palette.light }, sweepStyle]} /> : null}
        <Animated.View style={[styles.face, { width: face, height: face, borderRadius: r * 0.7, backgroundColor: look.face, borderColor: look.rim }, faceStyle]}>
          <View pointerEvents="none" style={[styles.faceShade, { borderBottomLeftRadius: r * 0.7, borderBottomRightRadius: r * 0.7, backgroundColor: look.faceShade }]} />
          {look.positionLamp ? <View pointerEvents="none" style={[styles.position, { top: face * 0.12 }]} /> : null}
          {look.serviceDot ? <View pointerEvents="none" style={[styles.service, { backgroundColor: look.serviceDot, right: face * 0.1, bottom: face * 0.1 }]} /> : null}
          <Text allowFontScaling={false} style={[styles.label, { fontSize: Math.round(size * 0.38), color: look.label }]}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  bezel: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  bezelLight: { position: 'absolute', left: 0, right: 0, top: 0, height: '22%', opacity: 0.6 },
  clue: { position: 'absolute', top: -7, left: -7, right: -7, bottom: -7 },
  lamp: { position: 'absolute' },
  face: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, overflow: 'hidden' },
  faceShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' },
  position: { position: 'absolute', width: 14, height: 4, borderRadius: 2, backgroundColor: eq.coolWhite },
  service: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  callTab: { position: 'absolute', top: -9, alignSelf: 'center', paddingHorizontal: 5, borderRadius: 4 },
  callText: { color: eq.night, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  label: {
    fontWeight: '800',
    letterSpacing: 0.5,
    // Engraved: a dark lower edge on the numerals.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 0,
  },
});
