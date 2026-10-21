// Material primitives for the Concept D scene. Each is a few Skia fills with a gradient read
// from the design tokens (D104: gradients for material and light, no bitmap textures, no blur
// masks, no offscreen layers). Everything is memoized per geometry so nothing allocates per
// frame; animated layers move with Reanimated transforms outside these components.
import { Circle, Group, Line, LinearGradient, Path, RadialGradient, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { celBands, materialStops, withAlpha, type MaterialKind } from '../../../../presentation/design/tokens';
import { TOKENS as T } from '../palette';
import type { Pt, Quad, Rect as R } from '../conceptGeometry';

export function quadPath(q: Quad) {
  return Skia.PathBuilder.Make().moveTo(q.a.x, q.a.y).lineTo(q.b.x, q.b.y).lineTo(q.c.x, q.c.y).lineTo(q.d.x, q.d.y).close().build();
}

export function useQuadPath(q: Quad) {
  return useMemo(() => quadPath(q), [q]);
}

/** A flat facet (wall, ceiling, floor) with a linear gradient between two of its points. */
export const Facet = memo(function Facet({ quad, from, to, colors, positions, opacity }: { quad: Quad; from: Pt; to: Pt; colors: string[]; positions?: number[]; opacity?: number }) {
  const path = useQuadPath(quad);
  return (
    <Path path={path} opacity={opacity}>
      <LinearGradient start={vec(from.x, from.y)} end={vec(to.x, to.y)} colors={colors} positions={positions} />
    </Path>
  );
});

/** A flat-colored quad. */
export const Flat = memo(function Flat({ quad, color, opacity, stroke }: { quad: Quad; color: string; opacity?: number; stroke?: number }) {
  const path = useQuadPath(quad);
  return <Path path={path} color={color} opacity={opacity} style={stroke ? 'stroke' : 'fill'} strokeWidth={stroke} />;
});

/** A rounded plate in a material: brushed steel, painted panel, dark glass. */
export const Plate = memo(function Plate({ rect, r = 8, base, kind = 'brushed', edge = true }: { rect: R; r?: number; base: string; kind?: MaterialKind; edge?: boolean }) {
  const stops = useMemo(() => materialStops(base, kind, T), [base, kind]);
  const bands = useMemo(() => celBands(base, T), [base]);
  return (
    <Group>
      <RoundedRect x={rect.x} y={rect.y} width={rect.w} height={rect.h} r={r}>
        <LinearGradient start={vec(rect.x, rect.y)} end={vec(rect.x, rect.y + rect.h)} colors={stops.colors} positions={stops.positions} />
      </RoundedRect>
      {edge ? <RoundedRect x={rect.x + 0.5} y={rect.y + 0.5} width={rect.w - 1} height={rect.h - 1} r={r} color={bands.edge} style="stroke" strokeWidth={1.5} /> : null}
      {/* Catch light along the top edge. */}
      <Line p1={vec(rect.x + r, rect.y + 1.5)} p2={vec(rect.x + rect.w - r, rect.y + 1.5)} color={withAlpha(T.palette.light, 0.35)} strokeWidth={1.5} />
    </Group>
  );
});

/** A brass bezel: a rounded ring in warm trim metal around a recess. */
export const Bezel = memo(function Bezel({ rect, r = 10, width = 4 }: { rect: R; r?: number; width?: number }) {
  const stops = useMemo(() => materialStops(T.palette.brass, 'brushed', T), []);
  const edge = useMemo(() => celBands(T.palette.brass, T).edge, []);
  return (
    <Group>
      <RoundedRect x={rect.x} y={rect.y} width={rect.w} height={rect.h} r={r}>
        <LinearGradient start={vec(rect.x, rect.y)} end={vec(rect.x, rect.y + rect.h)} colors={stops.colors} positions={stops.positions} />
      </RoundedRect>
      <RoundedRect x={rect.x + width} y={rect.y + width} width={rect.w - width * 2} height={rect.h - width * 2} r={Math.max(2, r - width)} color={T.palette.void} />
      <RoundedRect x={rect.x + 0.5} y={rect.y + 0.5} width={rect.w - 1} height={rect.h - 1} r={r} color={edge} style="stroke" strokeWidth={1} />
    </Group>
  );
});

/** A practical light's halo: a radial gradient from the light color to nothing. Cheap, no blur. */
export const Halo = memo(function Halo({ cx, cy, r, color = T.lighting.practical, strength = 0.5 }: { cx: number; cy: number; r: number; color?: string; strength?: number }) {
  const colors = useMemo(() => [withAlpha(color, strength), withAlpha(color, strength * 0.35), withAlpha(color, 0)], [color, strength]);
  return (
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient c={vec(cx, cy)} r={r} colors={colors} positions={[0, 0.4, 1]} />
    </Circle>
  );
});

/** A light tube (sconce or ceiling rail): hot core fading to the practical color across its width. */
export const Tube = memo(function Tube({ quad, across, color = T.lighting.practical, opacity }: { quad: Quad; across: [Pt, Pt]; color?: string; opacity?: number }) {
  const path = useQuadPath(quad);
  const colors = useMemo(() => [color, T.palette.light, color], [color]);
  return (
    <Path path={path} opacity={opacity}>
      <LinearGradient start={vec(across[0].x, across[0].y)} end={vec(across[1].x, across[1].y)} colors={colors} positions={[0, 0.5, 1]} />
    </Path>
  );
});

/** A fixing screw: a small dark disc with a catch light. */
export const Screw = memo(function Screw({ cx, cy, r = 3 }: { cx: number; cy: number; r?: number }) {
  const bands = useMemo(() => celBands(T.palette.metal, T), []);
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={bands.edge} />
      <Circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.45} color={withAlpha(T.palette.light, 0.45)} />
    </Group>
  );
});

/** A rectangle filled with a vertical gradient. */
export const GradientRect = memo(function GradientRect({ rect, colors, positions, r = 0, horizontal = false, opacity }: { rect: R; colors: string[]; positions?: number[]; r?: number; horizontal?: boolean; opacity?: number }) {
  const end = horizontal ? vec(rect.x + rect.w, rect.y) : vec(rect.x, rect.y + rect.h);
  return (
    <RoundedRect x={rect.x} y={rect.y} width={rect.w} height={rect.h} r={r} opacity={opacity}>
      <LinearGradient start={vec(rect.x, rect.y)} end={end} colors={colors} positions={positions} />
    </RoundedRect>
  );
});

export const Edge = memo(function Edge({ rect, color, r = 0, width = 1.5 }: { rect: R; color: string; r?: number; width?: number }) {
  return <Rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} color={color} style="stroke" strokeWidth={width} />;
});
