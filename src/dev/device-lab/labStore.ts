// Tiny external store for Device Lab diagnostics. No dependency, no context.
// Selectors must return existing references or primitives (useSyncExternalStore rule).
import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

import type { FrameWindow } from './diagnostics/frameStats';
import type { LabSummary } from './storage/labRepository';

export type ScenarioId = 'scene' | 'drag' | 'draw' | 'audio' | 'storage';

export interface LabState {
  scenario: ScenarioId;
  uiFrames: FrameWindow | null;
  jsFrames: FrameWindow | null;
  /** UI thread: press event to the next UI frame, ms. Approximation, see docs/DEVICE_LAB.md. */
  pressToFrameMs: number[];
  /** JS thread: duration of async SQLite writes triggered by taps, ms. */
  dbWriteMs: number[];
  taps: number[];
  /** lastPlayCallMs: JS cost of seek+play calls. narrationStatusMs: play() until status reports playing (upper bound). */
  audio: { status: string; lastPlayCallMs: number | null; narrationStatusMs: number | null; error: string | null };
  storage: { status: string; summary: LabSummary | null; error: string | null };
}

const initial: LabState = {
  scenario: 'scene',
  uiFrames: null,
  jsFrames: null,
  pressToFrameMs: [],
  dbWriteMs: [],
  taps: [],
  audio: { status: 'not started', lastPlayCallMs: null, narrationStatusMs: null, error: null },
  storage: { status: 'not opened', summary: null, error: null },
};

let state: LabState = initial;
const listeners = new Set<() => void>();

export const labStore = {
  get: (): LabState => state,
  set(patch: Partial<LabState> | ((s: LabState) => Partial<LabState>)): void {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    state = initial;
    listeners.forEach((l) => l());
  },
};

export function useLab<T>(selector: (s: LabState) => T): T {
  return useSyncExternalStore(labStore.subscribe, () => selector(labStore.get()));
}

/**
 * Set on the UI thread when a lab button press begins (animation clock, ms).
 * The frame-stats callback consumes it on the next frame. 0 = nothing pending.
 */
export const pressSignal = makeMutable(0);
