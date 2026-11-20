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
import { GAMES, turnsOf, voice, type GameId, type LineKey } from './content';
import { bowl, putt, spots } from './play';

/** The quiet before a reminder, and how many reminders one stretch of quiet gets. */
export const REMIND_MS = 12_000;
export const MAX_REMINDERS = 2;
/** No clip sequence is trusted to hold the game longer than this, whatever the player reports. */
export const SPEECH_CAP_MS = 30_000;
/** Gaps: between clips, between a story's sentences, and in help. */
export const GAP_MS = 400;
export const STORY_GAP_MS = 750;
export const HELP_GAP_MS = 450;
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
  /** Browser: when sound is waiting for a first touch, run `fn` at that touch. Returns a cancel. */
  whenReady?(fn: () => void): (() => void) | void;
}

export interface GameVoice {
  /**
   * Say keys. A newer say takes over. `hold` keeps the choices and Help held until this say settles.
   * `onEnd(finished)` is told how it settled unless a newer say took over first. Returns false when
   * the say could not start at all.
   */
  say(keys: readonly string[], opts?: { gapMs?: number; hold?: boolean; onEnd?: (finished: boolean) => void }): boolean;
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
 * audio is still sounding releases the hold but leaves the quiet to the real end.
 */
export function createGameVoice(audio: GameAudio, wait: Wait, on: { hold(held: boolean): void; quiet(): void }): GameVoice {
  let serial = 0;
  let live = false;
  let held = false;
  let disposed = false;
  let uncap: (() => void) | null = null;
  const hold = (value: boolean) => {
    if (held === value) return;
    held = value;
    on.hold(value);
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
  return {
    say(keys, opts = {}) {
      if (disposed) return false;
      const mine = ++serial;
      clearCap();
      live = true;
      hold(opts.hold === true);
      let settled = false;
      let returned = false;
      let started = true;
      const settle = (finished: boolean) => {
        if (settled || mine !== serial || disposed) return;
        settled = true;
        live = false;
        clearCap();
        if (!returned) started = false;
        hold(false);
        opts.onEnd?.(finished);
        // onEnd may have said something new: then that say reports the quiet.
        if (mine === serial && !disposed) on.quiet();
      };
      audio.say(keys, opts.gapMs ?? GAP_MS, settle);
      returned = true;
      if (!settled && mine === serial) {
        uncap = wait(SPEECH_CAP_MS, () => {
          uncap = null;
          if (settled || mine !== serial || disposed) return;
          hold(false);
          // Still sounding: the real end settles it. Otherwise the report was lost, and this is the end.
          if (!audio.busy?.()) settle(false);
        });
      }
      return started;
    },
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
 * (through the game's voice, which reports the next quiet); `nudge(on)` shows the ear's slow glow once
 * the reminders are used up, until the next touch. A reminder never starts while anything is sounding.
 */
export function createGameIdle(audio: GameAudio, wait: Wait, on: { open(): boolean; remind(): void; nudge(on: boolean): void }): GameIdle {
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
      on.remind();
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
  game, stage: 'loading', turn: 1, turns: turnsOf(game).length, word: null, options: [], tried: [], listening: false, nudge: false, help: [], nextHelp: null, shown: null, hint: null,
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
}

export interface LetterGameFlow {
  view(): GameView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  /** The ear, or the picture: say this stage's line again. Free, and it works while the game is talking. */
  hear(): void;
  /** ask: the tapped pin or flag is the answer. Does nothing while the game is talking. */
  choose(optionId: string): Promise<void>;
  /** ask: the next help of the ladder. Does nothing while the game is talking. */
  help(): Promise<void>;
  /** play: roll or putt toward `aim` across the lane (-1 left edge, 1 right edge). */
  roll(aim: number): void;
  /** play: roll or putt at pin or flag `index`. */
  rollAt(index: number): void;
  /** cleared: on to the next turn, or the end. */
  next(): Promise<void>;
  /** done: a new game. */
  again(): Promise<void>;
  /** Save the play state now (leaving, app to background). */
  flush(): Promise<void>;
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
  log?: (event: string, data?: Record<string, unknown>) => void;
}): LetterGameFlow {
  const { runtime, learnerId, game, now, audio } = opts;
  const wait = opts.wait ?? realWait;
  const log = opts.log ?? (() => undefined);
  const copy = GAMES.games[game];
  const SAVE_KEY = `kingdom.play.${game}`;
  const listeners = new Set<() => void>();
  let instance: string | null = null;
  let mission: MissionView | null = null;
  let revision = 0;
  let disposed = false;
  let saving: Promise<void> = Promise.resolve();
  let unready: (() => void) | null = null;
  let uncheer: (() => void) | null = null;
  let v: GameView = idleGameView(game);
  const set = (patch: Partial<GameView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  const command = (kind: string) => ({ commandId: `${instance}:game:r${revision}:${kind}`, basedOn: revision });

  const idle = createGameIdle(audio, wait, {
    open: () => !disposed && v.stage === 'ask',
    remind: () => speak(askKeys()),
    nudge: (on) => {
      if (v.nudge !== on) set({ nudge: on });
    },
  });
  const talk = createGameVoice(audio, wait, {
    hold: (held) => set({ listening: held }),
    quiet: () => idle.quiet(),
  });
  const speak = (keys: readonly string[], o: { gapMs?: number; hold?: boolean } = {}) => {
    idle.pause();
    const started = talk.say(keys, o);
    // Something was said: the ask is no longer waiting for the first touch.
    if (started) {
      unready?.();
      unready = null;
    }
    return started;
  };
  const touch = () => idle.touch(talk.speaking());
  const askKeys = () => (v.word ? [voice('ask', { word: v.word })] : []);
  /** The first ask of a word holds the letters. In the browser, an ask that could not play is said at the first touch. */
  const ask = () => {
    if (speak(askKeys(), { hold: true }) || !audio.whenReady) return;
    const key = mission?.activity?.itemSignature;
    const cancel = audio.whenReady(() => {
      unready = null;
      if (disposed || v.stage !== 'ask' || mission?.activity?.itemSignature !== key) return;
      idle.touch(true);
      speak(askKeys(), { hold: true });
    });
    unready = cancel ?? null;
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
    const data: PlaySave = { v: 1, instance, key, tried: v.tried, word: v.word, options: v.options, target: v.target, down: v.down, used: v.used, cleared: v.stage === 'cleared' };
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

  async function guard(task: () => Promise<void>) {
    if (v.busy || disposed) return;
    set({ busy: true });
    try {
      await task();
    } catch (e) {
      log('game.failed', { message: String(e) });
      talk.stop();
      set({ stage: 'failed' });
    } finally {
      set({ busy: false });
    }
  }

  /** Open the game's mission: the active one, or a new one. Says where it is. */
  const open = async (fresh: boolean) => {
    if (!(await runtime.getLearner(learnerId))) throw new Error(`no learner ${learnerId}`);
    let id = fresh ? null : await runtime.findActiveMission(learnerId, copy.mission);
    if (id && !(await runtime.missionCompatibility(id)).ok) {
      await runtime.abandonMission(id, { commandId: `${id}:incompatible` });
      id = null;
    }
    if (!id) {
      id = `${copy.mission}-${learnerId}-${now().toString(36)}`;
      await runtime.startMission({ learnerId, missionId: copy.mission, instanceId: id });
    }
    if (instance && instance !== id) runtime.deactivate(instance);
    instance = id;
    const active = await runtime.activate(id);
    revision = active.revision;
    let saved: PlaySave | null = null;
    try {
      const raw = JSON.parse((await runtime.settings(learnerId))[SAVE_KEY] ?? 'null') as PlaySave | null;
      const letters = (x: unknown): x is GameOption[] => Array.isArray(x) && x.every((o: Partial<GameOption> | null) => typeof o?.id === 'string' && typeof o.letter === 'string');
      if (raw?.v === 1 && raw.instance === id && Array.isArray(raw.tried) && Array.isArray(raw.down) && letters(raw.options)) saved = raw;
    } catch {
      // An unreadable play save starts the word afresh; the answers are in the runtime.
    }
    show(active.view, saved);
    if (v.stage === 'ask') ask();
    else if (v.stage === 'play') speak([voice('play')]);
    else if (v.stage === 'done') speak([voice('done')]);
  };

  const flow: LetterGameFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    start: () => guard(() => open(false)),

    hear() {
      if (disposed) return;
      idle.touch(true);
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
        if (index < 0) return;
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
          speak(['effect:success', voice('play')]);
        } else if (res.view.activity?.itemSignature !== key) {
          // The runtime moved on (not this policy today): show whatever it presents now.
          show(res.view);
          if (v.stage === 'ask') ask();
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
        if (v.stage !== 'ask' || v.listening || !step) return;
        touch();
        const res = await runtime.useScaffold(instance!, { ...command('help'), scaffoldStepId: step.stepId });
        revision = res.revision;
        mission = res.view;
        const line = HELP_LINE[step.kind] ?? v.line;
        set({ ...helpOf(res.view, v.word), line });
        // The clue is followed by the word again; guided shows the letter; SHOW ME points at the pin or flag.
        speak(step.kind === 'highlightGiven' ? [voice('clue'), ...askKeys()] : [voice(line)], { gapMs: HELP_GAP_MS });
        void persist();
      }),

    roll(aim) {
      if (disposed || v.busy || v.stage !== 'play' || v.target === null) return;
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
        if (v.stage !== 'cleared' || !instance || !mission?.narrative) return;
        touch();
        uncheer?.();
        uncheer = null;
        const res = await runtime.acknowledge(instance, command('next'));
        revision = res.revision;
        show(res.view);
        if (v.stage === 'ask') ask();
        else if (v.stage === 'done') speak([voice('done')]);
        void persist();
      }),

    again: () =>
      guard(async () => {
        if (v.stage !== 'done') return;
        touch();
        await open(true);
        void persist();
      }),

    flush: () => persist(),

    dispose() {
      if (disposed) return;
      disposed = true;
      idle.stop();
      unready?.();
      uncheer?.();
      // Only this game's own speech: the castle may be saying something as the game closes.
      talk.dispose();
      if (instance) runtime.deactivate(instance);
      listeners.clear();
    },
  };
  return flow;
}
