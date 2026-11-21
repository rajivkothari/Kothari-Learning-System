// A speech hook on virtual time for the director's voice tests: every line "plays" for a length the
// test gives it, and everything asked for and everything said is recorded. Pure; tests only.
import type { SpeechHook } from '../audio/speech';
import { voiceLine } from '../content/voice';
import type { VirtualTime } from './headless';

/** The gap between two lines of a sequence, as audio/speech.ts plays them (SEQUENCE_GAP_MS). */
export const FAKE_GAP_MS = 180;

/**
 * No recording exists yet, so a line's length is estimated from its words: an unhurried 13 characters
 * a second (the pace the script's directions ask for), plus 200 ms of quiet around it.
 */
export const VOICE_RATE_CPS = 13;
export const VOICE_PAD_MS = 200;
export const estimatedMs = (key: string): number | null => {
  const line = voiceLine(key);
  return line ? Math.round((line.text.length / VOICE_RATE_CPS) * 1000) + VOICE_PAD_MS : null;
};

export interface Said {
  keys: string[];
  at: number;
  /** When the sequence would end if nothing stopped it. */
  plannedEnd: number;
  endedAt: number | null;
  how: 'ended' | 'replaced' | 'hushed' | null;
}

export interface FakeSpeechOptions {
  /** A recording's length in ms, or null for no recording. Default: nothing is recorded. */
  ms?: (key: string) => number | null;
  /** Whether the hook tells the director how long a sequence is (SpeechHook.sequenceMs). Default true. */
  measures?: boolean;
}

export function fakeSpeech(time: VirtualTime, opts: FakeSpeechOptions = {}) {
  const ms = opts.ms ?? (() => null);
  let current: { said: Said; onEnd?: () => void; timer: { cancel(): void } } | null = null;
  const asked: string[][] = [];
  const said: Said[] = [];
  const stop = (how: 'replaced' | 'hushed') => {
    const c = current;
    current = null;
    if (!c) return;
    c.timer.cancel();
    c.said.endedAt = time.now();
    c.said.how = how;
    c.onEnd?.();
  };
  const lengthOf = (keys: readonly string[], cap = Infinity): number | null => {
    const list = keys.filter((k) => ms(k) !== null);
    return list.length ? list.reduce((n, k) => n + Math.min(cap, ms(k)!), 0) + FAKE_GAP_MS * (list.length - 1) : null;
  };
  const hook: SpeechHook = {
    speak(keys, onEnd) {
      asked.push([...keys]);
      const list = keys.filter((k) => ms(k) !== null);
      if (!list.length) return false;
      stop('replaced');
      const total = lengthOf(list)!;
      const entry: Said = { keys: list, at: time.now(), plannedEnd: time.now() + total, endedAt: null, how: null };
      const me = {
        said: entry,
        ...(onEnd ? { onEnd } : {}),
        timer: time.schedule(() => {
          if (current !== me) return;
          current = null;
          entry.endedAt = time.now();
          entry.how = 'ended';
          me.onEnd?.();
        }, total),
      };
      current = me;
      said.push(entry);
      return true;
    },
    hush() {
      stop('hushed');
    },
    ...((opts.measures ?? true) ? { sequenceMs: (keys: readonly string[], lineCapMs: number) => lengthOf(keys, lineCapMs) } : {}),
  };
  return {
    hook,
    /** Every request, recorded or not. */
    asked,
    /** Every sequence that started. */
    said,
    speaking: () => current !== null,
    /** The keys speaking now (empty when quiet). */
    now: (): string[] => current?.said.keys ?? [],
    flat: () => asked.flat(),
  };
}

/** A line's role, for tests that tell the announcer from Lifty and the crew. */
export const roleOf = (key: string) => voiceLine(key)?.role ?? null;
