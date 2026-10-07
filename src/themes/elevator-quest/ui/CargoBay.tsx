// Loading dock and car floor for the capacity encounter. Crates move by drag or tap.
// The capacity plate and the units already aboard are the givens; the learner decides how
// many to load. The load meter appears only as help. Weighing happens on DOOR CLOSE.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { LINES } from '../content/floor15';
import type { CargoView } from '../director/director';
import type { Box } from './layout';
import { CRATE_GAP, SIDE_GAP, SIDE_HEADER, SIDE_PAD, cargoLayout, type CargoSide } from './cargoLayout';
import { UI, eq } from './palette';

export interface CargoBayProps {
  box: Box;
  cargo: CargoView;
  showMeter: boolean;
  /** Success replay: the load as a sum (for example "4 + 6 = 10"), shown on the status chip. */
  sum?: string | null;
  onLoad: () => void;
  onUnload: () => void;
}

export const CargoBay = memo(function CargoBay({ box, cargo, showMeter, sum = null, onLoad, onUnload }: CargoBayProps) {
  const onDock = cargo.waiting - cargo.loaded;
  const L = cargoLayout(box, { onDock, inCar: cargo.aboard + cargo.loaded }, showMeter);
  const size = L.crate;
  const status =
    cargo.status === 'overload' ? { text: 'OVERLOAD', color: eq.warning } : cargo.status === 'accepted' ? { text: sum ? `LOAD OK · ${sum}` : 'LOAD OK', color: eq.ok } : cargo.status === 'underload' ? { text: 'ROOM LEFT', color: eq.clue } : null;
  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <View style={[styles.side, { width: L.dock.width }]} accessibilityLabel={`Loading dock: ${onDock} crates`}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.sideTitle}>
            DOCK
          </Text>
        </View>
        <Grid side={L.dock}>
          {Array.from({ length: onDock }, (_, i) => (
            <Crate key={`d${i}`} size={size} tone="cargo" dragToward={1} scrolling={L.dock.scroll} onMove={onLoad} label="Load crate" stencil={stencilFor(cargo.loaded + i)} />
          ))}
        </Grid>
      </View>
      <View style={[styles.side, styles.car, { width: L.car.width }]} accessibilityLabel={`Car: ${cargo.aboard} units aboard, ${cargo.loaded} crates loaded`}>
        <View style={styles.header}>
          <View style={styles.plate} accessibilityLabel={`Maximum ${cargo.capacity} units`}>
            <Text allowFontScaling={false} style={styles.plateText}>
              MAX {cargo.capacity} UNITS
            </Text>
          </View>
          {status ? (
            <View style={[styles.status, { borderColor: status.color }]}>
              <Text allowFontScaling={false} style={[styles.statusText, { color: status.color }]}>
                {status.text}
              </Text>
            </View>
          ) : null}
        </View>
        <Grid side={L.car}>
          {Array.from({ length: cargo.aboard }, (_, i) => (
            <View key={`a${i}`} style={[styles.crate, { width: size, height: size }, styles.aboard]} accessibilityLabel="Unit already aboard">
              <Text allowFontScaling={false} style={styles.aboardText}>
                ON BOARD
              </Text>
            </View>
          ))}
          {Array.from({ length: cargo.loaded }, (_, i) => (
            <Crate key={`l${i}`} size={size} tone="loaded" dragToward={-1} scrolling={L.car.scroll} onMove={onUnload} label="Unload crate" stencil={stencilFor(i)} />
          ))}
        </Grid>
      </View>
      {showMeter ? <LoadMeter capacity={cargo.capacity} load={cargo.aboard + cargo.loaded} /> : null}
    </View>
  );
});

/** A side's crate grid. Scrolls vertically only when its crates cannot all fit at full size. */
function Grid({ side, children }: { side: CargoSide; children: React.ReactNode }) {
  if (!side.scroll) return <View style={styles.grid}>{children}</View>;
  return (
    <ScrollView style={{ maxHeight: side.viewportHeight }} contentContainerStyle={styles.grid} showsVerticalScrollIndicator persistentScrollbar accessibilityHint="Scroll for more crates">
      {children}
    </ScrollView>
  );
}

/** Crates read as cargo: two straps and a stencilled contents label (CABLE, PARTS, BOLTS in turn). */
const stencilFor = (i: number) => LINES.crateLabels[i % Math.max(1, LINES.crateLabels.length)] ?? '';

function Crate({ size, tone, dragToward, scrolling, onMove, label, stencil }: { size: number; tone: 'cargo' | 'loaded'; dragToward: 1 | -1; scrolling: boolean; onMove: () => void; label: string; stencil: string }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  // In a scrolling side, only a sideways drag picks a crate up; vertical swipes scroll.
  const base = Gesture.Pan().minDistance(6);
  const pan = (scrolling ? base.activeOffsetX([-12, 12]).failOffsetY([-12, 12]) : base)
    .onBegin(() => {
      'worklet';
      lifted.set(withTiming(1, { duration: 80 }));
    })
    .onUpdate((e) => {
      'worklet';
      x.set(e.translationX);
      y.set(e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      // Dropped far enough toward the other side: it moves there.
      if (e.translationX * dragToward > size * 0.9) runOnJS(onMove)();
      x.set(withSpring(0));
      y.set(withSpring(0));
    })
    .onFinalize(() => {
      'worklet';
      lifted.set(withTiming(0, { duration: 120 }));
    });
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    'worklet';
    if (ok) runOnJS(onMove)();
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: 1 + 0.08 * lifted.get() }],
    zIndex: lifted.get() > 0 ? 10 : 0,
  }));
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={onMove} style={[styles.crate, { width: size, height: size }, tone === 'loaded' ? styles.loaded : styles.cargo, style]}>
        <View style={[styles.crateSlatV, { left: size * 0.22 }]} />
        <View style={[styles.crateSlatV, { left: size * 0.74 }]} />
        <View style={styles.stencil}>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.stencilText, { fontSize: Math.max(9, Math.round(size * 0.16)) }]}>
            {stencil}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function LoadMeter({ capacity, load }: { capacity: number; load: number }) {
  const max = Math.max(capacity + 4, load);
  return (
    <View style={styles.meter} accessibilityLabel={`Load meter: ${load} of ${capacity}`}>
      {Array.from({ length: max }, (_, i) => {
        const unit = max - i;
        return <View key={unit} style={[styles.meterCell, unit <= load && (unit <= capacity ? styles.meterOn : styles.meterOver), unit === capacity && styles.meterLimit]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', flexDirection: 'row', gap: SIDE_GAP },
  side: { borderRadius: 10, backgroundColor: eq.charcoal, padding: SIDE_PAD, borderWidth: 1.5, borderColor: eq.steelEdge },
  car: { backgroundColor: eq.recess, borderColor: eq.steel },
  header: { height: SIDE_HEADER, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  sideTitle: { ...UI(0.8), color: eq.textDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CRATE_GAP },
  crate: { borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cargo: { backgroundColor: '#8A5A2B', borderWidth: 2, borderColor: '#B98245' },
  loaded: { backgroundColor: '#A8722F', borderWidth: 2, borderColor: eq.amberSoft },
  crateSlatV: { position: 'absolute', top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(0,0,0,0.3)' },
  stencil: { paddingHorizontal: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.28)' },
  stencilText: { color: eq.amberSoft, fontWeight: '900', letterSpacing: 1 },
  aboard: { backgroundColor: eq.steel, borderWidth: 2, borderColor: eq.steelLight },
  aboardText: { color: eq.text, fontSize: 8, fontWeight: '800', textAlign: 'center' },
  plate: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: '#C9CED6' },
  plateText: { color: '#1B2230', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  status: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  statusText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  meter: { width: 16, justifyContent: 'space-between', paddingVertical: 2 },
  meterCell: { flex: 1, marginVertical: 1, borderRadius: 2, backgroundColor: '#1E2633' },
  meterOn: { backgroundColor: eq.ok },
  meterOver: { backgroundColor: eq.warning },
  meterLimit: { borderTopWidth: 3, borderTopColor: '#FF6B5A' },
});
