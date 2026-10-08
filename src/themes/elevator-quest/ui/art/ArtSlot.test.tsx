import { render, screen, waitFor } from '@testing-library/react-native';
import { loadData } from '@shopify/react-native-skia';
import { Text } from 'react-native';

import type { ArtEntry } from '../../art/manifest';
import { ArtPrefetch, ArtSlot, artCacheStats } from './ArtSlot';

it('a rejected image load reports the missing source and preserves its vector fallback', async () => {
  jest.mocked(loadData).mockRejectedValueOnce(new Error('file unavailable'));
  const entry: ArtEntry = { id: 'object.rejected-load', kind: 'object', file: 'objects/test.png', width: 64, height: 64, alpha: true, state: 'any', visual: 'repairKit', provenance: { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' } };
  const onMissing = jest.fn();
  await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={{ set: { entries: [entry], source: () => 'test-rejected-load' }, onMissing }} fallback={<Text>VECTOR</Text>} />);
  await waitFor(() => expect(onMissing).toHaveBeenCalledWith(entry.id));
  expect(screen.getByText('VECTOR')).toBeTruthy();
  expect(screen.queryByTestId('skia-image')).toBeNull();
});

it('a slot that first drew a prefetched image keeps drawing it after the cache evicts it', async () => {
  const fixture = (id: string, size: number): ArtEntry => ({ id, kind: 'object', file: `objects/${id}.png`, width: size, height: size, alpha: true, state: 'any', visual: 'repairKit', provenance: { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' } });
  const small = fixture('object.keeps-drawing', 64);
  // Two entries just under the whole cache budget each: loading both evicts everything else.
  const big = [fixture('object.big-a', 3000), fixture('object.big-b', 3000)];
  const art = { set: { entries: [small, ...big], source: (id: string) => `src:${id}` } };
  const scene = (slot: boolean, rect: number, extra: ArtEntry[]) => (
    <>
      {slot ? <ArtSlot entry={small} rect={{ x: 0, y: 0, w: rect, h: rect }} art={art} fallback={<Text>VECTOR</Text>} /> : null}
      <ArtPrefetch entries={extra} art={art} />
    </>
  );
  // The destination landing is prefetched while the car travels, then drawn from the cache on arrival.
  const view = await render(scene(false, 64, [small]));
  await waitFor(() => expect(artCacheStats().entries).toBeGreaterThan(0));
  await view.rerender(scene(true, 64, []));
  expect(screen.getByTestId('skia-image')).toBeTruthy();
  await view.rerender(scene(true, 64, big));
  await waitFor(() => expect(artCacheStats().entries).toBe(1));
  // A later re-render of the still-mounted slot (a layout change) must not drop to the vector.
  await view.rerender(scene(true, 72, big));
  expect(screen.queryByText('VECTOR')).toBeNull();
  expect(screen.getByTestId('skia-image')).toBeTruthy();
});
