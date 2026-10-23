// Strike Lab V0.1: the screen draws flow.ts. The lane (LaneCanvas, one Skia canvas) fills one side;
// the panel beside it (landscape) or under it (portrait) holds the frame's puzzle, then the controls:
// drag or tap the lane to aim, POWER and SPIN sliders, a big BOWL. Plain views over the canvas for
// the pins' numbers and the result.
//
// Reduced Motion: the roll is not played (the pins are shown where it left them), nothing pops in.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PLAYTEST_ENABLED } from '../../../../config/flags';
import { fill } from '../../../content/missionCopy';
import { STRIKE as C } from '../../content/minigames';
import { DISPLAY, GIVEN, eq, labelAt, readingAt } from '../../ui/palette';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps } from '../types';
import { createStrikeFlow, lineText, pinsOfPair, rackKind, taskLine, type Notes, type StrikeFlow, type StrikeView, type TargetTask, type SmartTask } from './flow';
import { LaneCanvas } from './LaneCanvas';
import { LANE, PIN_R, rack } from './lane';
import { INK, aimFromTouch, makeProj, project } from './look';

const noop = () => () => undefined;
/** How long a first ball's result shows before the second ball. */
const RESULT_BEAT_MS = 1_500;

function useFlow({ session, sound }: Pick<MiniGameScreenProps, 'session' | 'sound'>): [StrikeFlow | null, StrikeView | null] {
  const [flow, setFlow] = useState<StrikeFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createStrikeFlow({ session, sound });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start(Date.now());
    });
    return () => {
      cancelled = true;
      f.dispose();
    };
  }, [session, sound]);
  const view = useSyncExternalStore(flow ? flow.subscribe : noop, flow ? flow.view : () => null, flow ? flow.view : () => null);
  return [flow, view];
}

export function StrikeScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit, onAgain }: MiniGameScreenProps) {
  const [flow, v] = useFlow({ session, sound });
  const { width, height } = size;
  const portrait = height > width;
  const panel = portrait
    ? { x: 0, y: Math.round(height - Math.min(Math.max(height * 0.44, 340), 520)), width, height: 0 }
    : { x: Math.round(width - Math.min(Math.max(width * 0.42, 340), 520)), y: 0, width: 0, height };
  if (portrait) panel.height = height - panel.y;
  else panel.width = width - panel.x;
  const lane = portrait ? { x: 0, y: 0, width, height: panel.y } : { x: 0, y: 0, width: panel.x, height };
  const laneBox = { x: lane.x + 8, y: lane.y + insets.top + 64, width: lane.width - 16, height: lane.height - insets.top - 64 - (portrait ? 4 : insets.bottom + 8) };
  const proj = useMemo(() => makeProj(laneBox), [laneBox.x, laneBox.y, laneBox.width, laneBox.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // A first ball's result shows for a beat, then the second ball.
  useEffect(() => {
    if (!flow || v?.stage !== 'result' || v.frameOver) return;
    const t = setTimeout(() => flow.ready(), RESULT_BEAT_MS);
    return () => clearTimeout(t);
  }, [flow, v?.stage, v?.frameOver, v?.rollSeq]);
  useEffect(() => {
    if (suspended) flow?.pause();
  }, [suspended, flow]);

  const leave = () => {
    if (!flow) return onExit();
    void flow.leave(Date.now()).finally(onExit);
  };

  if (!flow || !v) return <View style={[styles.root, { width, height }]} testID="strike" />;
  const kind = rackKind(v.frame);
  const mode = v.roll && (v.stage === 'rolling' || v.stage === 'result') ? (v.stage === 'rolling' ? 'rolling' : 'result') : 'static';
  const smartTask = v.frame === 1 && v.task?.kind === 'smart' ? v.task : null;
  const targetTask = v.frame === 2 && v.task?.kind === 'target' ? v.task : null;
  const shown = v.hint?.kind === 'showAnswer' ? v.hint.revealed : null;
  const lit = targetTask ? (v.stage === 'puzzle' ? (shown != null ? pinsOfPair(targetTask, String(shown)) : v.picked) : v.targets) : [];
  const smart = smartTask ? { needed: smartTask.needed, lit: v.solved ? smartTask.needed : smartTask.present, powered: v.solved } : v.frame === 1 ? { needed: 1, lit: 1, powered: true } : null;

  return (
    <View style={[styles.root, { width, height }]} testID="strike">
      <LaneCanvas
        box={laneBox}
        proj={proj}
        kind={kind}
        standing={v.standing}
        roll={v.roll}
        rollSeq={v.rollSeq}
        mode={mode}
        shot={v.shot}
        aiming={v.stage === 'aim'}
        trail={v.stage === 'aim' ? v.trail : null}
        smart={smart}
        lit={lit}
        reducedMotion={reducedMotion}
        suspended={suspended}
        onRolled={() => flow.settle()}
        onImpact={() => sound.play('cratePlace')}
      />
      {targetTask && mode === 'static' ? <PinBadges task={targetTask} lit={lit} proj={proj} label={text.label} standing={v.standing} /> : null}
      {v.stage === 'aim' ? <AimArea flow={flow} box={laneBox} proj={proj} /> : null}
      {v.stage === 'result' && v.outcome ? <Outcome v={v} reduced={reducedMotion} box={laneBox} size={text.question} /> : null}

      <View style={[styles.hud, { top: insets.top + 8, left: insets.left + 8, right: (portrait ? 0 : panel.width) + 8 }]} pointerEvents="box-none">
        <BackToElevatorButton onPress={leave} size={text.label} />
        <Frames v={v} label={text.label} />
      </View>

      <View style={[styles.panel, { left: panel.x, top: panel.y, width: panel.width, height: panel.height, paddingTop: (portrait ? 12 : insets.top + 12), paddingBottom: insets.bottom + 12, paddingLeft: (portrait ? insets.left : 0) + 14, paddingRight: insets.right + 14 }]}>
        {v.stage === 'puzzle' && smartTask ? <SmartPuzzle flow={flow} v={v} task={smartTask} text={text} /> : null}
        {v.stage === 'puzzle' && targetTask ? <TargetPuzzle flow={flow} v={v} task={targetTask} text={text} /> : null}
        {v.stage === 'aim' || v.stage === 'rolling' || v.stage === 'result' ? <Controls flow={flow} v={v} text={text} /> : null}
      </View>

      {v.stage === 'intro' || v.stage === 'done' || v.stage === 'unsupported' ? <StartCard flow={flow} v={v} text={text} onExit={leave} onAgain={onAgain} /> : null}
    </View>
  );
}

/** Frame 2: the number on each pin, over the lane (plain text, so it takes the text roles). */
function PinBadges({ task, lit, proj, label, standing }: { task: TargetTask; lit: readonly number[]; proj: ReturnType<typeof makeProj>; label: number; standing: readonly boolean[] }) {
  const spots = rack('five');
  const size = Math.max(32, label + 16);
  return (
    <>
      {spots.map((s, i) => {
        if (standing[i] === false) return null;
        const pt = project(proj, s.x, s.y);
        // Back row: above the pins. Front row (the two nearest): just below their bases, so no two overlap.
        const front = s.y < LANE.head + 0.1;
        const top = front ? pt.y + 4 : pt.y - PIN_R * 4.6 * proj.ppm * pt.s - size - 4;
        return (
          <View key={i} testID={`sl-badge-${i}`} pointerEvents="none" style={[styles.badge, { left: pt.x - size / 2, top, width: size, height: size, borderRadius: size / 2 }, lit.includes(i) && styles.badgeLit]}>
            <Text allowFontScaling={false} style={[labelAt(label), styles.badgeText]}>
              {task.pins[i]}
            </Text>
          </View>
        );
      })}
    </>
  );
}

/** Touch or drag the lane to aim: the ball heads at the point under the finger. */
function AimArea({ flow, box, proj }: { flow: StrikeFlow; box: { x: number; y: number; width: number; height: number }; proj: ReturnType<typeof makeProj> }) {
  const aimAt = (x: number) => flow.setShot({ aim: aimFromTouch(proj, box.x + x) });
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      runOnJS(aimAt)(e.x);
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(aimAt)(e.x);
    });
  const aim = flow.view().shot.aim;
  return (
    <GestureDetector gesture={pan}>
      <View
        testID="sl-aim"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={C.labels.aimHint}
        accessibilityValue={{ min: -10, max: 10, now: Math.round(aim * 10) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => flow.setShot({ aim: Math.max(-1, Math.min(1, aim + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))) })}
        style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height }}
      />
    </GestureDetector>
  );
}

function Frames({ v, label }: { v: StrikeView; label: number }) {
  return (
    <View testID="sl-frame" style={styles.frames} accessibilityLabel={`${fill(C.labels.frame, { value: v.frame })}. ${C.labels.pins} ${v.totals.pins}`}>
      {[1, 2, 3].map((f) => (
        <View key={f} style={[styles.frameDot, f < v.frame && styles.frameDone, f === v.frame && styles.frameNow]}>
          <Text allowFontScaling={false} style={[labelAt(label), styles.frameText, f === v.frame && styles.frameTextNow]}>
            {f}
          </Text>
        </View>
      ))}
      <Text allowFontScaling={false} style={[labelAt(label), styles.statText]}>
        {C.labels.pins} {v.totals.pins}
      </Text>
    </View>
  );
}

function Status({ v, ask, size }: { v: StrikeView; ask: StrikeView['line']; size: number }) {
  if (v.line.key === ask.key) return null;
  // A sentence, so the reading face (audit 2026-10-23: the UI face set it in capitals).
  return (
    <Text testID="sl-status" accessibilityLiveRegion="polite" allowFontScaling={false} style={[readingAt(size), styles.status]}>
      {lineText(v.line)}
    </Text>
  );
}

function HelpButton({ flow, v, label }: { flow: StrikeFlow; v: StrikeView; label: number }) {
  if (!v.help) return null;
  const showMe = v.help.kind === 'showAnswer';
  return (
    <Pressable testID="sl-hint" accessibilityRole="button" accessibilityLabel={showMe ? C.labels.showMe : C.labels.hint} disabled={v.busy} onPress={() => void flow.hint()} style={[styles.hintBtn, v.help.offered && styles.hintOffered]}>
      <Text allowFontScaling={false} style={[labelAt(label), styles.hintText]}>
        {showMe ? C.labels.showMe : C.labels.hint}
      </Text>
    </Pressable>
  );
}

/** Frame 1: the Smart Ball's power gap and the modules. */
function SmartPuzzle({ flow, v, task, text }: { flow: StrikeFlow; v: StrikeView; task: SmartTask; text: MiniGameScreenProps['text'] }) {
  const ask = taskLine(task);
  const givens = v.hint != null;
  const ladder = v.hint?.kind === 'numberLine';
  const shown = v.hint?.kind === 'showAnswer' ? v.hint.revealed : null;
  return (
    <View style={styles.puzzle}>
      <Text testID="sl-question" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
        {lineText(ask)}
      </Text>
      <Status v={v} ask={ask} size={text.passage} />
      <View testID="sl-meter" style={styles.meter} accessibilityLabel={`${C.labels.needs} ${task.needed}, ${C.labels.has} ${task.present}`}>
        <View style={styles.meterBar}>
          {Array.from({ length: task.needed }, (_, i) => (
            <View key={i} style={[styles.cell, i < task.present ? styles.cellOn : givens && styles.cellGap]}>
              {ladder && i >= task.present ? (
                <Text allowFontScaling={false} style={[labelAt(Math.max(16, Math.min(text.label, 18))), styles.cellText]}>
                  {i + 1 - task.present}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.meterLabels}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.meterText, givens && GIVEN]}>
            {C.labels.has} {task.present}
          </Text>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.meterText, givens && GIVEN]}>
            {C.labels.needs} {task.needed}
          </Text>
        </View>
      </View>
      <View style={styles.options}>
        {task.options.map((o) => {
          const tried = v.tried.includes(o.id);
          return (
            <Pressable
              key={o.id}
              testID={`sl-module-${o.value}`}
              accessibilityRole="button"
              accessibilityLabel={fill(C.labels.module, { value: o.value })}
              accessibilityState={{ disabled: tried || v.busy }}
              disabled={tried || v.busy}
              onPress={() => void flow.choose(o.id)}
              style={[styles.module, tried && styles.faded, shown === o.value && styles.shine]}
            >
              <View style={styles.moduleCap} />
              <Text allowFontScaling={false} style={[labelAt(Math.max(text.label + 8, 26)), styles.moduleText]}>
                +{o.value}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <HelpButton flow={flow} v={v} label={text.label} />
    </View>
  );
}

/** Frame 2: the five numbered pins (laid out as on the lane: three behind, two in front). */
function TargetPuzzle({ flow, v, task, text }: { flow: StrikeFlow; v: StrikeView; task: TargetTask; text: MiniGameScreenProps['text'] }) {
  const ask = taskLine(task);
  const dots = v.hint?.kind === 'numberLine';
  const shown = v.hint?.kind === 'showAnswer' && v.hint.revealed != null ? pinsOfPair(task, String(v.hint.revealed)) : [];
  const pin = (i: number) => {
    const picked = v.picked.includes(i);
    return (
      <Pressable
        key={i}
        testID={`sl-pin-${i}`}
        accessibilityRole="button"
        accessibilityLabel={fill(C.labels.pin, { value: task.pins[i]! })}
        accessibilityState={{ selected: picked, disabled: v.busy }}
        disabled={v.busy}
        onPress={() => void flow.pickPin(i)}
        style={[styles.pinBtn, picked && styles.pinPicked, shown.includes(i) && styles.shine]}
      >
        <Text allowFontScaling={false} style={[labelAt(Math.max(text.label + 8, 26)), styles.pinText]}>
          {task.pins[i]}
        </Text>
        {dots ? (
          <View style={styles.dots}>
            {Array.from({ length: task.pins[i]! }, (_, d) => (
              <View key={d} style={styles.dot} />
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={styles.puzzle}>
      <Text testID="sl-question" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
        {fill(C.lines.targetAsk, { target: task.target })}
      </Text>
      <Status v={v} ask={ask} size={text.passage} />
      <View style={styles.rackRow}>{[2, 3, 4].map(pin)}</View>
      <View style={styles.rackRow}>{[0, 1].map(pin)}</View>
      <HelpButton flow={flow} v={v} label={text.label} />
    </View>
  );
}

/** A control that acts the moment a finger lands (BOWL): no press delay, a quick tap is never lost. */
function TapButton({ testID, label, onDown, disabled = false, style, children }: { testID: string; label: string; onDown: () => void; disabled?: boolean; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .hitSlop(6)
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      runOnJS(onDown)();
    });
  return (
    <GestureDetector gesture={tap}>
      <View testID={testID} accessible accessibilityRole="button" accessibilityLabel={label} aria-disabled={disabled} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => !disabled && onDown()} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
}

/** A big slider: touch anywhere on the track to set it, or drag. */
function Slider({ testID, label, value, min, max, onChange, disabled, leftMark, rightMark, text }: { testID: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled: boolean; leftMark: string; rightMark: string; text: number }) {
  const [w, setW] = useState(0);
  const thumb = 52;
  const set = (x: number) => {
    if (w <= thumb) return;
    const k = Math.max(0, Math.min(1, (x - thumb / 2) / (w - thumb)));
    onChange(min + (max - min) * k);
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .onBegin((e) => {
      'worklet';
      runOnJS(set)(e.x);
    })
    .onUpdate((e) => {
      'worklet';
      runOnJS(set)(e.x);
    });
  const k = (value - min) / (max - min);
  const step = (max - min) / 10;
  return (
    <View style={[styles.sliderWrap, disabled && styles.faded]}>
      <View style={styles.sliderHead}>
        <Text allowFontScaling={false} style={[labelAt(text), styles.sliderLabel]}>
          {label}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          testID={testID}
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: 10, now: Math.round(k * 10) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
          style={styles.track}
        >
          <Text allowFontScaling={false} style={[labelAt(text), styles.mark, styles.markLeft]}>
            {leftMark}
          </Text>
          <Text allowFontScaling={false} style={[labelAt(text), styles.mark, styles.markRight]}>
            {rightMark}
          </Text>
          <View style={[styles.fill, { width: Math.max(thumb, k * (w - thumb) + thumb) }]} />
          <View style={[styles.thumb, { width: thumb, height: thumb, borderRadius: thumb / 2, left: k * Math.max(0, w - thumb) }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

function Controls({ flow, v, text }: { flow: StrikeFlow; v: StrikeView; text: MiniGameScreenProps['text'] }) {
  const aiming = v.stage === 'aim';
  const over = v.stage === 'result' && v.frameOver;
  return (
    <View style={styles.controls}>
      <Text testID="sl-line" accessibilityLiveRegion="polite" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
        {lineText(v.line)}
      </Text>
      {over ? (
        <View style={styles.resultRow}>
          <Pressable testID="sl-again" accessibilityRole="button" accessibilityLabel={C.labels.again} onPress={() => flow.bowlAgain()} style={[styles.bigBtn, styles.secondary]}>
            <Text allowFontScaling={false} style={[labelAt(text.label + 4), styles.bigText]}>
              {C.labels.again}
            </Text>
          </Pressable>
          <Pressable testID="sl-next" accessibilityRole="button" accessibilityLabel={v.frame === 3 ? C.labels.finish : C.labels.next} disabled={v.busy} onPress={() => void flow.nextFrame(Date.now())} style={[styles.bigBtn, styles.primary]}>
            <Text allowFontScaling={false} style={[labelAt(text.label + 4), styles.bigText, styles.primaryText]}>
              {v.frame === 3 ? C.labels.finish : C.labels.next}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Slider testID="sl-power" label={C.labels.power} value={v.shot.power} min={0} max={1} onChange={(power) => flow.setShot({ power })} disabled={!aiming} leftMark="−" rightMark="+" text={text.label} />
          <Slider testID="sl-spin" label={C.labels.spin} value={v.shot.spin} min={-1} max={1} onChange={(spin) => flow.setShot({ spin: Math.abs(spin) < 0.08 ? 0 : spin })} disabled={!aiming} leftMark="↶" rightMark="↷" text={text.label} />
          <TapButton testID="sl-bowl" label={C.labels.bowl} onDown={() => flow.bowl()} disabled={!aiming} style={[styles.bowlBtn, !aiming && styles.faded]}>
            <Text allowFontScaling={false} style={[DISPLAY(0.9), styles.bowlText]}>
              {C.labels.bowl}
            </Text>
          </TapButton>
        </>
      )}
    </View>
  );
}

/** The result over the lane: STRIKE!, SPARE!, pins down, the targets. Pops in once (still under Reduced Motion). */
function Outcome({ v, reduced, box, size }: { v: StrikeView; reduced: boolean; box: { x: number; y: number; width: number; height: number }; size: number }) {
  const o = v.outcome!;
  const words = o === 'count' ? fill(C.lines.count, { count: v.lastDown }) : C.lines[o];
  const big = o === 'strike' || o === 'spare' || o === 'targetHit';
  const pop = useSharedValue(reduced ? 1 : 0.6);
  useEffect(() => {
    if (!reduced) pop.set(withTiming(1, { duration: 260 }));
  }, [pop, reduced, v.rollSeq]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <View pointerEvents="none" style={[styles.outcomeWrap, { left: box.x, top: box.y + box.height * 0.62, width: box.width }]}>
      <Animated.View testID="sl-outcome" style={[styles.outcome, big && styles.outcomeBig, style]}>
        <Text allowFontScaling={false} style={[big ? DISPLAY(1.4) : readingAt(size, 'question'), styles.outcomeText, big && styles.outcomeTextBig]}>
          {words}
        </Text>
      </Animated.View>
    </View>
  );
}

function StartCard({ flow, v, text, onExit, onAgain }: { flow: StrikeFlow; v: StrikeView; text: MiniGameScreenProps['text']; onExit: () => void; onAgain: (() => void) | undefined }) {
  const done = v.stage === 'done';
  return (
    <View style={styles.cardWrap} pointerEvents="box-none">
      <View testID={done ? 'sl-done' : 'sl-intro'} style={styles.card}>
        <Text allowFontScaling={false} style={[DISPLAY(1.3), styles.title]} accessibilityRole="header">
          {done ? C.labels.done : C.labels.title}
        </Text>
        <Text testID="sl-start-line" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
          {lineText(v.line)}
        </Text>
        {v.stage === 'intro' ? (
          <Pressable testID="sl-start" accessibilityRole="button" accessibilityLabel={C.labels.start} onPress={() => flow.begin()} style={[styles.bigBtn, styles.primary, styles.startBtn]}>
            <Text allowFontScaling={false} style={[DISPLAY(0.9), styles.primaryText]}>
              {C.labels.start}
            </Text>
          </Pressable>
        ) : null}
        {done && onAgain ? (
          <Pressable
            testID="sl-play-again"
            accessibilityRole="button"
            accessibilityLabel={C.labels.playAgain}
            disabled={v.busy}
            onPress={() => {
              void flow.again().finally(onAgain);
            }}
            style={[styles.bigBtn, styles.primary, styles.startBtn]}
          >
            <Text allowFontScaling={false} style={[DISPLAY(0.9), styles.primaryText]}>
              {C.labels.playAgain}
            </Text>
          </Pressable>
        ) : null}
        {done || v.stage === 'unsupported' ? <BackToElevatorButton onPress={onExit} size={text.label + 2} /> : null}
        {PLAYTEST_ENABLED && done ? <PlaytestSummary notes={v.notes} label={text.label} /> : null}
      </View>
    </View>
  );
}

/** Developer playtest tally (playtest builds only; local; adults). Developer tooling: exempt from the text roles. */
function PlaytestSummary({ notes, label }: { notes: Notes; label: number }) {
  const minutes = Math.round(notes.ms / 6_000) / 10;
  const rows: [string, string | number][] = [
    ['Rounds started', notes.rounds],
    ['Rounds finished', notes.completed],
    ['PLAY AGAIN taps', notes.again],
    ['Left early', notes.exits],
    ['Came back', notes.resumes],
    ['Balls bowled (lab)', `${notes.bowls} (${notes.labBowls})`],
    ['Frames bowled again', notes.frameRetries],
    ['Strikes', notes.strikes],
    ['Help used', notes.help],
    ['Answers (wrong)', `${notes.attempts} (${notes.wrong})`],
    ['Minutes in game', minutes],
  ];
  return (
    <View testID="sl-playtest" style={styles.playtest}>
      <Text allowFontScaling={false} style={[labelAt(Math.max(14, label - 2)), styles.playtestTitle]}>
        {C.labels.playtest}
      </Text>
      {rows.map(([k, val]) => (
        <Text key={k} allowFontScaling={false} style={[labelAt(Math.max(14, label - 2)), styles.playtestRow]}>
          {k}: {val}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: INK.night },
  hud: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  frames: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: eq.charcoal, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: eq.steelEdge },
  frameDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  frameDone: { backgroundColor: eq.ok, borderColor: eq.ok },
  frameNow: { backgroundColor: eq.amber, borderColor: eq.amber },
  frameText: { color: eq.text, fontWeight: '900' },
  frameTextNow: { color: eq.night },
  statText: { color: eq.text, fontWeight: '800', marginLeft: 6 },
  panel: { position: 'absolute', backgroundColor: INK.panel, borderColor: eq.steelEdge, borderTopWidth: 2, borderLeftWidth: 2 },
  puzzle: { flex: 1, gap: 12, alignItems: 'center', justifyContent: 'center' },
  controls: { flex: 1, gap: 14, justifyContent: 'center' },
  question: { color: eq.text, textAlign: 'center' },
  status: { color: GIVEN.color, fontWeight: '800', textAlign: 'center' },
  meter: { width: '100%', gap: 6 },
  meterBar: { flexDirection: 'row', gap: 3, height: 34 },
  cell: { flex: 1, borderRadius: 4, backgroundColor: eq.recess, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: eq.cyan },
  cellGap: { backgroundColor: eq.amberDim },
  cellText: { color: eq.text, fontWeight: '900' },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  meterText: { color: eq.text, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  module: { width: 84, height: 84, borderRadius: 16, backgroundColor: eq.surfaceHigh, borderWidth: 3, borderColor: eq.cyan, alignItems: 'center', justifyContent: 'center' },
  moduleCap: { position: 'absolute', top: 6, width: 30, height: 6, borderRadius: 3, backgroundColor: eq.cyan },
  moduleText: { color: eq.text, fontWeight: '900' },
  faded: { opacity: 0.35 },
  shine: { borderColor: eq.amber, borderWidth: 5, backgroundColor: eq.amberDim },
  rackRow: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  pinBtn: { width: 78, minHeight: 78, borderRadius: 39, backgroundColor: eq.coolWhite, borderWidth: 4, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  pinPicked: { borderColor: eq.amber, backgroundColor: eq.amberSoft },
  pinText: { color: eq.night, fontWeight: '900' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', width: 52, gap: 3, justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: eq.deepBlue },
  hintBtn: { minWidth: 150, minHeight: 56, paddingHorizontal: 20, borderRadius: 14, borderWidth: 3, borderColor: eq.cyan, alignItems: 'center', justifyContent: 'center' },
  hintOffered: { backgroundColor: eq.deepBlueLight },
  hintText: { color: eq.cyan, fontWeight: '900' },
  sliderWrap: { gap: 4 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { color: eq.text, fontWeight: '900' },
  track: { height: 64, borderRadius: 32, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelEdge, justifyContent: 'center' },
  fill: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 28, backgroundColor: eq.deepBlueLight },
  thumb: { position: 'absolute', top: 4, backgroundColor: eq.amber, borderWidth: 3, borderColor: eq.coolWhite },
  mark: { position: 'absolute', color: eq.textDim, fontWeight: '900' },
  markLeft: { left: 70 },
  markRight: { right: 18 },
  bowlBtn: { minHeight: 84, borderRadius: 22, backgroundColor: eq.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: eq.coolWhite },
  bowlText: { color: eq.night, textAlign: 'center' },
  resultRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  bigBtn: { minHeight: 72, minWidth: 150, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  primary: { backgroundColor: eq.amber, borderColor: eq.coolWhite },
  secondary: { backgroundColor: eq.surfaceHigh, borderColor: eq.cyan },
  bigText: { color: eq.text, fontWeight: '900', textAlign: 'center' },
  primaryText: { color: eq.night, textAlign: 'center' },
  startBtn: { alignSelf: 'center', minWidth: 220 },
  badge: { position: 'absolute', backgroundColor: eq.charcoal, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  badgeLit: { backgroundColor: eq.amber, borderColor: eq.coolWhite },
  badgeText: { color: eq.text, fontWeight: '900' },
  outcomeWrap: { position: 'absolute', alignItems: 'center' },
  outcome: { backgroundColor: eq.charcoal, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 12, borderWidth: 3, borderColor: eq.steelLight },
  outcomeBig: { backgroundColor: eq.amber, borderColor: eq.coolWhite },
  outcomeText: { color: eq.text, textAlign: 'center' },
  outcomeTextBig: { color: eq.night },
  cardWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { maxWidth: 560, width: '100%', backgroundColor: INK.card, borderRadius: 24, borderWidth: 3, borderColor: eq.steelLight, padding: 22, gap: 16, alignItems: 'center' },
  title: { color: eq.amber, textAlign: 'center' },
  playtest: { alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: eq.steelEdge, paddingTop: 8, gap: 2 },
  playtestTitle: { color: eq.textDim, fontWeight: '800' },
  playtestRow: { color: eq.textDim },
});
