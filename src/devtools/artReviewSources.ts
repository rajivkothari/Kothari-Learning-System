// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved" after a person's review) moves its line
// from here to src/themes/elevator-quest/art/sources.ts. The first eleven were approved (D145);
// these are Lifty's five other poses, edits of the approved neutral master (D147).
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {
  'lifty.quiet': require('../../assets/themes/elevator-quest/art/lifty/quiet.png'),
  'lifty.success': require('../../assets/themes/elevator-quest/art/lifty/success.png'),
  'lifty.help': require('../../assets/themes/elevator-quest/art/lifty/help.png'),
  'lifty.concerned': require('../../assets/themes/elevator-quest/art/lifty/concerned.png'),
  'lifty.thinking': require('../../assets/themes/elevator-quest/art/lifty/thinking.png'),
};
