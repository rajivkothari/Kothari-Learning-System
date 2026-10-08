// A short readable card: a page the learner reads in the world (the Archive's book, and a reading
// job's note). A few sentences in the reading face at a child-readable size, high contrast on a solid
// paper (never over the art), one optional highlighted sentence (a clue), an optional instruction
// under the text, and a full-size way out beside the title. It draws inside the box it is given
// (ui/readingCardLayout.ts keeps that clear of the panel, the door buttons, the help button and
// Lifty), and scrolls if it must.
//
// Generic on purpose: a title, the lines, an optional highlight, an optional instruction and an
// optional close. It knows nothing about floors, jobs or answers. The words come from content/themes
// (never from here).
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Box } from './layout';
import { READING, TOKENS as T, UI, eq } from './palette';

export interface ReadingCardProps {
  /** Where the card may draw (it takes what it needs, centred, up to a comfortable reading width). */
  box: Box;
  title: string;
  /** The sentences, one per line. */
  lines: readonly string[];
  /** A sentence to mark (a clue): its index in `lines`. Marked by a bar and weight, never by colour alone. */
  highlight?: number | null;
  /** What to do about the text (a reading job's instruction), under the sentences. */
  ask?: string | null;
  /** Shown as a full-size button; without it the card cannot be put away (its owner decides). */
  closeLabel?: string;
  onClose?: () => void;
  testID?: string;
}

/** The reading width that keeps a line comfortable (about 40 characters at the reading size). */
export const READING_WIDTH = 460;
/** Smaller than this, the reading size steps down once (never below 17 pt). */
const NARROW = 300;

export const ReadingCard = memo(function ReadingCard({ box, title, lines, highlight = null, ask = null, closeLabel, onClose, testID = 'reading-card' }: ReadingCardProps) {
  const width = Math.min(box.width, READING_WIDTH);
  const scale = width < NARROW ? 0.85 : 1;
  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.area, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <View style={[styles.card, { width, maxHeight: box.height }]} accessibilityRole="summary" accessibilityLabel={title}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {onClose && closeLabel ? (
            <Pressable testID={`${testID}-close`} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={6} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Text allowFontScaling={false} style={styles.closeText}>
                {closeLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
          {lines.map((line, i) => {
            const marked = i === highlight;
            return (
              <View key={i} style={[styles.line, marked && styles.lineMarked]} accessible accessibilityLabel={marked ? `Clue: ${line}` : line}>
                <Text style={[READING(scale), styles.text, marked && styles.textMarked]}>{line}</Text>
              </View>
            );
          })}
          {ask ? (
            <View style={styles.ask} accessible accessibilityLabel={ask}>
              <Text style={[READING(scale), styles.askText]}>{ask}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  area: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
  // A sheet of paper from the building's kit: solid, so the words never sit on the art.
  card: { borderRadius: T.radius.md, padding: T.space.md, gap: T.space.sm, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.steelEdge },
  // The title and the way out share a row, so the text keeps the height.
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: T.space.sm },
  title: { ...UI(0.95), color: eq.amber, flexShrink: 1 },
  page: { flexGrow: 0, flexShrink: 1 },
  pageContent: { gap: T.space.sm },
  line: { paddingLeft: T.space.md, borderLeftWidth: 4, borderLeftColor: eq.charcoal },
  lineMarked: { borderLeftColor: eq.clue, backgroundColor: eq.charcoalLight, borderRadius: T.radius.sm, paddingVertical: T.space.xs },
  text: { color: eq.text },
  textMarked: { fontWeight: '800' },
  // The instruction: set apart from the text by a rule and weight (the text is what is read; this is what to do).
  ask: { marginTop: T.space.xs, paddingTop: T.space.sm, paddingLeft: T.space.md, borderTopWidth: 1, borderTopColor: eq.steelEdge },
  askText: { color: eq.text, fontWeight: '800' },
  close: { minHeight: T.minTouchTarget, minWidth: T.minTouchTarget, borderRadius: T.radius.md, paddingHorizontal: T.space.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.charcoalLight, borderWidth: 1, borderColor: eq.steelLight },
  closeText: { ...UI(0.9), color: eq.text },
  pressed: { opacity: 0.6 },
});
