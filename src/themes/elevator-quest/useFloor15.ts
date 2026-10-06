// React wiring for a Floor 15 session (see session.ts for the objects themselves).
// Nothing leaves the device.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { Director, DirectorView } from './director/director';
import { openFloor15Services, startFloor15Session, stopFloor15Session } from './session';
import type { Floor15Session, SessionSettings } from './sessionCore';

export { DEFAULT_LEARNER_ID } from './session';
export type { Floor15Session } from './sessionCore';

/**
 * Start (or resume) Floor 15 for `learnerId`. A new `instanceId` or `generation` restarts the
 * session. Callers that switch sessions (the developer tools) also remount with a new React key,
 * so a stale session is never shown while the next one starts.
 */
export function useFloor15(learnerId: string, opts: { instanceId?: string; generation?: number } = {}): { session: Floor15Session | null; error: string | null } {
  const [session, setSession] = useState<Floor15Session | null>(null);
  // An error belongs to the start that failed: TRY AGAIN (a new generation) clears it.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const ref = useRef<Floor15Session | null>(null);
  const { instanceId, generation } = opts;
  const key = `${learnerId}|${instanceId ?? ''}|${generation ?? 0}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svc = await openFloor15Services();
      const s = await startFloor15Session(svc, { learnerId, ...(instanceId ? { instanceId } : {}) });
      if (cancelled) {
        stopFloor15Session(s);
        return;
      }
      ref.current = s;
      setSession(s);
    })().catch((e: unknown) => {
      if (!cancelled) setFailure({ key, message: e instanceof Error ? e.message : String(e) });
    });

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
      if (ref.current) stopFloor15Session(ref.current);
      ref.current = null;
    };
  }, [learnerId, instanceId, generation, key]);

  return { session, error: failure?.key === key ? failure.message : null };
}

/** Subscribe a component to the director's view. */
export function useDirectorView(director: Director): DirectorView {
  return useSyncExternalStore(director.subscribe, director.getView, director.getView);
}

/** Subscribe a component to the session's access and sound settings. */
export function useSessionSettings(session: Floor15Session): SessionSettings {
  return useSyncExternalStore(session.settings.subscribe, session.settings.get, session.settings.get);
}
