// The Engineer Log: a maintenance clipboard that hangs in the cabin once Floor 15 is restored.
// One row per place with something to inspect: floor, name, emblem, INSPECTED or not yet, the fact
// found there, and a system state where the place has one. No scores, no percentages, no counts.
// An undiscovered row never shows its fact. The clipboard covers the cabin view only: the panel
// stays in reach, and CLOSE is a full-size button. The mission replay lives at the bottom.
import { Canvas, Group, Image, RoundedRect } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LINES } from '../content/floor15';
import type { LogRow } from '../content/landings';
import { iconArt } from '../art/manifest';
import { useArt } from './art/ArtContext';
import { useArtImage } from './art/ArtSlot';
import { drawShape, toPixels } from './LandingLayer';
import { emblemColors, emblemShapes } from './landingArt';
import type { Box } from './layout';
import { READING, TOKENS as T, UI, eq } from './palette';

const EMBLEM = 36;

/** The words a row says (also its screen-reader label). Undiscovered rows never carry the fact. */
export function logRowText(r: LogRow): { title: string; status: string; body: string; system: string | null; label: string } {
  const title = `FLOOR ${r.floor} · ${r.name}`;
  const status = r.inspected ? LINES.log.inspected : LINES.log.notInspected;
  const body = r.inspected && r.fact ? r.fact : LINES.log.unknown;
  const system = r.system === 'powered' ? LINES.log.powered : r.system === 'unpowered' ? LINES.log.unpowered : null;
  const label = [`Floor ${r.floor}, ${r.name.toLowerCase()}`, status.toLowerCase(), system?.toLowerCase(), body].filter(Boolean).join('. ');
  return { title, status, body, system, label };
}

export const EngineerLog = memo(function EngineerLog({ box, rows, onClose, onReplay }: { box: Box; rows: LogRow[]; onClose: () => void; onReplay: () => void }) {
  return (
    <View style={[styles.board, { left: box.x + 8, top: box.y + 8, width: box.width - 16, height: box.height - 16 }]} accessibilityViewIsModal>
      <View style={styles.clip} pointerEvents="none" />
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title} accessibilityRole="header">
          {LINES.log.title}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={LINES.log.close} hitSlop={6} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text allowFontScaling={false} style={styles.buttonText}>
            {LINES.log.close}
          </Text>
        </Pressable>
      </View>
      <ScrollView style={styles.paper} contentContainerStyle={styles.paperContent}>
        {rows.map((r) => (
          <LogEntry key={r.floor} row={r} />
        ))}
      </ScrollView>
      <Pressable onPress={onReplay} accessibilityRole="button" accessibilityLabel={LINES.log.replay} style={({ pressed }) => [styles.replay, pressed && styles.pressed]}>
        <Text allowFontScaling={false} style={styles.replayText}>
          {LINES.log.replay}
        </Text>
      </Pressable>
    </View>
  );
});

function LogEntry({ row }: { row: LogRow }) {
  const t = logRowText(row);
  return (
    <View style={styles.row} accessible accessibilityLabel={t.label}>
      <Emblem emblem={row.emblem} dim={!row.inspected} floor={row.floor} />
      <View style={styles.rowText}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.rowTitle}>
          {t.title}
        </Text>
        <View style={styles.tags}>
          <View style={[styles.tag, row.inspected ? styles.tagDone : styles.tagOpen]}>
            <Text allowFontScaling={false} style={[styles.tagText, row.inspected ? styles.tagTextDone : null]}>
              {row.inspected ? `✓ ${t.status}` : t.status}
            </Text>
          </View>
          {t.system ? (
            <View style={[styles.tag, row.system === 'powered' ? styles.tagDone : styles.tagOpen]}>
              <Text allowFontScaling={false} style={[styles.tagText, row.system === 'powered' ? styles.tagTextDone : null]}>
                {t.system}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.body, row.inspected ? null : styles.bodyUnknown]}>{t.body}</Text>
      </View>
    </View>
  );
}

/** A floor's emblem: its icon art when there is one (art manifest), else the vector emblem. */
export function Emblem({ emblem, dim, floor }: { emblem: LogRow['emblem']; dim: boolean; floor?: number }) {
  const shapes = useMemo(() => emblemShapes(emblem).map((s) => toPixels(s, { x: 6, y: 6, w: EMBLEM - 12, h: EMBLEM - 12 })), [emblem]);
  const colors = useMemo(() => emblemColors(eq.amberSoft, eq.recess), []);
  // Read outside the Canvas: context does not reach Skia's renderer (see ui/art/ArtSlot.tsx).
  const art = useArt();
  const icon = useArtImage(floor === undefined ? null : iconArt(art.set, floor), art);
  return (
    <Canvas style={{ width: EMBLEM, height: EMBLEM, opacity: dim ? 0.35 : 1 }}>
      <RoundedRect x={0} y={0} width={EMBLEM} height={EMBLEM} r={8} color={eq.recess} />
      {icon ? <Image image={icon} x={2} y={2} width={EMBLEM - 4} height={EMBLEM - 4} fit="contain" /> : <Group>{shapes.map((s, i) => drawShape(s, i, colors))}</Group>}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  // A steel clipboard with a darker sheet on it: part of the cabin's kit, not a phone dialog.
  board: { position: 'absolute', borderRadius: 14, padding: 10, paddingTop: 16, backgroundColor: eq.steelDark, borderWidth: 2, borderColor: eq.steelEdge, gap: 8 },
  clip: { position: 'absolute', top: -6, alignSelf: 'center', width: 84, height: 16, borderRadius: 5, backgroundColor: eq.steelLight, borderWidth: 1, borderColor: eq.steelEdge },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...UI(1.05), color: eq.amber },
  button: { minWidth: T.minTouchTarget, minHeight: T.minTouchTarget, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.charcoal, borderWidth: 1, borderColor: eq.steelLight },
  buttonText: { ...UI(0.9), color: eq.text },
  pressed: { opacity: 0.6 },
  paper: { flex: 1, borderRadius: 8, backgroundColor: eq.charcoal },
  paperContent: { padding: 10, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { ...UI(0.8), color: eq.text },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  tagOpen: { borderColor: eq.steelEdge, borderStyle: 'dashed' },
  tagDone: { borderColor: eq.ok },
  tagText: { ...UI(0.6), color: eq.textDim },
  tagTextDone: { color: eq.ok },
  body: { ...READING(0.72), color: eq.text },
  bodyUnknown: { color: eq.textDim, fontStyle: 'italic' },
  replay: { minHeight: T.minTouchTarget, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.charcoal, borderWidth: 1, borderColor: eq.steelEdge },
  replayText: { ...UI(0.85), color: eq.textDim },
});
