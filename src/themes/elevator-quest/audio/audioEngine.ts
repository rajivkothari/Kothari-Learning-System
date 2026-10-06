// Native playback for semantic audio cues, on expo-audio (local bundled files only).
// The engine knows nothing about elevators: it receives cues (slot + action), asks the
// profile for an asset and the mix for a gain, and plays. Swapping the profile swaps the
// elevator's whole character.
//
// expo-audio API used (checked against the installed 57.0.5 type definitions, 2026-10-06):
// createAudioPlayer(source), player.play(), pause(), seekTo(seconds), volume, loop, remove(),
// setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode }).
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { AUDIO_ASSETS } from './assets';
import type { AudioCue } from './cues';
import { gainFor, type AudioSettings } from './mix';
import { SLOT_SPECS, SOUND_SLOTS, type ElevatorSoundProfile, type SoundSlot } from './profile';

export interface AudioEngine {
  handle(cues: readonly AudioCue[]): void;
  setSettings(settings: AudioSettings): void;
  /** App backgrounded: stop loops. Foregrounded: restart the ones that should be running. */
  suspend(): void;
  resume(): void;
  release(): void;
  status(): { ready: boolean; error: string | null; lastRequestAt: number | null; played: number };
}

const POOL = 3;

export async function createAudioEngine(profile: ElevatorSoundProfile, initial: AudioSettings, now: () => number = () => performance.now()): Promise<AudioEngine> {
  let settings = initial;
  let error: string | null = null;
  let lastRequestAt: number | null = null;
  let played = 0;
  const pools = new Map<string, { players: AudioPlayer[]; next: number }>();
  const loops = new Map<SoundSlot, AudioPlayer>();
  const running = new Set<SoundSlot>();
  const fades = new Map<SoundSlot, ReturnType<typeof setInterval>>();

  try {
    // Mix with other audio, never keep playing in the background. Silent-switch behaviour:
    // plays in silent mode so a parent is not puzzled by a silent prototype; quiet/mute are in-game.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
    for (const slot of SOUND_SLOTS) {
      const spec = profile.slots[slot];
      if (!spec) continue;
      const source = AUDIO_ASSETS[spec.asset];
      if (source === undefined) throw new Error(`Missing audio asset "${spec.asset}" for ${slot}`);
      if (SLOT_SPECS[slot].loop) {
        const p = createAudioPlayer(source);
        p.loop = true;
        loops.set(slot, p);
      } else if (!pools.has(spec.asset)) {
        pools.set(spec.asset, { players: Array.from({ length: POOL }, () => createAudioPlayer(source)), next: 0 });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const stopFade = (slot: SoundSlot) => {
    const f = fades.get(slot);
    if (f !== undefined) clearInterval(f);
    fades.delete(slot);
  };

  function play(slot: SoundSlot) {
    const spec = profile.slots[slot];
    const pool = spec ? pools.get(spec.asset) : undefined;
    const gain = gainFor(profile, slot, settings);
    if (!pool || gain <= 0) return;
    const player = pool.players[pool.next % pool.players.length]!;
    pool.next += 1;
    lastRequestAt = now();
    try {
      player.volume = gain;
      void player.seekTo(0);
      player.play();
      played += 1;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function startLoop(slot: SoundSlot) {
    const p = loops.get(slot);
    if (!p) return;
    stopFade(slot);
    running.add(slot);
    try {
      p.volume = gainFor(profile, slot, settings);
      void p.seekTo(0);
      p.play();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function stopLoop(slot: SoundSlot, fadeMs: number) {
    const p = loops.get(slot);
    running.delete(slot);
    if (!p) return;
    stopFade(slot);
    if (fadeMs <= 0) {
      p.pause();
      return;
    }
    const start = p.volume;
    const steps = Math.max(1, Math.round(fadeMs / 40));
    let i = 0;
    fades.set(
      slot,
      setInterval(() => {
        i += 1;
        p.volume = Math.max(0, start * (1 - i / steps));
        if (i >= steps) {
          stopFade(slot);
          p.pause();
        }
      }, 40),
    );
  }

  return {
    handle(cues) {
      for (const c of cues) {
        if (c.action === 'play') play(c.slot);
        else if (c.action === 'loopStart') startLoop(c.slot);
        else stopLoop(c.slot, c.fadeMs);
      }
    },
    setSettings(next) {
      settings = next;
      for (const slot of running) {
        const p = loops.get(slot);
        if (p && !fades.has(slot)) p.volume = gainFor(profile, slot, settings);
      }
    },
    suspend() {
      for (const slot of running) loops.get(slot)?.pause();
    },
    resume() {
      for (const slot of running) loops.get(slot)?.play();
    },
    release() {
      for (const slot of [...fades.keys()]) stopFade(slot);
      for (const p of loops.values()) p.remove();
      for (const pool of pools.values()) pool.players.forEach((p) => p.remove());
      loops.clear();
      pools.clear();
      running.clear();
    },
    status: () => ({ ready: error === null, error, lastRequestAt, played }),
  };
}
