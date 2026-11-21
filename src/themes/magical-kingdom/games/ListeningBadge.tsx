// "Listen first": the badge under the printed line while the game says what must be heard. A tap on a held
// control (a choice, the star, Help) is answered here at once: the badge turns gold and, unless pictures are
// still, swells once. A held tap never gets silence, and never cuts the voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { MagicIcon } from '../ui/MagicArt';
import { magic as P } from '../ui/palette';
import type { ReadingFont } from '../ui/readingFont';

/** How long the badge stays gold after the last held tap. One change each way however fast she taps: far under 3 Hz. */
export const HEARD_MS = 900;

/** `onLocked` is what a held control calls when it is touched; `heard` is true from that touch until HEARD_MS after the last one. */
export function useHeldTaps(): { heard: boolean; onLocked: () => void } {
  const [heard, setHeard] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onLocked = useCallback(() => {
    setHeard(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHeard(false);
    }, HEARD_MS);
  }, []);
  return { heard, onLocked };
}

export function ListeningBadge({ testID, label, heard, still, font }: { testID: string; label: string; heard: boolean; still: boolean; font: ReadingFont }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    // One swell when a held tap arrives. Still pictures: the colour change alone.
    if (heard && !still) scale.set(withSequence(withTiming(1.14, { duration: 120 }), withTiming(1, { duration: 200 })));
    else scale.set(1);
  }, [heard, still, scale]);
  const swell = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View testID={heard ? `${testID}-heard` : testID} accessibilityLabel={label} style={[s.badge, heard && s.heard, swell]}>
    <MagicIcon kind="ear" size={20} />
    <Text style={[s.text, heard && s.heardText, font.bold]}>{label}</Text>
  </Animated.View>;
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: P.cream, borderRadius: 14, borderWidth: 2, borderColor: P.gold, paddingHorizontal: 8, paddingVertical: 3 },
  heard: { backgroundColor: P.gold, borderColor: P.bark },
  text: { color: P.dim, fontSize: 14, fontWeight: '700' },
  heardText: { color: P.ink },
});
