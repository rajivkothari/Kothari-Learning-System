// Small in-world HUD pieces: the mission checklist, the help button, the settings button,
// and the completion card. Subtle by design: the elevator stays the main thing on screen.
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { DirectorView } from '../director/director';
import { DISPLAY, READING, UI, eq } from './palette';

export const MissionStatus = memo(function MissionStatus({ objective, progress, compact, onLongPress }: { objective: string; progress: DirectorView['progress']; compact: boolean; onLongPress?: () => void }) {
  const items = compact ? progress.filter((p) => p.current) : progress;
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={2000} accessibilityLabel={`${objective}. ${progress.filter((p) => p.done).length} of ${progress.length} done`} style={styles.status}>
      <Text allowFontScaling={false} style={styles.objective}>
        {objective}
      </Text>
      {items.map((p) => (
        <View key={p.stepId} style={styles.item}>
          <Text allowFontScaling={false} style={[styles.mark, p.done && styles.markDone, p.current && styles.markCurrent]}>
            {p.done ? '✓' : p.current ? '▸' : '·'}
          </Text>
          <Text allowFontScaling={false} style={[styles.itemText, p.done && styles.itemDone, p.current && styles.itemCurrent]}>
            {p.label}
          </Text>
        </View>
      ))}
    </Pressable>
  );
});

export const HelpButton = memo(function HelpButton({ label, offered, disabled, still, onPress }: { label: string; offered: boolean; disabled: boolean; still: boolean; onPress: () => void }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    // A slow 0.5 Hz breathing glow when help is offered. Far below the 3 Hz limit; never a flash.
    // Reduced motion: a steady glow instead.
    cancelAnimation(glow);
    if (offered && !still) glow.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
    else glow.set(withTiming(offered ? 1 : 0, { duration: 200 }));
  }, [glow, offered, still]);
  const style = useAnimatedStyle(() => ({ shadowOpacity: 0.25 + 0.6 * glow.get(), borderColor: offered ? eq.clue : eq.steelLight }));
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Help: ${label}`} accessibilityState={{ disabled }} hitSlop={8}>
      <Animated.View style={[styles.help, disabled && styles.helpDisabled, style]}>
        <Text allowFontScaling={false} style={styles.helpText}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export function IconButton({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}>
      <Text allowFontScaling={false} style={styles.iconText}>
        {glyph}
      </Text>
    </Pressable>
  );
}

export function CompletionCard({ title, lines, onFreeRide, onPlayAgain }: { title: string; lines: string[]; onFreeRide: () => void; onPlayAgain: () => void }) {
  return (
    <View style={styles.cardWrap} pointerEvents="box-none">
      <View style={styles.card} accessibilityViewIsModal>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {title}
        </Text>
        {lines.map((l) => (
          <View key={l} style={styles.cardLine}>
            <View style={styles.badge} />
            <Text style={styles.cardText}>{l}</Text>
          </View>
        ))}
        <View style={styles.cardButtons}>
          <Pressable onPress={onFreeRide} accessibilityRole="button" style={({ pressed }) => [styles.cardButton, styles.primary, pressed && styles.iconPressed]}>
            <Text style={styles.cardButtonText}>RIDE THE LIFT</Text>
          </Pressable>
          <Pressable onPress={onPlayAgain} accessibilityRole="button" style={({ pressed }) => [styles.cardButton, pressed && styles.iconPressed]}>
            <Text style={styles.cardButtonText}>PLAY AGAIN</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { position: 'absolute', left: 12, top: 10, padding: 8, borderRadius: 10, backgroundColor: 'rgba(7,11,18,0.82)', borderWidth: 1, borderColor: eq.steelEdge, maxWidth: 280 },
  objective: { ...UI(0.75), color: eq.amber, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: { color: eq.textDim, width: 12, fontSize: 12, fontWeight: '800' },
  markDone: { color: eq.ok },
  markCurrent: { color: eq.amberSoft },
  itemText: { ...READING(0.62), color: eq.textDim },
  itemDone: { color: eq.steelLight },
  itemCurrent: { color: eq.text, fontWeight: '700' },
  help: { minWidth: 88, minHeight: 64, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlue, borderWidth: 2, shadowColor: eq.clue, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  helpDisabled: { opacity: 0.35 },
  helpText: { ...UI(), color: eq.text },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,9,15,0.7)', borderWidth: 1, borderColor: eq.steelDark },
  iconPressed: { opacity: 0.6 },
  iconText: { color: eq.textDim, fontSize: 22 },
  cardWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,6,10,0.55)' },
  card: { minWidth: 320, maxWidth: 480, padding: 24, borderRadius: 20, backgroundColor: eq.surfaceHigh, borderWidth: 2, borderColor: eq.amber, gap: 12 },
  cardTitle: { ...DISPLAY(1.1), color: eq.amber, textAlign: 'center' },
  cardLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 18, height: 18, borderRadius: 4, backgroundColor: eq.ok, transform: [{ rotate: '45deg' }] },
  cardText: { ...UI(1.25), color: eq.text },
  cardButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cardButton: { flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steelLight },
  primary: { backgroundColor: eq.deepBlueLight, borderColor: eq.clue },
  cardButtonText: { ...UI(1.05), color: eq.text },
});
