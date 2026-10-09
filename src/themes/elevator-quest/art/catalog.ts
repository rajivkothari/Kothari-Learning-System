// The validated art manifest and rights record for Elevator Quest (tests, tools and the developer
// tools), and the production art set. Game code imports production.ts instead, so production bundles
// carry only the slim runtime manifest, never these two files with their provenance and licence text.
import manifestJson from '../../../../content/themes/elevator-quest/art/manifest.json';
import rightsJson from '../../../../content/themes/elevator-quest/art/rights.json';
import { FLOOR15 } from '../content/floor15';
import { LANDINGS, boxedFloors, explorableFloors, spotProps } from '../content/landings';
import { SIGN_ZONE } from '../ui/landingArt';
import { reservedZone } from './fit';
import { validateArt, type ArtContext } from './manifest';

export const ART_CONTEXT: ArtContext = {
  minFloor: FLOOR15.floors.min,
  maxFloor: FLOOR15.floors.max,
  dormantFloors: LANDINGS.floors.filter((f) => f.states?.dormant).map((f) => f.floor),
  exploreFloors: explorableFloors(LANDINGS),
  // Spots that carry their own boxes need no art `hit`; props a spot moves take its motion (M8).
  boxedFloors: boxedFloors(LANDINGS),
  spotProps: spotProps(LANDINGS),
  // Illustrated landings carry the floor number on the sign (D136): the middle of the wall is the scene's.
  reserved: { sign: reservedZone(SIGN_ZONE) },
};

const checked = validateArt(manifestJson, rightsJson, ART_CONTEXT);
if (!checked.manifest || !checked.rights) throw new Error(`Art manifest is invalid: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);

export const ART_MANIFEST = checked.manifest;
export const ART_RIGHTS = checked.rights;
export { PRODUCTION_ART } from './production';
