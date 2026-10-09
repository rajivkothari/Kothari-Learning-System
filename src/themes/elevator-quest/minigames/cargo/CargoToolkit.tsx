// The Engineer's Toolkit: a reasoning aid, never help and never evidence. It calls nothing in the
// session: opening it, building blocks, jumping on the line and drawing are the learner's own working.
// None of it shows a total: the blocks are counted by the learner, the number line labels only its
// tens, and the work area is a blank pad. Every control is at least 64 pt.
import { Canvas, Group, Line, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { labelAt, readingAt } from '../../ui/palette';
import type { CargoCopy } from './copy';
import { CC, boxCard, brass, navy, sackCloth, steel } from './cargoPalette';
import { svgPath } from './skiaPaths';
import type { Box } from './screenLayout';

type Tab = 'blocks' | 'line' | 'pad';
const MAX_BLOCKS = 19;

export function CargoToolkit({ box, copy, closeLabel, max, labelSize, onClose }: { box: Box; copy: CargoCopy['toolkit']; closeLabel: string; max: number; labelSize: number; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('blocks');
  const [tens, setTens] = useState(0);
  const [ones, setOnes] = useState(0);
  const [jumps, setJumps] = useState<number[]>([]);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const begin = useCallback((pt: Pt) => setStrokes((all) => [...all, [pt]].slice(-60)), []);
  const move = useCallback((pt: Pt) => setStrokes((all) => (all.length === 0 ? [[pt]] : [...all.slice(0, -1), [...all[all.length - 1]!, pt].slice(-400)])), []);
  const tabs: [Tab, string][] = [
    ['blocks', copy.blocks],
    ['line', copy.numberLine],
    ['pad', copy.workArea],
  ];
  // Inside: the title, the tabs, the working area, the controls (wrapping into rows of 64 pt buttons).
  const buttons = tab === 'blocks' ? 6 : tab === 'line' ? 5 : 2;
  const perRow = Math.max(1, Math.floor((box.width - 24 - 6 + 8) / (72 + 8)));
  const controlRows = Math.ceil(buttons / perRow);
  const controlsH = controlRows * 64 + (controlRows - 1) * 8;
  const titleH = Math.round(labelSize * 1.25);
  const body = { width: box.width - 24 - 6, height: box.height - 24 - 6 - titleH - 64 - controlsH - 3 * 12 };
  return (
    <View style={[styles.panel, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessibilityViewIsModal={false} testID="cargo-toolkit">
      <View style={styles.header}>
        <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(labelSize), styles.title]} accessibilityRole="header">
          {copy.title}
        </Text>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={({ pressed }) => [styles.tab, tab === id && styles.tabOn, pressed && styles.pressed]}>
            <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(labelSize), styles.tabText, tab === id && styles.tabTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.body, { height: Math.max(80, body.height) }]}>
        {tab === 'blocks' ? <Blocks tens={tens} ones={ones} width={body.width} height={Math.max(80, body.height)} /> : null}
        {tab === 'line' ? <NumberLine jumps={jumps} max={max} width={body.width} height={Math.max(80, body.height)} labelSize={labelSize} /> : null}
        {tab === 'pad' ? <Pad strokes={strokes} onBegin={begin} onMove={move} width={body.width} height={Math.max(80, body.height)} hint={copy.padHint} labelSize={labelSize} /> : null}
      </View>
      <View style={styles.controls}>
        {tab === 'blocks' ? (
          <>
            <Tool label={copy.addTen} onPress={() => setTens((n) => Math.min(MAX_BLOCKS, n + 1))} size={labelSize} />
            <Tool label={copy.addOne} onPress={() => setOnes((n) => Math.min(MAX_BLOCKS, n + 1))} size={labelSize} />
            <Tool label={copy.takeTen} onPress={() => setTens((n) => Math.max(0, n - 1))} size={labelSize} />
            <Tool label={copy.takeOne} onPress={() => setOnes((n) => Math.max(0, n - 1))} size={labelSize} />
          </>
        ) : null}
        {tab === 'line' ? (
          <>
            <Tool label={copy.jumpTen} onPress={() => setJumps((j) => (sum(j) + 10 <= max ? [...j, 10] : j))} size={labelSize} />
            <Tool label={copy.jumpOne} onPress={() => setJumps((j) => (sum(j) + 1 <= max ? [...j, 1] : j))} size={labelSize} />
            <Tool label={copy.back} onPress={() => setJumps((j) => j.slice(0, -1))} size={labelSize} />
          </>
        ) : null}
        <Tool label={copy.clear} onPress={() => (tab === 'blocks' ? (setTens(0), setOnes(0)) : tab === 'line' ? setJumps([]) : setStrokes([]))} size={labelSize} />
        <Tool label={closeLabel} onPress={onClose} size={labelSize} primary />
      </View>
    </View>
  );
}

const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);

function Tool({ label, onPress, size, primary = false }: { label: string; onPress: () => void; size: number; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.tool, primary && styles.toolPrimary, pressed && styles.pressed]}>
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(size), styles.toolText]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Tens rods (ten cells each) and ones cubes, laid out to count. No total is shown. */
function Blocks({ tens, ones, width, height }: { tens: number; ones: number; width: number; height: number }) {
  const rodH = Math.min(height - 16, 220);
  const cell = rodH / 10;
  return (
    <View style={[styles.blocks, { width, height }]}>
      <View style={styles.rods}>
        {Array.from({ length: tens }, (_, i) => (
          <View key={i} style={[styles.rod, { height: rodH, width: Math.max(12, cell) }]}>
            {Array.from({ length: 10 }, (_, k) => (
              <View key={k} style={[styles.rodCell, { height: cell - 1 }]} />
            ))}
          </View>
        ))}
      </View>
      <View style={[styles.cubes, { width: Math.max(cell, 12) * 5 + 16 }]}>
        {Array.from({ length: ones }, (_, i) => (
          <View key={i} style={[styles.cube, { width: Math.max(12, cell), height: Math.max(12, cell) }]} />
        ))}
      </View>
    </View>
  );
}

/** A number line from 0 with its tens labelled; jumps of ten and of one drawn as arcs from 0. */
function NumberLine({ jumps, max, width, height, labelSize }: { jumps: readonly number[]; max: number; width: number; height: number; labelSize: number }) {
  const x0 = 20;
  const x1 = width - 20;
  const y = height * 0.62;
  const at = (v: number) => x0 + ((x1 - x0) * v) / max;
  const step = (x1 - x0) / (max / 10) >= labelSize * 2.4 ? 10 : (x1 - x0) / (max / 20) >= labelSize * 2.4 ? 20 : 50;
  const arcs = useMemo(() => {
    const out: SkPath[] = [];
    let pos = 0;
    for (const j of jumps) {
      const a = at(pos);
      const b = at(pos + j);
      out.push(svgPath(`M ${a} ${y} Q ${(a + b) / 2} ${y - (j === 10 ? height * 0.45 : height * 0.18)} ${b} ${y}`));
      pos += j;
    }
    return out;
    // at() is a pure function of the props already listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumps, max, width, height]);
  const end = sum(jumps);
  return (
    <View style={{ width, height }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Line p1={vec(x0, y)} p2={vec(x1, y)} color={CC.text} strokeWidth={3} />
        {Array.from({ length: Math.floor(max / 10) + 1 }, (_, i) => (
          <Line key={i} p1={vec(at(i * 10), y - 10)} p2={vec(at(i * 10), y + 10)} color={CC.text} strokeWidth={(i * 10) % step === 0 ? 3 : 1.5} />
        ))}
        <Group>
          {arcs.map((p, i) => (
            <Path key={i} path={p} style="stroke" strokeWidth={3} color={jumps[i] === 10 ? sackCloth.light : boxCard.light} />
          ))}
        </Group>
        {jumps.length > 0 ? <Line p1={vec(at(end), y - 18)} p2={vec(at(end), y + 18)} color={CC.mark} strokeWidth={5} /> : null}
      </Canvas>
      {Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => (
        <Text key={i} allowFontScaling={false} style={[labelAt(labelSize), styles.lineLabel, { left: at(i * step) - 24, top: y + 14 }]}>
          {i * step}
        </Text>
      ))}
    </View>
  );
}

/** A blank pad to draw on with a finger. Strokes stay until CLEAR (or the toolkit closes). */
type Pt = { x: number; y: number };
function Pad({ strokes, onBegin, onMove, width, height, hint, labelSize }: { strokes: readonly (readonly Pt[])[]; onBegin: (p: Pt) => void; onMove: (p: Pt) => void; width: number; height: number; hint: string; labelSize: number }) {
  const paths = useMemo(
    () =>
      strokes.map((pts) => {
        const b = Skia.PathBuilder.Make();
        pts.forEach((pt, i) => (i === 0 ? b.moveTo(pt.x, pt.y) : b.lineTo(pt.x, pt.y)));
        if (pts.length === 1) b.lineTo(pts[0]!.x + 0.5, pts[0]!.y + 0.5);
        return b.detach();
      }),
    [strokes],
  );
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      runOnJS(onBegin)({ x: e.x, y: e.y });
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(onMove)({ x: e.x, y: e.y });
    });
  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.pad, { width, height }]} accessibilityLabel={hint}>
        <Canvas style={StyleSheet.absoluteFill}>
          {paths.map((p, i) => (
            <Path key={i} path={p} style="stroke" strokeWidth={4} strokeCap="round" strokeJoin="round" color={CC.enamel} />
          ))}
        </Canvas>
        {strokes.length === 0 ? (
          <Text allowFontScaling={false} pointerEvents="none" style={[readingAt(Math.max(16, labelSize)), styles.padHint]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', borderRadius: 14, backgroundColor: navy.shadow, borderWidth: 3, borderColor: brass.base, padding: 12, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: CC.warmLight },
  tabs: { flexDirection: 'row', gap: 8, height: 64 },
  tab: { flex: 1, minHeight: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: navy.base, borderWidth: 2, borderColor: steel.edge, paddingHorizontal: 4 },
  tabOn: { backgroundColor: navy.light, borderColor: CC.warmLight, borderWidth: 3 },
  tabText: { color: CC.textDim, textAlign: 'center' },
  tabTextOn: { color: CC.text, textDecorationLine: 'underline' },
  body: { borderRadius: 10, backgroundColor: CC.void, overflow: 'hidden' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 64 },
  tool: { minWidth: 64, minHeight: 64, flexGrow: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: navy.base, borderWidth: 2, borderColor: steel.light, borderBottomWidth: 5, borderBottomColor: navy.edge },
  toolPrimary: { borderColor: brass.light, backgroundColor: navy.light },
  toolText: { color: CC.text, textAlign: 'center' },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.85 },
  blocks: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, gap: 16 },
  rods: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 4, flex: 1 },
  rod: { borderWidth: 1.5, borderColor: sackCloth.edge, backgroundColor: sackCloth.base, justifyContent: 'space-between', paddingVertical: 0.5 },
  rodCell: { borderBottomWidth: 1, borderBottomColor: sackCloth.shadow },
  cubes: { flexDirection: 'row', flexWrap: 'wrap-reverse', gap: 4, alignContent: 'flex-start' },
  cube: { backgroundColor: boxCard.base, borderWidth: 1.5, borderColor: boxCard.edge },
  lineLabel: { position: 'absolute', width: 48, textAlign: 'center', color: CC.text },
  pad: { backgroundColor: CC.void },
  padHint: { position: 'absolute', left: 16, top: 12, color: CC.textDim },
});
