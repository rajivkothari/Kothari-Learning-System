// The host's two controls (M9): the landing's PLAY button and BACK TO ELEVATOR. Games use
// BackToElevatorButton in their own layout (or draw their own control that calls onExit).
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { celBands } from '../../../presentation/design/tokens';
import type { Box } from '../ui/layout';
import { TOKENS, eq, labelAt } from '../ui/palette';
import { HOST_COPY } from './hostCopy';
import type { MiniGameId } from './types';

const amber = celBands(TOKENS.palette.accentPrimary, TOKENS);
const steel = celBands(eq.steel, TOKENS);

/**
 * The landing's PLAY button: a sign standing beside the doorway (hostLayout.ts places and sizes it to
 * its words). Its words name the game (or say PLAY where the window is narrow; the accessibility
 * label always names it). Never blinks, never pulses.
 */
export const GameEntranceButton = memo(function GameEntranceButton({ box, label, accessibilityLabel, size, game, onPress }: { box: Box; label: string; accessibilityLabel: string; size: number; game: MiniGameId; onPress: () => void }) {
  return (
    <Pressable
      testID={`minigame-entrance-${game}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={HOST_COPY.entranceHint}
      style={({ pressed }) => [styles.entrance, { left: box.x, top: box.y, width: box.width, minHeight: box.height }, pressed && styles.entrancePressed]}
    >
      <View pointerEvents="none" style={styles.entranceLight} />
      <Text allowFontScaling={false} style={[labelAt(size), styles.entranceText]}>
        {label}
      </Text>
    </Pressable>
  );
});

/** BACK TO ELEVATOR: 64 pt tall at least, steel with a light top edge, words and an arrow (never colour alone). */
export const BackToElevatorButton = memo(function BackToElevatorButton({ onPress, size = 18, label = HOST_COPY.back, style }: { onPress: () => void; size?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable testID="minigame-back" onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={HOST_COPY.backHint} hitSlop={6} style={({ pressed }) => [styles.back, style, pressed && styles.backPressed]}>
      <View pointerEvents="none" style={styles.backArrow} />
      <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(size), styles.backText]}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  entrance: {
    position: 'absolute',
    // With the border, the room hostLayout.ts ENTRANCE.padX / padY counts around the words.
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
    backgroundColor: eq.deepBlueLight,
    borderWidth: 2,
    borderColor: amber.light,
    borderBottomWidth: 6,
    borderBottomColor: amber.shadow,
  },
  entrancePressed: { transform: [{ translateY: 3 }], borderBottomWidth: 3 },
  entranceLight: { position: 'absolute', left: 12, right: 12, top: 4, height: 5, borderRadius: 3, backgroundColor: amber.light, opacity: 0.45 },
  entranceText: { color: eq.text, textAlign: 'center' },
  back: {
    minHeight: 64,
    minWidth: 120,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: eq.steelDark,
    borderWidth: 1.5,
    borderColor: steel.light,
    borderBottomWidth: 5,
    borderBottomColor: steel.shadow,
  },
  backPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 3 },
  backArrow: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: eq.text },
  backText: { color: eq.text, flexShrink: 1, textAlign: 'center' },
});
