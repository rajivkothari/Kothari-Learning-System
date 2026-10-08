// Browser playtest build (development only): plays the newest generated pack that is not rejected,
// so a pack pending rights review can be heard in the real game before anyone approves it. Pending
// files are required only from the developer tools' review list, never from production code. The
// browser build ignores the profile it is given and plays the set the page URL asks for:
//   (default)            the newest pack that is not rejected (ELEVENLABS_V1, approved since D163)
//   ?sound=placeholder   the synthesized placeholders
//   ?sound=production    exactly what a production build plays
import { AUDIO_REVIEW_SOURCES } from '../../../devtools/audioReviewSources';
import { launchParams } from '../../../platform/launchParams';
import type { SoundSet } from './activeSet';
import { AUDIO_ASSETS } from './assets';
import { profileForParam } from './packs';
import type { ElevatorSoundProfile } from './profile';

export type { SoundSet } from './activeSet';

export function activeSoundSet(_requested: ElevatorSoundProfile): SoundSet {
  return { profile: profileForParam(launchParams().sound), sources: { ...AUDIO_ASSETS, ...AUDIO_REVIEW_SOURCES } };
}
