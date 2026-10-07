// The bundled production art: asset id -> the module Metro bundles for it. One static require per
// file, so Metro packs exactly these images and nothing else (no dynamic paths, no folder scans).
//
// Empty until reviewed art arrives (docs/ART_ASSET_SPEC.md "Delivering art"). Adding an image:
// put the file under assets/themes/elevator-quest/art/, add its entry to
// content/themes/elevator-quest/art/manifest.json and its record to rights.json, then add a line
// here, for example:
//   'landing.15.background': require('../../../../assets/themes/elevator-quest/art/landings/15/background.webp'),
// `npm run validate:content` and the art tests check that the three agree.
import type { ArtSource } from './manifest';

export const ART_SOURCES: Readonly<Record<string, ArtSource>> = {};
