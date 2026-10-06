// Draws any landing from its shape list (ui/landingArt.ts). One generic renderer: a floor's
// identity is data, so there is no per-floor component. Skia primitives only: rect, rounded
// rect, circle, path, line.
import { Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import type { Landing } from '../content/landings';
import { landingArt, landingColors, type Shape } from './landingArt';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LandingLayer = memo(function LandingLayer({ landing, door }: { landing: Landing; door: Box }) {
  const colors = useMemo(() => landingColors(landing), [landing]);
  const art = useMemo(() => landingArt(landing, door.w / door.h), [landing, door.w, door.h]);
  const shapes = useMemo(() => art.shapes.map((s) => toPixels(s, door)), [art, door]);
  return (
    <Group>
      {shapes.map((s, i) => {
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
      })}
      <Rect x={door.x} y={door.y} width={door.w} height={door.h} color={art.wash.color} opacity={art.wash.opacity} />
    </Group>
  );
});

type Pixel = Exclude<Shape, { kind: 'poly' }> | { kind: 'poly'; path: ReturnType<typeof Skia.Path.Make>; role: Shape['role']; opacity?: number };

function toPixels(s: Shape, d: Box): Pixel {
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
