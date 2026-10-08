// The full-screen side of the mini-game host (M9): the open game's own screen, or the host's
// loading / trouble view with BACK TO ELEVATOR, and the short fade between the elevator and a game.
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewport } from '../../../presentation/viewport';
import { DISPLAY, eq, readingAt } from '../ui/palette';
import { textClass, textSizes } from '../ui/textRoles';
import type { HostState } from './host';
import { BackToElevatorButton } from './hostControls';
import { HOST_COPY } from './hostCopy';
import { definitionFor } from './registry';

/** How long the swap between the elevator and a game fades in. None under Reduced Motion. */
export const FADE_MS = 220;

/** Fades its children in when mounted (key it to fade on a swap). Under Reduced Motion: shown at once. */
export function FadeIn({ reducedMotion, children }: { reducedMotion: boolean; children: ReactNode }) {
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) opacity.set(withTiming(1, { duration: FADE_MS }));
  }, [opacity, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

/** The app is in the background (the game is told, so it can stop its loops and save). */
function useSuspended(): boolean {
  const [suspended, setSuspended] = useState(AppState.currentState === 'background' || AppState.currentState === 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setSuspended(s !== 'active'));
    return () => sub.remove();
  }, []);
  return suspended;
}

export function MiniGameHostScreen({ state, reducedMotion, onExit }: { state: Exclude<HostState, { phase: 'elevator' }>; reducedMotion: boolean; onExit: () => void }) {
  const window = useViewport();
  const insets = useSafeAreaInsets();
  const suspended = useSuspended();
  const text = textSizes(textClass({ width: window.width, height: window.height }));
  const game = definitionFor(state.game.id);
  if (state.phase === 'open') {
    const Screen = game.Screen;
    return (
      <View style={styles.fill} testID={`minigame-${game.id}`}>
        <Screen session={state.session} size={{ width: window.width, height: window.height }} insets={insets} text={text} reducedMotion={reducedMotion} suspended={suspended} sound={state.sound} onExit={onExit} />
      </View>
    );
  }
  const line = state.phase === 'failed' ? (state.reason === 'missing' ? HOST_COPY.missing : HOST_COPY.trouble) : state.phase === 'opening' ? HOST_COPY.loading : '';
  return (
    <View testID={`minigame-host-${state.phase}`} style={[styles.fill, styles.center, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={[DISPLAY(1.3), styles.title]} accessibilityRole="header">
        {HOST_COPY.games[game.titleKey] ?? game.titleKey}
      </Text>
      {line ? <Text style={[readingAt(text.passage), styles.line]}>{line}</Text> : null}
      {state.phase === 'closing' ? null : <BackToElevatorButton onPress={onExit} size={text.label + 2} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: eq.night },
  center: { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },
  title: { color: eq.amber, textAlign: 'center' },
  line: { color: eq.text, textAlign: 'center', maxWidth: 520 },
});
