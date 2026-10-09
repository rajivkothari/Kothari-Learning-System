// Narration for the mini-games (M9): Word Golf's spoken words, by key (word.<wordId>). The recordings
// are bundled (assets.ts, generated from the audio manifest's approved packs); nothing is fetched at
// runtime. The audio engine plays them (audioEngine.ts say/hush): one at a time, through the dialogue
// mix, so mute and quiet apply as for every other sound. This file only adapts the engine to the
// mini-game host's Narration contract (minigames/hostSound.ts). Pure: no React, no Expo.
import type { AudioEngine } from './audioEngine';
import { AUDIO_MANIFEST, approvedNarrationKeys, type AudioManifest } from './packs';

/** The mini-game host's contract (minigames/hostSound.ts Narration). */
export interface Narration {
  /** True only when a bundled, approved recording exists for the key. */
  has(key: string): boolean;
  /** Plays it; a new say() stops the previous one (never stacks). An unknown key is silent. */
  say(key: string): void;
  /** Stops any narration. */
  hush(): void;
}

/** The narration key for a Word Golf word id. */
export const wordNarrationKey = (wordId: string) => `word.${wordId}`;

/**
 * Narration over an audio engine. `has` needs an approved manifest entry AND a bundled file the engine
 * can play (an engine without narration support, such as a test double, says nothing).
 */
export function createNarration(engine: Pick<AudioEngine, 'say' | 'hush' | 'canSay'>, manifest: AudioManifest = AUDIO_MANIFEST): Narration {
  const approved = new Set(approvedNarrationKeys(manifest));
  const has = (key: string) => approved.has(key) && Boolean(engine.canSay?.(key));
  return {
    has,
    say(key) {
      if (has(key)) engine.say?.(key);
    },
    hush() {
      engine.hush?.();
    },
  };
}
