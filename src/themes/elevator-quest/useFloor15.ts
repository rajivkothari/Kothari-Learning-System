// Wires Floor 15 for a real device: expo-sqlite -> GameRuntime -> director -> audio.
// One neutral learner id until profiles exist (M6). Nothing leaves the device.
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

export const LEARNER_ID = 'learner-1';
const DB_NAME = 'kothari-learning.db';

export interface Floor15Session {
  runtime: GameRuntime;
  director: Director;
  audio: AudioEngine;
  log: PlaytestLog;
  skillsBefore: LearnerState | null;
  settings: { motion: Motion; audio: AudioSettings };
}

const newInstanceId = () => `floor15-${Date.now().toString(36)}`;
const schedule = (fn: () => void, ms: number) => {
  const h = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(h) };
};

export function useFloor15(): { session: Floor15Session | null; error: string | null } {
  const [session, setSession] = useState<Floor15Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Floor15Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await openExpoDatabase(DB_NAME);
      const runtime = await openGameRuntime(db, loadElevatorQuestContent(), { now: () => Date.now() });
      if (!(await runtime.getLearner(LEARNER_ID))) await runtime.createLearner({ id: LEARNER_ID, themePack: 'elevator-quest' });
      const stored = await runtime.settings(LEARNER_ID);
      const motion: Motion = stored.motion === 'reduced' ? 'reduced' : 'normal';
      const audioSettings: AudioSettings = {
        output: (['normal', 'quiet', 'muted'] as AudioOutput[]).includes(stored.output as AudioOutput) ? (stored.output as AudioOutput) : DEFAULT_AUDIO.output,
        effects: stored.effects ? Math.min(1, Math.max(0, Number(stored.effects))) : DEFAULT_AUDIO.effects,
      };
      let instanceId = await runtime.findActiveMission(LEARNER_ID, FLOOR15.missionId);
      if (!instanceId) {
        instanceId = newInstanceId();
        await runtime.startMission({ learnerId: LEARNER_ID, missionId: FLOOR15.missionId, instanceId });
      }
      const log = createPlaytestLog();
      const audio = await createAudioEngine(PROTOTYPE_MODERN, audioSettings);
      const director = createFloor15Director({
        runtime,
        learnerId: LEARNER_ID,
        instanceId,
        clock: { now: () => Date.now() },
        schedule,
        motion,
        onAudio: (cues) => {
          audio.handle(cues);
          log.record(Date.now(), 'audio', { count: cues.length, slots: cues.map((c) => `${c.action}:${c.slot}`) });
        },
        log,
        newInstanceId,
      });
      const skillsBefore = await runtime.learnerState(LEARNER_ID);
      await director.start();
      if (cancelled) {
        director.dispose();
        audio.release();
        return;
      }
      const s: Floor15Session = { runtime, director, audio, log, skillsBefore, settings: { motion, audio: audioSettings } };
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
    };
  }, []);

  return { session, error };
}

/** Subscribe a component to the director's view. */
export function useDirectorView(director: Director): DirectorView {
  return useSyncExternalStore(director.subscribe, director.getView, director.getView);
}
