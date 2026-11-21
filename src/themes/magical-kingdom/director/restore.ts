// What the kingdom restores from a learner's settings before anything shows or sounds at launch: Quiet,
// Still pictures, the voice pace. The app shows the hall (and may say a waiting gift) only once these and
// the saved place are applied, so a child whose adult chose Sound off never hears a chime at launch and a
// gift is never announced over a game about to reopen. Pure: no React.

export interface Comfort {
  quiet: boolean;
  /** Still pictures (Reduced Motion). */
  still: boolean;
  /** The Comfort voice pace (SLOW_VOICE) rather than the recorded pace. */
  slowVoice: boolean;
}

/** `os`: the system's Reduced Motion (null while unknown: then still, the safe side). */
export function restoreComfort(settings: Readonly<Record<string, string>>, os: boolean | null): Comfort {
  const motion = settings['kingdom.motion'];
  return {
    quiet: settings['kingdom.quiet'] === 'true',
    still: motion ? motion === 'still' : os !== false,
    slowVoice: settings['kingdom.voice'] !== 'usual',
  };
}
