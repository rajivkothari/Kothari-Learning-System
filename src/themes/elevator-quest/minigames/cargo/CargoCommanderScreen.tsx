// Cargo Commander (M9, Floor 4): a full-screen loading bay. Read the order, load the freight elevator
// (crates, or 10 kg sacks and 1 kg boxes: tens and ones by hand), WEIGH, and the freight runs.
//
// Thin over the flow (cargoFlow.ts): it draws the flow's view and forwards touches. It computes no
// correctness: WEIGH sends the load's value through the session and the runtime answers. The scale
// shows the load roughly while loading; the exact reading appears only on WEIGH. BACK TO ELEVATOR is
// always there; it saves first. The Engineer's Toolkit is the learner's scratch space: opening it
// calls nothing in the session.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useArt } from '../../ui/art/ArtContext';
import { segments } from '../../ui/emphasis';
import { HelpButton, NextJobButton } from '../../ui/Hud';
import { MARKED, labelAt, readingAt } from '../../ui/palette';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps } from '../types';
import { CARGO_ART_IDS, artEntry, crateSource } from './cargoArt';
import { createCargoFlow, type CargoFlow, type CargoFlowView } from './cargoFlow';
import { CC, brass, navy, steel } from './cargoPalette';
import { canApply, canWeigh, gaugeView } from './cargoState';
import { CargoToolkit } from './CargoToolkit';
import { CrateButton, CrateSpot, OneBox, Pallet, Sack } from './CargoPieces';
import { CARGO_COPY, a11yLoad, briefFor, cargoMarks, cueLine, fillLine, longestCue, type CargoCopy } from './copy';
import { FreightLift } from './FreightLift';
import { isFillerKind, type CargoMission } from './mission';
import { ScaleGauge } from './ScaleGauge';
import { cargoScreenLayout, crateGrid, dockLayout, holdLayout, type Box } from './screenLayout';
import { WarehouseBackdrop } from './WarehouseBackdrop';

const STARTING: CargoFlowView = { status: 'starting', mission: null, cargo: null, helpOffer: null, hint: null, busy: true, notice: null, last: false, solved: 0 };
const noop = () => () => {};
const later = (fn: () => void, ms: number) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

function useCargoFlow(props: Pick<MiniGameScreenProps, 'session' | 'sound' | 'reducedMotion'>): [CargoFlow | null, CargoFlowView] {
  const { session, sound, reducedMotion } = props;
  const [flow, setFlow] = useState<CargoFlow | null>(null);
  const motion = useRef(reducedMotion);
  useEffect(() => {
    motion.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    let cancelled = false;
    const f = createCargoFlow({ session, sound, reducedMotion: () => motion.current, now: () => Date.now(), schedule: later });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start();
    });
    return () => {
      cancelled = true;
      void f.flush();
      f.dispose();
    };
  }, [session, sound]);
  const view = useSyncExternalStore(flow ? flow.subscribe : noop, flow ? flow.view : () => STARTING, flow ? flow.view : () => STARTING);
  return [flow, view];
}

export function CargoCommanderScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit }: MiniGameScreenProps) {
  const copy: CargoCopy = CARGO_COPY;
  const [flow, view] = useCargoFlow({ session, sound, reducedMotion });
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const art = useArt();
  const artSource = useMemo(() => ({ set: art.set, onMissing: art.onMissing }), [art.set, art.onMissing]);
  const backdrop = useMemo(() => artEntry(art.set, CARGO_ART_IDS.backdrop), [art.set]);
  const cabArt = useMemo(() => artEntry(art.set, CARGO_ART_IDS.freight), [art.set]);
  const crateArt = useMemo(() => crateSource(art.set), [art.set]);

  useEffect(() => {
    if (suspended && flow) void flow.flush();
  }, [suspended, flow]);

  const { mission, cargo } = view;
  const brief = mission ? briefFor(copy, mission) : copy.title;
  const cue = cueLine(copy, view);
  const layout = useMemo(
    () => cargoScreenLayout({ size, insets, text, briefChars: Math.max(brief.length, 60), cueChars: longestCue(copy, mission), crates: mission && !isFillerKind(mission.kind) ? mission.crates.length : 0 }),
    [size, insets, text, brief.length, copy, mission],
  );
  const filler = mission ? isFillerKind(mission.kind) : true;
  const parts = useMemo(() => holdLayout(layout.hold, filler, Boolean(mission && mission.basePallets.length > 0)), [layout.hold, filler, mission]);
  const hasInfo = Boolean(mission && (mission.orders || mission.pallets || mission.kind === 'missingAmount'));
  const dock = useMemo(() => dockLayout(layout.supply, filler, hasInfo, layout.text.label), [layout.supply, filler, hasInfo, layout.text.label]);

  const busy = view.busy;
  const loading = cargo?.phase === 'loading';
  const act = flow ? flow.act : () => {};
  const exit = useCallback(async () => {
    if (flow) await flow.flush();
    onExit();
  }, [flow, onExit]);
  const closeToolkit = useCallback(() => setToolkitOpen(false), []);

  const gauge = mission && cargo ? gaugeView(mission, cargo.load) : null;
  const tensLow = gauge ? gauge.tens * 10 : 0;
  const unit = copy.unit;
  const label = layout.text.label;
  const canAdd = (type: 'addSack' | 'addBox') => Boolean(mission && cargo && !busy && canApply(mission, cargo, { type }));

  const scrolls = layout.contentHeight > size.height + 0.5;
  const content = (
    <View style={[styles.screen, { width: size.width, height: layout.contentHeight }]} testID="cargo-commander">
      <WarehouseBackdrop width={size.width} height={layout.contentHeight} entry={backdrop} art={artSource} />

      {/* The brief: the biggest words on screen, its numbers and key words marked (never the answer). */}
      <View style={[styles.brief, boxStyle(layout.brief)]} accessibilityRole="header">
        <Marked text={brief} size={layout.text.question} role="question" words={copy.emphasis} style={styles.briefText} testID="cargo-brief" />
      </View>

      {mission && cargo ? (
        <>
          <Dock copy={copy} mission={mission} box={layout.supply} dock={dock} crate={layout.crate} loaded={cargo.load.crates} crateArt={crateArt} locked={busy || !loading} canAddSack={canAdd('addSack')} canAddBox={canAdd('addBox')} label={label} onAct={act} />
          <FreightLift
            box={layout.freight}
            hold={layout.hold}
            parts={parts}
            plate={mission.capacity !== null ? fillLine(copy.labels.maxPlate, { capacity: mission.capacity }) : copy.labels.freight}
            plateLabel={mission.capacity !== null ? fillLine(copy.labels.maxPlate, { capacity: mission.capacity }) : copy.labels.freight}
            basePallets={mission.basePallets.map((w) => ({ weight: w, label: fillLine(copy.a11y.pallet, { weight: w }) }))}
            sacks={cargo.load.sacks}
            boxes={cargo.load.boxes}
            crates={cargo.load.crates.map((id) => {
              const w = mission.crates.find((c) => c.id === id)?.weight ?? 0;
              return { id, weight: w, label: fillLine(copy.a11y.unloadCrate, { weight: w }) };
            })}
            crate={layout.crate}
            crateArt={crateArt}
            unit={unit}
            labels={{ tens: copy.labels.tens, ones: copy.labels.ones, delivered: copy.labels.delivered, ...a11yLoad(copy, cargo.load) }}
            phase={cargo.phase}
            deliveryKey={mission.key}
            canTakeSack={cargo.load.sacks > 0 && loading}
            canTakeBox={cargo.load.boxes > 0 && loading}
            locked={busy || !loading}
            labelSize={label}
            reducedMotion={reducedMotion}
            art={artSource}
            cabArt={cabArt}
            onTakeSack={() => act({ type: 'removeSack' })}
            onTakeBox={() => act({ type: 'removeBox' })}
            onUnload={(id) => act({ type: 'unloadCrate', id })}
            onArrived={flow ? flow.arrived : () => {}}
          />
          {gauge ? (
            <ScaleGauge
              box={layout.gauge}
              fraction={gauge.fraction}
              max={gauge.max}
              capacity={gauge.capacity}
              mark={gauge.mark ? { value: gauge.mark.value, label: `${gauge.mark.role === 'target' ? copy.labels.target : gauge.mark.role === 'order' ? copy.labels.order : copy.labels.otherPallet} ${gauge.mark.value}` } : null}
              capacityLabel={`${copy.labels.max} ${mission.capacity ?? ''}`}
              unit={unit}
              readout={cargo.readout}
              weighing={cargo.phase === 'weighing'}
              labelSize={label}
              reducedMotion={reducedMotion}
              a11yLabel={`${fillLine(copy.a11y.scale, { low: tensLow, high: tensLow + 10 })} ${cargo.readout?.result ? fillLine(copy.a11y.readout, { total: cargo.readout.total }) : copy.a11y.readoutHidden}`}
            />
          ) : null}
        </>
      ) : null}

      {/* Lifty's line: what just happened, the help given, or what to do. */}
      <View style={[styles.cue, boxStyle(layout.cue)]} accessibilityLiveRegion="polite">
        <ScrollView contentContainerStyle={styles.cueScroll} showsVerticalScrollIndicator persistentScrollbar>
          <Marked text={cue} size={layout.text.dialogue.min} role="dialogue" words={copy.emphasis} style={styles.cueText} testID="cargo-cue" />
        </ScrollView>
      </View>

      {/* WEIGH, and NEXT DELIVERY in its place after a run. */}
      <View style={[styles.weighSlot, boxStyle(layout.weigh)]}>
        {cargo?.phase === 'shipped' ? (
          <NextJobButton label={view.last ? copy.buttons.finish : copy.buttons.next} onPress={() => void flow?.next()} width={layout.weigh.width} hint={view.last ? copy.cues.allDone : copy.cues.delivered} />
        ) : view.status === 'playing' && !(toolkitOpen && layout.toolkitCoversWeigh) ? (
          <WeighButton label={copy.buttons.weigh} enabled={Boolean(mission && cargo && !busy && canWeigh(mission, cargo))} onPress={() => void flow?.weigh()} size={Math.max(label, 20)} />
        ) : null}
      </View>

      {/* The top bar: always reachable. */}
      <View style={[styles.slot, boxStyle(layout.back)]}>
        <BackToElevatorButton onPress={() => void exit()} size={label} style={styles.fill} />
      </View>
      {view.status === 'playing' ? <BarButton box={layout.toolkit} label={copy.buttons.toolkit} onPress={() => setToolkitOpen((o) => !o)} size={label} selected={toolkitOpen} testID="cargo-toolkit-button" /> : null}
      {view.status === 'playing' ? (
        <View style={[styles.helpSlot, boxStyle(layout.help)]}>
          <HelpButton label={view.helpOffer?.assistance === 'demonstrated' ? copy.buttons.showMe : copy.buttons.help} offered={Boolean(view.helpOffer?.offered)} disabled={busy || !view.helpOffer || !loading} still={reducedMotion} onPress={() => void flow?.help()} width={layout.help.width} />
        </View>
      ) : null}

      {toolkitOpen && view.status === 'playing' ? <CargoToolkit box={layout.toolkitPanel} copy={copy.toolkit} closeLabel={copy.buttons.toolkitClose} max={mission?.scaleMax ?? 100} labelSize={label} onClose={closeToolkit} /> : null}
    </View>
  );
  // Slide Over: everything at full size, the screen scrolls (nothing shrinks).
  if (!scrolls) return content;
  return (
    <ScrollView style={{ width: size.width, height: size.height }} contentContainerStyle={{ height: layout.contentHeight }} showsVerticalScrollIndicator>
      {content}
    </ScrollView>
  );
}

const boxStyle = (b: Box) => ({ left: b.x, top: b.y, width: b.width, height: b.height });

/** Words with their numbers and key words marked: weight, an underline and the warm accent. */
function Marked({ text, size, role, words, style, testID }: { text: string; size: number; role: 'question' | 'dialogue'; words: readonly string[]; style: object; testID?: string }) {
  const parts = useMemo(() => segments(text, cargoMarks(text, words)), [text, words]);
  return (
    <Text allowFontScaling={false} testID={testID} style={[readingAt(size, role), style]}>
      {parts.map((p, i) => (p.marked ? <Text key={i} style={MARKED}>{p.text}</Text> : p.text))}
    </Text>
  );
}

/** The dock: the crates (each loads with a touch), or the sack and box piles, and the givens to read. */
function Dock({ copy, mission, box, dock, crate, loaded, crateArt, locked, canAddSack, canAddBox, label, onAct }: { copy: CargoCopy; mission: CargoMission; box: Box; dock: ReturnType<typeof dockLayout>; crate: number; loaded: readonly string[]; crateArt: ReturnType<typeof crateSource>; locked: boolean; canAddSack: boolean; canAddBox: boolean; label: number; onAct: CargoFlow['act'] }) {
  const slots = dock.crates ? crateGrid(mission.crates.length, crate, dock.crates) : [];
  return (
    <View style={[styles.dock, boxStyle(box)]}>
      <Text allowFontScaling={false} style={[labelAt(label), styles.dockTitle]}>
        {copy.labels.dock}
      </Text>
      {mission.crates.map((c, i) => {
        const at = slots[i];
        if (!at) return null;
        const pos = { position: 'absolute' as const, left: at.x - box.x, top: at.y - box.y };
        return (
          <View key={c.id} style={pos}>
            {loaded.includes(c.id) ? <CrateSpot side={crate} /> : <CrateButton testID={`dock-crate-${c.id}`} side={crate} weight={c.weight} unit={copy.unit} art={crateArt} label={fillLine(copy.a11y.loadCrate, { weight: c.weight })} disabled={locked} onPress={() => onAct({ type: 'loadCrate', id: c.id })} />}
          </View>
        );
      })}
      {dock.info ? <Givens copy={copy} mission={mission} box={dock.info} origin={box} label={label} /> : null}
      {dock.sackPile ? (
        <Pile testID="dock-sacks" box={dock.sackPile} origin={box} label={copy.labels.sack} a11y={copy.a11y.addSack} enabled={canAddSack && !locked} size={label} onPress={() => onAct({ type: 'addSack' })}>
          <View style={styles.pileArt}>
            <Sack w={Math.min(52, dock.sackPile.width * 0.26)} />
            <Sack w={Math.min(52, dock.sackPile.width * 0.26)} />
          </View>
        </Pile>
      ) : null}
      {dock.boxPile ? (
        <Pile testID="dock-boxes" box={dock.boxPile} origin={box} label={copy.labels.box} a11y={copy.a11y.addBox} enabled={canAddBox && !locked} size={label} onPress={() => onAct({ type: 'addBox' })}>
          <View style={styles.pileArt}>
            <OneBox s={Math.min(34, dock.boxPile.width * 0.18)} />
            <OneBox s={Math.min(34, dock.boxPile.width * 0.18)} />
            <OneBox s={Math.min(34, dock.boxPile.width * 0.18)} />
          </View>
        </Pile>
      ) : null}
    </View>
  );
}

/** The givens on the dock wall: order slips, or the other pallet. Read, never touched. */
function Givens({ copy, mission, box, origin, label }: { copy: CargoCopy; mission: CargoMission; box: Box; origin: Box; label: number }) {
  const slips: { title: string; weight: number }[] = mission.pallets
    ? [{ title: copy.labels.otherPallet, weight: mission.pallets.heavy }]
    : mission.orders
      ? [
          { title: copy.labels.orderA, weight: mission.orders[0] },
          { title: copy.labels.orderB, weight: mission.orders[1] },
        ]
      : mission.kind === 'missingAmount'
        ? [{ title: copy.labels.order, weight: mission.goal }]
        : [];
  return (
    <View style={[styles.givens, { left: box.x - origin.x, top: box.y - origin.y, width: box.width, height: box.height }]}>
      {slips.map((s, i) =>
        mission.pallets ? (
          <View key={i} style={styles.slipWrap}>
            <Text allowFontScaling={false} style={[labelAt(label), styles.palletTitle]}>
              {s.title}
            </Text>
            <Pallet width={Math.min(200, box.width)} height={box.height - label * 1.4 - 6} weight={s.weight} unit={copy.unit} label={`${s.title} ${s.weight} ${copy.unit}`} />
          </View>
        ) : (
          <View key={i} style={styles.slip} accessible accessibilityLabel={`${s.title} ${s.weight} ${copy.unit}`}>
            <Text allowFontScaling={false} style={[labelAt(label), styles.slipTitle]}>
              {s.title}
            </Text>
            <Text allowFontScaling={false} style={[styles.slipNumber, { fontSize: Math.round(label * 1.9) }]}>
              {s.weight} <Text style={[styles.slipUnit, { fontSize: label }]}>{copy.unit}</Text>
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

function Pile({ box, origin, label, a11y, enabled, size, onPress, children, testID }: { box: Box; origin: Box; label: string; a11y: string; enabled: boolean; size: number; onPress: () => void; children: React.ReactNode; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!enabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !enabled }} style={({ pressed }) => [styles.pile, { left: box.x - origin.x, top: box.y - origin.y, width: box.width, height: box.height }, pressed && styles.pressed, !enabled && styles.pileOff]}>
      {children}
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(size), styles.pileText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function WeighButton({ label, enabled, onPress, size }: { label: string; enabled: boolean; onPress: () => void; size: number }) {
  return (
    <Pressable testID="cargo-weigh" onPress={onPress} disabled={!enabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} style={({ pressed }) => [styles.weigh, pressed && styles.weighPressed, !enabled && styles.weighOff]}>
      <View pointerEvents="none" style={styles.weighLight} />
      <Text allowFontScaling={false} style={[labelAt(size), styles.weighText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BarButton({ box, label, onPress, size, selected = false, testID }: { box: Box; label: string; onPress: () => void; size: number; selected?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} hitSlop={4} style={({ pressed }) => [styles.bar, boxStyle(box), selected && styles.barOn, pressed && styles.pressed]}>
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(size), styles.barText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: CC.void },
  brief: { position: 'absolute', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(7,11,18,0.86)', borderWidth: 2, borderColor: brass.shadow },
  briefText: { color: CC.text },
  cue: { position: 'absolute', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: navy.shadow, borderWidth: 2, borderColor: CC.clue },
  cueText: { color: CC.text },
  cueScroll: { flexGrow: 1, justifyContent: 'center' },
  dock: { position: 'absolute', borderRadius: 12, backgroundColor: 'rgba(11,16,25,0.82)', borderWidth: 2, borderColor: steel.edge },
  dockTitle: { position: 'absolute', left: 12, top: 6, color: CC.warmLight },
  givens: { position: 'absolute', flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'stretch' },
  slip: { flex: 1, maxWidth: 220, borderRadius: 6, backgroundColor: CC.enamel, borderWidth: 2, borderColor: brass.base, paddingHorizontal: 10, paddingVertical: 4, justifyContent: 'center' },
  slipWrap: { alignItems: 'center', gap: 4 },
  slipTitle: { color: CC.ink },
  palletTitle: { color: CC.warmLight },
  slipNumber: { color: CC.ink, fontWeight: '900' },
  slipUnit: { color: CC.ink, fontWeight: '800' },
  pile: { position: 'absolute', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: navy.base, borderWidth: 2, borderColor: brass.base, borderBottomWidth: 6, borderBottomColor: navy.edge, paddingHorizontal: 6 },
  pileOff: { opacity: 0.45 },
  pileArt: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  pileText: { color: CC.text, textAlign: 'center', textTransform: 'none' },
  pressed: { transform: [{ translateY: 2 }, { scale: 0.97 }] },
  weighSlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  weigh: { width: '100%', height: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: brass.base, borderWidth: 2, borderColor: brass.light, borderBottomWidth: 7, borderBottomColor: brass.edge },
  weighLight: { position: 'absolute', left: 16, right: 16, top: 5, height: 7, borderRadius: 4, backgroundColor: brass.light, opacity: 0.8 },
  weighPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 3 },
  weighOff: { opacity: 0.45 },
  weighText: { color: CC.ink, letterSpacing: 3 },
  helpSlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: navy.base, borderWidth: 2, borderColor: steel.light, borderBottomWidth: 5, borderBottomColor: navy.edge },
  barOn: { borderColor: CC.warmLight, backgroundColor: navy.light },
  barText: { color: CC.text, textAlign: 'center', flexShrink: 1 },
  slot: { position: 'absolute' },
  fill: { width: '100%', height: '100%', minWidth: 0, paddingHorizontal: 8 },
});
