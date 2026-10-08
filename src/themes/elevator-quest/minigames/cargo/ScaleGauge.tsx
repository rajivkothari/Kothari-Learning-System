// The freight scale. While loading, the needle and its sweep move at once with every crate, sack or
// box (the tens scale shows roughly where the load is, against the capacity line and the target
// mark), but the exact number appears only in the window under the hub when the learner presses
// WEIGH. Changing the load clears the window: the new load has to be weighed.
//
// A right load: a steady green rim and a check on the window, never flashing. After a miss: the
// window keeps its reading with a warm amber rim (never red) and Lifty says which way to go. The
// zone past the capacity line is yellow: overload is a genuine warning, not a wrong answer.
import { Canvas, Circle, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';

import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { labelAt } from '../../ui/palette';
import type { Readout } from './cargoState';
import { CC, brass, navy, steel } from './cargoPalette';
import { angleOf, gaugeGeometry } from './gaugeGeometry';
import { svgPath } from './skiaPaths';

export interface ScaleGaugeProps {
  box: { x: number; y: number; width: number; height: number };
  /** 0..1 of the dial: the load on the scale now. */
  fraction: number;
  max: number;
  capacity: number | null;
  mark: { value: number; label: string } | null;
  capacityLabel: string;
  unit: string;
  readout: Readout | null;
  /** A weigh is in flight: the window shows it is working, without a number. */
  weighing: boolean;
  labelSize: number;
  reducedMotion: boolean;
  a11yLabel: string;
}

export const ScaleGauge = memo(function ScaleGauge({ box, fraction, max, capacity, mark, capacityLabel, unit, readout, weighing, labelSize, reducedMotion, a11yLabel }: ScaleGaugeProps) {
  const g = useMemo(() => gaugeGeometry(box, max, labelSize), [box, max, labelSize]);
  const needle = useSharedValue(fraction);
  useEffect(() => {
    needle.set(reducedMotion ? fraction : withTiming(fraction, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [fraction, reducedMotion, needle]);
  const rotation = useDerivedValue(() => [{ rotate: -Math.PI * (1 - needle.get()) }]);
  const sweepEnd = useDerivedValue(() => needle.get());

  const mid = (g.band.inner + g.band.outer) / 2;
  const bandW = g.band.outer - g.band.inner;
  // Arcs as SVG paths: a half circle over the top, from the left (0 kg) to the right (the top of the scale).
  const arc = useMemo(() => svgPath(`M ${g.cx - mid} ${g.cy} A ${mid} ${mid} 0 0 1 ${g.cx + mid} ${g.cy}`), [g.cx, g.cy, mid]);
  const face = useMemo(() => svgPath(`M ${g.cx - g.r} ${g.cy} A ${g.r} ${g.r} 0 0 1 ${g.cx + g.r} ${g.cy} Z`), [g.cx, g.cy, g.r]);
  const zone = useMemo(() => {
    if (capacity === null || capacity >= max) return null;
    const a = angleOf(capacity, max);
    return svgPath(`M ${g.cx + mid * Math.cos(a)} ${g.cy - mid * Math.sin(a)} A ${mid} ${mid} 0 0 1 ${g.cx + mid} ${g.cy}`);
  }, [capacity, max, g.cx, g.cy, mid]);
  const needlePath = useMemo(() => {
    const p = Skia.Path.Make();
    const len = g.band.outer - 2;
    p.moveTo(g.cx - g.r * 0.12, g.cy - 3);
    p.lineTo(g.cx + len, g.cy);
    p.lineTo(g.cx - g.r * 0.12, g.cy + 3);
    p.close();
    return p;
  }, [g.cx, g.cy, g.r, g.band.outer]);
  const radial = (value: number, from: number, to: number) => {
    const a = angleOf(value, max);
    return { p1: vec(g.cx + from * Math.cos(a), g.cy - from * Math.sin(a)), p2: vec(g.cx + to * Math.cos(a), g.cy - to * Math.sin(a)) };
  };
  const markTri = useMemo(() => {
    if (!mark) return null;
    const a = angleOf(mark.value, max);
    const tip = { x: g.cx + (g.band.inner - 2) * Math.cos(a), y: g.cy - (g.band.inner - 2) * Math.sin(a) };
    const base = g.r + 2;
    const side = 9;
    const bx = g.cx + base * Math.cos(a);
    const by = g.cy - base * Math.sin(a);
    const p = Skia.Path.Make();
    p.moveTo(tip.x, tip.y);
    p.lineTo(bx + side * Math.sin(a), by + side * Math.cos(a));
    p.lineTo(bx - side * Math.sin(a), by - side * Math.cos(a));
    p.close();
    return p;
  }, [mark, max, g]);

  const result = readout?.result ?? null;
  const rim = result === 'right' ? CC.ok : result === 'heavy' || result === 'light' || result === 'notRight' ? CC.caution : steel.edge;
  const shown = readout && result !== null;
  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessible accessibilityLabel={a11yLabel} accessibilityLiveRegion="polite">
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path path={face} color={navy.shadow} />
        <Path path={arc} style="stroke" strokeWidth={bandW} color={navy.edge} />
        {zone ? <Path path={zone} style="stroke" strokeWidth={bandW} color={CC.warning} opacity={0.55} /> : null}
        <Path path={arc} style="stroke" strokeWidth={bandW} color={CC.sweep} opacity={0.32} start={0} end={sweepEnd} />
        <Path path={face} style="stroke" strokeWidth={5} color={brass.base} />
        <Path path={face} style="stroke" strokeWidth={1.5} color={brass.edge} />
        {g.ticks.map((t) => (
          <Line key={t.value} p1={vec(t.x1, t.y1)} p2={vec(t.x2, t.y2)} color={CC.text} strokeWidth={t.major ? 3 : 1.5} opacity={t.major ? 0.95 : 0.6} />
        ))}
        {capacity !== null ? <Line {...radial(capacity, g.band.inner - 6, g.r)} color={CC.warning} strokeWidth={5} /> : null}
        {capacity !== null ? <Line {...radial(capacity, g.band.inner - 6, g.r)} color={CC.soot} strokeWidth={1.2} /> : null}
        {markTri ? <Path path={markTri} color={CC.mark} /> : null}
        {markTri ? <Path path={markTri} style="stroke" strokeWidth={1.5} color={CC.soot} /> : null}
        <Group origin={vec(g.cx, g.cy)} transform={rotation}>
          <Path path={needlePath} color={CC.enamel} />
          <Path path={needlePath} style="stroke" strokeWidth={1.2} color={CC.soot} />
        </Group>
        <Circle cx={g.cx} cy={g.cy} r={Math.max(7, g.r * 0.09)} color={brass.base} />
        <Circle cx={g.cx} cy={g.cy} r={Math.max(7, g.r * 0.09)} style="stroke" strokeWidth={1.5} color={brass.edge} />
      </Canvas>
      {g.labels.map((l) => (
        <Text key={l.value} allowFontScaling={false} pointerEvents="none" style={[labelAt(labelSize), styles.tickLabel, { left: l.x - 30, top: l.y - labelSize * 0.68, fontSize: labelSize }]}>
          {l.value}
        </Text>
      ))}
      <View pointerEvents="none" style={[styles.window, { left: g.readout.x, top: g.readout.y, width: g.readout.width, height: g.readout.height, borderColor: rim, borderWidth: shown ? 4 : 2 }]}>
        <Text allowFontScaling={false} style={[styles.digits, { fontSize: g.numberSize, lineHeight: Math.round(g.numberSize * 1.15) }, !shown && styles.digitsIdle]}>
          {shown ? readout.total : weighing ? '. . .' : '- -'}
        </Text>
        <Text allowFontScaling={false} style={[styles.unit, { fontSize: Math.max(14, Math.round(g.numberSize * 0.42)) }]}>
          {unit}
        </Text>
        {result === 'right' ? <View style={[styles.check, { borderColor: CC.ok }]} /> : null}
      </View>
      <View pointerEvents="none" style={[styles.legend, { left: g.legend.x, top: g.legend.y, width: g.legend.width, minHeight: g.legend.height }]}>
        {capacity !== null ? (
          <View style={styles.legendItem}>
            <View style={styles.capGlyph} />
            <Text allowFontScaling={false} style={[labelAt(labelSize), styles.legendText]}>
              {capacityLabel}
            </Text>
          </View>
        ) : null}
        {mark ? (
          <View style={styles.legendItem}>
            <View style={styles.markGlyph} />
            <Text allowFontScaling={false} style={[labelAt(labelSize), styles.legendText]}>
              {mark.label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { position: 'absolute' },
  tickLabel: { position: 'absolute', width: 60, textAlign: 'center', color: CC.text, letterSpacing: 0 },
  window: { position: 'absolute', borderRadius: 10, backgroundColor: CC.void, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 4, gap: 6 },
  digits: { color: CC.enamel, fontWeight: '900', fontVariant: ['tabular-nums'] },
  digitsIdle: { color: CC.textDim },
  unit: { color: CC.textDim, fontWeight: '800' },
  check: { position: 'absolute', right: 10, top: '30%', width: 12, height: 22, borderRightWidth: 4, borderBottomWidth: 4, transform: [{ rotate: '45deg' }] },
  legend: { position: 'absolute', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 16, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  legendText: { color: CC.text, flexShrink: 1 },
  capGlyph: { width: 6, height: 18, borderRadius: 1, backgroundColor: CC.warning, borderWidth: 1, borderColor: CC.soot },
  markGlyph: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 12, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: CC.mark },
});
