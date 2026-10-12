// B1 BOWLING (D191): what the doorway shows in the basement, drawn in the cabin's canvas (vector
// shapes, no art file). A dark room with violet and cyan neon, a lane running away to ten white pins,
// and a ball return beside it: the same lane as Strike Lab, so the place and its game match. Still
// (nothing moves): the doors and the game itself carry the motion.
import { Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { BOWL } from '../minigames/strike/look';

export interface DoorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `sign`: where the place sign's words go, as fractions of the doorway (CabinScene writes them on top). */
export const BasementBackdrop = memo(function BasementBackdrop({ door, sign }: { door: DoorBox; sign: DoorBox }) {
  const { x, y, w, h } = door;
  const shapes = useMemo(() => {
    const path = (pts: [number, number][]) => {
      const b = Skia.PathBuilder.Make();
      pts.forEach(([px, py], i) => (i === 0 ? b.moveTo(x + px * w, y + py * h) : b.lineTo(x + px * w, y + py * h)));
      b.close();
      return b.build();
    };
    // The lane: wide at the doorway's foot, narrow at the pins (one-point perspective at the middle).
    const lane = path([
      [0.18, 1],
      [0.82, 1],
      [0.57, 0.5],
      [0.43, 0.5],
    ]);
    const gutterL = path([
      [0.06, 1],
      [0.18, 1],
      [0.43, 0.5],
      [0.4, 0.5],
    ]);
    const gutterR = path([
      [0.82, 1],
      [0.94, 1],
      [0.6, 0.5],
      [0.57, 0.5],
    ]);
    // Ten pins in four rows, far row first so nearer pins overlap it.
    const pins: { cx: number; cy: number; r: number }[] = [];
    for (let row = 3; row >= 0; row--) {
      for (let i = 0; i <= row; i++) {
        const k = (i - row / 2) * 0.034;
        pins.push({ cx: x + (0.5 + k) * w, cy: y + (0.49 - row * 0.012) * h, r: Math.max(2, w * 0.012) });
      }
    }
    const arrows = [-3, -2, -1, 0, 1, 2, 3].map((k) => path([[0.5 + k * 0.045, 0.79 - Math.abs(k) * 0.008], [0.5 + k * 0.045 - 0.012, 0.815], [0.5 + k * 0.045 + 0.012, 0.815]]));
    return { lane, gutterL, gutterR, pins, arrows };
  }, [x, y, w, h]);
  return (
    <Group>
      {/* The room: dark, with a lit band where the pins stand. */}
      <Rect x={x} y={y} width={w} height={h} color={BOWL.room} />
      <Rect x={x} y={y + h * 0.36} width={w} height={h * 0.16} color={BOWL.lights} opacity={0.35} />
      {/* Neon strips down both walls: violet and cyan, steady. */}
      <RoundedRect x={x + w * 0.04} y={y + h * 0.22} width={Math.max(3, w * 0.02)} height={h * 0.7} r={3} color={BOWL.lights} />
      <RoundedRect x={x + w * 0.94} y={y + h * 0.22} width={Math.max(3, w * 0.02)} height={h * 0.7} r={3} color={BOWL.glow} />
      <Path path={shapes.gutterL} color={BOWL.gutter.base} />
      <Path path={shapes.gutterR} color={BOWL.gutter.base} />
      <Path path={shapes.lane} color={BOWL.lane.base} />
      <Path path={shapes.lane} color={BOWL.lane.edge} style="stroke" strokeWidth={1.5} />
      {[0.38, 0.5, 0.62].map((k) => (
        <Line key={k} p1={vec(x + (0.18 + (0.64 * (k - 0.18)) / 0.64) * w, y + h)} p2={vec(x + (0.43 + 0.14 * ((k - 0.18) / 0.64)) * w, y + h * 0.5)} color={BOWL.lane.shadow} strokeWidth={1} opacity={0.4} />
      ))}
      {shapes.arrows.map((a, i) => (
        <Path key={i} path={a} color={BOWL.arrow} opacity={0.8} />
      ))}
      <Line p1={vec(x + w * 0.16, y + h * 0.93)} p2={vec(x + w * 0.84, y + h * 0.93)} color={BOWL.foul} strokeWidth={2} />
      {shapes.pins.map((p, i) => (
        <Group key={i}>
          <RoundedRect x={p.cx - p.r} y={p.cy - p.r * 3.2} width={p.r * 2} height={p.r * 3.2} r={p.r} color={BOWL.pin.base} />
          <Rect x={p.cx - p.r * 0.7} y={p.cy - p.r * 2.4} width={p.r * 1.4} height={Math.max(1, p.r * 0.35)} color={BOWL.pinBand} />
        </Group>
      ))}
      {/* The lightbox sign over the lane: a dark plate with a violet neon edge (the words sit on top). */}
      <RoundedRect x={x + sign.x * w - 6} y={y + sign.y * h - 3} width={sign.w * w + 12} height={sign.h * h + 6} r={8} color={BOWL.room} />
      <RoundedRect x={x + sign.x * w - 6} y={y + sign.y * h - 3} width={sign.w * w + 12} height={sign.h * h + 6} r={8} color={BOWL.lights} style="stroke" strokeWidth={2.5} />
      {/* The ball return on the right, two balls waiting. */}
      <RoundedRect x={x + w * 0.74} y={y + h * 0.72} width={w * 0.2} height={h * 0.1} r={6} color={BOWL.gutter.light} />
      <Circle cx={x + w * 0.79} cy={y + h * 0.71} r={w * 0.035} color={BOWL.ball.base} />
      <Circle cx={x + w * 0.79 - w * 0.012} cy={y + h * 0.71 - w * 0.012} r={w * 0.012} color={BOWL.ball.light} />
      <Circle cx={x + w * 0.88} cy={y + h * 0.71} r={w * 0.035} color={BOWL.glow} opacity={0.85} />
    </Group>
  );
});
