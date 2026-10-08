// The building directory (D128, M8.1). A brass-edged plate listing every floor by number, emblem and
// name, like the directory beside a real lift. It is information, never a ride: its rows are not
// buttons, and the only way to ride is the numbered panel. Two parts:
//   DirectoryButton  the DIRECTORY control beside the panel on every layout (ui/layout.ts places it):
//                    an icon and the word, at least 64 pt; it also names the car's floor where it has
//                    the width (the job of the old placard). It pulses while Lifty introduces it
//                    (a still ring under Reduced Motion).
//   DirectorySheet   all twenty floors, top floor first, in rows of at least 56 pt with 18 to 22 pt
//                    names; the car's floor says YOU ARE HERE (words and weight, never colour alone);
//                    it scrolls, and Back closes it.
// The sheet knows only the rows and the car's floor: nothing about the job, so it can never mark an
// answer. Names and emblems come from the landing catalog; the words around them from theme copy.
import { Canvas, Group, Image, RoundedRect } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { iconArt } from '../art/manifest';
import { LINES } from '../content/floor15';
import type { DirectoryRow, Emblem as EmblemName } from '../content/landings';
import { useArt } from './art/ArtContext';
import { useArtImage, type ArtSource } from './art/ArtSlot';
import { drawShape, toPixels } from './LandingLayer';
import { emblemColors, emblemShapes } from './landingArt';
import type { Box } from './layout';
import { DIRECTORY_ROW_MIN, ICON, NUMBER_W, directoryColumns, directoryGrid, scrollToRow } from './directoryLayout';
import { MoreCue, useScrollMore } from './ScrollMore';
import { TEXT_FLOOR, TOKENS as T, eq, labelAt, lineHeightFor, readingAt, type TextSizes } from './palette';

export { ROW_H, directoryColumns, directoryGrid } from './directoryLayout';

/** A directory name as the reading face writes it: "MACHINE ROOM" -> "Machine Room". */
export const displayName = (name: string) => name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export const directoryLabel = (r: Pick<DirectoryRow, 'floor' | 'name'>) => `Floor ${r.floor}, ${r.name.toLowerCase()}`;

/** The plate also names the car's floor from this width (the placard's job). */
const WITH_FLOOR = 360;

export interface DirectoryButtonProps {
  box: Box;
  /** The car's floor and its name (shown when the plate is wide). */
  floor: number;
  name: string;
  /** Lifty is introducing the directory: the plate pulses (a still ring under Reduced Motion). */
  hint: boolean;
  still: boolean;
  /** The directory is open (the plate shows it is pressed in). */
  open: boolean;
  disabled: boolean;
  text?: TextSizes;
  onPress: () => void;
}

export const DirectoryButton = memo(function DirectoryButton({ box, floor, name, hint, still, open, disabled, text = TEXT_FLOOR, onPress }: DirectoryButtonProps) {
  const breath = useSharedValue(0);
  const breathing = hint && !still && !disabled;
  useEffect(() => {
    // 2 s per breath (0.5 Hz), far below the 3 Hz limit; the ring never fades out completely.
    cancelAnimation(breath);
    breath.set(0);
    if (breathing) breath.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breath, breathing]);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * breath.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: breathing ? 0.45 + 0.55 * breath.get() : 1 }));
  const row = box.width >= DIRECTORY_ROW_MIN;
  const label = LINES.directory.button;
  // The word keeps the label size; only a plate narrower than that word (the shortest split views) steps it down.
  const wordSize = Math.min(text.label, Math.floor((box.width - 10) / (label.length * 0.68)));
  return (
    <View style={[styles.buttonArea, { left: box.x, top: box.y, width: box.width, height: box.height }]} pointerEvents="box-none">
      <Pressable
        testID="directory-button"
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={LINES.directory.open}
        accessibilityState={{ disabled, expanded: open }}
        hitSlop={4}
        style={styles.fill}
      >
        {({ pressed }) => (
          <Animated.View style={[styles.fill, faceStyle]}>
            {hint && !disabled ? <Animated.View testID="directory-hint" pointerEvents="none" style={[styles.hintRing, ringStyle]} /> : null}
            <View style={[styles.plate, row ? styles.plateRow : styles.plateStack, (pressed || open) && styles.platePressed, disabled && styles.plateDisabled]}>
              <DirectoryGlyph />
              <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(row ? text.label : wordSize), styles.plateWord]}>
                {label}
              </Text>
              {row && box.width >= WITH_FLOOR ? (
                <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.plateFloor]}>
                  {floor} · {name}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
});

/** A small directory board: a brass-framed plate with name lines and a number column. Drawn, never an emoji. */
function DirectoryGlyph() {
  return (
    <View pointerEvents="none" style={styles.glyph}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.glyphRow}>
          <View style={styles.glyphNumber} />
          <View style={[styles.glyphLine, i === 1 && styles.glyphLineShort]} />
        </View>
      ))}
    </View>
  );
}

export interface DirectorySheetProps {
  box: Box;
  rows: DirectoryRow[];
  /** The car's floor: the one row marked YOU ARE HERE. The sheet is given nothing else about the job. */
  current: number;
  text?: TextSizes;
  onClose: () => void;
}

export const DirectorySheet = memo(function DirectorySheet({ box, rows, current, text = TEXT_FLOOR, onClose }: DirectorySheetProps) {
  // The plate's size: its width estimated from the sheet (board padding and border) until layout reports it.
  const [measured, setSize] = useState({ width: 0, height: 0 });
  const width = measured.width || Math.max(0, box.width - 24);
  const columns = directoryColumns(width);
  const grid = useMemo(() => directoryGrid(rows.length, width, columns), [rows.length, width, columns]);
  // The car's floor is in view when the sheet opens (the list scrolls to it, the learner reads from there).
  const scroll = useRef<ScrollView>(null);
  const here = rows.findIndex((r) => r.floor === current);
  useEffect(() => {
    if (measured.height > 0) scroll.current?.scrollTo({ y: scrollToRow(grid, here, measured.height), animated: false });
  }, [grid, here, measured.height]);
  const list = useScrollMore((e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }));
  // Read outside the Canvas: context does not reach Skia's renderer (ui/art/ArtSlot.tsx).
  const art = useArt();
  return (
    <View testID="directory-sheet" style={[styles.board, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.title]} accessibilityRole="header">
          {LINES.directory.title}
        </Text>
        <Pressable testID="directory-back" onPress={onClose} accessibilityRole="button" accessibilityLabel={LINES.directory.back} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <View style={styles.backArrow} />
          <Text allowFontScaling={false} style={[readingAt(text.label + 2, 'label'), styles.backText]}>
            {LINES.directory.back}
          </Text>
        </Pressable>
      </View>
      <Text allowFontScaling={false} style={[readingAt(text.label, 'label'), styles.note]}>
        {LINES.directory.note}
      </Text>
      <ScrollView ref={scroll} testID="directory-scroll" style={styles.rows} showsVerticalScrollIndicator persistentScrollbar {...list.props}>
        {width > 0 ? (
          <View style={{ height: grid.height }}>
            {/* One canvas: each row's engraved plate and its icon (the row's words sit on top). */}
            <Canvas style={{ position: 'absolute', left: 0, top: 0, right: 0, height: grid.height }} pointerEvents="none">
              {rows.map((r, i) => {
                const c = grid.cells[i]!;
                return <RoundedRect key={`plate-${r.floor}`} x={c.x} y={c.y} width={c.w} height={c.h} r={8} color={r.floor === current ? eq.charcoalLight : eq.recess} />;
              })}
              {rows.map((r, i) => (
                <DirectoryIcon key={r.floor} floor={r.floor} emblem={r.emblem} box={grid.cells[i]!.icon} art={art} />
              ))}
            </Canvas>
            {rows.map((r, i) => {
              const c = grid.cells[i]!;
              const here = r.floor === current;
              return (
                <View
                  key={r.floor}
                  testID={`directory-row-${r.floor}`}
                  style={[styles.row, { left: c.x, top: c.y, width: c.w, height: c.h }, here && styles.rowHere]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={directoryLabel(r)}
                  {...(here ? { accessibilityValue: { text: LINES.directory.here.toLowerCase() } } : {})}
                >
                  <Text allowFontScaling={false} style={[labelAt(text.directoryNumber), styles.number]}>
                    {r.floor}
                  </Text>
                  <View style={styles.words}>
                    <Text allowFontScaling={false} numberOfLines={1} style={[readingAt(text.directory, 'directory'), styles.name, here && styles.nameHere]}>
                      {displayName(r.name)}
                    </Text>
                    {here ? (
                      <Text testID="directory-here" allowFontScaling={false} numberOfLines={1} style={[labelAt(Math.max(TEXT_FLOOR.label, text.label - 2)), styles.here, { lineHeight: lineHeightFor(text.label, 'label') }]}>
                        {LINES.directory.here}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <MoreCue visible={list.more} bottom={16} right={18} />
    </View>
  );
});

/** One floor's icon in the shared canvas: its icon art when the art set has one, else the vector emblem. */
function DirectoryIcon({ floor, emblem, box, art }: { floor: number; emblem: EmblemName; box: { x: number; y: number; w: number; h: number }; art: ArtSource }) {
  const icon = useArtImage(iconArt(art.set, floor), art);
  const shapes = useMemo(() => emblemShapes(emblem).map((s) => toPixels(s, { x: box.x + 6, y: box.y + 6, w: box.w - 12, h: box.h - 12 })), [emblem, box]);
  return (
    <Group>
      <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={8} color={eq.charcoal} />
      {icon ? <Image image={icon} x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h - 2} fit="contain" /> : <Group>{shapes.map((s, i) => drawShape(s, i, ICON_COLORS))}</Group>}
    </Group>
  );
}
const ICON_COLORS = emblemColors(eq.amberSoft, eq.charcoal);

const styles = StyleSheet.create({
  buttonArea: { position: 'absolute' },
  fill: { flex: 1 },
  // A brass-lipped plate, part of the building like the old placard: a control now, so it has a face
  // that presses in (the lip shortens) and a word, not only an icon.
  plate: { flex: 1, borderRadius: 12, paddingHorizontal: 12, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.amberSoft, borderBottomWidth: 5, borderBottomColor: eq.amberDim, alignItems: 'center' },
  plateRow: { flexDirection: 'row', gap: 10 },
  plateStack: { justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  platePressed: { borderBottomWidth: 2, marginTop: 3, backgroundColor: eq.charcoalLight },
  plateDisabled: { opacity: T.state.disabled.opacity },
  plateWord: { color: eq.amber, letterSpacing: 0.5 },
  plateFloor: { color: eq.text, flex: 1, textAlign: 'right' },
  // The introduction's ring: outside the plate, steady under Reduced Motion (shape, not colour alone).
  hintRing: { position: 'absolute', left: -7, right: -7, top: -7, bottom: -7, borderRadius: 18, borderWidth: 3, borderColor: eq.clue },
  glyph: { width: 30, height: 30, borderRadius: 4, padding: 4, gap: 3, justifyContent: 'center', backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.amberSoft },
  glyphRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  glyphNumber: { width: 4, height: 4, borderRadius: 1, backgroundColor: eq.amber },
  glyphLine: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: eq.text, opacity: 0.85 },
  glyphLineShort: { flex: 0, width: 9 },
  board: { position: 'absolute', borderRadius: 14, padding: 10, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.amberSoft, borderBottomWidth: 5, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: eq.amber, flexShrink: 1 },
  note: { color: eq.textDim },
  back: { minWidth: T.minTouchTarget + 32, minHeight: T.minTouchTarget, flexDirection: 'row', gap: 8, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 1.5, borderColor: eq.steelLight, borderBottomWidth: 4 },
  backArrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: eq.text },
  backText: { color: eq.text, fontWeight: '800' },
  pressed: { opacity: 0.6 },
  // The rows' plate: recessed, so the rows read as engraved lines on a board.
  rows: { flex: 1, borderRadius: 8, backgroundColor: eq.night },
  // The number, then room for the icon (drawn in the shared canvas underneath), then the name.
  row: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: ICON + 14, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: eq.steelDark },
  // The car's floor: a heavier brass border, a lighter face (drawn in the canvas), and the words YOU ARE HERE.
  rowHere: { borderWidth: 3, borderColor: eq.amberSoft },
  number: { color: eq.amber, width: NUMBER_W - 6, textAlign: 'right' },
  words: { flex: 1, justifyContent: 'center' },
  name: { color: eq.text },
  nameHere: { fontWeight: '900' },
  here: { color: eq.amberSoft, letterSpacing: 1 },
});
