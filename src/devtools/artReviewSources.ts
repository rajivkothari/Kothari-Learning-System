// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved" after a person's review) moves its line
// from here to src/themes/elevator-quest/art/sources.ts.
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {
  'cabin.backing': require('../../assets/themes/elevator-quest/art/cabin/backing.png'),
  'lifty.success': require('../../assets/themes/elevator-quest/art/lifty/success.png'),
  'lifty.concerned': require('../../assets/themes/elevator-quest/art/lifty/concerned.png'),
  'lifty.quiet': require('../../assets/themes/elevator-quest/art/lifty/quiet.png'),
};
