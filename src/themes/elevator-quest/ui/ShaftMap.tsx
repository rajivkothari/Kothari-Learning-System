// The maintenance shaft map: a vertical scale of every floor with the car moving on it.
// It is the second representation (a number line, standing up) and a second input: in
// shaft tasks the learner can drag the car marker or tap a floor. The panel still works.
// The car marker is computed per frame on the UI thread from the trip, so it moves smoothly
// and in step with the indicator.
import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle } from 'react-native-reanimated';

import type { ElevatorState, ElevatorTiming } from '../sim/elevator';
import type { Box } from './layout';
import { eq } from './palette';
import { useTripPosition } from './useTripPosition';

export interface ShaftMapProps {
  box: Box;
  elevator: ElevatorState;
  timing: ElevatorTiming;
  minFloor: number;
  maxFloor: number;
  mode: 'status' | 'map' | 'numberLine';
  beacon: number | null;
  countAlong: { from: number; direction: 'up' | 'down'; steps: number } | null;
  interactive: boolean;
  onSelect: (floor: number) => void;
}

export const ShaftMap = memo(function ShaftMap(p: ShaftMapProps) {
  const floors = p.maxFloor - p.minFloor + 1;
  const pad = 14;
  const railH = p.box.height - pad * 2;
  const rowH = railH / floors;
  const yFor = (floor: number) => pad + (p.maxFloor - floor + 0.5) * rowH;

  // Per frame on the UI thread, and only while the car travels.
  const position = useTripPosition(p.elevator, p.timing);

  const carStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pad + (p.maxFloor - position.get() + 0.5) * rowH - 14 }] }));

  // Drag-to-select (shaft tasks only): a ghost marker shows the floor under the finger.
  const [ghost, setGhost] = useState<number | null>(null);
  const choose = (floor: number) => {
    setGhost(null);
    p.onSelect(floor);
  };
  const drag = Gesture.Pan()
    .enabled(p.interactive)
    .minDistance(4)
    .onUpdate((e) => {
      'worklet';
      runOnJS(setGhost)(floorAtWorklet(e.y, pad, rowH, p.minFloor, p.maxFloor));
    })
    .onEnd((e) => {
      'worklet';
      runOnJS(choose)(floorAtWorklet(e.y, pad, rowH, p.minFloor, p.maxFloor));
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(setGhost)(null);
    });
  const tap = Gesture.Tap()
    .enabled(p.interactive)
    .onEnd((e, ok) => {
      'worklet';
      if (ok) runOnJS(choose)(floorAtWorklet(e.y, pad, rowH, p.minFloor, p.maxFloor));
    });
  const gesture = Gesture.Exclusive(drag, tap);

  // Label every floor only when rows are tall enough to read; otherwise every fifth.
  const showEvery = p.mode === 'status' || rowH < 14 ? 5 : 1;
  const counts = new Map<number, number>();
  if (p.countAlong) {
    const sign = p.countAlong.direction === 'down' ? -1 : 1;
    for (let i = 1; i <= p.countAlong.steps; i++) counts.set(p.countAlong.from + sign * i, i);
  }

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.box, { left: p.box.x, top: p.box.y, width: p.box.width, height: p.box.height }, p.interactive && styles.interactive]}
        accessibilityLabel={p.interactive ? 'Shaft map. Drag the car or tap a floor to send the lift there.' : 'Shaft map'}
      >
        <Text allowFontScaling={false} style={styles.title}>
          SHAFT
        </Text>
        <View style={[styles.rail, { top: pad, height: railH }]} />
        {Array.from({ length: floors }, (_, i) => {
          const floor = p.maxFloor - i;
          const y = yFor(floor);
          const labeled = floor % showEvery === 0 || floor === p.minFloor || floor === p.beacon || counts.has(floor);
          const n = counts.get(floor);
          return (
            <View key={floor} style={[styles.tickRow, { top: y - 9 }]} pointerEvents="none">
              <View style={[styles.tick, labeled && styles.tickMajor]} />
              {labeled ? (
                <Text allowFontScaling={false} style={[styles.floorLabel, p.mode === 'numberLine' && styles.floorLabelBig, floor === p.beacon && styles.beaconLabel]}>
                  {floor}
                </Text>
              ) : null}
              {n !== undefined ? (
                <Text allowFontScaling={false} style={styles.count}>
                  {n}
                </Text>
              ) : null}
            </View>
          );
        })}
        {p.beacon !== null ? (
          <View pointerEvents="none" style={[styles.beacon, { top: yFor(p.beacon) - 8 }]} accessibilityLabel={`Beacon on floor ${p.beacon}`}>
            <View style={styles.beaconDiamond} />
          </View>
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.car, carStyle]} />
        {ghost !== null ? (
          <View pointerEvents="none" style={[styles.ghost, { top: yFor(ghost) - 20 }]}>
            <Text allowFontScaling={false} style={styles.ghostText}>
              {ghost}
            </Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
});

function floorAtWorklet(y: number, pad: number, rowH: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, Math.round(max - (y - pad) / rowH + 0.5)));
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderRadius: 12, backgroundColor: 'rgba(5,10,18,0.82)', borderWidth: 1, borderColor: eq.steelDark },
  interactive: { borderColor: eq.clue, borderWidth: 2 },
  title: { position: 'absolute', top: -2, alignSelf: 'center', color: eq.textDim, fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  rail: { position: 'absolute', left: 22, width: 4, borderRadius: 2, backgroundColor: eq.steel },
  tickRow: { position: 'absolute', left: 14, right: 4, height: 18, flexDirection: 'row', alignItems: 'center' },
  tick: { width: 8, height: 1, backgroundColor: eq.steelLight, marginLeft: 6 },
  tickMajor: { width: 14, height: 2, marginLeft: 3 },
  floorLabel: { color: eq.textDim, fontSize: 10, marginLeft: 6, fontWeight: '700' },
  floorLabelBig: { color: eq.text, fontSize: 13 },
  beaconLabel: { color: eq.amber },
  count: { color: eq.clue, fontSize: 12, fontWeight: '800', marginLeft: 6 },
  beacon: { position: 'absolute', left: 4, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  beaconDiamond: { width: 11, height: 11, backgroundColor: eq.amber, transform: [{ rotate: '45deg' }] },
  car: { position: 'absolute', left: 12, width: 24, height: 28, borderRadius: 4, backgroundColor: eq.amberSoft, borderWidth: 2, borderColor: eq.charcoal },
  ghost: { position: 'absolute', right: 4, minWidth: 40, height: 40, borderRadius: 20, backgroundColor: eq.clue, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: eq.night, fontSize: 18, fontWeight: '800' },
});
