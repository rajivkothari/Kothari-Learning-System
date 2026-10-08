/**
 * @jest-environment node
 */
/// <reference types="node" />
// The mini-game host on screen (M9): the PLAY button on the landing, the swap to the game's full
// screen (a placeholder until WG and CC land theirs), BACK TO ELEVATOR to the same landing with the
// doors open, over the real director, runtime and SQLite.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { activeTestLearner } from '../../../runtime/devSeed';
import type { AudioEngine } from '../audio/audioEngine';
import { DEFAULT_AUDIO } from '../audio/mix';
import { LINES, THEME_PACK_ID } from '../content/floor15';
import { jumpTo } from '../devtools/floor15Tools';
import { ElevatorOrGame } from '../ElevatorQuestApp';
import { assembleSession, type Floor15Session } from '../sessionCore';
import { openSession, settled, tempDir, virtualTime, type Session } from '../testing/headless';
import { createMiniGameHost } from './host';
import { HOST_COPY } from './hostCopy';
import { MINI_GAME_REGISTRY, definitionFor } from './registry';
import { MINI_GAMES } from './catalog';
import { GAME_TEST_CONTENT, TEST_CATALOG, openTestRuntime } from './testing/gameContent';

jest.mock('../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    DEFAULT_LEARNER_ID: 'learner-1',
    useFloor15: () => ({ session: null, error: null }),
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
    useSessionSettings: (s: { settings: { subscribe: (l: () => void) => () => void; get: () => unknown } }) => useSyncExternalStore(s.settings.subscribe, s.settings.get, s.settings.get),
  };
});
jest.mock('../session', () => ({ openFloor15Services: jest.fn() }));

const silent = (): AudioEngine => ({ handle: () => {}, setSettings: () => {}, suspend: () => {}, resume: () => {}, release: () => {}, status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0, waitingForGesture: false }) });
const metrics = { frame: { x: 0, y: 0, width: 960, height: 600 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const press = (label: string) => fireEvent.press(screen.getByLabelText(label));

async function freeRideAt(file: string, floor: number): Promise<{ s: Session; session: Floor15Session; learner: string }> {
  const time = virtualTime();
  const { db, rt } = await openTestRuntime(file, time);
  const learner = await activeTestLearner(rt, 'learner-test-a', THEME_PACK_ID);
  const instanceId = await jumpTo({ db, runtime: rt, content: GAME_TEST_CONTENT, now: () => time.now() }, learner, 'finale');
  await db.close();
  const s = await openSession(file, time, { learnerId: learner, instanceId, content: GAME_TEST_CONTENT });
  expect(await time.runUntil(settled(s))).toBe(true);
  s.director.pressFloor(15);
  expect(await time.runUntil(() => s.view().stage === 'freeRide' && settled(s)())).toBe(true);
  s.director.pressFloor(floor);
  expect(await time.runUntil(() => s.view().elevator.floor === floor && s.view().elevator.phase === 'idleOpen')).toBe(true);
  await time.advance(1500);
  const audio = silent();
  const games = createMiniGameHost({ runtime: s.rt, learnerId: learner, director: s.director, clock: time, audio, catalog: TEST_CATALOG });
  const session = assembleSession({ learnerId: learner, runtime: s.rt, director: s.director, audio, log: s.log, skillsBefore: null, games }, { motion: 'reduced', audio: DEFAULT_AUDIO });
  return { s, session, learner };
}

describe('mini-game host on screen', () => {
  it('has a screen for every game in the catalog', () => {
    expect(MINI_GAME_REGISTRY.map((g) => [g.id, g.floor])).toEqual(MINI_GAMES.map((g) => [g.id, g.floor]));
    for (const g of MINI_GAMES) expect(typeof definitionFor(g.id).Screen).toBe('function');
  });

  it('PLAY WORD GOLF on Floor 20 opens the game full screen; BACK TO ELEVATOR returns to Floor 20 with the doors open', async () => {
    const tmp = tempDir();
    const { s, session } = await freeRideAt(tmp.file, 20);
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ElevatorOrGame session={session} />
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText(HOST_COPY.entrance.wordGolf!)).toBeTruthy();
    expect(screen.queryByLabelText(HOST_COPY.entrance.cargoCommander!)).toBeNull();
    await act(async () => {
      press(HOST_COPY.entrance.wordGolf!);
      await s.time.advance(100);
    });
    // The elevator screen is gone (its panel too); the game's screen fills the window.
    expect(screen.queryByLabelText('Floor 20')).toBeNull();
    expect(screen.getByTestId('minigame-word-golf')).toBeTruthy();
    expect(s.view().miniGame).toEqual({ id: 'word-golf', floor: 20 });
    await act(async () => {
      press(HOST_COPY.back);
      await s.time.advance(100);
    });
    expect(screen.getByLabelText('Floor 20')).toBeTruthy();
    expect(s.view()).toMatchObject({ miniGame: null, stage: 'freeRide' });
    expect(s.view().elevator).toMatchObject({ floor: 20, phase: 'idleOpen' });
    // Back with an unfinished game: the entrance offers to go back to it.
    expect(screen.getByLabelText(HOST_COPY.resume.wordGolf!)).toBeTruthy();
    await session.games.dispose();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });

  it('Floor 4 offers Cargo Commander; the entrance is not there while the directory is open', async () => {
    const tmp = tempDir();
    const { s, session } = await freeRideAt(tmp.file, 4);
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ElevatorOrGame session={session} />
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText(HOST_COPY.entrance.cargoCommander!)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(LINES.directory.open));
    });
    expect(screen.queryByLabelText(HOST_COPY.entrance.cargoCommander!)).toBeNull();
    await session.games.dispose();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  });
});
