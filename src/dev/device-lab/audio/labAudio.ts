// Device Lab audio probe built on expo-audio. Local bundled assets only, no network,
// no TTS. Compares a single re-triggered player with a small round-robin pool, and
// WAV with AAC for the same short effect (AAC adds encoder priming silence).
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { labStore } from '../labStore';

const SOURCES = {
  chimeWav: require('../../../../assets/dev/audio/success-chime.wav'),
  chimeAac: require('../../../../assets/dev/audio/success-chime.m4a'),
  narration: require('../../../../assets/dev/audio/narration-placeholder.m4a'),
} as const;

export type ChimeFormat = 'wav' | 'aac';
export type ChimeMode = 'single' | 'pool';

const POOL_SIZE = 4;

let initialized = false;
let volume = 0.8;
let muted = false;
let single: Record<ChimeFormat, AudioPlayer> | null = null;
let pool: Record<ChimeFormat, AudioPlayer[]> | null = null;
let poolIndex = 0;
let narration: AudioPlayer | null = null;
let narrationRequestedAt: number | null = null;

function setStatus(status: string, extra: Partial<{ lastPlayCallMs: number | null; error: string | null }> = {}) {
  labStore.set((s) => ({ audio: { ...s.audio, status, ...extra } }));
}

function allPlayers(): AudioPlayer[] {
  const list: AudioPlayer[] = [];
  if (single) list.push(single.wav, single.aac);
  if (pool) list.push(...pool.wav, ...pool.aac);
  if (narration) list.push(narration);
  return list;
}

function applyMix(player: AudioPlayer) {
  player.volume = volume;
  player.muted = muted;
}

export async function initLabAudio(): Promise<void> {
  if (initialized) return;
  try {
    setStatus('initializing');
    // Do not take over other apps' audio, and do not keep playing in the background.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
    single = { wav: createAudioPlayer(SOURCES.chimeWav), aac: createAudioPlayer(SOURCES.chimeAac) };
    pool = {
      wav: Array.from({ length: POOL_SIZE }, () => createAudioPlayer(SOURCES.chimeWav)),
      aac: Array.from({ length: POOL_SIZE }, () => createAudioPlayer(SOURCES.chimeAac)),
    };
    narration = createAudioPlayer(SOURCES.narration, { updateInterval: 50 });
    narration.addListener('playbackStatusUpdate', (status) => {
      // Upper bound only: status events are polled, they are not the audio onset.
      if (status.playing && narrationRequestedAt !== null) {
        const ms = performance.now() - narrationRequestedAt;
        narrationRequestedAt = null;
        labStore.set((s) => ({ audio: { ...s.audio, narrationStatusMs: ms } }));
      }
    });
    allPlayers().forEach(applyMix);
    initialized = true;
    setStatus('ready', { error: null });
  } catch (e) {
    setStatus('error', { error: e instanceof Error ? e.message : String(e) });
  }
}

export function releaseLabAudio(): void {
  allPlayers().forEach((p) => p.remove());
  single = null;
  pool = null;
  narration = null;
  initialized = false;
  setStatus('released');
}

function timedPlay(player: AudioPlayer, label: string) {
  const t0 = performance.now();
  try {
    void player.seekTo(0);
    player.play();
    setStatus(`played ${label}`, { lastPlayCallMs: performance.now() - t0, error: null });
  } catch (e) {
    setStatus('error', { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Plays the success chime. Returns quickly; the call duration is recorded. */
export function playChime(format: ChimeFormat = 'wav', mode: ChimeMode = 'pool'): void {
  if (!initialized || !single || !pool) {
    setStatus('not ready', { error: 'Audio not initialized yet' });
    return;
  }
  if (mode === 'single') {
    timedPlay(single[format], `chime ${format} single`);
    return;
  }
  const players = pool[format];
  const player = players[poolIndex % players.length]!;
  poolIndex += 1;
  timedPlay(player, `chime ${format} pool#${poolIndex % players.length}`);
}

export function playNarration(): void {
  if (!narration) {
    setStatus('not ready', { error: 'Audio not initialized yet' });
    return;
  }
  narrationRequestedAt = performance.now();
  timedPlay(narration, 'narration placeholder');
}

export function stopNarration(): void {
  narration?.pause();
}

export function setLabVolume(next: number): number {
  volume = Math.min(1, Math.max(0, Math.round(next * 10) / 10));
  allPlayers().forEach(applyMix);
  return volume;
}

export function setLabMuted(next: boolean): boolean {
  muted = next;
  allPlayers().forEach(applyMix);
  return muted;
}

export function getLabMix(): { volume: number; muted: boolean } {
  return { volume, muted };
}

export function getNarrationPlayer(): AudioPlayer | null {
  return narration;
}
