/**
 * @jest-environment node
 */
// The simulator hands these sizes to the game's real layout; nothing is scaled with CSS.
import { computeLayout, MIN_BUTTON } from '../themes/elevator-quest/ui/layout';
import { cargoLayout } from '../themes/elevator-quest/ui/cargoLayout';
import { VIEWPORT_PRESETS, resolveViewport } from './viewportPresets';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

describe('viewport presets', () => {
  it('produce the expected sizes in both orientations', () => {
    expect(resolveViewport('fire-hd8', 'landscape', { width: 0, height: 0 })).toMatchObject({ width: 960, height: 600, orientation: 'landscape' });
    expect(resolveViewport('fire-hd8', 'portrait', { width: 0, height: 0 })).toMatchObject({ width: 600, height: 960, orientation: 'portrait' });
    expect(resolveViewport('ipad', 'portrait', { width: 0, height: 0 })).toMatchObject({ width: 820, height: 1180 });
    expect(resolveViewport('ipad-mini', 'landscape', { width: 0, height: 0 })).toMatchObject({ width: 1133, height: 744 });
    expect(resolveViewport('ipad-large', 'portrait', { width: 0, height: 0 })).toMatchObject({ width: 1024, height: 1366 });
    // Multitasking windows do not rotate.
    expect(resolveViewport('ipad-split-third', 'landscape', { width: 0, height: 0 })).toMatchObject({ width: 375, height: 820, orientation: 'portrait' });
    expect(resolveViewport('free', 'landscape', { width: 1000.7, height: 640.2 })).toMatchObject({ width: 1000, height: 640, orientation: 'landscape' });
    expect(resolveViewport('unknown', 'landscape', { width: 0, height: 0 }).presetId).toBe('fire-hd8');
  });

  it('labels every simulated size as simulated', () => {
    for (const p of VIEWPORT_PRESETS.filter((x) => x.id !== 'free')) expect(resolveViewport(p.id, 'landscape', { width: 0, height: 0 }).label).toMatch(/simulated/);
  });

  it('every preset gets the real responsive layout with full-size targets, cargo included', () => {
    for (const p of VIEWPORT_PRESETS.filter((x) => x.id !== 'free')) {
      for (const o of ['landscape', 'portrait'] as const) {
        const v = resolveViewport(p.id, o, { width: 0, height: 0 });
        const layout = computeLayout(v, NO_INSETS);
        expect(layout.button).toBeGreaterThanOrEqual(MIN_BUTTON);
        // The cargo bay sits in the cabin area; its crates never shrink below the target.
        const cargo = cargoLayout({ width: Math.max(240, layout.cabin.width - 24), height: Math.max(160, layout.cabin.height - 76) }, { onDock: 9, inCar: 12 }, false);
        expect(cargo.crate).toBeGreaterThanOrEqual(64);
      }
    }
  });
});
