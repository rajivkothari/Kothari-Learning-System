// Whether the kingdom's sound can play, for whoever must know before offering something that only works
// by ear. Two things decide it: the switch (Sound in Comfort, and the app being in front: KingdomApp
// calls setEnabled) and the browser's first touch (the audio gate). Pure: no React, no Expo.
//
// `createSoundSwitch` belongs to one kingdom audio (audio/recorded.ts). `kingdomSound` is the switch of
// the audio in use, readable by any screen: the games room dims the hearing games while sound is off, and
// a running game pauses to say why (games/SoundOff.tsx).

export interface SoundGate {
  isOpen(): boolean;
  /** Called once when sound becomes allowed (immediately if it already is). */
  onOpen(listener: () => void): () => void;
}

export interface SoundSwitch {
  /** Switched on: Sound is on in Comfort and the app is in front. */
  on(): boolean;
  set(value: boolean): void;
  /** Sound can play now: switched on, and the browser's first touch given. */
  canSound(): boolean;
  /**
   * When sound cannot play now, run `fn` once when it can (the switch back on, the first touch). When it
   * can play already there is nothing to wait for and `fn` never runs. Returns a cancel.
   */
  whenReady(fn: () => void): () => void;
  /** Told whenever the switch changes. */
  subscribe(fn: () => void): () => void;
  release(): void;
}

export function createSoundSwitch(gate: SoundGate): SoundSwitch {
  let on = false;
  let ungate: (() => void) | null = null;
  const waiting = new Set<() => void>();
  const watchers = new Set<() => void>();
  const canSound = () => on && gate.isOpen();
  const flush = () => {
    if (!canSound()) return;
    const run = [...waiting];
    waiting.clear();
    for (const fn of run) fn();
  };
  return {
    on: () => on,
    set(value) {
      if (on === value) return;
      on = value;
      for (const w of [...watchers]) w();
      if (value) flush();
    },
    canSound,
    whenReady(fn) {
      if (canSound()) return () => undefined;
      waiting.add(fn);
      if (!gate.isOpen() && !ungate) {
        // The gate may open while this registers (it calls at once when open): flush only once it has returned.
        let registered = false;
        let opened = false;
        const cancel = gate.onOpen(() => {
          opened = true;
          if (!registered) return;
          ungate = null;
          flush();
        });
        registered = true;
        if (opened) flush();
        else ungate = cancel;
      }
      return () => {
        waiting.delete(fn);
      };
    },
    subscribe(fn) {
      watchers.add(fn);
      return () => {
        watchers.delete(fn);
      };
    },
    release() {
      ungate?.();
      ungate = null;
      waiting.clear();
      watchers.clear();
    },
  };
}

let bound: SoundSwitch | null = null;
const screens = new Set<() => void>();
const tell = () => {
  for (const fn of [...screens]) fn();
};

/** The switch of the kingdom audio in use. With no audio yet nothing is known to be off, and nothing can sound. */
export const kingdomSound = {
  /** Sound is switched off (Comfort), or the app is not in front. */
  off: (): boolean => bound !== null && !bound.on(),
  canSound: (): boolean => bound?.canSound() ?? false,
  subscribe(fn: () => void): () => void {
    screens.add(fn);
    return () => {
      screens.delete(fn);
    };
  },
};

/** The kingdom audio in use reports its switch here. Returns the unbind. */
export function bindKingdomSound(sw: SoundSwitch): () => void {
  bound = sw;
  const stop = sw.subscribe(tell);
  tell();
  return () => {
    stop();
    if (bound !== sw) return;
    bound = null;
    tell();
  };
}
