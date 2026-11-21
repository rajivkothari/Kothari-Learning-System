// Ice Bowling and Garden Golf: one flow for both, and the voice every royal game speaks through.
//
// A turn asks for a pictured, spoken word's first letter; the letters stand on pins or flags. A right
// letter lets the child roll or putt the ball (play.ts); the ball is the reward, never evidence.
//
// Only a tapped letter is an answer: the runtime records it and says right or wrong. Help is the
// activity's policy (clue, guided, then SHOW ME after two misses) and the runtime assigns the
// assistance. Hearing the word again, reminders, rolling the ball, NEXT, PLAY AGAIN and taps while the
// game is talking record nothing.
//
// Timing is the part a child playtest forced (docs/magical-kingdom/REBUILD_SPEC.md "Voice and timing"):
// the letters and Help are held while the first ask of a word, or the ask after a miss, is being said;
// a reminder comes only in the quiet; and a game that closes hushes only its own speech.
//
// Pure: no React. The screen renders view() and calls the actions; tests drive it over a real runtime.
import type { MissionView } from '../../../engine';
import type { GameRuntime } from '../../../runtime/gameRuntime';
import { GAMES, turnsOf, voices, type GameId, type LineKey } from './content';
import { bowl, putt, spots } from './play';

/** The quiet before a reminder, and how many reminders one stretch of quiet gets. */
export const REMIND_MS = 12_000;
export const MAX_REMINDERS = 2;
/** No clip sequence is trusted to hold the game longer than this, whatever the player reports. */
export const SPEECH_CAP_MS = 30_000;
/** A clip still sounding at the cap gets this much longer; then it has stalled: it is hushed, and the game goes on to its reminders. */
export const STALL_MS = 10_000;
/**
 * Gaps: between clips, between a story's sentences, and in help. A story's sentences were 750 ms apart;
 * with each clip's own 150 ms tail and the Comfort pace that was close to a second of nothing, four
 * times in a telling, while every control is held. 450 ms still reads as a new sentence.
 */
export const GAP_MS = 400;
export const STORY_GAP_MS = 450;
export const HELP_GAP_MS = 450;
/**
 * Help is held while the rung it just gave is being said, and for at least this long after the press:
 * a double tap is one press, and a rung whose speech cannot sound (sound off, nothing recorded) still
 * holds Help this long and no longer.
 */
export const HELP_GUARD_MS = 1000;
/**
 * After the screen changes under the child's finger (a right answer brings the ball or Next, Next brings
 * a new question with Help where Next stood, the end brings Play again), what just appeared does not
 * take a press for this long. A small child's double tap is 100 to 500 ms apart: its second tap must not
 * roll the ball, skip the celebration or ask for help nobody wanted.
 */
export const STAGE_GUARD_MS = 800;
/** How long the ball takes to reach the pins or the hole before the game cheers. */
export const ROLL_MS = 600;

/** A timer: runs `fn` after `ms`, and returns its cancel. */
export type Wait = (ms: number, fn: () => void) => () => void;
export const realWait: Wait = (ms, fn) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** What a royal game needs from the kingdom's audio (audio/playback.ts through audio/recorded.ts). */
export interface GameAudio {
  /**
   * Play full keys (`voice:…`, `slot:…`, `game:…`, `effect:…`) one after another; unrecorded keys are
   * skipped; a new call replaces what is playing. `onEnd` is called exactly once: true when the last
   * clip finished by itself, false when cut, and false before `say` returns when nothing could play.
   */
  say(keys: readonly string[], gapMs?: number, onEnd?: (finished: boolean) => void): void;
  /** A short effect. Refused while speech is playing. */
  effect(name: 'place' | 'remove' | 'success' | 'retry' | 'gift'): void;
  hush(): void;
  /** Whether anything is sounding now (this game's speech or anyone else's). */
  busy?(): boolean;
  /**
   * Whether a key is recorded (it says nothing about whether sound may play now). The games pick a whole
   * recorded sentence over a stitched one with it, and count a line as heard only if it has a recording.
   */
  has(key: string): boolean;
  /**
   * When sound cannot play now (the browser waits for a first touch, Sound is off in Comfort, the app is
   * behind another), run `fn` once when it can. Returns a cancel.
   */
  whenReady?(fn: () => void): (() => void) | void;
  /**
   * Whether sound can play now: switched on, the app in front, the browser's first touch given. It says
   * nothing about what is recorded. Absent: not known, and taken as yes.
   */
  canSound?(): boolean;
}

/** What the kingdom's audio (audio/recorded.ts createKingdomAudio) offers; gameAudioFrom turns it into a GameAudio. */
export interface KingdomAudioLike {
  sequence(keys: readonly string[], gapMs?: number, onEnd?: (finished: boolean) => void): boolean;
  play(sound: string): boolean;
  hush(): void;
  busy(): boolean;
  has(key: string): boolean;
  whenReady?(fn: () => void): () => void;
  canSound?(): boolean;
}

/** The royal games' audio over the kingdom's: what a screen passes to createLetterGameFlow or createChoiceFlow. */
export function gameAudioFrom(a: KingdomAudioLike): GameAudio {
  const audio: GameAudio = {
    say: (keys, gapMs, onEnd) => {
      a.sequence(keys, gapMs, onEnd);
    },
    effect: (name) => {
      a.play(name);
    },
    hush: () => a.hush(),
    busy: () => a.busy(),
    has: (key) => a.has(key),
  };
  if (a.whenReady) audio.whenReady = (fn) => a.whenReady!(fn);
  if (a.canSound) audio.canSound = () => a.canSound!();
  return audio;
}

export interface SayOptions {
  gapMs?: number;
  hold?: boolean;
  help?: boolean;
  onEnd?: (finished: boolean) => void;
}

/** One part of a telling: its own clip sequence, held or not, with a word when it begins and ends. */
export interface SayPart {
  keys: readonly string[];
  /** The choices and Help are held while this part is said (and through the gap before it). */
  hold?: boolean;
  /** This part is about to be said. */
  begin?: () => void;
  /** This part ended: true only when its last clip finished by itself. Not called when a newer say took over. */
  end?: (finished: boolean) => void;
}

export interface GameVoice {
  /**
   * Say parts one after another, `gapMs` apart, as one say: a newer say takes over all of it. Each part
   * holds or not by itself, so what must be heard can hold the choices and a tail after it can leave
   * them live (a tap then takes over, and the tail's `end` is never told it finished). A part that does
   * not finish (cut, refused, nothing recorded) ends the whole telling there. `help` and `onEnd` are as
   * in `say`; `onEnd(true)` means every part finished. Returns false when the first part could not start.
   */
  tell(parts: readonly SayPart[], opts?: Omit<SayOptions, 'hold'>): boolean;
  /**
   * Say keys. A newer say takes over. `hold` keeps the choices and Help held until this say settles;
   * `help` keeps Help alone held until it settles (the rung of help being said). `onEnd(finished)` is
   * told how it settled unless a newer say took over first. Returns false when the say could not start
   * at all.
   */
  say(keys: readonly string[], opts?: SayOptions): boolean;
  /** This voice's own speech is sounding (as far as its end reports say). */
  speaking(): boolean;
  /** Hush this voice's own speech, and only that: someone else's clip is left alone. */
  stop(): void;
  dispose(): void;
}

/**
 * The voice of one game. Each say gets a serial, so a newer say takes over and the older one's end
 * report is ignored. A say settles on its end report, at once if it did not start, or at the cap.
 * Settling releases the hold and reports the quiet (which arms the reminder); a cap that fires while
 * audio is still sounding releases the hold but leaves the quiet to the real end, or to STALL_MS later
 * if no end ever comes (the clip is hushed then). A telling in parts
 * (`tell`) is one say; each part is capped by itself, and after a cap nothing more of it holds.
 */
export function createGameVoice(audio: GameAudio, wait: Wait, on: { hold(held: boolean): void; help?(held: boolean): void; quiet(): void }): GameVoice {
  let serial = 0;
  let live = false;
  let held = false;
  let helping = false;
  let disposed = false;
  /** The timer of the say in charge: the cap on the part sounding, or the gap before the next part. */
  let uncap: (() => void) | null = null;
  const hold = (value: boolean, help = false) => {
    if (held !== value) {
      held = value;
      on.hold(value);
    }
    if (helping !== help) {
      helping = help;
      on.help?.(help);
    }
  };
  const clearCap = () => {
    uncap?.();
    uncap = null;
  };
  const stop = () => {
    clearCap();
    hold(false);
    if (!live) return;
    serial++;
    live = false;
    audio.hush();
  };
  const tell: GameVoice['tell'] = (parts, opts = {}) => {
    if (disposed) return false;
    const mine = ++serial;
    clearCap();
    live = true;
    const gap = opts.gapMs ?? GAP_MS;
    const help = opts.help === true;
    let started = true;
    /** The cap has fired on a part of this telling: nothing after it holds. */
    let capped = false;
    const mayHold = (part: SayPart | undefined) => part?.hold === true && !capped;
    const finish = (finished: boolean) => {
      live = false;
      clearCap();
      hold(false);
      opts.onEnd?.(finished);
      // onEnd may have said something new: then that say reports the quiet.
      if (mine === serial && !disposed) on.quiet();
    };
    const run = (i: number) => {
      const part = parts[i];
      if (!part) {
        finish(i > 0);
        return;
      }
      hold(mayHold(part), help);
      part.begin?.();
      if (mine !== serial || disposed) return;
      let settled = false;
      let returned = false;
      const settle = (finished: boolean) => {
        if (settled || mine !== serial || disposed) return;
        settled = true;
        clearCap();
        if (!returned && i === 0) started = false;
        part.end?.(finished);
        // The part's end may have said something new: that say owns the voice now.
        if (mine !== serial || disposed) return;
        const next = parts[i + 1];
        if (!finished || !next) {
          finish(finished);
          return;
        }
        // The gap belongs to what comes next: held only if that is.
        hold(mayHold(next), help);
        uncap = wait(gap, () => {
          uncap = null;
          if (mine !== serial || disposed) return;
          // Someone else began to speak in the gap: this telling ends here.
          if (audio.busy?.()) finish(false);
          else run(i + 1);
        });
      };
      audio.say(part.keys, gap, settle);
      returned = true;
      if (!settled && mine === serial) {
        uncap = wait(SPEECH_CAP_MS, () => {
          uncap = null;
          if (settled || mine !== serial || disposed) return;
          capped = true;
          hold(false);
          // Not sounding: the report was lost, and this is the end.
          if (!audio.busy?.()) {
            settle(false);
            return;
          }
          // Still sounding: the real end settles it. A player that stays busy and never reports has
          // stalled: after a little longer it is hushed, so the game is not left without its reminders.
          uncap = wait(STALL_MS, () => {
            uncap = null;
            if (settled || mine !== serial || disposed) return;
            audio.hush();
            settle(false);
          });
        });
      }
    };
    run(0);
    return started;
  };
  return {
    tell,
    say: (keys, opts = {}) => tell([{ keys, hold: opts.hold }], opts),
    speaking: () => live,
    stop,
    dispose() {
      stop();
      disposed = true;
    },
  };
}

export interface GameIdle {
  /** The voice went quiet: wait, then remind; after the last reminder, nudge. */
  quiet(): void;
  /** The voice is about to speak: no reminder over it. */
  pause(): void;
  /** The child touched something: the count starts over and the nudge goes. `speaking`: the voice is talking now. */
  touch(speaking: boolean): void;
  stop(): void;
}

/**
 * Reminders in the quiet. `open()` says whether a question is open; `remind()` says the short ask
 * (through the game's voice, which reports the next quiet), or returns false when it could not be said
 * because sound cannot play (then it is not counted); `nudge(on)` shows the ear's slow glow once the
 * reminders are used up, until the next touch. A reminder never starts while anything is sounding.
 */
export function createGameIdle(audio: GameAudio, wait: Wait, on: { open(): boolean; remind(): boolean | void; nudge(on: boolean): void }): GameIdle {
  let count = 0;
  let cancel: (() => void) | null = null;
  const clear = () => {
    cancel?.();
    cancel = null;
  };
  const arm = () => {
    clear();
    if (!on.open()) return;
    if (count >= MAX_REMINDERS) {
      on.nudge(true);
      return;
    }
    cancel = wait(REMIND_MS, () => {
      cancel = null;
      if (!on.open()) return;
      if (audio.busy?.()) {
        arm();
        return;
      }
      count++;
      // A reminder that was not said because sound cannot play is not one of the two.
      if (on.remind() === false) count--;
    });
  };
  return {
    quiet: arm,
    pause: clear,
    touch(speaking) {
      clear();
      count = 0;
      on.nudge(false);
      if (!speaking) arm();
    },
    stop: clear,
  };
}

export interface GameSpeech {
  /** Say keys through the game's voice (see GameVoice.say). No reminder talks over it. */
  speak(keys: readonly string[], opts?: SayOptions): boolean;
  /** Say parts through the game's voice (see GameVoice.tell). No reminder talks over it. */
  tell(parts: readonly SayPart[], opts?: Omit<SayOptions, 'hold'>): boolean;
  /**
   * The first ask of an item: `say` says it (holding the choices) and returns whether it started. In
   * the browser, an ask that could not play is said at the first touch, if `still()` says the same item
   * is still open. It is tried once then, never in a loop.
   */
  first(say: () => boolean, still: () => boolean): void;
  /**
   * A game played by ear only (`byEar`): true when sound cannot play now and a question is open. Then
   * the ask is owed: the choices stay held, no reminder is spent, and the ask is said (held) when sound
   * can play. The flow asks before it takes an answer or gives help, so nothing is recorded for a
   * question that could not be heard. Always false for other games, and when the audio cannot tell.
   */
  deaf(): boolean;
  /** The child touched something that says nothing itself: the reminders start over, the nudge goes. */
  touch(): void;
  /** The child touched something that is about to speak. */
  touching(): void;
  /** Hush this game's own speech. */
  stop(): void;
  dispose(): void;
}

/**
 * A game's voice with its reminders and the browser's first-touch wait, wired together: what both the
 * letter games and the picture games speak through. `open()` says whether a question is open (reminders
 * only then); `remind()` says the short ask; `listening`, `helping` and `nudge` go to the view.
 * `helping(held)`: Help is held, while a say asked for with `help` is sounding and for HELP_GUARD_MS
 * after it began, whichever ends later. One press of Help gives one rung.
 */
export function createGameSpeech(audio: GameAudio, wait: Wait, on: {
  open(): boolean;
  remind(): void;
  listening(held: boolean): void;
  helping?(held: boolean): void;
  nudge(on: boolean): void;
  /**
   * The game's content is sound (a word to hear, a rhyme, a told story): it cannot be played while sound
   * cannot play. An ask that could not sound, or was cut because sound went away, stays owed and held
   * until sound can play (see `deaf`). Without it (the Word Garden, the ice bridge: playable from the
   * screen alone) nothing is held for sound, and an ask the browser could not play is said at the first touch.
   */
  byEar?: boolean;
}): GameSpeech {
  let disposed = false;
  /** The ask of the item on screen: how to say it, and whether its item is still open. */
  let asker: { say: () => boolean; still: () => boolean } | null = null;
  let unready: (() => void) | null = null;
  /** The voice holds the choices (it is saying what must be heard), or the ask is owed and waits for sound. */
  let voiceHold = false;
  let waiting = false;
  let held = false;
  const listening = () => {
    const value = voiceHold || waiting;
    if (value === held) return;
    held = value;
    on.listening(value);
  };
  /** Help's hold: the rung's speech is sounding, or the guard after the press is still running. */
  let rung = false;
  let unguard: (() => void) | null = null;
  let helpHeld = false;
  const helping = () => {
    const value = !disposed && (rung || unguard !== null);
    if (value === helpHeld) return;
    helpHeld = value;
    on.helping?.(value);
  };
  /** Sound can play (again): say the ask that is owed, if its item is still open. */
  const ready = () => {
    unready = null;
    waiting = false;
    const a = asker;
    if (!disposed && a && a.still()) {
      idle.touch(true);
      a.say();
    }
    listening();
  };
  const deaf = (): boolean => {
    if (!on.byEar || disposed) return false;
    if (waiting) return true;
    if (!audio.whenReady || audio.canSound?.() !== false || !on.open()) return false;
    const cancel = audio.whenReady(ready);
    if (!cancel) return false;
    unready?.();
    unready = cancel;
    waiting = true;
    idle.pause();
    listening();
    return true;
  };
  const idle = createGameIdle(audio, wait, { open: () => !disposed && !waiting && on.open(), remind: () => (deaf() ? false : on.remind()), nudge: on.nudge });
  const talk = createGameVoice(audio, wait, {
    hold: (value) => {
      voiceHold = value;
      listening();
    },
    help: (value) => {
      rung = value;
      if (value) {
        unguard?.();
        unguard = wait(HELP_GUARD_MS, () => {
          unguard = null;
          helping();
        });
      }
      helping();
    },
    quiet: () => idle.quiet(),
  });
  const tell: GameSpeech['tell'] = (parts, opts = {}) => {
    idle.pause();
    const started = talk.tell(parts, {
      ...opts,
      onEnd: (finished) => {
        opts.onEnd?.(finished);
        // It ended without playing out and nothing newer took over: if that is because sound cannot play, the ask is owed.
        if (!finished) deaf();
      },
    });
    // Something was said: the ask is no longer waiting for sound.
    if (started && unready) {
      unready();
      unready = null;
      waiting = false;
      listening();
    }
    return started;
  };
  const speak: GameSpeech['speak'] = (keys, opts = {}) => tell([{ keys, hold: opts.hold }], opts);
  return {
    speak,
    tell,
    first(say, still) {
      asker = { say, still };
      if (say() || !audio.whenReady) return;
      // By ear: the end report has already asked whether sound can play, and holds the ask if it cannot.
      if (on.byEar && audio.canSound) return;
      unready?.();
      const cancel = audio.whenReady(() => {
        unready = null;
        if (disposed || !still()) return;
        idle.touch(true);
        say();
      });
      unready = cancel ?? null;
    },
    deaf,
    touch: () => idle.touch(talk.speaking()),
    touching: () => idle.touch(true),
    stop: () => talk.stop(),
    dispose() {
      disposed = true;
      idle.stop();
      unguard?.();
      unguard = null;
      unready?.();
      unready = null;
      waiting = false;
      // Only this game's own speech: the castle may be saying something as the game closes.
      talk.dispose();
      listening();
    },
  };
}

export type GameStage = 'loading' | 'ask' | 'play' | 'cleared' | 'done' | 'failed';

export interface GameOption {
  id: string;
  letter: string;
}

export interface GameRoll {
  /** Counts the turn's rolls from 1: the screen animates each one once. */
  n: number;
  /** Where the child aimed, and where the ball crosses the pins or stops (-1 left edge, 1 right edge). */
  aim: number;
  x: number;
  /** bowling: pins this ball knocked down (indexes). */
  hit: number[];
  /** bowling: every pin is down. golf: the ball dropped. */
  cleared: boolean;
}

export interface GameView {
  game: GameId;
  stage: GameStage;
  /** 1-based turn and how many there are. */
  turn: number;
  turns: number;
  /**
   * The word of this turn (its picture is `game-picture-<word>`), or null when it is not known (loading,
   * done, a celebration resumed without its play save). Print it only when the stage is `play` or
   * `cleared`: no word is printed while its question is open.
   */
  word: string | null;
  /** The letters on the pins or flags, in lane order: option i stands at spots(options.length)[i]. */
  options: GameOption[];
  /** Options already tried wrong on this word: greyed, never sent twice. */
  tried: string[];
  /** The game is saying the ask: the letters and Help are held (they show their press and do nothing). The ear works. */
  listening: boolean;
  /** The reminders are used up: the ear glows slowly until the next touch. */
  nudge: boolean;
  /** Help is held: the rung it just gave is being said (or HELP_GUARD_MS has not passed). It shows its press and does nothing: one press, one rung. */
  helping: boolean;
  /** The stage has just changed (STAGE_GUARD_MS): the ball, Next, Help and Play again show a press and do nothing, so a double tap is one tap. */
  settling: boolean;
  /** Help shown on this word, newest last (policy kinds: highlightGiven, guidedSteps, showAnswer). */
  help: string[];
  /** The next help the policy offers, or null (SHOW ME waits for two misses). */
  nextHelp: { kind: string; demonstrated: boolean } | null;
  /** SHOW ME: the option to tap. Only it can be chosen. */
  shown: string | null;
  /** Guided help: the word's first letter, shown beside the picture. */
  hint: string | null;
  /** play, cleared: the index of the shining pin or flag (the letter the child found). */
  target: number | null;
  /** bowling: indexes of fallen pins. A fallen pin shows no letter. */
  down: number[];
  /** Rolls or putts a turn allows, and how many are used. */
  tries: number;
  used: number;
  /** The last roll or putt of this turn. */
  roll: GameRoll | null;
  /** The line to print (content.shownLine(line, { word }) keeps the word out of an open question). */
  line: LineKey;
  /** Bumps when the last answer was wrong: the screen shakes the pin or flag. */
  miss: number;
  busy: boolean;
}

/** The view before a flow has started (and what a screen can render while there is no flow yet). */
export const idleGameView = (game: GameId): GameView => ({
  game, stage: 'loading', turn: 1, turns: turnsOf(game).length, word: null, options: [], tried: [], listening: false, nudge: false, helping: false, settling: false, help: [], nextHelp: null, shown: null, hint: null,
  target: null, down: [], tries: GAMES.games[game].tries, used: 0, roll: null, line: 'ask', miss: 0, busy: false,
});

interface PlaySave {
  v: 1;
  instance: string;
  /** The item's signature while its question is open; the celebration's step id afterwards. */
  key: string;
  tried: string[];
  word: string | null;
  options: GameOption[];
  target: number | null;
  down: number[];
  used: number;
  cleared: boolean;
  /** The game was finished and its end is on screen: an app restart there comes back to the end, not to a new game. */
  ended?: boolean;
}

export interface LetterGameFlow {
  view(): GameView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  /** The ear, or the picture: say this stage's line again. Free, and it works while the game is talking. */
  hear(): void;
  /** ask: the tapped pin or flag is the answer. Does nothing while the game is talking. */
  choose(optionId: string): Promise<void>;
  /** ask: the next help of the ladder. Does nothing while the game is talking, or while the rung it just gave is being said. */
  help(): Promise<void>;
  /** play: roll or putt toward `aim` across the lane (-1 left edge, 1 right edge). */
  roll(aim: number): void;
  /** play: roll or putt at pin or flag `index`. */
  rollAt(index: number): void;
  /** cleared: on to the next turn, or the end. */
  next(): Promise<void>;
  /** done: a new game. */
  again(): Promise<void>;
  /** Save the play state now (app to background). */
  flush(): Promise<void>;
  /** The child is leaving for the games room: save, and forget a finished game's end screen, so the card starts a new game. */
  leave(): Promise<void>;
  dispose(): void;
}

const HELP_LINE: Record<string, LineKey> = { highlightGiven: 'clue', guidedSteps: 'guided', showAnswer: 'shown' };

export function createLetterGameFlow(opts: {
  runtime: GameRuntime;
  learnerId: string;
  game: GameId;
  now: () => number;
  audio: GameAudio;
  wait?: Wait;
  /** The guard after a stage change (default STAGE_GUARD_MS; 0 for none). */
  guardMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
}): LetterGameFlow {
  const { runtime, learnerId, game, now, audio } = opts;
  const wait = opts.wait ?? realWait;
  const guardMs = opts.guardMs ?? STAGE_GUARD_MS;
  const log = opts.log ?? (() => undefined);
  const copy = GAMES.games[game];
  const SAVE_KEY = `kingdom.play.${game}`;
  const listeners = new Set<() => void>();
  let instance: string | null = null;
  let mission: MissionView | null = null;
  let revision = 0;
  let disposed = false;
  let saving: Promise<void> = Promise.resolve();
  let uncheer: (() => void) | null = null;
  let unsettle: (() => void) | null = null;
  /** The finished instance whose end screen was come back to after a restart (no mission is open then). */
  let ended: string | null = null;
  let v: GameView = idleGameView(game);
  const set = (patch: Partial<GameView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  /** The stage has just changed under the child's finger: what appeared takes no press for the guard. */
  const settle = () => {
    unsettle?.();
    unsettle = null;
    if (!(guardMs > 0) || disposed) return;
    set({ settling: true });
    unsettle = wait(guardMs, () => {
      unsettle = null;
      set({ settling: false });
    });
  };
  const command = (kind: string) => ({ commandId: `${instance}:game:r${revision}:${kind}`, basedOn: revision });

  /** The clip that says a line: this game's own when it is registered, else the shared one. */
  const voice = (key: LineKey, vars: Record<string, string | number> = {}): string => {
    const list = voices(key, vars, game);
    return list.find((k) => audio.has(k)) ?? list.at(-1)!;
  };
  const askKeys = () => (v.word ? [voice('ask', { word: v.word })] : []);
  const speech = createGameSpeech(audio, wait, {
    open: () => v.stage === 'ask',
    remind: () => speak(askKeys()),
    listening: (held) => set({ listening: held }),
    helping: (held) => set({ helping: held }),
    // The word is only said, never printed: with no sound there is nothing to answer.
    byEar: true,
    nudge: (on) => {
      if (v.nudge !== on) set({ nudge: on });
    },
  });
  const { speak, touch } = speech;
  /** The first ask of a word holds the letters. In the browser, an ask that could not play is said at the first touch. */
  const ask = () => {
    const key = mission?.activity?.itemSignature;
    speech.first(
      () => speak(askKeys(), { hold: true }),
      () => v.stage === 'ask' && mission?.activity?.itemSignature === key,
    );
  };

  const turnOf = (m: MissionView) => Math.min(v.turns, Math.floor((m.step?.index ?? 0) / 2) + 1);
  const helpOf = (m: MissionView, word: string | null): Pick<GameView, 'help' | 'nextHelp' | 'shown' | 'hint'> => {
    const s = m.activity?.scaffolds;
    const next = s?.available[0];
    const help = s?.shown.map((x) => x.kind) ?? [];
    return {
      help,
      nextHelp: next ? { kind: next.kind, demonstrated: next.assistance === 'demonstrated' } : null,
      shown: s?.shown.some((x) => x.assistance === 'demonstrated') ? s.revealedOptionId ?? null : null,
      // Guided help shows the letter the word begins with. This is help, never a check of an answer.
      hint: help.includes('guidedSteps') && word ? word[0]! : null,
    };
  };

  const persist = () => {
    if (!instance || disposed) return saving;
    const key = mission?.activity?.itemSignature ?? mission?.narrative?.stepId ?? '';
    const data: PlaySave = { v: 1, instance, key, tried: v.tried, word: v.word, options: v.options, target: v.target, down: v.down, used: v.used, cleared: v.stage === 'cleared', ended: v.stage === 'done' };
    const text = JSON.stringify(data);
    // A play save is a convenience (the answers are safe in the runtime): never block play on it.
    saving = saving.then(() => runtime.putSetting(learnerId, SAVE_KEY, text)).catch((e: unknown) => log('game.saveFailed', { message: String(e) }));
    return saving;
  };

  /** A turn's play state, cleared. `listening` is not here: only the voice holds and releases. */
  const blank = { tried: [], help: [], nextHelp: null, shown: null, hint: null, target: null, down: [], used: 0, roll: null } satisfies Partial<GameView>;

  /** Show what the mission is at now, with the play save of the same instance when there is one. */
  const show = (m: MissionView, saved: PlaySave | null = null) => {
    mission = m;
    if (m.status === 'completed') {
      set({ ...blank, stage: 'done', turn: v.turns, word: null, options: [], line: 'done' });
      return;
    }
    if (m.narrative) {
      // The celebration of a right letter: the ball. Its word and letters live in the play save only.
      const same = saved && saved.key === m.narrative.stepId && typeof saved.word === 'string' && Number.isInteger(saved.target) && saved.options[saved.target!] !== undefined;
      if (!same) {
        set({ ...blank, stage: 'cleared', turn: turnOf(m), word: null, options: [], line: 'cleared' });
        return;
      }
      const used = Math.max(0, Math.min(copy.tries, Math.trunc(saved.used) || 0));
      const down = [...new Set(saved.down)].filter((i) => Number.isInteger(i) && i >= 0 && i < saved.options.length);
      const cleared = saved.cleared || used >= copy.tries;
      set({ ...blank, stage: cleared ? 'cleared' : 'play', turn: turnOf(m), word: saved.word, options: saved.options, target: saved.target, down: cleared && game === 'bowling' ? saved.options.map((_, i) => i) : down, used, line: cleared ? 'cleared' : 'play' });
      return;
    }
    const a = m.activity;
    const word = typeof a?.prompt.word === 'string' ? a.prompt.word : null;
    if (!a || !word) {
      log('game.unsupported', { activityId: a?.activityId ?? null });
      set({ stage: 'failed' });
      return;
    }
    const options = a.options.map((o) => ({ id: o.id, letter: String(o.value) }));
    const tried = saved && saved.key === a.itemSignature ? saved.tried.filter((id) => options.some((o) => o.id === id)).slice(0, a.wrongTries) : [];
    set({ ...blank, stage: 'ask', turn: turnOf(m), word, options, tried, line: 'ask', ...helpOf(m, word) });
  };

  /** After show(): say what the stage it landed on needs said. */
  const announce = () => {
    if (v.stage === 'ask') ask();
    else if (v.stage === 'play') speak([voice('play')]);
    else if (v.stage === 'done') speak([voice('done')]);
  };

  async function guard(task: () => Promise<void>) {
    if (v.busy || disposed) return;
    set({ busy: true });
    try {
      await task();
    } catch (e) {
      log('game.failed', { message: String(e) });
      speech.stop();
      set({ stage: 'failed' });
    } finally {
      set({ busy: false });
    }
  }

  /** The play save as stored, or null when it cannot be read. */
  const readSave = async (): Promise<PlaySave | null> => {
    try {
      const raw = JSON.parse((await runtime.settings(learnerId))[SAVE_KEY] ?? 'null') as PlaySave | null;
      const letters = (x: unknown): x is GameOption[] => Array.isArray(x) && x.every((o: Partial<GameOption> | null) => typeof o?.id === 'string' && typeof o.letter === 'string');
      return raw?.v === 1 && typeof raw.instance === 'string' && Array.isArray(raw.tried) && Array.isArray(raw.down) && letters(raw.options) ? raw : null;
    } catch {
      // An unreadable play save starts the word afresh; the answers are in the runtime.
      return null;
    }
  };

  /** Open the game's mission: the active one, or a new one. Says where it is. */
  const open = async (fresh: boolean) => {
    if (!(await runtime.getLearner(learnerId))) throw new Error(`no learner ${learnerId}`);
    let id = fresh ? null : await runtime.findActiveMission(learnerId, copy.mission);
    if (id && !(await runtime.missionCompatibility(id)).ok) {
      await runtime.abandonMission(id, { commandId: `${id}:incompatible` });
      id = null;
    }
    const stored = await readSave();
    if (!id && !fresh && stored?.ended) {
      // The app was restarted on the end screen of a finished game: come back to it, not to a new game.
      const latest = await runtime.latestMission(learnerId, copy.mission);
      if (latest?.id === stored.instance && latest.status === 'completed') {
        if (instance) runtime.deactivate(instance);
        instance = null;
        mission = null;
        ended = stored.instance;
        set({ ...blank, stage: 'done', turn: v.turns, word: null, options: [], line: 'done' });
        announce();
        return;
      }
    }
    ended = null;
    if (!id) {
      id = `${copy.mission}-${learnerId}-${now().toString(36)}`;
      await runtime.startMission({ learnerId, missionId: copy.mission, instanceId: id });
    }
    if (instance && instance !== id) runtime.deactivate(instance);
    instance = id;
    const active = await runtime.activate(id);
    revision = active.revision;
    show(active.view, stored?.instance === id ? stored : null);
    announce();
  };

  const flow: LetterGameFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    start: () => guard(() => open(false)),

    hear() {
      // The ball is still rolling and the cheer is on its way: the ear would say it, be cut by it, and it would be said twice.
      if (disposed || (v.stage === 'cleared' && uncheer !== null)) return;
      speech.touching();
      if (v.stage === 'ask') {
        // While the game is still saying the ask, the ear starts it again and the letters stay held.
        speak(askKeys(), { hold: v.listening });
      } else if (v.stage === 'play' || v.stage === 'cleared' || v.stage === 'done') {
        speak([voice(v.stage)]);
      }
    },

    choose: (optionId) =>
      guard(async () => {
        if (v.stage !== 'ask' || v.listening || v.tried.includes(optionId) || (v.shown !== null && v.shown !== optionId)) return;
        const index = v.options.findIndex((o) => o.id === optionId);
        // No answer is taken for a word that cannot be heard: the ask waits for sound, held.
        if (index < 0 || speech.deaf()) return;
        touch();
        audio.effect('place');
        const word = v.word;
        const key = mission?.activity?.itemSignature;
        const res = await runtime.submit(instance!, { ...command('submit'), optionId });
        revision = res.revision;
        mission = res.view;
        const result = res.intents.find((i) => i.type === 'RESPONSE_RESULT');
        // A refused command (a late or doubled tap) is not an answer: nothing greys.
        if (result?.type !== 'RESPONSE_RESULT') return;
        if (result.correct) {
          set({ ...blank, stage: 'play', target: index, line: 'play' });
          // The second tap of a double tap on the letter is not a roll.
          settle();
          speak(['effect:success', voice('play')]);
        } else if (res.view.activity?.itemSignature !== key) {
          // The runtime moved on (not this policy today): show whatever it presents now.
          show(res.view);
          announce();
        } else {
          // A miss greys the letter and keeps the same word: it never gets easier.
          set({ tried: v.tried.includes(optionId) ? v.tried : [...v.tried, optionId], line: 'retry', miss: v.miss + 1, ...helpOf(res.view, word) });
          speak(['effect:retry', voice('retry'), ...askKeys()], { hold: true });
        }
        void persist();
      }),

    help: () =>
      guard(async () => {
        const step = mission?.activity?.scaffolds.available[0];
        // One press, one rung: Help is held while the rung it gave is being said.
        if (v.stage !== 'ask' || v.listening || v.helping || v.settling || !step || speech.deaf()) return;
        touch();
        const res = await runtime.useScaffold(instance!, { ...command('help'), scaffoldStepId: step.stepId });
        revision = res.revision;
        mission = res.view;
        const line = HELP_LINE[step.kind] ?? v.line;
        set({ ...helpOf(res.view, v.word), line });
        // The clue is followed by the word again; guided shows the letter; SHOW ME points at the pin or flag.
        speak(step.kind === 'highlightGiven' ? [voice('clue'), ...askKeys()] : [voice(line)], { gapMs: HELP_GAP_MS, help: true });
        void persist();
      }),

    roll(aim) {
      if (disposed || v.busy || v.settling || v.stage !== 'play' || v.target === null) return;
      touch();
      const last = v.used >= v.tries - 1;
      const n = (v.roll?.n ?? 0) + 1;
      let roll: GameRoll;
      let down = v.down;
      if (game === 'bowling') {
        const r = bowl(aim, v.options.map((_, i) => !v.down.includes(i)), v.target, last);
        down = [...v.down, ...r.down];
        roll = { n, aim, x: r.x, hit: r.down, cleared: r.cleared };
      } else {
        const r = putt(aim, v.options.length, v.target, v.used, last);
        roll = { n, aim, x: r.x, hit: [], cleared: r.sunk };
      }
      audio.effect('place');
      set({ roll, down, used: v.used + 1, ...(roll.cleared ? { stage: 'cleared' as const, line: 'cleared' as const } : {}) });
      if (roll.cleared) {
        settle();
        // Cheer when the ball gets there, not when it leaves the hand.
        uncheer?.();
        uncheer = wait(ROLL_MS, () => {
          uncheer = null;
          if (!disposed && v.stage === 'cleared') speak(['effect:success', voice('cleared')]);
        });
      }
      void persist();
    },

    rollAt(index) {
      const x = spots(v.options.length)[index];
      if (x !== undefined) flow.roll(x);
    },

    next: () =>
      guard(async () => {
        if (v.stage !== 'cleared' || v.settling || !instance || !mission?.narrative) return;
        touch();
        uncheer?.();
        uncheer = null;
        const res = await runtime.acknowledge(instance, command('next'));
        revision = res.revision;
        show(res.view);
        // Help, or Play again, now stands where Next stood.
        settle();
        announce();
        void persist();
      }),

    again: () =>
      guard(async () => {
        if (v.stage !== 'done' || v.settling) return;
        touch();
        await open(true);
        // Help now stands near where Play again stood.
        settle();
        void persist();
      }),

    flush: () => persist(),

    leave() {
      if (disposed || v.stage !== 'done') return persist();
      // Leaving the end screen: the card in the games room starts a new game next time.
      const id = instance ?? ended;
      ended = null;
      if (!id) return saving;
      const text = JSON.stringify({ v: 1, instance: id, key: '', tried: [], word: null, options: [], target: null, down: [], used: 0, cleared: false, ended: false } satisfies PlaySave);
      saving = saving.then(() => runtime.putSetting(learnerId, SAVE_KEY, text)).catch((e: unknown) => log('game.saveFailed', { message: String(e) }));
      return saving;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      uncheer?.();
      unsettle?.();
      speech.dispose();
      if (instance) runtime.deactivate(instance);
      listeners.clear();
    },
  };
  return flow;
}
