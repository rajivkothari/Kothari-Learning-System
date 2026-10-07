// Small in-world HUD pieces: the mission checklist, the help button, the settings button,
// and the completion card. Subtle by design: the elevator stays the main thing on screen.
import { memo, useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { DirectorView } from '../director/director';
import { helpCue } from './helpCue';
import { DISPLAY, READING, UI, eq } from './palette';

/** Upper estimate of the full checklist's height (objective + six steps), for layout decisions. */
export const HUD_FULL_HEIGHT = 150;

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

export const HelpButton = memo(function HelpButton({ label, offered, disabled, still, onPress, width }: { label: string; offered: boolean; disabled: boolean; still: boolean; onPress: () => void; width?: number }) {
  const cue = helpCue(label, offered, still);
  const breath = useSharedValue(0);
  const { pulse } = cue;
  const period = pulse?.periodMs ?? null;
  useEffect(() => {
    // Offered: a slow breath of scale and ring opacity (no shadow, so Android shows it too).
    // Reduced motion: the same ring, thick border and badge, held still.
    cancelAnimation(breath);
    breath.set(0);
    if (period) breath.set(withRepeat(withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breath, period]);
  const announcement = cue.announcement;
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse ? pulse.scale[0] + (pulse.scale[1] - pulse.scale[0]) * breath.get() : cue.scale }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pulse ? pulse.ringOpacity[0] + (pulse.ringOpacity[1] - pulse.ringOpacity[0]) * breath.get() : cue.ringOpacity }));
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={cue.accessibilityLabel} accessibilityState={{ disabled }} hitSlop={8}>
      <Animated.View style={faceStyle}>
        {cue.ring ? <Animated.View pointerEvents="none" style={[styles.helpRing, ringStyle]} /> : null}
        <View style={[styles.help, width !== undefined && { width, paddingHorizontal: width < 90 ? 4 : 10 }, { borderWidth: cue.borderWidth, borderColor: offered ? eq.clue : eq.steelLight }, disabled && styles.helpDisabled]}>
          <Text allowFontScaling={false} numberOfLines={2} style={[styles.helpText, width !== undefined && width < 90 && styles.helpTextSmall]}>
            {label}
          </Text>
        </View>
        {cue.badge ? (
          <View pointerEvents="none" style={styles.helpBadge}>
            <Text allowFontScaling={false} style={styles.helpBadgeText}>
              ?
            </Text>
          </View>
        ) : null}
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

/** Shown when a save failed for good. Adult-facing: plain words, two big buttons, no blame. */
export function TroubleCard({ title, body, retry, exit, onRetry, onExit }: { title: string; body: string; retry: string; exit: string; onRetry: () => void; onExit?: (() => void) | undefined }) {
  return (
    <View style={styles.cardWrap} pointerEvents="box-none">
      <View style={[styles.card, styles.troubleCard]} accessibilityViewIsModal>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.troubleText}>{body}</Text>
        <View style={styles.cardButtons}>
          <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.cardButton, styles.primary, pressed && styles.iconPressed]}>
            <Text style={styles.cardButtonText}>{retry}</Text>
          </Pressable>
          {onExit ? (
            <Pressable onPress={onExit} accessibilityRole="button" style={({ pressed }) => [styles.cardButton, pressed && styles.iconPressed]}>
              <Text style={styles.cardButtonText}>{exit}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** The Engineer Log hangs in the cabin as a small clipboard (drawn, not an emoji), 64 pt to touch. */
export function ClipboardButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.clipboard, pressed && styles.iconPressed]}>
      <View style={styles.clipBoard}>
        <View style={styles.clipTop} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.clipLine} />
        ))}
      </View>
    </Pressable>
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
  help: { minWidth: 64, minHeight: 64, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlue },
  helpRing: { position: 'absolute', left: -7, right: -7, top: -7, bottom: -7, borderRadius: 20, borderWidth: 3, borderColor: eq.clue },
  helpBadge: { position: 'absolute', right: -9, top: -9, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.clue, borderWidth: 2, borderColor: eq.deepBlue },
  helpBadgeText: { color: eq.deepBlue, fontSize: 15, fontWeight: '900', lineHeight: 18 },
  helpDisabled: { opacity: 0.35 },
  helpText: { ...UI(), color: eq.text, textAlign: 'center' },
  helpTextSmall: { fontSize: 12, letterSpacing: 0.5 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,9,15,0.7)', borderWidth: 1, borderColor: eq.steelDark },
  iconPressed: { opacity: 0.6 },
  iconText: { color: eq.textDim, fontSize: 22 },
  cardWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,6,10,0.55)' },
  card: { minWidth: 320, maxWidth: 480, padding: 24, borderRadius: 20, backgroundColor: eq.surfaceHigh, borderWidth: 2, borderColor: eq.amber, gap: 12 },
  cardTitle: { ...DISPLAY(1.1), color: eq.amber, textAlign: 'center' },
  troubleCard: { borderColor: eq.steelLight },
  troubleText: { ...READING(0.95), color: eq.text },
  cardButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cardButton: { flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steelLight },
  primary: { backgroundColor: eq.deepBlueLight, borderColor: eq.clue },
  cardButtonText: { ...UI(1.05), color: eq.text },
  clipboard: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  clipBoard: { width: 34, height: 44, borderRadius: 5, paddingTop: 12, paddingHorizontal: 6, gap: 5, backgroundColor: eq.steelLight, borderWidth: 2, borderColor: eq.steelEdge },
  clipTop: { position: 'absolute', top: -5, alignSelf: 'center', width: 16, height: 9, borderRadius: 3, backgroundColor: eq.steel, borderWidth: 1, borderColor: eq.steelEdge },
  clipLine: { height: 3, borderRadius: 1.5, backgroundColor: eq.steelEdge },
});
