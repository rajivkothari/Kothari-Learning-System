// Development art: the calibration set (assets/dev/art, made by scripts/generate-art-calibration.js)
// and the art settings the developer tools can pick. Never imported by production code: the
// developer tools shell is replaced by a stub in production builds (metro.config.js), so these
// images are not bundled there (npm run check:bundle checks it).
import calibrationJson from '../../assets/dev/art/calibration.json';
import { PRODUCTION_ART, ART_CONTEXT } from '../themes/elevator-quest/art/catalog';
import { EMPTY_ART, LIFTY_POSES, calibrationArt, validateArt, type ArtManifest, type ArtSet, type RightsManifest } from '../themes/elevator-quest/art/manifest';
import type { ArtOverlays } from '../themes/elevator-quest/ui/art/ArtContext';
import type { LiftyMood } from '../themes/elevator-quest/director/director';
import { CALIBRATION_SOURCES } from './artCalibrationSources';

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

export type ArtMode = 'production' | 'vector' | 'calibration';
export const ART_MODES: readonly ArtMode[] = ['production', 'vector', 'calibration'];
export const artSetFor = (mode: ArtMode): ArtSet => (mode === 'vector' ? EMPTY_ART : mode === 'calibration' ? CALIBRATION_ART : PRODUCTION_ART);

/** Developer launch parameters: ?art=calibration&overlay=doorway,safe,hitboxes&liftyPose=helping&floor15=restored&parallax=off&cabinArt=off */
export function artParams(p: Record<string, string>): { mode: ArtMode; overlays: ArtOverlays; liftyPose: LiftyMood | null; floor15: 'auto' | 'dormant' | 'restored'; parallax: boolean; cabin: boolean } {
  const list = (p.overlay ?? '').split(',');
  return {
    mode: (ART_MODES as readonly string[]).includes(p.art ?? '') ? (p.art as ArtMode) : 'production',
    overlays: { doorway: list.includes('doorway'), safe: list.includes('safe'), hitboxes: list.includes('hitboxes') },
    liftyPose: (LIFTY_POSES as readonly string[]).includes(p.liftyPose ?? '') ? (p.liftyPose as LiftyMood) : null,
    floor15: p.floor15 === 'dormant' || p.floor15 === 'restored' ? p.floor15 : 'auto',
    parallax: p.parallax !== 'off',
    cabin: p.cabinArt !== 'off',
  };
}
