import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from '../../../App';
import { DeviceLabScreen } from './DeviceLabScreen';
import { labStore } from './labStore';

jest.mock('./audio/labAudio', () => ({
  initLabAudio: jest.fn(() => Promise.resolve()),
  releaseLabAudio: jest.fn(),
  playChime: jest.fn(),
  playNarration: jest.fn(),
  stopNarration: jest.fn(),
  setLabVolume: jest.fn((v: number) => v),
  setLabMuted: jest.fn((m: boolean) => m),
  getLabMix: jest.fn(() => ({ volume: 0.8, muted: false })),
}));

jest.mock('./storage/labDb', () => ({
  openLabDb: jest.fn(() => new Promise(() => {})), // never resolves: storage is tested separately
}));

const metrics = {
  frame: { x: 0, y: 0, width: 1180, height: 820 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

async function renderLab() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DeviceLabScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => labStore.reset());

describe('App boot', () => {
  it('offers the developer launcher in development builds and opens the Device Lab from it', async () => {
    await render(<App />);
    expect(screen.getByText('ELEVATOR QUEST')).toBeTruthy();
    expect(screen.getByText('DEVELOPER TOOLS')).toBeTruthy();
    await fireEvent.press(screen.getByText('DEVICE LAB'));
    expect(await screen.findByLabelText('Scene + Touch')).toBeTruthy();
  });
});

describe('Device Lab', () => {
  it('renders the scene scenario with floor buttons and the rapid-tap pad', async () => {
    await renderLab();
    expect(await screen.findByLabelText('6')).toBeTruthy();
    expect(screen.getByLabelText('1')).toBeTruthy();
    expect(screen.getByLabelText('TAP')).toBeTruthy();
  });

  it.each([
    ['Drag', 'Supply crate'],
    ['Draw', 'Drawing surface'],
    ['Audio', 'Play chime'],
    ['SQLite', '+1 event'],
  ])('switches to the %s scenario', async (tab, expected) => {
    await renderLab();
    await fireEvent(screen.getByLabelText(tab), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    // Jest has no layout engine: simulate the stage being measured, as a resize would.
    const stage = screen.queryByTestId('stage-view');
    if (stage) await fireEvent(stage, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 860, height: 600 } } });
    expect(await screen.findByLabelText(expected)).toBeTruthy();
  });

  it('opens the diagnostics panel with an honest build label', async () => {
    await renderLab();
    await fireEvent(screen.getByLabelText('Diag'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(await screen.findByText(/DEBUG build \(not representative for perf\)/)).toBeTruthy();
  });
});
