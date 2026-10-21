// The floor indicator on the back wall: a brass header plate, a dark glass window with a
// soft amber glow behind the digits, and the direction arrows. The digits themselves are
// native text drawn over the canvas (crisp, scalable, readable by screen readers).
import { Group, Path, Rect, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { celBands, materialStops, withAlpha } from '../../../../presentation/design/tokens';
import type { ConceptGeometry } from '../conceptGeometry';
import { TOKENS as T } from '../palette';
import { Bezel, GradientRect, Halo, Screw } from './materials';

const brass = celBands(T.palette.brass, T);
const glass = materialStops(T.palette.void, 'glass', T);

export const IndicatorHousing = memo(function IndicatorHousing({ g, direction, powered, glow }: { g: ConceptGeometry; direction: 'up' | 'down' | null; powered: boolean; glow: SharedValue<number> }) {
  const hd = g.header;
  const ind = g.indicator;
  const arrows = useMemo(() => ({ up: arrowPath(ind.x + 20, ind.y + ind.h / 2, true, Math.min(10, ind.h * 0.16)), down: arrowPath(ind.x + ind.w - 20, ind.y + ind.h / 2, false, Math.min(10, ind.h * 0.16)) }), [ind]);
  const headerStops = useMemo(() => materialStops(T.palette.brass, 'brushed', T), []);
  return (
    <Group>
      {/* Header plate with fixing screws. */}
      <GradientRect rect={hd} colors={headerStops.colors} positions={headerStops.positions} r={10} />
      <RoundedRect x={hd.x + 0.5} y={hd.y + 0.5} width={hd.w - 1} height={hd.h - 1} r={10} color={brass.edge} style="stroke" strokeWidth={1.5} />
      <Screw cx={hd.x + 10} cy={hd.y + hd.h / 2} />
      <Screw cx={hd.x + hd.w - 10} cy={hd.y + hd.h / 2} />
      {/* Glass window in a brass bezel. */}
      <Bezel rect={{ x: ind.x - 4, y: ind.y - 4, w: ind.w + 8, h: ind.h + 8 }} r={10} width={3} />
      <GradientRect rect={ind} colors={glass.colors} positions={glass.positions} r={7} />
      {powered ? (
        <Group opacity={glow}>
          <Halo cx={ind.x + ind.w / 2} cy={ind.y + ind.h / 2} r={ind.w * 0.38} color={T.palette.accentPrimary} strength={0.35} />
        </Group>
      ) : null}
      <Rect x={ind.x + 6} y={ind.y + 3} width={ind.w - 12} height={Math.max(2, ind.h * 0.12)} color={withAlpha(T.palette.light, 0.08)} />
      <Path path={arrows.up} color={powered && direction === 'up' ? T.palette.accentPrimary : '#2A2116'} />
      <Path path={arrows.down} color={powered && direction === 'down' ? T.palette.accentPrimary : '#2A2116'} />
    </Group>
  );
});

function arrowPath(x: number, y: number, up: boolean, s: number): SkPath {
  const b = Skia.PathBuilder.Make();
  if (up) b.moveTo(x, y - s).lineTo(x + s, y + s * 0.6).lineTo(x - s, y + s * 0.6).close();
  else b.moveTo(x, y + s).lineTo(x + s, y - s * 0.6).lineTo(x - s, y - s * 0.6).close();
  return b.build();
}

export const indicatorCenter = (g: ConceptGeometry) => vec(g.indicator.x + g.indicator.w / 2, g.indicator.y + g.indicator.h / 2);
