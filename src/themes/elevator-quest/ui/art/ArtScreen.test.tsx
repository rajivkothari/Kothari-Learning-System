/**
 * @jest-environment node
 */
/// <reference types="node" />
// The real Floor 15 screen with production-style art supplied through the art context (a fixture
// set; the Skia mock "loads" any image with a source). Art is presentation only: the same play
// writes the same learning record with art or with vectors, objects stay touchable with art on,
// a missing image keeps its vector, and the directory is information, never a control.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { canonicalJson } from '../../../../engine';
import { count } from '../../../../runtime/testing/harness';
import type { AudioEngine } from '../../audio/audioEngine';
import { DEFAULT_AUDIO } from '../../audio/mix';
import { PRODUCTION_ART } from '../../art/catalog';
import { calibrationArt, type ArtEntry, type ArtManifest } from '../../art/manifest';
import { FLOOR15, LINES } from '../../content/floor15';
import { LANDINGS, landingFor } from '../../content/landings';
import { LEARNER, openSession, settled, solve, tempDir, virtualTime, type Session } from '../../testing/headless';
import { assembleSession, type Floor15Session } from '../../sessionCore';
import { GameScreen } from '../GameScreen';
import { computeLayout, MIN_BUTTON } from '../layout';
import { directoryGrid } from '../Directory';
import { ArtProvider, DEFAULT_ART_SETTINGS, type ArtSettings } from './ArtContext';
import { ART_CACHE_BYTES, artCacheStats } from './ArtSlot';

jest.mock('../../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
    useSessionSettings: (s: { settings: { subscribe: (l: () => void) => () => void; get: () => unknown } }) => useSyncExternalStore(s.settings.subscribe, s.settings.get, s.settings.get),
  };
});

const silent = (): AudioEngine => ({
  handle: () => {},
  setSettings: () => {},
  suspend: () => {},
  resume: () => {},
  release: () => {},
  status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0, waitingForGesture: false }),
});
const metrics = { frame: { x: 0, y: 0, width: 1180, height: 820 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const provenance = { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' };
const e = (over: Partial<ArtEntry> & Pick<ArtEntry, 'id' | 'kind' | 'file'>): ArtEntry => ({ width: 512, height: 512, alpha: true, provenance, state: 'any', ...over });

/** Art for every floor's landing, the cabin, two Lifty poses and the repair kit. */
/** `failing`: images that are listed and bundled but fail to load (a decode error, a bad file). */
function fixtureArt(failing: string[] = []): ArtSettings {
  const assets: ArtEntry[] = [
    ...Array.from({ length: 20 }, (_, i) => e({ id: `landing.${i + 1}.background`, kind: 'landing', file: `landings/${i + 1}/background.webp`, width: 1024, height: 1024, alpha: false, layer: 'background', floor: i + 1 })),
    e({ id: 'landing.15.core', kind: 'landing', file: 'landings/15/core.webp', layer: 'moving', floor: 15, rect: { x: 0.18, y: 0.3, w: 0.2, h: 0.5 }, motion: { kind: 'tilt', pivot: { x: 0.5, y: 1 }, amount: 0.1, trigger: 'touch' }, hit: { x: 0.18, y: 0.3, w: 0.22, h: 0.5 } }),
    e({ id: 'cabin.backing', kind: 'cabin', file: 'cabin/backing.webp', width: 2048, height: 1536, alpha: false, layer: 'backing' }),
    e({ id: 'cabin.frame-top', kind: 'cabin', file: 'cabin/frame-top.webp', width: 1792, height: 56, layer: 'frame-top' }),
    e({ id: 'cabin.frame-left', kind: 'cabin', file: 'cabin/frame-left.webp', width: 56, height: 1792, layer: 'frame-left' }),
    e({ id: 'cabin.frame-right', kind: 'cabin', file: 'cabin/frame-right.webp', width: 56, height: 1792, layer: 'frame-right' }),
    e({ id: 'cabin.door-left', kind: 'cabin', file: 'cabin/door-left.webp', width: 512, height: 1024, alpha: false, layer: 'door-left' }),
    e({ id: 'cabin.door-right', kind: 'cabin', file: 'cabin/door-right.webp', width: 512, height: 1024, alpha: false, layer: 'door-right' }),
    e({ id: 'lifty.neutral', kind: 'lifty', file: 'lifty/neutral.webp', pose: 'neutral' }),
    e({ id: 'lifty.success', kind: 'lifty', file: 'lifty/success.webp', pose: 'success' }),
    e({ id: 'object.repair-kit', kind: 'object', file: 'objects/repair-kit.webp', width: 512, height: 320, visual: 'repairKit' }),
    e({ id: 'icon.floor-20', kind: 'icon', file: 'icons/floor-20.webp', width: 256, height: 256, floor: 20 }),
  ];
  const manifest: ArtManifest = { schemaVersion: 1, theme: 'elevator-quest', assets };
  const sources = Object.fromEntries(assets.map((a) => [a.id, `${failing.includes(a.id) ? 'fail' : 'fixture'}:${a.id}`]));
  return { ...DEFAULT_ART_SETTINGS, set: calibrationArt(manifest, sources) };
}

const drawn = () => screen.queryAllByTestId('skia-image').map((n) => n.props.accessibilityHint as string);

async function mount(s: Session, art: ArtSettings | null) {
  const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
  const game = <GameScreen session={session} />;
  await render(<SafeAreaProvider initialMetrics={metrics}>{art ? <ArtProvider value={art}>{game}</ArtProvider> : game}</SafeAreaProvider>);
}

/** Wake the lift, do the first job on screen, collect the kit, and go on to the next job. */
async function playFirstJob(s: Session, time: ReturnType<typeof virtualTime>) {
  await act(async () => {
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    fireEvent(screen.getByLabelText(`Floor ${solve(s)}`), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await time.runUntil(() => s.view().success === 'review');
  });
  const floor = s.view().elevator.floor;
  const name = landingFor(LANDINGS, floor, { restored: () => false }).name;
  // Illustrated landing: the number is on the live sign beside the name (D136); vector: the name alone.
  const sign = screen.queryByText(LINES.signNumbered(floor, name)) ? 'numbered' : screen.queryByText(name) ? 'name' : 'none';
  const atReview = { drawn: drawn(), floor, sign };
  const kit = screen.getByLabelText('Load the repair kit into the lift');
  await act(async () => {
    fireEvent(kit, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  expect(s.view().props[0]!.state).toBe('collected');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('NEXT JOB'));
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
  });
  return atReview;
}

async function record(s: Session) {
  return {
    events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
    progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
    state: canonicalJson(await s.rt.learnerState(LEARNER)),
  };
}

/** Vectors only: the developer tools' A/B partner, and what production drew before D145. */
const VECTORS: ArtSettings = { ...DEFAULT_ART_SETTINGS, set: { entries: [], source: () => null } };

describe('production art on the Floor 15 screen', () => {
  it('draws the art it has, keeps the kit touchable with its art, and writes the same record as vectors', async () => {
    const records = [];
    for (const art of [VECTORS, fixtureArt()]) {
      const tmp = tempDir();
      const time = virtualTime();
      const s = await openSession(tmp.file, time, { autoNextJob: false, instanceId: 'same-run' });
      await mount(s, art);
      const withArt = art !== VECTORS;
      if (withArt) expect(drawn()).toEqual(expect.arrayContaining(['fixture:cabin.backing', 'fixture:cabin.frame-top', 'fixture:cabin.frame-left', 'fixture:cabin.frame-right', 'fixture:cabin.door-left', 'fixture:cabin.door-right', 'fixture:lifty.neutral']));
      else expect(drawn()).toEqual([]);
      const atReview = await playFirstJob(s, time);
      if (withArt) expect(atReview.drawn).toEqual(expect.arrayContaining(['fixture:object.repair-kit', `fixture:landing.${atReview.floor}.background`, 'fixture:lifty.success']));
      expect(atReview.sign).toBe(withArt ? 'numbered' : 'name');
      records.push(await record(s));
      s.director.dispose();
      await s.db.close();
      tmp.cleanup();
    }
    expect(records[1]).toEqual(records[0]);
    // Loaded images are cached within the byte budget (a pose change does not reload and flash).
    expect(artCacheStats().entries).toBeGreaterThan(0);
    expect(artCacheStats().bytes).toBeLessThanOrEqual(ART_CACHE_BYTES);
  }, 60_000);

  // The approved art (D145) with each source named by its asset id, so the drawn images say which
  // asset they are; and the screen with no provider at all, which is what a production build mounts.
  const named: ArtSettings = { ...DEFAULT_ART_SETTINGS, set: { entries: PRODUCTION_ART.entries, source: (id) => (PRODUCTION_ART.source(id) === null ? null : `production:${id}`) } };
  const approvedCabin = ['backing', 'ceiling', 'floor', 'wall-left', 'wall-right', 'frame-top', 'frame-left', 'frame-right', 'door-left', 'door-right'].map((l) => `production:cabin.${l}`);
  let namedCount = 0;
  it('the approved cabin and Lifty neutral draw on the real screen (D145)', async () => {
    const tmp = tempDir();
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await mount(s, named);
    expect(drawn()).toEqual(expect.arrayContaining([...approvedCabin, 'production:lifty.neutral']));
    // Nothing else is approved: no landing, object or icon art.
    expect(drawn().filter((d) => !d.startsWith('production:cabin.') && !d.startsWith('production:lifty.'))).toEqual([]);
    namedCount = drawn().length;
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);
  it('a production build (no art provider) draws those same images, not vectors', async () => {
    const tmp = tempDir();
    const s = await openSession(tmp.file, virtualTime(), { autoNextJob: false });
    await mount(s, null);
    expect(namedCount).toBeGreaterThan(approvedCabin.length);
    expect(drawn()).toHaveLength(namedCount);
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);

  it('a missing image keeps its vector part; the game still plays', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { autoNextJob: false });
    await mount(s, fixtureArt(['cabin.door-left', 'lifty.neutral', 'object.repair-kit']));
    expect(drawn()).toContain('fixture:cabin.door-right');
    expect(drawn()).not.toContain('fixture:cabin.door-left');
    expect(drawn()).not.toContain('fixture:lifty.neutral');
    await playFirstJob(s, time);
    expect(s.view().stage).toBe('task');
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);
});

describe('building directory', () => {
  it('lists all twenty floors as information, never as buttons, and closes', async () => {
    const tmp = tempDir();
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    await mount(s, fixtureArt());
    // Asleep: nothing to read yet.
    expect(screen.queryByLabelText('Building directory')).toBeNull();
    await act(async () => {
      s.director.pressDoorOpen();
      await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Building directory'));
    });
    expect(screen.getByText('BUILDING DIRECTORY')).toBeTruthy();
    for (const [floor, name] of [[20, 'rooftop golf'], [13, 'block builder'], [9, 'wind ruins'], [7, 'platform heights'], [6, 'machine room'], [1, 'lobby']] as const) {
      const row = screen.getByLabelText(`Floor ${floor}, ${name}`);
      expect(row.props.accessibilityRole).toBe('text');
    }
    expect(screen.queryByLabelText(/^Floor 21/)).toBeNull();
    // Floor 20 has icon art in this set: its row draws it; the other rows keep their vector emblems.
    expect(drawn().filter((d) => d.startsWith('fixture:icon.'))).toEqual(['fixture:icon.floor-20']);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('CLOSE'));
    });
    expect(screen.queryByText('BUILDING DIRECTORY')).toBeNull();
    // The panel is still the only way to ride: twenty numbered buttons, unchanged.
    for (let f = 1; f <= FLOOR15.floors.max; f++) expect(screen.getByLabelText(`Floor ${f}`).props.accessibilityRole).toBe('button');
    s.director.dispose();
    await s.db.close();
    tmp.cleanup();
  }, 30_000);

  it('lays twenty rows out without overlap, in one or two columns, inside the plate', () => {
    for (const [width, columns] of [[640, 2], [330, 1]] as const) {
      const { cells, height } = directoryGrid(20, width, columns);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(width + 1e-6);
        expect(c.y + c.h).toBeLessThanOrEqual(height + 1e-6);
        expect(c.icon.x + c.icon.w).toBeLessThan(c.x + c.w);
      }
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!;
          const b = cells[j]!;
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
        }
    }
  });

  it('the placard takes spare height only: wide windows get it, the buttons never shrink for it', () => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    const wide = computeLayout({ width: 1180, height: 820 }, none);
    expect(wide.placard).not.toBeNull();
    expect(wide.button).toBeGreaterThanOrEqual(MIN_BUTTON);
    expect(wide.placard!.y).toBeGreaterThanOrEqual(wide.panel.y + wide.panel.height);
    expect(wide.placard!.y + wide.placard!.height).toBeLessThanOrEqual(820);
    for (const [w, h] of [[820, 1180], [600, 960], [507, 1024]] as const) expect(computeLayout({ width: w, height: h }, none).placard).toBeNull();
  });
});
