// Lifty, the maintenance robot, and the dialogue strip. Lifty is a compact service unit: a
// tracked base, a boxy safety-yellow body with a tool clip and two status lamps, a small
// digital display for a face, one articulated arm with a pointer tip, and an antenna lamp.
// Poses come from liftyPose.ts (unchanged): the display glyph, the arm and one accent lamp.
// Nothing idles or bounces; only the system check scan line moves, slowly, and not under
// reduced motion. Text is native, large, and announced to screen readers.
//
// In landscape the Concept D screen stands the figure on the cabin floor (GameScreen places
// LiftyFigure in the cabin's liftyZone) and this strip carries the words beside it.
import { Canvas, Circle, Group, Line, LinearGradient, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useArtStyle } from '../../../presentation/artStyle';
import { celBands, mix, withAlpha } from '../../../presentation/design/tokens';
import type { LiftyMood } from '../director/director';
import type { Box } from './layout';
import { LIFTY_A11Y, liftyPose, type DisplayGlyph } from './liftyPose';
import { READING, TOKENS as T, UI, eq } from './palette';

export interface LiftyProps {
  box: Box;
  mood: LiftyMood;
  line: string;
  reducedMotion?: boolean;
  /** `strip` draws the figure inside the strip (default). `outside` leaves room on the left for a figure placed by the screen. */
  figure?: 'strip' | 'outside';
  /** Width reserved on the left when the figure is outside. */
  inset?: number;
  children?: React.ReactNode;
}

const metal = celBands(T.palette.metal, T);
const body = celBands(T.palette.companion, T);

export const Lifty = memo(function Lifty({ box, mood, line, reducedMotion = false, figure = 'strip', inset = 0, children }: LiftyProps) {
  // Narrow strips give the words the room: Lifty's figure shrinks first, never the text.
  const narrow = box.width < 560;
  const size = Math.round(Math.min(96, box.height - 12, box.width * (narrow ? 0.14 : 0.2)));
  const concept = useArtStyle() === 'concept';
  return (
    <View style={[styles.box, concept && styles.boxConcept, { left: box.x, top: box.y, width: box.width, height: box.height, paddingLeft: figure === 'outside' ? inset : 10 }]}>
      {figure === 'strip' ? (
        <View accessible accessibilityLabel={LIFTY_A11Y[mood]} style={{ width: size, height: size }}>
          <LiftyFigure size={size} mood={mood} reducedMotion={reducedMotion} />
        </View>
      ) : null}
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

/** The figure alone, with its accessibility description, for placing in the scene. */
export const LiftyStanding = memo(function LiftyStanding({ x, y, size, mood, reducedMotion }: { x: number; y: number; size: number; mood: LiftyMood; reducedMotion: boolean }) {
  return (
    <View accessible accessibilityLabel={LIFTY_A11Y[mood]} pointerEvents="none" style={{ position: 'absolute', left: x, top: y, width: size, height: size }}>
      <LiftyFigure size={size} mood={mood} reducedMotion={reducedMotion} />
    </View>
  );
});

export const LiftyFigure = memo(function LiftyFigure({ size, mood, reducedMotion }: { size: number; mood: LiftyMood; reducedMotion: boolean }) {
  const pose = liftyPose(mood, T, reducedMotion ? 'reduced' : 'normal');
  const s = size;
  // Unit layout scaled to `size`: base at the bottom, body, a short neck, the head on top.
  const base = { x: s * 0.1, y: s * 0.8, w: s * 0.62, h: s * 0.14 };
  const bodyR = { x: s * 0.15, y: s * 0.46, w: s * 0.52, h: s * 0.36 };
  const head = { x: s * 0.12, y: s * 0.13, w: s * 0.58, h: s * 0.29 };
  const screen = { x: head.x + s * 0.045, y: head.y + s * 0.045, w: head.w - s * 0.09, h: head.h - s * 0.09 };
  const shoulder = { x: bodyR.x + bodyR.w, y: bodyR.y + s * 0.07 };

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
    const tip = { x: e.x + Math.sin(el) * fore, y: e.y + Math.cos(el) * fore };
    // A two-finger pointer tip, splayed around the forearm direction.
    const dx = Math.sin(el);
    const dy = Math.cos(el);
    const f = s * 0.06;
    return { e, tip, fingerA: { x: tip.x + dx * f - dy * f * 0.6, y: tip.y + dy * f + dx * f * 0.6 }, fingerB: { x: tip.x + dx * f + dy * f * 0.6, y: tip.y + dy * f - dx * f * 0.6 } };
  }, [s, pose.shoulderDeg, pose.elbowDeg, shoulder.x, shoulder.y]);

  const wheels = [0.18, 0.5, 0.82].map((k) => ({ cx: base.x + base.w * k, cy: base.y + base.h * 0.55, r: base.h * 0.42 }));
  return (
    <Canvas style={{ width: s, height: s }}>
      {/* Tracked base: a dark tread band over three wheels. */}
      <RoundedRect x={base.x - s * 0.03} y={base.y} width={base.w + s * 0.06} height={base.h} r={base.h / 2} color={metal.edge} />
      {wheels.map((wh, i) => (
        <Group key={i}>
          <Circle cx={wh.cx} cy={wh.cy} r={wh.r} color={metal.shadow} />
          <Circle cx={wh.cx} cy={wh.cy} r={wh.r * 0.45} color={body.base} />
        </Group>
      ))}
      <Line p1={vec(base.x, base.y + 1.5)} p2={vec(base.x + base.w, base.y + 1.5)} color={withAlpha(T.palette.light, 0.25)} strokeWidth={1.5} />

      {/* Body: safety-yellow housing, lit from the top left, with a dark instrument panel. */}
      <RoundedRect x={bodyR.x} y={bodyR.y} width={bodyR.w} height={bodyR.h} r={s * 0.06}>
        <LinearGradient start={vec(bodyR.x, bodyR.y)} end={vec(bodyR.x + bodyR.w, bodyR.y + bodyR.h)} colors={[body.light, body.base, body.shadow]} positions={[0, 0.45, 1]} />
      </RoundedRect>
      <RoundedRect x={bodyR.x} y={bodyR.y} width={bodyR.w} height={bodyR.h} r={s * 0.06} color={body.edge} style="stroke" strokeWidth={2} />
      <Rect x={bodyR.x + 4} y={bodyR.y + 4} width={bodyR.w * 0.3} height={3} color={withAlpha(T.palette.light, 0.5)} />
      <RoundedRect x={bodyR.x + bodyR.w * 0.14} y={bodyR.y + bodyR.h * 0.42} width={bodyR.w * 0.72} height={bodyR.h * 0.42} r={3} color={metal.shadow} />
      {/* Status lamps: the accent (state) and a steady working-light cyan. Never red. */}
      <Circle cx={bodyR.x + bodyR.w * 0.32} cy={bodyR.y + bodyR.h * 0.63} r={s * 0.03} color={pose.accent} />
      <Circle cx={bodyR.x + bodyR.w * 0.52} cy={bodyR.y + bodyR.h * 0.63} r={s * 0.03} color={eq.cyan} opacity={0.8} />
      <Rect x={bodyR.x + bodyR.w * 0.66} y={bodyR.y + bodyR.h * 0.56} width={bodyR.w * 0.14} height={bodyR.h * 0.14} color={metal.base} />
      {/* Tool clip on the left flank. */}
      <Rect x={bodyR.x - s * 0.06} y={bodyR.y + bodyR.h * 0.3} width={s * 0.06} height={s * 0.16} color={metal.light} />
      <Rect x={bodyR.x - s * 0.085} y={bodyR.y + bodyR.h * 0.26} width={s * 0.11} height={s * 0.04} color={metal.light} />
      {/* Neck. */}
      <Rect x={head.x + head.w * 0.42} y={head.y + head.h - 2} width={head.w * 0.16} height={bodyR.y - head.y - head.h + 4} color={metal.shadow} />

      {/* Arm: shoulder joint, upper arm, elbow, forearm, two-finger pointer tip. */}
      <Line p1={vec(shoulder.x, shoulder.y)} p2={vec(arm.e.x, arm.e.y)} color={body.base} strokeWidth={s * 0.065} strokeCap="round" />
      <Line p1={vec(shoulder.x, shoulder.y)} p2={vec(arm.e.x, arm.e.y)} color={body.edge} strokeWidth={s * 0.065} strokeCap="round" opacity={0.25} />
      <Line p1={vec(arm.e.x, arm.e.y)} p2={vec(arm.tip.x, arm.tip.y)} color={metal.light} strokeWidth={s * 0.05} strokeCap="round" />
      <Line p1={vec(arm.tip.x, arm.tip.y)} p2={vec(arm.fingerA.x, arm.fingerA.y)} color={metal.edge} strokeWidth={s * 0.03} strokeCap="round" />
      <Line p1={vec(arm.tip.x, arm.tip.y)} p2={vec(arm.fingerB.x, arm.fingerB.y)} color={metal.edge} strokeWidth={s * 0.03} strokeCap="round" />
      <Circle cx={shoulder.x} cy={shoulder.y} r={s * 0.045} color={metal.edge} />
      <Circle cx={arm.e.x} cy={arm.e.y} r={s * 0.035} color={metal.edge} />
      <Circle cx={arm.tip.x} cy={arm.tip.y} r={s * 0.03} color={pose.accent} />

      {/* Head: housing and the digital display, with the antenna lamp and a cyan beacon. */}
      <Group transform={[{ rotate: (pose.tiltDeg * Math.PI) / 180 }]} origin={vec(head.x + head.w / 2, head.y + head.h)}>
        <Line p1={vec(head.x + head.w * 0.2, head.y)} p2={vec(head.x + head.w * 0.2, head.y - s * 0.07)} color={metal.edge} strokeWidth={2.5} />
        <Circle cx={head.x + head.w * 0.2} cy={head.y - s * 0.085} r={s * 0.032} color={pose.accent} />
        <RoundedRect x={head.x + head.w * 0.68} y={head.y - s * 0.05} width={head.w * 0.14} height={s * 0.05} r={2} color={eq.cyan} opacity={0.9} />
        <RoundedRect x={head.x} y={head.y} width={head.w} height={head.h} r={s * 0.07}>
          <LinearGradient start={vec(head.x, head.y)} end={vec(head.x, head.y + head.h)} colors={[body.light, body.base, body.shadow]} positions={[0, 0.5, 1]} />
        </RoundedRect>
        <Rect x={head.x + 4} y={head.y + 3} width={head.w - 8} height={s * 0.025} color={withAlpha(T.palette.light, 0.55)} />
        <RoundedRect x={head.x} y={head.y} width={head.w} height={head.h} r={s * 0.07} color={body.edge} style="stroke" strokeWidth={2} />
        <RoundedRect x={screen.x} y={screen.y} width={screen.w} height={screen.h} r={s * 0.04} color="#04070C" />
        <Rect x={screen.x + 3} y={screen.y + 2} width={screen.w - 6} height={screen.h * 0.22} color={withAlpha(T.palette.light, 0.06)} />
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
    // Ready: two soft chevrons, the display's "eyes".
    else if (glyph === 'idle') b.moveTo(cx - u * 2, cy + u * 0.4).lineTo(cx - u * 1.2, cy - u * 0.5).lineTo(cx - u * 0.4, cy + u * 0.4).moveTo(cx + u * 0.4, cy + u * 0.4).lineTo(cx + u * 1.2, cy - u * 0.5).lineTo(cx + u * 2, cy + u * 0.4);
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
  boxConcept: { backgroundColor: mix(T.palette.surface[1], T.palette.void, 0.3), borderColor: mix(T.palette.brass, T.palette.void, 0.4) },
  bubble: { flex: 1, justifyContent: 'center' },
  name: { ...UI(0.75), color: eq.cyan },
  line: { ...READING(), color: eq.text },
  lineNarrow: { ...READING(0.8) },
});
