// "A royal gift for you!": said when the gift dialog appears. In the browser sound waits for a first
// touch, so after a reload with the dialog open its line could not play; it is said at that touch if
// the dialog is still open. Tried once then, never in a loop. Pure: no React.

/** What this needs from the kingdom's audio (audio/recorded.ts createKingdomAudio). */
export interface GiftAudio {
  sequence(keys: readonly string[], gapMs?: number): boolean;
  /** Browser: when sound waits for a first touch, run `fn` at that touch. Returns a cancel. */
  whenReady?(fn: () => void): () => void;
}

/**
 * Say `keys` now, or, when they could not play, at the browser's first touch if `still()` says the
 * moment has not passed (the dialog is still open). Returns a cancel for the wait.
 */
export function sayOrAtFirstTouch(audio: GiftAudio, keys: readonly string[], gapMs: number, still: () => boolean): () => void {
  if (audio.sequence(keys, gapMs) || !audio.whenReady) return () => undefined;
  return audio.whenReady(() => {
    if (still()) audio.sequence(keys, gapMs);
  });
}
