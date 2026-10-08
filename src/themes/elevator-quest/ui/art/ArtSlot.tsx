// One art layer, or its vector fallback. The image loads on demand (when the slot mounts) and the
// fallback draws until it arrives, and for good if it never does: the game stays playable with any
// asset missing. The destination rectangle already has the image's proportions (art/fit.ts), so
// drawing it never stretches; `cover` here only guards against a manifest with the wrong size.
//
// Decoded images are kept in a small cache with a byte budget (art/manifest.ts ART_BUDGET), least
// recently used out first, so a Lifty pose change or an arrival at a prefetched floor does not flash
// the vector fallback. Nothing else is kept: memory on a Fire tablet is the constraint.
import { Image, loadData, Skia, type DataSourceParam, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState, type ReactNode } from 'react';

import { ART_BUDGET, decodedBytes, type ArtEntry } from '../../art/manifest';
import type { Rect } from '../../art/fit';
import type { ArtSettings } from './ArtContext';

/**
 * The art settings a drawing needs. Skia draws a Canvas's children with its own renderer, where
 * React context does not reach, so components inside a Canvas get these as a prop (read with
 * useArt() outside the Canvas) instead of calling useArt() themselves.
 */
export type ArtSource = Pick<ArtSettings, 'set' | 'onMissing'>;

/** Decoded bytes the cache may hold: two landings, the cabin, every Lifty pose and a few objects. */
export const ART_CACHE_BYTES = ART_BUDGET.perLandingBytes * ART_BUDGET.landingWindow + ART_BUDGET.cabinBytes + ART_BUDGET.liftyPoseBytes * 6 + ART_BUDGET.objectBytes * 3;
const cache = new Map<string, { image: SkImage; bytes: number }>();
let cachedBytes = 0;
const keyOf = (id: string, source: unknown) => `${id}|${typeof source === 'object' && source !== null ? JSON.stringify(source) : String(source)}`;

function fromCache(key: string): SkImage | null {
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  cache.set(key, hit); // most recently used last
  return hit.image;
}

function toCache(key: string, image: SkImage, bytes: number) {
  if (cache.has(key) || bytes > ART_CACHE_BYTES) return;
  cache.set(key, { image, bytes });
  cachedBytes += bytes;
  for (const [k, v] of cache) {
    if (cachedBytes <= ART_CACHE_BYTES) break;
    cache.delete(k);
    cachedBytes -= v.bytes;
  }
}

/** For tests: what the cache holds. */
export const artCacheStats = () => ({ entries: cache.size, bytes: cachedBytes });

/** The loaded image for an art entry, or null while loading, when missing, or after an error. */
export function useArtImage(entry: ArtEntry | null, art: ArtSource) {
  const { onMissing } = art;
  const source = entry ? art.set.source(entry.id) : null;
  const key = entry && source !== null ? keyOf(entry.id, source) : null;
  const hit = key ? fromCache(key) : null;
  const [loaded, setLoaded] = useState<{ key: string; image: SkImage | null } | null>(null);
  useEffect(() => {
    if (!key || !entry || source === null || fromCache(key)) return;
    let cancelled = false;
    // Skia's useImage handles a null decoder result, but does not catch a rejected
    // fromURI promise. Own the load so missing files also reach the safe fallback.
    void Promise.resolve().then(() => loadData(source as DataSourceParam, (data) => Skia.Image.MakeImageFromEncoded(data))).then((image) => {
      if (cancelled) return;
      if (image) toCache(key, image, decodedBytes(entry));
      else onMissing?.(entry.id);
      setLoaded({ key, image });
    }).catch(() => {
      if (!cancelled) { onMissing?.(entry.id); setLoaded({ key, image: null }); }
    });
    return () => { cancelled = true; };
  }, [key, source, entry, onMissing]);
  return hit ?? (loaded?.key === key ? loaded.image : null);
}

/** Loads (and caches) images without drawing them: the destination landing while the car travels. */
export function ArtPrefetch({ entries, art }: { entries: readonly ArtEntry[]; art: ArtSource }) {
  return (
    <>
      {entries.map((e) => (
        <Prefetch key={e.id} entry={e} art={art} />
      ))}
    </>
  );
}
function Prefetch({ entry, art }: { entry: ArtEntry; art: ArtSource }) {
  useArtImage(entry, art);
  return null;
}

export function ArtSlot({ entry, rect, art, fallback = null, opacity }: { entry: ArtEntry | null | undefined; rect: Rect; art: ArtSource; fallback?: ReactNode; opacity?: number }) {
  const image = useArtImage(entry ?? null, art);
  if (!image) return <>{fallback}</>;
  return <Image image={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fit="cover" {...(opacity !== undefined ? { opacity } : {})} />;
}
