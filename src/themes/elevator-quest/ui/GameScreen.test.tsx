/**
 * @jest-environment node
 */
/// <reference types="node" />
// Renders the real Floor 15 screen over the real director, runtime, and SQLite (node:sqlite),
// with a silent audio engine. Proves the UI only draws the director's view and forwards touches.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AudioEngine } from '../audio/audioEngine';
import { DEFAULT_AUDIO } from '../audio/mix';
import { LEARNER, openSession, settled, solve, tempDir, virtualTime } from '../testing/headless';
import type { Floor15Session } from '../useFloor15';
import { GameScreen } from './GameScreen';

jest.mock('../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
  };
});

const silent = (): AudioEngine & { requests: number } => {
  const e = {
    requests: 0,
    handle: () => void (e.requests += 1),
    setSettings: () => {},
    suspend: () => {},
    resume: () => {},
    release: () => {},
    status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0 }),
  };
  return e;
};

const metrics = { frame: { x: 0, y: 0, width: 960, height: 600 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const activate = (label: string) => fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

describe('Floor 15 screen', () => {
  it('shows the panel, wakes the lift, and lights the pressed floor', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    const session: Floor15Session = { learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null, settings: { motion: 'normal', audio: DEFAULT_AUDIO } };
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen session={session} />
      </SafeAreaProvider>,
    );
    // A real panel: twenty floors and both door buttons.
    for (const f of [1, 8, 15, 20]) expect(screen.getByLabelText(`Floor ${f}`)).toBeTruthy();
    expect(screen.getByLabelText('DOOR OPEN')).toBeTruthy();
    expect(screen.getByText(/Press DOOR OPEN/)).toBeTruthy();

    await act(async () => {
      activate('DOOR OPEN');
      await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    });
    expect(screen.getByText(/POWER RESTORATION/)).toBeTruthy();
    // The landing's painted floor number is vector art; its sign is announced for screen readers.
    expect(screen.getByLabelText(`Landing sign: floor ${s.view().elevator.floor}`)).toBeTruthy();
    const target = solve(s);
    await act(async () => {
      activate(`Floor ${target}`);
    });
    expect(screen.getByLabelText(`Floor ${target}`).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText(new RegExp(`^Floor indicator: ${s.view().elevator.indicator}`))).toBeTruthy();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('shows the calm test-run board during a Concept Rescue and counts taps', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    const session: Floor15Session = { learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null, settings: { motion: 'reduced', audio: DEFAULT_AUDIO } };
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen session={session} />
      </SafeAreaProvider>,
    );
    await act(async () => {
      s.director.pressDoorOpen();
      await time.runUntil(() => settled(s)() && s.view().stage === 'task');
      for (let i = 0; i < 5; i++) {
        const right = solve(s);
        const before = s.log.entries().filter((e) => e.kind === 'answer').length;
        s.director.pressFloor(right >= 19 ? right - 2 : right + 2);
        await time.runUntil(() => s.log.entries().filter((e) => e.kind === 'answer').length > before && !s.view().saving && (s.view().stage === 'rescue' || settled(s)()));
      }
      await time.runUntil(() => s.view().stage === 'rescue');
    });
    const r = s.view().rescue!;
    expect(screen.getByLabelText('Test run')).toBeTruthy();
    expect(screen.getByText('TEST RUN')).toBeTruthy();
    expect(screen.getByText(r.caption)).toBeTruthy();
    expect(screen.queryByText(/wrong|fail|oops/i)).toBeNull();
    const first = r.origin + (r.direction === 'down' ? -1 : 1);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(`Floor ${first}`, { exact: false }));
    });
    expect(s.view().rescue!.counted).toEqual([first]);
    expect(screen.getByText('MOVE 1')).toBeTruthy();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });
});
