// The general landing beyond the doors: one wall paint, a baseboard accent, a floor plane
// receding toward the vanishing point, light spill from the hall, and the floor number painted
// on the wall as a vector stencil. Floors cycle looks (floorLooks.ts) so each reads as a place.
import { Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { stencilText } from '../../../../../presentation/design/stencilDigits';
import { celBands, mix, withAlpha } from '../../../../../presentation/design/tokens';
import type { ConceptGeometry } from '../../conceptGeometry';
import type { FloorLook } from '../../floorLooks';
import { TOKENS as T } from '../../palette';
import { GradientRect } from '../materials';

const floorBands = celBands(T.palette.floor, T);

export const PaintedLanding = memo(function PaintedLanding({ g, look, floor }: { g: ConceptGeometry; look: FloorLook; floor: number }) {
  const d = g.door;
  const horizon = d.y + d.h * 0.66;
  const light = look.light === 'warm' ? T.lighting.practical : T.lighting.fill;
  const number = useMemo(() => {
    const s = stencilText(String(floor), 0, 0, g.landingNumber.height);
    return s.rects.map((r) => ({ ...r, x: r.x + g.landingNumber.cx - s.width / 2, y: r.y + g.landingNumber.y }));
  }, [floor, g.landingNumber]);
  const seams = useMemo(() => {
    const out: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      const bottom = { x: d.x + d.w * u, y: d.y + d.h };
      // Converge toward the vanishing point, clipped by the doorway: stop at the horizon.
      const k = (horizon - bottom.y) / (g.vp.y - bottom.y);
      out.push({ p1: bottom, p2: { x: bottom.x + (g.vp.x - bottom.x) * k, y: horizon } });
    }
    for (const t of [0.3, 0.55, 0.75, 0.9]) out.push({ p1: { x: d.x, y: d.y + d.h - (d.y + d.h - horizon) * t }, p2: { x: d.x + d.w, y: d.y + d.h - (d.y + d.h - horizon) * t } });
    return out;
  }, [d, horizon, g.vp]);
  return (
    <Group>
      {/* Wall: paint, lighter where the hall light falls. */}
      <GradientRect rect={{ x: d.x, y: d.y, w: d.w, h: horizon - d.y }} colors={[mix(look.paint, light, 0.22), look.paint, mix(look.paint, T.palette.void, 0.3)]} positions={[0, 0.35, 1]} />
      {/* A pale wainscot panel and a baseboard in the accent. */}
      <Rect x={d.x} y={horizon - d.h * 0.2} width={d.w} height={d.h * 0.15} color={withAlpha(T.palette.light, 0.06)} />
      <Rect x={d.x} y={horizon - d.h * 0.05} width={d.w} height={d.h * 0.05} color={look.accent} opacity={0.9} />
      {/* Floor plane with seams. */}
      <GradientRect rect={{ x: d.x, y: horizon, w: d.w, h: d.y + d.h - horizon }} colors={[floorBands.light, floorBands.base, mix(floorBands.base, light, 0.12)]} positions={[0, 0.5, 1]} />
      {seams.map((s, i) => (
        <Line key={i} p1={vec(s.p1.x, s.p1.y)} p2={vec(s.p2.x, s.p2.y)} color={withAlpha(T.palette.light, 0.07)} strokeWidth={1} />
      ))}
      <Line p1={vec(d.x, horizon)} p2={vec(d.x + d.w, horizon)} color={floorBands.edge} strokeWidth={1.5} />
      {/* Hall light from above. */}
      <GradientRect rect={{ x: d.x, y: d.y, w: d.w, h: d.h * 0.2 }} colors={[withAlpha(light, 0.22), withAlpha(light, 0)]} />
      {/* The painted floor number. */}
      {number.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} color={T.palette.light} opacity={0.88} />
      ))}
    </Group>
  );
});
