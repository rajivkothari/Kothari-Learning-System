/**
 * @jest-environment node
 */
/// <reference types="node" />
// Art image lifetime across the mini-game swap (M9.1): the elevator's images are let go while a
// game is open and drawn again on BACK TO ELEVATOR, the game's are let go when it closes, nothing
// ever draws a disposed image, and going in and out again and again decodes nothing new after the
// first time (no images pile up). Over the real director, runtime and SQLite, with the approved art
// set (each source named by its asset id) and a Skia stand-in whose images know when they are disposed.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as skia from '@shopify/react-native-skia';
import { createElement } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { activeTestLearner } from '../../../../runtime/devSeed';
import { PRODUCTION_ART } from '../../art/catalog';
import type { AudioEngine } from '../../audio/audioEngine';
import { DEFAULT_AUDIO } from '../../audio/mix';
import { THEME_PACK_ID } from '../../content/floor15';
import { jumpTo } from '../../devtools/floor15Tools';
import { ElevatorOrGame } from '../../ElevatorQuestApp';
import { createMiniGameHost } from '../../minigames/host';
import { HOST_COPY } from '../../minigames/hostCopy';
import { GAME_TEST_CONTENT, TEST_CATALOG, openTestRuntime } from '../../minigames/testing/gameContent';
import { assembleSession } from '../../sessionCore';
import { openSession, settled, tempDir, virtualTime } from '../../testing/headless';
import { ArtProvider, DEFAULT_ART_SETTINGS, type ArtSettings } from './ArtContext';
import { artCacheStats, trimArtCacheNow } from './ArtSlot';

jest.mock('../../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    DEFAULT_LEARNER_ID: 'learner-1',
    useFloor15: () => ({ session: null, error: null }),
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
    useSessionSettings: (s: { settings: { subscribe: (l: () => void) => () => void; get: () => unknown } }) => useSyncExternalStore(s.settings.subscribe, s.settings.get, s.settings.get),
  };
});
jest.mock('../../session', () => ({ openFloor15Services: jest.fn() }));

interface FakeImage {
  source: string;
  disposed: boolean;
  dispose: () => void;
}
let made: FakeImage[] = [];
beforeEach(() => {
  made = [];
  jest.spyOn(skia.Skia.Image, 'MakeImageFromEncoded').mockImplementation((data: unknown) => {
    const image: FakeImage = {
      source: String((data as { source: unknown }).source),
      disposed: false,
      dispose() {
        if (image.disposed) throw new Error('disposed twice');
        image.disposed = true;
      },
    };
    made.push(image);
    return image as unknown as skia.SkImage;
  });
  jest.spyOn(skia, 'Image').mockImplementation((({ image }: { image: FakeImage | null }) => {
    if (image?.disposed) throw new Error(`drew a disposed image (${image.source})`);
    return image ? createElement(View, { testID: 'skia-image', accessibilityHint: image.source }) : null;
  }) as unknown as typeof skia.Image);
});
afterEach(() => {
  trimArtCacheNow();
  jest.restoreAllMocks();
});

const silent = (): AudioEngine => ({ handle: () => {}, setSettings: () => {}, suspend: () => {}, resume: () => {}, release: () => {}, status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0, waitingForGesture: false }) });
const metrics = { frame: { x: 0, y: 0, width: 1180, height: 820 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const named: ArtSettings = { ...DEFAULT_ART_SETTINGS, set: { entries: PRODUCTION_ART.entries, source: (id) => (PRODUCTION_ART.source(id) === null ? null : `production:${id}`) } };
const drawn = () => screen.queryAllByTestId('skia-image').map((n) => n.props.accessibilityHint as string);

async function freeRideAt(file: string, floor: number, motion: 'normal' | 'reduced') {
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
  const session = assembleSession({ learnerId: learner, runtime: s.rt, director: s.director, audio, log: s.log, skillsBefore: null, games }, { motion, audio: DEFAULT_AUDIO });
  return { s, session };
}

/** Let loads resolve and the deferred eviction run (real timers: the Skia stand-in loads at once). */
const settle = (s: { time: { advance: (ms: number) => Promise<unknown> } }) =>
  act(async () => {
    for (let i = 0; i < 4; i++) {
      await s.time.advance(50);
      await new Promise((r) => setTimeout(r, 2));
    }
  });

describe.each([
  ['Word Golf', 20, HOST_COPY.entrance.wordGolf!, 'minigame.wordgolf.', 'normal'],
  ['Cargo Commander', 4, HOST_COPY.entrance.cargoCommander!, 'minigame.cargo.', 'normal'],
  ['Word Golf under Reduced Motion', 20, HOST_COPY.entrance.wordGolf!, 'minigame.wordgolf.', 'reduced'],
] as const)('art across %s', (_name, floor, entrance, gameArt, motion) => {
  it('lets the elevator art go while the game is open, the game art go on BACK, and decodes nothing new on later rounds', async () => {
    const tmp = tempDir();
    const { s, session } = await freeRideAt(tmp.file, floor, motion);
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ArtProvider value={named}>
          <ElevatorOrGame session={session} />
        </ArtProvider>
      </SafeAreaProvider>,
    );
    await settle(s);
    const elevatorDrawn = drawn();
    expect(elevatorDrawn).toEqual(expect.arrayContaining([`production:landing.${floor}.background`, 'production:cabin.backing']));
    const heldInElevator = artCacheStats().held;
    const madeBefore: number[] = [];
    for (let round = 0; round < 3; round++) {
      await act(async () => {
        fireEvent.press(screen.getAllByLabelText(round === 0 ? entrance : new RegExp(`^(${entrance}|BACK TO .*)$`))[0]!);
      });
      await settle(s);
      // The game's own art is drawn; the elevator's is not drawn and not held.
      expect(drawn().some((d) => d.startsWith(`production:${gameArt}`))).toBe(true);
      expect(drawn().some((d) => d.startsWith('production:cabin.'))).toBe(false);
      expect(artCacheStats().held).toBeLessThan(heldInElevator);
      await act(async () => {
        fireEvent.press(screen.getAllByTestId(/^(wg-back|minigame-back)$/)[0]!);
      });
      await settle(s);
      expect(drawn()).toEqual(expect.arrayContaining([`production:landing.${floor}.background`, 'production:cabin.backing']));
      expect(drawn().some((d) => d.startsWith(`production:${gameArt}`))).toBe(false);
      madeBefore.push(made.length);
    }
    // After the first round everything comes from the cache: nothing decoded again, nothing disposed twice.
    expect(madeBefore[2]).toBe(madeBefore[0]);
    // The Image stand-in throws on a disposed image, so every round drew live images only.
    expect(artCacheStats().held).toBe(heldInElevator);
    await session.games.dispose();
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 60_000);
});
