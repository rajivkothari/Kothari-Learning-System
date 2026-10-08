// The loading bay behind everything: AA's backdrop art (`minigame.cargo.backdrop`, cover-fitted) over
// a vector warehouse that is also its fallback: khaki ribbed wall panels with bone trim, shelving at
// both sides, warm hanging lamps, a grey-green concrete floor. Decoration only: nothing here moves.
import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import type { ArtEntry } from '../../art/manifest';
import { ArtSlot, type ArtSource } from '../../ui/art/ArtSlot';
import { coverRect } from './cargoArt';
import { CC, brass, floor, trim, wall, wood } from './cargoPalette';

export const WarehouseBackdrop = memo(function WarehouseBackdrop({ width, height, entry, art }: { width: number; height: number; entry: ArtEntry | null; art: ArtSource }) {
  const rect = useMemo(() => (entry ? coverRect(entry, { x: 0, y: 0, width, height }) : null), [entry, width, height]);
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      <VectorWarehouse w={width} h={height} />
      {entry && rect ? <ArtSlot entry={entry} rect={rect} art={art} /> : null}
      {/* A calm veil so the panels and words over the art always read. */}
      <Rect x={0} y={0} width={width} height={height} color={CC.void} opacity={0.28} />
    </Canvas>
  );
});

function VectorWarehouse({ w, h }: { w: number; h: number }) {
  const horizon = Math.round(h * 0.56);
  const ribs = Math.ceil(w / 36);
  const shelfW = Math.max(80, w * 0.14);
  return (
    <Group>
      <Rect x={0} y={0} width={w} height={horizon} color={wall.base} />
      {Array.from({ length: ribs }, (_, i) => (
        <Group key={i}>
          <Rect x={i * 36} y={0} width={6} height={horizon} color={wall.light} opacity={0.5} />
          <Rect x={i * 36 + 6} y={0} width={3} height={horizon} color={wall.shadow} />
        </Group>
      ))}
      <Rect x={0} y={horizon - 14} width={w} height={14} color={trim.base} />
      <Rect x={0} y={horizon - 2} width={w} height={3} color={CC.soot} />
      {[0, 1].map((side) => {
        const x = side === 0 ? 0 : w - shelfW;
        return (
          <Group key={side}>
            <Rect x={x} y={h * 0.08} width={shelfW} height={horizon - h * 0.08} color={trim.shadow} />
            {[0.25, 0.5, 0.75].map((f) => (
              <Group key={f}>
                <Rect x={x} y={h * 0.08 + (horizon - h * 0.08) * f} width={shelfW} height={6} color={trim.base} />
                <Rect x={x + 10} y={h * 0.08 + (horizon - h * 0.08) * f - 34} width={shelfW * 0.38} height={34} color={wood.base} />
                <Rect x={x + 10} y={h * 0.08 + (horizon - h * 0.08) * f - 34} width={shelfW * 0.38} height={6} color={wood.light} />
              </Group>
            ))}
          </Group>
        );
      })}
      {[0.3, 0.5, 0.7].map((f) => (
        <Group key={f}>
          <Line p1={vec(w * f, 0)} p2={vec(w * f, h * 0.06)} color={brass.base} strokeWidth={3} />
          <Circle cx={w * f} cy={h * 0.075} r={12} color={CC.warmLight} />
          <Circle cx={w * f} cy={h * 0.075} r={40} color={CC.warmLight} opacity={0.12} />
        </Group>
      ))}
      <Rect x={0} y={horizon} width={w} height={h - horizon} color={floor.base} />
      <Rect x={0} y={horizon} width={w} height={(h - horizon) * 0.18} color={floor.shadow} opacity={0.5} />
      {Array.from({ length: 6 }, (_, i) => (
        <Line key={i} p1={vec((w * (i + 1)) / 7, horizon)} p2={vec((w * (i + 1)) / 7 + (i - 2.5) * 40, h)} color={brass.shadow} strokeWidth={1.5} opacity={0.5} />
      ))}
    </Group>
  );
}
