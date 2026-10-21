// Floor 15: the repair deck beyond the doors. A mechanical service level: tall workshop
// windows, overhead pipes, a gantry crane with its hook, a tool wall, a workbench with a
// monitor, a service door, a tiled floor receding to the vanishing point, carts and crates.
// Every prop is Skia geometry placed in door-relative units, so it fits any doorway.
//
// `lit` is presentation state only: the deck is unpowered (emergency light, silhouettes)
// until the mission restores Floor 15, then lit. The simulation never knows.
import { Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { stencilText } from '../../../../../presentation/design/stencilDigits';
import { celBands, mix, withAlpha } from '../../../../../presentation/design/tokens';
import type { ConceptGeometry, Rect as R } from '../../conceptGeometry';
import { TOKENS as T } from '../../palette';
import { GradientRect, Halo } from '../materials';

const brass = celBands(T.palette.brass, T);
const metal = celBands(T.palette.metal, T);
const paint = celBands(T.palette.paint, T);
const warm = T.lighting.practical;
const cool = T.lighting.fill;
/** Pale workshop concrete, derived from the palette so a world restyle moves it too. */
const concrete = mix(T.palette.light, T.palette.paint, 0.5);
const concreteShade = mix(concrete, T.palette.void, 0.35);
const tile = mix(T.palette.light, T.palette.floor, 0.58);

export const RepairDeck = memo(function RepairDeck({ g, lit }: { g: ConceptGeometry; lit: boolean }) {
  const d = g.door;
  const u = (k: number) => d.x + d.w * k;
  const v = (k: number) => d.y + d.h * k;
  const horizon = v(0.6);
  const vp = g.vp;

  const floorLines = useMemo(() => {
    const out: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
    for (let i = 0; i <= 8; i++) {
      const bottom = { x: d.x + d.w * (i / 8), y: d.y + d.h };
      const k = (horizon - bottom.y) / (vp.y - bottom.y);
      out.push({ p1: bottom, p2: { x: bottom.x + (vp.x - bottom.x) * k, y: horizon } });
    }
    for (const t of [0.12, 0.26, 0.42, 0.6, 0.8]) {
      const y = d.y + d.h - (d.y + d.h - horizon) * (1 - (1 - t) * (1 - t));
      out.push({ p1: { x: d.x, y }, p2: { x: d.x + d.w, y } });
    }
    return out;
  }, [d, horizon, vp]);

  const number = useMemo(() => {
    const height = Math.min(d.h * 0.2, d.w * 0.22);
    const s = stencilText('15', 0, 0, height);
    return s.rects.map((r) => ({ ...r, x: r.x + u(0.66) - s.width / 2, y: r.y + v(0.31) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const hook = useMemo(() => {
    const x = u(0.5);
    const y = v(0.4);
    const s = Math.max(4, d.w * 0.02);
    return Skia.PathBuilder.Make().moveTo(x, y).lineTo(x, y + s * 1.2).quadTo(x, y + s * 3, x - s * 1.4, y + s * 2.6).quadTo(x - s * 2.6, y + s * 2.2, x - s * 1.6, y + s * 1.4).build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const lampGlow = lit ? 0.42 : 0.1;
  return (
    <Group>
      {/* Back wall: pale concrete, cooler at the top where the windows are. */}
      <GradientRect rect={{ x: d.x, y: d.y, w: d.w, h: horizon - d.y }} colors={[mix(concrete, cool, 0.12), concrete, concreteShade]} positions={[0, 0.45, 1]} />
      {/* Windows: two tall panes of daylight with dark mullions and a brass sill. */}
      <Window r={{ x: u(0.05), y: v(0.04), w: d.w * 0.13, h: d.h * 0.32 }} />
      <Window r={{ x: u(0.21), y: v(0.04), w: d.w * 0.13, h: d.h * 0.32 }} />
      {/* Overhead pipes with brackets, and a vertical run with an elbow. */}
      <Pipe r={{ x: d.x, y: v(0.075), w: d.w, h: Math.max(4, d.h * 0.028) }} />
      <Pipe r={{ x: u(0.38), y: v(0.125), w: d.w * 0.62, h: Math.max(3, d.h * 0.018) }} />
      <Pipe r={{ x: u(0.57), y: v(0.075), w: Math.max(4, d.w * 0.022), h: d.h * 0.2 }} />
      {/* Gantry: an I-beam with a trolley, a chain and a hook. */}
      <Rect x={u(0.3)} y={v(0.19)} width={d.w * 0.46} height={Math.max(4, d.h * 0.035)} color={metal.edge} />
      <Rect x={u(0.3)} y={v(0.19)} width={d.w * 0.46} height={2} color={withAlpha(T.palette.light, 0.3)} />
      <RoundedRect x={u(0.47)} y={v(0.2)} width={d.w * 0.06} height={d.h * 0.06} r={2} color={brass.shadow} />
      <Line p1={vec(u(0.5), v(0.26))} p2={vec(u(0.5), v(0.4))} color={metal.edge} strokeWidth={2} />
      <Path path={hook} color={brass.base} style="stroke" strokeWidth={Math.max(2, d.w * 0.012)} strokeCap="round" />
      {/* Hanging work lamp. */}
      <Line p1={vec(u(0.84), v(0.075))} p2={vec(u(0.84), v(0.17))} color={metal.edge} strokeWidth={2} />
      <Halo cx={u(0.84)} cy={v(0.21)} r={d.w * 0.14} strength={lampGlow} />
      <RoundedRect x={u(0.8)} y={v(0.16)} width={d.w * 0.08} height={d.h * 0.035} r={3} color={metal.edge} />
      <Rect x={u(0.805)} y={v(0.192)} width={d.w * 0.07} height={2} color={lit ? mix(warm, T.palette.light, 0.5) : metal.base} />
      {/* The painted floor number, dark on the pale wall. */}
      {number.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} color={paint.edge} opacity={0.85} />
      ))}
      {/* Tool wall: a dark board with brass tools hung in a row. */}
      <RoundedRect x={u(0.04)} y={v(0.4)} width={d.w * 0.26} height={d.h * 0.16} r={3} color={paint.shadow} />
      {[0.08, 0.13, 0.18, 0.23].map((k) => (
        <Group key={k}>
          <Rect x={u(k)} y={v(0.43)} width={Math.max(2, d.w * 0.012)} height={d.h * 0.1} color={brass.base} />
          <Circle cx={u(k) + d.w * 0.006} cy={v(0.43)} r={Math.max(2, d.w * 0.014)} color={brass.light} />
        </Group>
      ))}
      {/* Workbench with a monitor and status lamps (amber and cyan only). */}
      <Rect x={u(0.33)} y={v(0.5)} width={d.w * 0.2} height={d.h * 0.1} color={metal.shadow} />
      <Rect x={u(0.33)} y={v(0.5)} width={d.w * 0.2} height={3} color={metal.light} />
      <RoundedRect x={u(0.36)} y={v(0.4)} width={d.w * 0.12} height={d.h * 0.1} r={3} color={metal.edge} />
      <Rect x={u(0.37)} y={v(0.41)} width={d.w * 0.1} height={d.h * 0.08} color={lit ? T.palette.accentSecondary : mix(T.palette.accentSecondary, T.palette.void, 0.75)} opacity={0.85} />
      <Circle cx={u(0.51)} cy={v(0.47)} r={Math.max(2, d.w * 0.01)} color={lit ? warm : metal.base} />
      <Circle cx={u(0.51)} cy={v(0.44)} r={Math.max(2, d.w * 0.01)} color={lit ? T.palette.accentSecondary : metal.base} />
      {/* Service door on the right, brass trimmed, with a small window. */}
      <RoundedRect x={u(0.8)} y={v(0.32)} width={d.w * 0.16} height={d.h * 0.28} r={4} color={paint.base} />
      <RoundedRect x={u(0.8) + 1} y={v(0.32) + 1} width={d.w * 0.16 - 2} height={d.h * 0.28 - 2} r={4} color={brass.shadow} style="stroke" strokeWidth={2} />
      <Rect x={u(0.845)} y={v(0.35)} width={d.w * 0.07} height={d.h * 0.07} color={mix(cool, T.palette.void, lit ? 0.3 : 0.7)} />
      {/* Floor: pale tiles converging on the vanishing point, with a brass guide lane. */}
      <GradientRect rect={{ x: d.x, y: horizon, w: d.w, h: d.y + d.h - horizon }} colors={[mix(tile, T.palette.void, 0.25), tile, mix(tile, warm, lit ? 0.2 : 0.05)]} positions={[0, 0.4, 1]} />
      {floorLines.map((s, i) => (
        <Line key={i} p1={vec(s.p1.x, s.p1.y)} p2={vec(s.p2.x, s.p2.y)} color={withAlpha(T.palette.void, 0.22)} strokeWidth={1} />
      ))}
      <Line p1={vec(d.x, horizon)} p2={vec(d.x + d.w, horizon)} color={concreteShade} strokeWidth={2} />
      {/* Tool cart on the left: navy drawers on wheels. */}
      <Cart r={{ x: u(0.08), y: v(0.62), w: d.w * 0.18, h: d.h * 0.16 }} color={paint.base} drawers={3} />
      {/* Crate on a yellow trolley, centre right, and a cage cart behind it. */}
      <Rect x={u(0.6)} y={v(0.66)} width={d.w * 0.14} height={d.h * 0.07} color={mix(T.palette.companion, T.palette.void, 0.35)} />
      {[0.62, 0.66, 0.7].map((k) => (
        <Line key={k} p1={vec(u(k), v(0.66))} p2={vec(u(k), v(0.73))} color={mix(T.palette.companion, T.palette.void, 0.6)} strokeWidth={2} />
      ))}
      <Crate r={{ x: u(0.42), y: v(0.64), w: d.w * 0.12, h: d.h * 0.11 }} />
      <Rect x={u(0.43)} y={v(0.75)} width={d.w * 0.1} height={Math.max(3, d.h * 0.02)} color={mix(T.palette.companion, T.palette.void, 0.35)} />
      <Circle cx={u(0.445)} cy={v(0.78)} r={Math.max(2, d.w * 0.012)} color={metal.edge} />
      <Circle cx={u(0.525)} cy={v(0.78)} r={Math.max(2, d.w * 0.012)} color={metal.edge} />
      {/* Lighting state. Unpowered: a dark overlay and one emergency lamp over the bench. */}
      {lit ? (
        <GradientRect rect={{ x: d.x, y: horizon, w: d.w, h: d.y + d.h - horizon }} colors={[withAlpha(warm, 0.16), withAlpha(warm, 0)]} />
      ) : (
        <Group>
          <Rect x={d.x} y={d.y} width={d.w} height={d.h} color={T.palette.void} opacity={0.68} />
          <Halo cx={u(0.43)} cy={v(0.28)} r={d.w * 0.22} strength={0.3} />
          <Circle cx={u(0.43)} cy={v(0.28)} r={Math.max(2, d.w * 0.012)} color={mix(warm, T.palette.light, 0.4)} />
        </Group>
      )}
    </Group>
  );
});

function Window({ r }: { r: R }) {
  return (
    <Group>
      <GradientRect rect={r} colors={[mix(cool, T.palette.light, 0.35), cool, mix(cool, T.palette.paint, 0.45)]} positions={[0, 0.5, 1]} r={Math.max(4, r.w * 0.3)} />
      <Line p1={vec(r.x + r.w / 2, r.y)} p2={vec(r.x + r.w / 2, r.y + r.h)} color={paint.edge} strokeWidth={2} />
      {[0.33, 0.66].map((k) => (
        <Line key={k} p1={vec(r.x, r.y + r.h * k)} p2={vec(r.x + r.w, r.y + r.h * k)} color={paint.edge} strokeWidth={2} />
      ))}
      <RoundedRect x={r.x} y={r.y} width={r.w} height={r.h} r={Math.max(4, r.w * 0.3)} color={paint.edge} style="stroke" strokeWidth={2} />
      <Rect x={r.x - 2} y={r.y + r.h} width={r.w + 4} height={3} color={brass.base} />
    </Group>
  );
}

function Pipe({ r }: { r: R }) {
  const horizontal = r.w >= r.h;
  return (
    <Group>
      <GradientRect rect={r} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.45, 1]} r={r.h / 2} horizontal={!horizontal} />
      {horizontal
        ? [0.15, 0.5, 0.85].map((k) => <Rect key={k} x={r.x + r.w * k} y={r.y - 2} width={Math.max(3, r.h * 0.8)} height={r.h + 4} color={brass.edge} />)
        : null}
    </Group>
  );
}

function Cart({ r, color, drawers }: { r: R; color: string; drawers: number }) {
  const dh = r.h / (drawers + 1);
  return (
    <Group>
      <RoundedRect x={r.x} y={r.y} width={r.w} height={r.h} r={3} color={color} />
      <Rect x={r.x} y={r.y} width={r.w} height={3} color={mix(color, T.palette.light, 0.3)} />
      {Array.from({ length: drawers }, (_, i) => (
        <Group key={i}>
          <Rect x={r.x + 4} y={r.y + 6 + i * dh} width={r.w - 8} height={dh - 4} color={mix(color, T.palette.void, 0.3)} />
          <Rect x={r.x + r.w * 0.35} y={r.y + 6 + i * dh + dh * 0.4} width={r.w * 0.3} height={2} color={brass.light} />
        </Group>
      ))}
      <Circle cx={r.x + r.w * 0.2} cy={r.y + r.h + 3} r={4} color={metal.edge} />
      <Circle cx={r.x + r.w * 0.8} cy={r.y + r.h + 3} r={4} color={metal.edge} />
    </Group>
  );
}

function Crate({ r }: { r: R }) {
  return (
    <Group>
      <RoundedRect x={r.x} y={r.y} width={r.w} height={r.h} r={2} color={metal.base} />
      <Rect x={r.x} y={r.y} width={r.w} height={2} color={metal.light} />
      <Line p1={vec(r.x, r.y)} p2={vec(r.x + r.w, r.y + r.h)} color={metal.edge} strokeWidth={2} />
      <Line p1={vec(r.x + r.w, r.y)} p2={vec(r.x, r.y + r.h)} color={metal.edge} strokeWidth={2} />
      <Rect x={r.x} y={r.y} width={r.w} height={r.h} color={metal.edge} style="stroke" strokeWidth={2} />
    </Group>
  );
}
