// Development art: the calibration set (assets/dev/art, made by scripts/generate-art-calibration.js)
// and the art settings the developer tools can pick. Never imported by production code: the
// developer tools shell is replaced by a stub in production builds (metro.config.js), so these
// images are not bundled there (npm run check:bundle checks it).
import calibrationJson from '../../assets/dev/art/calibration.json';
import { ART_CONTEXT, ART_MANIFEST, ART_RIGHTS, PRODUCTION_ART } from '../themes/elevator-quest/art/catalog';
import { ART_SOURCES } from '../themes/elevator-quest/art/sources';
import { EMPTY_ART, LIFTY_POSES, calibrationArt, reviewArt, validateArt, type ArtManifest, type ArtSet, type LiftyArtPose, type RightsManifest } from '../themes/elevator-quest/art/manifest';
import type { ArtOverlays } from '../themes/elevator-quest/ui/art/ArtContext';
import { CALIBRATION_SOURCES } from './artCalibrationSources';
import { REVIEW_SOURCES } from './artReviewSources';

/** Calibration patterns are not reviewed art: their stand-in rights records stay "pending". */
export function calibrationRights(manifest: ArtManifest): RightsManifest {
  return {
    schemaVersion: 1,
    theme: 'elevator-quest',
    assets: manifest.assets.map((a) => ({ asset: a.id, source: a.provenance.provider, madeWith: 'scripts/generate-art-calibration.js', date: '2026-10-07', aiGenerated: false, humanReviewed: false, license: a.provenance.license, modifications: '', approval: 'pending' })),
    references: [],
  };
}

const checked = validateArt(calibrationJson, calibrationRights(calibrationJson as ArtManifest), ART_CONTEXT);
if (!checked.manifest) throw new Error(`Calibration art manifest is invalid: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
export const CALIBRATION_MANIFEST = checked.manifest;
export const CALIBRATION_ART: ArtSet = calibrationArt(CALIBRATION_MANIFEST, CALIBRATION_SOURCES);

/** Review: approved art plus art pending a person's review (never rejected art), for judging candidates in the game. */
export const REVIEW_ART: ArtSet = reviewArt(ART_MANIFEST, ART_RIGHTS, { ...ART_SOURCES, ...REVIEW_SOURCES });

export type ArtMode = 'production' | 'review' | 'vector' | 'calibration';
export const ART_MODES: readonly ArtMode[] = ['production', 'review', 'vector', 'calibration'];
export const artSetFor = (mode: ArtMode): ArtSet => (mode === 'vector' ? EMPTY_ART : mode === 'calibration' ? CALIBRATION_ART : mode === 'review' ? REVIEW_ART : PRODUCTION_ART);

/** Developer launch parameters: ?art=calibration|review&overlay=doorway,safe,hitboxes&liftyPose=help&floor15=restored&parallax=off&cabinArt=off&inspect=cabin */
export function artParams(p: Record<string, string>): { mode: ArtMode; overlays: ArtOverlays; liftyPose: LiftyArtPose | null; floor15: 'auto' | 'dormant' | 'restored'; parallax: boolean; cabin: boolean; inspectCabin: boolean } {
  const list = (p.overlay ?? '').split(',');
  return {
    mode: (ART_MODES as readonly string[]).includes(p.art ?? '') ? (p.art as ArtMode) : 'production',
    overlays: { doorway: list.includes('doorway'), safe: list.includes('safe'), hitboxes: list.includes('hitboxes') },
    liftyPose: (LIFTY_POSES as readonly string[]).includes(p.liftyPose ?? '') ? (p.liftyPose as LiftyArtPose) : null,
    floor15: p.floor15 === 'dormant' || p.floor15 === 'restored' ? p.floor15 : 'auto',
    parallax: p.parallax !== 'off',
    cabin: p.cabinArt !== 'off',
    inspectCabin: p.inspect === 'cabin',
  };
}
