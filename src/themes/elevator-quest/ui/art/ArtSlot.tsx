// One art layer, or its vector fallback. The image loads on demand (when the slot mounts) and the
// fallback draws until it arrives, and for good if it never does: the game stays playable with any
// asset missing. The destination rectangle already has the image's proportions (art/fit.ts), so
// drawing it never stretches; `cover` here only guards against a manifest with the wrong size.
import { Image, useImage, type DataSourceParam } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';

import type { ArtEntry } from '../../art/manifest';
import type { Rect } from '../../art/fit';
import { useArt } from './ArtContext';

/** The loaded image for an art entry, or null while loading, when missing, or after an error. */
export function useArtImage(entry: ArtEntry | null) {
  const art = useArt();
  const source = entry ? art.set.source(entry.id) : null;
  return useImage((source ?? null) as DataSourceParam, () => {
    if (entry) art.onMissing?.(entry.id);
  });
}

export function ArtSlot({ entry, rect, fallback = null, opacity }: { entry: ArtEntry | null | undefined; rect: Rect; fallback?: ReactNode; opacity?: number }) {
  const image = useArtImage(entry ?? null);
  if (!image) return <>{fallback}</>;
  return <Image image={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fit="cover" {...(opacity !== undefined ? { opacity } : {})} />;
}
