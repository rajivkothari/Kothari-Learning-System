// The building directory (D128). A brass-edged plate listing every floor by number, emblem and
// name, like the directory beside a real lift. It is information, never a control: rows are not
// buttons, and the only way to ride is the numbered panel. Two forms:
//   placard  under the panel on wide layouts with spare height: the floor the car is at
//   sheet    from the cabin's icon row on every layout: all twenty floors, top floor first
// Names and emblems come from the landing catalog; the words around them from theme copy.
import { Canvas, Group, Image, RoundedRect } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { iconArt } from '../art/manifest';
import { LINES } from '../content/floor15';
import type { DirectoryRow, Emblem as EmblemName } from '../content/landings';
import { useArt } from './art/ArtContext';
import { useArtImage, type ArtSource } from './art/ArtSlot';
import { Emblem } from './EngineerLog';
import { drawShape, toPixels } from './LandingLayer';
import { emblemColors, emblemShapes } from './landingArt';
import type { Box } from './layout';
import { READING, TOKENS as T, UI, eq } from './palette';

// The sheet's rows have a fixed height so all twenty emblems can share ONE Skia canvas behind them:
// on the web every canvas is a WebGL context and browsers drop the oldest past about sixteen, and on
// a Fire tablet one canvas is cheaper than twenty.
const ROW_H = 40;
const GAP = 6;
const PAD = 8;
const ICON = 30;
const NUMBER_W = 34;

/** Where each directory row goes, in the plate's content (pure; tested). */
export function directoryGrid(count: number, width: number, columns: 1 | 2) {
  const colW = (width - PAD * 2 - GAP * (columns - 1)) / columns;
  const cells = Array.from({ length: count }, (_, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = PAD + col * (colW + GAP);
    const y = PAD + row * (ROW_H + GAP);
    return { x, y, w: colW, h: ROW_H, icon: { x: x + NUMBER_W + 6, y: y + (ROW_H - ICON) / 2, w: ICON, h: ICON } };
  });
  return { cells, height: PAD * 2 + Math.ceil(count / columns) * (ROW_H + GAP) - GAP };
}

export const directoryLabel = (r: Pick<DirectoryRow, 'floor' | 'name'>) => `Floor ${r.floor}, ${r.name.toLowerCase()}`;

export const DirectoryPlacard = memo(function DirectoryPlacard({ box, floor, name, emblem }: { box: Box; floor: number; name: string; emblem: EmblemName }) {
  return (
    <View style={[styles.placard, { left: box.x, top: box.y, width: box.width, height: box.height }]} accessible accessibilityRole="text" accessibilityLabel={`Now at ${directoryLabel({ floor, name })}`} pointerEvents="none">
      <Emblem emblem={emblem} dim={false} floor={floor} />
      <Text allowFontScaling={false} style={styles.placardNumber}>
        {floor}
      </Text>
      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.placardName}>
        {name}
      </Text>
    </View>
  );
});

export const DirectorySheet = memo(function DirectorySheet({ box, rows, current, onClose }: { box: Box; rows: DirectoryRow[]; current: number; onClose: () => void }) {
  const columns = box.width >= 520 ? 2 : 1;
  // The plate's width: estimated from the sheet (board inset, padding and border) until layout reports it.
  const [measured, setWidth] = useState(0);
  const width = measured || Math.max(0, box.width - 16 - 24);
  const grid = useMemo(() => directoryGrid(rows.length, width, columns), [rows.length, width, columns]);
  // Read outside the Canvas: context does not reach Skia's renderer (ui/art/ArtSlot.tsx).
  const art = useArt();
  return (
    <View style={[styles.board, { left: box.x + 8, top: box.y + 8, width: box.width - 16, height: box.height - 16 }]} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title} accessibilityRole="header">
          {LINES.directory.title}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={LINES.directory.close} hitSlop={6} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text allowFontScaling={false} style={styles.buttonText}>
            {LINES.directory.close}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.note}>{LINES.directory.note}</Text>
      <ScrollView style={styles.plate} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <View style={{ height: grid.height }}>
            <Canvas style={[StyleSheet.absoluteFill, { height: grid.height }]} pointerEvents="none">
              {rows.map((r, i) => (
                <DirectoryIcon key={r.floor} floor={r.floor} emblem={r.emblem} box={grid.cells[i]!.icon} art={art} />
              ))}
            </Canvas>
            {rows.map((r, i) => {
              const c = grid.cells[i]!;
              return (
                <View key={r.floor} style={[styles.row, { left: c.x, top: c.y, width: c.w, height: c.h }, r.floor === current && styles.rowCurrent]} accessible accessibilityRole="text" accessibilityLabel={directoryLabel(r)}>
                  <Text allowFontScaling={false} style={styles.number}>
                    {r.floor}
                  </Text>
                  <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
                    {r.name}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
});

/** One floor's icon in the shared canvas: its icon art when the art set has one, else the vector emblem. */
function DirectoryIcon({ floor, emblem, box, art }: { floor: number; emblem: EmblemName; box: { x: number; y: number; w: number; h: number }; art: ArtSource }) {
  const icon = useArtImage(iconArt(art.set, floor), art);
  const shapes = useMemo(() => emblemShapes(emblem).map((s) => toPixels(s, { x: box.x + 5, y: box.y + 5, w: box.w - 10, h: box.h - 10 })), [emblem, box]);
  return (
    <Group>
      <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={7} color={eq.charcoal} />
      {icon ? <Image image={icon} x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h - 2} fit="contain" /> : <Group>{shapes.map((s, i) => drawShape(s, i, ICON_COLORS))}</Group>}
    </Group>
  );
}
const ICON_COLORS = emblemColors(eq.amberSoft, eq.charcoal);

const styles = StyleSheet.create({
  // A dark plate with a brass lip, part of the building, not a phone dialog. Not a button.
  placard: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.amberSoft, borderBottomWidth: 4 },
  placardNumber: { ...UI(1.3), color: eq.amber, minWidth: 30, textAlign: 'center' },
  placardName: { ...UI(0.85), color: eq.text, flex: 1 },
  board: { position: 'absolute', borderRadius: 14, padding: 10, backgroundColor: eq.charcoal, borderWidth: 2, borderColor: eq.amberSoft, borderBottomWidth: 5, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...UI(1.05), color: eq.amber },
  note: { ...READING(0.72), color: eq.textDim },
  button: { minWidth: T.minTouchTarget, minHeight: T.minTouchTarget, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steelLight },
  buttonText: { ...UI(0.9), color: eq.text },
  pressed: { opacity: 0.6 },
  plate: { flex: 1, borderRadius: 8, backgroundColor: eq.recess },
  // The number, then room for the icon (drawn in the shared canvas underneath), then the name.
  row: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: ICON + 16, paddingHorizontal: 6, borderRadius: 8 },
  rowCurrent: { borderWidth: 1, borderColor: eq.amberSoft },
  number: { ...UI(0.95), color: eq.amber, width: NUMBER_W - 6, textAlign: 'right' },
  name: { ...UI(0.8), color: eq.text, flex: 1 },
});
