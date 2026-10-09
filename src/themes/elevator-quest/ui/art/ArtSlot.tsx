// One art layer, or its vector fallback. The image loads on demand (when the slot mounts) and the
// fallback draws until it arrives, and for good if it never does: the game stays playable with any
// asset missing. The destination rectangle already has the image's proportions (art/fit.ts), so
// drawing it never stretches; `cover` here only guards against a manifest with the wrong size.
//
// Decoded images live in one shared cache, each image decoded once however many slots draw it.
// Every slot that draws an image holds it (a count of holders); an image nobody holds stays cached
// within a byte budget (art/manifest.ts ART_BUDGET), least recently used out first, so a Lifty pose
// change or an arrival at a prefetched floor does not flash the vector fallback. An image leaving
// the cache is disposed (its Skia memory freed at once, not whenever a garbage collection happens to
// run, M9.1): only once no slot holds it, so nothing ever draws a disposed image. Memory on a Fire
// tablet is the constraint.
import { Image, loadData, Skia, type DataSourceParam, type SkImage } from '@shopify/react-native-skia';
import { useLayoutEffect, useState, type ReactNode } from 'react';

import { ART_BUDGET, decodedBytes, type ArtEntry } from '../../art/manifest';
import type { Rect } from '../../art/fit';
import type { ArtSettings } from './ArtContext';

/**
 * The art settings a drawing needs. Skia draws a Canvas's children with its own renderer, where
 * React context does not reach, so components inside a Canvas get these as a prop (read with
 * useArt() outside the Canvas) instead of calling useArt() themselves.
 */
export type ArtSource = Pick<ArtSettings, 'set' | 'onMissing'>;

/** Decoded bytes the cache may keep for images no slot holds: two landings, the cabin, every Lifty pose and a few objects. */
export const ART_CACHE_BYTES = ART_BUDGET.perLandingBytes * ART_BUDGET.landingWindow + ART_BUDGET.cabinBytes + ART_BUDGET.liftyPoseBytes * 6 + ART_BUDGET.objectBytes * 3;

interface Cached {
  image: SkImage;
  bytes: number;
  /** Slots holding the image now (drawing it, or prefetching it). */
  holders: number;
}
/** Insertion order is use order: least recently used first. */
const cache = new Map<string, Cached>();
/** Loads in flight, so two slots asking for one image share one decode. */
const loading = new Map<string, Promise<boolean>>();
let cachedBytes = 0;
let disposed = 0;
let trimQueued = false;
const keyOf = (id: string, source: unknown) => `${id}|${typeof source === 'object' && source !== null ? JSON.stringify(source) : String(source)}`;

function touch(key: string): Cached | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit); // most recently used last
  return hit;
}

/** The cached image, for a slot's first render (it takes hold of it as it commits, see useArtImage). */
const peek = (key: string) => touch(key)?.image ?? null;

function hold(key: string): SkImage | null {
  const hit = touch(key);
  if (!hit) return null;
  hit.holders += 1;
  return hit.image;
}

function letGo(key: string, image: SkImage) {
  const hit = cache.get(key);
  if (!hit || hit.image !== image) return;
  hit.holders = Math.max(0, hit.holders - 1);
  queueTrim();
}

function dispose(image: SkImage) {
  disposed += 1;
  try {
    image.dispose();
  } catch {
    // Already gone (or a stand-in without Skia memory): nothing left to free.
  }
}

/**
 * Evicts images nobody holds, least recently used first, until the cache is within its budget.
 * Deferred to a later task, never run inside a React commit: a slot that rendered with a cached
 * image takes hold of it in that commit's layout effects, after other slots' cleanups have run.
 */
function queueTrim() {
  if (trimQueued) return;
  trimQueued = true;
  setTimeout(trimNow, 0);
}
function trimNow() {
  trimQueued = false;
  for (const [key, entry] of cache) {
    if (cachedBytes <= ART_CACHE_BYTES) break;
    if (entry.holders > 0) continue;
    cache.delete(key);
    cachedBytes -= entry.bytes;
    dispose(entry.image);
  }
}

/** Decodes an image into the cache (once per key, however many slots ask). True when it loaded. */
function load(key: string, source: unknown, bytes: number): Promise<boolean> {
  const pending = loading.get(key);
  if (pending) return pending;
  // Skia's useImage handles a null decoder result, but does not catch a rejected fromURI promise.
  // Own the load so missing files also reach the safe fallback.
  const p = Promise.resolve()
    .then(() => loadData(source as DataSourceParam, (data) => Skia.Image.MakeImageFromEncoded(data)))
    .then(
      (image) => {
        if (!image) return false;
        if (cache.has(key)) dispose(image); // decoded meanwhile by another path: keep one
        else {
          cache.set(key, { image, bytes, holders: 0 });
          cachedBytes += bytes;
          queueTrim();
        }
        return true;
      },
      () => false,
    )
    .finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

/** For tests: what the cache holds (all bytes, and those held by mounted slots), and images disposed so far. */
export const artCacheStats = () => {
  let held = 0;
  let heldBytes = 0;
  for (const e of cache.values()) {
    if (e.holders === 0) continue;
    held += 1;
    heldBytes += e.bytes;
  }
  return { entries: cache.size, bytes: cachedBytes, held, heldBytes, idleBytes: cachedBytes - heldBytes, loading: loading.size, disposed };
};
/** For tests: run the deferred eviction now. */
export const trimArtCacheNow = trimNow;

/** The loaded image for an art entry, or null while loading, when missing, or after an error. */
export function useArtImage(entry: ArtEntry | null, art: ArtSource) {
  const { onMissing } = art;
  const source = entry ? art.set.source(entry.id) : null;
  const key = entry && source !== null ? keyOf(entry.id, source) : null;
  const [held, setHeld] = useState<{ key: string; image: SkImage | null } | null>(null);
  // A layout effect, so a slot drawn from the cache on its first render (a prefetched landing, a
  // remount) holds that image in the same commit: nothing can evict it in between.
  useLayoutEffect(() => {
    if (!key || !entry || source === null) return;
    let cancelled = false;
    let mine: SkImage | null = null;
    const take = (image: SkImage) => {
      mine = image;
      setHeld((prev) => (prev?.key === key && prev.image === image ? prev : { key, image }));
    };
    const hit = hold(key);
    if (hit) take(hit);
    else
      void load(key, source, decodedBytes(entry)).then((ok) => {
        if (cancelled) return;
        // Eviction waits for a later task, so a just-decoded image is still cached here.
        const image = ok ? hold(key) : null;
        if (image) take(image);
        else {
          onMissing?.(entry.id);
          setHeld({ key, image: null });
        }
      });
    return () => {
      cancelled = true;
      if (mine) letGo(key, mine);
    };
  }, [key, source, entry, onMissing]);
  if (!key) return null;
  if (held?.key === key) return held.image;
  return peek(key);
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
