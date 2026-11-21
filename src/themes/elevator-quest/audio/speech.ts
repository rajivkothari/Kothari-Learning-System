// The voices of the tower (docs/ELEVATOR_QUEST_VOICE.md): the director's speech hook over the audio
// engine. Pure: no React, no Expo. It plays a short sequence of voice lines by key (the announcer,
// then Lifty), one at a time, and says when the sequence is over, so a story beat can wait for its
// line instead of a fixed timer.
//
// Rules (tested in speech.test.ts):
// - only keys with a recording the build may play are spoken; the rest of a sequence is skipped over,
//   and a sequence with nothing playable is not started (speak returns false: the beat runs on its
//   usual timer, exactly as before there was any voice)
// - the narration switch off, sound muted, or a browser that has not allowed sound yet: nothing starts
// - one sequence at a time: a new one stops the old (which ends at once); hush() stops it
// - nothing is ever queued for later: a request that cannot start now is dropped
// - onEnd is called exactly once for a sequence that started: when its last line ends, or when it is
//   stopped or replaced early
import type { AudioEngine, SpeechEnd } from './audioEngine';
import { AUDIO_MANIFEST, narrationAsset, packStatus, type AudioManifest } from './packs';

/** What the director asks of speech (DirectorDeps.speech). */
export interface SpeechHook {
  /**
   * Speak these keys in order. True if the sequence started; then onEnd is called once when it is
   * over (ended, stopped or replaced). False: nothing will be said, and onEnd is never called.
   */
  speak(keys: readonly string[], onEnd?: () => void): boolean;
  /** Stop whatever is being said (a short fade). Harmless when nothing is. */
  hush(): void;
  /**
   * How long these keys take to say here, first sound to last: each line that would play at its
   * measured length (the audio manifest's), none counted longer than `lineCapMs`, plus the gaps between
   * lines. Null when none would play. A story beat sizes its wait from this, so a sequence is waited for
   * whole however many lines it has. Optional: without it a beat waits up to its fixed cap.
   */
  sequenceMs?(keys: readonly string[], lineCapMs: number): number | null;
}

export interface Speech extends SpeechHook {
  speaking(): boolean;
  /** The keys of the sequence now speaking (empty when quiet). For the developer tools and tests. */
  current(): readonly string[];
}

/** The silence between two lines of a sequence (the announcer, then Lifty). */
export const SEQUENCE_GAP_MS = 180;

export interface SpeechOptions {
  schedule: (fn: () => void, ms: number) => { cancel(): void };
  /** The narration switch (settings). Off: nothing is said. */
  enabled: () => boolean;
  /**
   * The browser playtest build plays packs pending review (activeSet.web.ts); native builds only
   * approved ones (and carry no other files, which the bundle check proves).
   */
  review: boolean;
  manifest?: AudioManifest;
}

/** Whether a build may say this key: its recording's pack is approved (or pending, in a review build). */
export function voicePlayable(key: string, review: boolean, manifest: AudioManifest = AUDIO_MANIFEST): boolean {
  const id = narrationAsset(key, manifest);
  if (id === null) return false;
  const status = packStatus(manifest.assets[id]!.pack, manifest);
  return status === 'approved' || (review && status === 'pending');
}

interface Sequence {
  keys: string[];
  at: number;
  onEnd: (() => void) | null;
  gap: { cancel(): void } | null;
}

export function createSpeech(engine: Pick<AudioEngine, 'say' | 'hush' | 'canSay'>, opts: SpeechOptions): Speech {
  const manifest = opts.manifest ?? AUDIO_MANIFEST;
  let current: Sequence | null = null;
  const playable = (key: string) => voicePlayable(key, opts.review, manifest) && Boolean(engine.canSay?.(key));

  const finish = (seq: Sequence) => {
    if (current !== seq) return;
    current = null;
    seq.gap?.cancel();
    seq.onEnd?.();
  };

  /** Start the next line that will play. False when none did (the sequence is then over). */
  const next = (seq: Sequence): boolean => {
    while (seq.at < seq.keys.length) {
      const key = seq.keys[seq.at++]!;
      const started = engine.say?.(key, (reason: SpeechEnd) => {
        if (current !== seq) return;
        if (reason === 'ended' && seq.at < seq.keys.length) {
          seq.gap = opts.schedule(() => {
            seq.gap = null;
            if (current === seq && !next(seq)) finish(seq);
          }, SEQUENCE_GAP_MS);
        } else finish(seq);
      });
      if (started) return true;
    }
    return false;
  };

  return {
    speak(keys, onEnd) {
      if (!opts.enabled()) return false;
      const list = keys.filter(playable);
      if (!list.length) return false;
      // The old sequence is over the moment a new one takes the voice.
      const old = current;
      const seq: Sequence = { keys: list, at: 0, onEnd: onEnd ?? null, gap: null };
      current = seq;
      if (old) {
        old.gap?.cancel();
        old.onEnd?.();
      }
      if (next(seq)) return true;
      current = null;
      return false;
    },
    hush() {
      const seq = current;
      current = null;
      seq?.gap?.cancel();
      engine.hush?.();
      seq?.onEnd?.();
    },
    sequenceMs(keys, lineCapMs) {
      if (!opts.enabled()) return null;
      const list = keys.filter(playable);
      if (!list.length) return null;
      const length = (key: string) => manifest.assets[narrationAsset(key, manifest) ?? '']?.durationMs ?? 0;
      return list.reduce((n, key) => n + Math.min(lineCapMs, length(key)), 0) + SEQUENCE_GAP_MS * (list.length - 1);
    },
    speaking: () => current !== null,
    current: () => (current ? current.keys : []),
  };
}
