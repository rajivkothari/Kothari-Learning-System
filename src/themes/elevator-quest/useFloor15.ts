// Wires Floor 15 for a real device: expo-sqlite -> GameRuntime -> director -> audio.
// Everything is scoped to the learner id the caller supplies. Until a profile picker exists, the
// app supplies one neutral local id (DEFAULT_LEARNER_ID). Nothing leaves the device.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { LearnerState } from '../../engine';
import { openExpoDatabase } from '../../persistence/expoDatabase';
import { openGameRuntime, type GameRuntime } from '../../runtime/gameRuntime';
import { createAudioEngine, type AudioEngine } from './audio/audioEngine';
import { DEFAULT_AUDIO, type AudioOutput, type AudioSettings } from './audio/mix';
import { PROTOTYPE_MODERN } from './audio/profile';
import { loadElevatorQuestContent } from './appContent';
import { FLOOR15 } from './content/floor15';
import { createFloor15Director, type Director, type DirectorView, type Motion } from './director/director';
import { createPlaytestLog, type PlaytestLog } from './director/playtestLog';

/** The local id the app uses until profiles exist. Not an assumption anywhere below this hook. */
export const DEFAULT_LEARNER_ID = 'learner-1';
const DB_NAME = 'kothari-learning.db';

export interface Floor15Session {
  learnerId: string;
  runtime: GameRuntime;
  director: Director;
  audio: AudioEngine;
  log: PlaytestLog;
  skillsBefore: LearnerState | null;
  settings: { motion: Motion; audio: AudioSettings };
}

const newInstanceIdFor = (learnerId: string) => () => `floor15-${learnerId}-${Date.now().toString(36)}`;
const schedule = (fn: () => void, ms: number) => {
  const h = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(h) };
};

export function useFloor15(learnerId: string): { session: Floor15Session | null; error: string | null } {
  const [session, setSession] = useState<Floor15Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Floor15Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await openExpoDatabase(DB_NAME);
      const runtime = await openGameRuntime(db, loadElevatorQuestContent(), { now: () => Date.now() });
      if (!(await runtime.getLearner(learnerId))) await runtime.createLearner({ id: learnerId, themePack: 'elevator-quest' });
      const stored = await runtime.settings(learnerId);
      const motion: Motion = stored.motion === 'reduced' ? 'reduced' : 'normal';
      const audioSettings: AudioSettings = {
        output: (['normal', 'quiet', 'muted'] as AudioOutput[]).includes(stored.output as AudioOutput) ? (stored.output as AudioOutput) : DEFAULT_AUDIO.output,
        effects: stored.effects ? Math.min(1, Math.max(0, Number(stored.effects))) : DEFAULT_AUDIO.effects,
      };
      let instanceId = await runtime.findActiveMission(learnerId, FLOOR15.missionId);
      if (!instanceId) {
        instanceId = newInstanceIdFor(learnerId)();
        await runtime.startMission({ learnerId, missionId: FLOOR15.missionId, instanceId });
      }
      const log = createPlaytestLog();
      const audio = await createAudioEngine(PROTOTYPE_MODERN, audioSettings);
      const director = createFloor15Director({
        runtime,
        learnerId,
        instanceId,
        clock: { now: () => Date.now() },
        schedule,
        motion,
        onAudio: (cues) => {
          audio.handle(cues);
          log.record(Date.now(), 'audio', { count: cues.length, slots: cues.map((c) => `${c.action}:${c.slot}`) });
        },
        log,
        newInstanceId: newInstanceIdFor(learnerId),
      });
      const skillsBefore = await runtime.learnerState(learnerId);
      await director.start();
      if (cancelled) {
        director.dispose();
        audio.release();
        return;
      }
      const s: Floor15Session = { learnerId, runtime, director, audio, log, skillsBefore, settings: { motion, audio: audioSettings } };
      ref.current = s;
      setSession(s);
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

    const sub = AppState.addEventListener('change', (state) => {
      const s = ref.current;
      if (!s) return;
      s.log.record(Date.now(), state === 'active' ? 'app.resume' : 'app.background', { state });
      if (state === 'active') s.audio.resume();
      else s.audio.suspend();
    });
    return () => {
      cancelled = true;
      sub.remove();
      ref.current?.director.dispose();
      ref.current?.audio.release();
      ref.current = null;
    };
  }, [learnerId]);

  return { session, error };
}

/** Subscribe a component to the director's view. */
export function useDirectorView(director: Director): DirectorView {
  return useSyncExternalStore(director.subscribe, director.getView, director.getView);
}
