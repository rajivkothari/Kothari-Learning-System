// Lifty, the maintenance robot. A small portrait with a few honest expressions and a
// dialogue strip. Text is native, large, and announced to screen readers.
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LiftyMood } from '../director/director';
import type { Box } from './layout';
import { eq } from './palette';

export interface LiftyProps {
  box: Box;
  mood: LiftyMood;
  line: string;
  children?: React.ReactNode;
}

const EYES: Record<LiftyMood, { w: number; h: number; r: number; color: string; tilt: number; dy: number }> = {
  neutral: { w: 14, h: 14, r: 7, color: eq.amberSoft, tilt: 0, dy: 0 },
  thinking: { w: 14, h: 6, r: 3, color: eq.amberSoft, tilt: 0, dy: -2 },
  pointing: { w: 14, h: 14, r: 7, color: eq.clue, tilt: 0, dy: 0 },
  success: { w: 16, h: 7, r: 7, color: eq.ok, tilt: 0, dy: -3 },
  concerned: { w: 13, h: 10, r: 5, color: eq.caution, tilt: 12, dy: 1 },
};

export const Lifty = memo(function Lifty({ box, mood, line, children }: LiftyProps) {
  const eye = EYES[mood];
  const size = Math.min(84, box.height - 12, box.width * 0.18);
  const narrow = box.width < 480;
  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <View style={[styles.head, { width: size, height: size }]} accessibilityLabel={`Lifty looks ${mood}`}>
        <View style={styles.antenna} />
        <View style={styles.visor}>
          {[-1, 1].map((side) => (
            <View
              key={side}
              style={{ width: eye.w, height: eye.h, borderRadius: eye.r, backgroundColor: eye.color, transform: [{ translateY: eye.dy }, { rotate: `${side * eye.tilt}deg` }] }}
            />
          ))}
        </View>
        <View style={styles.mouthGrille} />
      </View>
      <View style={styles.bubble}>
        <Text style={styles.name} allowFontScaling={false}>
          LIFTY
        </Text>
        <Text style={[styles.line, narrow && styles.lineNarrow]} accessibilityLiveRegion="polite" numberOfLines={6} adjustsFontSizeToFit minimumFontScale={0.75}>
          {line}
        </Text>
      </View>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(14,35,64,0.92)', borderWidth: 1, borderColor: eq.deepBlueLight },
  head: { borderRadius: 18, backgroundColor: eq.steel, borderWidth: 2, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center', gap: 6 },
  antenna: { position: 'absolute', top: -9, width: 4, height: 10, borderRadius: 2, backgroundColor: eq.steelLight },
  visor: { flexDirection: 'row', gap: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: eq.night, alignItems: 'center' },
  mouthGrille: { width: 26, height: 4, borderRadius: 2, backgroundColor: eq.charcoal },
  bubble: { flex: 1, justifyContent: 'center' },
  name: { color: eq.clue, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  line: { color: eq.text, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  lineNarrow: { fontSize: 16, lineHeight: 21 },
});
