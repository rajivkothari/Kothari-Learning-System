// Rooftop Word Golf (M9, Floor 20): the full-screen game. Spell the hole's word to earn a putt, then
// aim, set the power and PUTT; three holes on the rooftop, then BACK TO ELEVATOR.
//
// The screen only draws the controller's view and forwards touches (controller.ts). It never decides
// whether a word is right (the session does), and golf never reaches the session. BACK TO ELEVATOR is
// in the top bar at every moment, and saves first.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { useArt } from '../../ui/art/ArtContext';
import { labelAt, readingAt } from '../../ui/palette';
import type { MiniGameScreenProps } from '../types';
import { Backdrop, BACKDROP_ID } from './Backdrop';
import type { ClueSource } from './clues';
import { createWordGolf, type Timers } from './controller';
import { CourseCanvas } from './CourseCanvas';
import { HOLES, say } from './course';
import { WG_COPY, WORD_CLUES, line } from './copy';
import { holesDone } from './game';
import { golfLayout, toCourse } from './layout';
import { INK } from './look';
import { GolfButton, HoleFlags } from './parts';
import { angleTo, distance, PHYS } from './physics';
import { PuttPanel } from './PuttPanel';
import { SpellCard } from './SpellCard';

export interface WordGolfScreenProps extends MiniGameScreenProps {
  /** Tests and previews: the clue words (default: the theme's, content/themes/.../minigames). */
  clues?: ClueSource;
  timers?: Timers;
}

export function WordGolfScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit, clues, timers }: WordGolfScreenProps) {
  // The controller lives as long as the screen; the host's latest sound and motion setting reach it in effects.
  const [ctl] = useState(() => createWordGolf({ session, sound, holes: HOLES, copy: WG_COPY, clues: clues ?? WORD_CLUES, ...(timers ? { timers } : {}), reducedMotion }));
  useEffect(() => ctl.setSound(sound), [ctl, sound]);
  useEffect(() => ctl.setReducedMotion(reducedMotion), [ctl, reducedMotion]);
  useEffect(() => {
    void ctl.start();
    return () => ctl.dispose();
  }, [ctl]);
  useEffect(() => {
    if (suspended) ctl.suspend();
  }, [suspended, ctl]);
  const view = useSyncExternalStore(ctl.subscribe, ctl.getView, ctl.getView);
  const { state } = view;
  const layout = useMemo(() => golfLayout(size, insets, text), [size, insets, text]);
  const hole = HOLES[state.hole]!;
  const copy = WG_COPY;

  const art = useArt();
  const backdrop = useMemo(() => art.set.entries.find((e) => e.id === BACKDROP_ID) ?? null, [art.set]);
  const artSource = useMemo(() => ({ set: art.set, onMissing: art.onMissing }), [art.set, art.onMissing]);

  const [leaving, setLeaving] = useState(false);
  const back = () => {
    if (leaving) return;
    setLeaving(true);
    void ctl.exit(onExit);
  };

  // Touch the green to aim: the aim points from the ball to the finger.
  const aimAt = (e: GestureResponderEvent) => {
    const p = toCourse(layout.view, { x: layout.course.x + e.nativeEvent.locationX, y: layout.course.y + e.nativeEvent.locationY });
    if (distance(p, state.ball) > PHYS.ballR) ctl.setAim(angleTo(state.ball, p));
  };
  const aiming = state.phase === 'aim';

  const done = holesDone(state);
  const spelling = state.phase === 'spell' && view.item !== null;
  const summary = state.phase === 'summary';
  const flagsLabel = say(copy.holesDone, { done, count: state.holeCount });

  return (
    <View testID="word-golf" style={[styles.root, { width: size.width, height: size.height }]}>
      <Backdrop width={size.width} height={size.height} entry={backdrop} art={artSource} />
      <CourseCanvas box={layout.course} view={layout.view} hole={hole} ball={state.ball} aim={state.aim} power={state.power} phase={state.phase} shot={state.shot} rollSeq={view.rollSeq} reducedMotion={reducedMotion} suspended={suspended} />
      <View
        testID="wg-course"
        accessible
        accessibilityRole="image"
        accessibilityLabel={say(copy.courseLabel, { name: hole.name })}
        onStartShouldSetResponder={() => aiming}
        onMoveShouldSetResponder={() => aiming}
        onResponderGrant={aimAt}
        onResponderMove={aimAt}
        style={[styles.abs, { left: layout.course.x, top: layout.course.y, width: layout.course.width, height: layout.course.height }]}
      />

      {/* The top bar: BACK TO ELEVATOR, always; the hole and the flags. */}
      <View style={[styles.abs, { left: layout.back.x, top: layout.back.y }]}>
        <GolfButton testID="wg-back" label={copy.back} glyph="back" kind="quiet" onPress={back} size={text.label} width={layout.back.width} height={layout.back.height} hint={copy.backHint} disabled={leaving} />
      </View>
      <View style={[styles.abs, styles.titleRow, { left: layout.title.x, top: layout.title.y, width: layout.title.width, height: layout.title.height }]} pointerEvents="none">
        <View style={styles.titlePlate}>
          <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.ink]}>
            {summary ? copy.title : line(copy.hole, { hole: hole.number })}
          </Text>
          {layout.flags ? <HoleFlags count={state.holeCount} done={done} current={state.hole} label={flagsLabel} /> : null}
        </View>
      </View>

      {view.ready && !summary && !view.beginning ? (
        spelling ? (
          <SpellCard box={layout.card} anchor={layout.cardAnchor} view={view} copy={copy} text={text} tile={layout.tile} gap={layout.gap} reducedMotion={reducedMotion} on={ctl} />
        ) : state.phase === 'spell' ? null : (
          <PuttPanel box={layout.panel} state={state} hole={hole} copy={copy} text={text} control={layout.control} rows={layout.controlRows} tip={layout.tip} closer={view.closer} on={ctl} />
        )
      ) : null}

      {view.ready && summary ? (
        <View testID="wg-summary" style={[styles.summary, { left: layout.summary.x, top: layout.summary.y, width: layout.summary.width, maxHeight: layout.summary.height }]}>
          <Text accessibilityRole="header" allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.ink, styles.center]}>
            {copy.courseDone}
          </Text>
          <View style={styles.centerRow}>
            <HoleFlags count={state.holeCount} done={state.holeCount} current={-1} label={flagsLabel} />
          </View>
          {state.words.some(Boolean) ? (
            <View style={styles.words}>
              <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim, styles.center]}>
                {copy.wordsLabel}
              </Text>
              <Text allowFontScaling={false} style={[readingAt(Math.max(text.question, 28), 'question'), styles.word, styles.center]}>
                {state.words.filter(Boolean).join('   ')}
              </Text>
            </View>
          ) : null}
          <GolfButton testID="wg-summary-back" label={copy.back} glyph="back" kind="primary" onPress={back} size={text.label} height={72} disabled={leaving} style={styles.stretch} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: INK.night },
  abs: { position: 'absolute' },
  titleRow: { alignItems: 'flex-end', justifyContent: 'center' },
  titlePlate: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 56, borderRadius: 14, backgroundColor: INK.card, borderWidth: 2, borderColor: INK.cardEdge },
  ink: { color: INK.text },
  dim: { color: INK.dim },
  center: { textAlign: 'center' },
  centerRow: { alignItems: 'center' },
  summary: { position: 'absolute', padding: 24, gap: 16, borderRadius: 20, backgroundColor: INK.card, borderWidth: 2, borderColor: INK.accent },
  words: { gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: INK.plate },
  word: { color: INK.accentLabel, letterSpacing: 2 },
  stretch: { alignSelf: 'stretch' },
});
