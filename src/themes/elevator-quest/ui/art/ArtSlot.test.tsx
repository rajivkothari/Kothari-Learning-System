import { render, screen, waitFor } from '@testing-library/react-native';
import { loadData } from '@shopify/react-native-skia';
import { Text } from 'react-native';

import type { ArtEntry } from '../../art/manifest';
import { ArtSlot } from './ArtSlot';

it('a rejected image load reports the missing source and preserves its vector fallback', async () => {
  jest.mocked(loadData).mockRejectedValueOnce(new Error('file unavailable'));
  const entry: ArtEntry = { id: 'object.rejected-load', kind: 'object', file: 'objects/test.png', width: 64, height: 64, alpha: true, state: 'any', visual: 'repairKit', provenance: { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' } };
  const onMissing = jest.fn();
  await render(<ArtSlot entry={entry} rect={{ x: 0, y: 0, w: 64, h: 64 }} art={{ set: { entries: [entry], source: () => 'test-rejected-load' }, onMissing }} fallback={<Text>VECTOR</Text>} />);
  await waitFor(() => expect(onMissing).toHaveBeenCalledWith(entry.id));
  expect(screen.getByText('VECTOR')).toBeTruthy();
  expect(screen.queryByTestId('skia-image')).toBeNull();
});
