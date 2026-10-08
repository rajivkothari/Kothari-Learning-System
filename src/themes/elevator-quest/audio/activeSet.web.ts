// Browser playtest build (development only): plays the generated pack that is pending rights review,
// so it can be heard in the real game before anyone approves it. Its files are required only from
// the developer tools' review list, never from production code. The browser build ignores the
// profile it is given and plays the set the page URL asks for:
//   (default)            the pack pending review (ELEVENLABS_V1)
//   ?sound=placeholder   the synthesized placeholders
//   ?sound=production    exactly what a production build plays (the placeholders until approval)
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
