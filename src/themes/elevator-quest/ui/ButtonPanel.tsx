// The car operating panel: a steel plate, floor buttons in real-panel order, and the
// DOOR OPEN / DOOR CLOSE pair. It only reports presses; the simulation decides what they do.
//
// Two looks while Concept D is under review (src/presentation/artStyle.tsx):
//   cel      the M5 plate: flat cel bands, hairlines, screws; each button draws its own bezel
//   concept  brushed steel with a bevel, an engraved name plate, and a brass bezel drawn under
//            every button by this one canvas (panelGeometry.ts mirrors the flex layout), so the
//            buttons stay native views with the same gestures, labels and 64 pt targets.
import { Canvas, Group, Line, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useArtStyle } from '../../../presentation/artStyle';
import { celBands, materialStops, withAlpha } from '../../../presentation/design/tokens';
import { FloorButton } from './FloorButton';
import { PANEL_HEADER, panelPad, panelRows, type Box } from './layout';
import { TOKENS as T, UI, eq } from './palette';
import { panelGeometry, type Cell } from './panelGeometry';

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
  reducedMotion: boolean;
  onFloor: (floor: number) => void;
  onDoorOpen: () => void;
  onDoorClose: () => void;
}

const brass = celBands(T.palette.brass, T);
const steel = materialStops(T.palette.metal, 'brushed', T);
const brassStops = materialStops(T.palette.brass, 'brushed', T);

export const ButtonPanel = memo(function ButtonPanel(p: ButtonPanelProps) {
  const art = useArtStyle();
  const concept = art === 'concept';
  const rows = useMemo(() => panelRows(p.columns), [p.columns]);
  const pad = panelPad(p.button);
  const hairlines = useMemo(() => Array.from({ length: Math.floor(p.box.height / 5) }, (_, i) => i * 5 + 2), [p.box.height]);
  const cells = useMemo(() => panelGeometry({ width: p.box.width, height: p.box.height }, p.button, p.gap, p.columns, rows.length), [p.box.width, p.box.height, p.button, p.gap, p.columns, rows.length]);
  return (
    <View style={[styles.plate, { left: p.box.x, top: p.box.y, width: p.box.width, height: p.box.height }]} accessibilityLabel="Elevator control panel">
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {concept ? (
          <>
            {/* Brushed steel plate with a bevelled edge and a soft vertical sheen. */}
            <RoundedRect x={0} y={0} width={p.box.width} height={p.box.height} r={18}>
              <LinearGradient start={vec(0, 0)} end={vec(0, p.box.height)} colors={steel.colors} positions={steel.positions} />
            </RoundedRect>
            <RoundedRect x={0} y={0} width={p.box.width} height={p.box.height} r={18} opacity={0.5}>
              <LinearGradient start={vec(0, 0)} end={vec(p.box.width, 0)} colors={[withAlpha(T.palette.light, 0.08), withAlpha(T.palette.light, 0), withAlpha(T.palette.void, 0.25)]} positions={[0, 0.45, 1]} />
            </RoundedRect>
            {hairlines.map((y) => (
              <Line key={y} p1={vec(10, y)} p2={vec(p.box.width - 10, y)} color={withAlpha(T.palette.light, 0.025)} strokeWidth={1} />
            ))}
            <RoundedRect x={3} y={3} width={p.box.width - 6} height={p.box.height - 6} r={16} color={withAlpha(T.palette.light, 0.18)} style="stroke" strokeWidth={1.5} />
            <RoundedRect x={1} y={1} width={p.box.width - 2} height={p.box.height - 2} r={17} color={eq.steelEdge} style="stroke" strokeWidth={2} />
            {/* Engraved name plate. */}
            <RoundedRect x={cells.header.x} y={cells.header.y} width={cells.header.w} height={cells.header.h} r={6}>
              <LinearGradient start={vec(0, cells.header.y)} end={vec(0, cells.header.y + cells.header.h)} colors={[withAlpha(T.palette.light, 0.16), withAlpha(T.palette.light, 0.04)]} />
            </RoundedRect>
            <RoundedRect x={cells.header.x + 0.5} y={cells.header.y + 0.5} width={cells.header.w - 1} height={cells.header.h - 1} r={6} color={eq.steelEdge} style="stroke" strokeWidth={1.5} />
            {/* Brass bezels under every button. A locked panel dims them with the faces. */}
            {cells.floors.map((c, i) => (
              <BezelShape key={i} c={c} r={p.button * 0.24} opacity={p.locked ? T.state.disabled.opacity : 1} />
            ))}
            {cells.doors.map((c, i) => (
              <BezelShape key={`door-${i}`} c={c} r={14} />
            ))}
            {[
              [12, 12],
              [p.box.width - 12, 12],
              [12, p.box.height - 12],
              [p.box.width - 12, p.box.height - 12],
            ].map(([x, y]) => (
              <RoundedRect key={`${x}-${y}`} x={x! - 3.5} y={y! - 3.5} width={7} height={7} r={3.5} color={brass.shadow} />
            ))}
          </>
        ) : (
          <>
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
          </>
        )}
      </Canvas>
      <View style={[styles.header, concept && styles.headerConcept, { height: PANEL_HEADER, marginHorizontal: pad, marginTop: pad }]}>
        <Text allowFontScaling={false} style={[styles.headerText, concept && styles.headerTextConcept]}>
          {concept ? 'SERVICE LIFT' : 'SERVICE LIFT · 20 FLOORS'}
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
                reducedMotion={p.reducedMotion}
                bezel={concept ? 'drawn' : 'own'}
                accessibilityLabel={`Floor ${floor}`}
                onPress={() => p.onFloor(floor)}
              />
            ))}
          </View>
        ))}
        <View style={[styles.row, styles.doorRow, { gap: p.gap, marginTop: p.gap }]}>
          <DoorButton kind="open" size={p.button} concept={concept} onPress={p.onDoorOpen} />
          <DoorButton kind="close" size={p.button} concept={concept} onPress={p.onDoorClose} />
        </View>
      </View>
    </View>
  );
});

function BezelShape({ c, r, opacity = 1 }: { c: Cell; r: number; opacity?: number }) {
  return (
    <Group opacity={opacity}>
      <RoundedRect x={c.x - 1} y={c.y - 1} width={c.w + 2} height={c.h + 2} r={r + 1}>
        <LinearGradient start={vec(0, c.y)} end={vec(0, c.y + c.h)} colors={brassStops.colors} positions={brassStops.positions} />
      </RoundedRect>
      <RoundedRect x={c.x - 0.5} y={c.y - 0.5} width={c.w + 1} height={c.h + 1} r={r + 1} color={brass.edge} style="stroke" strokeWidth={1.5} />
    </Group>
  );
}

function DoorButton({ kind, size, concept, onPress }: { kind: 'open' | 'close'; size: number; concept: boolean; onPress: () => void }) {
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
      <View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onPress} style={[styles.doorBezel, concept && styles.doorBezelConcept, { minWidth: size * 1.35, height: size }]}>
        <Animated.View style={[styles.doorFace, concept && styles.doorFaceConcept, face]}>
          <View style={styles.glyph}>
            {kind === 'open' ? arrow('left') : arrow('right')}
            <View style={styles.bar} />
            {kind === 'open' ? arrow('right') : arrow('left')}
          </View>
          <Text allowFontScaling={false} style={styles.doorLabel}>
            {concept ? label.replace('DOOR ', '') : label}
          </Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  plate: { position: 'absolute', borderRadius: 18, overflow: 'hidden' },
  header: { alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderRadius: 6, backgroundColor: eq.recess, borderWidth: 1, borderColor: eq.steelEdge },
  headerConcept: { backgroundColor: 'transparent', borderWidth: 0 },
  headerText: { ...UI(0.8), color: eq.textDim },
  headerTextConcept: { ...UI(0.95), color: eq.text, letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  row: { flexDirection: 'row', justifyContent: 'center' },
  doorRow: { justifyContent: 'space-between' },
  doorBezel: { flex: 1, borderRadius: 14, backgroundColor: eq.steel, borderWidth: 1.5, borderColor: eq.steelEdge, padding: 6 },
  doorBezelConcept: { backgroundColor: 'transparent', borderWidth: 0, padding: 5 },
  doorFace: { flex: 1, borderRadius: 10, backgroundColor: eq.charcoal, borderWidth: 1.5, borderColor: eq.steelEdge, alignItems: 'center', justifyContent: 'center', gap: 4 },
  doorFaceConcept: { backgroundColor: eq.recess, borderColor: 'rgba(0,0,0,0.6)', borderTopColor: 'rgba(0,0,0,0.75)', borderBottomColor: 'rgba(233,243,255,0.18)' },
  glyph: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  arrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  arrowLeft: { borderRightWidth: 11, borderRightColor: eq.text },
  arrowRight: { borderLeftWidth: 11, borderLeftColor: eq.text },
  bar: { width: 3, height: 20, backgroundColor: eq.text, marginHorizontal: 2 },
  doorLabel: { ...UI(0.75), color: eq.text },
});
