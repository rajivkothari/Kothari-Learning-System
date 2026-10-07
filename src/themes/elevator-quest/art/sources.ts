// The bundled production art: asset id -> the module Metro bundles for it. One static require per
// file, so Metro packs exactly these images and nothing else (no dynamic paths, no folder scans).
//
// Only art the project owner approved after review (rights.json approval "approved", D145) is
// listed here. Adding an image: put the file under assets/themes/elevator-quest/art/, add its entry
// to content/themes/elevator-quest/art/manifest.json and its record to rights.json, review it in the
// developer tools (src/devtools/artReviewSources.ts), and move its line here once approved.
// `npm run validate:content` and the art tests check that the three agree.
import type { ArtSource } from './manifest';

export const ART_SOURCES: Readonly<Record<string, ArtSource>> = {
  'cabin.backing': require('../../../../assets/themes/elevator-quest/art/cabin/backing.png'),
  'cabin.ceiling': require('../../../../assets/themes/elevator-quest/art/cabin/ceiling.png'),
  'cabin.frame-top': require('../../../../assets/themes/elevator-quest/art/cabin/frame-top.png'),
  'cabin.frame-left': require('../../../../assets/themes/elevator-quest/art/cabin/frame-left.png'),
  'cabin.frame-right': require('../../../../assets/themes/elevator-quest/art/cabin/frame-right.png'),
  'cabin.door-left': require('../../../../assets/themes/elevator-quest/art/cabin/door-left.png'),
  'cabin.door-right': require('../../../../assets/themes/elevator-quest/art/cabin/door-right.png'),
  'cabin.floor': require('../../../../assets/themes/elevator-quest/art/cabin/floor.png'),
  'cabin.wall-left': require('../../../../assets/themes/elevator-quest/art/cabin/wall-left.png'),
  'cabin.wall-right': require('../../../../assets/themes/elevator-quest/art/cabin/wall-right.png'),
  'lifty.neutral': require('../../../../assets/themes/elevator-quest/art/lifty/neutral.png'),
};
