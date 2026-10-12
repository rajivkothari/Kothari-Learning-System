// Tower Rescue: Quake Control V0.1 (one repair). The screen draws flow.ts: a cutaway of the tower's
// machine room (two lift shafts and the air fans) beside a control panel that changes with the stage.
// Plain views and Reanimated, no canvas; approved sounds only (registry.ts).
//
// Art (D195): the approved production pieces (towerArt.ts) draw as native images inside the views that
// already move: the car and its door leaves, the robot, the motor gear, the fan, the clamps, the
// breaker, the cells. So every timing and transform below is the same with art or without it. Each
// piece keeps its vector as the fallback (no art set, or an image that fails to load). The monitor,
// lamps, LEDs, meter, power riser, sparks and the light sweep stay procedural.
//
// Game feel (D193; timings in feel.ts). The flow decides; the screen plays it:
//   touch      every control presses in on touch-down, on the UI thread, before anything is decided
//   install    the cell lifts, flies to the POWER BAY, seats with a click; the screen holds the old
//              picture until it has seated, then the socket answers: right, the meter fills tick by tick,
//              power runs down the line and the lift's lamp comes on; wrong, the meter shows what the cell
//              would make, the safety switch trips and the cell pops back to its slot
//   test run   relays, the motor, the lift rises past the landings, arrives, doors, the robot delivers,
//              the room lights up: one celebration, once
//   life       while the player thinks the room is calm: a monitor trace, breathing status lights, a
//              relay now and then, the robot blinking. Nothing inside the three systems moves until its
//              state is known, so the room never gives the answer away.
//
// Reduced Motion: nothing travels, spins, bobs or bursts. Cells appear in the bay, states cross-fade,
// the test run is a short still sequence (relays lit, the lift at the top, doors open, delivered).
// The earthquake is a finished drill, told in words, never felt: nothing sways or shakes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type ImageStyle, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { TOWER_RESCUE } from '../../content/minigames';
import { useArt } from '../../ui/art/ArtContext';
import { TOKENS as T, eq, labelAt, readingAt } from '../../ui/palette';
import { markSize } from '../../ui/textRoles';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps, MiniGameSound } from '../types';
import { AMBIENT, DOORS_MS, INSTALL, RESULT, RISE_MS, TEST_RUN, installHoldMs, reached, rightSounds, wrongSounds, type SoundBeat, type TestStep } from './feel';
import { createTowerRescueFlow, lineText, type Cell, type TowerRescueFlow, type TowerRescueView } from './flow';
import { CAR_ROOF, GUIDE_HEAD, gearFloor, SHAFT_LAMPS, bayPlacement, carArt, carPlacement, cover, housing, robotPlacement, rotorPlacement, towerArt, type Rect, type TowerArt, type TowerPiece } from './towerArt';

const C = TOWER_RESCUE;
const noop = () => () => undefined;

/** The art pieces this screen can draw, and where a failed image reports itself (it then draws its vector). */
const TowerArtContext = createContext<{ art: TowerArt; onError: (id: string) => void }>({ art: {}, onError: () => undefined });
const useTowerArt = () => useContext(TowerArtContext);

/** One art piece, exactly in its box (its own shape, so never stretched); decoration, never a control. */
function Piece({ piece, rect, style }: { piece: TowerPiece; rect?: Rect; style?: StyleProp<ImageStyle> }) {
  const { onError } = useTowerArt();
  return (
    <Image
      source={piece.source}
      resizeMode="contain"
      fadeDuration={0}
      accessible={false}
      accessibilityIgnoresInvertColors
      onError={() => onError(piece.entry.id)}
      style={[rect ? { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h } : StyleSheet.absoluteFill, style]}
    />
  );
}

function useFlow({ session }: Pick<MiniGameScreenProps, 'session'>): [TowerRescueFlow | null, TowerRescueView | null] {
  const [flow, setFlow] = useState<TowerRescueFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createTowerRescueFlow({ session });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start();
    });
    return () => {
      cancelled = true;
      f.dispose();
    };
  }, [session]);
  const view = useSyncExternalStore(flow ? flow.subscribe : noop, flow ? flow.view : () => null, flow ? flow.view : () => null);
  return [flow, view];
}

/** Timers that die with the screen: every beat of every sequence goes through here. */
function useLater() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of all) clearTimeout(t);
      all.clear();
    };
  }, []);
  return useCallback((ms: number, fn: () => void) => {
    if (ms <= 0) return void fn();
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
}

const playBeats = (later: (ms: number, fn: () => void) => void, sound: MiniGameSound, beats: readonly SoundBeat[], since = 0) => {
  for (const b of beats) later(b.at - since, () => (b.loop === undefined ? sound.play(b.slot) : sound.loop(b.slot, b.loop)));
};

/** A cell on its way to the bay. `result` arrives with the runtime's answer. */
export interface InstallFx {
  n: number;
  cellId: string;
  value: number;
  /** pending until the answer comes back; then the socket's answer plays. */
  result: 'pending' | 'right' | 'wrong' | 'fresh';
  /** wrong or fresh: the cell is on its way back to its slot. */
  ejecting: boolean;
}

export function TowerRescueScreen({ session, size, insets, text, reducedMotion, sound, onExit }: MiniGameScreenProps) {
  const [flow, view] = useFlow({ session });
  const later = useLater();
  // The approved art (D195), less any image that failed to load (that piece draws its vector).
  const artSettings = useArt();
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const onMissing = artSettings.onMissing;
  const artContext = useMemo(
    () => ({
      art: towerArt(artSettings.set, failed),
      onError: (id: string) => {
        setFailed((s) => (s.has(id) ? s : new Set(s).add(id)));
        onMissing?.(id);
      },
    }),
    [artSettings.set, failed, onMissing],
  );
  const wide = size.width >= size.height;
  const pad = { paddingTop: insets.top + 12, paddingRight: insets.right + 12, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 12 };

  // The machine room hums quietly the whole time (an ambient loop; the host stops it on leaving).
  useEffect(() => {
    sound.loop('ambientMachinery', true);
    return () => sound.loop('ambientMachinery', false);
  }, [sound]);

  // Installing: hold the picture as it was until the cell has seated, then show the flow's answer.
  const [held, setHeld] = useState<TowerRescueView | null>(null);
  const [fx, setFx] = useState<InstallFx | null>(null);
  const [runTestReady, setRunTestReady] = useState(false);
  /** The right cell has seated: power runs to the lift (a short beat; the RUN TEST button comes once the meter is full). */
  const [charging, setCharging] = useState(false);
  const fxSeq = useRef(0);
  const install = useCallback(
    (cell: Cell) => {
      // A cell on its way back (refused) never blocks the next one: only a cell still waiting on its answer does.
      if (!flow || !view || (fx && (fx.result === 'pending' || fx.result === 'right')) || view.busy || view.stage !== 'repair') return;
      const n = ++fxSeq.current;
      const tapped = Date.now();
      const hold = installHoldMs(reducedMotion);
      setHeld(view);
      setFx({ n, cellId: cell.id, value: cell.value, result: 'pending', ejecting: false });
      if (!reducedMotion) sound.play('cratePick');
      let seated = false;
      let answered: InstallFx['result'] | null = null;
      const release = () => {
        if (!seated || answered === null) return;
        const r = reducedMotion ? RESULT.reduced : RESULT.normal;
        setHeld(null);
        setFx((f) => (f && f.n === n ? { ...f, result: answered! } : f));
        const since = Date.now() - tapped;
        if (answered === 'right') {
          const item = view.item!;
          playBeats(later, sound, rightSounds(item.needed - item.present, reducedMotion).filter((b) => b.slot !== 'cratePick'), since);
          setCharging(true);
          later(r.runTestAt, () => {
            setRunTestReady(true);
            setFx((f) => (f && f.n === n ? null : f));
          });
          later(r.runTestAt + 600, () => setCharging(false));
        } else {
          playBeats(later, sound, wrongSounds(reducedMotion).filter((b) => b.slot !== 'cratePick'), since);
          later(r.ejectAt, () => setFx((f) => (f && f.n === n ? { ...f, ejecting: true } : f)));
          later(r.ejectAt + r.ejectMs + 40, () => setFx((f) => (f && f.n === n ? null : f)));
        }
      };
      later(hold, () => {
        seated = true;
        release();
      });
      void flow.install(cell.id).then(() => {
        const v = flow.view();
        answered = v.stage === 'powered' ? 'right' : v.miss?.cellId === cell.id ? 'wrong' : v.stage === 'repair' ? 'fresh' : 'right';
        release();
      });
    },
    [flow, view, fx, reducedMotion, sound, later],
  );

  // RUN TEST: the celebration, step by step; at its end the screen tells the flow the test has played.
  const [testStep, setTestStep] = useState<TestStep | null>(null);
  const runTest = useCallback(() => {
    if (!flow || view?.stage !== 'powered' || testStep) return;
    flow.runTest();
    const beats = TEST_RUN[reducedMotion ? 'reduced' : 'normal'];
    for (const b of beats) {
      later(b.at, () => {
        setTestStep(b.step);
        if (b.step === 'end') void flow.testPlayed();
      });
      playBeats(later, sound, b.sounds);
    }
  }, [flow, view?.stage, testStep, reducedMotion, sound, later]);

  // Diagnose: a click for every check, the machine answering (a fan spins up, a gear turns), or the find.
  const inspect = useCallback(
    (id: string) => {
      if (!flow || view?.stage !== 'diagnose' || view.busy) return;
      const offline = id === view.clue.offline;
      const kind = C.systems.find((s) => s.id === id)?.kind;
      flow.inspect(id);
      if (offline) {
        sound.play('answerRight');
        later(220, () => sound.play('radioStatic'));
      } else if (!view.checked.includes(id)) {
        sound.play('gaugeTick');
        later(140, () => sound.play(kind === 'fans' ? 'fanStart' : 'gearTurn'));
      } else sound.play('gaugeTick');
    },
    [flow, view, sound, later],
  );

  const shown = held ?? view;
  // Resumed at done (the test ran before): the room is lit, everything reached.
  const step: TestStep | null = shown?.stage === 'done' ? 'end' : testStep;

  return (
    <TowerArtContext.Provider value={artContext}>
    <View testID="tower-rescue" style={[styles.screen, pad, wide ? styles.row : styles.column]}>
      <View style={[styles.scene, wide ? { flex: 1.1 } : { flex: 0.8 }]}>{shown ? <Cutaway view={shown} step={step} powerUp={charging} reducedMotion={reducedMotion} label={text.label} onInspect={inspect} /> : null}</View>
      <View style={[styles.panel, wide ? { flex: 1 } : { flex: 1.15 }]}>
        <Header stage={shown?.stage ?? 'loading'} label={text.label} reducedMotion={reducedMotion} onExit={onExit} />
        {/* A panel too small for its words scrolls, never shrinks them (textRoles.ts). */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {shown && flow ? (
            <Controls
              flow={flow}
              view={shown}
              text={text}
              reducedMotion={reducedMotion}
              fx={fx}
              step={step}
              runTestReady={runTestReady || (shown.stage === 'powered' && !charging)}
              onInstall={install}
              onRunTest={runTest}
              sound={sound}
            />
          ) : null}
        </ScrollView>
      </View>
    </View>
    </TowerArtContext.Provider>
  );
}

// ---- touch feel ----

/**
 * A control that presses in on touch-down, on the UI thread (non-negotiable 11), and acts on release
 * as before. One press-in for every control in the game: buttons, cells, systems.
 */
function Press({ testID, label, role = 'button', disabled = false, selected, onPress, onDown, depth = 4, scale = 0.95, style, children }: { testID?: string; label: string; role?: 'button' | 'image'; disabled?: boolean; selected?: boolean; onPress: () => void; onDown?: () => void; depth?: number; scale?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const pressed = useSharedValue(0);
  // The gesture's callbacks can outlive a render: they call the latest handlers through stable functions,
  // and a disabled control neither presses in nor acts (checked on both threads).
  const off = useSharedValue(disabled ? 1 : 0);
  const latest = useRef({ onPress, onDown, disabled });
  useEffect(() => {
    latest.current = { onPress, onDown, disabled };
    off.set(disabled ? 1 : 0);
  });
  const down = useCallback(() => {
    if (!latest.current.disabled) latest.current.onDown?.();
  }, []);
  const act = useCallback(() => {
    if (!latest.current.disabled) latest.current.onPress();
  }, []);
  // `down` and `act` read the ref only when the gesture fires (an event), never during render: the
  // react-hooks/refs rule cannot see through runOnJS, hence the two disables below.
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    // eslint-disable-next-line react-hooks/refs
    .onBegin(() => {
      'worklet';
      if (off.get()) return;
      pressed.set(1);
      runOnJS(down)();
    })
    // eslint-disable-next-line react-hooks/refs
    .onEnd(() => {
      'worklet';
      if (off.get()) return;
      runOnJS(act)();
    })
    .onFinalize(() => {
      'worklet';
      pressed.set(withTiming(0, { duration: 140 }));
    });
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: depth * pressed.get() }, { scale: 1 - (1 - scale) * pressed.get() }] }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        testID={testID}
        accessible
        accessibilityRole={role}
        accessibilityLabel={label}
        accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => (disabled ? undefined : onPress())}
        aria-disabled={disabled}
        style={[style, anim]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/** Something that arrives: a short rise and fade in when it mounts (a cut under Reduced Motion). */
function Arrive({ children, reducedMotion, delay = 0, from = 10, style }: { children: ReactNode; reducedMotion: boolean; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    p.set(withDelay(delay, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
  }, [p, delay, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: from * (1 - p.get()) }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A one-time pop when something earns attention (the RUN TEST button, the stamp). */
function Pop({ children, reducedMotion, from = 0.6, overshoot = 1.06, style }: { children: ReactNode; reducedMotion: boolean; from?: number; overshoot?: number; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(reducedMotion ? 1 : from);
  const o = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    o.set(withTiming(1, { duration: 140 }));
    s.set(withSequence(withTiming(overshoot, { duration: 200, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 160, easing: Easing.inOut(Easing.sin) })));
  }, [s, o, from, overshoot, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ scale: s.get() }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Sparks: one burst, a few dots flying out and fading (never repeated; none under Reduced Motion). */
function Sparks({ count = 6, radius = 46, color = eq.amber, size = 7, play }: { count?: number; radius?: number; color?: string; size?: number; play: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (play === 0) return;
    p.set(0);
    p.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [p, play]);
  if (play === 0) return null;
  return (
    <View pointerEvents="none" style={styles.sparks}>
      {Array.from({ length: count }, (_, i) => (
        <Spark key={`${play}-${i}`} p={p} angle={(i / count) * Math.PI * 2 + 0.3} radius={radius * (0.75 + ((i * 37) % 10) / 40)} color={color} size={size} />
      ))}
    </View>
  );
}
function Spark({ p, angle, radius, color, size }: { p: SharedValue<number>; angle: number; radius: number; color: string; size: number }) {
  const anim = useAnimatedStyle(() => ({ opacity: p.get() < 1 ? 1 - p.get() : 0, transform: [{ translateX: Math.cos(angle) * radius * p.get() }, { translateY: Math.sin(angle) * radius * p.get() }, { scale: 1 - 0.5 * p.get() }] }));
  return <Animated.View style={[styles.spark, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginLeft: -size / 2, marginTop: -size / 2 }, anim]} />;
}

// ---- the panel ----

const STAGES = [
  { key: 'stageDiagnose', on: ['intro', 'diagnose'] },
  { key: 'stageRepair', on: ['repair'] },
  { key: 'stageTest', on: ['powered', 'testing', 'done'] },
] as const;

function Header({ stage, label, reducedMotion, onExit }: { stage: TowerRescueView['stage']; label: number; reducedMotion: boolean; onExit: () => void }) {
  const current = STAGES.findIndex((x) => (x.on as readonly string[]).includes(stage));
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
        {STAGES.map((s, i) => (
          <StageChip key={s.key} label={C.labels[s.key]} on={i === current} past={current > i} size={label} reducedMotion={reducedMotion} />
        ))}
      </View>
    </View>
  );
}

/** A stage chip: the current one lights; a finished one takes its check with a small pop. */
function StageChip({ label, on, past, size, reducedMotion }: { label: string; on: boolean; past: boolean; size: number; reducedMotion: boolean }) {
  const pop = useSharedValue(1);
  const wasPast = useRef(past);
  useEffect(() => {
    if (past && !wasPast.current && !reducedMotion) pop.set(withSequence(withTiming(1.08, { duration: 140 }), withTiming(1, { duration: 180 })));
    wasPast.current = past;
  }, [past, pop, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Animated.View style={[styles.chip, on && styles.chipOn, past && styles.chipPast, anim]} accessibilityState={{ selected: on }}>
      <Text allowFontScaling={false} style={[labelAt(size), on ? styles.chipTextOn : past ? styles.chipTextPast : styles.chipText]}>
        {past ? `✓ ${label}` : label}
      </Text>
    </Animated.View>
  );
}

type Mood = 'calm' | 'happy' | 'concern';
const moodOf = (key: TowerRescueView['line']['key']): Mood => (key === 'found' || key === 'restored' || key === 'testDone' ? 'happy' : key === 'wrongSystem' || key === 'tooLow' || key === 'tooHigh' || key === 'fresh' ? 'concern' : 'calm');

function Controls({ flow, view, text, reducedMotion, fx, step, runTestReady, onInstall, onRunTest, sound }: { flow: TowerRescueFlow; view: TowerRescueView; text: MiniGameScreenProps['text']; reducedMotion: boolean; fx: InstallFx | null; step: TestStep | null; runTestReady: boolean; onInstall: (cell: Cell) => void; onRunTest: () => void; sound: MiniGameSound }) {
  const say = lineText(view);
  const click = () => sound.play('floorButtonPress');
  return (
    <View style={styles.controls}>
      <View style={styles.lineBox} accessibilityLiveRegion="polite">
        <Bot mood={moodOf(view.line.key)} cue={`${view.line.key}:${say}`} reducedMotion={reducedMotion} />
        <Text allowFontScaling={false} testID="tr-line" style={[readingAt(text.dialogue.min, 'dialogue'), styles.lineText]}>
          {say}
        </Text>
      </View>
      {view.stage === 'intro' ? (
        <Arrive reducedMotion={reducedMotion} style={styles.center}>
          <View style={styles.drill}>
            <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.drillText]}>
              {C.labels.drill}
            </Text>
          </View>
          <BigButton testID="tr-start" label={C.labels.start} size={text.question} onDown={click} onPress={() => flow.begin()} />
        </Arrive>
      ) : null}
      {view.stage === 'diagnose' ? (
        <Arrive key="report" reducedMotion={reducedMotion}>
          <View style={styles.report} testID="tr-report">
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.reportLabel]}>
              {C.labels.report}
            </Text>
            <Text allowFontScaling={false} style={[readingAt(text.passage), styles.reportText]}>
              {view.clue.text}
            </Text>
          </View>
        </Arrive>
      ) : null}
      {(view.stage === 'repair' || view.stage === 'powered') && view.item ? (
        // One workbench for the repair and the powered lift: the bay and the meter stay where they are,
        // so the seated cell and the fill carry straight on; the cells give way to RUN TEST.
        <Arrive key="bench" reducedMotion={reducedMotion}>
          <Workbench flow={flow} view={view} text={text} fx={fx} reducedMotion={reducedMotion} onInstall={onInstall} onClick={click} runTestReady={runTestReady} onRunTest={onRunTest} />
        </Arrive>
      ) : view.stage === 'powered' ? (
        // Resumed after the repair with no item saved: the button alone.
        <View style={styles.center}>
          <BigButton testID="tr-run-test" label={C.labels.runTest} size={text.question} onPress={onRunTest} tall />
        </View>
      ) : null}
      {view.stage === 'testing' || view.stage === 'done' ? (
        <View style={styles.center}>
          <TestStrip step={step} label={text.label} reducedMotion={reducedMotion} />
          {view.stage === 'done' ? (
            <Pop reducedMotion={reducedMotion} from={1.5} overshoot={0.96}>
              <View style={styles.stamp} testID="tr-done">
                <Text allowFontScaling={false} style={[labelAt(text.question), styles.stampText]}>
                  {C.labels.done}
                </Text>
              </View>
            </Pop>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The engineer robot beside the words: blinks and breathes while waiting; happy hop, or a concerned tilt.
 * With art its face is the robot's head, cropped from a pose into the same 52 by 44 slot (the happy
 * pose's head when it is happy); a blink dims its eyes for a moment.
 */
function Bot({ mood, cue, reducedMotion }: { mood: Mood; cue: string; reducedMotion: boolean }) {
  const { art } = useTowerArt();
  const head = art['robot-neutral'];
  const happyHead = art['robot-success'];
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const hop = useSharedValue(0);
  const tilt = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(bob);
    cancelAnimation(blink);
    if (reducedMotion) {
      bob.set(0);
      blink.set(1);
      return;
    }
    bob.set(withRepeat(withTiming(1, { duration: AMBIENT.bobMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
    blink.set(withRepeat(withSequence(withDelay(AMBIENT.blinkEveryMs, withTiming(0.15, { duration: 70 })), withTiming(1, { duration: 90 })), -1, false));
  }, [bob, blink, reducedMotion]);
  useEffect(() => {
    if (reducedMotion) return;
    if (mood === 'happy') hop.set(withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) })));
    tilt.set(withTiming(mood === 'concern' ? 1 : 0, { duration: 220 }));
  }, [cue, mood, hop, tilt, reducedMotion]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * bob.get() - 8 * hop.get() }, { rotate: `${-6 * tilt.get()}deg` }] }));
  const eye = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.get() }] }));
  const lid = useAnimatedStyle(() => ({ opacity: Math.min(1, (1 - blink.get()) / 0.85) }));
  const happy = mood === 'happy';
  if (head) {
    // The crop fills the slot's inside (48 by 40 within the 2 pt border); the lid covers both eyes.
    const k = BOT_INNER.w / GUIDE_HEAD.w;
    const side = head.entry.width * k;
    return (
      <Animated.View key="art" style={[styles.bot, styles.botArt, mood === 'concern' && styles.botConcern, body]} accessible={false}>
        {/* Both faces stay mounted (one hidden), so a mood change never waits on an image decode. */}
        <Piece piece={head} rect={{ x: -GUIDE_HEAD.x * k, y: -GUIDE_HEAD.y * k, w: side, h: side }} style={happy && happyHead ? styles.hidden : null} />
        {happyHead ? <Piece piece={happyHead} rect={{ x: -GUIDE_HEAD.x * k, y: -GUIDE_HEAD.y * k, w: side, h: side }} style={happy ? null : styles.hidden} /> : null}
        <Animated.View pointerEvents="none" style={[styles.botLid, lid]} />
      </Animated.View>
    );
  }
  return (
    <Animated.View key="vector" style={[styles.bot, mood === 'concern' && styles.botConcern, body]} accessible={false}>
      {[0, 1].map((i) => (
        <Animated.View key={i} style={[styles.botEye, happy && styles.botEyeHappy, mood === 'concern' && styles.botEyeConcern, eye]} />
      ))}
    </Animated.View>
  );
}
const BOT_INNER = { w: 48, h: 40 } as const;

function Workbench({ flow, view, text, fx, reducedMotion, onInstall, onClick, runTestReady, onRunTest }: { flow: TowerRescueFlow; view: TowerRescueView; text: MiniGameScreenProps['text']; fx: InstallFx | null; reducedMotion: boolean; onInstall: (cell: Cell) => void; onClick: () => void; runTestReady: boolean; onRunTest: () => void }) {
  const item = view.item!;
  const repairing = view.stage === 'repair';
  /** A cell is seating or the socket has not answered yet: the next tap waits for that, nothing longer. */
  const waiting = fx !== null && (fx.result === 'pending' || fx.result === 'right');
  const shownCell = view.hint?.kind === 'showAnswer' ? view.hint.revealed : null;
  const helpLabel = view.help?.kind === 'showAnswer' ? C.labels.showMe : C.labels.hint;
  // Where things are, in this box's coordinates: the bay (for the flight), the cell row and each cell.
  const [rowAt, setRowAt] = useState<LayoutRectangle | null>(null);
  const [bayAt, setBayAt] = useState<LayoutRectangle | null>(null);
  const [cellsAt, setCellsAt] = useState<LayoutRectangle | null>(null);
  const [cellAt, setCellAt] = useState<Record<string, LayoutRectangle>>({});
  const flying = fx ? cellAt[fx.cellId] : undefined;
  const from = flying && cellsAt ? { x: cellsAt.x + flying.x, y: cellsAt.y + flying.y, w: flying.width, h: flying.height } : null;
  const to = bayAt && rowAt ? { x: rowAt.x + bayAt.x, y: rowAt.y + bayAt.y, w: bayAt.width, h: bayAt.height } : null;
  const side = cellSide(cellsAt, item.cells.length);
  return (
    <View style={styles.repair}>
      <View onLayout={(e) => setRowAt(e.nativeEvent.layout)}>
        <BayRow view={view} label={text.label} fx={fx} reducedMotion={reducedMotion} onBay={setBayAt} />
      </View>
      {repairing ? null : (
        <View style={styles.center}>
          {runTestReady ? (
            <Pop reducedMotion={reducedMotion}>
              <BigButton testID="tr-run-test" label={C.labels.runTest} size={text.question} onPress={onRunTest} tall />
            </Pop>
          ) : (
            <View style={styles.runTestSpace} />
          )}
        </View>
      )}
      {repairing ? (
        <Text allowFontScaling={false} style={[labelAt(text.label), styles.cellsTitle]}>
          {C.labels.cells}
        </Text>
      ) : null}
      {repairing ? (
      <View style={styles.cells} accessibilityRole="radiogroup" onLayout={(e) => setCellsAt(e.nativeEvent.layout)}>
        {item.cells.map((cell) => (
          <View key={cell.id} style={styles.cellSlot} onLayout={(e) => setCellAt((m) => ({ ...m, [cell.id]: e.nativeEvent.layout }))}>
            <PowerCell
              cell={cell}
              size={text.question}
              side={side}
              tried={view.tried.includes(cell.id)}
              out={fx?.cellId === cell.id}
              glow={shownCell === cell.value}
              disabled={view.busy || waiting}
              reducedMotion={reducedMotion}
              onPress={() => onInstall(cell)}
            />
          </View>
        ))}
      </View>
      ) : null}
      {repairing && view.help ? (
        <Press testID="tr-hint" label={helpLabel} disabled={view.busy || waiting} onDown={onClick} onPress={() => void flow.hint()} style={[styles.hint, view.help.offered && styles.hintOffered]}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.hintText]}>
            {helpLabel}
          </Text>
        </Press>
      ) : null}
      {/* The cell in flight; once the socket takes it (right), the bay shows it seated instead. */}
      {fx && from && to && fx.result !== 'right' ? <Carrier key={fx.n} fx={fx} from={from} to={to} size={text.question} side={side} reducedMotion={reducedMotion} /> : null}
    </View>
  );
}

/** The cell in flight: lifts, arcs to the bay and seats (squash); if the socket refuses, it hops home. */
function Carrier({ fx, from, to, size, side, reducedMotion }: { fx: InstallFx; from: { x: number; y: number; w: number; h: number }; to: { x: number; y: number; w: number; h: number }; size: number; side: number; reducedMotion: boolean }) {
  const t = reducedMotion ? INSTALL.reduced : INSTALL.normal;
  const lift = useSharedValue(0);
  const p = useSharedValue(reducedMotion ? 1 : 0);
  const seat = useSharedValue(0);
  const fade = useSharedValue(reducedMotion ? 0 : 1);
  useEffect(() => {
    if (reducedMotion) {
      fade.set(withTiming(1, { duration: t.seat }));
      return;
    }
    lift.set(withTiming(1, { duration: t.lift, easing: Easing.out(Easing.quad) }));
    p.set(withDelay(t.lift, withTiming(1, { duration: t.fly, easing: Easing.inOut(Easing.cubic) })));
    seat.set(withDelay(t.lift + t.fly, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: t.seat - 60, easing: Easing.out(Easing.back(2)) }))));
  }, [lift, p, seat, fade, reducedMotion, t.lift, t.fly, t.seat]);
  useEffect(() => {
    if (!fx.ejecting) return;
    const r = reducedMotion ? RESULT.reduced : RESULT.normal;
    if (reducedMotion) fade.set(withTiming(0, { duration: 120 }));
    else p.set(withTiming(0, { duration: r.ejectMs, easing: Easing.out(Easing.back(1.3)) }));
  }, [fx.ejecting, p, fade, reducedMotion]);
  const { art } = useTowerArt();
  // The cell shrinks to the bay's size on the way (with art: to the seated cell's); an arc lifts it over the meter.
  const k = art.cell ? (to.w * SEATED) / side : Math.min(to.w / from.w, to.h / from.h) * 0.86;
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  const anim = useAnimatedStyle(() => {
    const q = p.get();
    const arc = Math.sin(Math.PI * q) * 26;
    const scale = (1 + 0.08 * lift.get() * (1 - q)) * (1 + (k - 1) * q);
    return {
      opacity: fade.get(),
      transform: [{ translateX: dx * q }, { translateY: dy * q - arc - 6 * lift.get() * (1 - q) }, { scale }, { scaleY: 1 - 0.12 * seat.get() }],
    };
  });
  const tone = fx.result === 'right' ? styles.cellRight : fx.result === 'wrong' || fx.result === 'fresh' ? styles.cellRefused : null;
  if (art.cell) {
    return (
      <Animated.View pointerEvents="none" testID="tr-carrier" style={[styles.carrier, styles.carrierArt, { left: from.x, top: from.y, width: from.w, height: from.h }, anim]}>
        <CellFace piece={art.cell} value={fx.value} size={size} side={side} tone={fx.result === 'right' ? 'right' : fx.result === 'wrong' || fx.result === 'fresh' ? 'refused' : null} />
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="none" testID="tr-carrier" style={[styles.carrier, { left: from.x, top: from.y, width: from.w, height: from.h }, anim]}>
      <View style={[styles.cell, styles.cellLifted, tone]}>
        <View style={styles.cellCap} />
        <Text allowFontScaling={false} style={[labelAt(size), styles.cellText]}>
          +{fx.value}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * The meter and the POWER BAY beside it. The bay is where cells seat: its clamps open as a cell comes,
 * close on it, glow when the power is right, and its safety switch trips when it is not.
 */
function BayRow({ view, label, fx, reducedMotion, onBay }: { view: TowerRescueView; label: number; fx: InstallFx | null; reducedMotion: boolean; onBay?: (r: LayoutRectangle) => void }) {
  const item = view.item;
  const result = fx?.result ?? null;
  const seated = view.stage !== 'repair' ? view.installed : null;
  const state: BayState = seated ? 'powered' : result === 'wrong' || result === 'fresh' ? (fx?.ejecting ? 'idle' : 'tripped') : fx ? 'receiving' : 'idle';
  return (
    <View style={styles.bayRow}>
      <View style={styles.bayMeter}>{item ? <PowerMeter view={view} label={label} reducedMotion={reducedMotion} /> : null}</View>
      <PowerBay state={state} value={seated?.value ?? null} label={label} reducedMotion={reducedMotion} onLayout={onBay} spark={result === 'right' ? (fx?.n ?? 0) : 0} />
    </View>
  );
}

type BayState = 'idle' | 'receiving' | 'tripped' | 'powered';
function PowerBay({ state, value, label, reducedMotion, onLayout, spark }: { state: BayState; value: number | null; label: number; reducedMotion: boolean; onLayout?: ((r: LayoutRectangle) => void) | undefined; spark: number }) {
  const open = useSharedValue(0);
  const trip = useSharedValue(0);
  const glow = useSharedValue(state === 'powered' ? 1 : 0);
  useEffect(() => {
    const d = reducedMotion ? 0 : 1;
    open.set(withTiming(state === 'receiving' ? 1 : 0, { duration: 160 * d }));
    trip.set(withTiming(state === 'tripped' ? 1 : 0, { duration: 140 * d }));
    glow.set(withTiming(state === 'powered' ? 1 : 0, { duration: 260 * d }));
  }, [state, open, trip, glow, reducedMotion]);
  const leftJaw = useAnimatedStyle(() => ({ transform: [{ translateX: -6 * open.get() }] }));
  const rightJaw = useAnimatedStyle(() => ({ transform: [{ translateX: 6 * open.get() }] }));
  const lever = useAnimatedStyle(() => ({ transform: [{ rotate: `${-40 * trip.get()}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * Math.max(glow.get(), trip.get(), open.get() * 0.6) }));
  const { art } = useTowerArt();
  // With art the clamps travel a share of the socket (they are larger than the vector jaws); the breaker turns on its hinge.
  const bp = art.bay ? bayPlacement(BAY_ART, art.bay.entry, art['clamp-left']?.entry ?? null, art.breaker?.entry ?? null, SEATED) : null;
  const reach = bp ? bp.socket.w * 0.14 : 0;
  const leftClamp = useAnimatedStyle(() => ({ transform: [{ translateX: -reach * open.get() }] }));
  const rightClamp = useAnimatedStyle(() => ({ transform: [{ translateX: reach * open.get() }] }));
  if (art.bay && bp) {
    const pivot = art.breaker?.entry.anchor;
    const label_ = value === null ? C.labels.power : `${C.labels.power} +${value}`;
    return (
      <View key="art" testID="tr-bay" style={[styles.bay, styles.bayArt]} onLayout={(e) => onLayout?.(e.nativeEvent.layout)} accessible accessibilityLabel={label_}>
        <Animated.View pointerEvents="none" style={[styles.bayRing, styles.bayRingArt, state === 'tripped' ? styles.bayRingTrip : state === 'powered' ? styles.bayRingOn : null, ring]} />
        <Piece piece={art.bay} />
        {value !== null && art.cell ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: bp.cell.x, top: bp.cell.y }}>
            <CellFace piece={art.cell} value={value} size={Math.max(16, label)} side={bp.cell.w} tone={null} />
          </View>
        ) : value !== null ? (
          <View style={[styles.seated, styles.cellRight, { position: 'absolute', left: (BAY_ART - 52) / 2, top: (BAY_ART - 46) / 2 }]}>
            <Text allowFontScaling={false} style={[labelAt(Math.max(16, label)), styles.cellText]}>
              +{value}
            </Text>
          </View>
        ) : null}
        {art['clamp-left'] && art['clamp-right'] ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.abs, rectStyle(bp.clampLeft), leftClamp]}>
              <Piece piece={art['clamp-left']} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.abs, rectStyle(bp.clampRight), rightClamp]}>
              <Piece piece={art['clamp-right']} />
            </Animated.View>
          </>
        ) : (
          <>
            <Animated.View style={[styles.jaw, { left: bp.socket.x + 2, top: bp.socket.y + 4, bottom: BAY_ART - bp.socket.y - bp.socket.h + 4 }, leftJaw]} />
            <Animated.View style={[styles.jaw, { left: bp.socket.x + bp.socket.w - 10, top: bp.socket.y + 4, bottom: BAY_ART - bp.socket.y - bp.socket.h + 4 }, rightJaw]} />
          </>
        )}
        {art.breaker && pivot ? (
          <Animated.View pointerEvents="none" style={[styles.abs, rectStyle(bp.breaker), { transformOrigin: `${pivot.x * 100}% ${pivot.y * 100}%` }, lever]}>
            <Piece piece={art.breaker} />
          </Animated.View>
        ) : (
          <View style={styles.breaker}>
            <Animated.View style={[styles.lever, state === 'tripped' && styles.leverTrip, lever]} />
          </View>
        )}
        {reducedMotion ? null : <Sparks play={spark} color={eq.ok} radius={60} count={7} />}
      </View>
    );
  }
  return (
    <View key="vector" testID="tr-bay" style={styles.bay} onLayout={(e) => onLayout?.(e.nativeEvent.layout)} accessible accessibilityLabel={value === null ? C.labels.power : `${C.labels.power} +${value}`}>
      <Animated.View pointerEvents="none" style={[styles.bayRing, state === 'tripped' ? styles.bayRingTrip : state === 'powered' ? styles.bayRingOn : null, ring]} />
      <View style={styles.baySocket}>
        <Animated.View style={[styles.jaw, styles.jawLeft, leftJaw]} />
        <Animated.View style={[styles.jaw, styles.jawRight, rightJaw]} />
        {value !== null ? (
          <View style={[styles.seated, styles.cellRight]}>
            <Text allowFontScaling={false} style={[labelAt(Math.max(16, label)), styles.cellText]}>
              +{value}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.breaker}>
        <Animated.View style={[styles.lever, state === 'tripped' && styles.leverTrip, lever]} />
      </View>
      {reducedMotion ? null : <Sparks play={spark} color={eq.ok} radius={52} count={7} />}
    </View>
  );
}

/** The power meter: present power, the needed mark, and on a miss what the cell would have made (the consequence). */
function PowerMeter({ view, label, reducedMotion }: { view: TowerRescueView; label: number; reducedMotion: boolean }) {
  const item = view.item!;
  const top = 20;
  const powered = view.stage !== 'repair';
  const level = powered ? item.needed : item.present;
  const missTo = view.miss ? item.present + view.miss.value : null;
  const gapLit = view.hint !== null && view.stage === 'repair';
  const bar = view.hint?.kind === 'numberLine' || view.hint?.kind === 'showAnswer';
  const [w, setW] = useState(0);
  const r = reducedMotion ? RESULT.reduced : RESULT.normal;
  // The fill moves: it counts up to full power when the right cell seats, and to the consequence on a miss.
  const fill = useSharedValue(level);
  const miss = useSharedValue(missTo ?? item.present);
  useEffect(() => {
    fill.set(withDelay(powered ? 160 : 0, withTiming(level, { duration: powered ? r.fillMs : reducedMotion ? 0 : 260, easing: Easing.inOut(Easing.quad) })));
  }, [fill, level, powered, r.fillMs, reducedMotion]);
  useEffect(() => {
    if (missTo === null) return void miss.set(item.present);
    miss.set(item.present);
    miss.set(withTiming(missTo, { duration: r.missFillMs, easing: Easing.out(Easing.cubic) }));
  }, [miss, missTo, item.present, r.missFillMs]);
  const px = (n: number) => (Math.min(top, Math.max(0, n)) / top) * w;
  const fillStyle = useAnimatedStyle(() => ({ width: (Math.min(top, fill.get()) / top) * w }));
  const missStyle = useAnimatedStyle(() => ({ width: (Math.min(top, miss.get()) / top) * w }));
  return (
    <View style={styles.meterWrap} testID="tr-meter" accessible accessibilityLabel={`${C.labels.needed} ${item.needed}. ${C.labels.present} ${level}.`}>
      <View style={styles.meterLabels}>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterHas, gapLit && styles.lit]}>
          {C.labels.present} {level}
        </Text>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterNeeds, gapLit && styles.lit]}>
          {C.labels.needed} {item.needed}
        </Text>
      </View>
      <View style={styles.meter} onLayout={(e) => setW(e.nativeEvent.layout.width - 4)}>
        {missTo !== null ? <Animated.View style={[styles.meterMiss, missTo > item.needed && styles.meterOver, missStyle]} /> : null}
        <Animated.View style={[styles.meterFill, powered && styles.meterFull, fillStyle]}>
          <View style={styles.meterSheen} />
        </Animated.View>
        {bar && !powered
          ? Array.from({ length: item.needed - item.present }, (_, i) => (
              <View key={i} style={[styles.tick, { left: px(item.present + i + 1) }]}>
                <Text allowFontScaling={false} style={[labelAt(markSize(label, 0.75)), styles.tickText]}>
                  {item.present + i + 1}
                </Text>
              </View>
            ))
          : null}
        <View style={[styles.needMark, { left: px(item.needed) }]} />
      </View>
      {/* The consequence line keeps its room even when empty, so nothing below it moves while a cell is in the air. */}
      {missTo !== null ? (
        <Text allowFontScaling={false} testID="tr-miss" style={[labelAt(label), styles.missText]}>
          {item.present} + {view.miss!.value} = {missTo}
        </Text>
      ) : view.stage === 'repair' ? (
        <Text allowFontScaling={false} style={[labelAt(label), styles.missText, styles.missSpace]} accessibilityElementsHidden importantForAccessibility="no">
          {' '}
        </Text>
      ) : null}
    </View>
  );
}

function PowerCell({ cell, size, side, tried, out, glow, disabled, reducedMotion, onPress }: { cell: Cell; size: number; side: number; tried: boolean; out: boolean; glow: boolean; disabled: boolean; reducedMotion: boolean; onPress: () => void }) {
  // A tried cell greys out (it was refused); the slot of a cell in flight shows it empty.
  const dim = useSharedValue(tried ? 1 : 0);
  useEffect(() => {
    dim.set(withTiming(tried ? 1 : 0, { duration: reducedMotion ? 0 : 220 }));
  }, [dim, tried, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * dim.get() }));
  const off = disabled || tried;
  const { art } = useTowerArt();
  if (art.cell) {
    return (
      <Press testID={`tr-cell-${cell.value}`} label={C.labels.install.replace('{value}', String(cell.value))} disabled={off} onPress={onPress} depth={4} scale={0.94}>
        <Animated.View key="art" style={[styles.cellArtBox, { minHeight: side }, anim]}>
          {out ? <View style={[styles.cellArtOut, { width: side - 12, height: side - 12 }]} /> : <CellFace piece={art.cell} value={cell.value} size={size} side={side} tone={glow ? 'glow' : null} tried={tried} />}
        </Animated.View>
      </Press>
    );
  }
  return (
    <Press testID={`tr-cell-${cell.value}`} label={C.labels.install.replace('{value}', String(cell.value))} disabled={off} onPress={onPress} depth={4} scale={0.94}>
      <Animated.View style={[styles.cell, glow && styles.cellGlow, tried && styles.cellTried, out && styles.cellOut, anim]}>
        {out ? null : (
          <>
            <View style={styles.cellCap} />
            <Text allowFontScaling={false} style={[labelAt(size), styles.cellText, tried && styles.cellTextTried]}>
              +{cell.value}
            </Text>
          </>
        )}
      </Animated.View>
    </Press>
  );
}

/**
 * The cell art's side in the tray and in flight: the slot's width, from CELL_ART up to CELL_ART_MAX (a
 * wide iPad panel gets bigger cells, so a two-digit value stays on the plate). Seated, a cell is SEATED
 * of the bay's side (BAY_ART with art).
 */
const CELL_ART = 90;
const CELL_ART_MAX = 124;
const cellSide = (row: LayoutRectangle | null, n: number) => (row && n > 0 ? Math.round(Math.max(CELL_ART, Math.min(CELL_ART_MAX, ((row.width - 12 * (n - 1)) / n) * 0.92))) : CELL_ART);
const SEATED = 0.72;
const BAY_ART = 92;
const rectStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h });

/** A power cell drawn from the art: its value on the cream plate; a ring for the hint, the bay's answer or a refusal. */
function CellFace({ piece, value, size, side, tone, tried = false }: { piece: TowerPiece; value: number; size: number; side: number; tone: 'glow' | 'right' | 'refused' | null; tried?: boolean }) {
  const plate = piece.entry.plate!;
  return (
    <View style={{ width: side, height: side }}>
      {tone ? <View style={[styles.cellArtRing, { borderRadius: side * 0.2 }, tone === 'glow' ? styles.cellArtGlow : tone === 'right' ? styles.cellArtRight : styles.cellArtRefused]} /> : null}
      <Piece piece={piece} />
      {tried ? <View style={[styles.cellArtDim, { borderRadius: side * 0.16 }]} /> : null}
      <View pointerEvents="none" style={[styles.cellArtPlate, { top: plate.y * side, height: plate.h * side }]}>
        <Text allowFontScaling={false} style={[labelAt(size), styles.cellArtText, tried && styles.cellTextTried]}>
          +{value}
        </Text>
      </View>
    </View>
  );
}

function BigButton({ testID, label, size, onPress, onDown, tall = false }: { testID: string; label: string; size: number; onPress: () => void; onDown?: () => void; tall?: boolean }) {
  return (
    <Press testID={testID} label={label} onPress={onPress} {...(onDown ? { onDown } : {})} depth={5} scale={0.95} style={[styles.big, tall && styles.bigTall]}>
      <View pointerEvents="none" style={styles.bigLight} />
      <Text allowFontScaling={false} style={[labelAt(size), styles.bigText]}>
        {label}
      </Text>
    </Press>
  );
}

/** What the test run is doing, in three lights: power, motor, delivery (they light as the run reaches them). */
function TestStrip({ step, label, reducedMotion }: { step: TestStep | null; label: number; reducedMotion: boolean }) {
  const rows = [
    { key: 'testPower', at: 'relay3' },
    { key: 'testMotor', at: 'motor' },
    { key: 'testDelivery', at: 'deliver' },
  ] as const;
  return (
    <View style={styles.strip} testID="tr-test-strip">
      {rows.map((r) => {
        const on = reached(step, r.at);
        return (
          <View key={r.key} style={[styles.stripRow, on && styles.stripRowOn]} accessible accessibilityLabel={C.labels[r.key]} accessibilityState={{ checked: on }}>
            <StripLamp on={on} reducedMotion={reducedMotion} />
            <Text allowFontScaling={false} style={[labelAt(label), on ? styles.stripTextOn : styles.stripText]}>
              {C.labels[r.key]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
function StripLamp({ on, reducedMotion }: { on: boolean; reducedMotion: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.set(withTiming(on ? 1 : 0, { duration: reducedMotion ? 0 : 180 }));
  }, [v, on, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * v.get(), transform: [{ scale: 0.85 + 0.15 * v.get() }] }));
  return <Animated.View style={[styles.stripLamp, on && styles.stripLampOn, anim]} />;
}

// ---- the machine cutaway ----

type Status = 'unknown' | 'running' | 'offline' | 'fixed';
/** Before the report is read every lamp is unknown; a checked system shows running; once found, the stopped lift is offline until repaired. */
function systemStatus(view: TowerRescueView, id: string, offline: boolean): Status {
  if (view.stage === 'intro' || view.stage === 'loading') return 'unknown';
  if (view.stage === 'diagnose') return view.checked.includes(id) ? 'running' : 'unknown';
  if (!offline) return 'running';
  return view.stage === 'repair' ? 'offline' : 'fixed';
}

function Cutaway({ view, step, powerUp, reducedMotion, label, onInspect }: { view: TowerRescueView; step: TestStep | null; powerUp: boolean; reducedMotion: boolean; label: number; onInspect: (id: string) => void }) {
  const diagnosing = view.stage === 'diagnose';
  const roomLit = reached(step, 'roomLit');
  const { art } = useTowerArt();
  const [wall, setWall] = useState({ w: 0, h: 0 });
  return (
    <View style={styles.cutaway}>
      <View style={styles.roof}>
        <Monitor reducedMotion={reducedMotion} active={reached(step, 'relay1')} />
        <RelayBank step={step} reducedMotion={reducedMotion} />
      </View>
      <View style={[styles.systems, art.room && styles.systemsArt]} onLayout={(e) => setWall({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* The machine room's back wall (art, covering the bay) or the vector wall's seams. */}
        {art.room ? wall.w > 0 ? <Piece piece={art.room} rect={cover(art.room.entry, wall)} /> : null : <WallSeams />}
        {C.systems.map((s, i) => {
          const offline = s.id === view.clue.offline;
          const status = systemStatus(view, s.id, offline);
          return (
            <System
              key={s.id}
              index={i}
              system={s}
              status={status}
              diagnosing={diagnosing}
              testing={offline && (view.stage === 'testing' || view.stage === 'done')}
              step={step}
              powerUp={offline && powerUp}
              done={view.stage === 'done'}
              roomLit={roomLit}
              reducedMotion={reducedMotion}
              label={label}
              onInspect={onInspect}
            />
          );
        })}
      </View>
      <PowerMain reducedMotion={reducedMotion} live={view.stage !== 'repair' && view.stage !== 'intro' && view.stage !== 'loading' && view.stage !== 'diagnose'} />
      {/* The room lights up at the end of the test run: one soft sweep, once. */}
      <RoomSweep play={step === 'roomLit' ? 1 : 0} reducedMotion={reducedMotion} />
    </View>
  );
}

function System({ index, system, status, diagnosing, testing, step, powerUp, done, roomLit, reducedMotion, label, onInspect }: { index: number; system: (typeof C.systems)[number]; status: Status; diagnosing: boolean; testing: boolean; step: TestStep | null; powerUp: boolean; done: boolean; roomLit: boolean; reducedMotion: boolean; label: number; onInspect: (id: string) => void }) {
  // The stopped system's bay is dark until the power comes back; the room's lights come up at the end.
  const dark = useSharedValue(status === 'offline' ? 1 : 0);
  useEffect(() => {
    dark.set(withTiming(status === 'offline' ? 1 : 0, { duration: reducedMotion ? 0 : status === 'offline' ? 360 : 520 }));
  }, [dark, status, reducedMotion]);
  const shade = useAnimatedStyle(() => ({ opacity: 0.42 * dark.get() }));
  const name = `${system.name}${status === 'unknown' ? '' : `, ${status === 'running' ? C.labels.running : status === 'offline' ? C.labels.offline : C.labels.fixed}`}`;
  const body = (
    <>
      <CeilingLight on={status === 'running' || status === 'fixed' || roomLit} bright={roomLit} reducedMotion={reducedMotion} />
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(label), styles.systemName]}>
        {system.name}
      </Text>
      <Lamp status={status} label={label} reducedMotion={reducedMotion} arrive={diagnosing ? index : -1} />
      {system.kind === 'lift' ? <Shaft status={status} testing={testing} step={step} powerUp={powerUp} done={done} reducedMotion={reducedMotion} /> : <Fans status={status} reducedMotion={reducedMotion} />}
      <Animated.View pointerEvents="none" style={[styles.bayShade, shade]} />
    </>
  );
  return diagnosing ? (
    <Press testID={`tr-system-${system.id}`} label={name} onPress={() => onInspect(system.id)} depth={2} scale={0.97} style={[styles.system, styles.systemTap]}>
      {body}
    </Press>
  ) : (
    <View testID={`tr-system-${system.id}`} accessible accessibilityRole="image" accessibilityLabel={name} style={styles.system}>
      {body}
    </View>
  );
}

/** A lamp over each bay: dim until its system is known to run, bright when the whole room lights. */
function CeilingLight({ on, bright, reducedMotion }: { on: boolean; bright: boolean; reducedMotion: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.set(withTiming(bright ? 1.6 : on ? 1 : 0, { duration: reducedMotion ? 0 : 400 }));
  }, [v, on, bright, reducedMotion]);
  const cone = useAnimatedStyle(() => ({ opacity: 0.05 + 0.12 * v.get() }));
  const bulb = useAnimatedStyle(() => ({ opacity: 0.35 + 0.4 * Math.min(1.6, v.get()) }));
  return (
    <View pointerEvents="none" style={styles.ceiling}>
      <Animated.View style={[styles.bulb, bulb]} />
      <Animated.View style={[styles.cone, cone]} />
    </View>
  );
}

function Lamp({ status, label, reducedMotion, arrive }: { status: Status; label: number; reducedMotion: boolean; arrive: number }) {
  const word = status === 'unknown' ? '?' : status === 'running' ? C.labels.running : status === 'offline' ? C.labels.offline : C.labels.fixed;
  // A change of state is a small mechanical flip (the lamp pops); the diagnose arrival glows once per lamp.
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const last = useRef(status);
  useEffect(() => {
    if (last.current !== status && !reducedMotion) pop.set(withSequence(withTiming(1.14, { duration: 110 }), withTiming(1, { duration: 200, easing: Easing.out(Easing.back(2)) })));
    last.current = status;
  }, [status, pop, reducedMotion]);
  useEffect(() => {
    if (arrive < 0 || reducedMotion) return;
    glow.set(withDelay(150 + arrive * 140, withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 520 }))));
  }, [arrive, glow, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return (
    <Animated.View style={[styles.lamp, status === 'running' || status === 'fixed' ? styles.lampOn : status === 'offline' ? styles.lampOff : styles.lampUnknown, anim]}>
      <Animated.View pointerEvents="none" style={[styles.lampHalo, halo]} />
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(Math.max(16, label - 2)), styles.lampWord, status === 'offline' ? styles.lampTextOff : status === 'unknown' ? styles.lampTextUnknown : styles.lampText]}>
        {word}
      </Text>
    </Animated.View>
  );
}

function Shaft({ status, testing, step, powerUp, done, reducedMotion }: { status: Status; testing: boolean; step: TestStep | null; powerUp: boolean; done: boolean; reducedMotion: boolean }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rise = useSharedValue(0);
  const doors = useSharedValue(0);
  const robot = useSharedValue(0);
  const settle = useSharedValue(0);
  const gear = useSharedValue(0);
  const charge = useSharedValue(status === 'fixed' ? 1 : 0);
  const lit = status === 'running' || status === 'fixed';
  const atTop = testing && (done || reached(step, reducedMotion ? 'deliver' : 'arrive'));
  // The car rises from the motor's start, arrives, the doors open, the robot rolls out and hops.
  useEffect(() => {
    if (!testing) {
      rise.set(0);
      doors.set(0);
      robot.set(0);
      return;
    }
    if (reducedMotion || done) {
      if (done || reached(step, 'deliver')) {
        rise.set(1);
        doors.set(1);
        robot.set(1);
      }
      return;
    }
    if (step === 'rise') rise.set(withTiming(1, { duration: RISE_MS, easing: Easing.inOut(Easing.cubic) }));
    if (step === 'arrive') {
      rise.set(1);
      settle.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 260, easing: Easing.out(Easing.back(1.8)) })));
    }
    if (step === 'doors') doors.set(withTiming(1, { duration: DOORS_MS, easing: Easing.inOut(Easing.quad) }));
    if (step === 'deliver') robot.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.back(1.6)) }));
  }, [testing, step, done, reducedMotion, rise, doors, robot, settle]);
  // The motor: still while unknown or stopped; a slow turn when running; quick during the test's travel.
  const turning = !reducedMotion && (status === 'running' || status === 'fixed');
  const fast = testing && reached(step, 'motor') && !reached(step, 'arrive');
  useEffect(() => {
    cancelAnimation(gear);
    if (!turning) return;
    const period = fast ? 900 : AMBIENT.gearMs;
    gear.set(withRepeat(withTiming(gear.get() + 360, { duration: period, easing: Easing.linear }), -1, false));
  }, [gear, turning, fast]);
  // Power running down the line to this lift when the right cell seats (once).
  useEffect(() => {
    if (status !== 'fixed') return void charge.set(0);
    if (!powerUp || reducedMotion) return void charge.set(1);
    charge.set(0);
    charge.set(withDelay(160 + RESULT.normal.fillMs, withTiming(1, { duration: RESULT.normal.lineMs, easing: Easing.inOut(Easing.quad) })));
  }, [status, powerUp, charge, reducedMotion]);
  // With art: the housing that fits this bay, the car in its channel (towerArt.ts); otherwise the vectors.
  const { art } = useTowerArt();
  const h = housing(art, 'lift', box);
  const cars = carArt(art);
  const cp = h && cars && art.gear ? carPlacement(h, cars.car.entry, gearFloor(h, art.gear.entry)) : null;
  const carW = Math.max(56, Math.min(120, box.w * 0.72));
  const carH = carW * 0.95;
  const travel = cp ? cp.travel : Math.max(0, box.h - carH - 26);
  // The leaves slide out of the doorway (behind the car's frame, clipped to the opening) or apart.
  const doorShift = cp ? cp.doorway.w * 0.52 : carW * 0.5;
  const carStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -travel * rise.get() - 3 * settle.get() }] }));
  const leftDoor = useAnimatedStyle(() => ({ transform: [{ translateX: -doorShift * doors.get() }] }));
  const rightDoor = useAnimatedStyle(() => ({ transform: [{ translateX: doorShift * doors.get() }] }));
  // The robot steps out: grows to ROBOT_PEAK and lifts (with art, a lift the car's frame keeps inside it).
  const robotLift = cp ? 3 : 10;
  const robotStyle = useAnimatedStyle(() => ({ opacity: doors.get(), transform: [{ scale: 0.7 + (ROBOT_PEAK - 0.7) * robot.get() }, { translateY: -robotLift * robot.get() }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: robot.get(), transform: [{ scale: 0.4 + 0.6 * robot.get() }] }));
  const gearStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${gear.get()}deg` }] }));
  const riser = useAnimatedStyle(() => ({ height: `${100 * charge.get()}%` }));
  const pulse = useAnimatedStyle(() => ({ opacity: charge.get() > 0 && charge.get() < 1 ? 1 : 0, bottom: `${100 * charge.get()}%` }));
  const onBox = (e: { nativeEvent: { layout: LayoutRectangle } }) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  if (h && cars && cp && art.gear) {
    const delivering = atTop && reached(step, 'deliver');
    // Both poses stay mounted (the one not in use hidden), so neither decodes in the middle of the payoff.
    const ready = art['robot-ready'] ?? art['robot-neutral'];
    const delivery = art['robot-delivery'] ?? ready;
    const rp = ready ? robotPlacement(cp.doorway, ready.entry, ROBOT_PEAK) : null;
    const gear = rotorPlacement(h, art.gear.entry, 'lift');
    const ch = cp.channel;
    const lineTop = gear.y + gear.h / 2;
    return (
      // Keyed apart from the vector tree: the views must not be reused across the switch (an animated
      // style left on a reused view would stay on it).
      <View key="art" style={styles.shaftArt} onLayout={onBox}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, !lit && styles.artUnlit]}>
          <Piece piece={h.piece} rect={h.rect} />
          <View style={[styles.cableArt, { left: ch.x + ch.w / 2 - 1, top: lineTop, height: ch.y + ch.h - lineTop }]} />
          {/* The power riser: fills from the floor to the motor as the power comes up the line. */}
          <View style={[styles.abs, styles.riserLane, { left: ch.x + ch.w / 2 - 6, top: lineTop, height: ch.y + ch.h - lineTop }]}>
            <Animated.View style={[styles.riser, riser]} />
            <Animated.View style={[styles.riserPulse, pulse]} />
          </View>
          {SHAFT_LAMPS.map((f) => (
            <ShaftLamp key={f} at={f} lit={lit} rise={rise} x={h.rect.x + h.rect.w * 0.87} y={ch.y + f * ch.h} />
          ))}
          <Animated.View style={[styles.abs, rectStyle(gear), gearStyle]}>
            <Piece piece={art.gear} />
          </Animated.View>
        </View>
        <Animated.View testID={testing ? 'tr-car-running' : undefined} style={[styles.abs, { left: cp.x, top: cp.y, width: cp.size, height: cp.size }, !lit && styles.artUnlit, carStyle]}>
          <Piece piece={cars.car} />
          {ready && delivery && rp ? (
            <Animated.View style={[styles.abs, rectStyle(rp), styles.robotArt, robotStyle]}>
              <Piece piece={ready} style={delivering && delivery !== ready ? styles.hidden : null} />
              {delivery !== ready ? <Piece piece={delivery} style={delivering ? null : styles.hidden} /> : null}
            </Animated.View>
          ) : null}
          <View style={[styles.abs, styles.doorway, rectStyle(cp.doorway)]}>
            <Animated.View style={[styles.abs, { left: -cp.doorway.x, top: -cp.doorway.y, width: cp.size, height: cp.size }, leftDoor]}>
              <Piece piece={cars.left} />
            </Animated.View>
            <Animated.View style={[styles.abs, { left: -cp.doorway.x, top: -cp.doorway.y, width: cp.size, height: cp.size }, rightDoor]}>
              <Piece piece={cars.right} />
            </Animated.View>
          </View>
        </Animated.View>
        {testing ? (
          <Animated.View style={[styles.deliveredArt, { top: Math.max(0, ch.y - 8), left: Math.min(box.w - 42, h.rect.x + h.rect.w - 30) }, badgeStyle]}>
            <Text allowFontScaling={false} style={styles.deliveredText}>
              {'✓'}
            </Text>
          </Animated.View>
        ) : null}
        {testing && !done && !reducedMotion && reached(step, 'deliver') ? (
          <View pointerEvents="none" style={[styles.carSparks, { top: cp.y + CAR_ROOF * cp.size - travel }]}>
            <Sparks play={1} count={10} radius={58} color={eq.amber} size={8} />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View key="vector" style={[styles.shaft, lit && styles.shaftLit]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={styles.cable} />
      {/* The power riser: fills from the floor to the motor as the power comes up the line. */}
      <Animated.View pointerEvents="none" style={[styles.riser, riser]} />
      <Animated.View pointerEvents="none" style={[styles.riserPulse, pulse]} />
      <View style={styles.motor}>
        <Animated.View style={[styles.gear, lit ? styles.gearOn : null, gearStyle]}>
          {[0, 45, 90, 135].map((r) => (
            <View key={r} style={[styles.tooth, { transform: [{ rotate: `${r}deg` }] }]} />
          ))}
        </Animated.View>
      </View>
      {[0.3, 0.55, 0.8].map((f) => (
        <FloorLamp key={f} at={f} lit={lit} rise={rise} />
      ))}
      <Animated.View testID={testing ? 'tr-car-running' : undefined} style={[styles.car, { width: carW, height: carH }, lit ? styles.carLit : styles.carDark, carStyle]}>
        <Animated.View style={[styles.robot, robotStyle]}>
          <View style={[styles.robotHead, { width: carW * 0.42, height: carW * 0.3 }]}>
            <View style={[styles.robotEye, atTop && reached(step, 'deliver') && styles.robotEyeHappy]} />
            <View style={[styles.robotEye, atTop && reached(step, 'deliver') && styles.robotEyeHappy]} />
          </View>
          <View style={[styles.box, { width: carW * 0.38, height: carW * 0.26 }]} />
        </Animated.View>
        <Animated.View style={[styles.door, styles.doorLeft, leftDoor]} />
        <Animated.View style={[styles.door, styles.doorRight, rightDoor]} />
      </Animated.View>
      {testing ? (
        <Animated.View style={[styles.delivered, badgeStyle]}>
          <Text allowFontScaling={false} style={styles.deliveredText}>
            {'✓'}
          </Text>
        </Animated.View>
      ) : null}
      {testing && !done && !reducedMotion && reached(step, 'deliver') ? (
        <View pointerEvents="none" style={[styles.carSparks, { bottom: travel + carH }]}>
          <Sparks play={1} count={10} radius={58} color={eq.amber} size={8} />
        </View>
      ) : null}
    </View>
  );
}

/** The robot's scale at the end of its step out of the car (D193). */
const ROBOT_PEAK = 1.2;

/** A landing lamp on the shaft art, beside the channel (`at`: its height in the channel, from the top). */
function ShaftLamp({ at, lit, rise, x, y }: { at: number; lit: boolean; rise: SharedValue<number>; x: number; y: number }) {
  const style = useAnimatedStyle(() => ({ opacity: !lit ? 0.25 : rise.get() >= 1 - at ? 1 : 0.55 }));
  return <Animated.View style={[styles.floorLamp, styles.abs, { left: x - 5, top: y - 5, marginRight: 0 }, lit ? styles.floorLampOn : styles.floorLampOff, style]} />;
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
    // A slow turn (well under 3 Hz), and only once the fans are known to be running: spin-up, then steady.
    if (on) spin.set(withSequence(withTiming(120, { duration: 700, easing: Easing.in(Easing.quad) }), withRepeat(withTiming(480, { duration: AMBIENT.fanMs, easing: Easing.linear }), -1, false)));
    else spin.set(0);
  }, [on, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() % 360}deg` }] }));
  const { art } = useTowerArt();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const h = housing(art, 'fans', box);
  const onBox = (e: { nativeEvent: { layout: LayoutRectangle } }) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  if (h && art.fan) {
    const r = rotorPlacement(h, art.fan.entry, 'fans');
    const opening = { x: r.x + r.w / 2, y: r.y + r.h / 2, d: Math.min(h.piece.entry.stage!.w * h.rect.w, h.piece.entry.stage!.h * h.rect.h) };
    const rotor = (
      <Animated.View style={[styles.abs, rectStyle(r), style]}>
        <Piece piece={art.fan} />
      </Animated.View>
    );
    // The compact housing's opening is open: the rotor turns behind its ring, over a dark duct.
    return (
      <View key="art" pointerEvents="none" style={[styles.fanArt, status !== 'running' && styles.artUnlit]} onLayout={onBox}>
        {h.compact ? (
          <>
            <View style={[styles.abs, styles.duct, { left: opening.x - opening.d / 2, top: opening.y - opening.d / 2, width: opening.d, height: opening.d, borderRadius: opening.d / 2 }]} />
            {rotor}
            <Piece piece={h.piece} rect={h.rect} />
          </>
        ) : (
          <>
            <Piece piece={h.piece} rect={h.rect} />
            {rotor}
          </>
        )}
      </View>
    );
  }
  return (
    <View key="vector" style={[styles.fanBox, status === 'running' && styles.fanBoxOn]} onLayout={onBox}>
      <View style={styles.fanRing} />
      <Animated.View style={[styles.fan, style]}>
        {[0, 60, 120].map((r) => (
          <View key={r} style={[styles.blade, { transform: [{ rotate: `${r}deg` }] }]} />
        ))}
      </Animated.View>
      <View style={styles.fanHub} />
    </View>
  );
}

/** The tower monitor: a calm trace scrolling (life while thinking); during the test it brightens. */
function Monitor({ reducedMotion, active }: { reducedMotion: boolean; active: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(t);
    if (reducedMotion) return;
    t.set(withRepeat(withTiming(1, { duration: AMBIENT.monitorMs, easing: Easing.linear }), -1, false));
  }, [t, reducedMotion]);
  const bars = [0.35, 0.6, 0.3, 0.8, 0.45, 0.55, 0.25, 0.7];
  return (
    <View style={[styles.monitor, active && styles.monitorActive]} accessible={false}>
      {bars.map((h, i) => (
        <MonitorBar key={i} i={i} n={bars.length} h={h} t={t} active={active} />
      ))}
    </View>
  );
}
function MonitorBar({ i, n, h, t, active }: { i: number; n: number; h: number; t: SharedValue<number>; active: boolean }) {
  const anim = useAnimatedStyle(() => {
    const phase = (t.get() + i / n) % 1;
    return { height: `${(h * 0.6 + 0.4 * Math.abs(Math.sin(phase * Math.PI))) * 100}%`, opacity: active ? 1 : 0.55 };
  });
  return <Animated.View style={[styles.monitorBar, active && styles.monitorBarActive, anim]} />;
}

/** Three relays: they click over in order on the test run; now and then one clicks while the room waits. */
function RelayBank({ step, reducedMotion }: { step: TestStep | null; reducedMotion: boolean }) {
  return (
    <View style={styles.relays} accessible={false}>
      {(['relay1', 'relay2', 'relay3'] as const).map((s, i) => (
        <Relay key={s} on={reached(step, s)} idle={step === null && !reducedMotion} offset={i * 1700} />
      ))}
    </View>
  );
}
function Relay({ on, idle, offset }: { on: boolean; idle: boolean; offset: number }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    cancelAnimation(v);
    if (on) return void v.set(withTiming(1, { duration: 90 }));
    if (!idle) return void v.set(0);
    // A brief, dim click-over now and then (well under 3 Hz; opacity never above 0.5 while idle).
    v.set(withDelay(offset, withRepeat(withSequence(withTiming(0.5, { duration: 160 }), withTiming(0, { duration: 400 }), withDelay(AMBIENT.relayEveryMs, withTiming(0, { duration: 1 }))), -1, false)));
  }, [v, on, idle, offset]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * v.get() }));
  return (
    <View style={styles.relay}>
      <Animated.View style={[styles.relayLamp, anim]} />
    </View>
  );
}

/** The power main along the floor: three status lights breathing slowly; live once a lift is repaired. */
function PowerMain({ reducedMotion, live }: { reducedMotion: boolean; live: boolean }) {
  return (
    <View style={styles.ground}>
      <View style={styles.mainBox}>
        {[0, 1, 2].map((i) => (
          <Led key={i} i={i} reducedMotion={reducedMotion} live={live} />
        ))}
      </View>
      <View style={[styles.mainCable, live && styles.mainCableLive]} />
    </View>
  );
}
function Led({ i, reducedMotion, live }: { i: number; reducedMotion: boolean; live: boolean }) {
  const v = useSharedValue(0.5);
  useEffect(() => {
    cancelAnimation(v);
    if (reducedMotion) return void v.set(0.7);
    v.set(withDelay(i * 500, withRepeat(withTiming(1, { duration: AMBIENT.ledMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [v, i, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: 0.35 + 0.45 * v.get() }));
  return <Animated.View style={[styles.led, live ? styles.ledLive : null, anim]} />;
}

function WallSeams() {
  return (
    <View pointerEvents="none" style={styles.seams}>
      {[0.33, 0.66].map((f) => (
        <View key={f} style={[styles.seam, { left: `${f * 100}%` }]} />
      ))}
    </View>
  );
}

/** The end of the test: a soft band of light passes over the room once (no flash). */
function RoomSweep({ play, reducedMotion }: { play: number; reducedMotion: boolean }) {
  const p = useSharedValue(0);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!play || reducedMotion) return;
    p.set(0);
    p.set(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }));
  }, [p, play, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: p.get() > 0 && p.get() < 1 ? 0.22 : 0, transform: [{ translateX: -120 + (w + 240) * p.get() }, { skewX: '-18deg' }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.sweep, anim]} />
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
  chipTextPast: { color: eq.ok },
  controls: { flexGrow: 1, gap: 12 },
  scroll: { flex: 1 },
  scrollBody: { flexGrow: 1 },
  lampWord: { textAlign: 'center' },
  lineBox: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: eq.recess },
  bot: { width: 52, height: 44, borderRadius: 12, backgroundColor: eq.deepBlue, borderWidth: 2, borderColor: eq.cyan, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  botConcern: { borderColor: eq.amberSoft },
  botArt: { overflow: 'hidden' },
  // Over the head crop's eyes (measured on the approved poses: the visor's eye band).
  botLid: { position: 'absolute', left: '44%', width: '38%', top: '43%', height: '25%', borderRadius: 4, backgroundColor: eq.recess },
  botEye: { width: 10, height: 14, borderRadius: 5, backgroundColor: eq.cyan },
  // Happy: eyes squint up into arcs (a wide, short shape); concern: they drop a little.
  botEyeHappy: { height: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, marginBottom: 4 },
  botEyeConcern: { marginTop: 6, height: 11 },
  lineText: { flex: 1, color: eq.text },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 12 },
  drill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: eq.ok, backgroundColor: eq.recess },
  drillText: { color: eq.ok, letterSpacing: 2 },
  report: { padding: 16, borderRadius: 14, gap: 8, backgroundColor: eq.coolWhite, borderLeftWidth: 8, borderLeftColor: eq.amber },
  reportLabel: { color: eq.deepBlue, letterSpacing: 2 },
  reportText: { color: eq.night },
  repair: { gap: 12 },
  // Room for the bay's ring (4) and its breaker (10 above, 6 right) inside the scrolling panel.
  bayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'stretch', paddingTop: 10, paddingRight: 10 },
  bayMeter: { flex: 1 },
  bay: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  bayRing: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderRadius: 18, borderWidth: 3, borderColor: eq.cyan },
  bayRingOn: { borderColor: eq.ok },
  bayRingTrip: { borderColor: eq.amber },
  bayArt: { width: BAY_ART, height: BAY_ART },
  bayRingArt: { left: 2, right: 2, top: 2, bottom: 2, borderRadius: 22 },
  abs: { position: 'absolute' },
  hidden: { opacity: 0 },
  baySocket: { width: 68, height: 68, borderRadius: 14, backgroundColor: eq.recess, borderWidth: 3, borderColor: eq.steel, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  jaw: { position: 'absolute', top: 8, bottom: 8, width: 8, borderRadius: 3, backgroundColor: eq.steelLight },
  jawLeft: { left: 4 },
  jawRight: { right: 4 },
  seated: { width: 52, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderBottomWidth: 5 },
  breaker: { position: 'absolute', right: -6, top: -10, width: 22, height: 22, borderRadius: 6, backgroundColor: eq.steelDark, borderWidth: 1.5, borderColor: eq.steelEdge, alignItems: 'center', justifyContent: 'center' },
  lever: { width: 4, height: 13, borderRadius: 2, backgroundColor: eq.ok, marginBottom: 6 },
  leverTrip: { backgroundColor: eq.amber },
  sparks: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  spark: { position: 'absolute' },
  meterWrap: { gap: 6, alignSelf: 'stretch' },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  meterHas: { color: eq.cyan },
  meterNeeds: { color: eq.amber },
  lit: { textDecorationLine: 'underline' },
  meter: { height: 44, borderRadius: 10, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelEdge, overflow: 'visible' },
  meterFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: eq.cyan, overflow: 'hidden' },
  meterSheen: { position: 'absolute', left: 6, right: 6, top: 4, height: 6, borderRadius: 3, backgroundColor: eq.coolWhite, opacity: 0.35 },
  meterFull: { backgroundColor: eq.ok },
  meterMiss: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: eq.amberDim, borderWidth: 2, borderColor: eq.amber, borderStyle: 'dashed' },
  meterOver: { borderColor: eq.amberSoft },
  missText: { color: eq.amber, alignSelf: 'flex-end' },
  missSpace: { opacity: 0 },
  needMark: { position: 'absolute', top: -8, bottom: -8, width: 5, marginLeft: -2, borderRadius: 2, backgroundColor: eq.amber },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: eq.coolWhite, alignItems: 'center' },
  tickText: { position: 'absolute', top: 46, width: 28, textAlign: 'center', color: eq.coolWhite },
  cellsTitle: { color: eq.textDim, marginTop: 14 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cellSlot: { minWidth: 96, flexGrow: 1 },
  cell: { minWidth: 96, minHeight: 84, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlueLight, borderWidth: 3, borderColor: eq.cyan, borderBottomWidth: 7 },
  cellCap: { position: 'absolute', top: 6, width: 26, height: 7, borderRadius: 3, backgroundColor: eq.coolWhite, opacity: 0.8 },
  cellGlow: { borderColor: eq.clue, backgroundColor: eq.deepBlue, shadowColor: eq.clue, shadowOpacity: 0.9, shadowRadius: 14 },
  cellTried: { backgroundColor: eq.recess, borderColor: eq.steelDark },
  // The slot a cell left: an empty recess (the cell is in the air or in the bay).
  cellOut: { backgroundColor: eq.recess, borderColor: eq.steelDark, borderBottomWidth: 3 },
  cellLifted: { shadowColor: eq.night, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  cellRight: { backgroundColor: eq.deepBlue, borderColor: eq.ok },
  cellRefused: { borderColor: eq.amber },
  cellText: { color: eq.coolWhite, fontWeight: '900' },
  cellTextTried: { color: eq.textDim, textDecorationLine: 'line-through' },
  carrier: { position: 'absolute', zIndex: 10 },
  carrierArt: { alignItems: 'center', justifyContent: 'center' },
  // Art cells (D195): the slot keeps its touch size; the art is square inside it.
  cellArtBox: { minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  cellArtOut: { borderRadius: 16, backgroundColor: eq.recess, borderWidth: 3, borderColor: eq.steelDark },
  cellArtRing: { position: 'absolute', left: '4%', top: '4%', right: '4%', bottom: '4%', borderWidth: 4 },
  cellArtGlow: { borderColor: eq.clue, shadowColor: eq.clue, shadowOpacity: 0.9, shadowRadius: 14 },
  cellArtRight: { borderColor: eq.ok },
  cellArtRefused: { borderColor: eq.amber },
  cellArtDim: { position: 'absolute', left: '9%', top: '9%', right: '9%', bottom: '9%', backgroundColor: eq.recess, opacity: 0.55 },
  cellArtPlate: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  cellArtText: { color: eq.night, fontWeight: '900' },
  hint: { alignSelf: 'flex-start', minHeight: MIN, minWidth: 140, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: eq.steelLight, backgroundColor: eq.charcoalLight },
  hintOffered: { borderColor: eq.clue },
  hintText: { color: eq.text },
  big: { minWidth: 220, minHeight: 84, paddingHorizontal: 28, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.amber, borderBottomWidth: 8, borderBottomColor: eq.amberDim, overflow: 'hidden' },
  bigLight: { position: 'absolute', left: 16, right: 16, top: 6, height: 8, borderRadius: 4, backgroundColor: eq.amberSoft, opacity: 0.7 },
  bigTall: { minHeight: 120, minWidth: 260 },
  bigText: { color: eq.night, fontWeight: '900', letterSpacing: 2 },
  runTestSpace: { minHeight: 128 },
  strip: { alignSelf: 'stretch', gap: 8 },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: eq.recess, borderWidth: 1.5, borderColor: eq.steelEdge },
  stripRowOn: { borderColor: eq.ok },
  stripLamp: { width: 16, height: 16, borderRadius: 8, backgroundColor: eq.steelDark },
  stripLampOn: { backgroundColor: eq.ok },
  stripText: { color: eq.textDim },
  stripTextOn: { color: eq.ok },
  stamp: { paddingHorizontal: 24, paddingVertical: 18, borderRadius: 16, borderWidth: 4, borderColor: eq.ok, backgroundColor: eq.recess, transform: [{ rotate: '-3deg' }] },
  stampText: { color: eq.ok, textAlign: 'center' },
  // cutaway
  cutaway: { flex: 1, padding: 12 },
  roof: { minHeight: 34, marginHorizontal: 14, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: eq.steelDark },
  monitor: { width: 88, height: 24, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 3, flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: eq.recess, borderWidth: 1.5, borderColor: eq.steelEdge },
  monitorActive: { borderColor: eq.cyan },
  monitorBar: { flex: 1, borderRadius: 1, backgroundColor: eq.cyan },
  monitorBarActive: { backgroundColor: eq.ok },
  relays: { flexDirection: 'row', gap: 6 },
  relay: { width: 18, height: 18, borderRadius: 4, backgroundColor: eq.recess, borderWidth: 1.5, borderColor: eq.steelEdge, alignItems: 'center', justifyContent: 'center' },
  relayLamp: { width: 8, height: 8, borderRadius: 4, backgroundColor: eq.ok },
  systems: { flex: 1, flexDirection: 'row', gap: 10, padding: 10, backgroundColor: eq.charcoalLight, borderWidth: 3, borderColor: eq.steel },
  systemsArt: { backgroundColor: eq.recess, overflow: 'hidden' },
  seams: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: eq.charcoal },
  system: { flex: 1, gap: 8, padding: 8, paddingTop: 14, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', minWidth: MIN, overflow: 'hidden' },
  // During diagnose each system is a control: a raised face, no dashed outline (D191 landings, D193).
  systemTap: { backgroundColor: eq.charcoal, borderColor: eq.steelEdge, borderBottomWidth: 5 },
  systemName: { color: eq.text, textAlign: 'center', minHeight: 40 },
  bayShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: eq.night, borderRadius: 10 },
  ceiling: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, alignItems: 'center' },
  bulb: { width: 30, height: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: eq.amberSoft },
  cone: { width: '90%', height: 110, borderTopLeftRadius: 50, borderTopRightRadius: 50, backgroundColor: eq.amberSoft },
  lamp: { minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2 },
  lampHalo: { position: 'absolute', left: -6, right: -6, top: -6, bottom: -6, borderRadius: 22, borderWidth: 3, borderColor: eq.cyan },
  lampOn: { backgroundColor: eq.ok, borderColor: eq.coolWhite },
  lampOff: { backgroundColor: eq.recess, borderColor: eq.amber },
  lampUnknown: { backgroundColor: eq.charcoal, borderColor: eq.steelEdge },
  lampText: { color: eq.night },
  lampTextOff: { color: eq.amber },
  lampTextUnknown: { color: eq.textDim },
  shaft: { flex: 1, minHeight: 160, borderRadius: 8, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelDark, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, overflow: 'hidden' },
  shaftLit: { borderColor: eq.steel, backgroundColor: eq.charcoal },
  motor: { position: 'absolute', top: 2, alignSelf: 'center', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  gear: { width: 18, height: 18, borderRadius: 9, backgroundColor: eq.steelEdge, borderWidth: 3, borderColor: eq.steelDark, alignItems: 'center', justifyContent: 'center' },
  gearOn: { backgroundColor: eq.steelLight },
  tooth: { position: 'absolute', width: 22, height: 4, borderRadius: 1, backgroundColor: eq.steel },
  riser: { position: 'absolute', bottom: 0, width: 4, backgroundColor: eq.ok, opacity: 0.7, alignSelf: 'center' },
  riserPulse: { position: 'absolute', width: 12, height: 12, marginBottom: -6, borderRadius: 6, backgroundColor: eq.ok, alignSelf: 'center' },
  floorLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: eq.steelDark, alignItems: 'flex-end', justifyContent: 'center' },
  floorLamp: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  floorLampOn: { backgroundColor: eq.amber },
  floorLampOff: { backgroundColor: eq.steelEdge },
  cable: { position: 'absolute', top: 22, bottom: 0, width: 2, backgroundColor: eq.steelEdge },
  car: { borderRadius: 8, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  carLit: { backgroundColor: eq.glass, borderColor: eq.amber },
  carDark: { backgroundColor: eq.steelDark, borderColor: eq.steelEdge },
  carSparks: { position: 'absolute', left: '50%', width: 0, height: 0 },
  door: { position: 'absolute', top: 0, bottom: 0, width: '50%', backgroundColor: eq.steel, borderColor: eq.steelEdge },
  doorLeft: { left: 0, borderRightWidth: 1 },
  doorRight: { right: 0, borderLeftWidth: 1 },
  robot: { alignItems: 'center', marginBottom: 4 },
  robotHead: { borderRadius: 7, backgroundColor: eq.deepBlue, borderWidth: 2, borderColor: eq.cyan, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  robotEye: { width: 6, height: 8, borderRadius: 3, backgroundColor: eq.cyan },
  robotEyeHappy: { height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  box: { marginTop: 3, borderRadius: 3, backgroundColor: eq.amber, borderWidth: 2, borderColor: eq.amberDim },
  delivered: { position: 'absolute', top: 26, right: 6, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.ok, borderWidth: 3, borderColor: eq.coolWhite },
  deliveredArt: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.ok, borderWidth: 3, borderColor: eq.coolWhite },
  deliveredText: { color: eq.night, fontSize: 24, fontWeight: '900' },
  // Art (D195): the bay is the housing's box; the housing sits on its floor.
  shaftArt: { flex: 1, minHeight: 160 },
  fanArt: { flex: 1, minHeight: 160 },
  artUnlit: { opacity: 0.72 },
  cableArt: { position: 'absolute', width: 2, backgroundColor: eq.steelEdge },
  riserLane: { width: 12, alignItems: 'center' },
  robotArt: { transformOrigin: '50% 97%' },
  doorway: { overflow: 'hidden' },
  duct: { backgroundColor: eq.recess },
  fanBox: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelDark },
  fanBoxOn: { borderColor: eq.steel },
  fanRing: { position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: eq.steelDark },
  fan: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  blade: { position: 'absolute', width: 76, height: 16, borderRadius: 8, backgroundColor: eq.steelLight },
  fanHub: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: eq.amber },
  ground: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, backgroundColor: eq.steelDark },
  mainBox: { flexDirection: 'row', gap: 4, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 3, backgroundColor: eq.recess },
  led: { width: 6, height: 6, borderRadius: 3, backgroundColor: eq.cyan },
  ledLive: { backgroundColor: eq.ok },
  mainCable: { flex: 1, height: 3, borderRadius: 2, backgroundColor: eq.steelEdge },
  mainCableLive: { backgroundColor: eq.ok, opacity: 0.6 },
  sweep: { position: 'absolute', top: -40, bottom: -40, width: 90, backgroundColor: eq.coolWhite },
});
