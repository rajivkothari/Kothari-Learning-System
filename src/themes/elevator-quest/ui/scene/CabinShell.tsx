// The car's shell in one-point perspective: back wall and panels, ceiling with recessed warm
// light rails, angled side walls with tube sconces and brass handrails, the floor with its
// seams, and the recessed gauge placard that backs the shaft map. Static: it is drawn once per
// layout size and dimmed by the scene's power layer.
import { Group, Line, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { celBands, mix, withAlpha } from '../../../../presentation/design/tokens';
import type { ConceptGeometry, Rect as R } from '../conceptGeometry';
import { TOKENS as T } from '../palette';
import { Facet, Flat, Halo, Plate, Screw, Tube, quadPath } from './materials';

const paint = celBands(T.palette.paint, T);
const metal = celBands(T.palette.metal, T);
const brass = celBands(T.palette.brass, T);
const floorBands = celBands(T.palette.floor, T);
const warm = T.lighting.practical;

export const CabinShell = memo(function CabinShell({ g, gauge }: { g: ConceptGeometry; gauge?: R }) {
  const { width: w, height: h } = g;
  const seams = useMemo(() => g.floorSeams.map(([p, q]) => ({ p1: vec(p.x, p.y), p2: vec(q.x, q.y) })), [g.floorSeams]);
  const railPaths = useMemo(() => g.handrails.map(quadPath), [g.handrails]);
  return (
    <Group>
      {/* Back wall: painted navy panels, lit from the ceiling. */}
      <Rect x={0} y={0} width={w} height={h} color={T.palette.void} />
      <Facet quad={{ a: { x: g.back.x, y: g.back.y }, b: { x: g.back.x + g.back.w, y: g.back.y }, c: { x: g.back.x + g.back.w, y: g.floorY }, d: { x: g.back.x, y: g.floorY } }} from={{ x: 0, y: g.back.y }} to={{ x: 0, y: g.floorY }} colors={[mix(paint.base, warm, 0.14), paint.base, paint.shadow]} positions={[0, 0.3, 1]} />
      {g.panels.map((p, i) => (
        <WallPanel key={i} r={p} />
      ))}

      {/* Ceiling: graphite, brightest toward the lights; recessed warm rails and a centre panel. */}
      <Facet quad={g.ceiling} from={{ x: 0, y: 0 }} to={{ x: 0, y: g.back.y }} colors={[mix(metal.shadow, T.palette.void, 0.25), mix(metal.base, warm, 0.1)]} />
      {g.ceilingLights.map((q, i) => {
        const cx = (q.a.x + q.c.x) / 2;
        const cy = (q.a.y + q.c.y) / 2;
        const inner = { a: lerpPt(q.a, q.b, 0.22), b: lerpPt(q.a, q.b, 0.78), c: lerpPt(q.d, q.c, 0.78), d: lerpPt(q.d, q.c, 0.22) };
        return (
          <Group key={i}>
            {/* Spill onto the ceiling, then the recessed trough, then the lit tube inside it. */}
            <Halo cx={cx} cy={cy} r={Math.max(q.d.y - q.a.y, q.b.x - q.a.x) * 0.7} strength={0.3} />
            <Flat quad={q} color={mix(metal.shadow, T.palette.void, 0.4)} />
            <Flat quad={q} color={brass.shadow} stroke={1} />
            <Tube quad={inner} across={[lerpPt(inner.a, inner.b, 0), lerpPt(inner.a, inner.b, 1)]} />
          </Group>
        );
      })}
      {/* Light spill from the ceiling onto the back wall top. */}
      <Rect x={g.back.x} y={g.back.y} width={g.back.w} height={Math.max(8, h * 0.05)} color={withAlpha(warm, 0.12)} />

      {/* Side walls: deep navy paint, darker toward the viewer, with a brass skirting line. */}
      <Facet quad={g.leftWall} from={{ x: 0, y: 0 }} to={{ x: g.back.x, y: 0 }} colors={[mix(paint.shadow, T.palette.void, 0.45), paint.shadow, mix(paint.base, warm, 0.08)]} positions={[0, 0.5, 1]} />
      <Facet quad={g.rightWall} from={{ x: w, y: 0 }} to={{ x: g.back.x + g.back.w, y: 0 }} colors={[mix(paint.shadow, T.palette.void, 0.45), paint.shadow, mix(paint.base, warm, 0.08)]} positions={[0, 0.5, 1]} />
      <Line p1={vec(0, h)} p2={vec(g.back.x, g.floorY)} color={brass.base} strokeWidth={2} />
      <Line p1={vec(w, h)} p2={vec(g.back.x + g.back.w, g.floorY)} color={brass.base} strokeWidth={2} />
      <Line p1={vec(0, 0)} p2={vec(g.back.x, g.back.y)} color={metal.edge} strokeWidth={1.5} />
      <Line p1={vec(w, 0)} p2={vec(g.back.x + g.back.w, g.back.y)} color={metal.edge} strokeWidth={1.5} />
      {/* Wall-to-back-wall corner seams. */}
      <Line p1={vec(g.back.x, g.back.y)} p2={vec(g.back.x, g.floorY)} color={paint.edge} strokeWidth={2} />
      <Line p1={vec(g.back.x + g.back.w, g.back.y)} p2={vec(g.back.x + g.back.w, g.floorY)} color={paint.edge} strokeWidth={2} />

      {/* Corner trims: brass verticals where each wall meets the back wall. */}
      {g.cornerTrims.map((q, i) => (
        <Facet key={i} quad={q} from={q.a} to={q.b} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.5, 1]} />
      ))}
      {/* Sconces: pale tubes with warm halos and brass caps, each lighting the wall around it. */}
      {g.sconces.map((s, i) => {
        const cx = (s.body.a.x + s.body.c.x) / 2;
        const cy = (s.body.a.y + s.body.c.y) / 2;
        const r = Math.abs(s.body.d.y - s.body.a.y) * 1.1;
        return (
          <Group key={i}>
            <Halo cx={cx} cy={cy} r={r} strength={0.5} />
            <Tube quad={s.body} across={[s.body.a, s.body.b]} color={mix(warm, T.palette.light, 0.45)} />
            <Flat quad={s.capTop} color={brass.base} />
            <Flat quad={s.capBottom} color={brass.shadow} />
          </Group>
        );
      })}

      {/* Floor: graphite plate with a warm sheen in front of the doors, and seams in perspective. */}
      <Facet quad={g.floor} from={{ x: 0, y: g.floorY }} to={{ x: 0, y: h }} colors={[mix(paint.base, warm, 0.12), mix(floorBands.base, paint.base, 0.5), floorBands.shadow]} positions={[0, 0.4, 1]} />
      {seams.map((s, i) => (
        <Line key={i} p1={s.p1} p2={s.p2} color={withAlpha(T.palette.light, i < 7 ? 0.05 : 0.09)} strokeWidth={1} />
      ))}
      {/* Warm reflection of the doorway on the floor in front of the sill. */}
      <Halo cx={g.width / 2} cy={g.floorY + (h - g.floorY) * 0.25} r={g.frame.w * 0.9} strength={0.2} />
      <Line p1={vec(g.back.x, g.floorY)} p2={vec(g.back.x + g.back.w, g.floorY)} color={floorBands.edge} strokeWidth={2} />

      {/* Handrails: brass bars along both walls, with a bright top edge. */}
      {railPaths.map((p, i) => (
        <Group key={i}>
          <Facet quad={g.handrails[i]!} from={g.handrails[i]!.a} to={g.handrails[i]!.d} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.45, 1]} />
          <Line p1={vec(g.handrails[i]!.a.x, g.handrails[i]!.a.y)} p2={vec(g.handrails[i]!.b.x, g.handrails[i]!.b.y)} color={withAlpha(T.palette.light, 0.5)} strokeWidth={1} />
        </Group>
      ))}

      {/* Gauge placard: a recessed plate behind the shaft map, so it reads as part of the car. */}
      {gauge ? (
        <Group>
          <Plate rect={{ x: gauge.x - 6, y: gauge.y - 6, w: gauge.w + 12, h: gauge.h + 12 }} r={12} base={T.palette.metal} kind="brushed" />
          <RoundedRect x={gauge.x} y={gauge.y} width={gauge.w} height={gauge.h} r={8} color={T.palette.surface[0]} />
          <Screw cx={gauge.x} cy={gauge.y} />
          <Screw cx={gauge.x + gauge.w} cy={gauge.y} />
          <Screw cx={gauge.x} cy={gauge.y + gauge.h} />
          <Screw cx={gauge.x + gauge.w} cy={gauge.y + gauge.h} />
        </Group>
      ) : null}
    </Group>
  );
});

function WallPanel({ r }: { r: R }) {
  // A painted back-wall panel with a brass frame, a top catch light, and a soft shadow at the foot.
  return (
    <Group>
      <RoundedRect x={r.x} y={r.y} width={r.w} height={r.h} r={6} color={mix(paint.base, T.palette.light, 0.05)} />
      <Rect x={r.x} y={r.y + r.h * 0.7} width={r.w} height={r.h * 0.3} color={paint.shadow} opacity={0.6} />
      <RoundedRect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} r={6} color={brass.shadow} style="stroke" strokeWidth={2} />
      <Line p1={vec(r.x + 6, r.y + 3)} p2={vec(r.x + r.w - 6, r.y + 3)} color={withAlpha(T.palette.light, 0.2)} strokeWidth={1} />
      {/* Inspection vent low on each panel. */}
      {r.w > 60 ? <RoundedRect x={r.x + r.w / 2 - 14} y={r.y + r.h - 34} width={28} height={16} r={3} color={metal.edge} /> : null}
    </Group>
  );
}

function lerpPt(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
