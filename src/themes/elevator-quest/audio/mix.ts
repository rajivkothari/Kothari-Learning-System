// Local mix: category gains for normal / quiet / muted output, plus an effects volume.
// Pure. The mix never changes what happens in the game, only how loud it is.
import { SLOT_SPECS, type ElevatorSoundProfile, type SoundCategory, type SoundSlot } from './profile';

export type AudioOutput = 'normal' | 'quiet' | 'muted';

export interface AudioSettings {
  output: AudioOutput;
  /** Effects volume 0..1 (interface and elevator categories). */
  effects: number;
  /** The tower's voices (the announcer, Lifty, the crew). Absent: on. Off: none of them speaks; Word Golf's HEAR IT still does. */
  narration?: boolean;
  /** Voice volume 0..1 for everything spoken (the voices and Word Golf's words). Absent: 1. */
  voice?: number;
}

export const DEFAULT_AUDIO: AudioSettings = { output: 'normal', effects: 0.8, narration: true, voice: 1 };

/**
 * Under speech the rest of the mix steps back, so a line is heard without turning anything up: the
 * ambient bed most, the lift's own machinery and the music stingers a little, never the taps (tap
 * feedback stays as it is) and never speech itself.
 */
export const DUCK_UNDER_SPEECH: Record<SoundCategory, number> = { interface: 1, elevator: 0.6, ambient: 0.4, dialogue: 1, music: 0.7 };
/** How long the mix takes to step back under speech and come back after it (never a jump). */
export const DUCK_RAMP_MS = 200;

const CATEGORY_GAIN: Record<AudioOutput, Record<SoundCategory, number>> = {
  normal: { interface: 1, elevator: 1, ambient: 1, dialogue: 1, music: 1 },
  // Quiet: no ambient bed, softer machinery, confirmations kept.
  quiet: { interface: 0.6, elevator: 0.35, ambient: 0, dialogue: 0.8, music: 0.4 },
  muted: { interface: 0, elevator: 0, ambient: 0, dialogue: 0, music: 0 },
};

/** Final gain 0..1 for a slot under the given profile and settings; `ducked` while speech plays. */
export function gainFor(profile: ElevatorSoundProfile, slot: SoundSlot, settings: AudioSettings, ducked = false): number {
  const asset = profile.slots[slot];
  if (!asset || settings.output === 'muted') return 0;
  const spec = SLOT_SPECS[slot];
  let category = CATEGORY_GAIN[settings.output][spec.category];
  if (settings.output === 'quiet' && spec.essential) category = Math.max(category, 0.6);
  const effects = spec.category === 'interface' || spec.category === 'elevator' ? Math.min(1, Math.max(0, settings.effects)) : 1;
  const duck = ducked ? DUCK_UNDER_SPEECH[spec.category] : 1;
  return Math.round(asset.gain * category * effects * duck * 1000) / 1000;
}

/** Narration (spoken words, M9) is a little under full scale; it follows the dialogue mix: quieter in quiet mode, silent when muted. */
export const NARRATION_GAIN = 0.85;

/** The voice volume in force (0..1; absent: full). */
export const voiceVolume = (settings: AudioSettings) => Math.min(1, Math.max(0, settings.voice ?? 1));

/**
 * Final gain 0..1 for narration under the given settings: the dialogue mix times the voice volume.
 * The effects volume does not apply: it is speech, not an effect.
 */
export function narrationGain(settings: AudioSettings): number {
  if (settings.output === 'muted') return 0;
  return Math.round(NARRATION_GAIN * CATEGORY_GAIN[settings.output].dialogue * voiceVolume(settings) * 1000) / 1000;
}
