// The car operating panel: brushed steel plate, floor buttons in real-panel order, and the
// DOOR OPEN / DOOR CLOSE pair. It only reports presses; the simulation decides what they do.
import { Canvas, Line, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SWEEP_MS } from './buttonLook';
import { FloorButton } from './FloorButton';
import { PANEL_HEADER, panelPad, panelRows, type Box } from './layout';
import { UI, eq } from './palette';

export interface ButtonPanelProps {
  box: Box;
  button: number;
  gap: number;
  columns: number;
  lit: readonly number[];
  currentFloor: number | null;
  highlights: readonly number[];
  disabledFloors: readonly number[];
  locked: boolean;
  /** The floor calling the lift (a hall call), or null. */
  hallCall?: number | null;
  /** Floors whose landing has been inspected: a quiet service dot each. */
  serviced?: readonly number[];
  /** Bumps when Floor 15 comes back: the lamps sweep bottom to top once. */
  sweep?: number;
  /** The learner's rank plate, once earned. */
  rank?: string | null;
  reducedMotion: boolean;
  onFloor: (floor: number) => void;
  onDoorOpen: () => void;
  onDoorClose: () => void;
}

export const ButtonPanel = memo(function ButtonPanel(p: ButtonPanelProps) {
  const rows = useMemo(() => panelRows(p.columns), [p.columns]);
  const pad = panelPad(p.button);
  const hairlines = useMemo(() => Array.from({ length: Math.floor(p.box.height / 5) }, (_, i) => i * 5 + 2), [p.box.height]);
  const sweep = useSharedValue(1);
  const sweepSeq = p.sweep ?? 0;
  useEffect(() => {
    if (sweepSeq === 0) return;
    sweep.set(0);
    sweep.set(withTiming(1, { duration: SWEEP_MS[p.reducedMotion ? 'reduced' : 'normal'], easing: Easing.linear }));
  }, [sweep, sweepSeq, p.reducedMotion]);
  const lowest = rows.at(-1)?.[0] ?? 1;
  const highest = rows[0]?.at(-1) ?? 20;
  return (
    <View style={[styles.plate, { left: p.box.x, top: p.box.y, width: p.box.width, height: p.box.height }]} accessibilityLabel="Elevator control panel">
      {/* Panel housing: a steel plate in flat cel bands, brushed hairlines, fixing screws. */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <RoundedRect x={0} y={0} width={p.box.width} height={p.box.height} r={18} color={eq.steel} />
        <Rect x={p.box.width * 0.62} y={0} width={p.box.width * 0.38} height={p.box.height} color={eq.steelDark} opacity={0.55} />
        <RoundedRect x={0} y={0} width={p.box.width} height={6} r={3} color={eq.steelLight} />
        {hairlines.map((y) => (
          <Line key={y} p1={vec(10, y)} p2={vec(p.box.width - 10, y)} color="rgba(255,255,255,0.03)" strokeWidth={1} />
        ))}
        {[
          [12, 12],
          [p.box.width - 12, 12],
          [12, p.box.height - 12],
          [p.box.width - 12, p.box.height - 12],
        ].map(([x, y]) => (
          <RoundedRect key={`${x}-${y}`} x={x! - 3} y={y! - 3} width={6} height={6} r={3} color={eq.steelEdge} />
        ))}
        <RoundedRect x={1} y={1} width={p.box.width - 2} height={p.box.height - 2} r={17} color={eq.steelEdge} style="stroke" strokeWidth={2} />
      </Canvas>
      <View style={[styles.header, { height: PANEL_HEADER, marginHorizontal: pad, marginTop: pad }]}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.headerText}>
          {p.rank ? 'SERVICE LIFT' : 'SERVICE LIFT · 20 FLOORS'}
        </Text>
        {p.rank ? (
          <View style={styles.rank} accessible accessibilityLabel={`Rank: ${p.rank.toLowerCase()}`}>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.rankText}>
              {p.rank}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: pad, gap: p.gap }}>
        {rows.map((row) => (
          <View key={row[0]} style={[styles.row, { gap: p.gap }]}>
            {row.map((floor) => (
              <FloorButton
                key={floor}
                label={String(floor)}
                size={p.button}
                lit={p.lit.includes(floor)}
                current={p.currentFloor === floor}
                highlight={p.highlights.includes(floor)}
                disabled={p.locked || p.disabledFloors.includes(floor)}
                call={p.hallCall === floor}
                serviced={p.serviced?.includes(floor) ?? false}
                sweep={sweep}
                sweepPos={(floor - lowest) / Math.max(1, highest - lowest)}
                reducedMotion={p.reducedMotion}
                accessibilityLabel={`Floor ${floor}`}
                onPress={() => p.onFloor(floor)}
              />
            ))}
          </View>
        ))}
        <View style={[styles.row, styles.doorRow, { gap: p.gap, marginTop: p.gap }]}>
          <DoorButton kind="open" size={p.button} onPress={p.onDoorOpen} />
          <DoorButton kind="close" size={p.button} onPress={p.onDoorClose} />
        </View>
      </View>
    </View>
  );
});

function DoorButton({ kind, size, onPress }: { kind: 'open' | 'close'; size: number; onPress: () => void }) {
  const pressed = useSharedValue(0);
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .hitSlop(6)
    .onBegin(() => {
      'worklet';
      pressed.set(1);
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 160 }));
    });
  const face = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * pressed.get() }] }));
  const label = kind === 'open' ? 'DOOR OPEN' : 'DOOR CLOSE';
  // Arrow glyphs drawn with borders: open = <|>, close = >|<
  const arrow = (dir: 'left' | 'right') => <View style={[styles.arrow, dir === 'left' ? styles.arrowLeft : styles.arrowRight]} />;
  return (
    <GestureDetector gesture={tap}>
      <View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onPress} style={[styles.doorBezel, { minWidth: size * 1.35, height: size }]}>
        <Animated.View style={[styles.doorFace, face]}>
          <View style={styles.glyph}>
            {kind === 'open' ? arrow('left') : arrow('right')}
            <View style={styles.bar} />
            {kind === 'open' ? arrow('right') : arrow('left')}
          </View>
          <Text allowFontScaling={false} style={styles.doorLabel}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  plate: { position: 'absolute', borderRadius: 18, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, borderRadius: 6, backgroundColor: eq.recess, borderWidth: 1, borderColor: eq.steelEdge, overflow: 'hidden' },
  headerText: { ...UI(0.8), color: eq.textDim, flexShrink: 1 },
  // An engraved brass plate: earned once, screwed to the panel.
  rank: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: eq.amberDim, borderWidth: 1, borderColor: eq.amber, flexShrink: 1 },
  rankText: { ...UI(0.65), color: eq.amberSoft },
  row: { flexDirection: 'row', justifyContent: 'center' },
  doorRow: { justifyContent: 'space-between' },
  doorBezel: { flex: 1, borderRadius: 14, backgroundColor: eq.steel, borderWidth: 1.5, borderColor: eq.steelEdge, padding: 6 },
  doorFace: { flex: 1, borderRadius: 10, backgroundColor: eq.charcoal, borderWidth: 1.5, borderColor: eq.steelEdge, alignItems: 'center', justifyContent: 'center', gap: 4 },
  glyph: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  arrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  arrowLeft: { borderRightWidth: 11, borderRightColor: eq.text },
  arrowRight: { borderLeftWidth: 11, borderLeftColor: eq.text },
  bar: { width: 3, height: 20, backgroundColor: eq.text, marginHorizontal: 2 },
  doorLabel: { ...UI(0.75), color: eq.text },
});
