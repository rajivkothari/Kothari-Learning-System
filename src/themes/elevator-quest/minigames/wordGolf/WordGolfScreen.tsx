// Rooftop Word Golf (D197): the full-screen game. One play session is one hole: each word the learner
// spells is a golf shot (pick where it goes, spell it, watch it fly), then the ball is putted out on the
// green. Ten holes on the rooftop; the hole map plays any finished one again or the next one.
//
// The screen only draws the controller's view and forwards touches (controller.ts). It never decides
// whether a word is right (the session does), and golf never reaches the session. BACK TO ELEVATOR is
// in the top bar at every moment, and saves first.
//
//   the hole map (FairwayCanvas)  while words are played: the hole, the targets, the shot in flight
//   the green (CourseCanvas)      once the ball is on it: putting, close up
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { useArt } from '../../ui/art/ArtContext';
import { labelAt } from '../../ui/palette';
import type { MiniGameScreenProps } from '../types';
import { Backdrop, BACKDROP_ID } from './Backdrop';
import type { ClueSource } from './clues';
import { createWordGolf, targetsOf, type Timers } from './controller';
import { CourseCanvas } from './CourseCanvas';
import { HOLES, holeFor, say } from './course';
import { WG_COPY, WORD_CLUES } from './copy';
import { createDrag } from './drag';
import { FairwayCanvas } from './FairwayCanvas';
import { carryFor, puttGreen } from './fairway';
import { fitCourse, golfLayout, toCourse, toScreen } from './layout';
import { INK } from './look';
import { GolfButton } from './parts';
import { PHYS, angleTo, distance } from './physics';
import { PuttPanel } from './PuttPanel';
import { SpellCard } from './SpellCard';
import { HoleMap, ShotHeader, SunkCard, TurnPanel, targetName } from './TurnPanel';

export interface WordGolfScreenProps extends MiniGameScreenProps {
  /** Tests and previews: the clue words (default: the theme's, content/themes/.../minigames). */
  clues?: ClueSource;
  timers?: Timers;
}

const PUTTING = new Set(['aim', 'rolling', 'sunk']);

export function WordGolfScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit, onPlayMission, clues, timers }: WordGolfScreenProps) {
  const hole = useMemo(() => holeFor(session.missionId), [session.missionId]);
  // The controller lives as long as the screen; the host's latest sound and motion setting reach it in effects.
  const [ctl] = useState(() => createWordGolf({ session, sound, hole, copy: WG_COPY, clues: clues ?? WORD_CLUES, ...(timers ? { timers } : {}), reducedMotion }));
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
  const copy = WG_COPY;
  const layout = useMemo(() => golfLayout(size, insets, text, hole.size), [size, insets, text, hole.size]);
  const putting = PUTTING.has(state.phase) && state.putting !== null;
  const green = useMemo(() => puttGreen(hole, state.ball), [hole, state.ball]);
  const greenView = useMemo(() => fitCourse(layout.course, green.size), [layout.course, green.size]);

  const art = useArt();
  const backdrop = useMemo(() => art.set.entries.find((e) => e.id === BACKDROP_ID) ?? null, [art.set]);
  const artSource = useMemo(() => ({ set: art.set, onMissing: art.onMissing }), [art.set, art.onMissing]);

  const [leaving, setLeaving] = useState(false);
  const back = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    void ctl.exit(onExit);
  }, [leaving, ctl, onExit]);

  // The hole map (over the panel): from the hole's first card and the in-the-hole card.
  const [mapOpen, setMapOpen] = useState(false);
  const play = useCallback(
    (missionId: string) => {
      setMapOpen(false);
      if (!onPlayMission || leaving) return;
      // This hole, not started yet: nothing to change.
      if (missionId === session.missionId && state.phase === 'intro' && state.turn === 0 && state.words.length === 0) return;
      sound.play('tilePlace');
      setLeaving(true);
      void ctl.exit(() => onPlayMission(missionId));
    },
    [onPlayMission, leaving, session.missionId, state.phase, state.turn, state.words.length, sound, ctl],
  );
  const openMap = onPlayMission ? () => setMapOpen(true) : undefined;
  // Portrait: the turn and hole cards grow up over the map's foot as tall as their words need.
  const portraitArea = layout.cardAnchor === 'bottom' ? layout.card : undefined;

  // A drag's aim and power (drag.ts) while the finger moves on the green: only the aim line and the
  // meter follow them; the value reaches the game when the finger lifts.
  const [drag] = useState(createDrag);
  useEffect(() => drag.set({ aim: null, power: null }), [state.putting?.aim, state.putting?.power, state.phase, drag]);
  const dragged = useRef<number | null>(null);
  const aiming = state.phase === 'aim' && state.putting !== null;
  const aimAt = (e: GestureResponderEvent) => {
    if (!state.putting) return;
    const p = toCourse(greenView, { x: layout.course.x + e.nativeEvent.locationX, y: layout.course.y + e.nativeEvent.locationY });
    if (distance(p, state.putting.ball) <= PHYS.ballR) return;
    dragged.current = angleTo(state.putting.ball, p);
    drag.set({ aim: dragged.current });
  };
  const aimDone = () => {
    const a = dragged.current;
    dragged.current = null;
    if (a !== null) ctl.setAim(a);
  };
  const flying = state.phase === 'flight';
  const touchCourse = aiming || flying;

  const targets = targetsOf(hole, state);
  const choosing = state.phase === 'target' || state.phase === 'spell';
  const spelling = state.phase === 'spell' && view.item !== null;
  const title = `${say(copy.holeOf, { n: hole.number, count: HOLES.length })}   ${say(copy.par, { par: hole.par })}`;

  return (
    <View testID="word-golf" style={[styles.root, { width: size.width, height: size.height }]}>
      <Backdrop width={size.width} height={size.height} entry={backdrop} art={artSource} />
      {putting && state.putting ? (
        <CourseCanvas box={layout.course} view={greenView} hole={green} ball={state.putting.ball} aim={state.putting.aim} power={state.putting.power} phase={state.phase} shot={state.putting.shot} rollSeq={view.shotSeq} reducedMotion={reducedMotion} suspended={suspended} drag={drag} />
      ) : (
        <FairwayCanvas box={layout.course} view={layout.view} hole={hole} ball={state.ball} phase={state.phase} targets={targets} picked={state.target} letters={choosing ? state.letters : 0} flight={state.flight} shotSeq={view.shotSeq} reducedMotion={reducedMotion} suspended={suspended} />
      )}
      {/* How far the word on the card carries, on its ring (the panel says it in words too). */}
      {!putting && choosing && state.letters > 0
        ? (() => {
            const c = toScreen(layout.view, { x: state.ball.x, y: state.ball.y - carryFor(state.letters) });
            const inside = c.y > layout.course.y + 8 && c.y < layout.course.y + layout.course.height - 8;
            return inside ? (
              <View pointerEvents="none" style={[styles.abs, styles.tag, { left: c.x - 60, top: c.y - 30, width: 120 }]}>
                <Text testID="wg-carry-label" allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.carry]}>
                  {say(copy.yards, { yards: carryFor(state.letters) })}
                </Text>
              </View>
            ) : null;
          })()
        : null}
      {/* The targets' names on the map (the cards in the panel are the controls). */}
      {!putting && choosing
        ? targets
            .filter((t) => t.kind !== 'green')
            .map((t) => {
              const c = toScreen(layout.view, t.at);
              return (
                <View key={t.id} pointerEvents="none" style={[styles.abs, styles.tag, t.kind === 'bold' ? styles.tagBold : styles.tagSafe, { left: c.x - 60, top: c.y - 52, width: 120 }]}>
                  <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), t.kind === 'bold' ? styles.tagBoldText : styles.ink]}>
                    {targetName(t, copy)}
                  </Text>
                </View>
              );
            })
        : null}
      <View
        testID="wg-course"
        accessible
        accessibilityRole="image"
        accessibilityLabel={putting ? copy.greenLabel : say(copy.courseLabel, { name: hole.name })}
        onStartShouldSetResponder={() => touchCourse}
        onMoveShouldSetResponder={() => aiming}
        onResponderGrant={(e) => (flying ? ctl.skip() : aimAt(e))}
        onResponderMove={(e) => (aiming ? aimAt(e) : undefined)}
        onResponderRelease={aimDone}
        onResponderTerminate={aimDone}
        style={[styles.abs, { left: layout.course.x, top: layout.course.y, width: layout.course.width, height: layout.course.height }]}
      />

      {/* The top bar: BACK TO ELEVATOR, always; the hole and its par. */}
      <View style={[styles.abs, { left: layout.back.x, top: layout.back.y }]}>
        <GolfButton testID="wg-back" label={copy.back} glyph="back" kind="quiet" onPress={back} size={text.label} width={layout.back.width} height={layout.back.height} hint={copy.backHint} disabled={leaving} />
      </View>
      <View style={[styles.abs, styles.titleRow, { left: layout.title.x, top: layout.title.y, width: layout.title.width, height: layout.title.height }]} pointerEvents="none">
        <View style={styles.titlePlate}>
          <Text testID="wg-hole-title" allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.ink]}>
            {title}
          </Text>
        </View>
      </View>

      {view.ready && mapOpen ? (
        <HoleMap box={layout.summary} view={view} copy={copy} text={text} onPlay={play} onClose={() => setMapOpen(false)} />
      ) : view.ready ? (
        spelling ? (
          <SpellCard box={layout.card} anchor={layout.cardAnchor} view={view} copy={copy} text={text} tile={layout.tile} gap={layout.gap} reducedMotion={reducedMotion} on={ctl} extra={<ShotHeader view={view} copy={copy} text={text} onChange={ctl.changeTarget} />} />
        ) : state.phase === 'sunk' ? (
          <SunkCard box={layout.panel} area={portraitArea} view={view} copy={copy} text={text} control={layout.control} onPlay={onPlayMission ? play : undefined} onHoles={openMap} onBack={back} leaving={leaving} />
        ) : putting && state.putting ? (
          <PuttPanel box={layout.panel} putting={state.putting} cup={green.cup} rolling={state.phase === 'rolling'} resumed={state.resumed} copy={copy} text={text} control={layout.control} rows={layout.controlRows} tip={layout.tip} closer={view.closer} on={ctl} drag={drag} />
        ) : (
          <TurnPanel box={layout.panel} area={portraitArea} row={layout.orientation === 'portrait'} view={view} copy={copy} text={text} control={layout.control} on={ctl} onHoles={openMap} />
        )
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
  tag: { alignItems: 'center' },
  tagSafe: {},
  tagBold: {},
  tagBoldText: { color: INK.accentLabel },
  carry: { color: INK.text, opacity: 0.85 },
});
