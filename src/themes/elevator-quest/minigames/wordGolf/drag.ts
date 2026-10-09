// A finger dragging Word Golf's aim (on the green) or power (on the meter): where it is now, before
// the game has it. Only the aim line and the meter subscribe, so a move re-renders those two and not
// the whole screen; the value reaches the game (controller.setAim / setPower) when the finger lifts.
// Play only: never help, never evidence, never saved. No React: the screen holds one per mount.

export interface DragValue {
  /** The aim a drag points (radians), or null: the game's aim is drawn. */
  aim: number | null;
  /** The power a drag sets (already in hundredths, game.ts powerOf), or null: the game's power is drawn. */
  power: number | null;
}

export interface DragStore {
  get(): DragValue;
  set(patch: Partial<DragValue>): void;
  subscribe(listener: () => void): () => void;
}

const IDLE: DragValue = { aim: null, power: null };

export function createDrag(): DragStore {
  let value = IDLE;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch) {
      const next = { ...value, ...patch };
      if (next.aim === value.aim && next.power === value.power) return;
      value = next.aim === null && next.power === null ? IDLE : next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A store that never changes (a canvas or meter drawn without a screen, as in tests). */
export const NO_DRAG: DragStore = { get: () => IDLE, set: () => undefined, subscribe: () => () => undefined };
