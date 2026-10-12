// The building directory (D128, M8.1, D191). A brass-edged plate listing every floor by number, emblem
// and name, then B1, like the directory beside a real lift. During a job it is information, never a
// ride: its rows are not buttons, and the only way to ride is the numbered panel. In free play and
// between jobs (D191) a row can be picked, and a large EXPRESS RIDE button takes the lift there (never
// on the row tap itself). Game places carry a GAME marker; LAST GAME rides back to the last game.
// TOWER MAP shows the same places as a tower: visited ones lit, games glowing. Two parts:
//   DirectoryButton  the DIRECTORY control beside the panel on every layout (ui/layout.ts places it):
//                    an icon and the word, at least 64 pt; it also names the car's floor where it has
//                    the width (the job of the old placard). It pulses while Lifty introduces it
//                    (a still ring under Reduced Motion).
//   DirectorySheet   all twenty floors, top floor first, in rows of at least 56 pt with 18 to 22 pt
//                    names; the car's floor says YOU ARE HERE (words and weight, never colour alone);
//                    it scrolls, and Back closes it. B1 is pinned under the floors behind a ground line
//                    (D194), in the list and on the map, so it is always in view and always below the lobby.
// The sheet knows only the rows and the car's floor: nothing about the job, so it can never mark an
// answer. Names and emblems come from the landing catalog; the words around them from theme copy.
import { Canvas, Group, Image, RoundedRect } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { iconArt } from '../art/manifest';
import { LINES } from '../content/floor15';
import type { DirectoryRow, Emblem as EmblemName, Place } from '../content/landings';
import { useArt } from './art/ArtContext';
import { useArtImage, type ArtSource } from './art/ArtSlot';
import { drawShape, toPixels } from './LandingLayer';
import { emblemColors, emblemShapes } from './landingArt';
import type { Box } from './layout';
import { DIRECTORY_ROW_MIN, ICON, NUMBER_W, ROW_H, directoryColumns, directoryGrid, scrollToRow } from './directoryLayout';
import { MoreCue, useScrollMore } from './ScrollMore';
import { TEXT_FLOOR, TOKENS as T, eq, labelAt, lineHeightFor, readingAt, type TextSizes } from './palette';

export { ROW_H, directoryColumns, directoryGrid } from './directoryLayout';

/** A directory name as the reading face writes it: "MACHINE ROOM" -> "Machine Room". */
export const displayName = (name: string) => name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export const directoryLabel = (r: Pick<DirectoryRow, 'place' | 'name'>) => `${typeof r.place === 'number' ? `Floor ${r.place}` : r.place}, ${r.name.toLowerCase()}`;

/** The list's right gutter for the MORE cue (32 pt) and the scroll bar. */
export const MORE_GUTTER = 36;

/** The plate also names the car's floor from this width (the placard's job). */
const WITH_FLOOR = 360;

export interface DirectoryButtonProps {
  box: Box;
  /** The car's place and its name (shown when the plate is wide): a floor number, or B1 (D194: never "1" in the basement). */
  floor: Place;
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

/** A game in the building, as the directory marks it (D191). */
export interface DirectoryGame {
  /** The row's label ("20", "B1"). */
  label: string;
  name: string;
}

export interface DirectorySheetProps {
  box: Box;
  rows: DirectoryRow[];
  /** The car's place: the one row marked YOU ARE HERE. The sheet is given nothing about the job. */
  current: Place;
  text?: TextSizes;
  onClose: () => void;
  /** Game places, by row label: a GAME marker on the row and on the map. */
  games?: readonly DirectoryGame[];
  /** Express rides allowed now (free play, or between jobs: D191). Absent or null: information only. */
  onExpress?: ((place: Place) => void) | null;
  /** LAST GAME (D191): the game last entered, while express rides are allowed. */
  lastGame?: { name: string; onPress: () => void } | null;
  /** Labels of the places visited (the map lights them). */
  visited?: readonly string[];
  /** Engineer Secrets found of all (D194): the map says so. Absent: nothing shown. */
  secrets?: { found: number; total: number } | null;
}

export const DirectorySheet = memo(function DirectorySheet({ box, rows, current, text = TEXT_FLOOR, onClose, games = [], onExpress = null, lastGame = null, visited = [], secrets = null }: DirectorySheetProps) {
  // The plate's size: its width estimated from the sheet (board padding and border) until layout reports it.
  const [measured, setSize] = useState({ width: 0, height: 0 });
  const width = measured.width || Math.max(0, box.width - 24);
  const columns = directoryColumns(width);
  // B1 (D194): pinned under the scrolling floors, never at the tail of a scroll where a child misses it.
  const floors = useMemo(() => rows.filter((r) => typeof r.place === 'number'), [rows]);
  const basement = rows.find((r) => typeof r.place !== 'number') ?? null;
  // The rows leave a gutter on the right for the MORE cue, so it never sits on a row or its GAME marker (D192).
  const grid = useMemo(() => directoryGrid(floors.length, Math.max(0, width - MORE_GUTTER), columns), [floors.length, width, columns]);
  // The car's floor is in view when the sheet opens (the list scrolls to it, the learner reads from there).
  // In B1 that is the lobby, the floor just above it.
  const scroll = useRef<ScrollView>(null);
  const here = basement && current === basement.place ? floors.length - 1 : floors.findIndex((r) => r.place === current);
  const [view, setView] = useState<'list' | 'map'>('list');
  useEffect(() => {
    if (measured.height > 0 && view === 'list') scroll.current?.scrollTo({ y: scrollToRow(grid, here, measured.height), animated: false });
  }, [grid, here, measured.height, view]);
  const list = useScrollMore((e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }));
  // Read outside the Canvas: context does not reach Skia's renderer (ui/art/ArtSlot.tsx).
  const art = useArt();
  // The picked place (express rides only). Picking never rides: EXPRESS RIDE does.
  const [choice, setPicked] = useState<Place | null>(null);
  const riding = Boolean(onExpress);
  // A pick lapses when rides stop or the car is already there.
  const picked = riding && choice !== current ? choice : null;
  const gameAt = useMemo(() => new Map(games.map((g) => [g.label, g.name])), [games]);
  const pickedRow = rows.find((r) => r.place === picked) ?? null;
  const pick = (r: DirectoryRow) => (r.place === current ? undefined : setPicked(r.place));
  const ride = () => {
    if (picked !== null && onExpress) onExpress(picked);
  };
  const small = Math.max(TEXT_FLOOR.label, text.label - 2);
  /** One place's words: number, name, then YOU ARE HERE or the game's name, and the GAME marker. */
  const words = (r: DirectoryRow, isHere: boolean, isPicked: boolean, game: string | null, glyph?: ReactNode) => (
    <>
      <Text allowFontScaling={false} style={[labelAt(text.directoryNumber), styles.number]}>
        {r.label}
      </Text>
      {glyph}
      <View style={styles.wordsRow}>
        <View style={styles.words}>
          <Text allowFontScaling={false} numberOfLines={1} style={[readingAt(text.directory, 'directory'), styles.name, (isHere || isPicked) && styles.nameHere]}>
            {displayName(r.name)}
          </Text>
          {isHere ? (
            <Text testID="directory-here" allowFontScaling={false} numberOfLines={1} style={[labelAt(small), styles.here, { lineHeight: lineHeightFor(text.label, 'label') }]}>
              {LINES.directory.here}
            </Text>
          ) : game ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(small), styles.gameName, { lineHeight: lineHeightFor(text.label, 'label') }]}>
              {game}
            </Text>
          ) : null}
        </View>
        {game ? <GameMarker testID={`directory-game-${r.label}`} /> : null}
      </View>
    </>
  );
  /** A row: a button while express rides are allowed (never the car's own place), else information. */
  const placeRow = (r: DirectoryRow, frame: object[], glyph?: ReactNode) => {
    const isHere = r.place === current;
    const isPicked = r.place === picked;
    const game = gameAt.get(r.label) ?? null;
    const label = directoryLabel(r);
    // A game place says so to screen readers too (the marker is a shape).
    const hint = game ? `${LINES.directory.game}: ${game}` : undefined;
    const style = [...frame, isHere && styles.rowHere, isPicked && styles.rowPicked];
    return riding && !isHere ? (
      <Pressable
        key={r.label}
        testID={`directory-row-${r.label}`}
        onPress={() => pick(r)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ selected: isPicked }}
        style={({ pressed }) => [...style, pressed && styles.rowPressed]}
      >
        {words(r, isHere, isPicked, game, glyph)}
      </Pressable>
    ) : (
      <View key={r.label} testID={`directory-row-${r.label}`} style={style} accessible accessibilityRole="text" accessibilityLabel={label} accessibilityHint={hint} {...(isHere ? { accessibilityValue: { text: LINES.directory.here.toLowerCase() } } : {})}>
        {words(r, isHere, isPicked, game, glyph)}
      </View>
    );
  };
  // The MORE cue sits above the pinned B1 row and the footer.
  const pinned = basement ? ROW_H + GROUND_H : 0;
  return (
    <View testID="directory-sheet" style={[styles.board, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[labelAt(text.label + 2), styles.title]} accessibilityRole="header">
          {LINES.directory.title}
        </Text>
        <View style={styles.headerButtons}>
          <Pressable
            testID="directory-view"
            onPress={() => setView(view === 'list' ? 'map' : 'list')}
            accessibilityRole="button"
            accessibilityLabel={view === 'list' ? LINES.directory.map : LINES.directory.list}
            hitSlop={6}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.backText]}>
              {view === 'list' ? LINES.directory.map : LINES.directory.list}
            </Text>
          </Pressable>
          <Pressable testID="directory-back" onPress={onClose} accessibilityRole="button" accessibilityLabel={LINES.directory.back} hitSlop={6} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <View style={styles.backArrow} />
            <Text allowFontScaling={false} style={[readingAt(text.label + 2, 'label'), styles.backText]}>
              {LINES.directory.back}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text testID="directory-note" allowFontScaling={false} style={[readingAt(text.label, 'label'), styles.note]}>
        {view === 'map' ? LINES.map.note : riding ? LINES.directory.pick : LINES.directory.note}
      </Text>
      {view === 'map' && secrets && secrets.total > 0 ? (
        <Text testID="map-secrets" allowFontScaling={false} style={[labelAt(text.label), styles.secrets]}>
          {LINES.mapSecrets(secrets.found, secrets.total)}
        </Text>
      ) : null}
      {view === 'map' ? (
        <TowerMap rows={rows} current={current} picked={picked} gameAt={gameAt} visited={visited} text={text} onPick={riding ? pick : null} />
      ) : (
        <>
        <ScrollView ref={scroll} testID="directory-scroll" style={styles.rows} showsVerticalScrollIndicator persistentScrollbar {...list.props}>
          {width > 0 ? (
            <View style={{ height: grid.height }}>
              {/* One canvas: each row's engraved plate and its icon (the row's words sit on top). */}
              <Canvas style={{ position: 'absolute', left: 0, top: 0, right: 0, height: grid.height }} pointerEvents="none">
                {floors.map((r, i) => {
                  const c = grid.cells[i]!;
                  return <RoundedRect key={`plate-${r.label}`} x={c.x} y={c.y} width={c.w} height={c.h} r={8} color={r.place === current ? eq.charcoalLight : eq.recess} />;
                })}
                {floors.map((r, i) => (
                  <DirectoryIcon key={r.label} floor={typeof r.place === 'number' ? r.place : null} emblem={r.emblem} box={grid.cells[i]!.icon} art={art} />
                ))}
              </Canvas>
              {floors.map((r, i) => {
                const c = grid.cells[i]!;
                return placeRow(r, [styles.row, { left: c.x, top: c.y, width: c.w, height: c.h }]);
              })}
            </View>
          ) : null}
        </ScrollView>
        {basement ? (
          <View testID="directory-basement">
            <Ground />
            {placeRow(basement, [styles.row, styles.rowPinned], <BowlingGlyph />)}
          </View>
        ) : null}
        </>
      )}
      {view === 'list' ? <MoreCue visible={list.more} bottom={(riding ? 96 : 16) + pinned} right={18} /> : null}
      {riding ? (
        <View style={styles.footer}>
          {lastGame ? (
            <Pressable testID="directory-last-game" onPress={lastGame.onPress} accessibilityRole="button" accessibilityLabel={`${LINES.directory.lastGame}: ${lastGame.name}`} style={({ pressed }) => [styles.lastGame, pressed && styles.ridePressed]}>
              <GameMarker />
              <View style={styles.lastWords}>
                <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.lastTitle]}>
                  {LINES.directory.lastGame}
                </Text>
                <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(small), styles.gameName]}>
                  {lastGame.name}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            testID="directory-express"
            onPress={ride}
            disabled={!pickedRow}
            accessibilityRole="button"
            accessibilityLabel={pickedRow ? LINES.directory.rideTo(pickedRow.label) : LINES.directory.ride}
            accessibilityState={{ disabled: !pickedRow }}
            style={({ pressed }) => [styles.ride, !pickedRow && styles.rideIdle, pressed && styles.ridePressed]}
          >
            <View style={styles.rideArrow} />
            <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label + 4), styles.rideText, !pickedRow && styles.rideTextIdle]}>
              {pickedRow ? LINES.directory.rideTo(pickedRow.label) : LINES.directory.ride}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

/** The ground line between the lobby and B1 (D194): a steel sill with hatching under it. Shape only. */
const GROUND_H = 14;
function Ground() {
  return (
    <View testID="directory-ground" pointerEvents="none" style={styles.ground}>
      <View style={styles.groundSill} />
      <View style={styles.groundHatch}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
          <View key={i} style={styles.groundTick} />
        ))}
      </View>
    </View>
  );
}

/** B1's emblem beside its pinned row: a bowling ball (three finger holes). Views, so the row needs no canvas of its own. */
function BowlingGlyph() {
  return (
    <View pointerEvents="none" style={styles.ballBox}>
      <View style={styles.ball}>
        <View style={[styles.hole, { left: 9, top: 7 }]} />
        <View style={[styles.hole, { left: 16, top: 6 }]} />
        <View style={[styles.hole, { left: 13, top: 13 }]} />
      </View>
    </View>
  );
}

/** A game marker: a play triangle in a lit disc. Shape and words, never colour alone. */
function GameMarker({ testID }: { testID?: string }) {
  return (
    <View testID={testID} pointerEvents="none" style={styles.marker}>
      <View style={styles.markerPlay} />
    </View>
  );
}

/**
 * The Engineer Map (D191): the tower, top floor first and B1 below the lobby, drawn as levels of a
 * building. Places visited are lit and named; the rest are dim with a question mark. Games always
 * show (a marker and the game's name), so the learner can find them before visiting. Views only.
 */
function TowerMap({ rows, current, picked, gameAt, visited, text, onPick }: { rows: DirectoryRow[]; current: Place; picked: Place | null; gameAt: Map<string, string>; visited: readonly string[]; text: TextSizes; onPick: ((r: DirectoryRow) => void) | null }) {
  const seen = new Set(visited);
  // D194: the tower is read from the ground up. It opens on the lobby, with B1 pinned under the ground
  // line below it, so the basement is in view and physically below Floor 1 whatever the screen.
  const tower = useRef<ScrollView>(null);
  const opened = useRef(false);
  const level = (r: DirectoryRow) => {
        const isHere = r.place === current;
        const known = isHere || seen.has(r.label);
        const game = gameAt.get(r.label) ?? null;
        const basement = typeof r.place !== 'number';
        const name = known ? displayName(r.name) : LINES.map.unknown;
        const label = `${typeof r.place === 'number' ? `Floor ${r.place}` : r.place}, ${known ? r.name.toLowerCase() : LINES.map.unknown.toLowerCase()}${game ? `, ${LINES.directory.game.toLowerCase()}: ${game}` : ''}${isHere ? `, ${LINES.directory.here.toLowerCase()}` : ''}`;
        const style = [styles.level, basement && styles.levelBasement, known ? styles.levelKnown : styles.levelUnknown, game && styles.levelGame, isHere && styles.rowHere, r.place === picked && styles.rowPicked];
        const inner = (
          <>
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.levelNumber, !known && styles.dim]}>
              {r.label}
            </Text>
            <View style={[styles.window, known && styles.windowLit]} />
            <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(text.label), styles.levelName, !known && styles.dim]}>
              {isHere ? `${name} · ${LINES.directory.here}` : name}
            </Text>
            {game ? (
              <View style={styles.levelGameTag}>
                <GameMarker testID={`map-game-${r.label}`} />
                <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(TEXT_FLOOR.label), styles.gameName]}>
                  {game}
                </Text>
              </View>
            ) : null}
          </>
        );
        return onPick && !isHere ? (
          <Pressable key={r.label} testID={`map-${r.label}`} onPress={() => onPick(r)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: r.place === picked }} style={({ pressed }) => [...style, pressed && styles.rowPressed]}>
            {inner}
          </Pressable>
        ) : (
          <View key={r.label} testID={`map-${r.label}`} style={style} accessible accessibilityLabel={label}>
            {inner}
          </View>
        );
  };
  const basement = rows.find((r) => typeof r.place !== 'number') ?? null;
  return (
    <>
      <ScrollView
        ref={tower}
        testID="tower-map"
        style={styles.rows}
        contentContainerStyle={styles.tower}
        showsVerticalScrollIndicator
        persistentScrollbar
        onContentSizeChange={() => {
          if (opened.current) return;
          opened.current = true;
          tower.current?.scrollToEnd({ animated: false });
        }}
      >
        {rows.filter((r) => typeof r.place === 'number').map(level)}
      </ScrollView>
      {basement ? (
        <View testID="map-basement">
          <Ground />
          {level(basement)}
        </View>
      ) : null}
    </>
  );
}

/** One floor's icon in the shared canvas: its icon art when the art set has one, else the vector emblem. B1 (floor null) draws its emblem. */
function DirectoryIcon({ floor, emblem, box, art }: { floor: number | null; emblem: EmblemName; box: { x: number; y: number; w: number; h: number }; art: ArtSource }) {
  const icon = useArtImage(floor === null ? null : iconArt(art.set, floor), art);
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
  headerButtons: { flexDirection: 'row', gap: 8 },
  title: { color: eq.amber, flexShrink: 1 },
  note: { color: eq.textDim },
  secrets: { color: eq.amberSoft, letterSpacing: 0.5 },
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
  wordsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  name: { color: eq.text },
  nameHere: { fontWeight: '900' },
  here: { color: eq.amberSoft, letterSpacing: 1 },
  // A picked place (express rides): the selected ring, heavier than the car's floor, and bold words.
  rowPicked: { borderWidth: 4, borderColor: T.state.selected.ring, backgroundColor: 'rgba(58,37,8,0.55)' },
  rowPressed: { transform: [{ scale: T.state.pressed.scale }] },
  gameName: { color: eq.game, letterSpacing: 0.5 },
  // The GAME marker: a play triangle in a lit disc, at the row's right end.
  marker: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.gameFace, borderWidth: 2, borderColor: eq.game },
  markerPlay: { marginLeft: 4, width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 12, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: eq.game },
  // EXPRESS RIDE and LAST GAME: the sheet's foot, full-size targets.
  footer: { flexDirection: 'row', gap: 10, minHeight: 72 },
  lastGame: { flexBasis: '38%', flexShrink: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: eq.gameFace, borderWidth: 2, borderColor: eq.game, borderBottomWidth: 5 },
  lastWords: { flex: 1 },
  lastTitle: { color: eq.text },
  ride: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: T.state.selected.face, borderWidth: 3, borderColor: T.state.selected.ring, borderBottomWidth: 7 },
  rideIdle: { backgroundColor: eq.charcoalLight, borderColor: eq.steel, borderBottomWidth: 4, opacity: 0.8 },
  ridePressed: { transform: [{ translateY: 3 }], borderBottomWidth: 3 },
  rideArrow: { width: 0, height: 0, borderTopWidth: 11, borderBottomWidth: 11, borderLeftWidth: 16, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: eq.amber },
  rideText: { color: T.state.selected.label, flexShrink: 1 },
  rideTextIdle: { color: eq.textDim },
  // The Engineer Map: one level per place, B1 under the lobby behind a ground line.
  tower: { padding: 8, gap: 4 },
  level: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: eq.steelDark },
  levelKnown: { backgroundColor: eq.charcoalLight },
  levelUnknown: { backgroundColor: eq.recess },
  levelGame: { borderColor: eq.game, borderWidth: 2 },
  levelBasement: { marginHorizontal: 8 },
  // B1 pinned under the floors (D194), behind the ground line.
  rowPinned: { position: 'relative', height: ROW_H, marginHorizontal: 8, gap: 10, backgroundColor: eq.recess },
  ground: { height: GROUND_H, justifyContent: 'center', marginHorizontal: 4 },
  groundSill: { height: 4, borderRadius: 2, backgroundColor: eq.steelLight },
  groundHatch: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 2 },
  groundTick: { width: 2, height: 6, backgroundColor: eq.steel, transform: [{ skewX: '-30deg' }] },
  ballBox: { width: ICON, height: ICON, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.charcoal },
  ball: { width: 30, height: 30, borderRadius: 15, backgroundColor: eq.amberSoft },
  hole: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: eq.charcoal },
  levelNumber: { color: eq.amber, width: 34, textAlign: 'right' },
  window: { width: 18, height: 22, borderRadius: 3, backgroundColor: eq.night, borderWidth: 1, borderColor: eq.steel },
  windowLit: { backgroundColor: eq.amberSoft },
  levelName: { color: eq.text, flex: 1 },
  levelGameTag: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dim: { color: eq.textDim },
});
