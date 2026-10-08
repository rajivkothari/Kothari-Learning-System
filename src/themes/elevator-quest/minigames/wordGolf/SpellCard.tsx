// The spelling card: what to do, the clue (a sentence with a gap and a meaning, never the word),
// HEAR IT AGAIN, help, then the work area: a line after a check, the answer slots, the letter tiles
// and UNDO / CLEAR / CHECK. Native views on a solid card: every word is real text a screen reader reads.
//
// The work area never scrolls away: only the words above it scroll when a window is too small for
// them (with a still "more" arrow), so the tiles and CHECK are always in reach. In portrait the card
// rises from the foot of the screen only as tall as its words need, leaving the flag end in view.
//
// A tile tapped goes to the first empty slot; a slot tapped gives its letter back. After CHECK, a
// word that is not right yet stays where it is with a plain line and the likely cause the session
// named (the theme never compares letters with the answer); nothing is red, nothing buzzes or shakes.
import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { HelpButton } from '../../ui/Hud';
import { MARKED, readingAt } from '../../ui/palette';
import { MoreCue, useScrollMore } from '../../ui/ScrollMore';
import type { TextSizes } from '../../ui/textRoles';
import type { Box } from '../../ui/layout';
import { splitBlank } from './clues';
import { say } from './course';
import type { WgCopy } from './copy';
import type { WordGolfView } from './controller';
import { isUsed, slotLetter } from './tiles';
import { INK } from './look';
import { GolfButton } from './parts';
import { MIN_TARGET, slotSize } from './layout';

export interface SpellHandlers {
  place(tileId: number): void;
  takeBack(slot: number): void;
  undo(): void;
  clear(): void;
  check(): void;
  help(): void;
  hear(): void;
}

const PAD = 16;
const GAP = 12;

export const SpellCard = memo(function SpellCard({ box, anchor, view, copy, text, tile, gap, reducedMotion, on }: { box: Box; anchor: 'fill' | 'bottom'; view: WordGolfView; copy: WgCopy; text: TextSizes; tile: number; gap: number; reducedMotion: boolean; on: SpellHandlers }) {
  const { state, item, clue, busy, canHear, freshWord } = view;
  const [readH, setReadH] = useState(0);
  const [workH, setWorkH] = useState(0);
  const scroll = useScrollMore();
  const { onContentSizeChange } = scroll.props;
  const onRead = useCallback(
    (w: number, h: number) => {
      onContentSizeChange(w, h);
      setReadH(h);
    },
    [onContentSizeChange],
  );
  const onWork = useCallback((e: LayoutChangeEvent) => setWorkH(e.nativeEvent.layout.height), []);
  const tray = state.tray;
  if (!tray || !item) return null;
  const inner = box.width - PAD * 2;
  const slot = slotSize(inner, tray.slots.length, tile, gap);
  const blank = clue?.blank ? splitBlank(clue.blank) : null;
  // Ghost letters (help): the pattern's letters where it sits, or the whole word after SHOW ME.
  const shownWord = state.hints.find((h) => h.kind === 'show');
  const pattern = state.hints.find((h) => h.kind === 'pattern');
  const ghost = (i: number): string | null => {
    if (shownWord?.kind === 'show') return shownWord.word[i] ?? null;
    if (pattern?.kind === 'pattern' && pattern.at !== null) {
      const ch = pattern.pattern[i - pattern.at];
      return ch && ch !== '_' ? ch : null;
    }
    return null;
  };
  const cause = state.feedback ? copy.causeLine(state.feedback.cause) : null;
  const full = tray.slots.every((s) => s !== null);
  const letterSize = Math.round(tile * 0.5);
  const slotLetterSize = Math.max(22, Math.round(slot * 0.5));
  const helpLabel = item.help ? copy.helpLabel(item.help.helpKind) : copy.help;
  // Portrait: as tall as the words need (measured), never taller than the area; until measured, the whole area.
  const want = readH > 0 && workH > 0 ? PAD + readH + workH + 4 : box.height;
  const height = anchor === 'bottom' ? Math.min(box.height, want) : box.height;
  const top = anchor === 'bottom' ? box.y + box.height - height : box.y;

  return (
    <View testID="wg-spell-card" style={[styles.card, { left: box.x, top, width: box.width, height }]}>
      <View style={styles.reading}>
        <ScrollView {...scroll.props} onContentSizeChange={onRead} contentContainerStyle={styles.content}>
          <View style={styles.headRow}>
            <Text accessibilityRole="header" allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.ink, styles.flex]}>
              {copy.spellPrompt}
            </Text>
            {item.help ? <HelpButton label={helpLabel} offered={item.help.offered} disabled={busy} still={reducedMotion} onPress={on.help} width={112} /> : null}
          </View>
          {freshWord ? (
            <Text allowFontScaling={false} style={[readingAt(text.passage), styles.dim]}>
              {copy.freshWord}
            </Text>
          ) : null}
          {clue?.blank ? (
            <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]} accessibilityLabel={clue.blank.replace(/_+/g, `, ${copy.blankSpoken}, `)}>
              {blank ? (
                <>
                  {blank.before}
                  <Text style={styles.gap}>{'   '}</Text>
                  {blank.after}
                </>
              ) : (
                clue.blank
              )}
            </Text>
          ) : null}
          {clue?.meaning ? (
            <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
              <Text style={styles.strong}>{copy.meaningLabel}: </Text>
              {clue.meaning}
            </Text>
          ) : null}
          {canHear ? (
            <View style={styles.row}>
              <GolfButton testID="wg-hear" label={copy.hearIt} glyph="speaker" onPress={on.hear} size={text.label} hint={copy.hearItHint} />
            </View>
          ) : null}
          {state.hints.map((h) =>
            h.kind === 'show' ? null : (
              <View key={h.kind} style={styles.hint}>
                {h.line ? (
                  <Text allowFontScaling={false} style={[readingAt(text.passage), styles.dim]}>
                    {h.line}
                  </Text>
                ) : null}
                <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
                  {h.kind === 'replay' ? copy.replayLine : h.kind === 'phonics' ? h.text : (
                    <>
                      {say(copy.pattern, { pattern: '' })}
                      <Text style={MARKED}>{h.pattern.replace(/_/g, ' _ ')}</Text>
                    </>
                  )}
                </Text>
              </View>
            ),
          )}
          {shownWord?.kind === 'show' ? (
            <View style={styles.hint} accessible accessibilityLabel={`${copy.modelLabel}: ${[...shownWord.word].join(' ')}`}>
              <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
                {shownWord.line ?? copy.modelLabel}
              </Text>
              <Text allowFontScaling={false} style={[readingAt(Math.max(text.question, 28), 'question'), styles.model]}>
                {shownWord.word}
              </Text>
            </View>
          ) : null}
        </ScrollView>
        <MoreCue visible={scroll.more} right={box.width / 2 - 16} />
      </View>

      <View testID="wg-work" onLayout={onWork} style={styles.work}>
        {state.feedback ? (
          <View testID="wg-feedback" accessibilityLiveRegion="polite" style={styles.feedback}>
            <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
              {copy.notYet}
            </Text>
            {cause ? (
              <Text allowFontScaling={false} style={[readingAt(text.passage), styles.ink]}>
                {cause}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View accessibilityLabel={copy.slotsLabel} style={[styles.slots, { gap }]}>
          {tray.slots.map((tileId, i) => {
            const letter = slotLetter(tray, i);
            const g = letter ? null : ghost(i);
            return (
              <View key={i} style={styles.slotWrap}>
                <Pressable
                  testID={`wg-slot-${i}`}
                  onPress={() => on.takeBack(i)}
                  disabled={tileId === null || busy}
                  accessibilityRole="button"
                  accessibilityLabel={letter ? say(copy.slotLabel, { n: i + 1, letter }) : say(copy.slotEmpty, { n: i + 1 })}
                  style={({ pressed }) => [styles.slot, { width: slot, height: Math.max(slot, 52) }, letter ? styles.slotFilled : null, pressed && styles.pressed]}
                >
                  {letter ? (
                    <Text allowFontScaling={false} style={[styles.letter, { fontSize: slotLetterSize, lineHeight: Math.round(slotLetterSize * 1.2) }]}>
                      {letter}
                    </Text>
                  ) : g ? (
                    <Text testID={`wg-ghost-${i}`} allowFontScaling={false} style={[styles.letter, styles.ghost, { fontSize: slotLetterSize, lineHeight: Math.round(slotLetterSize * 1.2) }]}>
                      {g}
                    </Text>
                  ) : (
                    <View style={styles.dash} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        <View accessibilityLabel={copy.tilesLabel} style={[styles.tiles, { gap }]}>
          {tray.tiles.map((t) => {
            const used = isUsed(tray, t.id);
            return (
              <Pressable
                key={t.id}
                testID={`wg-tile-${t.id}`}
                onPress={() => on.place(t.id)}
                disabled={used || busy || full}
                accessibilityRole="button"
                accessibilityLabel={say(copy.tileLabel, { letter: t.letter })}
                accessibilityState={{ disabled: used || busy || full }}
                style={({ pressed }) => [styles.tile, { width: tile, height: tile }, used ? styles.tileUsed : null, pressed && !used && styles.pressed]}
              >
                {used ? null : (
                  <Text allowFontScaling={false} style={[styles.letter, { fontSize: letterSize, lineHeight: Math.round(letterSize * 1.2) }]}>
                    {t.letter}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.row, styles.actions]}>
          <GolfButton testID="wg-undo" label={copy.undo} onPress={on.undo} size={text.label} disabled={busy || tray.order.length === 0} kind="quiet" />
          <GolfButton testID="wg-clear" label={copy.clear} onPress={on.clear} size={text.label} disabled={busy || tray.order.length === 0} kind="quiet" />
          <View style={styles.flex} />
          <GolfButton testID="wg-check" label={copy.check} glyph="right" onPress={on.check} size={text.label} disabled={busy || !full} kind="primary" width={Math.min(170, Math.max(120, inner * 0.32))} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { position: 'absolute', backgroundColor: INK.card, borderRadius: 18, borderWidth: 2, borderColor: INK.cardEdge, overflow: 'hidden', paddingBottom: PAD },
  reading: { flexShrink: 1, minHeight: 0 },
  content: { paddingHorizontal: PAD, paddingTop: PAD, gap: GAP },
  work: { paddingHorizontal: PAD, paddingTop: GAP, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  actions: { flexWrap: 'nowrap', marginTop: 2 },
  flex: { flex: 1 },
  ink: { color: INK.text },
  dim: { color: INK.dim },
  strong: { fontWeight: '800' },
  gap: { textDecorationLine: 'underline', textDecorationColor: INK.accent, fontWeight: '900', color: INK.accentLabel },
  feedback: { gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: INK.accent, backgroundColor: INK.plate },
  hint: { gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: INK.clue, backgroundColor: INK.plate },
  model: { color: INK.accentLabel, letterSpacing: 6, fontWeight: '900' },
  slots: { flexDirection: 'row', flexWrap: 'wrap' },
  slotWrap: { alignItems: 'center' },
  slot: { minWidth: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: INK.slot, borderWidth: 2, borderColor: INK.steel.base, borderStyle: 'dashed' },
  slotFilled: { borderStyle: 'solid', borderColor: INK.tile.light, backgroundColor: INK.tile.base },
  dash: { position: 'absolute', left: '27%', right: '27%', bottom: 10, height: 4, borderRadius: 2, backgroundColor: INK.steel.light },
  letter: { color: INK.text, fontWeight: '800', textAlign: 'center' },
  ghost: { color: INK.dim, opacity: 0.7, fontWeight: '600' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { minWidth: MIN_TARGET, minHeight: MIN_TARGET, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: INK.tile.base, borderWidth: 2, borderColor: INK.tile.light, borderBottomWidth: 6, borderBottomColor: INK.tile.shadow },
  tileUsed: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: INK.steel.base, borderBottomWidth: 2, borderBottomColor: INK.steel.base },
  pressed: { transform: [{ translateY: 3 }] },
});
