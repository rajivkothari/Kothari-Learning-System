// The trip meter: a count answer for "how many floors?" jobs. It takes the panel's place for the
// job (the floor buttons are not the answer here). FEWER and MORE set the count, GO locks it and the
// lift rides that many floors toward the crew, so the world shows the result like any other ride.
// It only reports presses; the director decides what they mean.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LINES } from '../content/floor15';
import type { MeterView } from '../director/director';
import type { Box } from './layout';
import { TOKENS as T, UI, eq } from './palette';

export interface TripMeterProps {
  box: Box;
  meter: MeterView;
  /** False while the lift rides, during a success, or while saving: the meter shows its count only. */
  enabled: boolean;
  onStep: (delta: 1 | -1) => void;
  onGo: () => void;
}

export const TripMeter = memo(function TripMeter({ box, meter, enabled, onStep, onGo }: TripMeterProps) {
  // A wide, short panel (portrait) puts the controls in one row; a tall one stacks them.
  const wide = box.width > box.height * 1.3;
  const key = Math.max(T.minTouchTarget, Math.min(88, Math.floor((wide ? box.height - 48 : box.width - 40) / (wide ? 1 : 2))));
  const arrow = meter.direction === 'up' ? '▲' : '▼';
  const readout = (
    <View style={styles.readout} accessibilityLiveRegion="polite" accessibilityLabel={`Trip meter: ${meter.value} floors ${meter.direction}`}>
      <Text allowFontScaling={false} style={styles.arrow}>
        {arrow}
      </Text>
      <Text allowFontScaling={false} style={[styles.value, { fontSize: Math.round(key * 0.7) }]}>
        {String(meter.value).padStart(2, '0')}
      </Text>
      <Text allowFontScaling={false} style={styles.unit}>
        {LINES.meter.unit}
      </Text>
    </View>
  );
  const stepKey = (delta: 1 | -1, glyph: string, label: string) => (
    <Pressable
      disabled={!enabled || (delta < 0 ? meter.value === 0 : meter.value >= meter.max)}
      onPress={() => onStep(delta)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.key, { width: key, height: key, borderRadius: key / 2 }, pressed && styles.pressed, !enabled && styles.off]}
    >
      <Text allowFontScaling={false} style={[styles.keyText, { fontSize: Math.round(key * 0.5) }]}>
        {glyph}
      </Text>
    </Pressable>
  );
  const go = (
    <Pressable
      disabled={!enabled}
      onPress={onGo}
      accessibilityRole="button"
      accessibilityLabel={LINES.meter.go}
      hitSlop={6}
      style={({ pressed }) => [styles.go, { minWidth: key * (wide ? 1.4 : 2) + 12, height: key }, pressed && styles.pressed, !enabled && styles.off]}
    >
      <Text allowFontScaling={false} style={styles.goText}>
        {LINES.meter.go}
      </Text>
    </Pressable>
  );
  return (
    <View style={[styles.plate, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessibilityLabel={LINES.meter.title}>
      <Text allowFontScaling={false} style={styles.title}>
        {LINES.meter.title}
      </Text>
      {wide ? (
        <View style={styles.row}>
          {stepKey(-1, '−', LINES.meter.fewer)}
          {readout}
          {stepKey(1, '+', LINES.meter.more)}
          {go}
        </View>
      ) : (
        <View style={styles.column}>
          {readout}
          <View style={styles.row}>
            {stepKey(-1, '−', LINES.meter.fewer)}
            {stepKey(1, '+', LINES.meter.more)}
          </View>
          {go}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  plate: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.steelEdge },
  title: { ...UI(0.8), color: eq.cyan, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  column: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: eq.night, borderWidth: 1, borderColor: eq.steelEdge },
  arrow: { ...UI(0.9), color: eq.cyan },
  value: { ...UI(), color: eq.amber, fontVariant: ['tabular-nums'] },
  unit: { ...UI(0.7), color: eq.textDim },
  key: { alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steel, borderWidth: 2, borderColor: eq.steelEdge },
  keyText: { ...UI(), color: eq.text, lineHeight: undefined },
  go: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: eq.amberDim, borderWidth: 2, borderColor: eq.amber },
  goText: { ...UI(1.1), color: eq.text, letterSpacing: 2 },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
  off: { opacity: 0.55 },
});
