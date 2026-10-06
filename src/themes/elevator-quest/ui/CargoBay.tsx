// Loading dock and car floor for the capacity encounter. Crates move by drag or tap.
// The capacity plate and the units already aboard are the givens; the learner decides how
// many to load. The load meter appears only as help. Weighing happens on DOOR CLOSE.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { CargoView } from '../director/director';
import type { Box } from './layout';
import { eq } from './palette';

export interface CargoBayProps {
  box: Box;
  cargo: CargoView;
  showMeter: boolean;
  onLoad: () => void;
  onUnload: () => void;
}

const MAX_CRATE = 64;
const MIN_CRATE = 46;
const GAP = 6;
const PAD = 8;
const HEADER = 34;

/** Largest crate that fits `count` items in a side of the given size. */
export function crateSize(sideWidth: number, sideHeight: number, count: number): number {
  for (let c = MAX_CRATE; c > MIN_CRATE; c -= 2) {
    const perRow = Math.max(1, Math.floor((sideWidth - PAD * 2 + GAP) / (c + GAP)));
    const rows = Math.ceil(count / perRow);
    if (rows * (c + GAP) <= sideHeight - HEADER - PAD * 2) return c;
  }
  return MIN_CRATE;
}

export const CargoBay = memo(function CargoBay({ box, cargo, showMeter, onLoad, onUnload }: CargoBayProps) {
  const onDock = cargo.waiting - cargo.loaded;
  const meterSpace = showMeter ? 28 : 0;
  const half = (box.width - meterSpace) / 2;
  const size = crateSize(half - 6, box.height, cargo.aboard + cargo.waiting);
  const status =
    cargo.status === 'overload' ? { text: 'OVERLOAD', color: eq.caution } : cargo.status === 'accepted' ? { text: 'LOAD OK', color: eq.ok } : cargo.status === 'underload' ? { text: 'ROOM LEFT', color: eq.clue } : null;
  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <View style={[styles.side, { width: half - 6 }]} accessibilityLabel={`Loading dock: ${onDock} crates`}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.sideTitle}>
            DOCK
          </Text>
        </View>
        <View style={styles.grid}>
          {Array.from({ length: onDock }, (_, i) => (
            <Crate key={`d${i}`} size={size} tone="cargo" dragToward={1} onMove={onLoad} label="Load crate" />
          ))}
        </View>
      </View>
      <View style={[styles.side, styles.car, { width: half - 6 }]} accessibilityLabel={`Car: ${cargo.aboard} units aboard, ${cargo.loaded} crates loaded`}>
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
        <View style={styles.grid}>
          {Array.from({ length: cargo.aboard }, (_, i) => (
            <View key={`a${i}`} style={[styles.crate, { width: size, height: size }, styles.aboard]} accessibilityLabel="Unit already aboard">
              <Text allowFontScaling={false} style={styles.aboardText}>
                ON BOARD
              </Text>
            </View>
          ))}
          {Array.from({ length: cargo.loaded }, (_, i) => (
            <Crate key={`l${i}`} size={size} tone="loaded" dragToward={-1} onMove={onUnload} label="Unload crate" />
          ))}
        </View>
      </View>
      {showMeter ? <LoadMeter capacity={cargo.capacity} load={cargo.aboard + cargo.loaded} /> : null}
    </View>
  );
});

function Crate({ size, tone, dragToward, onMove, label }: { size: number; tone: 'cargo' | 'loaded'; dragToward: 1 | -1; onMove: () => void; label: string }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const pan = Gesture.Pan()
    .minDistance(6)
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
        <View style={[styles.crateSlatH, { top: size / 2 - 2 }]} />
        <View style={[styles.crateSlatV, { left: size / 2 - 2 }]} />
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
  box: { position: 'absolute', flexDirection: 'row', gap: 12 },
  side: { borderRadius: 10, backgroundColor: '#0A111C', padding: PAD, borderWidth: 1, borderColor: eq.steelDark },
  car: { backgroundColor: '#22190C', borderColor: eq.amberDim },
  header: { height: HEADER, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  sideTitle: { color: eq.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  crate: { borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cargo: { backgroundColor: '#8A5A2B', borderWidth: 2, borderColor: '#B98245' },
  loaded: { backgroundColor: '#A8722F', borderWidth: 2, borderColor: eq.amberSoft },
  crateSlatH: { position: 'absolute', left: 6, right: 6, height: 4, backgroundColor: 'rgba(0,0,0,0.25)' },
  crateSlatV: { position: 'absolute', top: 6, bottom: 6, width: 4, backgroundColor: 'rgba(0,0,0,0.25)' },
  aboard: { backgroundColor: eq.steel, borderWidth: 2, borderColor: eq.steelLight },
  aboardText: { color: eq.text, fontSize: 8, fontWeight: '800', textAlign: 'center' },
  plate: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: '#C9CED6' },
  plateText: { color: '#1B2230', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  status: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  statusText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  meter: { width: 16, justifyContent: 'space-between', paddingVertical: 2 },
  meterCell: { flex: 1, marginVertical: 1, borderRadius: 2, backgroundColor: '#1E2633' },
  meterOn: { backgroundColor: eq.ok },
  meterOver: { backgroundColor: eq.caution },
  meterLimit: { borderTopWidth: 3, borderTopColor: '#FF6B5A' },
});
