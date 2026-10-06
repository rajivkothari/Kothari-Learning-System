// The car operating panel: brushed steel plate, floor buttons in real-panel order, and the
// DOOR OPEN / DOOR CLOSE pair. It only reports presses; the simulation decides what they do.
import { Canvas, Line, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { FloorButton } from './FloorButton';
import { PANEL_HEADER, panelPad, panelRows, type Box } from './layout';
import { eq } from './palette';

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
  onFloor: (floor: number) => void;
  onDoorOpen: () => void;
  onDoorClose: () => void;
}

export const ButtonPanel = memo(function ButtonPanel(p: ButtonPanelProps) {
  const rows = useMemo(() => panelRows(p.columns), [p.columns]);
  const pad = panelPad(p.button);
  const hairlines = useMemo(() => Array.from({ length: Math.floor(p.box.height / 5) }, (_, i) => i * 5 + 2), [p.box.height]);
  return (
    <View style={[styles.plate, { left: p.box.x, top: p.box.y, width: p.box.width, height: p.box.height }]} accessibilityLabel="Elevator control panel">
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <RoundedRect x={0} y={0} width={p.box.width} height={p.box.height} r={18}>
          <LinearGradient start={vec(0, 0)} end={vec(p.box.width, p.box.height)} colors={[eq.brushedA, eq.brushedB, eq.brushedA]} />
        </RoundedRect>
        {hairlines.map((y) => (
          <Line key={y} p1={vec(10, y)} p2={vec(p.box.width - 10, y)} color="rgba(255,255,255,0.035)" strokeWidth={1} />
        ))}
        <RoundedRect x={1} y={1} width={p.box.width - 2} height={p.box.height - 2} r={17} color={eq.steelLight} style="stroke" strokeWidth={1.5} />
      </Canvas>
      <View style={[styles.header, { height: PANEL_HEADER, marginHorizontal: pad, marginTop: pad }]}>
        <Text allowFontScaling={false} style={styles.headerText}>
          SERVICE LIFT · 20 FLOORS
        </Text>
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
  header: { alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.28)' },
  headerText: { color: eq.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  row: { flexDirection: 'row', justifyContent: 'center' },
  doorRow: { justifyContent: 'space-between' },
  doorBezel: { flex: 1, borderRadius: 14, backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steelLight, padding: 5 },
  doorFace: { flex: 1, borderRadius: 10, backgroundColor: eq.charcoal, alignItems: 'center', justifyContent: 'center', gap: 4 },
  glyph: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  arrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  arrowLeft: { borderRightWidth: 11, borderRightColor: eq.text },
  arrowRight: { borderLeftWidth: 11, borderLeftColor: eq.text },
  bar: { width: 3, height: 20, backgroundColor: eq.text, marginHorizontal: 2 },
  doorLabel: { color: eq.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
