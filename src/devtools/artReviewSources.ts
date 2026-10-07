// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved" after a person's review) moves its line
// from here to src/themes/elevator-quest/art/sources.ts.
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {
  'cabin.backing': require('../../assets/themes/elevator-quest/art/cabin/backing.png'),
  'cabin.ceiling': require('../../assets/themes/elevator-quest/art/cabin/ceiling.png'),
  'cabin.frame-top': require('../../assets/themes/elevator-quest/art/cabin/frame-top.png'),
  'cabin.frame-left': require('../../assets/themes/elevator-quest/art/cabin/frame-left.png'),
  'cabin.frame-right': require('../../assets/themes/elevator-quest/art/cabin/frame-right.png'),
  'cabin.door-left': require('../../assets/themes/elevator-quest/art/cabin/door-left.png'),
  'cabin.door-right': require('../../assets/themes/elevator-quest/art/cabin/door-right.png'),
  'cabin.floor': require('../../assets/themes/elevator-quest/art/cabin/floor.png'),
  'cabin.wall-left': require('../../assets/themes/elevator-quest/art/cabin/wall-left.png'),
  'cabin.wall-right': require('../../assets/themes/elevator-quest/art/cabin/wall-right.png'),
  'lifty.neutral': require('../../assets/themes/elevator-quest/art/lifty/neutral.png'),
};
