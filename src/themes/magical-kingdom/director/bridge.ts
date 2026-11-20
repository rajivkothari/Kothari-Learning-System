// The Ice Palace bridge (and the castle's other adventure room) by ear: what the bridge says, and when.
//
// The director (kingdom.ts) keeps the evidence: placing and taking back crystals is never an answer, and
// only MAKE MAGIC submits the count. This file only speaks, through the voice every royal game uses
// (games/flow.ts createGameSpeech), so the bridge follows the same timing rules
// (docs/magical-kingdom/REBUILD_SPEC.md "Voice and timing"): the first ask of a bridge, and the ask after a
// miss, hold the crystals, Help and MAKE MAGIC (`listening`); the ear says the instruction again at any
// time; a reminder says it in the quiet, twice, then the ear glows (`nudge`) until the next touch; in the
// browser an ask that could not play is said at the first touch.
//
// Counting aloud is the learning moment: each crystal placed says its number, and one taken back says the
// count that remains. A number is said only when its clip (`game:count.<n>`) is registered; until then the
// bridge plays its place or remove chime and says nothing (the count is always on screen).
//
// The kingdom's narration is keyed by its words (`voice:<the line>`, audio/sources.ts), so a line can only
// ever play a recording of exactly the words on screen: a line whose wording changed is silent until it is
// recorded again (content/themes/magical-kingdom/recordings-pending.json lists those).
//
// Pure: no React.
import { WORDS as W, line } from '../copy';
import { createGameSpeech, realWait, type GameAudio, type Wait } from '../games/flow';

/** The largest bridge (the bridge activities' capacity is at most 10): the counting words run 0 to this. */
export const MAX_BRIDGE = 10;

/** The audio key of a kingdom narration line: the line's own words. */
export const voiceKey = (text: string) => `voice:${text}`;
/** The audio key of a counting word ("one", "two", ...), registered once it is recorded. */
export const countKey = (n: number) => `game:count.${n}`;

/**
 * The bridge's instruction, in words that are right for the number one: "Place 1 crystal on the bridge.",
 * "1 stone is ready. Add 2 crystals." `target` is the bridge's length, `initial` the stones already lit.
 */
export function bridgeGoal(target: number, initial: number): string {
  const count = target - initial;
  if (initial > 0) return line(initial === 1 ? W.iceRepairOne : W.iceRepair, { count, initial });
  return line(count === 1 ? W.iceInstructionOne : W.iceInstruction, { count });
}

export interface AdventureVoiceView {
  /** The room is saying the ask: crystals (or letters), Help and MAKE MAGIC wait; the ear works. */
  listening: boolean;
  /** The reminders are used up: the ear glows slowly until the next touch. */
  nudge: boolean;
}

export interface AdventureVoice {
  view(): AdventureVoiceView;
  subscribe(fn: () => void): () => void;
  /**
   * The first ask of an item (`key` names it, the activity's item signature): `lines` are said with the
   * choices held, and `lines.at(-1)` becomes the instruction the ear and the reminders say.
   */
  ask(key: string, lines: readonly string[]): void;
  /** After a miss: "try again" and the instruction, held like a first ask. */
  retry(lines: readonly string[]): void;
  /** The ear: the instruction again. While the ask is still being said it starts again and keeps the hold. */
  hear(): void;
  /** Any other line (help, success): not held. */
  say(lines: readonly string[]): void;
  /** A crystal went onto the bridge: `count` crystals are placed now. */
  placed(count: number): void;
  /** A crystal came back: `count` are left. */
  removed(count: number): void;
  /** A chime for a touch that says nothing itself (a letter planted, taken back). */
  chime(name: 'place' | 'remove'): void;
  /** The child touched something that says nothing (Help, MAKE MAGIC before its answer): the reminders start over. */
  touch(): void;
  dispose(): void;
}

/**
 * The adventure room's voice. `open()` says whether a question is open (reminders only then: not while
 * solved, busy or behind a dialog).
 */
export function createAdventureVoice(opts: { audio: GameAudio; open: () => boolean; wait?: Wait }): AdventureVoice {
  const { audio } = opts;
  const wait = opts.wait ?? realWait;
  const listeners = new Set<() => void>();
  let v: AdventureVoiceView = { listening: false, nudge: false };
  let disposed = false;
  let item: string | null = null;
  let instruction: string | null = null;
  const set = (patch: Partial<AdventureVoiceView>) => {
    if (Object.entries(patch).every(([k, x]) => v[k as keyof AdventureVoiceView] === x)) return;
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  const speech = createGameSpeech(audio, wait, {
    open: () => instruction !== null && opts.open(),
    remind: () => {
      if (instruction) speech.speak([voiceKey(instruction)]);
    },
    listening: (held) => set({ listening: held }),
    nudge: (on) => set({ nudge: on }),
  });
  const keys = (lines: readonly string[]) => lines.map(voiceKey);
  /** Say a counting word if it is recorded, else only the chime: the count is on screen either way. */
  const count = (n: number, chime: 'place' | 'remove') => {
    if (n >= 0 && n <= MAX_BRIDGE && audio.has(countKey(n))) {
      speech.touching();
      speech.speak([`effect:${chime}`, countKey(n)], { gapMs: 60 });
    } else {
      speech.touch();
      audio.effect(chime);
    }
  };
  return {
    view: () => v,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ask(key, lines) {
      if (disposed || !lines.length) return;
      item = key;
      instruction = lines.at(-1)!;
      speech.first(
        () => speech.speak(keys(lines), { hold: true }),
        () => item === key,
      );
    },
    retry(lines) {
      if (disposed || !lines.length) return;
      instruction = lines.at(-1)!;
      speech.speak(keys(lines), { hold: true });
    },
    hear() {
      if (disposed || !instruction) return;
      speech.touching();
      speech.speak([voiceKey(instruction)], { hold: v.listening });
    },
    say(lines) {
      if (disposed || !lines.length) return;
      speech.touching();
      speech.speak(keys(lines));
    },
    placed: (n) => count(n, 'place'),
    removed: (n) => count(n, 'remove'),
    chime(name) {
      speech.touch();
      audio.effect(name);
    },
    touch: () => speech.touch(),
    dispose() {
      if (disposed) return;
      disposed = true;
      speech.dispose();
      listeners.clear();
    },
  };
}
