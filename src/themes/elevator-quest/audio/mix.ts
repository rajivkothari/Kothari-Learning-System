// Local mix: category gains for normal / quiet / muted output, plus an effects volume.
// Pure. The mix never changes what happens in the game, only how loud it is.
import { SLOT_SPECS, type ElevatorSoundProfile, type SoundCategory, type SoundSlot } from './profile';

export type AudioOutput = 'normal' | 'quiet' | 'muted';

export interface AudioSettings {
  output: AudioOutput;
  /** Effects volume 0..1 (interface and elevator categories). */
  effects: number;
}

export const DEFAULT_AUDIO: AudioSettings = { output: 'normal', effects: 0.8 };

const CATEGORY_GAIN: Record<AudioOutput, Record<SoundCategory, number>> = {
  normal: { interface: 1, elevator: 1, ambient: 1, dialogue: 1, music: 1 },
  // Quiet: no ambient bed, softer machinery, confirmations kept.
  quiet: { interface: 0.6, elevator: 0.35, ambient: 0, dialogue: 0.8, music: 0.4 },
  muted: { interface: 0, elevator: 0, ambient: 0, dialogue: 0, music: 0 },
};

/** Final gain 0..1 for a slot under the given profile and settings. */
export function gainFor(profile: ElevatorSoundProfile, slot: SoundSlot, settings: AudioSettings): number {
  const asset = profile.slots[slot];
  if (!asset || settings.output === 'muted') return 0;
  const spec = SLOT_SPECS[slot];
  let category = CATEGORY_GAIN[settings.output][spec.category];
  if (settings.output === 'quiet' && spec.essential) category = Math.max(category, 0.6);
  const effects = spec.category === 'interface' || spec.category === 'elevator' ? Math.min(1, Math.max(0, settings.effects)) : 1;
  return Math.round(asset.gain * category * effects * 1000) / 1000;
}
