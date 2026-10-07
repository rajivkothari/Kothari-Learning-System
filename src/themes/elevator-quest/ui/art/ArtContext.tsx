// Which art the game draws. Production mounts no provider, so it gets the defaults: the approved,
// bundled art set (empty until reviewed art lands) and every vector fallback. The developer tools
// provide other settings (vectors only, calibration art, overlays) through the same context.
// Presentation only: nothing here reaches the director, the runtime or what is stored.
import { createContext, useContext } from 'react';

import { PRODUCTION_ART } from '../../art/catalog';
import type { ArtSet, LiftyArtPose } from '../../art/manifest';

export interface ArtOverlays {
  /** The doorway, the landing image's bounds and its safe core. */
  doorway: boolean;
  /** The native overlay zones art keeps calm: floor number, sign, mission object slot. */
  safe: boolean;
  /** Touch areas (hotspots, mission objects). */
  hitboxes: boolean;
}

export interface ArtSettings {
  set: ArtSet;
  /** Cabin art on (when the set has it) or the vector cabin. */
  cabin: boolean;
  /** Landing parallax as the doors open (always off under Reduced Motion). */
  parallax: boolean;
  overlays: ArtOverlays;
  /** Development: show this Lifty pose whatever the director says. */
  liftyPose: LiftyArtPose | null;
  /** Development: show Floor 15's landing in this state (presentation only; the mission is unchanged). */
  floor15: 'auto' | 'dormant' | 'restored';
  /** Development review: draw cabin parts on their own, before the full required set exists. */
  partialCabin?: boolean;
  /** Called when an image fails to load; the slot keeps its vector fallback. */
  onMissing?: ((id: string) => void) | undefined;
}

export const NO_OVERLAYS: ArtOverlays = { doorway: false, safe: false, hitboxes: false };
export const DEFAULT_ART_SETTINGS: ArtSettings = { set: PRODUCTION_ART, cabin: true, parallax: true, overlays: NO_OVERLAYS, liftyPose: null, floor15: 'auto' };

const ArtContext = createContext<ArtSettings>(DEFAULT_ART_SETTINGS);
export const ArtProvider = ArtContext.Provider;
export const useArt = () => useContext(ArtContext);
