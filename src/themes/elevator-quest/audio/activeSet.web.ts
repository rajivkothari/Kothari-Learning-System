// Browser playtest build (development only): plays the newest generated pack that is not rejected,
// so a pack pending rights review can be heard in the real game before anyone approves it. Pending
// files are required only from the developer tools' review list, never from production code. The
// browser build ignores the profile it is given and plays the set the page URL asks for:
//   (default)            the newest pack that is not rejected (ELEVENLABS_V1, approved since D163)
//   ?sound=placeholder   the synthesized placeholders
//   ?sound=production    exactly what a production build plays: the production profile, the approved
//                        files only (none of the review list), and no recording of a pack pending review
import { AUDIO_REVIEW_SOURCES } from '../../../devtools/audioReviewSources';
import { launchParams } from '../../../platform/launchParams';
import type { SoundSet } from './activeSet';
import { AUDIO_ASSETS } from './assets';
import { profileForParam } from './packs';
import type { ElevatorSoundProfile } from './profile';

export type { SoundSet } from './activeSet';

const production = () => launchParams().sound === 'production';

/**
 * The browser playtest build plays packs pending review (the voice pack too), so the owner can hear
 * them in the game. Not on ?sound=production, which must sound as a production build does.
 */
export const playsReviewPacks = (): boolean => !production();

export function activeSoundSet(_requested: ElevatorSoundProfile): SoundSet {
  const param = launchParams().sound;
  return { profile: profileForParam(param), sources: production() ? AUDIO_ASSETS : { ...AUDIO_ASSETS, ...AUDIO_REVIEW_SOURCES } };
}
