// Production art still pending review: static requires for the developer tools' Review mode only.
// The developer tools are replaced by a stub in production builds, so these files are not bundled
// there. Approving an asset (rights.json approval "approved" after a person's review) moves its
// line from here to src/themes/elevator-quest/art/sources.ts.
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {
  'cabin.backing': require('../../assets/themes/elevator-quest/art/cabin/backing.webp'),
};
