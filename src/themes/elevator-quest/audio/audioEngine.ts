// Native playback for semantic audio cues, on expo-audio (local bundled files only).
// The engine knows nothing about elevators: it receives cues (slot + action), asks the
// profile for an asset and the mix for a gain, and plays. Swapping the profile swaps the
// elevator's whole character.
//
// Safety rules (tested in audioEngine.test.tsx):
// - quiet and mute come from the mix; nothing plays before a browser allows sound (the gate), and
//   one-shots asked for before then are dropped, not queued
// - the voice policy (voices.ts) rate-limits each slot and caps simultaneous one-shots
// - a missing, broken or undecodable file is silent: the slot is skipped and status() says why,
//   nothing throws into the game
// - only bundled files are played (activeSet.ts); nothing is fetched at runtime
// - narration (say): one voice at a time on its own player; a new say() fades the previous one out
//   (50 ms) and starts the new one, so a replay never stacks; muted or before a browser allows sound
//   it is dropped, not queued; it follows the dialogue mix (mix.ts narrationGain)
//
// expo-audio API used (checked against the installed 57.0.5 type definitions, 2026-10-06):
// createAudioPlayer(source), player.play(), pause(), seekTo(seconds), volume, loop, remove(),
// setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode }).
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { activeSoundSet } from './activeSet';
import { createAudioGate } from './audioGate';
import type { AudioCue } from './cues';
import { gainFor, narrationGain, type AudioSettings } from './mix';
import { AUDIO_MANIFEST, narrationAsset } from './packs';
import { SLOT_SPECS, SOUND_SLOTS, type ElevatorSoundProfile, type SoundSlot } from './profile';
import { MIN_LOOP_FADE_MS, createVoiceLimiter, poolSizeFor } from './voices';

export interface AudioEngine {
  handle(cues: readonly AudioCue[]): void;
  setSettings(settings: AudioSettings): void;
  /** App backgrounded: stop loops. Foregrounded: restart the ones that should be running. */
  suspend(): void;
  resume(): void;
  release(): void;
  /**
   * Narration (M9): speak a bundled recording by its key (word.<wordId>). Returns whether it started.
   * One at a time: a new say() stops the previous one. Optional so test doubles need not implement it.
   */
  say?(key: string): boolean;
  /** Stop any narration (a short fade, never a hard cut). */
  hush?(): void;
  /** Whether a bundled recording exists for this key (whatever the output setting). */
  canSay?(key: string): boolean;
  /** waitingForGesture: a browser has not allowed sound yet (no tap or key press so far). */
  status(): {
    ready: boolean;
    error: string | null;
    lastRequestAt: number | null;
    played: number;
    waitingForGesture: boolean;
    /** Which profile is playing (the browser playtest build may play the pack pending review). */
    profile?: string;
    /** One-shots the voice policy dropped (too soon after the same slot, or too many at once). */
    dropped?: number;
    /** Slots that are silent because their file is missing or could not be loaded. */
    silent?: string[];
  };
}

interface Pool {
  source: number;
  size: number;
  players: AudioPlayer[];
  /** Voice id currently sounding on each player (for early ends). */
  voices: (number | null)[];
  next: number;
}

/** How long a narration takes to fade out when it is stopped or replaced. */
export const SPEECH_FADE_MS = 50;

export async function createAudioEngine(requested: ElevatorSoundProfile, initial: AudioSettings, now: () => number = () => performance.now()): Promise<AudioEngine> {
  const { profile, sources } = activeSoundSet(requested);
  let settings = initial;
  let error: string | null = null;
  let lastRequestAt: number | null = null;
  let played = 0;
  let dropped = 0;
  const silent = new Set<SoundSlot>();
  const pools = new Map<string, Pool>();
  const loops = new Map<SoundSlot, AudioPlayer>();
  const running = new Set<SoundSlot>();
  const fades = new Map<SoundSlot, ReturnType<typeof setInterval>>();
  const voices = createVoiceLimiter();
  const voicePlayer = new Map<number, AudioPlayer>();
  let speech: AudioPlayer | null = null;
  const fadingSpeech = new Map<AudioPlayer, ReturnType<typeof setInterval>>();
  const note = (e: unknown) => (error = e instanceof Error ? e.message : String(e));

  // Browsers block sound until the first gesture (native: always open). Loops that should be
  // running start when the gate opens; one-shots before then are dropped, not queued.
  const gate = createAudioGate();
  const unsubscribeGate = gate.onOpen(() => {
    for (const slot of running) {
      const p = loops.get(slot);
      if (!p) continue;
      try {
        p.volume = gainFor(profile, slot, settings);
        p.play();
      } catch (e) {
        note(e);
      }
    }
  });

  try {
    // Mix with other audio, never keep playing in the background. Silent-switch behaviour:
    // plays in silent mode so a parent is not puzzled by a silent prototype; quiet/mute are in-game.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
  } catch (e) {
    note(e);
  }

  const durationOf = (asset: string) => AUDIO_MANIFEST.assets[asset]?.durationMs ?? 1000;
  const newPlayer = (source: number): AudioPlayer | null => {
    try {
      return createAudioPlayer(source);
    } catch (e) {
      note(e);
      return null;
    }
  };

  // One player per file up front (so the first tap sounds at once); the rest of a pool is made on
  // demand. A file that is missing or fails to load leaves its slot silent, never the whole set.
  for (const slot of SOUND_SLOTS) {
    const spec = profile.slots[slot];
    if (!spec) continue;
    const source = sources[spec.asset];
    if (source === undefined) {
      silent.add(slot);
      note(new Error(`Missing audio asset "${spec.asset}" for ${slot}`));
      continue;
    }
    if (SLOT_SPECS[slot].loop) {
      const p = newPlayer(source);
      if (!p) {
        silent.add(slot);
        continue;
      }
      p.loop = true;
      loops.set(slot, p);
      continue;
    }
    const size = poolSizeFor(durationOf(spec.asset), SLOT_SPECS[slot].gapMs);
    const existing = pools.get(spec.asset);
    if (existing) {
      existing.size = Math.max(existing.size, size);
      continue;
    }
    const first = newPlayer(source);
    if (!first) {
      silent.add(slot);
      continue;
    }
    pools.set(spec.asset, { source, size, players: [first], voices: [null], next: 0 });
  }

  const stopFade = (slot: SoundSlot) => {
    const f = fades.get(slot);
    if (f !== undefined) clearInterval(f);
    fades.delete(slot);
  };

  function playerFor(pool: Pool): number | null {
    const i = pool.next % pool.size;
    pool.next += 1;
    if (i >= pool.players.length) {
      const p = newPlayer(pool.source);
      if (!p) return pool.players.length ? 0 : null;
      pool.players.push(p);
      pool.voices.push(null);
      return pool.players.length - 1;
    }
    return i;
  }

  function play(slot: SoundSlot) {
    const spec = profile.slots[slot];
    const pool = spec ? pools.get(spec.asset) : undefined;
    const gain = gainFor(profile, slot, settings);
    if (!spec || !pool || gain <= 0 || !gate.isOpen()) return;
    const t = now();
    const admitted = voices.admit({ slot, asset: spec.asset, durationMs: durationOf(spec.asset), essential: SLOT_SPECS[slot].essential, gapMs: SLOT_SPECS[slot].gapMs }, t);
    if (!admitted.play) {
      dropped += 1;
      return;
    }
    if (admitted.evict !== null) {
      try {
        voicePlayer.get(admitted.evict)?.pause();
      } catch (e) {
        note(e);
      }
      voicePlayer.delete(admitted.evict);
    }
    const index = playerFor(pool);
    if (index === null) return;
    const player = pool.players[index]!;
    const previous = pool.voices[index];
    if (previous !== null && previous !== undefined) {
      voices.end(previous);
      voicePlayer.delete(previous);
    }
    pool.voices[index] = admitted.voice;
    voicePlayer.set(admitted.voice, player);
    lastRequestAt = t;
    try {
      player.volume = gain;
      void Promise.resolve(player.seekTo(0)).catch(note);
      player.play();
      played += 1;
    } catch (e) {
      note(e);
    }
  }

  function startLoop(slot: SoundSlot) {
    const p = loops.get(slot);
    if (!p) return;
    stopFade(slot);
    running.add(slot);
    if (!gate.isOpen()) return;
    try {
      p.volume = gainFor(profile, slot, settings);
      void Promise.resolve(p.seekTo(0)).catch(note);
      p.play();
    } catch (e) {
      note(e);
    }
  }

  function stopLoop(slot: SoundSlot, fadeMs: number) {
    const p = loops.get(slot);
    running.delete(slot);
    if (!p) return;
    stopFade(slot);
    // Never a hard cut: a loop always fades for at least MIN_LOOP_FADE_MS, so it cannot click.
    const ms = Math.max(MIN_LOOP_FADE_MS, fadeMs);
    const start = p.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let i = 0;
    fades.set(
      slot,
      setInterval(() => {
        i += 1;
        try {
          p.volume = Math.max(0, start * (1 - i / steps));
          if (i >= steps) {
            stopFade(slot);
            p.pause();
          }
        } catch (e) {
          stopFade(slot);
          note(e);
        }
      }, 40),
    );
  }

  const narrationSource = (key: string): number | null => {
    const id = narrationAsset(key);
    return id === null ? null : (sources[id] ?? null);
  };

  /** Fade the current narration out over SPEECH_FADE_MS, then free its player. */
  function stopSpeech() {
    const p = speech;
    speech = null;
    if (!p) return;
    const start = p.volume;
    let i = 0;
    const steps = 2;
    const end = () => {
      const f = fadingSpeech.get(p);
      if (f !== undefined) clearInterval(f);
      fadingSpeech.delete(p);
      try {
        p.pause();
        p.remove();
      } catch (e) {
        note(e);
      }
    };
    fadingSpeech.set(
      p,
      setInterval(() => {
        i += 1;
        try {
          p.volume = Math.max(0, start * (1 - i / steps));
        } catch (e) {
          note(e);
        }
        if (i >= steps) end();
      }, SPEECH_FADE_MS / steps),
    );
  }

  return {
    say(key) {
      const source = narrationSource(key);
      if (source === null) return false;
      stopSpeech();
      const gain = narrationGain(settings);
      if (gain <= 0 || !gate.isOpen()) return false;
      const p = newPlayer(source);
      if (!p) return false;
      speech = p;
      lastRequestAt = now();
      try {
        p.volume = gain;
        p.play();
        played += 1;
        return true;
      } catch (e) {
        note(e);
        return false;
      }
    },
    hush() {
      stopSpeech();
    },
    canSay: (key) => narrationSource(key) !== null,
    handle(cues) {
      for (const c of cues) {
        if (c.action === 'play') play(c.slot);
        else if (c.action === 'loopStart') startLoop(c.slot);
        else stopLoop(c.slot, c.fadeMs);
      }
    },
    setSettings(next) {
      settings = next;
      if (speech) speech.volume = narrationGain(settings);
      for (const slot of running) {
        const p = loops.get(slot);
        if (p && !fades.has(slot)) p.volume = gainFor(profile, slot, settings);
      }
    },
    suspend() {
      for (const slot of running) loops.get(slot)?.pause();
      // Speech never carries on in the background, and is not resumed (a stale word is no help).
      stopSpeech();
    },
    resume() {
      if (gate.isOpen()) for (const slot of running) loops.get(slot)?.play();
    },
    release() {
      unsubscribeGate();
      for (const slot of [...fades.keys()]) stopFade(slot);
      stopSpeech();
      for (const [p, f] of fadingSpeech) {
        clearInterval(f);
        try {
          p.remove();
        } catch (e) {
          note(e);
        }
      }
      fadingSpeech.clear();
      for (const p of loops.values()) p.remove();
      for (const pool of pools.values()) pool.players.forEach((p) => p.remove());
      loops.clear();
      pools.clear();
      running.clear();
      voicePlayer.clear();
    },
    status: () => ({ ready: error === null, error, lastRequestAt, played, waitingForGesture: !gate.isOpen(), profile: profile.id, dropped, silent: [...silent] }),
  };
}
