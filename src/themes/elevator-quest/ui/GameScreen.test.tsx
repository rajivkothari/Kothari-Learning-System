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
import { FLOOR15 } from '../content/floor15';
import { LANDINGS, exploreSpots } from '../content/landings';
import { LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime } from '../testing/headless';
import { assembleSession, type Floor15Session } from '../sessionCore';
import { ViewportProvider } from '../../../presentation/viewport';
import { GameScreen } from './GameScreen';
import { hotspotLabel, hotspotTarget } from './Hotspot';
import { computeLayout } from './layout';

jest.mock('../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
    useSessionSettings: (s: { settings: { subscribe: (l: () => void) => () => void; get: () => unknown } }) => useSyncExternalStore(s.settings.subscribe, s.settings.get, s.settings.get),
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
    status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0, waitingForGesture: false }),
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
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
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
    // The landing's painted floor number is vector art; the place is announced for screen readers.
    expect(screen.getByLabelText(new RegExp(`^Landing: floor ${s.view().elevator.floor}, `))).toBeTruthy();
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
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'reduced', audio: DEFAULT_AUDIO });
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

  it('lays itself out for a simulated viewport with its real layout (no scaling)', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
    for (const size of [
      { width: 375, height: 820 },
      { width: 1180, height: 820 },
    ]) {
      const expected = computeLayout(size, { top: 0, right: 0, bottom: 0, left: 0 });
      const r = await render(
        <SafeAreaProvider initialMetrics={metrics}>
          <ViewportProvider viewport={{ ...size, label: 'test (simulated)' }}>
            <GameScreen session={session} />
          </ViewportProvider>
        </SafeAreaProvider>,
      );
      const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as { width?: number };
      expect(flat(screen.getByLabelText('Floor 1').props.style).width).toBe(expected.button);
      expect(expected.button).toBeGreaterThanOrEqual(64);
      await r.unmount();
    }
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('a hall call marks its button with a word and a ring, and only that button can light', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoHallCalls: false });
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'reduced', audio: DEFAULT_AUDIO });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen session={session} />
      </SafeAreaProvider>,
    );
    await act(async () => {
      s.director.pressDoorOpen();
      await time.runUntil(() => s.view().stage === 'call');
    });
    const call = s.view().hallCall!;
    expect(screen.getByLabelText(`Floor ${call}`).props.accessibilityValue).toEqual({ text: 'calling the lift' });
    expect(screen.getByText('CALL')).toBeTruthy(); // a word on the button, not color alone
    const other = call === 1 ? 2 : 1;
    expect(screen.getByLabelText(`Floor ${other}`).props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      activate(`Floor ${call}`);
    });
    expect(s.view().stage).toBe('reposition');
    expect(screen.queryByText('CALL')).toBeNull();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('completion leaves no card; free ride offers the clipboard log and touchable landings', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen session={session} />
      </SafeAreaProvider>,
    );
    await act(async () => {
      s.director.pressDoorOpen();
      await time.runUntil(() => settled(s)() && s.view().stage === 'task');
      while (s.view().stage !== 'finale') await answerCorrectly(s);
      s.director.pressFloor(FLOOR15.repairFloor);
      await time.runUntil(() => s.view().stage === 'complete' && s.view().floor15Restored);
    });
    // The restoration happens in the world: nothing covers the restored landing.
    expect(screen.queryByText(/MISSION COMPLETE/)).toBeNull();
    expect(screen.queryByText('PLAY AGAIN')).toBeNull();
    await act(async () => {
      await time.runUntil(() => s.view().stage === 'freeRide');
    });
    expect(screen.getByText('ENGINEER RANK 1')).toBeTruthy();
    // The core on Floor 15 is touchable now (a large target, an object name, not "button").
    const core = exploreSpots(LANDINGS, 15)[0]!;
    const spot = screen.getByLabelText(hotspotLabel(core.object, false));
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as { width: number; height: number };
    expect(flat(spot.props.style).width).toBeGreaterThanOrEqual(64);
    expect(flat(spot.props.style).height).toBeGreaterThanOrEqual(64);
    await act(async () => {
      fireEvent(spot, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(s.view().discoveries).toEqual([core.discovery]);
    expect(screen.getByLabelText(hotspotLabel(core.object, true))).toBeTruthy();
    // The clipboard opens the log: found facts only, and a full-size way out.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Engineer Log'));
    });
    expect(screen.getByText('ENGINEER LOG')).toBeTruthy();
    expect(screen.getByText(core.fact)).toBeTruthy();
    expect(screen.queryByText(exploreSpots(LANDINGS, 7)[0]!.fact)).toBeNull();
    expect(screen.getAllByText('NOT INSPECTED YET').length).toBe(4);
    expect(screen.getByText('RUN FLOOR 15 AGAIN')).toBeTruthy();
    // The landing is not touchable through the log.
    expect(screen.queryByLabelText(hotspotLabel(core.object, true))).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('CLOSE'));
    });
    expect(s.view().logOpen).toBe(false);
    expect(screen.queryByText('ENGINEER LOG')).toBeNull();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);
});

describe('child-paced success on screen', () => {
  it('shows the repair kit on arrival, lets it be loaded, and waits on a NEXT JOB button', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoNextJob: false });
    const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen session={session} />
      </SafeAreaProvider>,
    );
    await act(async () => {
      s.director.pressDoorOpen();
      await time.runUntil(() => settled(s)() && s.view().stage === 'task');
      s.director.pressFloor(solve(s));
      await time.runUntil(() => s.view().success === 'review');
    });
    // The kit is a labelled, touchable thing on the landing (an object, not a reward sticker).
    const kit = screen.getByLabelText('Load the repair kit into the lift');
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as { width: number; height: number };
    expect(flat(kit.props.style).width).toBeGreaterThanOrEqual(64);
    expect(flat(kit.props.style).height).toBeGreaterThanOrEqual(64);
    await act(async () => {
      fireEvent(kit, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(s.view().props[0]!.state).toBe('collected');
    expect(screen.queryByLabelText('Load the repair kit into the lift')).toBeNull();
    // NEXT JOB: a word and an arrow, a full-size target, and the only way on.
    const next = screen.getByLabelText('NEXT JOB');
    expect(screen.getByText('NEXT JOB')).toBeTruthy();
    expect(flat(next.props.style).width).toBeGreaterThanOrEqual(64);
    await act(async () => {
      await time.advance(30_000);
    });
    expect(s.view().stage).toBe('success');
    await act(async () => {
      fireEvent.press(next);
    });
    expect(s.view().stage).toBe('call');
    expect(screen.queryByText('NEXT JOB')).toBeNull();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);
});

describe('landing hotspots', () => {
  it('grow to the minimum touch target around the object and stay inside the doorway', () => {
    const door = { x: 100, y: 50, width: 220, height: 300 };
    const small = hotspotTarget({ x: 105, y: 60, width: 30, height: 40 }, door);
    expect(small.width).toBeGreaterThanOrEqual(64);
    expect(small.height).toBeGreaterThanOrEqual(64);
    expect(small.x).toBeGreaterThanOrEqual(door.x);
    expect(small.y).toBeGreaterThanOrEqual(door.y);
    const big = { x: 120, y: 100, width: 90, height: 120 };
    expect(hotspotTarget(big, door)).toEqual(big);
  });

  it('say what they are and whether they were inspected', () => {
    expect(hotspotLabel('telescope', false)).toBe('Inspect the telescope');
    expect(hotspotLabel('telescope', true)).toMatch(/^telescope, inspected/);
  });
});
