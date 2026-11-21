// The controls every royal game shares: the ear, Help (a light bulb in a speech bubble), the big action
// buttons (Next is an arrow, Play Again a circular arrow) and the turn dots. Pictures first: the child
// cannot read yet, so a label is an extra, never the only cue. Every control is at least 64 pt.
import { StyleSheet, Text, View } from 'react-native';
import { MagicIcon, type IconKind } from './MagicArt';
import { GLOW_PAD, Glow, MagicalPressable as Pressable } from './MagicalPressable';
import { magic as P } from './palette';
import { useReadingFont } from './readingFont';

/** The ear: hear it again. It always works. It glows while the game is talking and, slowly, as a nudge. */
export function EarButton({ label, onPress, glow, still, size = 72, testID, glowTestID }: { label: string; onPress: () => void; glow: boolean; still: boolean; size?: number; testID?: string; glowTestID?: string }) {
  return <Glow on={glow} still={still} radius={size / 2} testID={glowTestID}>
    <Pressable testID={testID} accessibilityLabel={label} onPress={onPress} style={[s.ear, { width: size, height: size, borderRadius: size / 2 }]}>
      <MagicIcon kind="ear" size={Math.round(size * 0.62)} />
    </Pressable>
  </Glow>;
}
export const EAR_PAD = GLOW_PAD;

/** Help: a light bulb in a speech bubble. The word drops away in a narrow slot. `locked`: the game is talking. */
export function HelpButton({ label, onPress, locked, onLocked, disabled, width, testID }: { label: string; onPress: () => void; locked: boolean; onLocked?: () => void; disabled: boolean; width: number; testID?: string }) {
  const wordy = width >= 150;
  const font = useReadingFont();
  // The button stays solid in every state (the backdrop never shows through); only its contents fade.
  return <Pressable testID={testID} accessibilityLabel={label} onPress={onPress} locked={locked} onLocked={onLocked} disabled={disabled} style={[s.help, { width: wordy ? Math.min(width, 220) : 76 }, (disabled || locked) && s.helpResting]}>
    <View style={[s.helpInside, disabled ? s.off : locked ? s.waiting : null]}>
      <View style={s.bubble}><MagicIcon kind="bulb" size={36} /><View style={s.tail} /></View>
      {wordy ? <Text style={[s.helpText, font.bold]} numberOfLines={1}>{label}</Text> : null}
    </View>
  </Pressable>;
}

/**
 * A big action: Next (arrow), Play Again (circular arrow), More Games. The picture leads; the word follows.
 * `locked`: it has only just appeared under the child's finger; it shows a press and does nothing yet.
 */
export function ActionButton({ label, icon, onPress, width, quiet = false, disabled = false, locked = false, testID }: { label: string; icon: IconKind; onPress: () => void; width?: number; quiet?: boolean; disabled?: boolean; locked?: boolean; testID?: string }) {
  const font = useReadingFont();
  return <Pressable testID={testID} accessibilityLabel={label} onPress={onPress} disabled={disabled} locked={locked} style={[s.action, quiet && s.quiet, width !== undefined && { width }]}>
    <View style={[s.actionInside, disabled && s.off]}>
      <MagicIcon kind={icon} size={38} color={quiet ? P.deep : P.cream} />
      <Text style={[s.actionText, quiet && s.quietText, font.bold]} numberOfLines={1}>{label}</Text>
    </View>
  </Pressable>;
}

/** One dot a turn: done turns gold, this turn ringed. */
export function TurnDots({ turn, turns, done, label }: { turn: number; turns: number; done: boolean; label: string }) {
  return <View style={s.dots} accessibilityLabel={label}>
    {Array.from({ length: turns }, (_, i) => <View key={i} style={[s.dot, (i < turn - 1 || done) && s.dotDone, i === turn - 1 && !done && s.dotNow]} />)}
  </View>;
}

const s = StyleSheet.create({
  ear: { backgroundColor: P.cream, borderWidth: 3, borderColor: P.edge, alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 0 ${P.shadow}` },
  help: { height: 64, borderRadius: 24, backgroundColor: P.cream, borderWidth: 2, borderColor: P.edge, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10, boxShadow: `0 4px 0 ${P.shadow}` },
  bubble: { width: 52, height: 46, borderRadius: 18, backgroundColor: P.paper, borderWidth: 2, borderColor: P.gold, alignItems: 'center', justifyContent: 'center' },
  tail: { position: 'absolute', left: 8, bottom: -6, width: 12, height: 12, backgroundColor: P.paper, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: P.gold, transform: [{ rotate: '-45deg' }, { skewX: '18deg' }] },
  helpText: { color: P.ink, fontSize: 20, fontWeight: '800' },
  helpInside: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  helpResting: { boxShadow: 'none', backgroundColor: P.paper },
  actionInside: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { minWidth: 160, height: 68, borderRadius: 26, backgroundColor: P.deep, borderWidth: 2, borderColor: P.edge, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 18, boxShadow: `0 4px 0 ${P.shadow}` },
  quiet: { backgroundColor: P.cream },
  actionText: { color: P.paper, fontSize: 21, fontWeight: '800' },
  quietText: { color: P.ink },
  off: { opacity: 0.45 },
  waiting: { opacity: 0.7 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: P.paper, borderWidth: 2, borderColor: P.edge },
  dotDone: { backgroundColor: P.gold, borderColor: P.gold },
  dotNow: { borderColor: P.deep, borderWidth: 3 },
});
