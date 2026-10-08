// Sound for a mini-game (M9): the game names slots and narration keys, the elevator's audio engine
// plays them. No React. A slot the sound profile does not know, or a recording that is missing, is
// silent: never an error, never a fetch. The host stops every loop the game started when it closes.
import type { AudioCue } from '../audio/cues';
import { SOUND_SLOTS, type SoundSlot } from '../audio/profile';
import type { MiniGameSound } from './types';

/** Where narration comes from (AA's narration registry). Absent: every say() is silent. */
export interface Narration {
  has(key: string): boolean;
  say(key: string): void;
  hush(): void;
}

export interface GameSound extends MiniGameSound {
  /** Host only: stop every loop this game started, and any narration. */
  stopAll(): void;
}

const isSlot = (slot: string): slot is SoundSlot => (SOUND_SLOTS as readonly string[]).includes(slot);

export function createGameSound(deps: { audio: { handle(cues: readonly AudioCue[]): void }; now: () => number; narration?: Narration | null; log?: (kind: string, data: Record<string, unknown>) => void }): GameSound {
  const loops = new Set<SoundSlot>();
  const missing = new Set<string>();
  const silent = (slot: string) => {
    if (missing.has(slot)) return;
    missing.add(slot);
    deps.log?.('minigame.sound.missing', { slot });
  };
  return {
    play(slot) {
      if (!isSlot(slot)) return silent(slot);
      deps.audio.handle([{ at: deps.now(), action: 'play', slot }]);
    },
    loop(slot, on) {
      if (!isSlot(slot)) return silent(slot);
      if (on === loops.has(slot)) return;
      if (on) loops.add(slot);
      else loops.delete(slot);
      deps.audio.handle([on ? { at: deps.now(), action: 'loopStart', slot } : { at: deps.now(), action: 'loopStop', slot, fadeMs: 150 }]);
    },
    say(key) {
      if (!deps.narration?.has(key)) return silent(`say:${key}`);
      deps.narration.say(key);
    },
    canSay: (key) => Boolean(deps.narration?.has(key)),
    hush() {
      deps.narration?.hush();
    },
    stopAll() {
      if (loops.size) deps.audio.handle([...loops].map((slot): AudioCue => ({ at: deps.now(), action: 'loopStop', slot, fadeMs: 150 })));
      loops.clear();
      deps.narration?.hush();
    },
  };
}

/** A sound that plays nothing (tests, and a game opened without audio). */
export const silentSound: MiniGameSound = { play() {}, loop() {}, say() {}, canSay: () => false, hush() {} };
