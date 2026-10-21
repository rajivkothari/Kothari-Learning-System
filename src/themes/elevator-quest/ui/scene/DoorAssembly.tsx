// The door assembly on the gameplay plane: a brass frame with a dark reveal, two brushed
// leaves that slide on Reanimated transforms (the scene owns the door fraction), a narrow
// vision slot in each leaf onto the shaft (travel parallax), and the threshold plate.
// The landing beyond the doors is drawn by the scene before this, inside the same clip.
import { Group, Line, Rect, RoundedRect, vec, type SkRect } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { celBands, materialStops, mix, withAlpha } from '../../../../presentation/design/tokens';
import type { ConceptGeometry, Rect as R } from '../conceptGeometry';
import { TOKENS as T } from '../palette';
import { Flat, GradientRect } from './materials';

const metal = celBands(T.palette.metal, T);
const brass = celBands(T.palette.brass, T);
const leaf = materialStops(T.palette.metal, 'brushed', T);

export interface DoorSlots {
  left: R;
  right: R;
  leftClip: SkRect;
  rightClip: SkRect;
  /** Shaft beam y positions seen through the slots while travelling. */
  beams: number[];
}

export const DoorLeaves = memo(function DoorLeaves({
  g,
  leftTransform,
  rightTransform,
  shaftTransform,
  slots,
}: {
  g: ConceptGeometry;
  leftTransform: SharedValue<{ translateX: number }[]>;
  rightTransform: SharedValue<{ translateX: number }[]>;
  shaftTransform: SharedValue<{ translateY: number }[]>;
  slots: DoorSlots;
}) {
  const d = g.door;
  const half = d.w / 2;
  return (
    <Group>
      <Group transform={leftTransform}>
        <Leaf x={d.x} y={d.y} w={half} h={d.h} side="left" />
        <Slot r={slots.left} clip={slots.leftClip} beams={slots.beams} shaftTransform={shaftTransform} />
      </Group>
      <Group transform={rightTransform}>
        <Leaf x={d.x + half} y={d.y} w={half} h={d.h} side="right" />
        <Slot r={slots.right} clip={slots.rightClip} beams={slots.beams} shaftTransform={shaftTransform} />
      </Group>
    </Group>
  );
});

function Leaf({ x, y, w, h, side }: { x: number; y: number; w: number; h: number; side: 'left' | 'right' }) {
  const seamX = side === 'left' ? x + w - 2 : x;
  return (
    <Group>
      <GradientRect rect={{ x, y, w, h }} colors={leaf.colors} positions={leaf.positions} />
      {/* Horizontal brush: a few faint hairlines. */}
      {[0.18, 0.36, 0.54, 0.72].map((k) => (
        <Line key={k} p1={vec(x + 4, y + h * k)} p2={vec(x + w - 4, y + h * k)} color={withAlpha(T.palette.light, 0.05)} strokeWidth={1} />
      ))}
      {/* Catch light on the side toward the key light. */}
      <Rect x={side === 'left' ? x + w * 0.1 : x + w * 0.7} y={y} width={w * 0.1} height={h} color={withAlpha(T.palette.light, 0.08)} />
      {/* Brass kick plate low on the leaf. */}
      <GradientRect rect={{ x: x + 3, y: y + h * 0.84, w: w - 6, h: h * 0.14 }} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.5, 1]} r={2} />
      <Rect x={seamX} y={y} width={2} height={h} color={metal.edge} />
      <Rect x={x} y={y} width={w} height={h} color={metal.edge} style="stroke" strokeWidth={1} />
    </Group>
  );
}

function Slot({ r, clip, beams, shaftTransform }: { r: R; clip: SkRect; beams: number[]; shaftTransform: SharedValue<{ translateY: number }[]> }) {
  return (
    <Group>
      <Group clip={clip}>
        <Rect x={r.x} y={r.y} width={r.w} height={r.h} color={T.palette.surface[0]} />
        <Group transform={shaftTransform}>
          {beams.map((y) => (
            <Rect key={y} x={r.x} y={y} width={r.w} height={4} color={metal.base} />
          ))}
        </Group>
        <Rect x={r.x} y={r.y} width={r.w} height={r.h * 0.3} color={withAlpha(T.palette.light, 0.08)} />
      </Group>
      <RoundedRect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} r={3} color={brass.base} style="stroke" strokeWidth={2} />
    </Group>
  );
}

/** Frame, reveal and threshold: drawn after the leaves, so the frame band overlaps them. */
export const DoorFrame = memo(function DoorFrame({ g }: { g: ConceptGeometry }) {
  const f = g.frame;
  const b = g.band;
  const d = g.door;
  const frameStops = useMemo(() => materialStops(T.palette.brass, 'brushed', T), []);
  return (
    <Group>
      {/* Reveal: the jambs step back into the opening. */}
      <Flat quad={g.reveal.top} color={mix(brass.shadow, T.palette.void, 0.4)} />
      <Flat quad={g.reveal.left} color={brass.shadow} />
      <Flat quad={g.reveal.right} color={mix(brass.shadow, T.palette.void, 0.25)} />
      {/* Frame band: brass, lit from the top left. */}
      <GradientRect rect={{ x: f.x, y: f.y, w: b, h: f.h }} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.5, 1]} />
      <GradientRect rect={{ x: f.x + f.w - b, y: f.y, w: b, h: f.h }} colors={[brass.base, brass.shadow, brass.shadow]} positions={[0, 0.5, 1]} />
      <GradientRect rect={{ x: f.x, y: f.y, w: f.w, h: b }} colors={frameStops.colors} positions={frameStops.positions} />
      {/* Inner and outer dark edges, and a catch light along the top of the band. */}
      <Rect x={d.x - 0.5} y={d.y - 0.5} width={d.w + 1} height={d.h + 1} color={brass.edge} style="stroke" strokeWidth={1.5} />
      <Rect x={f.x + 0.5} y={f.y + 0.5} width={f.w - 1} height={f.h - 1} color={brass.edge} style="stroke" strokeWidth={1.5} />
      <Line p1={vec(f.x + 2, f.y + 1.5)} p2={vec(f.x + f.w - 2, f.y + 1.5)} color={withAlpha(T.palette.light, 0.45)} strokeWidth={1.5} />
      {/* Threshold plate across the sill. */}
      <GradientRect rect={g.threshold} colors={[brass.light, brass.base, brass.shadow]} positions={[0, 0.4, 1]} r={1} />
      <Line p1={vec(g.threshold.x, g.threshold.y + g.threshold.h)} p2={vec(g.threshold.x + g.threshold.w, g.threshold.y + g.threshold.h)} color={brass.edge} strokeWidth={1.5} />
    </Group>
  );
});
