// Draws any landing from its shape list (ui/landingArt.ts). One generic renderer: a floor's
// identity is data, so there is no per-floor component. Skia primitives only: rect, rounded
// rect, circle, path, line.
//
// The landing's hero (the touchable thing, landingArt.heroFor) is drawn in the silhouette's layer.
// A reaction plays when `reaction` changes: one progress value runs 0 to 1 on the UI thread and
// each part derives its pose from it (heroPose). Cheap transforms and opacity only.
import { Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import type { Landing } from '../content/landings';
import { REACTION_MS, heroFor, heroPose, landingArt, landingColors, type HeroPart, type LandingColors, type Shape } from './landingArt';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LandingLayer = memo(function LandingLayer({ landing, door, reaction = 0, reducedMotion = false }: { landing: Landing; door: Box; reaction?: number; reducedMotion?: boolean }) {
  const colors = useMemo(() => landingColors(landing), [landing]);
  const art = useMemo(() => landingArt(landing, door.w / door.h), [landing, door.w, door.h]);
  const shapes = useMemo(() => art.shapes.map((s) => toPixels(s, door)), [art, door]);
  const hero = useMemo(() => heroFor(landing, door.w / door.h), [landing, door.w, door.h]);
  // Reaction progress: 1 is rest. A new reaction runs it from 0 again.
  const progress = useSharedValue(1);
  // A new place starts at rest (declared first: when a place and a reaction arrive together, as
  // Floor 15 coming back with its core waking, the reaction wins).
  useEffect(() => progress.set(1), [progress, landing]);
  useEffect(() => {
    if (reaction === 0) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: REACTION_MS[reducedMotion ? 'reduced' : 'normal'], easing: Easing.linear }));
  }, [progress, reaction, reducedMotion]);
  return (
    <Group>
      {shapes.slice(0, art.heroIndex).map((s, i) => drawShape(s, i, colors))}
      {hero?.parts.map((part, i) => <HeroPartLayer key={`${landing.id}-${i}`} part={part} door={door} colors={colors} progress={progress} reduced={reducedMotion} />)}
      {shapes.slice(art.heroIndex).map((s, i) => drawShape(s, art.heroIndex + i, colors))}
      <Rect x={door.x} y={door.y} width={door.w} height={door.h} color={art.wash.color} opacity={art.wash.opacity} />
    </Group>
  );
});

function HeroPartLayer({ part, door, colors, progress, reduced }: { part: HeroPart; door: Box; colors: LandingColors; progress: SharedValue<number>; reduced: boolean }) {
  const shapes = useMemo(() => part.shapes.map((s) => toPixels(s, door)), [part, door]);
  const origin = useMemo(() => vec(door.x + part.pivot.x * door.w, door.y + part.pivot.y * door.h), [part, door]);
  const motion = part.motion;
  const amount = part.amount;
  const base = part.base;
  const doorW = door.w;
  const transform = useDerivedValue(() => {
    const pose = heroPose({ motion, amount, base }, progress.get(), reduced);
    return [{ translateX: pose.dx * doorW }, { rotate: pose.rotate }];
  });
  const opacity = useDerivedValue(() => heroPose({ motion, amount, base }, progress.get(), reduced).opacity);
  return (
    <Group origin={origin} transform={transform} opacity={opacity}>
      {shapes.map((s, i) => drawShape(s, i, colors))}
    </Group>
  );
}

/** One shape in pixels, as a Skia primitive (also used for the Engineer Log's emblems). */
export function drawShape(s: Pixel, i: number, colors: LandingColors) {
  const color = colors[s.role];
  const opacity = s.opacity ?? 1;
  switch (s.kind) {
    case 'rect':
      return s.r ? <RoundedRect key={i} x={s.x} y={s.y} width={s.w} height={s.h} r={s.r} color={color} opacity={opacity} /> : <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} color={color} opacity={opacity} />;
    case 'circle':
      return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} color={color} opacity={opacity} />;
    case 'line':
      return <Line key={i} p1={vec(s.x1, s.y1)} p2={vec(s.x2, s.y2)} strokeWidth={Math.max(1, s.width)} color={color} opacity={opacity} />;
    case 'poly':
      return <Path key={i} path={s.path} color={color} opacity={opacity} />;
  }
}

export type Pixel = Exclude<Shape, { kind: 'poly' }> | { kind: 'poly'; path: ReturnType<typeof Skia.Path.Make>; role: Shape['role']; opacity?: number };

export function toPixels(s: Shape, d: Box): Pixel {
  const X = (v: number) => d.x + v * d.w;
  const Y = (v: number) => d.y + v * d.h;
  switch (s.kind) {
    case 'rect':
      return { ...s, x: X(s.x), y: Y(s.y), w: s.w * d.w, h: s.h * d.h, ...(s.r !== undefined ? { r: s.r * d.w } : {}) };
    case 'circle':
      return { ...s, cx: X(s.cx), cy: Y(s.cy), r: s.r * d.w };
    case 'line':
      return { ...s, x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2), width: s.width * d.w };
    case 'poly': {
      const b = Skia.PathBuilder.Make();
      for (let i = 0; i < s.points.length; i += 2) {
        const px = X(s.points[i]!);
        const py = Y(s.points[i + 1]!);
        if (i === 0) b.moveTo(px, py);
        else b.lineTo(px, py);
      }
      b.close();
      return { kind: 'poly', path: b.build(), role: s.role, ...(s.opacity !== undefined ? { opacity: s.opacity } : {}) };
    }
  }
}
