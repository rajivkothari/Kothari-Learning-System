// Floor 15 session shape and settings store. No native imports, so UI tests can build a
// session over the headless director (session.ts does the real wiring).
import type { LearnerState } from '../../engine';
import type { GameRuntime } from '../../runtime/gameRuntime';
import type { AudioEngine } from './audio/audioEngine';
import { DEFAULT_AUDIO, type AudioOutput, type AudioSettings } from './audio/mix';
import type { Director, Motion } from './director/director';
import type { PlaytestLog } from './director/playtestLog';

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
  /** The real settings path: director timing + persisted learner setting. */
  setMotion(m: Motion): void;
  /** The real settings path: audio mix + persisted learner settings. */
  setAudio(output: AudioOutput, effects: number): void;
}

export function parseSettings(stored: Record<string, string>): SessionSettings {
  return {
    motion: stored.motion === 'reduced' ? 'reduced' : 'normal',
    audio: {
      output: (['normal', 'quiet', 'muted'] as AudioOutput[]).includes(stored.output as AudioOutput) ? (stored.output as AudioOutput) : DEFAULT_AUDIO.output,
      effects: stored.effects ? Math.min(1, Math.max(0, Number(stored.effects))) : DEFAULT_AUDIO.effects,
    },
  };
}

/** Assemble a session from parts (tests build sessions over the headless director with this). */
export function assembleSession(parts: Omit<Floor15Session, 'settings' | 'setMotion' | 'setAudio'>, initial: SessionSettings): Floor15Session {
  let current = initial;
  const listeners = new Set<() => void>();
  const update = (next: SessionSettings) => {
    current = next;
    for (const l of listeners) l();
  };
  return {
    ...parts,
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
export async function chooseFloor15Instance(runtime: GameRuntime, learnerId: string, missionId: string): Promise<string | null> {
  const active = await runtime.findActiveMission(learnerId, missionId);
  if (active) return active;
  const latest = await runtime.latestMission(learnerId, missionId);
  return latest?.status === 'completed' ? latest.id : null;
}
