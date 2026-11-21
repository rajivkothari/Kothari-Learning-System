// Sound is off: why a hearing game is not offered, said with a picture. The royal games are sound (a word
// to hear, a rhyme, a told story), so with Sound off in Comfort a child who cannot read could only guess,
// and a guess must not become a learning record (DECISIONS.md D212). The games room dims its cards and
// shows this picture on each; a game already open pauses to the same picture until sound is back.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { kingdomSound } from '../audio/soundSwitch';
import { ActionButton } from '../ui/GameControls';
import { MagicIcon } from '../ui/MagicArt';
import { magic as P } from '../ui/palette';
import { useReadingFont } from '../ui/readingFont';
import { label } from './content';
import type { GameAudio } from './flow';

/** Sound must have been off this long, with the app in front, before a screen says so: coming back to the app switches it on a moment after the app is active. */
const SETTLE_MS = 400;

/**
 * True while Sound is switched off and the app is in front. The switch is also off while the app is behind
 * another; that is not something to explain to the child, so it never shows here.
 */
export function useSoundOff(): boolean {
  const off = useSyncExternalStore(kingdomSound.subscribe, kingdomSound.off, () => false);
  const [active, setActive] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => s.remove();
  }, []);
  const want = off && active;
  const [settled, setSettled] = useState(want);
  useEffect(() => {
    const t = setTimeout(() => setSettled(want), want ? SETTLE_MS : 0);
    return () => clearTimeout(t);
  }, [want]);
  return want && settled;
}

/** The castle's audio as a royal game needs it: with whether sound can play, so an ask that cannot sound is held and owed. */
export function useGameAudio(audio: GameAudio): GameAudio {
  return useMemo(() => (audio.canSound ? audio : { ...audio, canSound: () => kingdomSound.canSound() }), [audio]);
}

/** Run `start` now, or as soon as Sound is switched on: a game that cannot be heard is not opened. Returns a cancel. */
export function whenSoundOn(start: () => void): () => void {
  if (!kingdomSound.off()) {
    start();
    return () => undefined;
  }
  const stop = kingdomSound.subscribe(() => {
    if (kingdomSound.off()) return;
    stop();
    start();
  });
  return stop;
}

/** A speaker with a line through it. Never red: nothing is wrong, sound is only switched off. */
export function SoundOffPicture({ size, testID }: { size: number; testID?: string }) {
  const bar = Math.max(4, Math.round(size * 0.1));
  return <View testID={testID} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <MagicIcon kind="sound" size={size} color={P.dim} />
    <View style={[s.bar, { width: size * 1.05, height: bar + 4, borderRadius: bar }]}><View style={{ flex: 1, borderRadius: bar, backgroundColor: P.dim }} /></View>
  </View>;
}

/** What a royal game shows instead of itself while Sound is off: the picture, the words for a grown-up, and the way back. */
export function SoundOffCard({ width, top, bottom, onExit }: { width: number; top: number; bottom: number; onExit: () => void }) {
  const font = useReadingFont();
  return <View testID="game-sound-off" style={[s.root, { top, bottom: Math.max(bottom, 0) }]}>
    <View style={[s.card, { width: Math.min(width - 24, 540) }]} accessibilityLabel={label('soundOff')}>
      <View style={s.art}><SoundOffPicture size={120} /></View>
      <Text accessibilityLiveRegion="polite" style={[s.line, font.bold]}>{label('soundOff')}</Text>
      <View style={s.how}><MagicIcon kind="crown" size={30} color={P.gold} /><Text style={[s.howText, font.regular]}>{label('soundOffHow')}</Text></View>
      <ActionButton testID="game-sound-off-done" label={label('done')} icon="arrow" onPress={onExit} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { alignItems: 'center', gap: 14, backgroundColor: P.paper, borderRadius: 40, borderWidth: 3, borderColor: P.edge, padding: 24, boxShadow: `0 8px 22px ${P.shadow}` },
  art: { width: 168, height: 168, borderRadius: 84, backgroundColor: P.cream, borderWidth: 3, borderColor: P.edge, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', padding: 2, backgroundColor: P.cream, transform: [{ rotate: '-45deg' }] },
  line: { color: P.ink, fontSize: 28, lineHeight: 35, fontWeight: '800', textAlign: 'center' },
  how: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  howText: { color: P.dim, fontSize: 17, lineHeight: 23, fontWeight: '600', flexShrink: 1 },
});
