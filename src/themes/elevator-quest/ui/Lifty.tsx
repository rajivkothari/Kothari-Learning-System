// Lifty, the maintenance robot, and the dialogue strip. Lifty is a compact service unit: boxy
// body, a small digital display for a face, one articulated arm with a pointer tip, a tool clip,
// and two status lamps. Poses come from liftyPose.ts. Nothing idles or bounces; only the system
// check scan line moves, slowly, and not under reduced motion. Text is native, large, and
// announced to screen readers.
import { Canvas, Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { celBands } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';
import type { Box } from './layout';
import { LIFTY_A11Y, liftyPose, type DisplayGlyph } from './liftyPose';
import { READING, TOKENS as T, UI, eq } from './palette';

export interface LiftyProps {
  box: Box;
  mood: LiftyMood;
  line: string;
  reducedMotion?: boolean;
  children?: React.ReactNode;
}

const metal = celBands(T.palette.metal, T);

export const Lifty = memo(function Lifty({ box, mood, line, reducedMotion = false, children }: LiftyProps) {
  // Narrow strips give the words the room: Lifty's figure shrinks first, never the text.
  const narrow = box.width < 560;
  const size = Math.round(Math.min(96, box.height - 12, box.width * (narrow ? 0.14 : 0.2)));
  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]}>
      <View accessible accessibilityLabel={LIFTY_A11Y[mood]} style={{ width: size, height: size }}>
        <LiftyFigure size={size} mood={mood} reducedMotion={reducedMotion} />
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

export const LiftyFigure = memo(function LiftyFigure({ size, mood, reducedMotion }: { size: number; mood: LiftyMood; reducedMotion: boolean }) {
  const pose = liftyPose(mood, T, reducedMotion ? 'reduced' : 'normal');
  const s = size;
  // Body and head boxes in a unit layout scaled to `size`.
  const body = { x: s * 0.2, y: s * 0.46, w: s * 0.5, h: s * 0.44 };
  const head = { x: s * 0.16, y: s * 0.1, w: s * 0.58, h: s * 0.34 };
  const screen = { x: head.x + s * 0.05, y: head.y + s * 0.05, w: head.w - s * 0.1, h: head.h - s * 0.1 };
  const shoulder = { x: body.x + body.w, y: body.y + s * 0.08 };

  const scan = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(scan);
    // 0.5 Hz sweep, far below the 3 Hz limit, and only during a system check.
    if (pose.scanning) scan.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
    else scan.set(0.5);
  }, [scan, pose.scanning]);
  const scanY = useDerivedValue(() => screen.y + 3 + scan.get() * (screen.h - 6));
  const scanP1 = useDerivedValue(() => vec(screen.x + 4, scanY.get()));
  const scanP2 = useDerivedValue(() => vec(screen.x + screen.w - 4, scanY.get()));

  const arm = useMemo(() => {
    // Angles from hanging straight down: 0 = down, 90 = pointing forward (toward the panel).
    const upper = s * 0.2;
    const fore = s * 0.18;
    const sh = (pose.shoulderDeg * Math.PI) / 180;
    const e = { x: shoulder.x + Math.sin(sh) * upper, y: shoulder.y + Math.cos(sh) * upper };
    const el = ((pose.shoulderDeg + pose.elbowDeg) * Math.PI) / 180;
    return { e, tip: { x: e.x + Math.sin(el) * fore, y: e.y + Math.cos(el) * fore } };
  }, [s, pose.shoulderDeg, pose.elbowDeg, shoulder.x, shoulder.y]);

  return (
    <Canvas style={{ width: s, height: s }}>
      {/* Antenna with a lit tip. */}
      <Line p1={vec(head.x + head.w * 0.78, head.y)} p2={vec(head.x + head.w * 0.78, head.y - s * 0.07)} color={metal.edge} strokeWidth={2.5} />
      <Circle cx={head.x + head.w * 0.78} cy={head.y - s * 0.08} r={s * 0.03} color={pose.accent} />

      {/* Body: three flat bands and a selective edge. */}
      <RoundedRect x={body.x} y={body.y} width={body.w} height={body.h} r={s * 0.06} color={metal.base} />
      <Rect x={body.x + body.w * 0.62} y={body.y + 4} width={body.w * 0.38 - 4} height={body.h - 8} color={metal.shadow} />
      <Rect x={body.x + 4} y={body.y + 4} width={body.w * 0.14} height={body.h * 0.5} color={metal.light} opacity={0.7} />
      <RoundedRect x={body.x} y={body.y} width={body.w} height={body.h} r={s * 0.06} color={metal.edge} style="stroke" strokeWidth={2} />
      {/* Status lamps and a tool clip. */}
      <Circle cx={body.x + body.w * 0.3} cy={body.y + body.h * 0.62} r={s * 0.028} color={pose.accent} />
      <Circle cx={body.x + body.w * 0.48} cy={body.y + body.h * 0.62} r={s * 0.028} color={eq.steelDark} />
      <Rect x={body.x - s * 0.06} y={body.y + body.h * 0.35} width={s * 0.06} height={s * 0.16} color={eq.steelLight} />
      <Rect x={body.x - s * 0.085} y={body.y + body.h * 0.3} width={s * 0.11} height={s * 0.04} color={eq.steelLight} />
      {/* Treads. */}
      <RoundedRect x={body.x - s * 0.02} y={body.y + body.h - s * 0.02} width={body.w + s * 0.04} height={s * 0.08} r={s * 0.04} color={metal.edge} />

      {/* Arm: shoulder joint, upper arm, elbow, forearm, pointer tip. */}
      <Line p1={vec(shoulder.x, shoulder.y)} p2={vec(arm.e.x, arm.e.y)} color={metal.light} strokeWidth={s * 0.06} strokeCap="round" />
      <Line p1={vec(arm.e.x, arm.e.y)} p2={vec(arm.tip.x, arm.tip.y)} color={metal.base} strokeWidth={s * 0.05} strokeCap="round" />
      <Circle cx={shoulder.x} cy={shoulder.y} r={s * 0.04} color={metal.edge} />
      <Circle cx={arm.e.x} cy={arm.e.y} r={s * 0.03} color={metal.edge} />
      <Circle cx={arm.tip.x} cy={arm.tip.y} r={s * 0.03} color={pose.accent} />

      {/* Head: housing and the digital display. */}
      <Group transform={[{ rotate: (pose.tiltDeg * Math.PI) / 180 }]} origin={vec(head.x + head.w / 2, head.y + head.h)}>
        <RoundedRect x={head.x} y={head.y} width={head.w} height={head.h} r={s * 0.07} color={metal.base} />
        <Rect x={head.x + 4} y={head.y + 3} width={head.w - 8} height={s * 0.03} color={metal.light} opacity={0.8} />
        <RoundedRect x={head.x} y={head.y} width={head.w} height={head.h} r={s * 0.07} color={metal.edge} style="stroke" strokeWidth={2} />
        <RoundedRect x={screen.x} y={screen.y} width={screen.w} height={screen.h} r={s * 0.04} color="#04070C" />
        <Glyph glyph={pose.glyph} color={pose.accent} r={screen} s={s} />
        {pose.glyph === 'scan' ? <Line p1={scanP1} p2={scanP2} color={pose.accent} strokeWidth={2} /> : null}
      </Group>
    </Canvas>
  );
});

function Glyph({ glyph, color, r, s }: { glyph: DisplayGlyph; color: string; r: { x: number; y: number; w: number; h: number }; s: number }) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const u = s * 0.05;
  const path = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    if (glyph === 'check') b.moveTo(cx - u * 1.6, cy).lineTo(cx - u * 0.4, cy + u * 1.1).lineTo(cx + u * 1.8, cy - u * 1.2);
    else if (glyph === 'arrow') b.moveTo(cx - u * 1.8, cy).lineTo(cx + u * 1.4, cy).moveTo(cx + u * 0.4, cy - u).lineTo(cx + u * 1.5, cy).lineTo(cx + u * 0.4, cy + u);
    else if (glyph === 'level') b.moveTo(cx - u * 1.8, cy + u * 0.3).lineTo(cx + u * 1.8, cy + u * 0.3).moveTo(cx, cy - u * 1.1).lineTo(cx, cy - u * 0.2);
    else if (glyph === 'idle') b.moveTo(cx - u * 1.6, cy).lineTo(cx - u * 0.5, cy).moveTo(cx + u * 0.5, cy).lineTo(cx + u * 1.6, cy);
    return b.build();
  }, [glyph, cx, cy, u]);
  if (glyph === 'dots') {
    return (
      <Group>
        {[-1, 0, 1].map((i) => (
          <Circle key={i} cx={cx + i * u * 1.2} cy={cy} r={u * 0.38} color={color} />
        ))}
      </Group>
    );
  }
  if (glyph === 'scan') return <Rect x={r.x + 4} y={cy - 0.5} width={r.w - 8} height={1} color={color} opacity={0.35} />;
  return <Path path={path} color={color} style="stroke" strokeWidth={Math.max(2, s * 0.035)} strokeCap="round" strokeJoin="round" />;
}

const styles = StyleSheet.create({
  box: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 16, backgroundColor: eq.charcoalLight, borderWidth: 1.5, borderColor: eq.steelEdge },
  bubble: { flex: 1, justifyContent: 'center' },
  name: { ...UI(0.75), color: eq.cyan },
  line: { ...READING(), color: eq.text },
  lineNarrow: { ...READING(0.8) },
});
