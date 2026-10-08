// Platform adapter: which sound set the audio engine plays. Native builds play the profile they are
// given with the approved files only (assets.ts), so no pending sound is ever in a native bundle
// (scripts/check-bundle.js checks the exported bundles). The browser playtest build resolves
// activeSet.web.ts instead, which plays the pack pending review by default.
import { AUDIO_ASSETS } from './assets';
import type { ElevatorSoundProfile } from './profile';

export interface SoundSet {
  profile: ElevatorSoundProfile;
  /** Bundled file per manifest asset id (Metro asset references). Nothing is fetched at runtime. */
  sources: Readonly<Record<string, number>>;
}

export function activeSoundSet(requested: ElevatorSoundProfile): SoundSet {
  return { profile: requested, sources: AUDIO_ASSETS };
}
