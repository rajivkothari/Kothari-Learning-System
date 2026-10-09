// What the game reads at runtime: the slim art manifest and the production art set. Production bundles
// carry only content/themes/elevator-quest/art/runtime.json (every entry without its provenance, and each
// rights record's approval), generated from manifest.json and rights.json by
// scripts/generate-runtime-manifests.js. The art tests validate the full files and fail while
// runtime.json is stale (runtimeManifest.test.ts), so nothing here validates again at startup.
import runtimeJson from '../../../../content/themes/elevator-quest/art/runtime.json';
import { productionArt, type ArtSet, type RuntimeArtManifest } from './manifest';
import { ART_SOURCES } from './sources';

/** Every entry (approved, pending, rejected) and its approval, as the full manifest has them. */
export const RUNTIME_ART: RuntimeArtManifest = runtimeJson as unknown as RuntimeArtManifest;
/** What production may draw: approved, reviewed, bundled (the cabin and Lifty's neutral pose since D145). */
export const PRODUCTION_ART: ArtSet = productionArt(RUNTIME_ART.manifest, RUNTIME_ART.rights, ART_SOURCES);
