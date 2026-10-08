// The freight elevator: its shaft, the cab with mechanical doors, and the load inside. The cab is
// art (`minigame.cargo.freight`) over a vector drawing that is also its fallback; the load is native
// views on top (each a touch target with a label): the cargo already aboard on its pallet, the 10 kg
// sacks on the left and the 1 kg boxes on the right (a tens and ones mat), or the crates.
//
// A right load ships: the doors close, then the cab rises out of the shaft (the freightMove loop runs
// meanwhile), then the shaft shows DELIVERED and NEXT DELIVERY waits. Reduced Motion: the same
// states, at once, with no travel. A new delivery: the cab comes down and opens (at once under
// Reduced Motion).
import { Canvas, Group, Line, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { labelAt } from '../../ui/palette';
import { ArtSlot, type ArtSource } from '../../ui/art/ArtSlot';
import type { ArtEntry } from '../../art/manifest';
import { CC, brass, navy, steel, trim } from './cargoPalette';
import { CrateButton, OneBox, Pallet, Sack } from './CargoPieces';
import { containRect } from './cargoArt';
import { MAX_BOXES, MAX_SACKS } from './mission';
import type { CargoPhase } from './cargoState';
import { HEADER, crateGrid, type Box, type HoldLayout } from './screenLayout';

export interface FreightLiftProps {
  box: Box;
  /** The cab's inside, in screen coordinates (screenLayout.hold) and its parts (holdLayout). */
  hold: Box;
  parts: HoldLayout;
  /** The plate over the shaft: MAX 80 kg, or the lift's name. */
  plate: string;
  plateLabel: string;
  basePallets: readonly { weight: number; label: string }[];
  /** Filler kinds: sacks and boxes aboard. exactLoad: crates aboard, in load order. */
  sacks: number;
  boxes: number;
  crates: readonly { id: string; weight: number; label: string }[];
  crate: number;
  crateArt: ImageSourcePropType | null;
  unit: string;
  labels: { tens: string; ones: string; delivered: string; sacks: string; boxes: string };
  phase: CargoPhase;
  /** Changes with every delivery: a new cab comes down. */
  deliveryKey: string;
  canTakeSack: boolean;
  canTakeBox: boolean;
  locked: boolean;
  labelSize: number;
  reducedMotion: boolean;
  art: ArtSource;
  cabArt: ArtEntry | null;
  onTakeSack: () => void;
  onTakeBox: () => void;
  onUnload: (id: string) => void;
  /** The run is over on screen (doors shut, cab gone). */
  onArrived: () => void;
}

const DOOR_MS = 520;
const RUN_MS = 1400;
const ARRIVE_MS = 650;

export const FreightLift = memo(function FreightLift(p: FreightLiftProps) {
  const { box, parts, phase, reducedMotion } = p;
  const cab = { x: 14, y: HEADER, w: box.width - 28, h: box.height - HEADER - 6 };
  // The cab's inside relative to the cab view.
  const rel = (b: Box): Box => ({ x: b.x - box.x - cab.x, y: b.y - box.y - cab.y, width: b.width, height: b.height });
  const doors = useSharedValue(0); // 0 open, 1 shut
  const lift = useSharedValue(0); // 0 at the dock, 1 gone up the shaft, negative: coming down
  const arrivedFor = useRef<string | null>(null);
  const onArrived = p.onArrived;

  // The run.
  useEffect(() => {
    if (phase !== 'shipping' || arrivedFor.current === p.deliveryKey) return;
    arrivedFor.current = p.deliveryKey;
    if (reducedMotion) {
      doors.set(1);
      lift.set(1);
      onArrived();
      return;
    }
    doors.set(withTiming(1, { duration: DOOR_MS, easing: Easing.inOut(Easing.quad) }));
    lift.set(
      withDelay(
        DOOR_MS + 120,
        withTiming(1, { duration: RUN_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
          if (done) runOnJS(onArrived)();
        }),
      ),
    );
  }, [phase, p.deliveryKey, reducedMotion, doors, lift, onArrived]);

  // A new delivery: the cab comes down with its doors shut, then opens.
  const shownKey = useRef(p.deliveryKey);
  useEffect(() => {
    if (shownKey.current === p.deliveryKey) return;
    shownKey.current = p.deliveryKey;
    if (phase === 'shipping' || phase === 'shipped') return;
    if (reducedMotion) {
      lift.set(0);
      doors.set(0);
      return;
    }
    lift.set(-1);
    doors.set(1);
    lift.set(withTiming(0, { duration: ARRIVE_MS, easing: Easing.out(Easing.cubic) }));
    doors.set(withSequence(withTiming(1, { duration: ARRIVE_MS }), withTiming(0, { duration: DOOR_MS, easing: Easing.inOut(Easing.quad) })));
  }, [p.deliveryKey, phase, reducedMotion, lift, doors]);

  // Resumed after a restart in a shipped state: the cab is already gone.
  useEffect(() => {
    if (phase === 'shipped' && lift.get() === 0) {
      lift.set(1);
      doors.set(1);
    }
  }, [phase, lift, doors]);

  const travel = box.height + 30;
  const cabStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.get() * travel }] }));
  const leaf = cab.w / 2;
  const leftDoor = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - doors.get()) * (leaf + 4) }] }));
  const rightDoor = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - doors.get()) * (leaf + 4) }] }));

  const cabArtRect = p.cabArt ? containRect(p.cabArt, { x: 0, y: 0, width: cab.w, height: cab.h }) : null;
  const loadedGrid = parts.crates ? crateGrid(p.crates.length, p.crate, rel(parts.crates)) : [];
  return (
    <View style={[styles.frame, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      {/* The shaft: rails and the dark well the cab runs in. */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <RoundedRect x={4} y={HEADER - 4} width={box.width - 8} height={box.height - HEADER + 2} r={6} color={CC.void} />
        <Rect x={4} y={HEADER - 4} width={8} height={box.height - HEADER + 2} color={steel.shadow} />
        <Rect x={box.width - 12} y={HEADER - 4} width={8} height={box.height - HEADER + 2} color={steel.shadow} />
        {Array.from({ length: Math.ceil((box.height - HEADER) / 28) }, (_, i) => (
          <Line key={i} p1={vec(14, HEADER + i * 28)} p2={vec(box.width - 14, HEADER + i * 28)} color={navy.edge} strokeWidth={1} />
        ))}
        <RoundedRect x={0} y={0} width={box.width} height={HEADER - 2} r={6} color={trim.shadow} />
        <Rect x={0} y={HEADER - 6} width={box.width} height={4} color={trim.edge} />
      </Canvas>
      <View style={[styles.plateRow, { height: HEADER - 4 }]} pointerEvents="none">
        <View style={styles.plate} accessible accessibilityLabel={p.plateLabel}>
          <Text allowFontScaling={false} style={[labelAt(p.labelSize), styles.plateText]}>
            {p.plate}
          </Text>
        </View>
      </View>
      {phase === 'shipped' ? (
        <View style={[styles.delivered, { top: HEADER + cab.h / 2 - 28 }]} pointerEvents="none">
          <Text allowFontScaling={false} style={[labelAt(Math.max(p.labelSize, 18)), styles.deliveredText]}>
            {p.labels.delivered}
          </Text>
        </View>
      ) : null}
      <Animated.View style={[styles.cab, { left: cab.x, top: cab.y, width: cab.w, height: cab.h }, cabStyle]}>
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <VectorCab w={cab.w} h={cab.h} />
          {p.cabArt && cabArtRect ? <ArtSlot entry={p.cabArt} rect={cabArtRect} art={p.art} /> : null}
        </Canvas>
        {parts.base ? (
          <View style={[styles.abs, styles.baseRow, boxStyle(rel(parts.base))]}>
            {p.basePallets.map((b, i) => (
              <Pallet key={i} width={(parts.base!.width - (p.basePallets.length - 1) * 8) / p.basePallets.length} height={parts.base!.height} weight={b.weight} unit={p.unit} label={b.label} />
            ))}
          </View>
        ) : null}
        {parts.tens ? (
          <Pressable testID="freight-tens" onPress={p.onTakeSack} disabled={!p.canTakeSack || p.locked} accessibilityRole="button" accessibilityLabel={p.labels.sacks} accessibilityState={{ disabled: !p.canTakeSack || p.locked }} style={({ pressed }) => [styles.abs, styles.column, boxStyle(rel(parts.tens!)), pressed && styles.columnPressed]}>
            <Text allowFontScaling={false} style={[labelAt(p.labelSize), styles.columnTitle]}>
              {p.labels.tens}
            </Text>
            <Stack count={p.sacks} width={parts.tens.width - 12} height={parts.tens.height - p.labelSize * 1.4 - 14} kind="sack" />
          </Pressable>
        ) : null}
        {parts.ones ? (
          <Pressable testID="freight-ones" onPress={p.onTakeBox} disabled={!p.canTakeBox || p.locked} accessibilityRole="button" accessibilityLabel={p.labels.boxes} accessibilityState={{ disabled: !p.canTakeBox || p.locked }} style={({ pressed }) => [styles.abs, styles.column, boxStyle(rel(parts.ones!)), pressed && styles.columnPressed]}>
            <Text allowFontScaling={false} style={[labelAt(p.labelSize), styles.columnTitle]}>
              {p.labels.ones}
            </Text>
            <Stack count={p.boxes} width={parts.ones.width - 12} height={parts.ones.height - p.labelSize * 1.4 - 14} kind="box" />
          </Pressable>
        ) : null}
        {p.crates.map((c, i) => {
          const at = loadedGrid[i];
          if (!at) return null;
          return (
            <View key={c.id} style={[styles.abs, boxStyle(at)]}>
              <CrateButton testID={`freight-crate-${c.id}`} side={p.crate} weight={c.weight} unit={p.unit} art={p.crateArt} label={c.label} disabled={p.locked} onPress={() => p.onUnload(c.id)} />
            </View>
          );
        })}
        <Animated.View pointerEvents="none" style={[styles.door, { left: 0, width: leaf, height: cab.h }, leftDoor]}>
          <DoorLeaf side="left" />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.door, { left: leaf, width: leaf, height: cab.h }, rightDoor]}>
          <DoorLeaf side="right" />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const boxStyle = (b: Box) => ({ left: b.x, top: b.y, width: b.width, height: b.height });

/** The tens (sacks, three to a row) or ones (boxes, five to a row: two rows make a frame of ten), from the floor up, as big as the column holds them all. */
function Stack({ count, width, height, kind }: { count: number; width: number; height: number; kind: 'sack' | 'box' }) {
  const gap = 4;
  const perRow = kind === 'sack' ? 3 : 5;
  const most = kind === 'sack' ? MAX_SACKS : MAX_BOXES;
  const maxRows = Math.ceil(most / perRow);
  const frameGaps = kind === 'box' ? Math.floor((maxRows - 1) / 2) * 6 : 0;
  const tall = kind === 'sack' ? 0.78 : 1;
  const byWidth = Math.floor((width - gap * (perRow - 1)) / perRow);
  const byHeight = Math.floor((height - gap * (maxRows - 1) - frameGaps) / (maxRows * tall));
  const size = Math.max(14, Math.min(kind === 'sack' ? 56 : 40, byWidth, byHeight));
  const rows = Math.ceil(count / perRow);
  return (
    <View style={[styles.stack, { width: perRow * size + (perRow - 1) * gap }]}>
      {Array.from({ length: rows }, (_, r) => {
        const n = Math.min(perRow, count - r * perRow);
        return (
          <View key={r} style={[styles.stackRow, { gap, marginTop: kind === 'box' && r % 2 === 0 && r > 0 ? 6 : 0 }]}>
            {Array.from({ length: n }, (_, i) => (kind === 'sack' ? <Sack key={i} w={size} /> : <OneBox key={i} s={size} />))}
          </View>
        );
      })}
    </View>
  );
}

/** A mechanical door leaf: steel bands, a vision slot, a brass edge where the leaves meet. */
function DoorLeaf({ side }: { side: 'left' | 'right' }) {
  return (
    <View style={[styles.leaf, side === 'left' ? styles.leafLeft : styles.leafRight]}>
      <View style={styles.leafBand} />
      <View style={styles.leafSlot} />
      <View style={[styles.leafBand, { marginTop: 'auto' }]} />
    </View>
  );
}

/** The cab drawn as vectors (the fallback for the art): a navy frame, brass trim, a lit back wall, a steel floor. */
function VectorCab({ w, h }: { w: number; h: number }) {
  const t = 10;
  return (
    <Group>
      <RoundedRect x={0} y={0} width={w} height={h} r={6} color={navy.base} />
      <Rect x={t} y={t + 6} width={w - t * 2} height={h - t * 2 - 18} color={navy.shadow} />
      {Array.from({ length: 4 }, (_, i) => (
        <Line key={i} p1={vec(t + ((w - 2 * t) * (i + 1)) / 5, t + 6)} p2={vec(t + ((w - 2 * t) * (i + 1)) / 5, h - t - 12)} color={navy.edge} strokeWidth={2} />
      ))}
      <Rect x={t} y={t + 6} width={w - t * 2} height={6} color={CC.warmLight} opacity={0.25} />
      <Rect x={0} y={h - 14} width={w} height={14} color={steel.base} />
      <Rect x={0} y={h - 14} width={w} height={3} color={brass.light} />
      <Rect x={0} y={0} width={w} height={6} color={brass.base} />
      <Rect x={0} y={0} width={t} height={h} color={navy.light} opacity={0.35} />
      <Rect x={w - t} y={0} width={t} height={h} color={navy.edge} />
    </Group>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', overflow: 'hidden' },
  abs: { position: 'absolute' },
  plateRow: { position: 'absolute', left: 0, right: 0, top: 2, alignItems: 'center', justifyContent: 'center' },
  plate: { paddingHorizontal: 10, paddingVertical: 1, borderRadius: 4, backgroundColor: CC.enamel, borderWidth: 2, borderColor: brass.base },
  plateText: { color: CC.ink, textTransform: 'none' },
  delivered: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  deliveredText: { color: CC.ok, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 3, borderColor: CC.ok, borderRadius: 8, backgroundColor: CC.void, overflow: 'hidden' },
  cab: { position: 'absolute', overflow: 'hidden', borderRadius: 6 },
  baseRow: { flexDirection: 'row', gap: 8 },
  column: { borderRadius: 8, borderWidth: 2, borderColor: steel.edge, backgroundColor: 'rgba(7,11,18,0.35)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, paddingTop: 4 },
  columnPressed: { backgroundColor: 'rgba(7,11,18,0.55)' },
  columnTitle: { position: 'absolute', top: 4, color: CC.text },
  stack: { flexDirection: 'column-reverse', alignItems: 'flex-start', gap: 4 },
  stackRow: { flexDirection: 'row' },
  door: { position: 'absolute', top: 0 },
  leaf: { flex: 1, backgroundColor: steel.base, borderColor: steel.edge, borderWidth: 2, padding: 6 },
  leafLeft: { borderRightWidth: 4, borderRightColor: brass.base },
  leafRight: { borderLeftWidth: 4, borderLeftColor: brass.base },
  leafBand: { height: 10, borderRadius: 2, backgroundColor: steel.light, opacity: 0.6 },
  leafSlot: { marginTop: 18, alignSelf: 'center', width: '40%', height: 34, borderRadius: 3, backgroundColor: CC.void, borderWidth: 2, borderColor: steel.edge },
});
