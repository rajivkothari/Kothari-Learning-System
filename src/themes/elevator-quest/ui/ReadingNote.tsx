// A reading job's controls besides the note itself (M8): the cards it is answered with, and the
// small note button that opens the folded note again (on the cards' sheet, or on the cabin wall at
// readingCardLayout.noteButtonBox when the landing or the panel is the answer). The note is a ReadingCard.
// M8.1: the question over the cards at the question size, the cards' words at the choice size, and
// the sheet scrolls in a short box, so no card is ever cut off.
//
// Cards: one per option, named as the note names it, at least 64 pt tall, inside the reading card
// box (ui/readingCardLayout.ts: never over the panel, the door buttons, the help button, NEXT JOB
// or Lifty). A card job, or a touch job whose landing cannot offer its things (ui/readingSurface.ts),
// is answered here with the same option ids and commands as a touch. A press shows at once; the
// card stays lit, like a floor button, while the answer is checked. Nothing on a card says right or
// wrong before the job does. While the job takes no answer the cards are locked. After SHOW ME the
// card shown glows (a cyan ring and a soft fill, steady) and the others step back: only it can be
// chosen now.
import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ReadingView } from '../director/director';
import type { Mark } from './emphasis';
import type { Box } from './layout';
import { TEXT_FLOOR, TOKENS as T, eq, readingAt, type TextSizes } from './palette';
import { Marked } from './ReadingCard';
import { MoreCue, useScrollMore } from './ScrollMore';
import { CHOICE, SHEET_PAD, choiceColumns } from './readingCardLayout';

/** The cards' sheet never grows wider than this (short phrases read best in a compact block). */
const SHEET_WIDTH = 680;
const PAD = SHEET_PAD;
const BORDER = 2;

export interface ReadingChoicesProps {
  box: Box;
  /** The job's instruction, over the cards: the biggest words on the sheet. */
  ask: string;
  /** Words to mark in the instruction (ReadingView.askMarks). */
  askMarks?: readonly Mark[];
  /** The window's reading sizes (GameLayout.text). */
  text?: TextSizes;

  /** What the cards are, for a screen reader (the group's name). */
  groupLabel: string;
  options: ReadingView['options'];
  /** The job takes an answer now. Otherwise every card is locked. */
  accepting: boolean;
  onChoose: (value: string) => void;
  /** The folded note's button, on the sheet beside the instruction. */
  noteLabel: string;
  onOpenNote: () => void;
}

export const ReadingChoices = memo(function ReadingChoices({ box, ask, askMarks, groupLabel, options, accepting, onChoose, noteLabel, onOpenNote, text = TEXT_FLOOR }: ReadingChoicesProps) {
  const sheet = Math.min(box.width, SHEET_WIDTH);
  const columns = choiceColumns({ width: sheet, height: box.height }, options.length, text);
  const inner = sheet - PAD * 2 - BORDER * 2;
  const cardWidth = Math.max(CHOICE.minHeight, Math.floor((inner - CHOICE.gap * (columns - 1)) / columns));
  const shownAny = options.some((o) => o.shown);
  // The card pressed stays lit while its answer is checked. A second press before the screen catches
  // up is the director's to ignore, and it never moves the light. Taking answers again (a new window,
  // or a press that was not taken) clears it.
  const [chosen, setChosen] = useState<string | null>(null);
  const sheetScroll = useScrollMore();
  if (accepting && chosen !== null) setChosen(null);
  return (
    <View testID="reading-choices" pointerEvents="box-none" style={[styles.area, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      {/* The sheet never grows past its box; what does not fit scrolls, so every card stays reachable. */}
      <View style={[styles.sheet, { width: sheet, maxHeight: box.height }]}>
        <ScrollView testID="reading-choices-scroll" style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator persistentScrollbar {...sheetScroll.props}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.ask]} accessibilityRole="header">
              <Marked text={ask} marks={askMarks} />
            </Text>
            <NoteButton label={noteLabel} onPress={onOpenNote} />
          </View>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
            {options.map((o) => {
              const disabled = !accepting || (shownAny && !o.shown);
              const lit = chosen === o.value && !accepting;
              return (
                <Pressable
                  key={o.optionId}
                  testID={`reading-choice-${o.value}`}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  accessibilityState={{ disabled, selected: lit }}
                  disabled={disabled}
                  onPress={() => {
                    setChosen((c) => c ?? o.value);
                    onChoose(o.value);
                  }}
                  style={({ pressed }) => [styles.card, { width: columns === 1 ? inner : cardWidth }, lit && styles.lit, o.shown && styles.shown, shownAny && !o.shown && styles.stepBack, pressed && styles.pressed]}
                >
                  <Text allowFontScaling={false} style={[readingAt(text.choice, 'choice'), styles.cardText, lit && styles.litText]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <MoreCue visible={sheetScroll.more} />
      </View>
    </View>
  );
});

/**
 * The folded note: a small copy of the note's sheet, 64 pt to touch. It opens the note again.
 * `box`: where it stands on screen (readingCardLayout.noteButtonBox); without one it sits in its row.
 */
export function NoteButton({ label, onPress, box }: { label: string; onPress: () => void; box?: Box }) {
  return (
    <Pressable
      testID="reading-note-open"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.noteButton, box && { position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height }, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={styles.paper}>
        <View style={styles.paperTitle} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.paperLine, i === 2 && styles.paperLineShort]} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
  // The same solid sheet as the note: the words never sit on the art.
  sheet: { borderRadius: T.radius.md, padding: PAD, backgroundColor: eq.charcoal, borderWidth: BORDER, borderColor: eq.steelEdge },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { gap: T.space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  ask: { color: eq.text, fontWeight: '800', flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CHOICE.gap },
  // A card is a physical tab: a lighter top edge, a darker lip, the words in the reading face.
  card: {
    minHeight: CHOICE.minHeight,
    minWidth: T.minTouchTarget,
    borderRadius: T.radius.md,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    justifyContent: 'center',
    backgroundColor: eq.charcoalLight,
    borderWidth: 2,
    borderColor: eq.steelLight,
    borderBottomWidth: 4,
    borderBottomColor: eq.steelDark,
  },
  cardText: { color: eq.text },
  // Chosen: lit like a selected floor button (amber lamp), while the answer is checked. Not a verdict.
  lit: { backgroundColor: T.state.selected.face, borderColor: T.state.selected.ring },
  litText: { color: T.state.selected.label },
  // SHOW ME: the shown card glows. A thick cyan ring (shape, not colour alone) and a soft fill, steady.
  shown: { borderColor: eq.clue, borderWidth: T.state.clue.widthPx + 1, borderBottomWidth: T.state.clue.widthPx + 1, backgroundColor: eq.deepBlue },
  stepBack: { opacity: T.state.disabled.opacity },
  pressed: { transform: [{ scale: T.state.pressed.scale }] },
  noteButton: { width: T.minTouchTarget, height: T.minTouchTarget, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.steelLight },
  // A small copy of the note: a sheet with its amber title and a few lines.
  paper: { width: 32, height: 40, borderRadius: 4, padding: 5, gap: 4, backgroundColor: eq.charcoalLight, borderWidth: 1, borderColor: eq.steelEdge },
  paperTitle: { height: 4, width: 16, borderRadius: 2, backgroundColor: eq.amber },
  paperLine: { height: 3, borderRadius: 1.5, backgroundColor: eq.text, opacity: 0.85 },
  paperLineShort: { width: 12 },
});
