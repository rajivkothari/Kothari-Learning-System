// The hole, drawn: a mown green with wooden rails, walls and steel posts, the tee mat, the cup and its
// flag, the ball, and (while aiming) a dotted aim line. Cel-shaded: flat bands, no gradients, no blur.
//
// A putt is played back from its path (physics.ts, one point a frame) on the UI thread: the ball
// follows the same points the tests check. Under Reduced Motion the ball still rolls its path (the
// putt is the information), but nothing flourishes: no ring spreading from the cup, no flag flutter;
// a sunk ball shows still, in the cup, with a check on the flag.
import { Canvas, Circle, Group, Line, Path, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Box } from '../../ui/layout';
import type { HoleSpec } from './course';
import type { Phase } from './game';
import { GOLF } from './look';
import { toScreen, type CourseView } from './layout';
import { PHYS, pathSeconds, type ShotResult, type Vec } from './physics';

export interface CourseCanvasProps {
  box: Box;
  view: CourseView;
  hole: HoleSpec;
  ball: Vec;
  aim: number;
  power: number;
  phase: Phase;
  shot: ShotResult | null;
  rollSeq: number;
  reducedMotion: boolean;
  /** Freeze any playback where it ends (the app is in the background). */
  suspended: boolean;
}

/** Rail thickness in course units. */
const RAIL = 2.6;
/** The aim line: this long at no power, plus this much at full power (course units). */
const AIM_BASE = 14;
const AIM_SPAN = 34;
const AIM_DOTS = 9;

/**
 * The flag's stretch out from its pole as the ball drops (1 = rest): two soft flaps, the second
 * smaller, over the 900 ms cheer (about 2 Hz, under 3 Hz). Only ever wider, so it never shrinks.
 */
export function flagFlap(k: number): number {
  'worklet';
  if (k <= 0 || k >= 1) return 1;
  const flap = k < 0.5 ? Math.sin(Math.PI * (k / 0.5)) : 0.45 * Math.sin(Math.PI * ((k - 0.5) / 0.5));
  return 1 + 0.15 * Math.max(0, flap);
}

function polygonPath(points: readonly Vec[]): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach((p, i) => (i === 0 ? b.moveTo(p.x, p.y) : b.lineTo(p.x, p.y)));
  b.close();
  return b.build();
}

export const CourseCanvas = memo(function CourseCanvas({ box, view, hole, ball, aim, power, phase, shot, rollSeq, reducedMotion, suspended }: CourseCanvasProps) {
  // Drawn in the canvas's own space (its top-left is the box's).
  const v = useMemo((): CourseView => ({ ...view, x: view.x - box.x, y: view.y - box.y }), [view, box.x, box.y]);
  const at = (p: Vec) => toScreen(v, p);
  const s = v.scale;
  const green = useMemo(() => polygonPath(hole.green.map((p) => toScreen(v, p))), [hole, v]);
  // Mown stripes across the green (the lighter band every other strip), clipped to it.
  const stripes = useMemo(() => {
    const out: { a: Vec; b: Vec }[] = [];
    for (let y = 0; y < hole.size.h; y += 16) out.push({ a: toScreen(v, { x: 0, y: y + 4 }), b: toScreen(v, { x: hole.size.w, y: y + 4 }) });
    return out;
  }, [hole, v]);
  const cup = at(hole.cup);
  const tee = at(hole.tee);
  const ballR = Math.max(5, PHYS.ballR * s);
  const cupR = PHYS.cupR * s;
  const pole = Math.min(90, Math.max(34, 18 * s));
  const sunk = phase === 'sunk' || phase === 'summary';
  const rolling = phase === 'rolling' && shot !== null;

  // ---- the putt's playback ----
  const xs = useMemo(() => (shot ? shot.path.map((p) => toScreen(v, p).x) : []), [shot, v]);
  const ys = useMemo(() => (shot ? shot.path.map((p) => toScreen(v, p).y) : []), [shot, v]);
  const cupFrame = shot?.events.find((e) => e.kind === 'cup')?.frame ?? -1;
  const progress = useSharedValue(rolling ? 0 : 1);
  useEffect(() => {
    if (!rolling || !shot) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: Math.max(16, pathSeconds(shot) * 1000), easing: Easing.linear }));
    // A new putt (rollSeq) replays from the start; nothing else restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq, rolling]);
  useEffect(() => {
    if (suspended) progress.set(1);
  }, [suspended, progress]);
  const rest = sunk ? cup : at(ball);
  const restX = rest.x;
  const restY = rest.y;
  const n = xs.length;
  const pick = (arr: number[], p: number, fallback: number) => {
    'worklet';
    if (arr.length === 0) return fallback;
    const f = Math.min(1, Math.max(0, p)) * (arr.length - 1);
    const i = Math.floor(f);
    const a = arr[i]!;
    const b = arr[Math.min(arr.length - 1, i + 1)]!;
    return a + (b - a) * (f - i);
  };
  const bx = useDerivedValue(() => (rolling ? pick(xs, progress.get(), restX) : restX));
  const by = useDerivedValue(() => (rolling ? pick(ys, progress.get(), restY) : restY));
  // Dropping into the cup: the ball shrinks and fades over its last frames.
  const drop = useDerivedValue(() => {
    if (sunk) return 1;
    if (!rolling || cupFrame < 0 || n < 2) return 0;
    const f = progress.get() * (n - 1);
    return Math.min(1, Math.max(0, (f - cupFrame) / Math.max(1, n - 1 - cupFrame)));
  });
  const ballOpacity = useDerivedValue(() => (sunk ? 0 : 1 - 0.85 * drop.get()));
  const ballScale = useDerivedValue(() => 1 - 0.45 * drop.get());
  const ballTransform = useDerivedValue(() => [{ translateX: bx.get() }, { translateY: by.get() }, { scale: ballScale.get() }]);
  const shadowTransform = useDerivedValue(() => [{ translateX: bx.get() }, { translateY: by.get() + ballR * 0.55 }, { scaleY: 0.4 }]);

  // ---- the cup answers once: a soft ring and the flag flaps (still under Reduced Motion) ----
  const cheer = useSharedValue(sunk ? 1 : 0);
  useEffect(() => {
    if (!sunk) {
      cheer.set(0);
      return;
    }
    if (reducedMotion) {
      cheer.set(1);
      return;
    }
    cheer.set(0);
    cheer.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [sunk, reducedMotion, cheer]);
  const ringOpacity = useDerivedValue(() => (reducedMotion ? (sunk ? 0.5 : 0) : Math.sin(Math.PI * cheer.get()) * 0.7));
  const ringR = useDerivedValue(() => cupR * (reducedMotion ? 1.8 : 1.2 + 1.6 * cheer.get()));
  const flagX = useDerivedValue(() => (reducedMotion || !sunk ? 1 : flagFlap(cheer.get())));
  const flagTransform = useDerivedValue(() => [{ translateX: cup.x }, { scaleX: flagX.get() }, { translateX: -cup.x }]);

  // ---- the aim line ----
  const aiming = phase === 'aim';
  const dots = useMemo(() => {
    if (!aiming) return [];
    const len = AIM_BASE + AIM_SPAN * power;
    const dir = { x: Math.cos(aim), y: Math.sin(aim) };
    return Array.from({ length: AIM_DOTS }, (_, i) => {
      const d = PHYS.ballR * 2 + (len * (i + 1)) / AIM_DOTS;
      return toScreen(v, { x: ball.x + dir.x * d, y: ball.y + dir.y * d });
    });
  }, [aiming, aim, power, ball, v]);
  const arrow = useMemo(() => {
    if (dots.length < 2) return null;
    const tip = dots[dots.length - 1]!;
    const back = dots[dots.length - 2]!;
    const dx = tip.x - back.x;
    const dy = tip.y - back.y;
    const l = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / l;
    const uy = dy / l;
    const size = Math.max(9, ballR * 1.3);
    const b = Skia.PathBuilder.Make();
    b.moveTo(tip.x + ux * size, tip.y + uy * size);
    b.lineTo(tip.x - uy * size * 0.7, tip.y + ux * size * 0.7);
    b.lineTo(tip.x + uy * size * 0.7, tip.y - ux * size * 0.7);
    b.close();
    return b.build();
  }, [dots, ballR]);

  const flagPath = useMemo(() => {
    const top = cup.y - pole;
    const w = Math.max(16, pole * 0.5);
    const h = Math.max(11, pole * 0.32);
    const b = Skia.PathBuilder.Make();
    b.moveTo(cup.x + 1.5, top);
    b.lineTo(cup.x + 1.5 + w, top + h * 0.5);
    b.lineTo(cup.x + 1.5, top + h);
    b.close();
    return { cloth: b.build(), top, w, h };
  }, [cup.x, cup.y, pole]);
  const check = useMemo(() => {
    const { top, w, h } = flagPath;
    const b = Skia.PathBuilder.Make();
    b.moveTo(cup.x + w * 0.18, top + h * 0.52);
    b.lineTo(cup.x + w * 0.34, top + h * 0.74);
    b.lineTo(cup.x + w * 0.62, top + h * 0.28);
    return b.build();
  }, [flagPath, cup.x]);

  return (
    <Canvas style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height }} pointerEvents="none">
      {/* Fringe under the rails, then the green with its mown stripes. */}
      <Path path={green} color={GOLF.fringe.base} style="stroke" strokeWidth={RAIL * s * 2.6} strokeJoin="round" />
      <Path path={green} color={GOLF.green.base} />
      <Group clip={green}>
        {stripes.map((st, i) => (
          <Line key={i} p1={vec(st.a.x, st.a.y)} p2={vec(st.b.x, st.b.y)} color={GOLF.green.light} strokeWidth={8 * s} opacity={0.32} />
        ))}
        {/* A shadow band along the rails' inside (cel: one flat band). */}
        <Path path={green} color={GOLF.green.shadow} style="stroke" strokeWidth={RAIL * s * 2.2} strokeJoin="round" opacity={0.55} />
      </Group>
      {/* Rails: edge, wood, a light stripe. */}
      <Path path={green} color={GOLF.rail.edge} style="stroke" strokeWidth={RAIL * s + 3} strokeJoin="round" />
      <Path path={green} color={GOLF.rail.base} style="stroke" strokeWidth={RAIL * s} strokeJoin="round" />
      <Path path={green} color={GOLF.rail.light} style="stroke" strokeWidth={Math.max(1, RAIL * s * 0.25)} strokeJoin="round" opacity={0.8} />
      {hole.walls.map((w, i) => {
        const a = at(w.a);
        const b = at(w.b);
        return (
          <Group key={`w${i}`}>
            <Line p1={vec(a.x, a.y)} p2={vec(b.x, b.y)} color={GOLF.rail.edge} strokeWidth={RAIL * s * 1.4 + 3} strokeCap="round" />
            <Line p1={vec(a.x, a.y)} p2={vec(b.x, b.y)} color={GOLF.rail.base} strokeWidth={RAIL * s * 1.4} strokeCap="round" />
            <Line p1={vec(a.x, a.y)} p2={vec(b.x, b.y)} color={GOLF.rail.light} strokeWidth={Math.max(1, RAIL * s * 0.3)} strokeCap="round" opacity={0.8} />
          </Group>
        );
      })}
      {hole.bumpers.map((b, i) => {
        const c = at(b);
        const r = b.r * s;
        return (
          <Group key={`b${i}`}>
            <Circle cx={c.x} cy={c.y + r * 0.18} r={r} color={GOLF.shadow} opacity={0.35} />
            <Circle cx={c.x} cy={c.y} r={r} color={GOLF.post.edge} />
            <Circle cx={c.x} cy={c.y} r={r * 0.86} color={GOLF.post.base} />
            <Circle cx={c.x} cy={c.y} r={r * 0.5} color={GOLF.postCap} />
            <Circle cx={c.x - r * 0.3} cy={c.y - r * 0.32} r={r * 0.18} color={GOLF.post.light} />
          </Group>
        );
      })}
      {/* The tee mat. */}
      <RoundedRect x={tee.x - 7 * s} y={tee.y - 4.5 * s} width={14 * s} height={9 * s} r={2 * s} color={GOLF.tee} opacity={0.32} />
      {/* The cup: a dark hole with a rim; the sunk ball shows in it. */}
      <Circle cx={cup.x} cy={cup.y} r={cupR + Math.max(1.5, s * 0.6)} color={GOLF.cupRim} />
      <Circle cx={cup.x} cy={cup.y} r={cupR} color={GOLF.cup} />
      {sunk ? <Circle cx={cup.x} cy={cup.y + cupR * 0.15} r={ballR * 0.6} color={GOLF.ball} opacity={0.75} /> : null}
      <Circle cx={cup.x} cy={cup.y} r={ringR} color={GOLF.ring} style="stroke" strokeWidth={Math.max(2, s * 0.8)} opacity={ringOpacity} />
      {/* The ball (and its shadow) under the flag's pole. */}
      <Group transform={shadowTransform} opacity={ballOpacity}>
        <Circle cx={0} cy={0} r={ballR} color={GOLF.shadow} opacity={0.4} />
      </Group>
      <Group transform={ballTransform} opacity={ballOpacity}>
        <Circle cx={0} cy={0} r={ballR} color={GOLF.ball} />
        <Circle cx={-ballR * 0.3} cy={-ballR * 0.3} r={ballR * 0.3} color={GOLF.green.light} opacity={0.35} />
        <Circle cx={0} cy={0} r={ballR} color={GOLF.ballEdge} style="stroke" strokeWidth={1.2} />
      </Group>
      {/* The flag: a steel pole from the cup, the orange cloth; a check on it once the ball is in. */}
      <Line p1={vec(cup.x, cup.y)} p2={vec(cup.x, cup.y - pole)} color={GOLF.pole} strokeWidth={Math.max(2.5, s * 0.8)} strokeCap="round" />
      <Group transform={flagTransform}>
        <Path path={flagPath.cloth} color={GOLF.flag} />
        <Path path={flagPath.cloth} color={GOLF.flagShade} style="stroke" strokeWidth={1.5} strokeJoin="round" />
        {sunk ? <Path path={check} color={GOLF.flagMark} style="stroke" strokeWidth={Math.max(2.5, flagPath.h * 0.16)} strokeCap="round" strokeJoin="round" /> : null}
      </Group>
      {/* The aim line: dots from the ball, longer with more power, and an arrowhead. */}
      {/* Kept on the green: the line stops at the rails. */}
      <Group clip={green}>
        {dots.map((d, i) => (
          <Circle key={`d${i}`} cx={d.x} cy={d.y} r={Math.max(2.2, ballR * 0.32)} color={GOLF.aim} opacity={0.55 + (0.4 * i) / AIM_DOTS} />
        ))}
        {arrow ? <Path path={arrow} color={GOLF.aim} /> : null}
      </Group>
    </Canvas>
  );
});
