// Lifty, the maintenance robot, in the scene. Lifty stands at eye level between the floor
// indicator and the door frame (see liftyPlacement.ts), with a speech bubble beside it, and moves
// within that band with the job: toward the panel or the shaft map when the help is about them,
// above the crates or the test run when those take the stage. Under reduced motion Lifty moves
// instantly. Lifty is a compact service unit: boxy body, a small digital display for a face, one
// articulated arm with a pointer tip, a tool clip, and two status lamps. Poses come from
// liftyPose.ts. Nothing bounces; the system check scan line and a barely visible hover (D133) are
// the only loops, slow, and off under reduced motion. Text is native, large, sized to fit, and
// announced to screen readers. With production art, each mood is a still pose image (art manifest),
// and the vector figure stays as its fallback.
import { Canvas, Circle, Group, Image, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { celBands } from '../../../presentation/design/tokens';
import { LIFTY_CANVAS, liftyArt, type LiftyArtPose } from '../art/manifest';
import { contain } from '../art/fit';
import type { LiftyMood } from '../director/director';
import { BUBBLE_PAD, MIN_LINE_FONT, NAME_HEIGHT, fitLine, liftyMoveMs, type LiftyPlacement } from './liftyPlacement';
import { LIFTY_A11Y, LIFTY_HOVER, POSE_MOOD, hoverAmplitude, liftyArtPose, liftyPose, type DisplayGlyph } from './liftyPose';
import { useArt } from './art/ArtContext';
import { useArtImage } from './art/ArtSlot';
import { READING, TOKENS as T, UI, eq } from './palette';

export interface LiftyProps {
  placement: LiftyPlacement;
  mood: LiftyMood;
  line: string;
  reducedMotion?: boolean;
  /** The car is moving: a silent ride shows the Quiet pose (D137). */
  traveling?: boolean;
}

const metal = celBands(T.palette.metal, T);

export const Lifty = memo(function Lifty({ placement, mood, line, reducedMotion = false, traveling = false }: LiftyProps) {
  const { figure, bubble, side } = placement;
  const fx = useSharedValue(figure.x);
  const fy = useSharedValue(figure.y);
  const bx = useSharedValue(bubble.x);
  const bw = useSharedValue(bubble.width);
  useEffect(() => {
    // Reduced motion: Lifty is simply in the new place.
    const ms = liftyMoveMs(reducedMotion);
    const to = (v: typeof fx, target: number) => v.set(ms === 0 ? target : withTiming(target, { duration: ms, easing: Easing.inOut(Easing.cubic) }));
    to(fx, figure.x);
    to(fy, figure.y);
    to(bx, bubble.x);
    to(bw, bubble.width);
  }, [fx, fy, bx, bw, figure.x, figure.y, bubble.x, bubble.width, reducedMotion]);
  // The hover rides on top of the placement, on the UI thread.
  const hover = useSharedValue(0);
  const amp = hoverAmplitude(figure.height, reducedMotion);
  useEffect(() => {
    cancelAnimation(hover);
    if (amp === 0) hover.set(0);
    else hover.set(withRepeat(withTiming(1, { duration: LIFTY_HOVER.cycleMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [hover, amp]);
  // A transform, not a layout change: the hover costs no layout pass.
  const figureStyle = useAnimatedStyle(() => ({ left: fx.get(), top: fy.get(), transform: [{ translateY: -amp * hover.get() }] }));
  const art = useArt();
  // The developer tools can force a pose; the vector figure shows the matching mood.
  const pose = art.liftyPose ?? liftyArtPose(mood, traveling, line !== '');
  const shown = art.liftyPose ? POSE_MOOD[art.liftyPose] : mood;
  const bubbleStyle = useAnimatedStyle(() => ({ left: bx.get(), width: bw.get() }));
  const size = fitLine(line, bubble) ?? MIN_LINE_FONT;
  return (
    <>
      <Animated.View accessible accessibilityLabel={LIFTY_A11Y[shown]} pointerEvents="none" style={[styles.figure, { width: figure.width, height: figure.height }, figureStyle]}>
        {/* The square drawing starts an empty strip to the left of the figure box (liftyPlacement). */}
        <View style={[styles.drawing, { left: -LIFTY_CANVAS.emptyLeft * figure.height, width: figure.height, height: figure.height }]}>
          <LiftyPoseImage size={figure.height} pose={pose} fallback={<LiftyFigure size={figure.height} mood={shown} reducedMotion={reducedMotion} />} />
        </View>
      </Animated.View>
      {/* Nothing to say (a routine ride, a quiet arrival): Lifty stays, the bubble goes. */}
      {line ? (
        <Animated.View pointerEvents="none" style={[styles.bubble, { top: bubble.y, height: bubble.height }, bubbleStyle]}>
          <View style={[styles.tail, side === 'left' ? styles.tailLeft : styles.tailRight, { top: Math.max(10, figure.y + figure.height * 0.3 - bubble.y) }]} />
          <Text style={styles.name} allowFontScaling={false}>
            LIFTY
          </Text>
          <Text style={[styles.line, { fontSize: size, lineHeight: Math.round(size * 1.3) }]} accessibilityLiveRegion="polite" adjustsFontSizeToFit minimumFontScale={0.85}>
            {line}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );
});

/** Lifty's pose image (art manifest), standing on the figure's baseline; the vector figure until it loads. */
function LiftyPoseImage({ size, pose, fallback }: { size: number; pose: LiftyArtPose; fallback: ReactNode }) {
  // Read outside the Canvas: context does not reach Skia's renderer (see ArtSlot).
  const art = useArt();
  const entry = liftyArt(art.set, pose, art.liftyPose !== null);
  const image = useArtImage(entry, art);
  if (!entry || !image) return <>{fallback}</>;
  // The canvas's baseline sits on the figure box's baseline at the same fraction.
  const r = contain({ x: 0, y: 0, w: size, h: size }, { width: entry.width, height: entry.height }, { x: LIFTY_CANVAS.centerX, y: 1 });
  return (
    <Canvas style={{ width: size, height: size }}>
      <Image image={image} x={r.x} y={r.y} width={r.w} height={r.h} fit="cover" />
    </Canvas>
  );
}

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
  figure: { position: 'absolute', overflow: 'visible' },
  drawing: { position: 'absolute', top: 0 },
  bubble: {
    position: 'absolute',
    paddingHorizontal: BUBBLE_PAD.x,
    paddingVertical: BUBBLE_PAD.y,
    borderRadius: 14,
    backgroundColor: 'rgba(14,20,30,0.92)',
    borderWidth: 1.5,
    borderColor: eq.steelEdge,
    justifyContent: 'center',
  },
  tail: { position: 'absolute', width: 14, height: 14, backgroundColor: 'rgba(14,20,30,0.92)', borderColor: eq.steelEdge, transform: [{ rotate: '45deg' }] },
  tailLeft: { left: -8, borderLeftWidth: 1.5, borderBottomWidth: 1.5 },
  tailRight: { right: -8, borderRightWidth: 1.5, borderTopWidth: 1.5 },
  name: { ...UI(0.7), color: eq.cyan, height: NAME_HEIGHT },
  line: { ...READING(), color: eq.text },
});
