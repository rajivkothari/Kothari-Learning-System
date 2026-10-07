// The building directory (D128). A brass-edged plate listing every floor by number, emblem and
// name, like the directory beside a real lift. It is information, never a control: rows are not
// buttons, and the only way to ride is the numbered panel. Two forms:
//   placard  under the panel on wide layouts with spare height: the floor the car is at
//   sheet    from the cabin's icon row on every layout: all twenty floors, top floor first
// Names and emblems come from the landing catalog; the words around them from theme copy.
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LINES } from '../content/floor15';
import type { DirectoryRow, Emblem as EmblemName } from '../content/landings';
import { Emblem } from './EngineerLog';
import type { Box } from './layout';
import { READING, TOKENS as T, UI, eq } from './palette';

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
  const twoColumns = box.width >= 520;
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
      <ScrollView style={styles.plate} contentContainerStyle={[styles.plateContent, twoColumns && styles.plateTwo]}>
        {rows.map((r) => (
          <View key={r.floor} style={[styles.row, twoColumns && styles.rowHalf, r.floor === current && styles.rowCurrent]} accessible accessibilityRole="text" accessibilityLabel={directoryLabel(r)}>
            <Text allowFontScaling={false} style={styles.number}>
              {r.floor}
            </Text>
            <Emblem emblem={r.emblem} dim={false} floor={r.floor} />
            <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
              {r.name}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

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
  plateContent: { padding: 8, gap: 6 },
  plateTwo: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  rowHalf: { width: '49%' },
  rowCurrent: { borderWidth: 1, borderColor: eq.amberSoft },
  number: { ...UI(0.95), color: eq.amber, minWidth: 28, textAlign: 'right' },
  name: { ...UI(0.8), color: eq.text, flex: 1 },
});
