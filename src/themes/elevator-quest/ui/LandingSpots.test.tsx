/**
 * @jest-environment node
 */
/// <reference types="node" />
// Landing things on screen, with art and without: every spot is a labelled, full-size touch on the
// vector landing and on the art; a prop that is missing from the manifest or fails to decode never
// leaves a dead or invisible spot (the putt draws its own ball, the rest glow); the toolbox shows its
// open picture while open. The Skia stand-in (jest.setup.ts) draws each loaded image as a tagged view.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { calibrationArt, type ArtEntry, type ArtManifest } from '../art/manifest';
import { LANDINGS, exploreSpots, landingFor } from '../content/landings';
import type { DirectorView } from '../director/director';
import { spotKey, touchTargets } from '../director/landingTouch';
import { NORMAL_TIMING, createElevator } from '../sim/elevator';
import { ArtProvider, DEFAULT_ART_SETTINGS, type ArtSettings } from './art/ArtContext';
import { CabinScene } from './CabinScene';
import { computeLayout } from './layout';

const provenance = { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' };
const e = (over: Partial<ArtEntry> & Pick<ArtEntry, 'id' | 'kind' | 'file'>): ArtEntry => ({ width: 512, height: 512, alpha: true, provenance, state: 'any', ...over });
let run = 0;

/** Landing art for floors 2 and 20 with the spots' props. `failing`: listed but broken files; `leave`: not in the manifest at all. */
function art({ failing = [], leave = [] }: { failing?: string[]; leave?: string[] } = {}): ArtSettings {
  const tag = `run${++run}`;
  const assets: ArtEntry[] = [
    e({ id: 'landing.20.background', kind: 'landing', file: 'landings/20/background.webp', width: 1024, height: 1024, alpha: false, layer: 'background', floor: 20 }),
    e({ id: 'landing.20.ball', kind: 'landing', file: 'landings/20/ball.webp', width: 64, height: 64, layer: 'moving', floor: 20, rect: { x: 0.385, y: 0.82, w: 0.03, h: 0.03 } }),
    e({ id: 'landing.2.background', kind: 'landing', file: 'landings/2/background.webp', width: 1024, height: 1024, alpha: false, layer: 'background', floor: 2 }),
    e({ id: 'landing.2.toolbox', kind: 'landing', file: 'landings/2/toolbox.webp', width: 256, height: 192, layer: 'moving', floor: 2, rect: { x: 0.36, y: 0.5, w: 0.14, h: 0.1 } }),
    e({ id: 'landing.2.toolbox-open', kind: 'landing', file: 'landings/2/toolbox-open.webp', width: 256, height: 256, layer: 'moving', floor: 2, rect: { x: 0.36, y: 0.45, w: 0.14, h: 0.15 } }),
  ].filter((a) => !leave.includes(a.id));
  const manifest: ArtManifest = { schemaVersion: 1, theme: 'elevator-quest', assets };
  return { ...DEFAULT_ART_SETTINGS, set: calibrationArt(manifest, Object.fromEntries(assets.map((a) => [a.id, `${failing.includes(a.id) ? 'fail' : tag}:${a.id}`]))) };
}

let current: Awaited<ReturnType<typeof render>> | null = null;
beforeEach(() => (current = null));
const layout = computeLayout({ width: 1180, height: 820 }, { top: 0, right: 0, bottom: 0, left: 0 });
const drawn = () => screen.queryAllByTestId('skia-image').map((n) => String(n.props.accessibilityHint).split(':')[1]);
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as { width: number; height: number };

async function scene(floor: number, settings: ArtSettings | null, over: Partial<DirectorView> = {}) {
  const elevator = createElevator({ minFloor: 1, maxFloor: 20, timing: NORMAL_TIMING }, floor, Date.now(), 'open');
  const view = { stage: 'freeRide', success: null, elevator, logOpen: false, card: null, floor15Restored: true, discoveries: [], answerTargets: null, opened: [], power: 'on', ...over } as DirectorView;
  const onTouch = jest.fn();
  const cabin = (
    <CabinScene
      box={layout.cabin}
      bandHeight={layout.bandHeight}
      elevator={elevator}
      timing={NORMAL_TIMING}
      power="on"
      repairFloor={15}
      reducedMotion={false}
      landing={landingFor(LANDINGS, floor, { restored: () => true })}
      touch={touchTargets(view)}
      onTouch={onTouch}
      opened={view.opened}
      reaction={view.reaction}
    />
  );
  // One scene at a time: the last one is put away first.
  if (current) await current.unmount();
  current = await render(settings ? <ArtProvider value={settings}>{cabin}</ArtProvider> : cabin);
  // Let the images "decode".
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  });
  return onTouch;
}

describe('landing things on screen', () => {
  it('on the vector landing every spot is a full-size, labelled touch that names the thing and the action', async () => {
    for (const floor of [20, 2, 17, 1, 11, 13]) {
      const onTouch = await scene(floor, null);
      for (const spot of exploreSpots(LANDINGS, floor)) {
        const label = spot.action ?? `Inspect the ${spot.object}`;
        const hotspot = screen.getByLabelText(label);
        expect(flat(hotspot.props.style).width).toBeGreaterThanOrEqual(64);
        expect(flat(hotspot.props.style).height).toBeGreaterThanOrEqual(64);
        expect(hotspot.props.accessibilityRole).toBe('button');
        await fireEvent(hotspot, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
        expect(onTouch).toHaveBeenLastCalledWith(spot.target);
      }
      expect(drawn()).toEqual([]);
    }
  });

  it('golf on the art: the ball is its own prop, drawn apart from the background, and touchable', async () => {
    const onTouch = await scene(20, art());
    expect(drawn()).toEqual(expect.arrayContaining(['landing.20.background', 'landing.20.ball']));
    await fireEvent(screen.getByLabelText('Putt the golf ball'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onTouch).toHaveBeenCalledWith('ball');
  });

  it('a ball that fails to decode, or is not in the manifest at all, is drawn by the game: the putt still works', async () => {
    for (const settings of [art({ failing: ['landing.20.ball'] }), art({ leave: ['landing.20.ball'] })]) {
      const onTouch = await scene(20, settings, { reaction: { floor: 20, spotId: 'ball', seq: 1 } });
      expect(drawn()).toContain('landing.20.background');
      expect(drawn()).not.toContain('landing.20.ball');
      const hotspot = screen.getByLabelText('Putt the golf ball');
      expect(flat(hotspot.props.style).width).toBeGreaterThanOrEqual(64);
      await fireEvent(hotspot, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      expect(onTouch).toHaveBeenCalledWith('ball');
    }
  });

  it('the toolbox: closed and open pictures while it opens, the open one labelled to close; broken pictures leave a working touch', async () => {
    await scene(2, art(), { opened: [spotKey(2, 'toolbox')], discoveries: ['eq.discovery.floor-2'] });
    expect(drawn()).toEqual(expect.arrayContaining(['landing.2.background', 'landing.2.toolbox', 'landing.2.toolbox-open']));
    expect(screen.getByLabelText('Close the toolbox')).toBeTruthy();
    const onTouch = await scene(2, art({ failing: ['landing.2.toolbox', 'landing.2.toolbox-open'] }), { reaction: { floor: 2, spotId: 'toolbox', seq: 3 } });
    expect(drawn()).toEqual(['landing.2.background']);
    await fireEvent(screen.getByLabelText('Open the toolbox'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onTouch).toHaveBeenCalledWith('toolbox');
  });

  it('nothing is touchable when no touch is offered (doors shut, a job waiting): no hotspot at all', async () => {
    await scene(20, null, { stage: 'task' });
    expect(screen.queryByLabelText('Putt the golf ball')).toBeNull();
  });

  it('answer targets (a read-and-touch job) are touches named by their objects, never with a found mark', async () => {
    const onTouch = await scene(20, art(), { stage: 'task', answerTargets: { floor: 20, objects: ['hole', 'windmill'] } });
    expect(screen.queryByLabelText('Putt the golf ball')).toBeNull();
    await fireEvent(screen.getByLabelText('hole'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onTouch).toHaveBeenCalledWith('hole');
    expect(screen.getByLabelText('windmill')).toBeTruthy();
    expect(screen.queryByText('✓')).toBeNull();
  });
});
