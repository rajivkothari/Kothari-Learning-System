// Floor 15 session shape and settings store. No native imports, so UI tests can build a
// session over the headless director (session.ts does the real wiring).
import type { LearnerState } from '../../engine';
import type { GameRuntime } from '../../runtime/gameRuntime';
import type { AudioEngine } from './audio/audioEngine';
import { DEFAULT_AUDIO, type AudioOutput, type AudioSettings } from './audio/mix';
import type { Director, Motion } from './director/director';
import type { PlaytestLog } from './director/playtestLog';
import { createMiniGameHost, type MiniGameHost } from './minigames/host';
import type { Narration } from './minigames/hostSound';
import { GAME_SETTING_PREFIX } from './minigames/session';

export interface SessionSettings {
  motion: Motion;
  audio: AudioSettings;
}

/** Access and sound settings: one source for the settings sheet and the developer tools. */
export interface SettingsStore {
  get(): SessionSettings;
  subscribe(listener: () => void): () => void;
}

export interface Floor15Session {
  learnerId: string;
  runtime: GameRuntime;
  director: Director;
  audio: AudioEngine;
  log: PlaytestLog;
  skillsBefore: LearnerState | null;
  settings: SettingsStore;
  /** The mini-games (M9): which one is open, and the moves in and out (minigames/host.ts). */
  games: MiniGameHost;
  /** The real settings path: director timing + persisted learner setting. */
  setMotion(m: Motion): void;
  /** The real settings path: audio mix + persisted learner settings. */
  setAudio(output: AudioOutput, effects: number): void;
}

/**
 * Where the motion setting came from. A stored choice always wins. The OS "reduce motion" switch
 * is only the starting default for a learner who never chose, and it is never written back, so
 * changing the OS later still counts until an adult picks a setting in the game.
 */
export type MotionSource = 'stored' | 'os' | 'default';

export function resolveMotion(stored: Record<string, string>, osReduceMotion: boolean | null): { motion: Motion; source: MotionSource } {
  if (stored.motion === 'reduced' || stored.motion === 'normal') return { motion: stored.motion, source: 'stored' };
  if (osReduceMotion === true) return { motion: 'reduced', source: 'os' };
  return { motion: 'normal', source: 'default' };
}

export function parseSettings(stored: Record<string, string>, osReduceMotion: boolean | null = null): SessionSettings {
  return {
    motion: resolveMotion(stored, osReduceMotion).motion,
    audio: {
      output: (['normal', 'quiet', 'muted'] as AudioOutput[]).includes(stored.output as AudioOutput) ? (stored.output as AudioOutput) : DEFAULT_AUDIO.output,
      effects: stored.effects ? Math.min(1, Math.max(0, Number(stored.effects))) : DEFAULT_AUDIO.effects,
    },
  };
}

/**
 * Assemble a session from parts (tests build sessions over the headless director with this). The
 * mini-game host is built here over the same runtime, director and audio unless one is passed.
 */
export function assembleSession(parts: Omit<Floor15Session, 'settings' | 'setMotion' | 'setAudio' | 'games'> & { games?: MiniGameHost; narration?: Narration | null; clock?: { now(): number } }, initial: SessionSettings): Floor15Session {
  const { games: given, narration, clock, ...rest } = parts;
  const games =
    given ??
    createMiniGameHost({
      runtime: parts.runtime,
      learnerId: parts.learnerId,
      director: parts.director,
      audio: parts.audio,
      clock: clock ?? { now: () => Date.now() },
      narration: narration ?? null,
      log: (kind, data) => parts.log.record((clock ?? { now: () => Date.now() }).now(), kind, data),
    });
  let current = initial;
  const listeners = new Set<() => void>();
  const update = (next: SessionSettings) => {
    current = next;
    for (const l of listeners) l();
  };
  return {
    ...rest,
    games,
    settings: {
      get: () => current,
      subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    },
    setMotion(motion) {
      parts.director.setMotion(motion);
      void parts.runtime.putSetting(parts.learnerId, 'motion', motion);
      update({ ...current, motion });
    },
    setAudio(output, effects) {
      const audio = { output, effects };
      parts.audio.setSettings(audio);
      void parts.runtime.putSetting(parts.learnerId, 'output', output);
      void parts.runtime.putSetting(parts.learnerId, 'effects', String(effects));
      update({ ...current, audio });
    },
  };
}

/**
 * Which Floor 15 instance a learner reopens: the active one if any, else a just-completed one
 * (so the completion card and unlocks greet them, with Play again), else none (start new).
 */
export async function chooseFloor15Instance(runtime: GameRuntime, learnerId: string, missionId: string, onAbandoned?: (instanceId: string, reason: string) => void): Promise<string | null> {
  const active = await runtime.findActiveMission(learnerId, missionId);
  if (active) {
    // Content changed under it (an update replaced a generator or the mission version): it can
    // no longer be shown as it was. End it as abandoned, keep its evidence, and start fresh.
    const compat = await runtime.missionCompatibility(active);
    if (compat.ok) return active;
    await runtime.abandonMission(active, { commandId: `abandon:${active}` });
    onAbandoned?.(active, compat.reason);
    return null;
  }
  const latest = await runtime.latestMission(learnerId, missionId);
  return latest?.status === 'completed' ? latest.id : null;
}

/**
 * Playtest "start over" (adults, playtest builds only; D143). Learning history is append-only, so
 * starting over never deletes anything: the device's learner moves to a new id, `<base>-r<n>`,
 * which starts with no progress. Older saves stay in the database, unread. Settings (motion,
 * sound) are preferences, not progress, so they come along. Mini-game state (a game's saved play,
 * the floor a game was opened from: `eq.mg.*`) is progress, so it stays behind (M9).
 */
export async function currentLearnerFor(runtime: Pick<GameRuntime, 'getLearner'>, base: string): Promise<string> {
  let n = 1;
  while (await runtime.getLearner(`${base}-r${n + 1}`)) n += 1;
  return n === 1 ? base : `${base}-r${n}`;
}

export async function startOverLearner(runtime: Pick<GameRuntime, 'getLearner' | 'createLearner' | 'settings' | 'putSetting'>, base: string, themePack: string): Promise<string> {
  const current = await currentLearnerFor(runtime, base);
  const n = current === base ? 2 : Number(current.slice(base.length + 2)) + 1;
  const id = `${base}-r${n}`;
  await runtime.createLearner({ id, themePack });
  const kept = await runtime.settings(current);
  for (const [key, value] of Object.entries(kept)) if (!key.startsWith(GAME_SETTING_PREFIX)) await runtime.putSetting(id, key, value);
  return id;
}
