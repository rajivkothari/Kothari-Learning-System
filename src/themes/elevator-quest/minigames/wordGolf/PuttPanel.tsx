// The panel beside (or under) the course: the hole's intro, the earned putt, the putting controls,
// and the in-the-cup card. One primary action at a time, always a big button with a word.
//
// Putting is touch only, no timing: turn the aim with two big arrows (or touch the green where the
// ball should go), set the power with the meter (drag it, or - and +), then PUTT. Nothing moves until
// PUTT, so there is no pressure to be quick.
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { readingAt, labelAt } from '../../ui/palette';
import { MoreCue, useScrollMore } from '../../ui/ScrollMore';
import type { TextSizes } from '../../ui/textRoles';
import type { Box } from '../../ui/layout';
import { say, type HoleSpec } from './course';
import { line, type WgCopy } from './copy';
import { aimOffset, type GolfState } from './game';
import { INK } from './look';
import { GolfButton, Glyph } from './parts';
import { POWER } from './physics';

export interface PuttHandlers {
  begin(): void;
  takeShot(): void;
  aimLeft(): void;
  aimRight(): void;
  morePower(): void;
  lessPower(): void;
  setPower(p: number): void;
  shoot(): void;
  nextHole(): void;
  moveCloser(): void;
}

const PAD = 16;

/** The aim, in words, for a screen reader (the drawn aim line shows it to everyone else). */
export function aimWords(state: Pick<GolfState, 'aim' | 'ball'>, hole: HoleSpec, copy: WgCopy): string {
  const d = aimOffset(state, hole.cup);
  if (Math.abs(d) < 2) return copy.aimValueOn;
  if (Math.abs(d) < 12) return d < 0 ? copy.aimValueLittleLeft : copy.aimValueLittleRight;
  return d < 0 ? copy.aimValueLeft : copy.aimValueRight;
}

export const PuttPanel = memo(function PuttPanel({ box, state, hole, copy, text, control, rows, tip = true, closer = false, on }: { box: Box; state: GolfState; hole: HoleSpec; copy: WgCopy; text: TextSizes; control: number; rows: 1 | 2; tip?: boolean; closer?: boolean; on: PuttHandlers }) {
  const scroll = useScrollMore();
  const inner = box.width - PAD * 2;
  const q = readingAt(text.question, 'question');
  const p = readingAt(text.passage);
  let body: ReactNode = null;
  switch (state.phase) {
    case 'intro':
      body = (
        <>
          {hole.number === 1 && !state.resumed ? (
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
          <Text allowFontScaling={false} style={[p, styles.ink]}>
            {hole.intro}
          </Text>
          <GolfButton testID="wg-begin" label={copy.start} glyph="right" kind="primary" onPress={on.begin} size={text.label} height={Math.max(72, control)} style={styles.wide} />
        </>
      );
      break;
    case 'earned':
      // NEXT HOLE leads straight to the word, so the hole is introduced here, just before its putt.
      body = (
        <>
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {state.resumed ? copy.resume : state.shown ? copy.earnedShown : copy.earned}
          </Text>
          <Text allowFontScaling={false} style={[p, styles.ink]}>
            <Text style={styles.strong}>{hole.name}. </Text>
            {hole.intro}
          </Text>
          <GolfButton testID="wg-take-shot" label={copy.takeShot} glyph="right" kind="primary" onPress={on.takeShot} size={text.label} height={Math.max(72, control)} style={styles.wide} />
        </>
      );
      break;
    case 'sunk':
      body = (
        <>
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {copy.sunk}
          </Text>
          <Text allowFontScaling={false} style={[p, styles.ink]}>
            {line(copy.holeDone, { hole: hole.number })}
          </Text>
          <GolfButton testID="wg-next-hole" label={copy.nextHole} glyph="right" kind="primary" onPress={on.nextHole} size={text.label} height={Math.max(72, control)} style={styles.wide} />
        </>
      );
      break;
    case 'aim':
    case 'rolling': {
      const rolling = state.phase === 'rolling';
      const note = state.resumed ? copy.resume : state.note ? copy[state.note] : null;
      const aimGroup = (
        <View style={styles.group}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.caption]}>
            {copy.aimLabel}
          </Text>
          <View style={styles.row}>
            <GolfButton testID="wg-aim-left" label="" glyph="left" a11yLabel={copy.aimLeft} value={aimWords(state, hole, copy)} onPress={on.aimLeft} size={text.label} width={control} height={control} disabled={rolling} />
            <GolfButton testID="wg-aim-right" label="" glyph="right" a11yLabel={copy.aimRight} value={aimWords(state, hole, copy)} onPress={on.aimRight} size={text.label} width={control} height={control} disabled={rolling} />
          </View>
        </View>
      );
      const putt = <GolfButton testID="wg-putt" label={copy.putt} glyph="play" kind="primary" onPress={on.shoot} size={Math.max(text.label, 18)} width={rows === 1 ? 150 : Math.min(200, Math.max(140, inner * 0.4))} height={Math.max(control, 72)} disabled={rolling} />;
      const powerGroup = (
        <View style={[styles.group, styles.flex]}>
          <Text allowFontScaling={false} style={[labelAt(text.label), styles.caption]}>
            {copy.power}
          </Text>
          <View style={styles.row}>
            <GolfButton testID="wg-power-down" label="" glyph="minus" a11yLabel={copy.lessPower} onPress={on.lessPower} size={text.label} width={control} height={control} disabled={rolling} />
            <PowerMeter power={state.power} last={state.lastPower} height={control} disabled={rolling} label={copy.power} value={say(copy.powerValue, { n: Math.round(state.power * 10) })} onSet={on.setPower} onMore={on.morePower} onLess={on.lessPower} />
            <GolfButton testID="wg-power-up" label="" glyph="plus" a11yLabel={copy.morePower} onPress={on.morePower} size={text.label} width={control} height={control} disabled={rolling} />
          </View>
        </View>
      );
      body = (
        <>
          <Text accessibilityRole="header" allowFontScaling={false} style={[q, styles.ink]}>
            {rolling ? copy.rolling : copy.aimPrompt}
          </Text>
          {note && !rolling ? (
            <Text testID="wg-note" accessibilityLiveRegion="polite" allowFontScaling={false} style={[p, styles.note]}>
              {note}
            </Text>
          ) : null}
          {rows === 1 ? (
            <View style={[styles.row, styles.controls]}>
              {aimGroup}
              {powerGroup}
              <View style={styles.puttCell}>{putt}</View>
            </View>
          ) : (
            <>
              <View style={[styles.row, styles.controls]}>
                {aimGroup}
                <View style={styles.flex} />
                <View style={styles.puttCell}>{putt}</View>
              </View>
              <View style={[styles.row, styles.controls]}>{powerGroup}</View>
            </>
          )}
          {closer && !rolling ? (
            <GolfButton testID="wg-move-closer" label={copy.moveCloser} glyph="right" kind="plain" onPress={on.moveCloser} size={text.label} height={Math.max(72, control)} hint={copy.moveCloserHint} style={styles.wide} />
          ) : null}
          {!rolling && tip && !closer ? (
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.dim, styles.tip]}>
              {copy.aimDrag}
            </Text>
          ) : null}
        </>
      );
      break;
    }
    default:
      body = null;
  }
  if (!body) return null;
  return (
    <View testID={`wg-panel-${state.phase}`} style={[styles.panel, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <ScrollView {...scroll.props} contentContainerStyle={styles.content}>
        {body}
      </ScrollView>
      <MoreCue visible={scroll.more} right={box.width / 2 - 16} />
    </View>
  );
});

/**
 * The power meter: a track of ten steps with the fill at the power, and a small mark where the last
 * putt's power was. Drag along it or touch a place on it; a screen reader adjusts it up and down.
 */
function PowerMeter({ power, last, height, disabled, label, value, onSet, onMore, onLess }: { power: number; last: number | null; height: number; disabled: boolean; label: string; value: string; onSet(p: number): void; onMore(): void; onLess(): void }) {
  const width = useRef(1);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.current = Math.max(1, e.nativeEvent.layout.width);
  }, []);
  const set = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      onSet(Math.min(POWER.max, Math.max(POWER.min, e.nativeEvent.locationX / width.current)));
    },
    [disabled, onSet],
  );
  return (
    <View
      testID="wg-power-meter"
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 10, now: Math.round(power * 10), text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onMore() : onLess())}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={set}
      onResponderMove={set}
      onResponderTerminationRequest={() => false}
      style={[styles.meter, { height }, disabled && styles.disabled]}
    >
      <View pointerEvents="none" style={[styles.fill, { width: `${Math.round(power * 100)}%` }]} />
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.step, { left: `${(i + 1) * 10}%` }]} />
      ))}
      {last !== null ? <View pointerEvents="none" style={[styles.last, { left: `${Math.round(last * 100)}%` }]} /> : null}
      <View pointerEvents="none" style={[styles.knob, { left: `${Math.round(power * 100)}%` }]}>
        <Glyph kind="up" dark />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', backgroundColor: INK.card, borderRadius: 18, borderWidth: 2, borderColor: INK.cardEdge, overflow: 'hidden' },
  content: { padding: PAD, gap: 12 },
  ink: { color: INK.text },
  strong: { fontWeight: '800' },
  dim: { color: INK.dim },
  note: { color: INK.text, paddingLeft: 12, borderLeftWidth: 5, borderLeftColor: INK.accent },
  tip: { textTransform: 'none', letterSpacing: 0 },
  wide: { alignSelf: 'stretch', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controls: { alignItems: 'flex-end', gap: 16 },
  group: { gap: 4 },
  flex: { flex: 1 },
  caption: { color: INK.dim },
  puttCell: { justifyContent: 'flex-end' },
  meter: { flex: 1, minWidth: 120, borderRadius: 14, backgroundColor: INK.slot, borderWidth: 2, borderColor: INK.steel.base, overflow: 'hidden', justifyContent: 'center' },
  disabled: { opacity: 0.38 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: INK.amber.base, borderRightWidth: 3, borderRightColor: INK.amber.light },
  step: { position: 'absolute', top: '30%', bottom: '30%', width: 2, marginLeft: -1, backgroundColor: INK.steel.shadow, opacity: 0.8 },
  last: { position: 'absolute', top: 0, bottom: 0, width: 0, marginLeft: -1, borderLeftWidth: 3, borderStyle: 'dashed', borderLeftColor: INK.text },
  knob: { position: 'absolute', bottom: 4, marginLeft: -9 },
});
