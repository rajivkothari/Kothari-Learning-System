// The putting controls (D197), beside (or under) the green once the last word has put the ball on it.
// One primary action at a time, always a big button with a word.
//
// Putting is touch only, no timing: turn the aim with two big arrows (or touch the green where the
// ball should go), set the power with the meter (drag it, or - and +), then PUTT. Nothing moves until
// PUTT, so there is no pressure to be quick. Putting is play: it never reaches the evidence, and a
// putt that misses never asks for a word again.
import { memo, useCallback, useRef, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { readingAt, labelAt } from '../../ui/palette';
import { MoreCue, useScrollMore } from '../../ui/ScrollMore';
import type { TextSizes } from '../../ui/textRoles';
import type { Box } from '../../ui/layout';
import { say } from './course';
import type { WgCopy } from './copy';
import { NO_DRAG, type DragStore } from './drag';
import { aimOffset, powerOf, type Putting } from './game';
import { INK } from './look';
import { GolfButton, Glyph } from './parts';
import { POWER, type Vec } from './physics';

export interface PuttHandlers {
  aimLeft(): void;
  aimRight(): void;
  morePower(): void;
  lessPower(): void;
  setPower(p: number): void;
  shoot(): void;
  moveCloser(): void;
}

const PAD = 16;

/** The aim, in words, for a screen reader (the drawn aim line shows it to everyone else). */
export function aimWords(p: Pick<Putting, 'aim' | 'ball'>, cup: Vec, copy: WgCopy): string {
  const d = aimOffset(p, cup);
  if (Math.abs(d) < 2) return copy.aimValueOn;
  if (Math.abs(d) < 12) return d < 0 ? copy.aimValueLittleLeft : copy.aimValueLittleRight;
  return d < 0 ? copy.aimValueLeft : copy.aimValueRight;
}

export const PuttPanel = memo(function PuttPanel({ box, putting, cup, rolling, resumed = false, copy, text, control, rows, tip = true, closer = false, on, drag = NO_DRAG }: { box: Box; putting: Putting; cup: Vec; rolling: boolean; resumed?: boolean; copy: WgCopy; text: TextSizes; control: number; rows: 1 | 2; tip?: boolean; closer?: boolean; on: PuttHandlers; drag?: DragStore }) {
  const scroll = useScrollMore();
  const inner = box.width - PAD * 2;
  const q = readingAt(text.question, 'question');
  const p = readingAt(text.passage);
  const note = resumed ? copy.resume : putting.note ? copy[putting.note] : null;
  const aimValue = aimWords(putting, cup, copy);
  const aimGroup = (
    <View style={styles.group}>
      <Text allowFontScaling={false} style={[labelAt(text.label), styles.caption]}>
        {copy.aimLabel}
      </Text>
      <View style={styles.row}>
        <GolfButton testID="wg-aim-left" label="" glyph="left" a11yLabel={copy.aimLeft} value={aimValue} onPress={on.aimLeft} size={text.label} width={control} height={control} disabled={rolling} />
        <GolfButton testID="wg-aim-right" label="" glyph="right" a11yLabel={copy.aimRight} value={aimValue} onPress={on.aimRight} size={text.label} width={control} height={control} disabled={rolling} />
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
        <PowerMeter power={putting.power} drag={drag} last={putting.lastPower} height={control} disabled={rolling} label={copy.power} value={say(copy.powerValue, { n: Math.round(putting.power * 10) })} onSet={on.setPower} onMore={on.morePower} onLess={on.lessPower} />
        <GolfButton testID="wg-power-up" label="" glyph="plus" a11yLabel={copy.morePower} onPress={on.morePower} size={text.label} width={control} height={control} disabled={rolling} />
      </View>
    </View>
  );
  return (
    <View testID={`wg-panel-${rolling ? 'rolling' : 'aim'}`} style={[styles.panel, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <ScrollView {...scroll.props} contentContainerStyle={styles.content}>
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
      </ScrollView>
      <MoreCue visible={scroll.more} right={box.width / 2 - 16} />
    </View>
  );
});

/**
 * The power meter: a track of ten steps with the fill at the power, and a small mark where the last
 * putt's power was. Drag along it or touch a place on it; a screen reader adjusts it up and down.
 * While a finger drags, the fill and the knob follow the drag (drag.ts: only the meter re-renders);
 * the power reaches the game when the finger lifts.
 */
function PowerMeter({ power: given, drag, last, height, disabled, label, value, onSet, onMore, onLess }: { power: number; drag: DragStore; last: number | null; height: number; disabled: boolean; label: string; value: string; onSet(p: number): void; onMore(): void; onLess(): void }) {
  const width = useRef(1);
  const dragged = useRef<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.current = Math.max(1, e.nativeEvent.layout.width);
  }, []);
  const set = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      dragged.current = powerOf(Math.min(POWER.max, Math.max(POWER.min, e.nativeEvent.locationX / width.current)));
      drag.set({ power: dragged.current });
    },
    [disabled, drag],
  );
  const done = useCallback(() => {
    const p = dragged.current;
    dragged.current = null;
    if (p !== null && !disabled) onSet(p);
  }, [disabled, onSet]);
  const power = useSyncExternalStore(drag.subscribe, drag.get, drag.get).power ?? given;
  // The committed power, in steps of ten. React Native Web drops accessibilityValue, so the browser
  // gets the same numbers as aria-value* (the slider's min, max, now and words); native reads both.
  const now = Math.round(given * 10);
  return (
    <View
      testID="wg-power-meter"
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 10, now, text: value }}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={now}
      aria-valuetext={value}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onMore() : onLess())}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={set}
      onResponderMove={set}
      onResponderRelease={done}
      onResponderTerminate={done}
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
