// The validated art manifest and rights record for Elevator Quest, and the production art set.
import manifestJson from '../../../../content/themes/elevator-quest/art/manifest.json';
import rightsJson from '../../../../content/themes/elevator-quest/art/rights.json';
import { FLOOR15 } from '../content/floor15';
import { LANDINGS, explorableFloors } from '../content/landings';
import { SIGN_ZONE } from '../ui/landingArt';
import { reservedZone } from './fit';
import { productionArt, validateArt, type ArtContext, type ArtSet } from './manifest';
import { ART_SOURCES } from './sources';

export const ART_CONTEXT: ArtContext = {
  minFloor: FLOOR15.floors.min,
  maxFloor: FLOOR15.floors.max,
  dormantFloors: LANDINGS.floors.filter((f) => f.states?.dormant).map((f) => f.floor),
  exploreFloors: explorableFloors(LANDINGS),
  // Illustrated landings carry the floor number on the sign (D136): the middle of the wall is the scene's.
  reserved: { sign: reservedZone(SIGN_ZONE) },
};

const checked = validateArt(manifestJson, rightsJson, ART_CONTEXT);
if (!checked.manifest || !checked.rights) throw new Error(`Art manifest is invalid: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);

export const ART_MANIFEST = checked.manifest;
export const ART_RIGHTS = checked.rights;
/** What production may draw: approved, reviewed, bundled. Empty today (no reviewed art yet). */
export const PRODUCTION_ART: ArtSet = productionArt(ART_MANIFEST, ART_RIGHTS, ART_SOURCES);
