// The maintenance shaft map: a vertical scale of every floor with the car moving on it.
// It is the second representation (a number line, standing up) and a second input: in
// shaft tasks the learner can drag the car marker or tap a floor. The panel still works.
// D201 (plan before press): during a panel job the map is where the learner marks the floor
// they mean to press (`plan`, a hollow cyan marker; `onPlan`). The job's givens stand on the
// map too (`givens`, small amber ticks with their numbers) and the move's size and direction sit
// in a tag at the top (`steps`), so counting on the map is the obvious move. Each floor row is
// also an accessible target (screen readers and the browser checks), on top of drag and tap.
// The car marker is computed per frame on the UI thread from the trip, so it moves smoothly
// and in step with the indicator.
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  /** A counting clue: count labels on the floors after `from`, `stride` floors apart (1 when absent). */
  countAlong: { from: number; direction: 'up' | 'down'; steps: number; stride?: number } | null;
  /** Success replay: waypoints drawn as hops along the shaft, `revealed` of them so far. */
  replay?: { steps: number[]; revealed: number } | null;
  /** After a miss: the move the answer made (D149), in the clue colour with its size. Never the answer. */
  mismatch?: { from: number; to: number } | null;
  interactive: boolean;
  onSelect: (floor: number) => void;
  /** D201: the floor the learner marked for this answer, or null. Drawn as a hollow cyan marker. */
  plan?: number | null;
  /** D201: the map takes a plan now (`onSelect` marks; the panel rides). Shows the caption until a floor is marked. */
  planning?: boolean;
  /** D201: floors the job names (its givens), as amber ticks with their numbers. */
  givens?: readonly number[];
  /** D201: the move's size and direction, as a tag at the top of the map. */
  steps?: { count: number; direction: 'up' | 'down' } | null;
  /** Copy for the plan caption and the screen-reader label of a marked floor. */
  words?: { caption: string; marked: (floor: number) => string; floorRow: (floor: number) => string };
}

export const ShaftMap = memo(function ShaftMap(p: ShaftMapProps) {
  const plan = p.plan ?? null;
  const givens = p.givens ?? NO_FLOORS;
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
  const shownSteps = p.replay ? p.replay.steps.slice(0, Math.max(1, p.replay.revealed)) : [];
  const waypoints = new Set(shownSteps);
  const counts = new Map<number, number>();
  if (p.countAlong) {
    const sign = p.countAlong.direction === 'down' ? -1 : 1;
    for (let i = 1; i <= p.countAlong.steps; i++) counts.set(p.countAlong.from + sign * i * (p.countAlong.stride ?? 1), i);
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
          const labeled = floor % showEvery === 0 || floor === p.minFloor || floor === p.beacon || counts.has(floor) || waypoints.has(floor) || floor === p.mismatch?.from || floor === p.mismatch?.to || floor === plan || givens.includes(floor);
          const n = counts.get(floor);
          return (
            <View key={floor} style={[styles.tickRow, { top: y - 9 }]} pointerEvents="none">
              <View style={[styles.tick, labeled && styles.tickMajor]} />
              {labeled ? (
                <Text allowFontScaling={false} style={[styles.floorLabel, p.mode === 'numberLine' && styles.floorLabelBig, floor === p.beacon && styles.beaconLabel, givens.includes(floor) && styles.givenLabel, waypoints.has(floor) && styles.waypointLabel, floor === plan && styles.planLabel]}>
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
        {/* D201: accessible floor rows while the map takes input (drag and tap still work). */}
        {p.interactive
          ? Array.from({ length: floors }, (_, i) => {
              const floor = p.maxFloor - i;
              return (
                <Pressable
                  key={`row${floor}`}
                  testID={`shaft-floor-${floor}`}
                  accessibilityRole="button"
                  accessibilityLabel={p.words ? p.words.floorRow(floor) : `Floor ${floor} on the shaft map`}
                  accessibilityState={{ selected: floor === plan }}
                  onPress={() => choose(floor)}
                  style={[styles.row, { top: yFor(floor) - rowH / 2, height: rowH }]}
                />
              );
            })
          : null}
        {/* D201: the job's givens stand on the map. */}
        {givens.map((f) => (
          <View key={`given${f}`} pointerEvents="none" style={[styles.given, { top: yFor(f) - 4 }]} accessibilityLabel={`Given: floor ${f}`} />
        ))}
        {/* D201: the move's size and direction, as a tag. */}
        {p.steps ? (
          <View pointerEvents="none" style={styles.stepsTag} testID="shaft-steps">
            <Text allowFontScaling={false} style={styles.stepsText}>
              {p.steps.direction === 'up' ? '▲' : '▼'} {p.steps.count}
            </Text>
          </View>
        ) : null}
        {/* D201: the marked floor: a hollow cyan marker beside the rail. */}
        {plan !== null ? (
          <View pointerEvents="none" style={[styles.plan, { top: yFor(plan) - 10 }]} testID={`shaft-plan-${plan}`} accessibilityLabel={p.words ? p.words.marked(plan) : `Marked floor ${plan}`}>
            <Text allowFontScaling={false} style={styles.planText}>
              {plan}
            </Text>
          </View>
        ) : null}
        {p.planning && plan === null && p.words ? (
          <View pointerEvents="none" style={styles.caption} testID="shaft-caption">
            <Text allowFontScaling={false} style={styles.captionText}>
              {p.words.caption}
            </Text>
          </View>
        ) : null}
        {p.beacon !== null ? (
          <View pointerEvents="none" style={[styles.beacon, { top: yFor(p.beacon) - 8 }]} accessibilityLabel={`Beacon on floor ${p.beacon}`}>
            <View style={styles.beaconDiamond} />
          </View>
        ) : null}
        {/* After a miss: the move the answer made, as an amber bracket beside the rail with its size. */}
        {p.mismatch ? <MismatchMark from={p.mismatch.from} to={p.mismatch.to} yFor={yFor} /> : null}
        {/* Success replay: a calm green path along the rail, one hop at a time, with each hop's size. */}
        {shownSteps.slice(1).map((to, i) => {
          const from = shownSteps[i]!;
          const top = Math.min(yFor(from), yFor(to));
          const height = Math.abs(yFor(from) - yFor(to));
          const diff = to - from;
          return (
            <View key={`hop${i}`} pointerEvents="none">
              <View style={[styles.hop, { top, height }]} />
              {Math.abs(diff) > 1 ? (
                <Text allowFontScaling={false} style={[styles.hopLabel, { top: top + height / 2 - 8 }]}>
                  {diff > 0 ? `+${diff}` : `−${-diff}`}
                </Text>
              ) : null}
            </View>
          );
        })}
        {shownSteps.map((f, i) => (
          <View key={`way${i}`} pointerEvents="none" style={[styles.waypoint, { top: yFor(f) - 6 }]} />
        ))}
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

const NO_FLOORS: readonly number[] = [];

function floorAtWorklet(y: number, pad: number, rowH: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, Math.round(max - (y - pad) / rowH + 0.5)));
}

/** The move a wrong answer made: an amber bracket from the job's floor to where the answer went. */
function MismatchMark({ from, to, yFor }: { from: number; to: number; yFor: (f: number) => number }) {
  const top = Math.min(yFor(from), yFor(to));
  const height = Math.max(2, Math.abs(yFor(from) - yFor(to)));
  const diff = to - from;
  return (
    <View pointerEvents="none" accessibilityLabel={`The answer went ${Math.abs(diff)} floors ${diff > 0 ? 'up' : 'down'} from floor ${from}`}>
      <View style={[styles.mismatch, { top, height }]} />
      <View style={[styles.mismatchEnd, { top: yFor(from) - 1 }]} />
      <View style={[styles.mismatchEnd, { top: yFor(to) - 1 }]} />
      <Text allowFontScaling={false} style={[styles.mismatchLabel, { top: top + height / 2 - 8 }]}>
        {diff > 0 ? `+${diff}` : `−${-diff}`}
      </Text>
    </View>
  );
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
  givenLabel: { color: eq.amber, fontWeight: '900' },
  planLabel: { color: eq.clue, fontWeight: '900' },
  row: { position: 'absolute', left: 0, right: 0 },
  given: { position: 'absolute', left: 8, width: 10, height: 8, borderRadius: 2, backgroundColor: eq.amber },
  stepsTag: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: eq.night, borderWidth: 1, borderColor: eq.amber },
  stepsText: { color: eq.amber, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  plan: { position: 'absolute', left: 10, width: 28, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: eq.clue, backgroundColor: eq.night, alignItems: 'center', justifyContent: 'center' },
  planText: { color: eq.clue, fontSize: 11, fontWeight: '900' },
  caption: { position: 'absolute', bottom: 6, alignSelf: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: eq.clue },
  captionText: { color: eq.night, fontSize: 8, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  count: { color: eq.clue, fontSize: 12, fontWeight: '800', marginLeft: 6 },
  waypointLabel: { color: eq.ok, fontWeight: '900', fontSize: 12 },
  hop: { position: 'absolute', left: 20, width: 8, borderRadius: 4, backgroundColor: eq.ok, opacity: 0.85 },
  mismatch: { position: 'absolute', left: 6, width: 3, borderRadius: 2, backgroundColor: eq.caution },
  mismatchEnd: { position: 'absolute', left: 6, width: 12, height: 3, borderRadius: 2, backgroundColor: eq.caution },
  mismatchLabel: { position: 'absolute', left: -4, width: 24, textAlign: 'center', color: eq.caution, fontSize: 11, fontWeight: '900', backgroundColor: eq.night, borderRadius: 4, overflow: 'hidden' },
  hopLabel: { position: 'absolute', left: 30, color: eq.ok, fontSize: 11, fontWeight: '900' },
  waypoint: { position: 'absolute', left: 18, width: 12, height: 12, borderRadius: 6, backgroundColor: eq.night, borderWidth: 3, borderColor: eq.ok },
  beacon: { position: 'absolute', left: 4, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  beaconDiamond: { width: 11, height: 11, backgroundColor: eq.amber, transform: [{ rotate: '45deg' }] },
  car: { position: 'absolute', left: 12, width: 24, height: 28, borderRadius: 4, backgroundColor: eq.amberSoft, borderWidth: 2, borderColor: eq.charcoal },
  ghost: { position: 'absolute', right: 4, minWidth: 40, height: 40, borderRadius: 20, backgroundColor: eq.clue, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: eq.night, fontSize: 18, fontWeight: '800' },
});
