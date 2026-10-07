// Development only: open the plain game (no tools panel) with another art set, straight from the URL:
//   ?open=quest&art=review    pending art in the real game (the illustrated candidates)
//   ?open=quest&art=vector    the vector game, for the A/B comparison
// plus the Art section's other parameters (&inspect=cabin, &liftyPose=..., &overlay=...). Without
// an `art` parameter nothing changes. Production child bundles get QuestArtLaunchStub instead
// (metro.config.js), so none of this, nor any pending art, is in them (scripts/check-bundle.js).
import type { ReactNode } from 'react';

import { launchParams } from '../platform/launchParams';
import { ArtProvider, DEFAULT_ART_SETTINGS } from '../themes/elevator-quest/ui/art/ArtContext';
import { artParams, artSetFor } from './artCalibration';

export function QuestArtLaunch({ children }: { children: ReactNode }) {
  const params = launchParams();
  if (!params.art) return <>{children}</>;
  const a = artParams(params);
  return <ArtProvider value={{ ...DEFAULT_ART_SETTINGS, set: artSetFor(a.mode), cabin: a.cabin, parallax: a.parallax, overlays: a.overlays, liftyPose: a.liftyPose, floor15: a.floor15, inspectCabin: a.inspectCabin }}>{children}</ArtProvider>;
}
