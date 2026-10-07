// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved" after a person's review) moves its line
// from here to src/themes/elevator-quest/art/sources.ts. The first eleven were approved (D145).
// Pending: Lifty's five other poses, edits of the approved neutral master (D147), and the landing
// backgrounds for floors 1, 7, 9, 13, 15 (dormant base, restored state) and 20 (D150).
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {
  'lifty.quiet': require('../../assets/themes/elevator-quest/art/lifty/quiet.png'),
  'lifty.success': require('../../assets/themes/elevator-quest/art/lifty/success.png'),
  'lifty.help': require('../../assets/themes/elevator-quest/art/lifty/help.png'),
  'lifty.concerned': require('../../assets/themes/elevator-quest/art/lifty/concerned.png'),
  'lifty.thinking': require('../../assets/themes/elevator-quest/art/lifty/thinking.png'),
  'landing.1.background': require('../../assets/themes/elevator-quest/art/landings/1/background.webp'),
  'landing.7.background': require('../../assets/themes/elevator-quest/art/landings/7/background.webp'),
  'landing.9.background': require('../../assets/themes/elevator-quest/art/landings/9/background.webp'),
  'landing.13.background': require('../../assets/themes/elevator-quest/art/landings/13/background.webp'),
  'landing.15.background': require('../../assets/themes/elevator-quest/art/landings/15/background.webp'),
  'landing.15.background-restored': require('../../assets/themes/elevator-quest/art/landings/15/background-restored.webp'),
  'landing.20.background': require('../../assets/themes/elevator-quest/art/landings/20/background.webp'),
};
