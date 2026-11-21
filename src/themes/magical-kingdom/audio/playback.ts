/**
 * The kingdom's player. One voice at a time; requests never wait for the gesture gate.
 *
 * Two channels. The voice channel carries speech and whole sequences (a sequence's own chime included):
 * a newer request cuts what it is saying, so two voices never sound together. The effect channel carries
 * one-shot effects (`play`: a tap's tick, a drop): one at a time, refused while the voice is speaking,
 * and never cut by a voice that starts after it, so a tap's tick plays out under the first word that
 * answers the tap.
 */
export interface PlayingClip { stop(): void }
export interface PlaybackDependencies {
  isOpen(): boolean;
  hasSource(key: string): boolean;
  /**
   * Start a clip. `finished(played)` is called when it stops by itself: `played` is true only when it
   * sounded to its end, false when it failed (a decode error, a play the browser refused).
   */
  start(key: string, finished: (played: boolean) => void): PlayingClip;
  now(): number;
  /** Timer for the gap between chained clips (default setTimeout). */
  wait?(ms: number, fn: () => void): void;
}
export function createKingdomPlayback(deps: PlaybackDependencies) {
  let enabled = false, released = false;
  /** Bumps on every voice request and every cut: a gap timer of an older request does nothing. */
  let serial = 0;
  /** Bumps for every voice clip: a late or repeated finish of an older clip does nothing. */
  let token = 0;
  let clip: PlayingClip | null = null;
  let speaking = false, lastEffect = -Infinity;
  /** The one-shot effect that is sounding, with its own token. */
  let fx: PlayingClip | null = null;
  let fxToken = 0;
  /** A sequence is running, gaps included; `report` is its end report, owed exactly once. */
  let chaining = false;
  let report: ((finished: boolean) => void) | null = null;
  const wait = deps.wait ?? ((ms: number, fn: () => void) => { setTimeout(fn, ms); });
  const canPlay = () => !released && enabled && deps.isOpen();
  const talking = () => chaining || clip !== null;
  const busy = () => talking() || fx !== null;

  /** Stop the voice clip that is sounding. Does not end a sequence. */
  const silence = () => { token++; speaking = false; const old = clip; clip = null; try { old?.stop(); } catch { /* Optional audio never interrupts play. */ } };
  /** Stop the effect that is sounding. */
  const still = () => { fxToken++; const old = fx; fx = null; try { old?.stop(); } catch { /* Optional audio never interrupts play. */ } };
  /** Cut the voice. A running sequence reports that it did not finish. An effect that is sounding plays on. */
  const cut = () => {
    serial++; silence();
    const owed = report; report = null; chaining = false;
    owed?.(false);
  };
  /** Cut everything: the voice and the effect. */
  const hush = () => { cut(); still(); };
  /** Cut the voice until it is quiet: an end report may itself ask for something, which must not overlap what comes next. */
  const clear = () => { cut(); for (let n = 0; n < 3 && talking(); n++) cut(); return !talking(); };
  /** Start one voice clip. `then(played)` runs once, when it stops by itself. */
  const begin = (key: string, voice: boolean, then: (played: boolean) => void) => {
    const mine = ++token; speaking = voice;
    try {
      const next = deps.start(key, (played) => { if (mine !== token) return; silence(); then(played); });
      if (mine === token) clip = next; else next.stop();
      return true;
    } catch { if (mine === token) silence(); return false; }
  };
  const single = (key: string) => (clear() && canPlay() && deps.hasSource(key) ? begin(key, true, () => undefined) : false);

  return {
    setEnabled(value: boolean) { enabled = value; if (!value) hush(); },
    speak(text: string) { return single(`voice:${text}`); },
    /** A Word Garden slot (sound, word, line). Unrecorded slots are silent. */
    slot(key: string) { return single(`slot:${key}`); },
    /**
     * Full keys (`voice:…`, `slot:…`, `game:…`, `effect:…`) one after another, `gapMs` apart. Unrecorded
     * keys are skipped. `onEnd` is called exactly once: true when every clip played to its end and the
     * last one finished by itself; false when the sequence was cut (a new request, hush, mute, release, a
     * clip that would not start, a clip that failed while playing: it ends there, at once), and false at
     * once, before this returns false, when nothing could play (nothing recorded, the gesture gate closed,
     * sound off). Effects (`play`) are refused while a sequence runs, gaps included.
     */
    sequence(keys: readonly string[], gapMs = 250, onEnd?: (finished: boolean) => void) {
      const list = keys.filter((k) => deps.hasSource(k));
      if (!clear() || !list.length || !canPlay()) { onEnd?.(false); return false; }
      const mine = serial;
      chaining = true; report = onEnd ?? null;
      const run = (i: number): boolean => begin(list[i]!, !list[i]!.startsWith('effect:'), (played) => {
        if (mine !== serial) return;
        // A clip that did not sound was not heard: the sequence ends here and says so. Never a wait.
        if (!played) { cut(); return; }
        if (i + 1 < list.length) { wait(gapMs, () => { if (mine === serial && !run(i + 1)) cut(); }); return; }
        serial++; chaining = false; report = null;
        onEnd?.(true);
      });
      if (run(0)) return true;
      cut();
      return false;
    },
    /** A one-shot effect, on its own channel. Refused while the voice is speaking or a sequence runs; a voice that starts after it does not cut it. */
    play(sound: string) {
      const key = `effect:${sound}`;
      if (chaining || speaking || !canPlay() || deps.now() - lastEffect < 90) return false;
      lastEffect = deps.now();
      if (!deps.hasSource(key)) return false;
      still();
      const mine = ++fxToken;
      try {
        const next = deps.start(key, () => { if (mine === fxToken) still(); });
        if (mine === fxToken) fx = next; else next.stop();
        return true;
      } catch { if (mine === fxToken) still(); return false; }
    },
    /** A sequence (gaps included), a single clip or an effect is sounding. */
    busy,
    /** Whether a full key (`voice:…`, `slot:…`, `game:…`, `effect:…`) is recorded. Says nothing about whether sound may play now. */
    has: (key: string) => deps.hasSource(key),
    hush,
    release() { released = true; hush(); },
  };
}
