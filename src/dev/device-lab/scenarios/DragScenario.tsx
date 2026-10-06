// Scenario 4: drag a crate onto a bay. Approximates future letter tiles, puzzle
// pieces, and manipulatives. Position lives in logical stage units, so resizing the
// window mid-session keeps the crate in the right place.
import { BlurMask, Canvas, Group, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Size, StageFit } from '../../../presentation/layout/stageLayout';
import { LabButton } from '../components/LabButton';
import { StageView } from '../components/StageView';
import { shouldSnap } from '../geometry';
import { lab } from '../theme';

const HOME = { x: 420, y: 640 };
const TARGET = { x: 1180, y: 560 };
const CRATE = 220; // logical units
const SNAP_RADIUS = 170; // forgiving: most of a crate width
const HIT_SLOP = 24; // points, beyond the visible crate

export function DragScenario() {
  const [status, setStatus] = useState<'idle' | 'dragging' | 'snapped' | 'missed'>('idle');
  const crateX = useSharedValue(HOME.x);
  const crateY = useSharedValue(HOME.y);
  const lifted = useSharedValue(0);
  const success = useSharedValue(0);

  const reset = () => {
    crateX.set(withSpring(HOME.x));
    crateY.set(withSpring(HOME.y));
    success.set(withTiming(0, { duration: 200 }));
    setStatus('idle');
  };

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <StageView>
          {({ fit, container }) => (
            <DragStage
              fit={fit}
              container={container}
              crateX={crateX}
              crateY={crateY}
              lifted={lifted}
              success={success}
              onStatus={setStatus}
            />
          )}
        </StageView>
      </View>
      <View style={styles.bar}>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {status === 'snapped'
            ? 'Locked in. The crate snapped to the bay.'
            : status === 'missed'
              ? 'Not quite. The crate returned home.'
              : status === 'dragging'
                ? 'Dragging...'
                : 'Drag the crate onto the glowing bay.'}
        </Text>
        <LabButton label="Reset" onPress={reset} size={64} />
      </View>
    </View>
  );
}

type SV = SharedValue<number>;

function DragStage({
  fit,
  container,
  crateX,
  crateY,
  lifted,
  success,
  onStatus,
}: {
  fit: StageFit;
  container: Size;
  crateX: SV;
  crateY: SV;
  lifted: SV;
  success: SV;
  onStatus: (s: 'idle' | 'dragging' | 'snapped' | 'missed') => void;
}) {
  // Mirror the current fit into shared values so worklets convert points <-> stage units.
  const scale = useSharedValue(fit.scale);
  const offX = useSharedValue(fit.stage.x);
  const offY = useSharedValue(fit.stage.y);
  useEffect(() => {
    scale.set(fit.scale);
    offX.set(fit.stage.x);
    offY.set(fit.stage.y);
  }, [fit.scale, fit.stage.x, fit.stage.y, offX, offY, scale]);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop(HIT_SLOP)
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          lifted.set(1); // immediate lift feedback on touch down
          startX.set(crateX.get());
          startY.set(crateY.get());
        })
        .onStart(() => {
          'worklet';
          runOnJS(onStatus)('dragging');
        })
        .onUpdate((e) => {
          'worklet';
          if (scale.get() === 0) return;
          crateX.set(startX.get() + e.translationX / scale.get());
          crateY.set(startY.get() + e.translationY / scale.get());
        })
        .onEnd(() => {
          'worklet';
          if (shouldSnap({ x: crateX.get(), y: crateY.get() }, TARGET, SNAP_RADIUS)) {
            crateX.set(withSpring(TARGET.x, { damping: 18 }));
            crateY.set(withSpring(TARGET.y, { damping: 18 }));
            success.set(withTiming(1, { duration: 250 }));
            runOnJS(onStatus)('snapped');
          } else {
            crateX.set(withSpring(HOME.x));
            crateY.set(withSpring(HOME.y));
            success.set(withTiming(0, { duration: 150 }));
            runOnJS(onStatus)('missed');
          }
        })
        .onFinalize(() => {
          'worklet';
          lifted.set(withTiming(0, { duration: 160 }));
        }),
    [crateX, crateY, lifted, onStatus, scale, startX, startY, success],
  );

  const crateStyle = useAnimatedStyle(() => {
    const size = CRATE * scale.get();
    return {
      position: 'absolute',
      width: size,
      height: size,
      left: offX.get() + crateX.get() * scale.get() - size / 2,
      top: offY.get() + crateY.get() * scale.get() - size / 2,
      transform: [{ scale: 1 + 0.08 * lifted.get() }],
      shadowOpacity: 0.25 + 0.3 * lifted.get(),
      elevation: 4 + 8 * lifted.get(),
    };
  });

  const bayGlow = useDerivedValue(() => 0.25 + 0.75 * success.get());
  const stageTransform = [{ translateX: fit.stage.x }, { translateY: fit.stage.y }, { scale: fit.scale }];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={{ width: container.width, height: container.height }}>
        <Rect x={0} y={0} width={container.width} height={container.height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, container.height)} colors={['#121E33', '#1D2A40']} />
        </Rect>
        <Group transform={stageTransform}>
          <Rect x={-1400} y={780} width={4400} height={400} color={lab.concrete} />
          <Rect x={-1400} y={776} width={4400} height={8} color={lab.amberDim} />
          <RoundedRect x={HOME.x - CRATE / 2 - 20} y={HOME.y - CRATE / 2 - 20} width={CRATE + 40} height={CRATE + 40} r={20} color="#22304A" />
          <Group opacity={bayGlow}>
            <RoundedRect
              x={TARGET.x - CRATE / 2 - 24}
              y={TARGET.y - CRATE / 2 - 24}
              width={CRATE + 48}
              height={CRATE + 48}
              r={24}
              color={lab.success}
              style="stroke"
              strokeWidth={10}
            >
              <BlurMask blur={10} style="solid" />
            </RoundedRect>
          </Group>
        </Group>
      </Canvas>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.crate, crateStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Supply crate"
          accessibilityHint="Drag onto the glowing bay. Screen reader users can double-tap to place it."
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => {
            crateX.set(withSpring(TARGET.x, { damping: 18 }));
            crateY.set(withSpring(TARGET.y, { damping: 18 }));
            success.set(withTiming(1, { duration: 250 }));
            onStatus('snapped');
          }}
        >
          <Text style={styles.crateLabel} numberOfLines={1} adjustsFontSizeToFit>
            CRATE
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    backgroundColor: lab.panel,
    borderTopWidth: 1,
    borderTopColor: lab.panelBorder,
  },
  status: { color: lab.text, fontSize: 18, flexShrink: 1 },
  crate: {
    backgroundColor: '#B07A3A',
    borderRadius: 14,
    borderWidth: 4,
    borderColor: '#6E4A20',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
  },
  crateLabel: { color: '#FFF4E0', fontWeight: '800', fontSize: 22, paddingHorizontal: 6 },
});
