// Small in-world HUD pieces: the mission checklist, the help button, the settings button,
// and the completion card. Subtle by design: the elevator stays the main thing on screen.
import { memo, useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { DirectorView } from '../director/director';
import { helpCue } from './helpCue';
import { celBands } from '../../../presentation/design/tokens';
import { DISPLAY, READING, TOKENS, UI, eq, labelAt, lineHeightFor, readingAt, type TextSizes } from './palette';

/**
 * The mission banner: the objective and the steps, in the cabin's top-left corner (liftyPlacement
 * bannerBox: left of the indicator, above Lifty's band, so it never covers either). Its words are at
 * the label size (16 pt or more, M8.1); where the corner cannot hold every step it shows the current
 * one, and nothing runs past its box.
 */
export const MissionStatus = memo(function MissionStatus({ box, objective, progress, text, onLongPress }: { box: { x: number; y: number; width: number; height: number }; objective: string; progress: DirectorView['progress']; text: Pick<TextSizes, 'label'>; onLongPress?: (() => void) | undefined }) {
  const line = lineHeightFor(text.label, 'label');
  // The objective's lines in the UI face (uppercase, spaced: about 0.7 em a letter), then one line a step.
  const objectiveLines = Math.max(1, Math.ceil((objective.length * text.label * 0.7) / Math.max(1, box.width - 18)));
  const full = 14 + objectiveLines * line + progress.length * line <= box.height;
  const items = full ? progress : progress.filter((p) => p.current);
  return (
    <Pressable
      testID="mission-banner"
      onLongPress={onLongPress}
      delayLongPress={2000}
      accessibilityLabel={`${objective}. ${progress.filter((p) => p.done).length} of ${progress.length} done`}
      style={[styles.status, { left: box.x, top: box.y, maxWidth: box.width, maxHeight: box.height }]}
    >
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(text.label), styles.objective]}>
        {objective}
      </Text>
      {items.map((p) => (
        <View key={p.stepId} style={styles.item}>
          <Text allowFontScaling={false} style={[styles.mark, { fontSize: text.label, lineHeight: line }, p.done && styles.markDone, p.current && styles.markCurrent]}>
            {p.done ? '✓' : p.current ? '▸' : '·'}
          </Text>
          <Text allowFontScaling={false} numberOfLines={full ? 1 : 2} style={[readingAt(text.label, 'label'), styles.itemText, p.done && styles.itemDone, p.current && styles.itemCurrent]}>
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

/**
 * NEXT JOB: the one way on after a correct answer (D122). It sits where the help button sits, so it
 * is always in the same reachable place and never covers the shaft map or the landing. A word and an
 * arrow, not a color, say what it does. Announced once when it appears.
 */
/** NEXT JOB after a success, and (with its own label and hint) LET'S COUNT after a miss (D149). */
export const NextJobButton = memo(function NextJobButton({ label, onPress, width, hint = 'Goes on to the next job' }: { label: string; onPress: () => void; width: number; hint?: string }) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} hitSlop={8} style={({ pressed }) => [styles.next, { width }, pressed && styles.nextPressed]}>
      {/* Cel bands: a light stripe toward the key light, a darker lip below, so it reads as a physical button. */}
      <View pointerEvents="none" style={styles.nextLight} />
      {/* Wraps to NEXT / JOB in a narrow slot rather than ever truncating. */}
      <Text allowFontScaling={false} numberOfLines={2} style={[styles.nextText, width < 90 && styles.helpTextSmall]}>
        {label}
      </Text>
      <View style={styles.nextArrow} />
    </Pressable>
  );
});

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

const amberBands = celBands(TOKENS.palette.accentPrimary, TOKENS);
const blueBands = celBands(eq.deepBlue, TOKENS);

const styles = StyleSheet.create({
  status: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(7,11,18,0.88)', borderWidth: 1, borderColor: eq.steelEdge, overflow: 'hidden' },
  objective: { color: eq.amber, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  mark: { color: eq.textDim, width: 14, fontWeight: '800' },
  markDone: { color: eq.ok },
  markCurrent: { color: eq.amberSoft },
  itemText: { color: eq.textDim, flexShrink: 1 },
  itemDone: { color: eq.steelLight },
  itemCurrent: { color: eq.text, fontWeight: '700' },
  // Cel language shared with NEXT JOB (D134): a lighter top edge, a darker lip below.
  help: { minWidth: 64, minHeight: 64, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlue, borderWidth: 1.5, borderColor: blueBands.light, borderBottomWidth: 5, borderBottomColor: blueBands.shadow },
  helpRing: { position: 'absolute', left: -7, right: -7, top: -7, bottom: -7, borderRadius: 20, borderWidth: 3, borderColor: eq.clue },
  helpBadge: { position: 'absolute', right: -9, top: -9, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.clue, borderWidth: 2, borderColor: eq.deepBlue },
  helpBadgeText: { color: eq.deepBlue, fontSize: 15, fontWeight: '900', lineHeight: 18 },
  helpDisabled: { opacity: 0.35 },
  helpText: { ...UI(), fontSize: 16, lineHeight: 20, color: eq.text, textAlign: 'center' },
  helpTextSmall: { fontSize: 13, letterSpacing: 0.5 },
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
  // A bright, solid amber pill (the concept art's game button): the strongest call to action on screen, never blinking.
  next: { minHeight: 64, paddingHorizontal: 8, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', backgroundColor: eq.amber, borderWidth: 2, borderColor: amberBands.light, borderBottomWidth: 6, borderBottomColor: amberBands.shadow },
  nextLight: { position: 'absolute', left: 14, right: 14, top: 4, height: 6, borderRadius: 3, backgroundColor: amberBands.light, opacity: 0.7 },
  nextPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 3 },
  nextText: { ...UI(), fontSize: 16, lineHeight: 20, color: eq.night, flexShrink: 1, textAlign: 'center' },
  nextArrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: eq.night },
  clipboard: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  clipBoard: { width: 34, height: 44, borderRadius: 5, paddingTop: 12, paddingHorizontal: 6, gap: 5, backgroundColor: eq.steelLight, borderWidth: 2, borderColor: eq.steelEdge },
  clipTop: { position: 'absolute', top: -5, alignSelf: 'center', width: 16, height: 9, borderRadius: 3, backgroundColor: eq.steel, borderWidth: 1, borderColor: eq.steelEdge },
  clipLine: { height: 3, borderRadius: 1.5, backgroundColor: eq.steelEdge },
});
