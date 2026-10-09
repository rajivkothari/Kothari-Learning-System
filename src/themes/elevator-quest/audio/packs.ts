// Sound packs and their rights status. Pure: no React, React Native or Expo.
//
// Every asset in the audio manifest belongs to a pack, and the pack's `status` decides where its
// files may go:
//   approved  required from assets.ts, so production builds carry and play them
//   pending   required only from src/devtools/audioReviewSources.ts (browser playtest build)
//   rejected  required from nowhere
// Approving the generated pack is the one-line change `"status": "approved"` in the manifest,
// then `node scripts/generate-elevator-audio.js --sources` rewrites the two require lists from the
// manifest (audio.test.ts fails until they match) and PRODUCTION_PROFILE becomes ELEVENLABS_V1.
// A profile may draw some slots from a further pack (the mini-game sounds, elevenlabs-v2): a slot
// whose pack is not approved is silent in production, and the rest of the profile still plays.
// Narration (Word Golf's spoken words, pack elevenlabs-narration-v1) lives in the same manifest:
// each entry carries its `narrationKey` (word.<wordId>), and follows the same status rule.
import manifestJson from '../../../../assets/themes/elevator-quest/audio/manifest.json';
import { ELEVENLABS_V1, PROTOTYPE_MODERN, type ElevatorSoundProfile } from './profile';

export type PackStatus = 'approved' | 'pending' | 'rejected';

export interface AudioPack {
  label: string;
  status: PackStatus;
  format: { container: string; encoding: string; channels: number; sampleRate: number };
}

export interface AudioAssetEntry {
  file: string;
  pack: string;
  loop: boolean;
  durationMs: number;
  source: string;
  license: string;
  /** Measured after processing (padded so short sounds measure): integrated loudness and true peak. */
  loudness?: { lufs: number; truePeakDb: number };
  /** Narration only: the key a game says it by (word.<wordId>), and the words spoken. */
  narrationKey?: string;
  text?: string;
}

export interface AudioManifest {
  packs: Record<string, AudioPack>;
  assets: Record<string, AudioAssetEntry>;
}

export const AUDIO_MANIFEST = manifestJson as unknown as AudioManifest;

export function packStatus(pack: string, manifest: AudioManifest = AUDIO_MANIFEST): PackStatus {
  return manifest.packs[pack]?.status ?? 'rejected';
}

/** Asset ids whose pack has the given status. */
export function assetsWithStatus(status: PackStatus, manifest: AudioManifest = AUDIO_MANIFEST): string[] {
  return Object.entries(manifest.assets)
    .filter(([, a]) => packStatus(a.pack, manifest) === status)
    .map(([id]) => id);
}

/**
 * A profile with every slot whose asset belongs to a pack that is not approved made silent. The same
 * profile object comes back when nothing changes, so an all-approved profile keeps its identity.
 */
export function approvedSlotsOnly(profile: ElevatorSoundProfile, manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  const blocked = (asset: string) => packStatus(manifest.assets[asset]?.pack ?? '', manifest) !== 'approved';
  const entries = Object.entries(profile.slots) as [keyof ElevatorSoundProfile['slots'], ElevatorSoundProfile['slots'][keyof ElevatorSoundProfile['slots']]][];
  if (!entries.some(([, s]) => s && blocked(s.asset))) return profile;
  return { ...profile, slots: Object.fromEntries(entries.map(([k, s]) => [k, s && blocked(s.asset) ? null : s])) as ElevatorSoundProfile['slots'] };
}

/** What a production build plays: the generated pack once approved, else the synthesized placeholders. */
export function productionProfile(manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  return packStatus(ELEVENLABS_V1.pack, manifest) === 'approved' ? approvedSlotsOnly(ELEVENLABS_V1, manifest) : PROTOTYPE_MODERN;
}

export const PRODUCTION_PROFILE: ElevatorSoundProfile = productionProfile();

/** What the browser playtest build plays by default: the newest pack that is not rejected. */
export function reviewProfile(manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  return packStatus(ELEVENLABS_V1.pack, manifest) === 'rejected' ? productionProfile(manifest) : ELEVENLABS_V1;
}

/** The manifest asset that says a narration key (word.<wordId>), or null. Any status: the sources decide what plays. */
export function narrationAsset(key: string, manifest: AudioManifest = AUDIO_MANIFEST): string | null {
  for (const [id, a] of Object.entries(manifest.assets)) if (a.narrationKey === key) return id;
  return null;
}

/** Every narration key in the manifest whose pack is approved (what a production build can say). */
export function approvedNarrationKeys(manifest: AudioManifest = AUDIO_MANIFEST): string[] {
  return Object.values(manifest.assets)
    .filter((a) => a.narrationKey && packStatus(a.pack, manifest) === 'approved')
    .map((a) => a.narrationKey!)
    .sort();
}

/** Developer launch parameter `?sound=`: `placeholder` (the synthesized set) or `production` (what a production build plays). */
export function profileForParam(param: string | undefined, manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  if (param === 'placeholder') return PROTOTYPE_MODERN;
  if (param === 'production') return productionProfile(manifest);
  return reviewProfile(manifest);
}

