// The panel beside (or under) the hole map (D197): one card at a time, always one big primary button
// with a word.
//
//   intro    the hole (its name and what it teaches), where the ball lies, TEE OFF or NEXT WORD
//   target   PICK YOUR SHOT: how far this word can carry, and a card per target with what it needs
//   flight   SWING! and the word (a tap skips the flight)
//   result   what the word did: the shot's name, why (from how it was spelled), where it ended
//   sunk     in the hole: the par flavour, the shots, the words; NEXT HOLE, PLAY AGAIN, HOLES
// The shot header (ShotHeader) rides on the spelling card: the word's power and the target it is for.
// The hole map (HoleMap) lists every hole: finished ones replay, the next one opens, the rest wait.
//
// Nothing here scores or judges: a steady shot is a shot, a short one is information, and putting and
// strokes are play. The words come from golfCourses.json (course.ts) and wordGolf.json (copy.ts).
import { memo, useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { labelAt, readingAt } from '../../ui/palette';
import { MoreCue, useScrollMore } from '../../ui/ScrollMore';
import type { Box } from '../../ui/layout';
import type { TextSizes } from '../../ui/textRoles';
import type { WordGolfView } from './controller';
import { HOLES, holeAfter, openHoles, say } from './course';
import type { WgCopy } from './copy';
import { carryFor, parName, toPin, windOf, type Hole, type Lie, type Target } from './fairway';
import { targetOf, targetsOf, type ShotReport } from './game';
import { INK } from './look';
import { GolfButton } from './parts';

export interface TurnHandlers {
  begin(): void;
  chooseTarget(id: string): void;
  changeTarget(): void;
  carryOn(): void;
  skip(): void;
}

const PAD = 16;

const LIE_KEY: Partial<Record<Lie, 'lieTee' | 'lieFairway' | 'lieRough' | 'lieBunker' | 'lieGreen'>> = { tee: 'lieTee', fairway: 'lieFairway', rough: 'lieRough', bunker: 'lieBunker', green: 'lieGreen' };

/** The target's name on a card and on the map. */
export const targetName = (t: Pick<Target, 'kind'>, copy: WgCopy) => (t.kind === 'safe' ? copy.targetSafe : t.kind === 'bold' ? copy.targetBold : copy.targetGreen);
const targetNote = (t: Pick<Target, 'kind'>, copy: WgCopy) => (t.kind === 'safe' ? copy.safeNote : t.kind === 'bold' ? copy.boldNote : copy.greenNote);

/**
 * The shot's name and why, from the report (never a judgement: every shot flies). The name and the
 * why are the spelling's (what the word earned); a lie that played it shorter says so on its own line,
 * so a word spelled with no help is never described as helped.
 */
export function shotWords(r: ShotReport, copy: WgCopy): { name: string; why: string; lie: string | null; family: string | null; where: string | null } {
  const q = r.earned;
  const name = r.golden ? copy.shotGolden : q === 'power' ? copy.shotPower : q === 'good' ? copy.shotGood : copy.shotSteady;
  const why = r.golden && r.sound ? say(copy.goldenWhy, { sound: r.sound.toUpperCase() }) : q === 'power' ? copy.powerWhy : q === 'good' ? copy.goodWhy : copy.steadyWhy;
  const lie = r.quality !== q ? (r.from === 'bunker' ? copy.bunkerNote : r.from === 'rough' ? copy.roughNote : null) : null;
  const family = r.rime ? say(copy.familyWhy, { rime: `-${r.rime.replace(/^[-_]+/, '').toUpperCase()}` }) : null;
  const where = r.splash ? copy.splash : r.carried === true ? copy.carried : r.carried === false ? copy.cameShort : r.lie === 'bunker' ? copy.inSand : r.lie === 'rough' ? copy.inRough : r.lie === 'green' ? copy.onGreen : null;
  return { name, why, lie, family, where };
}

/**
 * A card in the panel. With `area` (portrait), it grows up from the panel's foot as tall as its words
 * need, never shorter than the panel and never taller than the area, so the primary button is never
 * below the fold; the hole map stays in view above it.
 */
function Card({ box, area, testID, children }: { box: Box; area?: Box | undefined; testID: string; children: ReactNode }) {
  const scroll = useScrollMore();
  const [want, setWant] = useState(0);
  const { onContentSizeChange } = scroll.props;
  const onSize = useCallback(
    (w: number, h: number) => {
      onContentSizeChange(w, h);
      setWant(h + 4);
    },
    [onContentSizeChange],
  );
  const height = area && want > 0 ? Math.max(box.height, Math.min(area.height, want)) : box.height;
  const top = area ? box.y + box.height - height : box.y;
  return (
    <View testID={testID} style={[styles.panel, { left: box.x, top, width: box.width, height }]}>
      <ScrollView {...scroll.props} onContentSizeChange={onSize} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
      <MoreCue visible={scroll.more} right={box.width / 2 - 16} />
    </View>
  );
}

/** Where the ball lies and how far it is to the flag. */
function LieLine({ hole, view, copy, text }: { hole: Hole; view: WordGolfView; copy: WgCopy; text: TextSizes }) {
  const key = LIE_KEY[view.state.lie];
  return (
    <View style={styles.lieRow}>
      {key ? (
        <Text testID="wg-lie" allowFontScaling={false} style={[labelAt(text.label), styles.chip]}>
          {copy[key]}
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim]}>
        {say(copy.toPin, { yards: toPin(hole, view.state.ball) })}
      </Text>
    </View>
  );
}

export const TurnPanel = memo(function TurnPanel({ box, area, row = false, view, copy, text, control, on, onHoles }: { box: Box; area?: Box | undefined; row?: boolean; view: WordGolfView; copy: WgCopy; text: TextSizes; control: number; on: TurnHandlers; onHoles?: (() => void) | undefined }) {
  const { state, hole } = view;
  const q = readingAt(text.question, 'question');
  const p = readingAt(text.passage);
  const big = Math.max(72, control);
  switch (state.phase) {
    case 'intro': {
      if (view.beginning) return null;
      const first = state.turn === 0;
      return (
        <Card box={box} area={area} testID="wg-panel-intro">
          {hole.number === 1 && first && !state.resumed ? (
            <Text allowFontScaling={false} style={[p, styles.ink]}>
              {copy.intro}
            </Text>
          ) : null}
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {hole.name}
          </Text>
          {state.resumed ? (
            <Text allowFontScaling={false} style={[p, styles.dim]}>
              {copy.resume}
            </Text>
          ) : null}
          {first ? (
            <Text allowFontScaling={false} style={[p, styles.ink]}>
              {hole.intro}
            </Text>
          ) : null}
          <LieLine hole={hole} view={view} copy={copy} text={text} />
          <GolfButton testID="wg-begin" label={first ? copy.teeOff : copy.nextShot} glyph="right" kind="primary" onPress={on.begin} size={text.label} height={big} style={styles.wide} />
          {onHoles && first ? <GolfButton testID="wg-holes" label={copy.holesLabel} kind="quiet" onPress={onHoles} size={text.label} style={styles.wide} /> : null}
        </Card>
      );
    }
    case 'target': {
      const yards = carryFor(state.letters);
      const note = state.lie === 'rough' ? copy.roughNote : state.lie === 'bunker' ? copy.bunkerNote : null;
      return (
        <Card box={box} area={area} testID="wg-panel-target">
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {copy.pickShot}
          </Text>
          <Text testID="wg-word-power" allowFontScaling={false} style={[labelAt(text.label), styles.power]}>
            {say(copy.wordPower, { letters: state.letters, yards })}
          </Text>
          <LieLine hole={hole} view={view} copy={copy} text={text} />
          {note ? (
            <Text allowFontScaling={false} style={[p, styles.note]}>
              {note}
            </Text>
          ) : null}
          {windOf(hole, state.turn) ? (
            <Text testID="wg-wind-note" allowFontScaling={false} style={[p, styles.dim]}>
              {copy.windNote}
            </Text>
          ) : null}
          <View style={[styles.targets, row && styles.targetsRow]}>
            {targetsOf(hole, state).map((t) => (
              <TargetCard key={t.id} target={t} toFlag={t.kind === 'green' ? null : toPin(hole, t.at)} copy={copy} text={text} height={big} grow={row} onPress={() => on.chooseTarget(t.id)} />
            ))}
          </View>
        </Card>
      );
    }
    case 'flight':
      return (
        <Pressable testID="wg-panel-flight" onPress={on.skip} accessibilityRole="button" accessibilityLabel={copy.swing} style={[styles.panel, styles.content, { left: box.x, top: box.y, width: box.width, height: area ? Math.min(box.height, 180) : box.height }, area ? { top: box.y + box.height - Math.min(box.height, 180) } : null]}>
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {copy.swing}
          </Text>
          {state.report ? (
            <Text allowFontScaling={false} style={[readingAt(Math.max(text.question, 32), 'question'), styles.word]}>
              {state.report.word}
            </Text>
          ) : null}
        </Pressable>
      );
    case 'result': {
      const r = state.report;
      if (!r) return null;
      const w = shotWords(r, copy);
      const more = state.turn < hole.turns.length;
      return (
        <Card box={box} area={area} testID="wg-panel-result">
          <Text testID="wg-shot-name" accessibilityRole="header" accessibilityLiveRegion="polite" allowFontScaling={false} style={[q, r.golden ? styles.golden : styles.ink]}>
            {w.name}
          </Text>
          <Text allowFontScaling={false} style={[readingAt(Math.max(text.question, 32), 'question'), styles.word]}>
            {r.word}
          </Text>
          {w.where ? (
            <Text testID="wg-shot-where" allowFontScaling={false} style={[p, styles.ink]}>
              {w.where}
            </Text>
          ) : null}
          <Text testID="wg-shot-why" allowFontScaling={false} style={[p, styles.dim]}>
            {w.why}
          </Text>
          {w.lie ? (
            <Text testID="wg-shot-lie" allowFontScaling={false} style={[p, styles.note]}>
              {w.lie}
            </Text>
          ) : null}
          {w.family ? (
            <Text testID="wg-family" allowFontScaling={false} style={[p, styles.note]}>
              {w.family}
            </Text>
          ) : null}
          {more ? <LieLine hole={hole} view={view} copy={copy} text={text} /> : null}
          <GolfButton testID="wg-carry-on" label={more ? copy.nextShot : copy.targetGreen} glyph="right" kind="primary" onPress={on.carryOn} size={text.label} height={big} style={styles.wide} />
        </Card>
      );
    }
    default:
      return null;
  }
});

/**
 * A target to pick: its mark (the ring or the diamond the map shows), its name, what it needs, and
 * how far it leaves the ball from the flag (D199: a shorter approach finishes nearer the pin, so the
 * bold one's smaller number is its reward).
 */
function TargetCard({ target, toFlag, copy, text, height, grow, onPress }: { target: Target; toFlag: number | null; copy: WgCopy; text: TextSizes; height: number; grow: boolean; onPress: () => void }) {
  const name = targetName(target, copy);
  const note = targetNote(target, copy);
  const then = toFlag !== null ? say(copy.thenToPin, { yards: toFlag }) : null;
  const bold = target.kind === 'bold';
  return (
    <Pressable testID={`wg-target-${target.id}`} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}. ${note}${then ? ` ${then}` : ''}`} hitSlop={4} style={({ pressed }) => [styles.target, { minHeight: height }, grow && styles.flex, bold ? styles.targetBold : styles.targetSafe, pressed && styles.pressed]}>
      <View style={[styles.mark, bold ? styles.markBold : styles.markSafe]} />
      <View style={[styles.flex, styles.cardText]}>
        <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.ink]}>
          {name}
        </Text>
        <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
          {note}
        </Text>
        {then ? (
          <Text testID={`wg-then-${target.id}`} allowFontScaling={false} style={[labelAt(text.label), bold ? styles.golden : styles.dim]}>
            {then}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** On the spelling card: the word's power and the shot it is for, and CHANGE SHOT when there is a choice. */
export function ShotHeader({ view, copy, text, onChange }: { view: WordGolfView; copy: WgCopy; text: TextSizes; onChange: () => void }) {
  const { state, hole } = view;
  const t = targetOf(hole, state);
  const many = targetsOf(hole, state).length > 1;
  return (
    <View testID="wg-shot-header" style={styles.header}>
      <View style={[styles.flex, styles.lieRow]}>
        {t ? (
          <Text testID="wg-shot-target" allowFontScaling={false} style={[labelAt(text.label), styles.chip, t.kind === 'bold' ? styles.golden : styles.ink]}>
            {targetName(t, copy)}
          </Text>
        ) : null}
        <Text testID="wg-word-power" allowFontScaling={false} style={[labelAt(text.label), styles.power]}>
          {say(copy.wordPower, { letters: state.letters, yards: carryFor(state.letters) })}
        </Text>
      </View>
      {many ? <GolfButton testID="wg-change-shot" label={copy.changeShot} kind="quiet" onPress={onChange} size={text.label} /> : null}
    </View>
  );
}

/** In the hole: the par flavour, the shots, the words; then where to go next. */
export function SunkCard({ box, area, view, copy, text, control, onPlay, onHoles, onBack, leaving }: { box: Box; area?: Box | undefined; view: WordGolfView; copy: WgCopy; text: TextSizes; control: number; onPlay?: ((missionId: string) => void) | undefined; onHoles?: (() => void) | undefined; onBack: () => void; leaving: boolean }) {
  const { state, hole } = view;
  const next = holeAfter(hole.mission);
  const flavour = parName(state.strokes, hole.par);
  const title = flavour === 'eagle' ? copy.eagle : flavour === 'birdie' ? copy.birdie : flavour === 'par' ? copy.parDone : copy.holed;
  // The Tower Cup: the last hole holed with every hole of the course finished.
  const cup = !next && view.finished && HOLES.every((h) => view.done.includes(h.mission));
  const big = Math.max(72, control);
  return (
    <Card box={box} area={area} testID="wg-panel-sunk">
      {cup ? (
        <Text testID="wg-tower-cup" accessibilityRole="header" allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.golden]}>
          {copy.towerCup}
        </Text>
      ) : null}
      <Text accessibilityRole={cup ? undefined : 'header'} accessibilityLiveRegion="polite" allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.ink]}>
        {title}
      </Text>
      <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
        {cup ? copy.courseDone : say(copy.holeDone, { hole: hole.number })}
      </Text>
      <View style={styles.lieRow}>
        <Text testID="wg-strokes" allowFontScaling={false} style={[labelAt(text.label), styles.chip]}>
          {say(copy.strokes, { n: state.strokes })}
        </Text>
        <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim]}>
          {say(copy.par, { par: hole.par })}
        </Text>
      </View>
      {state.words.length > 0 ? (
        <View style={styles.words}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim, styles.center]}>
            {copy.wordsLabel}
          </Text>
          <Text testID="wg-words" allowFontScaling={false} style={[readingAt(Math.max(text.question, 28), 'question'), styles.word, styles.center]}>
            {state.words.join('   ')}
          </Text>
        </View>
      ) : null}
      {onPlay && next ? <GolfButton testID="wg-next-hole" label={copy.nextHole} glyph="right" kind="primary" onPress={() => onPlay(next.mission)} size={text.label} height={big} style={styles.wide} disabled={leaving} /> : null}
      {onPlay ? <GolfButton testID="wg-again" label={copy.playAgain} kind={next ? 'plain' : 'primary'} onPress={() => onPlay(hole.mission)} size={text.label} height={next ? undefined : big} style={styles.wide} disabled={leaving} /> : null}
      {onHoles ? <GolfButton testID="wg-holes" label={copy.holesLabel} kind="quiet" onPress={onHoles} size={text.label} style={styles.wide} disabled={leaving} /> : null}
      {!onPlay ? <GolfButton testID="wg-done-back" label={copy.back} glyph="back" kind="primary" onPress={onBack} size={text.label} height={big} style={styles.wide} disabled={leaving} /> : null}
    </Card>
  );
}

/** Every hole: finished ones replay (with the fewest shots), the next one opens, the rest wait in order. */
export function HoleMap({ box, view, copy, text, onPlay, onClose }: { box: Box; view: WordGolfView; copy: WgCopy; text: TextSizes; onPlay: (missionId: string) => void; onClose: () => void }) {
  const open = openHoles(view.done);
  const wide = box.width >= 560;
  return (
    <Card box={box} testID="wg-hole-map">
      <View style={styles.mapTitle}>
        <Text accessibilityRole="header" allowFontScaling={false} style={[labelAt(text.label + 2), styles.ink, styles.flex]}>
          {copy.courseTitle}
        </Text>
        <GolfButton testID="wg-map-close" label={copy.close} kind="quiet" onPress={onClose} size={text.label} />
      </View>
      <View style={styles.grid}>
        {HOLES.map((h) => {
          const done = view.done.includes(h.mission);
          const here = h.mission === view.hole.mission;
          const locked = !open.has(h.mission);
          const tile = say(copy.holeTile, { n: h.number });
          const best = view.best[h.id];
          const label = locked ? `${tile}, ${copy.locked}` : done ? `${tile}, ${h.name}, ${copy.done}` : `${tile}, ${h.name}`;
          return (
            <Pressable key={h.id} testID={`wg-map-${h.number}`} onPress={() => onPlay(h.mission)} disabled={locked} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: locked, selected: here }} style={({ pressed }) => [styles.tile, { width: wide ? '31%' : '47%' }, done && styles.tileDone, here && styles.tileHere, locked && styles.tileLocked, pressed && !locked && styles.pressed]}>
              <Text allowFontScaling={false} style={[labelAt(text.label), locked ? styles.dim : styles.ink]}>
                {done ? `✓ ${tile}` : tile}
              </Text>
              <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(text.label), locked ? styles.dim : styles.tileName]}>
                {locked ? copy.locked : h.name}
              </Text>
              {done && best !== undefined ? (
                <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim]}>
                  {say(copy.best, { n: best })}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', backgroundColor: INK.card, borderRadius: 18, borderWidth: 2, borderColor: INK.cardEdge, overflow: 'hidden' },
  content: { padding: PAD, gap: 12 },
  ink: { color: INK.text },
  dim: { color: INK.dim },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch', marginTop: 4 },
  power: { color: INK.accentLabel },
  golden: { color: INK.accentLabel },
  word: { color: INK.accentLabel, letterSpacing: 3, fontWeight: '900', textTransform: 'uppercase' },
  cardText: { gap: 2 },
  note: { color: INK.text, paddingLeft: 12, borderLeftWidth: 5, borderLeftColor: INK.accent },
  lieRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  chip: { color: INK.text, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: INK.plate, overflow: 'hidden' },
  targets: { gap: 10 },
  targetsRow: { flexDirection: 'row', alignItems: 'stretch' },
  target: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 2, borderBottomWidth: 6, backgroundColor: INK.tile.base },
  targetSafe: { borderColor: INK.tile.light, borderBottomColor: INK.tile.shadow },
  targetBold: { borderColor: INK.amber.light, borderBottomColor: INK.amber.shadow },
  mark: { width: 26, height: 26, borderRadius: 13, borderWidth: 4 },
  markSafe: { borderColor: INK.text },
  markBold: { borderColor: INK.accent, backgroundColor: INK.amber.shadow },
  pressed: { transform: [{ translateY: 3 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: INK.cardEdge },
  words: { gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: INK.plate },
  mapTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { minHeight: 88, padding: 10, gap: 4, borderRadius: 14, backgroundColor: INK.tile.base, borderWidth: 2, borderColor: INK.tile.light, borderBottomWidth: 5, borderBottomColor: INK.tile.shadow },
  tileDone: { borderColor: INK.accent },
  tileHere: { borderColor: INK.accentLabel, borderWidth: 3 },
  tileLocked: { backgroundColor: INK.plate, borderColor: INK.steel.base, borderBottomColor: INK.steel.base, borderStyle: 'dashed' },
  tileName: { color: INK.text, textTransform: 'none', letterSpacing: 0 },
});
