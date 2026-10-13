// Word Golf's production art (D198): the owner-approved modular pieces, looked up by role and
// loaded through the shared art cache (ArtSlot: ref-counted, released when the canvas unmounts).
// A piece is null while it loads, when it is missing or when it fails to decode, and every drawing
// keeps its vector for that case, piece by piece. Placement math: golfPlacement.ts.
import { Image, ImageShader, Path, type SkImage, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { minigameArt, type ArtEntry, type MiniGameArtRole } from '../../art/manifest';
import { useArtImage, type ArtSource } from '../../ui/art/ArtSlot';
import { copingTiles, spriteRect } from './golfPlacement';

export interface GolfPiece {
  image: SkImage;
  entry: ArtEntry;
}

/** One approved piece, or null (loading, missing, or failed: draw the vector). */
export function useGolfPiece(art: ArtSource, role: MiniGameArtRole): GolfPiece | null {
  const entry = useMemo(() => minigameArt(art.set, 'wordgolf', role), [art.set, role]);
  const image = useArtImage(entry, art);
  return entry && image ? { image, entry } : null;
}

export function Sprite({ piece, x, y, height, opacity }: { piece: GolfPiece; x: number; y: number; height: number; opacity?: number }) {
  const r = spriteRect(piece.entry, x, y, height);
  return <Image image={piece.image} x={r.x} y={r.y} width={r.width} height={r.height} fit="fill" {...(opacity !== undefined ? { opacity } : {})} />;
}

/**
 * A path filled with a repeating texture; `tile` is one image's size in the path's own units, and
 * `origin` where a tile starts (the green puts one whole tile over itself, so no seam crosses it).
 */
export function Textured({ path, piece, tile, origin, opacity }: { path: SkPath; piece: GolfPiece; tile: number; origin?: { x: number; y: number }; opacity?: number }) {
  return (
    <Path path={path} {...(opacity !== undefined ? { opacity } : {})}>
      <ImageShader image={piece.image} tx="repeat" ty="repeat" fit="fill" rect={{ x: origin?.x ?? 0, y: origin?.y ?? 0, width: tile, height: tile }} />
    </Path>
  );
}

export function CopingEdge({ piece, len, t }: { piece: GolfPiece; len: number; t: number }) {
  const tiles = useMemo(() => copingTiles(piece.entry, len, t), [piece.entry, len, t]);
  return (
    <>
      {tiles.map((r, i) => (
        <Image key={i} image={piece.image} x={r.x} y={r.y} width={r.w} height={r.h} fit="fill" />
      ))}
    </>
  );
}

