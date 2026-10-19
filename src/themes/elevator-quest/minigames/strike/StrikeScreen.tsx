// Strike Lab (issue #3): the screen draws flow.ts. The lane (LaneCanvas, one Skia canvas) fills one
// side; the panel beside it (landscape) or under it (portrait) holds the step's puzzle, then the
// controls: drag or tap the lane to aim, POWER and SPIN sliders, a big BOWL. After a frame the panel
// offers exactly the flow's actions (LET'S GO, NEXT, TRY AGAIN, GUIDED SHOT, MOVE ON). Plain views
// over the canvas for the pins' numbers and the result.
//
// Reduced Motion: the roll is not played (the pins are shown where it left them), nothing pops in.
//
// Stage 2 (issue #3): the level map (PIN PURSUIT, WORD STRIKE, PHYSICS LAB) on the start and done
// cards and behind CHALLENGES during a round; Word Strike's spelling panel (Word Golf's letter tiles
// and answer slots, tiles.ts); Physics Lab's TEST STRIP switch (SLICK, GRIPPY). Temporary visuals.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PLAYTEST_ENABLED } from '../../../../config/flags';
import { fill } from '../../../content/missionCopy';
import { STRIKE as C } from '../../content/minigames';
import { DISPLAY, GIVEN, eq, labelAt, readingAt } from '../../ui/palette';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps } from '../types';
import { splitBlank } from '../wordGolf/clues';
import { slotRow } from '../wordGolf/layout';
import { isUsed, slotLetter } from '../wordGolf/tiles';
import type { ChallengeId } from './challenges';
import { createStrikeFlow, lineText, pinsOfPair, resultActions, taskLine, type Notes, type ResultAction, type SpellTask, type StrikeFlow, type StrikeView, type TargetTask, type SmartTask } from './flow';
import { LaneCanvas } from './LaneCanvas';
import { LANE, PIN_R, rack, type LaneSetup } from './lane';
import { INK, aimFromTouch, makeProj, project } from './look';

const noop = () => () => undefined;
/** Word Strike's letter tiles: Word Golf's size (64 pt, D200). */
const TILE = 64;
const TILE_GAP = 8;
const LEVEL_LABEL: Record<ChallengeId, string> = { classic: C.labels.classic, 'pin-pursuit': C.labels.pinPursuit, 'word-strike': C.labels.wordStrike, 'physics-lab': C.labels.physicsLab };
/** Opens another level (the host closes this session and opens that one): null when the host cannot. */
type PickLevel = ((missionId: string, now: number) => void) | null;
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

export function StrikeScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit, onAgain, onPlayMission }: MiniGameScreenProps) {
  const [flow, v] = useFlow({ session, sound });
  const [mapOpen, setMapOpen] = useState(false);
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
  // The level map: saved first (the visit goes on: no new warm-up), then the host opens that level.
  const pick: PickLevel =
    flow && onPlayMission
      ? (missionId, now) => {
          setMapOpen(false);
          void flow.switchLevel(now).finally(() => onPlayMission(missionId));
        }
      : null;
  // PLAY AGAIN: the same challenge again (a new instance), or a new round from the host.
  const again =
    onPlayMission && session.missionId !== 'strike-lab' ? () => onPlayMission(session.missionId) : onAgain;

  if (!flow || !v) return <View style={[styles.root, { width, height }]} testID="strike" />;
  const mode = v.roll && (v.stage === 'rolling' || v.stage === 'result') ? (v.stage === 'rolling' ? 'rolling' : 'result') : 'static';
  const practice = v.mode === 'practice';
  const smartTask = !practice && v.task?.kind === 'smart' ? v.task : null;
  const targetTask = !practice && v.task?.kind === 'target' ? v.task : null;
  const spellTask = !practice && v.task?.kind === 'spell' ? v.task : null;
  const panelInner = panel.width - ((portrait ? insets.left : 0) + 14 + insets.right + 14);
  const shown = v.hint?.kind === 'showAnswer' ? v.hint.revealed : null;
  const lit = v.stage === 'puzzle' ? (targetTask ? (shown != null ? pinsOfPair(targetTask, String(shown)) : v.picked) : []) : v.targets;
  const smart = smartTask ? { needed: smartTask.needed, lit: v.solved ? smartTask.needed : smartTask.present, powered: v.solved } : null;

  return (
    <View style={[styles.root, { width, height }]} testID="strike">
      <LaneCanvas
        box={laneBox}
        proj={proj}
        lane={v.lane}
        guide={v.stage === 'aim' ? v.guide : null}
        guideLane={v.guideLane}
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
      {targetTask && mode === 'static' ? <PinBadges task={targetTask} lane={v.lane} lit={lit} proj={proj} label={text.label} standing={v.standing} /> : null}
      {v.stage === 'aim' ? <AimArea flow={flow} box={laneBox} proj={proj} /> : null}
      {v.stage === 'result' && v.outcome ? <Outcome v={v} reduced={reducedMotion} box={laneBox} size={text.question} /> : null}

      <View style={[styles.hud, { top: insets.top + 8, left: insets.left + 8, right: (portrait ? 0 : panel.width) + 8 }]} pointerEvents="box-none">
        <BackToElevatorButton onPress={leave} size={text.label} />
        <Steps v={v} label={text.label} />
        {pick && v.levels.length > 0 && v.stage !== 'intro' && v.stage !== 'done' ? (
          <Pressable testID="sl-levels-open" accessibilityRole="button" accessibilityLabel={C.labels.levels} disabled={v.busy || v.stage === 'rolling'} onPress={() => setMapOpen(true)} style={[styles.hudBtn, (v.busy || v.stage === 'rolling') && styles.faded]}>
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.hudBtnText]}>
              {C.labels.levels}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.panel, { left: panel.x, top: panel.y, width: panel.width, height: panel.height, paddingTop: (portrait ? 12 : insets.top + 12), paddingBottom: insets.bottom + 12, paddingLeft: (portrait ? insets.left : 0) + 14, paddingRight: insets.right + 14 }]}>
        {v.stage === 'puzzle' && smartTask ? <SmartPuzzle flow={flow} v={v} task={smartTask} text={text} /> : null}
        {v.stage === 'puzzle' && targetTask ? <TargetPuzzle flow={flow} v={v} task={targetTask} text={text} /> : null}
        {v.stage === 'puzzle' && spellTask ? <SpellPuzzle flow={flow} v={v} task={spellTask} text={text} width={panelInner} /> : null}
        {v.stage === 'aim' || v.stage === 'rolling' || v.stage === 'result' ? <Controls flow={flow} v={v} text={text} /> : null}
      </View>

      {v.stage === 'intro' || v.stage === 'done' || v.stage === 'unsupported' ? <StartCard flow={flow} v={v} text={text} onExit={leave} onAgain={again} pick={pick} top={insets.top + 80} /> : null}
      {mapOpen && pick ? (
        <View style={styles.cardWrap}>
          <View testID="sl-map" style={styles.card}>
            <Text allowFontScaling={false} style={[DISPLAY(1.1), styles.title]} accessibilityRole="header">
              {C.labels.levels}
            </Text>
            <LevelMap v={v} text={text} pick={pick} />
            <Pressable testID="sl-map-close" accessibilityRole="button" accessibilityLabel={C.labels.close} onPress={() => setMapOpen(false)} style={[styles.bigBtn, styles.secondary]}>
              <Text allowFontScaling={false} style={[labelAt(text.label + 4), styles.bigText]}>
                {C.labels.close}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The challenges: the one playing marked, finished ones marked DONE (a word and a mark, never colour alone). */
function LevelMap({ v, text, pick }: { v: StrikeView; text: MiniGameScreenProps['text']; pick: NonNullable<PickLevel> }) {
  return (
    <View testID="sl-levels" style={styles.levels}>
      {v.levels.map((l) => {
        const tag = l.done ? C.labels.levelDone : l.current ? C.labels.playing : null;
        return (
          <Pressable
            key={l.missionId}
            testID={`sl-level-${l.id}`}
            accessibilityRole="button"
            accessibilityLabel={tag ? `${LEVEL_LABEL[l.id]}, ${tag}` : LEVEL_LABEL[l.id]}
            accessibilityState={{ selected: l.current, disabled: v.busy || l.current }}
            disabled={v.busy || l.current}
            onPress={() => pick(l.missionId, Date.now())}
            style={[styles.level, l.current && styles.levelNow]}
          >
            <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.levelText, l.current && styles.levelTextNow]}>
              {LEVEL_LABEL[l.id]}
            </Text>
            {tag ? (
              <Text allowFontScaling={false} style={[labelAt(text.label), styles.levelTag, l.current && styles.levelTextNow]}>
                {l.done ? `✓ ${tag}` : tag}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A target puzzle: the number on each pin, over the lane (plain text, so it takes the text roles). */
function PinBadges({ task, lane, lit, proj, label, standing }: { task: TargetTask; lane: LaneSetup; lit: readonly number[]; proj: ReturnType<typeof makeProj>; label: number; standing: readonly boolean[] }) {
  const spots = rack(lane.rack);
  const size = Math.max(32, label + 16);
  return (
    <>
      {spots.map((s, i) => {
        if (standing[i] === false) return null;
        const pt = project(proj, s.x, s.y);
        // Back pins: above the pins. Front pins (on the head row): just below their bases, so no two overlap.
        const front = s.y < LANE.head + 0.1 || spots.every((o) => o.y === s.y);
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

/** The round's puzzles (one dot a mission step), PRACTICE during the free ball, and pins down. */
function Steps({ v, label }: { v: StrikeView; label: number }) {
  const n = Math.max(1, v.steps);
  return (
    <View testID="sl-frame" style={styles.frames} accessibilityLabel={`${fill(C.labels.step, { value: Math.min(v.step + 1, n), count: n })}. ${C.labels.pins} ${v.totals.pins}`}>
      {v.mode === 'practice' && v.stage !== 'intro' ? (
        <View testID="sl-practice" style={[styles.frameDot, styles.frameNow, styles.practiceChip]}>
          <Text allowFontScaling={false} style={[labelAt(label), styles.frameText, styles.frameTextNow]}>
            {C.labels.practice}
          </Text>
        </View>
      ) : (
        Array.from({ length: n }, (_, k) => (
          <View key={k} style={[styles.frameDot, k < v.step && styles.frameDone, k === v.step && styles.frameNow]}>
            <Text allowFontScaling={false} style={[labelAt(label), styles.frameText, k === v.step && styles.frameTextNow]}>
              {k + 1}
            </Text>
          </View>
        ))
      )}
      <Text allowFontScaling={false} style={[labelAt(label), styles.statText]}>
        {C.labels.pins} {v.totals.pins}
      </Text>
    </View>
  );
}

function Status({ v, ask, label }: { v: StrikeView; ask: StrikeView['line']; label: number }) {
  if (v.line.key === ask.key) return null;
  return (
    <Text testID="sl-status" accessibilityLiveRegion="polite" allowFontScaling={false} style={[labelAt(label), styles.status]}>
      {lineText(v.line)}
    </Text>
  );
}

function HelpButton({ flow, v, label }: { flow: StrikeFlow; v: StrikeView; label: number }) {
  if (!v.help) return null;
  const showMe = v.help.assistance === 'demonstrated' || /show|answer|demonstr/i.test(v.help.kind);
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
      <Status v={v} ask={ask} label={text.label} />
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

/** Rows of a formation as the child sees it from the foul line: the back row first, left to right. */
function formationRows(lane: LaneSetup): number[][] {
  const spots = rack(lane.rack);
  const rows = new Map<number, number[]>();
  spots.forEach((s, i) => {
    const key = Math.round(s.y * 100);
    rows.set(key, [...(rows.get(key) ?? []), i]);
  });
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, idx]) => idx.sort((a, b) => spots[a]!.x - spots[b]!.x));
}

/** A target puzzle: the five numbered pins, laid out as they stand on the lane. */
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
      <Status v={v} ask={ask} label={text.label} />
      {formationRows(v.lane).map((row, r) => (
        <View key={r} style={styles.rackRow}>
          {row.map(pin)}
        </View>
      ))}
      <HelpButton flow={flow} v={v} label={text.label} />
    </View>
  );
}

/**
 * Word Strike: the word's clue, then Word Golf's letter tiles and answer slots (tiles.ts): a tile goes
 * to the first empty slot, a slot gives its letter back, UNDO, CLEAR, TRY IT once every slot is full.
 * Hearing the word is offered when its recording exists; the written clue is always there.
 */
function SpellPuzzle({ flow, v, task, text, width }: { flow: StrikeFlow; v: StrikeView; task: SpellTask; text: MiniGameScreenProps['text']; width: number }) {
  const tray = v.tray;
  if (!tray) return null;
  const ask = taskLine(task);
  const row = slotRow(Math.max(TILE, width), tray.slots.length, TILE, TILE_GAP);
  const full = tray.slots.every((x) => x !== null);
  const blank = task.clue?.blank ? splitBlank(task.clue.blank) : null;
  const letterSize = Math.max(text.label + 6, 24);
  return (
    <ScrollView style={styles.spellScroll} contentContainerStyle={styles.spell}>
      <Text testID="sl-question" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
        {lineText(ask)}
      </Text>
      <Status v={v} ask={ask} label={text.label} />
      {blank ? (
        <Text testID="sl-clue" allowFontScaling={false} style={[readingAt(text.passage, 'passage'), styles.question]}>
          {blank.before}
          <Text style={styles.gap}>{'____'}</Text>
          {blank.after}
        </Text>
      ) : null}
      {task.clue?.meaning ? (
        <Text allowFontScaling={false} style={[readingAt(text.label, 'passage'), styles.meaning]}>
          {task.clue.meaning}
        </Text>
      ) : null}
      {v.canHear ? (
        <Pressable testID="sl-hear" accessibilityRole="button" accessibilityLabel={C.labels.hear} onPress={() => flow.hear()} style={styles.hintBtn}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.hintText]}>
            {C.labels.hear}
          </Text>
        </Pressable>
      ) : null}
      <View style={[styles.slots, { gap: row.gap }]}>
        {tray.slots.map((_, i) => {
          const letter = slotLetter(tray, i);
          return (
            <Pressable
              key={i}
              testID={`sl-slot-${i}`}
              accessibilityRole="button"
              accessibilityLabel={letter ? `${fill(C.labels.slot, { value: i + 1 })}: ${letter}` : fill(C.labels.slot, { value: i + 1 })}
              disabled={!letter || v.busy}
              onPress={() => flow.removeTile(i)}
              style={[styles.slot, { width: row.size, height: Math.max(row.size, 52) }, letter ? styles.slotFilled : null]}
            >
              {letter ? (
                <Text allowFontScaling={false} style={[styles.tileLetter, styles.slotLetter, styles.caps, { fontSize: letterSize, lineHeight: Math.round(letterSize * 1.2) }]}>
                  {letter}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.tiles, { gap: TILE_GAP }]}>
        {tray.tiles.map((t) => {
          const used = isUsed(tray, t.id);
          return (
            <Pressable
              key={t.id}
              testID={`sl-tile-${t.id}`}
              accessibilityRole="button"
              accessibilityLabel={fill(C.labels.letter, { value: t.letter })}
              accessibilityState={{ disabled: used || v.busy }}
              disabled={used || v.busy}
              onPress={() => flow.placeTile(t.id)}
              style={[styles.tile, used && styles.faded]}
            >
              <Text allowFontScaling={false} style={[styles.tileLetter, styles.caps, { fontSize: letterSize, lineHeight: Math.round(letterSize * 1.2) }]}>
                {t.letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.resultRow}>
        <Pressable testID="sl-undo" accessibilityRole="button" accessibilityLabel={C.labels.undo} disabled={v.busy} onPress={() => flow.undoTile()} style={[styles.smallBtn, styles.secondary]}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.bigText]}>
            {C.labels.undo}
          </Text>
        </Pressable>
        <Pressable testID="sl-clear" accessibilityRole="button" accessibilityLabel={C.labels.clear} disabled={v.busy} onPress={() => flow.clearTiles()} style={[styles.smallBtn, styles.secondary]}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.bigText]}>
            {C.labels.clear}
          </Text>
        </Pressable>
        <Pressable testID="sl-try" accessibilityRole="button" accessibilityLabel={C.labels.tryWord} accessibilityState={{ disabled: !full || v.busy }} disabled={!full || v.busy} onPress={() => void flow.spell()} style={[styles.smallBtn, styles.primary, (!full || v.busy) && styles.faded]}>
          <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.primaryText]}>
            {C.labels.tryWord}
          </Text>
        </Pressable>
      </View>
      <HelpButton flow={flow} v={v} label={text.label} />
    </ScrollView>
  );
}

/** Physics Lab: set the test strip SLICK or GRIPPY (while aiming); what it does, in words. */
function StripSwitch({ flow, v, text }: { flow: StrikeFlow; v: StrikeView; text: MiniGameScreenProps['text'] }) {
  if (!v.surface) return null;
  const aiming = v.stage === 'aim';
  const opt = (kind: 'oil' | 'grip', label: string) => {
    const on = v.surface === kind;
    return (
      <Pressable
        key={kind}
        testID={`sl-surface-${kind}`}
        accessibilityRole="button"
        accessibilityLabel={`${C.labels.strip}: ${label}`}
        accessibilityState={{ selected: on, disabled: !aiming }}
        disabled={!aiming}
        onPress={() => flow.setSurface(kind)}
        style={[styles.stripBtn, kind === 'oil' ? styles.stripOil : styles.stripGrip, on && styles.stripOn, !aiming && styles.faded]}
      >
        <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.stripText]}>
          {on ? `● ${label}` : label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View testID="sl-strip" style={styles.strip}>
      <Text allowFontScaling={false} style={[labelAt(text.label), styles.sliderLabel]}>
        {C.labels.strip}
      </Text>
      <View style={styles.stripRow}>
        {opt('oil', C.labels.slick)}
        {opt('grip', C.labels.grippy)}
      </View>
      <Text testID="sl-strip-note" allowFontScaling={false} style={[readingAt(text.label, 'passage'), styles.meaning]}>
        {v.surface === 'oil' ? C.lines.surfaceSlick : C.lines.surfaceGrippy}
      </Text>
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

const ACTION_LABEL: Record<ResultAction, string> = { continue: C.labels.continue, next: C.labels.next, retry: C.labels.retry, guided: C.labels.guided, moveOn: C.labels.moveOn };

function Controls({ flow, v, text }: { flow: StrikeFlow; v: StrikeView; text: MiniGameScreenProps['text'] }) {
  const aiming = v.stage === 'aim';
  const actions = resultActions(v);
  const act = (a: ResultAction, now: number) => {
    if (a === 'continue') flow.proceed();
    else if (a === 'next') void flow.next(now);
    else if (a === 'retry') flow.retry();
    else if (a === 'guided') flow.guided();
    else void flow.moveOn(now);
  };
  return (
    <View style={styles.controls}>
      <Text testID="sl-line" accessibilityLiveRegion="polite" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.question]}>
        {lineText(v.line)}
      </Text>
      {actions.length ? (
        <View style={styles.resultRow}>
          {actions.map((a) => {
            // The way on (or the guided shot) is the primary button; MOVE ON is always the quiet one.
            const primary = a !== 'moveOn';
            return (
              <Pressable key={a} testID={`sl-${a}`} accessibilityRole="button" accessibilityLabel={ACTION_LABEL[a]} disabled={v.busy} onPress={() => act(a, Date.now())} style={[styles.bigBtn, primary ? styles.primary : styles.secondary]}>
                <Text allowFontScaling={false} style={[labelAt(text.label + 4), styles.bigText, primary && styles.primaryText]}>
                  {ACTION_LABEL[a]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
          <Slider testID="sl-power" label={C.labels.power} value={v.shot.power} min={0} max={1} onChange={(power) => flow.setShot({ power })} disabled={!aiming} leftMark="−" rightMark="+" text={text.label} />
          <StripSwitch flow={flow} v={v} text={text} />
          <Slider testID="sl-spin" label={v.spinOpen ? C.labels.spin : C.labels.spinLocked} value={v.shot.spin} min={-1} max={1} onChange={(spin) => flow.setShot({ spin: Math.abs(spin) < 0.08 ? 0 : spin })} disabled={!aiming || !v.spinOpen} leftMark="↶" rightMark="↷" text={text.label} />
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

/** The result over the lane: STRIKE!, pins down, the target cleared or still up. Pops in once (still under Reduced Motion). */
function Outcome({ v, reduced, box, size }: { v: StrikeView; reduced: boolean; box: { x: number; y: number; width: number; height: number }; size: number }) {
  const o = v.outcome!;
  const words = o === 'count' ? fill(C.lines.count, { count: v.lastDown }) : C.lines[o];
  const big = o === 'strike' || o === 'cleared';
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

function StartCard({ flow, v, text, onExit, onAgain, pick, top }: { flow: StrikeFlow; v: StrikeView; text: MiniGameScreenProps['text']; onExit: () => void; onAgain: (() => void) | undefined; pick: PickLevel; top: number }) {
  const done = v.stage === 'done';
  const level = v.challenge && v.challenge !== 'classic' ? LEVEL_LABEL[v.challenge] : C.labels.title;
  return (
    // Below the top bar, so BACK TO ELEVATOR stays tappable while the card shows.
    <ScrollView style={[styles.cardScroll, { top }]} contentContainerStyle={styles.cardWrap}>
      <View testID={done ? 'sl-done' : 'sl-intro'} style={styles.card}>
        <Text allowFontScaling={false} style={[DISPLAY(1.3), styles.title]} accessibilityRole="header">
          {done ? C.labels.done : level}
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
        {pick && v.levels.length > 0 && v.stage !== 'unsupported' ? (
          <>
            <Text allowFontScaling={false} style={[readingAt(text.label, 'passage'), styles.meaning]}>
              {done ? C.lines.pickLevel : C.labels.levels}
            </Text>
            <LevelMap v={v} text={text} pick={pick} />
          </>
        ) : null}
        {done || v.stage === 'unsupported' ? <BackToElevatorButton onPress={onExit} size={text.label + 2} /> : null}
        {PLAYTEST_ENABLED && done ? <PlaytestSummary notes={v.notes} label={text.label} /> : null}
      </View>
    </ScrollView>
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
    ['Balls bowled (practice)', `${notes.bowls} (${notes.practice})`],
    ['Targets cleared', notes.cleared],
    ['TRY AGAIN, GUIDED SHOT, MOVE ON', `${notes.retries}, ${notes.guided}, ${notes.movedOn}`],
    ['Challenge switches', notes.switches],
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
  practiceChip: { width: 'auto', minWidth: 36, paddingHorizontal: 12 },
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
  cardScroll: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  cardWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  hudBtn: { minHeight: 64, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, borderColor: eq.cyan, backgroundColor: eq.charcoal, alignItems: 'center', justifyContent: 'center' },
  hudBtnText: { color: eq.cyan, fontWeight: '900' },
  levels: { alignSelf: 'stretch', gap: 10 },
  level: { minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: eq.steelLight, backgroundColor: eq.surfaceHigh, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  levelNow: { borderColor: eq.amber, backgroundColor: eq.amber },
  levelText: { color: eq.text, fontWeight: '900' },
  levelTextNow: { color: eq.night },
  levelTag: { color: eq.ok, fontWeight: '900' },
  spellScroll: { flex: 1 },
  spell: { flexGrow: 1, gap: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  gap: { color: eq.amber, fontWeight: '900' },
  meaning: { color: eq.textDim, textAlign: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  slot: { borderRadius: 12, borderWidth: 3, borderColor: eq.steelLight, backgroundColor: eq.recess, alignItems: 'center', justifyContent: 'center' },
  slotFilled: { borderColor: eq.amber, backgroundColor: eq.charcoal },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tile: { width: TILE, height: TILE, borderRadius: 14, backgroundColor: eq.coolWhite, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  tileLetter: { color: eq.night, fontWeight: '900' },
  slotLetter: { color: eq.text },
  caps: { textTransform: 'uppercase' },
  smallBtn: { minHeight: 64, minWidth: 96, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  strip: { gap: 6 },
  stripRow: { flexDirection: 'row', gap: 10 },
  stripBtn: { flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  stripOil: { backgroundColor: eq.deepBlue },
  stripGrip: { backgroundColor: eq.charcoal },
  stripOn: { borderColor: eq.amber, borderWidth: 5 },
  stripText: { color: eq.text, fontWeight: '900' },
  card: { maxWidth: 560, width: '100%', backgroundColor: INK.card, borderRadius: 24, borderWidth: 3, borderColor: eq.steelLight, padding: 22, gap: 16, alignItems: 'center' },
  title: { color: eq.amber, textAlign: 'center' },
  playtest: { alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: eq.steelEdge, paddingTop: 8, gap: 2 },
  playtestTitle: { color: eq.textDim, fontWeight: '800' },
  playtestRow: { color: eq.textDim },
});
