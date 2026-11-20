/** One local voice/effect at a time. Requests never wait for the gesture gate. */
export interface PlayingClip { stop(): void }
export interface PlaybackDependencies {
  isOpen(): boolean;
  hasSource(key: string): boolean;
  start(key: string, finished: () => void): PlayingClip;
  now(): number;
  /** Timer for the gap between chained clips (default setTimeout). */
  wait?(ms: number, fn: () => void): void;
}
export function createKingdomPlayback(deps: PlaybackDependencies) {
  let enabled = false, released = false;
  /** Bumps on every request and every cut: a gap timer of an older request does nothing. */
  let serial = 0;
  /** Bumps for every clip: a late or repeated finish of an older clip does nothing. */
  let token = 0;
  let clip: PlayingClip | null = null;
  let speaking = false, lastEffect = -Infinity;
  /** A sequence is running, gaps included; `report` is its end report, owed exactly once. */
  let chaining = false;
  let report: ((finished: boolean) => void) | null = null;
  const wait = deps.wait ?? ((ms: number, fn: () => void) => { setTimeout(fn, ms); });
  const canPlay = () => !released && enabled && deps.isOpen();
  const busy = () => chaining || clip !== null;

  /** Stop the clip that is sounding. Does not end a sequence. */
  const silence = () => { token++; speaking = false; const old = clip; clip = null; try { old?.stop(); } catch { /* Optional audio never interrupts play. */ } };
  /** Cut everything. A running sequence reports that it did not finish. */
  const hush = () => {
    serial++; silence();
    const cut = report; report = null; chaining = false;
    cut?.(false);
  };
  /** Hush until nothing sounds: an end report may itself ask for something, which must not overlap what comes next. */
  const clear = () => { hush(); for (let n = 0; n < 3 && busy(); n++) hush(); return !busy(); };
  /** Start one clip. `then` runs once, when it finishes by itself. */
  const begin = (key: string, voice: boolean, then: () => void) => {
    const mine = ++token; speaking = voice;
    try {
      const next = deps.start(key, () => { if (mine !== token) return; silence(); then(); });
      if (mine === token) clip = next; else next.stop();
      return true;
    } catch { if (mine === token) silence(); return false; }
  };
  const single = (key: string, voice: boolean) => (clear() && canPlay() && deps.hasSource(key) ? begin(key, voice, () => undefined) : false);

  return {
    setEnabled(value: boolean) { enabled = value; if (!value) hush(); },
    speak(text: string) { return single(`voice:${text}`, true); },
    /** A Word Garden slot (sound, word, line). Unrecorded slots are silent. */
    slot(key: string) { return single(`slot:${key}`, true); },
    /**
     * Full keys (`voice:…`, `slot:…`, `game:…`, `effect:…`) one after another, `gapMs` apart. Unrecorded
     * keys are skipped. `onEnd` is called exactly once: true when the last clip finished by itself; false
     * when the sequence was cut (a new request, hush, mute, release, a clip that would not start), and
     * false at once, before this returns false, when nothing could play (nothing recorded, the gesture
     * gate closed, sound off). Effects (`play`) are refused while a sequence runs, gaps included.
     */
    sequence(keys: readonly string[], gapMs = 250, onEnd?: (finished: boolean) => void) {
      const list = keys.filter((k) => deps.hasSource(k));
      if (!clear() || !list.length || !canPlay()) { onEnd?.(false); return false; }
      const mine = serial;
      chaining = true; report = onEnd ?? null;
      const run = (i: number): boolean => begin(list[i]!, !list[i]!.startsWith('effect:'), () => {
        if (mine !== serial) return;
        if (i + 1 < list.length) { wait(gapMs, () => { if (mine === serial && !run(i + 1)) hush(); }); return; }
        serial++; chaining = false; report = null;
        onEnd?.(true);
      });
      if (run(0)) return true;
      hush();
      return false;
    },
    play(sound: string) {
      if (chaining || speaking || !canPlay() || deps.now() - lastEffect < 90) return false;
      lastEffect = deps.now(); return single(`effect:${sound}`, false);
    },
    /** A sequence (gaps included) or a single clip is running. */
    busy,
    /** Whether a full key (`voice:…`, `slot:…`, `game:…`, `effect:…`) is recorded. Says nothing about whether sound may play now. */
    has: (key: string) => deps.hasSource(key),
    hush,
    release() { released = true; hush(); },
  };
}
