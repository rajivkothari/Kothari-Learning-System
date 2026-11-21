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
//   it is dropped, not queued; it follows the dialogue mix (mix.ts narrationGain); muting while it
//   speaks stops it (not only turns it down), and unmuting never resumes the old sentence
// - a recording plays to its own end: the line is over when its player says it finished, never at a
//   time counted from the request (a fresh player takes time to start, and a timer from the request
//   cut that much off the end of every word). The manifest length plus SPEECH_END_MARGIN_MS is only
//   the fallback for a player that never reports; a player that may still be sounding is never
//   paused or freed without the fade
// - ducking: while narration speaks, effects and ambience step back (mix.ts DUCK_UNDER_SPEECH): new
//   one-shots start lower and running loops ramp down over DUCK_RAMP_MS, then back up when it ends.
//   After a line that played to its end the mix stays down for DUCK_HOLD_MS first, so two lines of a
//   sequence share one duck (no pumping in the gap between them)
// - release() ends a speaking line first and leaves no timer behind: nothing writes to a freed player
//
// expo-audio API used (checked against the installed 57.0.5 type definitions, 2026-10-06):
// createAudioPlayer(source), player.play(), pause(), seekTo(seconds), volume, loop, remove(),
// setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode }).
// player.addListener('playbackStatusUpdate', (status) => ...) with status.didJustFinish (checked against
// the installed 57.0.5 sources, 2026-11-21): iOS sends it from AVPlayerItemDidPlayToEndTime
// (ios/AudioPlayer.swift), Android when ExoPlayer reaches STATE_ENDED (BaseAudioPlayer.kt), and the web
// player from the <audio> element's pause and timeupdate at its end (AudioPlayer.web.js; seen in
// Chromium, where the element pauses itself when it ends). Not checked on a device.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { activeSoundSet } from './activeSet';
import { createAudioGate } from './audioGate';
import type { AudioCue } from './cues';
import { DUCK_HOLD_MS, DUCK_RAMP_MS, gainFor, narrationGain, type AudioSettings } from './mix';
import { createLoopPlayer, type LoopPlayer } from './loopPlayer';
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
   * Narration (M9): speak a bundled recording by its key (word.<wordId>, voice.<lineId>). Returns
   * whether it started. One at a time: a new say() stops the previous one. `onEnd` is called once, when
   * the recording has played to its end ('ended': its player reported the finish, or never did and the
   * fallback gave up on it) or when it is stopped early by hush(), a new say(), mute, suspend or release
   * ('stopped'). Never called if it did not start. Optional so test doubles need not implement it.
   */
  say?(key: string, onEnd?: (reason: SpeechEnd) => void): boolean;
  /** Whether a recording is speaking now (effects and ambience duck under it). */
  speaking?(): boolean;
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

/**
 * How long past its manifest length the engine waits for a recording's own finish before it gives up
 * on the player (a clip that failed to load, or a player that never reports). Generous on purpose: the
 * time a fresh player takes to start sounding (about 0.1 s in desktop Chromium; not measured on a
 * tablet, docs/DEVICE_LAB.md) must never reach it, or the fallback would cut a clip that is only slow.
 */
export const SPEECH_END_MARGIN_MS = 2000;

/** Why a narration ended: played to its end, or stopped early. */
export type SpeechEnd = 'ended' | 'stopped';

export async function createAudioEngine(requested: ElevatorSoundProfile, initial: AudioSettings, now: () => number = () => performance.now()): Promise<AudioEngine> {
  const { profile, sources } = activeSoundSet(requested);
  let settings = initial;
  let error: string | null = null;
  let lastRequestAt: number | null = null;
  let played = 0;
  let dropped = 0;
  const silent = new Set<SoundSlot>();
  const pools = new Map<string, Pool>();
  const loops = new Map<SoundSlot, LoopPlayer>();
  const running = new Set<SoundSlot>();
  const fades = new Map<SoundSlot, ReturnType<typeof setInterval>>();
  const voices = createVoiceLimiter();
  const voicePlayer = new Map<number, AudioPlayer>();
  let speech: AudioPlayer | null = null;
  /** The speaking recording's end: its finish listener, the fallback timer, and who to tell. */
  let speechEnd: { timer: ReturnType<typeof setTimeout>; finish: { remove(): void } | null; onEnd: ((reason: SpeechEnd) => void) | null } | null = null;
  const fadingSpeech = new Map<AudioPlayer, ReturnType<typeof setInterval>>();
  /** Loops ramping to their level under (or after) speech. */
  const ducks = new Map<SoundSlot, ReturnType<typeof setInterval>>();
  /** The mix stays down a moment after a line ends by itself (DUCK_HOLD_MS): the next line of a sequence starts inside it. */
  let duckHold: ReturnType<typeof setTimeout> | null = null;
  /** Freed: nothing may start, and nothing may touch a player again. */
  let released = false;
  /** A slot's gain now: the mix, stepped back while narration speaks (and through the hold after it). */
  const gainOf = (slot: SoundSlot) => gainFor(profile, slot, settings, speech !== null || duckHold !== null);
  const note = (e: unknown) => (error = e instanceof Error ? e.message : String(e));

  // Browsers block sound until the first gesture (native: always open). Loops that should be
  // running start when the gate opens; one-shots before then are dropped, not queued.
  const gate = createAudioGate();
  const unsubscribeGate = gate.onOpen(() => {
    for (const slot of running) {
      const p = loops.get(slot);
      if (!p) continue;
      try {
        p.volume = gainOf(slot);
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
      // Loops go through their own adapter (loopPlayer.ts): the browser build wraps them without a gap.
      try {
        loops.set(slot, createLoopPlayer(source));
      } catch (e) {
        note(e);
        silent.add(slot);
      }
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

  function play(requested: SoundSlot) {
    // A slot this profile has no sound for plays its fallback, if it has one (the up and down chimes).
    const fallback = SLOT_SPECS[requested].fallback;
    const slot = !profile.slots[requested] && fallback ? fallback : requested;
    const spec = profile.slots[slot];
    const pool = spec ? pools.get(spec.asset) : undefined;
    const gain = gainOf(slot);
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
      p.volume = gainOf(slot);
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
    stopDuck(slot);
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

  function stopDuck(slot: SoundSlot) {
    const d = ducks.get(slot);
    if (d !== undefined) clearInterval(d);
    ducks.delete(slot);
  }

  /** Ramp every running loop to its level with or without speech: over DUCK_RAMP_MS, never a jump. */
  function rampLoops() {
    if (released || !gate.isOpen()) return;
    for (const slot of running) {
      const p = loops.get(slot);
      if (!p || fades.has(slot)) continue;
      stopDuck(slot);
      const from = p.volume;
      const to = gainOf(slot);
      if (from === to) continue;
      const steps = Math.max(1, Math.round(DUCK_RAMP_MS / 40));
      let i = 0;
      ducks.set(
        slot,
        setInterval(() => {
          i += 1;
          try {
            p.volume = from + (to - from) * Math.min(1, i / steps);
          } catch (e) {
            note(e);
          }
          if (i >= steps) stopDuck(slot);
        }, 40),
      );
    }
  }

  const narrationSource = (key: string): number | null => {
    const id = narrationAsset(key);
    return id === null ? null : (sources[id] ?? null);
  };

  /**
   * The current narration leaves the stage, for whatever reason: the mix comes back up and whoever
   * asked is told, each exactly once. Returns its player, which may still be sounding.
   */
  function retire(reason: SpeechEnd): AudioPlayer | null {
    const p = speech;
    const e = speechEnd;
    speech = null;
    speechEnd = null;
    if (e) {
      clearTimeout(e.timer);
      try {
        e.finish?.remove();
      } catch (err) {
        note(err);
      }
    }
    if (p) {
      // Played to its end: the mix holds a moment, for a line that may follow. Stopped: it comes back now.
      if (reason === 'ended') holdDuck();
      else releaseDuck();
    }
    try {
      e?.onEnd?.(reason);
    } catch (err) {
      note(err);
    }
    return p;
  }

  function clearHold() {
    if (duckHold !== null) clearTimeout(duckHold);
    duckHold = null;
  }
  /** Keep the mix down for DUCK_HOLD_MS, then let it back up (once), unless a new line starts first. */
  function holdDuck() {
    clearHold();
    duckHold = setTimeout(() => {
      duckHold = null;
      rampLoops();
    }, DUCK_HOLD_MS);
  }
  /** Let the mix back up now. */
  function releaseDuck() {
    clearHold();
    rampLoops();
  }

  /** Fade a narration player out over SPEECH_FADE_MS, then pause and free it. Never a hard cut. */
  function fadeOut(p: AudioPlayer) {
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

  /** Stop the current narration early: it fades out, then its player is freed. */
  function stopSpeech() {
    const p = retire('stopped');
    if (p) fadeOut(p);
    // Stopped in the quiet after a line (the gap of a sequence): nothing follows, so the mix comes back now.
    else if (duckHold !== null) releaseDuck();
  }

  /** The recording's own player says it has played to its end: it is silent now, so it is simply freed. */
  function speechFinished(p: AudioPlayer) {
    if (speech !== p) return;
    retire('ended');
    try {
      p.remove();
    } catch (e) {
      note(e);
    }
  }

  /**
   * The fallback: the player never reported its finish (the file failed, or the platform sent nothing).
   * The line is over for whoever waits on it, but the player might still be sounding, so it fades.
   */
  function speechOverdue(p: AudioPlayer) {
    if (speech !== p) return;
    retire('ended');
    fadeOut(p);
  }

  return {
    say(key, onEnd) {
      const source = narrationSource(key);
      if (source === null || released) return false;
      // A line that starts inside the hold after the last one keeps the mix down: one duck for the sequence.
      const held = speech === null && duckHold !== null;
      if (!held) stopSpeech();
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
      } catch (e) {
        note(e);
        speech = null;
        return false;
      }
      // Speaking now: the hold has done its job (if this line did not start, the hold ends by itself).
      clearHold();
      // The line ends when its own player finishes. The manifest length only arms the fallback.
      let finish: { remove(): void } | null = null;
      try {
        finish = p.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) speechFinished(p);
        });
      } catch (e) {
        note(e);
      }
      const id = narrationAsset(key);
      const ms = id === null ? 0 : (AUDIO_MANIFEST.assets[id]?.durationMs ?? 0);
      speechEnd = { timer: setTimeout(() => speechOverdue(p), Math.max(50, ms) + SPEECH_END_MARGIN_MS), finish, onEnd: onEnd ?? null };
      rampLoops();
      return true;
    },
    speaking: () => speech !== null,
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
      if (speech) {
        const gain = narrationGain(settings);
        if (gain > 0) speech.volume = gain;
        else {
          // Muted: the sentence stops (silenced at once, then paused and freed), so unmuting can
          // never bring the old sentence back mid-word.
          speech.volume = 0;
          stopSpeech();
        }
      }
      for (const slot of running) {
        const p = loops.get(slot);
        if (p && !fades.has(slot)) {
          stopDuck(slot);
          p.volume = gainOf(slot);
        }
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
      // A speaking line ends first (its end is reported), with no ramp started for players about to be
      // freed; only then are the timers cleared. The other order left 200 ms of ramp writing to freed loops.
      released = true;
      stopSpeech();
      clearHold();
      for (const slot of [...fades.keys()]) stopFade(slot);
      for (const slot of [...ducks.keys()]) stopDuck(slot);
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
