// Tower Rescue: Quake Control V0.1 (one repair). The screen draws flow.ts: a cutaway of the tower's
// machine room (two lift shafts and the air fans) beside a control panel that changes with the stage.
// Plain views and Reanimated, no canvas. Vectors only; approved sounds only (registry.ts).
//
// Reduced Motion: nothing travels or spins; the lift appears at the top with its doors open and the
// package delivered, after a short still beat. Sway and shaking are never drawn: the earthquake is a
// finished drill, told in words, never felt.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { TOWER_RESCUE } from '../../content/minigames';
import { TOKENS as T, eq, labelAt, readingAt } from '../../ui/palette';
import { markSize } from '../../ui/textRoles';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps } from '../types';
import { createTowerRescueFlow, lineText, type Cell, type TowerRescueFlow, type TowerRescueView } from './flow';

const C = TOWER_RESCUE;
/** The test run: the lift rises, its doors open, the robot rolls the package out (ms). */
const RUN = { rise: 1800, doors: 500, robot: 900, settle: 500 };
const RUN_MS = RUN.rise + RUN.doors + RUN.robot + RUN.settle;
const STILL_MS = 700;
const noop = () => () => undefined;

function useFlow({ session, sound }: Pick<MiniGameScreenProps, 'session' | 'sound'>): [TowerRescueFlow | null, TowerRescueView | null] {
  const [flow, setFlow] = useState<TowerRescueFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createTowerRescueFlow({ session, sound });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start();
    });
    return () => {
      cancelled = true;
      f.dispose();
    };
  }, [session, sound]);
  const view = useSyncExternalStore(flow ? flow.subscribe : noop, flow ? flow.view : () => null, flow ? flow.view : () => null);
  return [flow, view];
}

export function TowerRescueScreen({ session, size, insets, text, reducedMotion, sound, onExit }: MiniGameScreenProps) {
  const [flow, view] = useFlow({ session, sound });
  const wide = size.width >= size.height;
  const pad = { paddingTop: insets.top + 12, paddingRight: insets.right + 12, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 12 };
  // The test run: the screen plays it, then tells the flow (Reduced Motion: a still beat).
  useEffect(() => {
    if (!flow || view?.stage !== 'testing') return;
    const t = setTimeout(() => void flow.testPlayed(), reducedMotion ? STILL_MS : RUN_MS);
    return () => clearTimeout(t);
  }, [flow, view?.stage, reducedMotion]);

  return (
    <View testID="tower-rescue" style={[styles.screen, pad, wide ? styles.row : styles.column]}>
      <View style={[styles.scene, wide ? { flex: 1.1 } : { flex: 0.8 }]}>{view ? <Cutaway view={view} reducedMotion={reducedMotion} label={text.label} onInspect={(id) => flow?.inspect(id)} /> : null}</View>
      <View style={[styles.panel, wide ? { flex: 1 } : { flex: 1.15 }]}>
        <Header stage={view?.stage ?? 'loading'} label={text.label} onExit={onExit} />
        {/* A panel too small for its words scrolls, never shrinks them (textRoles.ts). */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {view && flow ? <Controls flow={flow} view={view} text={text} /> : null}
        </ScrollView>
      </View>
    </View>
  );
}

const STAGES = [
  { key: 'stageDiagnose', on: ['intro', 'diagnose'] },
  { key: 'stageRepair', on: ['repair'] },
  { key: 'stageTest', on: ['powered', 'testing', 'done'] },
] as const;

function Header({ stage, label, onExit }: { stage: TowerRescueView['stage']; label: number; onExit: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleWords}>
          <Text allowFontScaling={false} accessibilityRole="header" style={[labelAt(label + 4), styles.title]} numberOfLines={1}>
            {C.labels.title}
          </Text>
          <Text allowFontScaling={false} style={[labelAt(label), styles.subtitle]} numberOfLines={1}>
            {C.labels.subtitle}
          </Text>
        </View>
        <BackToElevatorButton onPress={onExit} size={label} style={styles.back} />
      </View>
      <View style={styles.chips} accessibilityRole="progressbar">
        {STAGES.map((s, i) => {
          const on = (s.on as readonly string[]).includes(stage);
          const past = STAGES.findIndex((x) => (x.on as readonly string[]).includes(stage)) > i;
          return (
            <View key={s.key} style={[styles.chip, on && styles.chipOn, past && styles.chipPast]} accessibilityState={{ selected: on }}>
              <Text allowFontScaling={false} style={[labelAt(label), on ? styles.chipTextOn : styles.chipText]}>
                {past ? `✓ ${C.labels[s.key]}` : C.labels[s.key]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Controls({ flow, view, text }: { flow: TowerRescueFlow; view: TowerRescueView; text: MiniGameScreenProps['text'] }) {
  const say = lineText(view);
  return (
    <View style={styles.controls}>
      <View style={styles.lineBox} accessibilityLiveRegion="polite">
        <View style={styles.bot} accessible={false}>
          <View style={styles.botEye} />
          <View style={styles.botEye} />
        </View>
        <Text allowFontScaling={false} testID="tr-line" style={[readingAt(text.dialogue.min, 'dialogue'), styles.lineText]}>
          {say}
        </Text>
      </View>
      {view.stage === 'intro' ? (
        <View style={styles.center}>
          <View style={styles.drill}>
            <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.drillText]}>
              {C.labels.drill}
            </Text>
          </View>
          <BigButton testID="tr-start" label={C.labels.start} size={text.question} onPress={() => flow.begin()} />
        </View>
      ) : null}
      {view.stage === 'diagnose' ? (
        <View style={styles.report} testID="tr-report">
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.reportLabel]}>
            {C.labels.report}
          </Text>
          <Text allowFontScaling={false} style={[readingAt(text.passage), styles.reportText]}>
            {view.clue.text}
          </Text>
        </View>
      ) : null}
      {view.stage === 'repair' && view.item ? <Repair flow={flow} view={view} text={text} /> : null}
      {view.stage === 'powered' ? (
        <View style={styles.center}>
          <PowerMeter view={view} label={text.label} />
          <BigButton testID="tr-run-test" label={C.labels.runTest} size={text.question} onPress={() => flow.runTest()} tall />
        </View>
      ) : null}
      {view.stage === 'done' ? (
        <View style={styles.center} testID="tr-done">
          <View style={styles.stamp}>
            <Text allowFontScaling={false} style={[labelAt(text.question), styles.stampText]}>
              {C.labels.done}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Repair({ flow, view, text }: { flow: TowerRescueFlow; view: TowerRescueView; text: MiniGameScreenProps['text'] }) {
  const item = view.item!;
  const shown = view.hint?.kind === 'showAnswer' ? view.hint.revealed : null;
  const helpLabel = view.help?.kind === 'showAnswer' ? C.labels.showMe : C.labels.hint;
  return (
    <View style={styles.repair}>
      <PowerMeter view={view} label={text.label} />
      <Text allowFontScaling={false} style={[labelAt(text.label), styles.cellsTitle]}>
        {C.labels.cells}
      </Text>
      <View style={styles.cells} accessibilityRole="radiogroup">
        {item.cells.map((cell) => (
          <PowerCell key={cell.id} cell={cell} size={text.question} tried={view.tried.includes(cell.id)} glow={shown === cell.value} disabled={view.busy} onPress={() => void flow.install(cell.id)} />
        ))}
      </View>
      {view.help ? (
        <Pressable testID="tr-hint" onPress={() => void flow.hint()} disabled={view.busy} accessibilityRole="button" accessibilityLabel={helpLabel} style={({ pressed }) => [styles.hint, view.help?.offered && styles.hintOffered, pressed && styles.pressed]}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.hintText]}>
            {helpLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The power meter: present power, the needed mark, and on a miss what the cell would have made (the consequence). */
function PowerMeter({ view, label }: { view: TowerRescueView; label: number }) {
  const item = view.item;
  const top = 20;
  if (!item) return null;
  const powered = view.stage !== 'repair';
  const level = powered ? item.needed : item.present;
  const pct = (n: number) => `${Math.min(100, (n / top) * 100)}%` as const;
  const missTo = view.miss ? item.present + view.miss.value : null;
  const gapLit = view.hint !== null && view.stage === 'repair';
  const bar = view.hint?.kind === 'numberLine' || view.hint?.kind === 'showAnswer';
  return (
    <View style={styles.meterWrap} testID="tr-meter" accessible accessibilityLabel={`${C.labels.needed} ${item.needed}. ${C.labels.present} ${powered ? item.needed : item.present}.`}>
      <View style={styles.meterLabels}>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterHas, gapLit && styles.lit]}>
          {C.labels.present} {level}
        </Text>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterNeeds, gapLit && styles.lit]}>
          {C.labels.needed} {item.needed}
        </Text>
      </View>
      <View style={styles.meter}>
        {missTo !== null ? <View style={[styles.meterMiss, { width: pct(missTo) }]} /> : null}
        <View style={[styles.meterFill, powered && styles.meterFull, { width: pct(level) }]} />
        {bar && !powered
          ? Array.from({ length: item.needed - item.present }, (_, i) => (
              <View key={i} style={[styles.tick, { left: pct(item.present + i + 1) }]}>
                <Text allowFontScaling={false} style={[labelAt(markSize(label, 0.75)), styles.tickText]}>
                  {item.present + i + 1}
                </Text>
              </View>
            ))
          : null}
        <View style={[styles.needMark, { left: pct(item.needed) }]} />
      </View>
      {missTo !== null ? (
        <Text allowFontScaling={false} testID="tr-miss" style={[labelAt(label), styles.missText]}>
          {item.present} + {view.miss!.value} = {missTo}
        </Text>
      ) : null}
    </View>
  );
}

function PowerCell({ cell, size, tried, glow, disabled, onPress }: { cell: Cell; size: number; tried: boolean; glow: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={`tr-cell-${cell.value}`}
      onPress={onPress}
      disabled={disabled || tried}
      accessibilityRole="button"
      accessibilityLabel={C.labels.install.replace('{value}', String(cell.value))}
      accessibilityState={{ disabled: disabled || tried }}
      style={({ pressed }) => [styles.cell, glow && styles.cellGlow, tried && styles.cellTried, pressed && styles.cellPressed]}
    >
      <View style={styles.cellCap} />
      <Text allowFontScaling={false} style={[labelAt(size), styles.cellText, tried && styles.cellTextTried]}>
        +{cell.value}
      </Text>
    </Pressable>
  );
}

function BigButton({ testID, label, size, onPress, tall = false }: { testID: string; label: string; size: number; onPress: () => void; tall?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.big, tall && styles.bigTall, pressed && styles.bigPressed]}>
      <Text allowFontScaling={false} style={[labelAt(size), styles.bigText]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---- the machine cutaway ----

function Cutaway({ view, reducedMotion, label, onInspect }: { view: TowerRescueView; reducedMotion: boolean; label: number; onInspect: (id: string) => void }) {
  const diagnosing = view.stage === 'diagnose';
  return (
    <View style={styles.cutaway}>
      <View style={styles.roof} />
      <View style={styles.systems}>
        {C.systems.map((s) => {
          const offline = s.id === view.clue.offline;
          const status = systemStatus(view, s.id, offline);
          return (
            <Pressable
              key={s.id}
              testID={`tr-system-${s.id}`}
              disabled={!diagnosing}
              onPress={() => onInspect(s.id)}
              accessibilityRole={diagnosing ? 'button' : 'image'}
              accessibilityLabel={`${s.name}${status === 'unknown' ? '' : `, ${status === 'running' ? C.labels.running : status === 'offline' ? C.labels.offline : C.labels.fixed}`}`}
              style={({ pressed }) => [styles.system, diagnosing && styles.systemTap, pressed && styles.pressed]}
            >
              <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(label), styles.systemName]}>
                {s.name}
              </Text>
              <Lamp status={status} label={label} />
              {s.kind === 'lift' ? <Shaft status={status} testing={offline && (view.stage === 'testing' || view.stage === 'done')} done={view.stage === 'done'} reducedMotion={reducedMotion} /> : <Fans status={status} reducedMotion={reducedMotion} />}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.ground} />
    </View>
  );
}

type Status = 'unknown' | 'running' | 'offline' | 'fixed';
/** Before the report is read every lamp is unknown; a checked system shows running; once found, the stopped lift is offline until repaired. */
function systemStatus(view: TowerRescueView, id: string, offline: boolean): Status {
  if (view.stage === 'intro' || view.stage === 'loading') return 'unknown';
  if (view.stage === 'diagnose') return view.checked.includes(id) ? 'running' : 'unknown';
  if (!offline) return 'running';
  return view.stage === 'repair' ? 'offline' : 'fixed';
}

function Lamp({ status, label }: { status: Status; label: number }) {
  const word = status === 'unknown' ? '?' : status === 'running' ? C.labels.running : status === 'offline' ? C.labels.offline : C.labels.fixed;
  return (
    <View style={[styles.lamp, status === 'running' || status === 'fixed' ? styles.lampOn : status === 'offline' ? styles.lampOff : styles.lampUnknown]}>
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(Math.max(16, label - 2)), styles.lampWord, status === 'offline' ? styles.lampTextOff : styles.lampText]}>
        {word}
      </Text>
    </View>
  );
}

function Shaft({ status, testing, done, reducedMotion }: { status: Status; testing: boolean; done: boolean; reducedMotion: boolean }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rise = useSharedValue(0);
  const doors = useSharedValue(0);
  const robot = useSharedValue(0);
  const ran = useRef(false);
  useEffect(() => {
    if (!testing) {
      ran.current = false;
      rise.set(0);
      doors.set(0);
      robot.set(0);
      return;
    }
    if (ran.current) return;
    ran.current = true;
    if (reducedMotion || done) {
      rise.set(1);
      doors.set(1);
      robot.set(1);
      return;
    }
    rise.set(withTiming(1, { duration: RUN.rise, easing: Easing.inOut(Easing.cubic) }));
    doors.set(withDelay(RUN.rise, withTiming(1, { duration: RUN.doors })));
    robot.set(withDelay(RUN.rise + RUN.doors, withTiming(1, { duration: RUN.robot, easing: Easing.out(Easing.back(1.4)) })));
  }, [testing, done, reducedMotion, rise, doors, robot]);
  // The car fills most of its shaft's width, so the payoff reads at a glance.
  const carW = Math.max(56, Math.min(120, box.w * 0.72));
  const carH = carW * 0.95;
  const travel = Math.max(0, box.h - carH - 10);
  const carStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -travel * rise.get() }] }));
  const leftDoor = useAnimatedStyle(() => ({ transform: [{ translateX: -carW * 0.5 * doors.get() }] }));
  const rightDoor = useAnimatedStyle(() => ({ transform: [{ translateX: carW * 0.5 * doors.get() }] }));
  const robotStyle = useAnimatedStyle(() => ({ opacity: doors.get(), transform: [{ scale: 0.7 + 0.5 * robot.get() }, { translateY: -8 * robot.get() }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: robot.get(), transform: [{ scale: 0.6 + 0.4 * robot.get() }] }));
  const lit = status === 'running' || status === 'fixed';
  return (
    <View style={[styles.shaft, lit && styles.shaftLit]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {[0.25, 0.5, 0.75].map((f) => (
        <FloorLamp key={f} at={f} lit={lit} rise={rise} />
      ))}
      <View style={styles.cable} />
      <Animated.View testID={testing ? 'tr-car-running' : undefined} style={[styles.car, { width: carW, height: carH }, lit ? styles.carLit : styles.carDark, carStyle]}>
        <Animated.View style={[styles.robot, robotStyle]}>
          <View style={[styles.robotHead, { width: carW * 0.42, height: carW * 0.3 }]}>
            <View style={styles.robotEye} />
            <View style={styles.robotEye} />
          </View>
          <View style={[styles.box, { width: carW * 0.38, height: carW * 0.26 }]} />
        </Animated.View>
        <Animated.View style={[styles.door, styles.doorLeft, leftDoor]} />
        <Animated.View style={[styles.door, styles.doorRight, rightDoor]} />
      </Animated.View>
      {testing ? (
        <Animated.View style={[styles.delivered, badgeStyle]}>
          <Text allowFontScaling={false} style={styles.deliveredText}>
            {'\u2713'}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A landing lamp: lights when the system has power, brighter once the running car passes it. */
function FloorLamp({ at, lit, rise }: { at: number; lit: boolean; rise: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: !lit ? 0.25 : rise.get() >= 1 - at ? 1 : 0.55 }));
  return (
    <View style={[styles.floorLine, { top: `${at * 100}%` }]}>
      <Animated.View style={[styles.floorLamp, lit ? styles.floorLampOn : styles.floorLampOff, style]} />
    </View>
  );
}

function Fans({ status, reducedMotion }: { status: Status; reducedMotion: boolean }) {
  const spin = useSharedValue(0);
  const on = status === 'running' && !reducedMotion;
  useEffect(() => {
    cancelAnimation(spin);
    // A slow turn (well under 3 Hz), and only once the fans are known to be running.
    if (on) spin.set(withRepeat(withTiming(360, { duration: 1600, easing: Easing.linear }), -1, false));
    else spin.set(0);
  }, [on, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  return (
    <View style={styles.fanBox}>
      <Animated.View style={[styles.fan, style]}>
        {[0, 60, 120].map((r) => (
          <View key={r} style={[styles.blade, { transform: [{ rotate: `${r}deg` }] }]} />
        ))}
      </Animated.View>
      <View style={styles.fanHub} />
    </View>
  );
}

const MIN = T.minTouchTarget;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: eq.night, gap: 12 },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  scene: { borderRadius: 18, overflow: 'hidden', backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelEdge },
  panel: { borderRadius: 18, padding: 14, gap: 12, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.steelEdge },
  header: { gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleWords: { flex: 1 },
  title: { color: eq.amber },
  subtitle: { color: eq.cyan },
  back: { minHeight: MIN },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: eq.steelEdge, backgroundColor: eq.recess },
  chipOn: { borderColor: eq.amber, backgroundColor: eq.charcoalLight },
  chipPast: { borderColor: eq.ok },
  chipText: { color: eq.textDim },
  chipTextOn: { color: eq.amber },
  controls: { flexGrow: 1, gap: 12 },
  scroll: { flex: 1 },
  scrollBody: { flexGrow: 1 },
  lampWord: { textAlign: 'center' },
  lineBox: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: eq.recess },
  bot: { width: 52, height: 44, borderRadius: 12, backgroundColor: eq.deepBlue, borderWidth: 2, borderColor: eq.cyan, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  botEye: { width: 10, height: 14, borderRadius: 5, backgroundColor: eq.cyan },
  lineText: { flex: 1, color: eq.text },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 12 },
  drill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: eq.ok, backgroundColor: eq.recess },
  drillText: { color: eq.ok, letterSpacing: 2 },
  report: { padding: 16, borderRadius: 14, gap: 8, backgroundColor: eq.coolWhite, borderLeftWidth: 8, borderLeftColor: eq.amber },
  reportLabel: { color: eq.deepBlue, letterSpacing: 2 },
  reportText: { color: eq.night },
  repair: { gap: 12 },
  meterWrap: { gap: 6, alignSelf: 'stretch' },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  meterHas: { color: eq.cyan },
  meterNeeds: { color: eq.amber },
  lit: { textDecorationLine: 'underline' },
  meter: { height: 44, borderRadius: 10, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelEdge, overflow: 'visible' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: eq.cyan },
  meterFull: { backgroundColor: eq.ok },
  meterMiss: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: eq.amberDim, borderWidth: 2, borderColor: eq.amber, borderStyle: 'dashed' },
  missText: { color: eq.amber, alignSelf: 'flex-end' },
  needMark: { position: 'absolute', top: -8, bottom: -8, width: 5, marginLeft: -2, borderRadius: 2, backgroundColor: eq.amber },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: eq.coolWhite, alignItems: 'center' },
  tickText: { position: 'absolute', top: 46, width: 28, textAlign: 'center', color: eq.coolWhite },
  cellsTitle: { color: eq.textDim, marginTop: 14 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { minWidth: 96, minHeight: 84, flexGrow: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlueLight, borderWidth: 3, borderColor: eq.cyan, borderBottomWidth: 7 },
  cellCap: { position: 'absolute', top: 6, width: 26, height: 7, borderRadius: 3, backgroundColor: eq.coolWhite, opacity: 0.8 },
  cellGlow: { borderColor: eq.clue, backgroundColor: eq.deepBlue, shadowColor: eq.clue, shadowOpacity: 0.9, shadowRadius: 14 },
  cellTried: { backgroundColor: eq.recess, borderColor: eq.steelDark, opacity: 0.55 },
  cellPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 3 },
  cellText: { color: eq.coolWhite, fontWeight: '900' },
  cellTextTried: { color: eq.textDim, textDecorationLine: 'line-through' },
  hint: { alignSelf: 'flex-start', minHeight: MIN, minWidth: 140, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: eq.steelLight, backgroundColor: eq.charcoalLight },
  hintOffered: { borderColor: eq.clue },
  hintText: { color: eq.text },
  big: { minWidth: 220, minHeight: 84, paddingHorizontal: 28, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.amber, borderBottomWidth: 8, borderBottomColor: eq.amberDim },
  bigTall: { minHeight: 120, minWidth: 260 },
  bigPressed: { transform: [{ translateY: 5 }], borderBottomWidth: 3 },
  bigText: { color: eq.night, fontWeight: '900', letterSpacing: 2 },
  stamp: { paddingHorizontal: 24, paddingVertical: 18, borderRadius: 16, borderWidth: 4, borderColor: eq.ok, backgroundColor: eq.recess, transform: [{ rotate: '-3deg' }] },
  stampText: { color: eq.ok, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  // cutaway
  cutaway: { flex: 1, padding: 12 },
  roof: { height: 14, marginHorizontal: 20, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: eq.steelDark },
  systems: { flex: 1, flexDirection: 'row', gap: 10, padding: 10, backgroundColor: eq.charcoalLight, borderWidth: 3, borderColor: eq.steel },
  system: { flex: 1, gap: 8, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', minWidth: MIN },
  systemTap: { borderColor: eq.cyan, borderStyle: 'dashed', backgroundColor: eq.charcoal },
  systemName: { color: eq.text, textAlign: 'center', minHeight: 40 },
  lamp: { minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2 },
  lampOn: { backgroundColor: eq.ok, borderColor: eq.coolWhite },
  lampOff: { backgroundColor: eq.recess, borderColor: eq.amber },
  lampUnknown: { backgroundColor: eq.charcoal, borderColor: eq.steelEdge },
  lampText: { color: eq.night },
  lampTextOff: { color: eq.amber },
  shaft: { flex: 1, minHeight: 160, borderRadius: 8, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelDark, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  shaftLit: { borderColor: eq.steel, backgroundColor: eq.charcoal },
  floorLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: eq.steelDark, alignItems: 'flex-end', justifyContent: 'center' },
  floorLamp: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  floorLampOn: { backgroundColor: eq.amber },
  floorLampOff: { backgroundColor: eq.steelEdge },
  cable: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: eq.steelEdge },
  car: { borderRadius: 8, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  carLit: { backgroundColor: eq.glass, borderColor: eq.amber },
  carDark: { backgroundColor: eq.steelDark, borderColor: eq.steelEdge },
  door: { position: 'absolute', top: 0, bottom: 0, width: '50%', backgroundColor: eq.steel, borderColor: eq.steelEdge },
  doorLeft: { left: 0, borderRightWidth: 1 },
  doorRight: { right: 0, borderLeftWidth: 1 },
  robot: { alignItems: 'center', marginBottom: 4 },
  robotHead: { borderRadius: 7, backgroundColor: eq.deepBlue, borderWidth: 2, borderColor: eq.cyan, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  robotEye: { width: 6, height: 8, borderRadius: 3, backgroundColor: eq.cyan },
  box: { marginTop: 3, borderRadius: 3, backgroundColor: eq.amber, borderWidth: 2, borderColor: eq.amberDim },
  delivered: { position: 'absolute', top: 6, right: 6, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.ok, borderWidth: 3, borderColor: eq.coolWhite },
  deliveredText: { color: eq.night, fontSize: 24, fontWeight: '900' },
  fanBox: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelDark },
  fan: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  blade: { position: 'absolute', width: 76, height: 16, borderRadius: 8, backgroundColor: eq.steelLight },
  fanHub: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: eq.amber },
  ground: { height: 12, backgroundColor: eq.steelDark },
});
