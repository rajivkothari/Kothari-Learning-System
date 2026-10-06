// Floor 15 session wiring, without React: database -> GameRuntime -> director -> audio.
// Used by the game screen (useFloor15) and by the developer tools, so both drive exactly the
// same objects. Everything is scoped to the learner id the caller supplies.
import type { SqlDatabase } from '../../persistence/driver';
import { APP_STORAGE, openAppDatabase } from '../../persistence/openAppDatabase';
import { openGameRuntime, type GameRuntime } from '../../runtime/gameRuntime';
import { createAudioEngine } from './audio/audioEngine';
import { PROTOTYPE_MODERN } from './audio/profile';
import { loadElevatorQuestContent } from './appContent';
import { FLOOR15 } from './content/floor15';
import { createFloor15Director } from './director/director';
import { createPlaytestLog } from './director/playtestLog';
import { assembleSession, chooseFloor15Instance, parseSettings, type Floor15Session } from './sessionCore';

/** The local id the app uses until profiles exist. Not an assumption anywhere below the entry. */
export const DEFAULT_LEARNER_ID = 'learner-1';
export const DB_NAME = 'kothari-learning.db';

export interface Floor15Services {
  db: SqlDatabase;
  runtime: GameRuntime;
  /** Which persistence adapter is in use (native file, or browser IndexedDB). */
  storage: string;
}

let services: Promise<Floor15Services> | null = null;

/** One database and one runtime per app process, shared by every session. */
export function openFloor15Services(): Promise<Floor15Services> {
  services ??= (async () => {
    const db = await openAppDatabase(DB_NAME);
    const runtime = await openGameRuntime(db, loadElevatorQuestContent(), { now: () => Date.now() });
    return { db, runtime, storage: APP_STORAGE };
  })();
  services.catch(() => (services = null));
  return services;
}

export { assembleSession, parseSettings, type Floor15Session, type SessionSettings, type SettingsStore } from './sessionCore';

export const newInstanceIdFor = (learnerId: string) => () => `floor15-${learnerId}-${Date.now().toString(36)}`;
const schedule = (fn: () => void, ms: number) => {
  const h = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(h) };
};

export interface StartOptions {
  learnerId: string;
  /** Resume this instance instead of the learner's latest active one (developer tools). */
  instanceId?: string;
}

export async function startFloor15Session(svc: Floor15Services, opts: StartOptions): Promise<Floor15Session> {
  const { runtime } = svc;
  const { learnerId } = opts;
  if (!(await runtime.getLearner(learnerId))) await runtime.createLearner({ id: learnerId, themePack: 'elevator-quest' });
  const initial = parseSettings(await runtime.settings(learnerId));
  let instanceId = opts.instanceId ?? (await chooseFloor15Instance(runtime, learnerId, FLOOR15.missionId));
  if (!instanceId) {
    instanceId = newInstanceIdFor(learnerId)();
    await runtime.startMission({ learnerId, missionId: FLOOR15.missionId, instanceId });
  }
  const log = createPlaytestLog();
  const audio = await createAudioEngine(PROTOTYPE_MODERN, initial.audio);
  const director = createFloor15Director({
    runtime,
    learnerId,
    instanceId,
    clock: { now: () => Date.now() },
    schedule,
    motion: initial.motion,
    onAudio: (cues) => {
      audio.handle(cues);
      log.record(Date.now(), 'audio', { count: cues.length, slots: cues.map((c) => `${c.action}:${c.slot}`) });
    },
    log,
    newInstanceId: newInstanceIdFor(learnerId),
  });
  const skillsBefore = await runtime.learnerState(learnerId);
  try {
    await director.start();
  } catch (e) {
    director.dispose();
    audio.release();
    throw e;
  }
  return assembleSession({ learnerId, runtime, director, audio, log, skillsBefore }, initial);
}

export function stopFloor15Session(s: Floor15Session): void {
  s.director.dispose();
  s.audio.release();
}
