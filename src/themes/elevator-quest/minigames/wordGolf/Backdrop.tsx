// The rooftop behind the course: the approved backdrop art (`minigame.wordgolf.backdrop`, AA) when
// it is in the art set, cover-fitted to the window; else, and while it loads, a clean vector rooftop
// at dusk (flat sky bands, a skyline with a few lit windows, the roof and its railing). Nothing here
// moves, and no words are drawn on it (every word sits on a solid plate).
import { Canvas, Group, Image, Rect, RoundedRect } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import type { ArtEntry } from '../../art/manifest';
import { cover } from '../../art/fit';
import { useArtImage, type ArtSource } from '../../ui/art/ArtSlot';
import { GOLF } from './look';

export const BACKDROP_ID = 'minigame.wordgolf.backdrop';

/** Building heights and window rows from the index (no randomness: the same skyline every time). */
const hash = (i: number) => {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export const Backdrop = memo(function Backdrop({ width, height, entry, art }: { width: number; height: number; entry: ArtEntry | null; art: ArtSource }) {
  const image = useArtImage(entry, art);
  const fit = useMemo(() => (entry ? cover({ x: 0, y: 0, w: width, h: height }, { width: entry.width, height: entry.height }) : null), [entry, width, height]);
  const horizon = height * 0.62;
  const roofY = height * 0.8;
  const skyline = useMemo(() => {
    const out: { x: number; w: number; h: number; near: boolean }[] = [];
    let x = -10;
    let i = 0;
    while (x < width + 10) {
      const w = 40 + hash(i) * 70;
      out.push({ x, w, h: height * (0.08 + hash(i + 50) * 0.2), near: i % 3 === 1 });
      x += w + 4;
      i += 1;
    }
    return out;
  }, [width, height]);
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      {/* The vector rooftop always draws first: it is what shows while the art loads or if it is missing. */}
      <Rect x={0} y={0} width={width} height={height} color={GOLF.sky.top} />
      <Rect x={0} y={height * 0.28} width={width} height={horizon - height * 0.28} color={GOLF.sky.mid} />
      <Rect x={0} y={horizon - height * 0.1} width={width} height={height * 0.1} color={GOLF.sky.low} opacity={0.55} />
      <Rect x={0} y={horizon - height * 0.035} width={width} height={height * 0.035} color={GOLF.sky.glow} opacity={0.35} />
      {skyline.map((b, i) => (
        <Group key={i}>
          <Rect x={b.x} y={roofY - b.h - (b.near ? 0 : height * 0.04)} width={b.w} height={b.h + height * 0.05} color={b.near ? GOLF.skyline.near : GOLF.skyline.far} />
          {Array.from({ length: Math.floor(b.h / 26) }, (_, r) =>
            Array.from({ length: Math.floor(b.w / 22) }, (_, c) =>
              hash(i * 97 + r * 13 + c) > 0.72 ? <Rect key={`${r}-${c}`} x={b.x + 8 + c * 22} y={roofY - b.h + 10 + r * 26 - (b.near ? 0 : height * 0.04)} width={8} height={10} color={GOLF.skyline.window} opacity={0.75} /> : null,
            ),
          )}
        </Group>
      ))}
      {/* The roof deck and its railing. */}
      <Rect x={0} y={roofY} width={width} height={height - roofY} color={GOLF.roof.base} />
      <Rect x={0} y={roofY} width={width} height={6} color={GOLF.roof.light} />
      <Rect x={0} y={roofY + (height - roofY) * 0.55} width={width} height={height} color={GOLF.roof.shadow} opacity={0.5} />
      <Rect x={0} y={roofY - 34} width={width} height={5} color={GOLF.railing.light} />
      <Rect x={0} y={roofY - 18} width={width} height={3} color={GOLF.railing.base} />
      {Array.from({ length: Math.ceil(width / 60) + 1 }, (_, i) => (
        <RoundedRect key={`p${i}`} x={i * 60} y={roofY - 34} width={5} height={34} r={2} color={GOLF.railing.base} />
      ))}
      {image && fit ? <Image image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="cover" /> : null}
    </Canvas>
  );
});
