// Cargo Commander's art by manifest id (AA). Each piece has a vector drawing as its fallback, drawn
// while the image loads and for good if it is missing, so the game is fully playable without art.
import type { ArtEntry, ArtSet } from '../../art/manifest';

export const CARGO_ART_IDS = { backdrop: 'minigame.cargo.backdrop', freight: 'minigame.cargo.freight', crate: 'minigame.cargo.crate' } as const;

export const artEntry = (set: ArtSet, id: string): ArtEntry | null => set.entries.find((e) => e.id === id) ?? null;

/** The crate sprite as an image source for a native image view (it moves with its touch target), or null. */
export function crateSource(set: ArtSet): number | { uri: string } | null {
  const src = set.source(CARGO_ART_IDS.crate);
  if (typeof src === 'number') return src;
  if (typeof src === 'string') return { uri: src };
  if (src && typeof src === 'object' && 'uri' in src && typeof (src as { uri: unknown }).uri === 'string') return { uri: (src as { uri: string }).uri };
  return null;
}

/** An image fitted inside a box without stretching, centred (contain). */
export function containRect(entry: Pick<ArtEntry, 'width' | 'height'>, box: { x: number; y: number; width: number; height: number }) {
  const s = Math.min(box.width / entry.width, box.height / entry.height);
  const w = entry.width * s;
  const h = entry.height * s;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, w, h };
}

/** An image covering a box (cropped at the edges), centred. */
export function coverRect(entry: Pick<ArtEntry, 'width' | 'height'>, box: { x: number; y: number; width: number; height: number }) {
  const s = Math.max(box.width / entry.width, box.height / entry.height);
  const w = entry.width * s;
  const h = entry.height * s;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, w, h };
}
