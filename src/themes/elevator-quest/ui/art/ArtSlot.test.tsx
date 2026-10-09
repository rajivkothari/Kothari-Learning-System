import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as skia from '@shopify/react-native-skia';
import { loadData } from '@shopify/react-native-skia';
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import type { ArtEntry } from '../../art/manifest';
import { LANDINGS, landingFor } from '../../content/landings';
import { DEFAULT_ART_SETTINGS } from './ArtContext';
import { ART_CACHE_BYTES, ArtPrefetch, ArtSlot, artCacheStats, trimArtCacheNow } from './ArtSlot';
import { LandingArt } from './LandingArt';

// Images that know whether they were disposed, and an Image that refuses to draw a disposed one
// (as native Skia throws on a disposed object): a slot drawing freed memory fails the test.
interface FakeImage {
  source: unknown;
  disposed: boolean;
  dispose: () => void;
  width: () => number;
  height: () => number;
}
let made: FakeImage[] = [];
beforeEach(() => {
  made = [];
  jest.spyOn(skia.Skia.Image, 'MakeImageFromEncoded').mockImplementation((data: unknown) => {
    const image: FakeImage = {
      source: (data as { source: unknown }).source,
      disposed: false,
      dispose() {
        if (image.disposed) throw new Error('disposed twice');
        image.disposed = true;
      },
      width: () => 1,
      height: () => 1,
    };
    made.push(image);
    return image as unknown as skia.SkImage;
  });
  jest.spyOn(skia, 'Image').mockImplementation((({ image }: { image: FakeImage | null }) => {
    if (image?.disposed) throw new Error(`drew a disposed image (${String(image.source)})`);
    return image ? createElement(View, { testID: 'skia-image', accessibilityHint: String(image.source) }) : null;
  }) as unknown as typeof skia.Image);
});
afterEach(async () => {
  // Leave the shared cache as the next test expects it: everything let go and trimmed.
  trimArtCacheNow();
  jest.restoreAllMocks();
});

const provenance = { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' };
const fixture = (id: string, size: number): ArtEntry => ({ id, kind: 'object', file: `objects/${id}.png`, width: size, height: size, alpha: true, state: 'any', visual: 'repairKit', provenance });
const artFor = (entries: ArtEntry[], onMissing?: (id: string) => void) => ({ set: { entries, source: (id: string) => (id.includes('missing') ? `fail:${id}` : `src:${id}`) }, ...(onMissing ? { onMissing } : {}) });
const drawn = () => screen.queryAllByTestId('skia-image').map((n) => n.props.accessibilityHint as string);
const imagesOf = (id: string) => made.filter((m) => m.source === `src:${id}`);
/** Over half the idle budget each: two of them never fit at once. */
const BIG = Math.ceil(Math.sqrt(ART_CACHE_BYTES / 4 / 1.6));
const tick = () => act(async () => new Promise((r) => setTimeout(r, 5)));

it('a rejected image load reports the missing source and preserves its vector fallback', async () => {
  jest.mocked(loadData).mockRejectedValueOnce(new Error('file unavailable'));
  const entry: ArtEntry = { id: 'object.rejected-load', kind: 'object', file: 'objects/test.png', width: 64, height: 64, alpha: true, state: 'any', visual: 'repairKit', provenance: { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' } };
  const onMissing = jest.fn();
  await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={{ set: { entries: [entry], source: () => 'test-rejected-load' }, onMissing }} fallback={<Text>VECTOR</Text>} />);
  await waitFor(() => expect(onMissing).toHaveBeenCalledWith(entry.id));
  expect(screen.getByText('VECTOR')).toBeTruthy();
  expect(screen.queryByTestId('skia-image')).toBeNull();
});

it('a missing image keeps its vector, reports once per slot, and leaves nothing cached', async () => {
  const entry = fixture('object.missing-file', 64);
  const onMissing = jest.fn();
  const before = artCacheStats().entries;
  await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={artFor([entry], onMissing)} fallback={<Text>VECTOR</Text>} />);
  await waitFor(() => expect(onMissing).toHaveBeenCalledWith(entry.id));
  expect(onMissing).toHaveBeenCalledTimes(1);
  expect(screen.getByText('VECTOR')).toBeTruthy();
  expect(artCacheStats().entries).toBe(before);
  expect(made).toEqual([]);
});

it('one slot: decoded once, drawn, let go when it unmounts and kept within the budget (not disposed)', async () => {
  const entry = fixture('object.single', 64);
  const art = artFor([entry]);
  const view = await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} fallback={<Text>VECTOR</Text>} />);
  await waitFor(() => expect(drawn()).toEqual(['src:object.single']));
  expect(artCacheStats().held).toBeGreaterThanOrEqual(1);
  await view.unmount();
  await tick();
  expect(imagesOf('object.single')).toHaveLength(1);
  expect(imagesOf('object.single')[0]!.disposed).toBe(false);
  // Mounted again: drawn from the cache on the first render (no flash, no second decode).
  await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} fallback={<Text>VECTOR</Text>} />);
  expect(drawn()).toEqual(['src:object.single']);
  expect(imagesOf('object.single')).toHaveLength(1);
});

it('an image several slots share is decoded once and stays drawn while any of them holds it', async () => {
  const shared = fixture('object.shared', BIG);
  const others = [fixture('object.pusher-a', BIG), fixture('object.pusher-b', BIG)];
  const art = artFor([shared, ...others]);
  const scene = (n: number, push: ArtEntry[]) => (
    <>
      {Array.from({ length: n }, (_, i) => (
        <ArtSlot key={i} entry={shared} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} fallback={<Text>VECTOR</Text>} />
      ))}
      <ArtPrefetch entries={push} art={art} />
    </>
  );
  const view = await render(scene(3, []));
  await waitFor(() => expect(drawn()).toEqual(['src:object.shared', 'src:object.shared', 'src:object.shared']));
  expect(imagesOf('object.shared')).toHaveLength(1);
  // Two slots unmount; images that push the cache over its budget arrive and leave again.
  await view.rerender(scene(1, others));
  await waitFor(() => expect(imagesOf('object.pusher-a').length + imagesOf('object.pusher-b').length).toBe(2));
  await view.rerender(scene(1, []));
  await tick();
  trimArtCacheNow();
  expect(imagesOf('object.shared')[0]!.disposed).toBe(false);
  expect(drawn()).toEqual(['src:object.shared']);
  expect(artCacheStats().idleBytes).toBeLessThanOrEqual(ART_CACHE_BYTES);
  // The last holder goes: now it may leave the cache like any other image.
  await view.rerender(scene(0, []));
  await tick();
  expect(artCacheStats().held).toBe(0);
});

it('eviction disposes images nobody holds, once each, least recently used first, and never a held one', async () => {
  const held = fixture('object.held-small', 64);
  const big = [fixture('object.evict-a', BIG), fixture('object.evict-b', BIG), fixture('object.evict-c', BIG)];
  const art = artFor([held, ...big]);
  const view = await render(
    <>
      <ArtSlot entry={held} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} />
      <ArtPrefetch entries={big} art={art} />
    </>,
  );
  await waitFor(() => expect(made).toHaveLength(4));
  // All held: over budget, yet nothing may be disposed.
  trimArtCacheNow();
  expect(made.filter((m) => m.disposed)).toEqual([]);
  await view.rerender(<ArtSlot entry={held} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} />);
  await tick();
  // Two of the three big ones had to go (one fits the idle budget); the held one never does.
  const gone = big.filter((b) => imagesOf(b.id)[0]!.disposed);
  expect(gone).toHaveLength(2);
  expect(imagesOf(held.id)[0]!.disposed).toBe(false);
  expect(artCacheStats().idleBytes).toBeLessThanOrEqual(ART_CACHE_BYTES);
  expect(drawn()).toEqual(['src:object.held-small']);
});

it('an image disposed by eviction is decoded afresh when a slot needs it again (never the freed one)', async () => {
  const [a, b] = [fixture('object.reload-a', BIG), fixture('object.reload-b', BIG)];
  const art = artFor([a, b]);
  const slot = (e: ArtEntry) => <ArtSlot entry={e} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} fallback={<Text>VECTOR</Text>} />;
  const view = await render(slot(a));
  await waitFor(() => expect(drawn()).toEqual(['src:object.reload-a']));
  await view.rerender(slot(b));
  await waitFor(() => expect(drawn()).toEqual(['src:object.reload-b']));
  await tick();
  expect(imagesOf(a.id)[0]!.disposed).toBe(true);
  await view.rerender(slot(a));
  // The vector shows while it decodes again; then the new image draws.
  await waitFor(() => expect(drawn()).toEqual(['src:object.reload-a']));
  expect(imagesOf(a.id)).toHaveLength(2);
  expect(imagesOf(a.id)[1]!.disposed).toBe(false);
});

it('rapid floor switching: every image is drawn alive, only one stays held, and the idle cache stays within budget', async () => {
  const floors = Array.from({ length: 6 }, (_, i) => fixture(`object.floor-${i}`, Math.round(BIG * 0.8)));
  const art = artFor(floors);
  const slot = (e: ArtEntry, next: ArtEntry | null) => (
    <>
      <ArtSlot entry={e} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={art} fallback={<Text>VECTOR</Text>} />
      <ArtPrefetch entries={next ? [next] : []} art={art} />
    </>
  );
  const view = await render(slot(floors[0]!, floors[1]!));
  for (let i = 1; i < 30; i++) {
    const at = floors[(i * 5) % floors.length]!;
    await view.rerender(slot(at, i % 3 === 0 ? floors[(i * 5 + 1) % floors.length]! : null));
    if (i % 4 === 0) await tick(); // some arrivals settle, others are cut short
  }
  await view.rerender(slot(floors[2]!, null));
  await waitFor(() => expect(drawn()).toEqual(['src:object.floor-2']));
  await tick();
  expect(artCacheStats().held).toBe(1);
  expect(artCacheStats().idleBytes).toBeLessThanOrEqual(ART_CACHE_BYTES);
  // Everything decoded is either still cached or was disposed exactly once (dispose throws on a second time).
  const live = made.filter((m) => !m.disposed).length;
  expect(live).toBe(floors.filter((f) => imagesOf(f.id).some((m) => !m.disposed)).length);
  await view.unmount();
  await tick();
  expect(artCacheStats().held).toBe(0);
});

it('a landing drawn under Reduced Motion holds and lets go of the same images as with motion', async () => {
  const landing = landingFor(LANDINGS, 7, { restored: () => false });
  const layers: ArtEntry[] = [
    { ...fixture('landing.motion-test.background', 64), kind: 'landing', layer: 'background', floor: 7 },
    { ...fixture('landing.motion-test.piece', 32), kind: 'landing', layer: 'moving', floor: 7, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, motion: { kind: 'tilt', pivot: { x: 0.5, y: 1 }, amount: 0.1, trigger: 'touch' } },
  ];
  const art = { ...DEFAULT_ART_SETTINGS, ...artFor(layers) };
  const results: string[][] = [];
  for (const reducedMotion of [false, true]) {
    const heldBefore = artCacheStats().held;
    const view = await render(<LandingArt art={art} layers={layers} landing={landing} door={{ x: 0, y: 0, w: 400, h: 500 }} doorOpen={makeMutable(1)} reaction={0} reducedMotion={reducedMotion} objects={[]} fallback={<Text>VECTOR</Text>} />);
    await waitFor(() => expect(drawn()).toHaveLength(2));
    results.push(drawn());
    expect(artCacheStats().held).toBe(heldBefore + 2);
    await view.unmount();
    await tick();
    expect(artCacheStats().held).toBe(heldBefore);
  }
  expect(results[1]).toEqual(results[0]);
  // The second mount drew from the cache: no second decode.
  expect(made).toHaveLength(2);
});
