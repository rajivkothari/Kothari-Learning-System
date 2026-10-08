// The options sheet's playtest "Start over" (D143): adults only, offered only when the app passes
// it (playtest builds, the device's learner), and it asks twice before clearing progress.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsSheet, type SettingsSheetProps } from './Sheets';

const base: SettingsSheetProps = { visible: true, motion: 'normal', output: 'normal', effects: 1, playtest: true, onMotion: () => {}, onOutput: () => {}, onEffects: () => {}, onPlaytest: () => {}, onClose: () => {} };

describe('Start over in the options sheet', () => {
  it('is absent unless the app offers it', async () => {
    await render(<SettingsSheet {...base} />);
    expect(screen.queryByText(/Start over/)).toBeNull();
  });

  it('asks twice, then starts over; closing the sheet forgets the first press', async () => {
    const onStartOver = jest.fn(() => Promise.resolve());
    const onClose = jest.fn();
    await render(<SettingsSheet {...base} onStartOver={onStartOver} onClose={onClose} />);
    await act(async () => fireEvent.press(screen.getByText('Start over (clear progress)')));
    expect(onStartOver).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('Done')));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Start over (clear progress)')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Start over (clear progress)')));
    await act(async () => fireEvent.press(screen.getByText('Press again to clear progress and start over')));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('labels Start over and Done for screen readers, and the label follows the confirm step', async () => {
    await render(<SettingsSheet {...base} onStartOver={() => Promise.resolve()} />);
    const startOver = screen.getByLabelText('Start over (clear progress)');
    expect(startOver.props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Done').props.accessibilityRole).toBe('button');
    await act(async () => fireEvent.press(startOver));
    expect(screen.getByLabelText('Press again to clear progress and start over').props.accessibilityRole).toBe('button');
  });
});
