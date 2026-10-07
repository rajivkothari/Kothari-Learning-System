// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved" after a person's review) moves its line
// from here to src/themes/elevator-quest/art/sources.ts. Empty since the owner approved the first
// eleven (D145); the next Lifty poses land here first, for example:
//   'lifty.help': require('../../assets/themes/elevator-quest/art/lifty/help.png'),
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {};
