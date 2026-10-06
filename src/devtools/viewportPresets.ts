// Device viewport presets for the browser simulator. Pure data.
//
// Sizes are logical points (iPad) or density-independent pixels (Fire), the units the layout
// works in. They are approximate, from device specifications, not measured: confirm a device's
// real window with the Device Lab's Diag screen. The simulator shows composition, clipping,
// responsiveness, readability and touch-target layout. It says nothing about performance,
// touch latency, audio, or how a real screen looks.

export interface ViewportPreset {
  id: string;
  label: string;
  /** Size in the preset's natural orientation. */
  width: number;
  height: number;
  rotatable: boolean;
  note: string;
}

export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  { id: 'fire-hd8', label: 'Fire HD 8', width: 960, height: 600, rotatable: true, note: '1280 x 800 px at about 1.33x (same size the layout tests use)' },
  { id: 'ipad', label: 'iPad (10.9/11-inch)', width: 1180, height: 820, rotatable: true, note: 'iPad 10th generation / iPad Air 11-inch class' },
  { id: 'ipad-mini', label: 'iPad mini', width: 1133, height: 744, rotatable: true, note: 'iPad mini 6th generation class' },
  { id: 'ipad-large', label: 'Large iPad (12.9/13-inch)', width: 1366, height: 1024, rotatable: true, note: 'iPad Pro 12.9-inch class' },
  { id: 'ipad-split-third', label: 'Narrow window (Split View 1/3)', width: 375, height: 820, rotatable: false, note: 'about one third of an 11-inch iPad in landscape' },
  { id: 'ipad-split-half', label: 'Half window (Split View 1/2)', width: 590, height: 820, rotatable: false, note: 'about half of an 11-inch iPad in landscape' },
  { id: 'free', label: 'Free resize (browser window)', width: 0, height: 0, rotatable: false, note: 'fills the space left of the tools' },
];

export type Orientation = 'landscape' | 'portrait';

export interface SimulatedViewport {
  presetId: string;
  orientation: Orientation;
  width: number;
  height: number;
  label: string;
}

/** The simulated window for a preset. `free` uses the available area as is. */
export function resolveViewport(presetId: string, orientation: Orientation, available: { width: number; height: number }): SimulatedViewport {
  const p = VIEWPORT_PRESETS.find((x) => x.id === presetId) ?? VIEWPORT_PRESETS[0]!;
  if (p.id === 'free') {
    const width = Math.max(320, Math.floor(available.width));
    const height = Math.max(320, Math.floor(available.height));
    return { presetId: p.id, orientation: width >= height ? 'landscape' : 'portrait', width, height, label: `${p.label} ${width}x${height}` };
  }
  const landscapeNative = p.width >= p.height;
  const flip = p.rotatable && (orientation === 'landscape') !== landscapeNative;
  const width = flip ? p.height : p.width;
  const height = flip ? p.width : p.height;
  const o: Orientation = width >= height ? 'landscape' : 'portrait';
  return { presetId: p.id, orientation: o, width, height, label: `${p.label} ${o} ${width}x${height} (simulated)` };
}
