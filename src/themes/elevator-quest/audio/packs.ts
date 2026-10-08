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

/** What a production build plays: the generated pack once approved, else the synthesized placeholders. */
export function productionProfile(manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  return packStatus(ELEVENLABS_V1.pack, manifest) === 'approved' ? ELEVENLABS_V1 : PROTOTYPE_MODERN;
}

export const PRODUCTION_PROFILE: ElevatorSoundProfile = productionProfile();

/** What the browser playtest build plays by default: the newest pack that is not rejected. */
export function reviewProfile(manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  return packStatus(ELEVENLABS_V1.pack, manifest) === 'rejected' ? productionProfile(manifest) : ELEVENLABS_V1;
}

/** Developer launch parameter `?sound=`: `placeholder` (the synthesized set) or `production` (what a production build plays). */
export function profileForParam(param: string | undefined, manifest: AudioManifest = AUDIO_MANIFEST): ElevatorSoundProfile {
  if (param === 'placeholder') return PROTOTYPE_MODERN;
  if (param === 'production') return productionProfile(manifest);
  return reviewProfile(manifest);
}

