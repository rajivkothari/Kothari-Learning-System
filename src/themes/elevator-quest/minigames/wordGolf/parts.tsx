// Word Golf's controls: big buttons (64 pt and up) with a word, never a colour alone, and the hole
// flags. Cel language shared with the elevator's NEXT JOB: a lighter top stripe, a darker lip below.
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { UI, labelAt } from '../../ui/palette';
import { INK } from './look';
import { MIN_TARGET } from './layout';

export type ButtonKind = 'primary' | 'plain' | 'quiet';

export const GolfButton = memo(function GolfButton({
  label,
  onPress,
  kind = 'plain',
  disabled = false,
  size,
  width,
  height = MIN_TARGET,
  glyph,
  a11yLabel,
  hint,
  value,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  /** The label's size (the label text role, 16 pt or more). */
  size: number;
  width?: number;
  height?: number;
  /** A drawn arrow beside (or instead of) the word. */
  glyph?: 'left' | 'right' | 'up' | 'down' | 'back' | 'play' | 'minus' | 'plus' | 'speaker' | null;
  a11yLabel?: string;
  hint?: string;
  value?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      {...(hint ? { accessibilityHint: hint } : {})}
      {...(value ? { accessibilityValue: { text: value } } : {})}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.button, primary ? styles.primary : kind === 'quiet' ? styles.quiet : styles.plain, { minHeight: height, minWidth: Math.max(MIN_TARGET, width ?? 0) }, width !== undefined && { width }, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}
    >
      <View pointerEvents="none" style={[styles.stripe, primary ? styles.stripePrimary : styles.stripePlain]} />
      {glyph && (glyph === 'back' || glyph === 'left' || glyph === 'minus' || glyph === 'speaker') ? <Glyph kind={glyph} dark={primary} /> : null}
      {label ? (
        <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(size), styles.label, primary && styles.labelPrimary]}>
          {label}
        </Text>
      ) : null}
      {glyph && (glyph === 'right' || glyph === 'play' || glyph === 'plus' || glyph === 'up' || glyph === 'down') ? <Glyph kind={glyph} dark={primary} /> : null}
    </Pressable>
  );
});

/** Drawn glyphs (no icon font, no emoji): arrows, a minus and a plus, a small speaker. */
export function Glyph({ kind, dark = false, big = false }: { kind: 'left' | 'right' | 'up' | 'down' | 'back' | 'play' | 'minus' | 'plus' | 'speaker'; dark?: boolean; big?: boolean }) {
  const c = dark ? INK.night : INK.text;
  const s = big ? 1.6 : 1;
  switch (kind) {
    case 'left':
    case 'back':
      return <View style={[styles.tri, { borderTopWidth: 9 * s, borderBottomWidth: 9 * s, borderRightWidth: 13 * s, borderRightColor: c }]} />;
    case 'right':
    case 'play':
      return <View style={[styles.tri, { borderTopWidth: 9 * s, borderBottomWidth: 9 * s, borderLeftWidth: 13 * s, borderLeftColor: c }]} />;
    case 'up':
      return <View style={[styles.tri, { borderLeftWidth: 9 * s, borderRightWidth: 9 * s, borderBottomWidth: 13 * s, borderBottomColor: c, borderTopWidth: 0 }]} />;
    case 'down':
      return <View style={[styles.tri, { borderLeftWidth: 9 * s, borderRightWidth: 9 * s, borderTopWidth: 13 * s, borderTopColor: c, borderBottomWidth: 0 }]} />;
    case 'minus':
      return <View style={{ width: 22 * s, height: 5 * s, borderRadius: 2, backgroundColor: c }} />;
    case 'plus':
      return (
        <View style={{ width: 22 * s, height: 22 * s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: 22 * s, height: 5 * s, borderRadius: 2, backgroundColor: c }} />
          <View style={{ position: 'absolute', width: 5 * s, height: 22 * s, borderRadius: 2, backgroundColor: c }} />
        </View>
      );
    case 'speaker':
      return (
        <View style={styles.speaker}>
          <View style={[styles.speakerBox, { backgroundColor: c }]} />
          <View style={[styles.tri, { borderTopWidth: 9, borderBottomWidth: 9, borderRightWidth: 9, borderRightColor: c, marginLeft: -2 }]} />
          <View style={[styles.wave, { borderColor: c }]} />
        </View>
      );
  }
}

/** The holes as small flags: done ones carry a check, the current one a ring (shape and mark, not colour alone). */
export function HoleFlags({ count, done, current, label }: { count: number; done: number; current: number; label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={styles.flags}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.flagSlot, i === current && i >= done && styles.flagCurrent]}>
          <View style={styles.flagPole} />
          <View style={[styles.flagCloth, i < done ? styles.flagDone : styles.flagTodo]} />
          {i < done ? <Text allowFontScaling={false} style={styles.flagCheck}>✓</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** A solid plate behind words over the rooftop (text is never set over the art). */
export function Plate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.plate, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 16, overflow: 'hidden' },
  primary: { backgroundColor: INK.accent, borderWidth: 2, borderColor: INK.amber.light, borderBottomWidth: 6, borderBottomColor: INK.amber.shadow },
  plain: { backgroundColor: INK.tile.base, borderWidth: 1.5, borderColor: INK.tile.light, borderBottomWidth: 5, borderBottomColor: INK.tile.shadow },
  quiet: { backgroundColor: INK.plate, borderWidth: 1.5, borderColor: INK.steel.base, borderBottomWidth: 4, borderBottomColor: INK.steel.shadow },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  disabled: { opacity: 0.38 },
  stripe: { position: 'absolute', left: 12, right: 12, top: 4, height: 5, borderRadius: 3, opacity: 0.6 },
  stripePrimary: { backgroundColor: INK.amber.light },
  stripePlain: { backgroundColor: INK.tile.light, opacity: 0.35 },
  label: { ...UI(), color: INK.text, textAlign: 'center', flexShrink: 1 },
  labelPrimary: { color: INK.night },
  tri: { width: 0, height: 0, borderColor: 'transparent', borderStyle: 'solid' },
  speaker: { flexDirection: 'row', alignItems: 'center' },
  speakerBox: { width: 7, height: 9, borderRadius: 1 },
  wave: { marginLeft: 3, width: 9, height: 16, borderRightWidth: 3, borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRadius: 9 },
  flags: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  flagSlot: { width: 34, height: 40, alignItems: 'flex-start', justifyContent: 'flex-end', paddingLeft: 9, paddingBottom: 3, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  flagCurrent: { borderColor: INK.accentLabel },
  flagPole: { position: 'absolute', left: 9, bottom: 3, width: 3, height: 32, borderRadius: 1, backgroundColor: INK.text },
  flagCloth: { position: 'absolute', left: 12, top: 5, width: 16, height: 12, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  flagDone: { backgroundColor: INK.accent },
  flagTodo: { backgroundColor: INK.steel.base },
  flagCheck: { position: 'absolute', left: 13, top: 1, fontSize: 13, lineHeight: 16, fontWeight: '900', color: INK.night },
  plate: { backgroundColor: INK.card, borderRadius: 16, borderWidth: 2, borderColor: INK.cardEdge },
});
