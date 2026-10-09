// Rooftop Word Golf's controller: the pure game (game.ts) wired to the mini-game session, the sound
// and a clock. No React: the screen subscribes to it, the tests drive it headless with the mock
// session and fake timers.
//
// What reaches the session, and when:
//   submit   only CHECK, with the learner's whole word (the one evidence path)
//   help     only the HELP / SHOW ME control, for the step the policy offers
//   next     when a hole's word is needed and the last right answer is still being held
//   save     gameplay only (hole, ball, aim, power, hints): at every step that matters
//   finish   once, when the course is done
// Never: a putt, a replayed word (HEAR IT), clearing the tiles, entering or leaving.
import type { ChallengeView, HelpView, MiniGameSession, MiniGameSound } from '../types';
import { say, type HoleSpec } from './course';
import type { WgCopy } from './copy';
import type { ClueSource, WordClue } from './clues';
import {
  AIM_STEP,
  POWER_STEP,
  addHint,
  aimBy,
  alreadyEarned,
  clearTiles,
  closerOffer,
  fromSave,
  moveCloser,
  newGame,
  nextHole,
  notYet,
  place,
  powerBy,
  presentWord,
  rollDone,
  setAim,
  setPower,
  shoot,
  spelled,
  takeBack,
  takeShot,
  toSave,
  undoTile,
  word,
  type GolfState,
  type Hint,
} from './game';
import { PHYS, pathSeconds } from './physics';

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const REAL_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** The spelling item, read from the session's challenge (prompt fields only: never the word). */
export interface SpellItem {
  key: string;
  wordId: string | null;
  length: number;
  tiles: string;
  pattern: string | null;
  patternAt: number | null;
  syllables: number | null;
  /** The help step the policy offers: as this game shows it (SHOW ME or another hint), its kind (the content's), and whether it is suggested now. */
  help: { kind: 'help' | 'show'; helpKind: string; offered: boolean } | null;
  wrongTries: number;
}

export interface WordGolfView {
  state: GolfState;
  item: SpellItem | null;
  clue: WordClue | null;
  /** A check or a help step is in flight: those controls wait. */
  busy: boolean;
  /** HEAR IT has something to say for this word. */
  canHear: boolean;
  /** Bumps on every putt, so the screen starts its playback once per putt. */
  rollSeq: number;
  /** A fresh word replaced the last one after several tries (a calm line says so). */
  freshWord: boolean;
  /** The session is finished: nothing more is saved. */
  finished: boolean;
  /** The saved game is loaded (until then the screen shows the course only). */
  ready: boolean;
  /** The next hole's word is on its way (NEXT HOLE leads straight to it): the panel waits. */
  beginning: boolean;
  /** MOVE CLOSER is offered (after a few putts on this hole without the ball dropping). */
  closer: boolean;
}

export interface WordGolfController {
  getView(): WordGolfView;
  subscribe(listener: () => void): () => void;
  /** Load the saved game (or start one) and line it up with the session. */
  start(): Promise<void>;
  /** SPELL THE WORD: the hole's word (or straight to the putt when it was already spelled). */
  begin(): Promise<void>;
  place(tileId: number): void;
  takeBack(slot: number): void;
  undo(): void;
  clear(): void;
  check(): Promise<void>;
  help(): Promise<void>;
  hear(): void;
  takeShot(): void;
  aimLeft(): void;
  aimRight(): void;
  setAim(angle: number): void;
  setPower(power: number): void;
  morePower(): void;
  lessPower(): void;
  shoot(): void;
  /** NEXT HOLE: on to the next hole and straight to its word (no extra card between holes). */
  nextHole(): Promise<void>;
  /** MOVE CLOSER: the ball to the offered spot. Play only: never help, never evidence, nothing reaches the session. */
  moveCloser(): void;
  /** The app went to the background: stop the roll sound, finish any putt in flight at once, save. */
  suspend(): void;
  /** Save, stop sounds, then leave (the host closes the screen). */
  exit(onExit: () => void): Promise<void>;
  /** The host's sound or the Reduced Motion setting changed (read at the next use). */
  setSound(sound: MiniGameSound): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

export interface ControllerOptions {
  session: MiniGameSession;
  sound: MiniGameSound;
  holes: readonly HoleSpec[];
  copy: WgCopy;
  clues: ClueSource;
  timers?: Timers;
  /** Reduced Motion: the ball still rolls its path, but nothing lingers after it. */
  reducedMotion?: boolean;
}

/** How long the scene holds after the ball stops before the next card (no timer ever moves the learner on past a choice). */
export const SETTLE_MS = { normal: 250, reduced: 0 } as const;

export const narrationKey = (wordId: string) => `word.${wordId}`;

export function itemOf(c: ChallengeView | null): SpellItem | null {
  if (!c) return null;
  const p = c.prompt;
  const tiles = typeof p.tiles === 'string' ? p.tiles : '';
  const length = typeof p.length === 'number' && p.length > 0 ? p.length : tiles.length;
  const help = c.help ? { kind: isShowKind(c.help.kind) || c.help.assistance === 'demonstrated' ? ('show' as const) : ('help' as const), helpKind: c.help.kind, offered: c.help.offered } : null;
  return {
    key: c.key,
    wordId: typeof p.wordId === 'string' ? p.wordId : null,
    length,
    tiles,
    pattern: typeof p.pattern === 'string' && p.pattern.length > 0 ? p.pattern : null,
    patternAt: typeof p.patternAt === 'number' ? p.patternAt : null,
    syllables: typeof p.syllables === 'number' ? p.syllables : null,
    help,
    wrongTries: c.wrongTries,
  };
}

const isShowKind = (kind: string) => /show|answer|demonstr/i.test(kind);

/** What a help step shows in this game. The kinds are the content pack's; unknown kinds fall back to the sound hint. */
export function hintFor(help: Pick<HelpView, 'kind' | 'revealed' | 'assistance'>, item: SpellItem | null, clue: WordClue | null, copy: WgCopy): Hint {
  const kind = help.kind.toLowerCase();
  const said = copy.helpLine(help.kind);
  const line = said ? { line: said } : {};
  if (help.revealed !== null && help.revealed !== undefined) return { kind: 'show', word: String(help.revealed).toLowerCase(), ...line };
  if (/replay|hear|listen|repeat/.test(kind)) return { kind: 'replay', ...line };
  if (/reveal|pattern|letter|chunk|part/.test(kind) && item?.pattern) return { kind: 'pattern', pattern: item.pattern, at: item.patternAt, ...line };
  // A sound hint: the word's own (EC's clue), else its beats, else its pattern.
  const text = clue?.phonics ? clue.phonics : item?.syllables ? say(copy.syllables, { syllables: item.syllables }) : item?.pattern ? say(copy.pattern, { pattern: item.pattern }) : copy.spellPrompt;
  return { kind: 'phonics', text, ...line };
}

export function createWordGolf(opts: ControllerOptions): WordGolfController {
  const { session, holes, copy, clues } = opts;
  const timers = opts.timers ?? REAL_TIMERS;
  let host = opts.sound;
  let reducedNow = opts.reducedMotion ?? false;
  const reduced = () => reducedNow;
  const sound: MiniGameSound = {
    play: (slot) => host.play(slot),
    loop: (slot, on) => host.loop(slot, on),
    say: (key) => host.say(key),
    canSay: (key) => host.canSay(key),
    hush: () => host.hush(),
  };
  const listeners = new Set<() => void>();
  let state: GolfState = newGame(holes);
  let busy = false;
  let beginning = false;
  let rollSeq = 0;
  let freshWord = false;
  let finished = false;
  let ready = false;
  let disposed = false;
  let pending: unknown[] = [];
  let saving: Promise<void> = Promise.resolve();
  let view: WordGolfView | null = null;

  const item = () => (state.phase === 'spell' ? itemOf(session.challenge()) : null);
  const build = (): WordGolfView => {
    const it = item();
    const clue = it?.wordId ? clues(it.wordId) : null;
    return { state, item: it, clue, busy, canHear: Boolean(it?.wordId && sound.canSay(narrationKey(it.wordId))), rollSeq, freshWord, finished, ready, beginning, closer: closerOffer(state, holes) !== null };
  };
  const emit = () => {
    view = null;
    for (const l of listeners) l();
  };
  const set = (next: GolfState) => {
    if (next === state) return false;
    state = next;
    emit();
    return true;
  };
  const save = () => {
    if (finished || disposed) return saving;
    const snapshot = toSave(state, holes);
    // One at a time, in order, so the last state written is the last state reached.
    saving = saving.then(() => session.saveGame(snapshot)).catch(() => undefined);
    return saving;
  };
  const cancelTimers = () => {
    for (const h of pending) timers.clear(h);
    pending = [];
  };
  const later = (fn: () => void, ms: number) => {
    const h = timers.set(() => {
      pending = pending.filter((x) => x !== h);
      if (!disposed) fn();
    }, ms);
    pending.push(h);
  };
  /** A new word is said once as it appears (the word, a sentence, the word): never help, never evidence. */
  const listen = (it: SpellItem) => {
    if (it.wordId && sound.canSay(narrationKey(it.wordId))) sound.say(narrationKey(it.wordId));
  };
  /**
   * Whether this hole's word is already answered (a restart after the answer, before the golf save
   * caught up). Hole i is the mission's step i (content/missions/core.json: hole-1 to hole-3). Read
   * from the session's durable progress (the runtime's checkpoint: a right answer moves the step on
   * at once, and the mission is complete after the last), never from the visit's own count of right
   * answers, which starts at 0 on every visit.
   */
  const holeSpelled = (hole: number) => {
    const p = session.progress();
    return p.complete || p.step.index > hole;
  };
  /** The word the session still holds as this hole's right answer (read back after a restart), else null. */
  const heldWord = (hole: number): { word: string; evidence: string } | null => {
    const p = session.progress();
    const held = session.solvedAnswer();
    if (p.phase !== 'solved' || !held) return null;
    const answered = p.complete ? holes.length - 1 : p.step.index - 1;
    return answered === hole ? { word: String(held.value).toLowerCase(), evidence: held.evidence } : null;
  };
  const earnedAgain = (s: GolfState) => alreadyEarned(s, heldWord(s.hole));

  const endRoll = (quiet: boolean) => {
    if (state.phase !== 'rolling') return;
    cancelTimers();
    sound.loop('golfRoll', false);
    const before = state;
    const next = rollDone(state, holes);
    set(next);
    if (next.phase === 'sunk' || next.phase === 'summary') {
      if (!quiet) sound.play('holeComplete');
      void save().then(async () => {
        if (next.phase === 'summary' && !finished) {
          finished = true;
          await session.finish().catch(() => undefined);
          emit();
        }
      });
    } else if (before.shot) {
      void save();
    }
  };

  const ctl: WordGolfController = {
    getView: () => (view ??= build()),
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async start() {
      const raw = await session.loadGame().catch(() => null);
      let s = (raw !== null ? fromSave(raw, holes) : null) ?? newGame(holes);
      // The session is the record of what was answered: a word committed before the save caught up
      // is never asked again, and its putt is waiting.
      if ((s.phase === 'intro' || s.phase === 'spell') && holeSpelled(s.hole)) s = earnedAgain(s);
      state = s;
      ready = true;
      emit();
      if (s.phase === 'summary' && !finished) {
        finished = true;
        await session.finish().catch(() => undefined);
        emit();
      } else {
        void save();
      }
    },

    async begin() {
      if (state.phase !== 'intro' || beginning) return;
      beginning = true;
      emit();
      try {
        if (holeSpelled(state.hole)) {
          set(earnedAgain(state));
          void save();
          return;
        }
        let c = session.challenge();
        if (!c) {
          const p = session.progress();
          if (p.phase === 'solved' || p.phase === 'story') c = await session.next();
          // A story beat before the word: acknowledged, then the word.
          if (!c && session.progress().phase === 'story') c = await session.next();
        }
        const it = itemOf(c);
        if (!it) {
          // No word to give (the mission ran out of words): the putt is never withheld.
          set(alreadyEarned(state));
        } else {
          freshWord = false;
          set(presentWord(state, it));
          listen(it);
        }
        void save();
      } finally {
        beginning = false;
        emit();
      }
    },

    place(tileId) {
      if (busy) return;
      if (set(place(state, tileId))) sound.play('tilePlace');
    },
    takeBack(slot) {
      if (busy) return;
      if (set(takeBack(state, slot))) sound.play('tileUndo');
    },
    undo() {
      if (busy) return;
      if (set(undoTile(state))) sound.play('tileUndo');
    },
    clear() {
      if (busy) return;
      if (set(clearTiles(state))) sound.play('tileUndo');
    },

    async check() {
      const w = word(state);
      if (busy || !w || state.phase !== 'spell') return;
      busy = true;
      emit();
      const key = state.challengeKey;
      let r: Awaited<ReturnType<MiniGameSession['submit']>>;
      try {
        r = await session.submit({ mode: 'value', value: w });
      } catch {
        busy = false;
        emit();
        return;
      }
      busy = false;
      if (state.phase !== 'spell' || state.challengeKey !== key) {
        emit();
        return;
      }
      if (r.status === 'refused') {
        if (r.reason === 'stale' || r.reason === 'noChallenge') {
          if (holeSpelled(state.hole)) set(earnedAgain(state));
          else {
            const it = itemOf(session.challenge());
            if (it && it.key !== state.challengeKey) set(presentWord(state, it));
          }
          void save();
        }
        emit();
        return;
      }
      if (r.correct) {
        sound.play('answerRight');
        freshWord = false;
        set(spelled(state, w, r.evidence));
        void save();
        return;
      }
      sound.play('answerWrong');
      if (r.fresh) {
        const it = itemOf(session.challenge());
        if (it) {
          freshWord = true;
          set(presentWord(state, it));
          listen(it);
          void save();
          return;
        }
      }
      set(notYet(state, w, r.misconception));
    },

    async help() {
      if (busy || state.phase !== 'spell') return;
      const before = itemOf(session.challenge());
      if (!before?.help) return;
      busy = true;
      emit();
      let h: HelpView | null = null;
      try {
        h = await session.help();
      } catch {
        h = null;
      }
      busy = false;
      if (!h || state.phase !== 'spell') {
        emit();
        return;
      }
      const it = itemOf(session.challenge()) ?? before;
      const clue = it.wordId ? clues(it.wordId) : null;
      const hint = hintFor(h, it, clue, copy);
      if (hint.kind === 'replay' && it.wordId) sound.say(narrationKey(it.wordId));
      set(addHint(state, hint));
      void save();
    },

    hear() {
      const it = item();
      // A replayed word is never help and never evidence: nothing reaches the session.
      if (it?.wordId) sound.say(narrationKey(it.wordId));
    },

    takeShot() {
      if (set(takeShot(state))) void save();
    },
    aimLeft: () => void set(aimBy(state, -AIM_STEP)),
    aimRight: () => void set(aimBy(state, AIM_STEP)),
    setAim: (a) => void set(setAim(state, a)),
    setPower: (p) => void set(setPower(state, p)),
    morePower: () => void set(powerBy(state, POWER_STEP)),
    lessPower: () => void set(powerBy(state, -POWER_STEP)),

    shoot() {
      if (state.phase !== 'aim') return;
      const next = shoot(state, holes);
      if (next === state || !next.shot) return;
      rollSeq += 1;
      set(next);
      // Saved as it will end: a restart mid-roll finds the ball where it stops.
      void save();
      sound.play('golfHit');
      sound.loop('golfRoll', true);
      const shot = next.shot;
      const cup = shot.events.find((e) => e.kind === 'cup');
      if (cup) {
        later(() => {
          sound.loop('golfRoll', false);
          sound.play('golfCup');
        }, cup.frame * PHYS.frameS * 1000);
      }
      later(() => endRoll(false), pathSeconds(shot) * 1000 + (reduced() ? SETTLE_MS.reduced : SETTLE_MS.normal));
    },

    async nextHole() {
      if (!set(nextHole(state, holes))) return;
      void save();
      if (state.phase === 'intro') await ctl.begin();
    },

    moveCloser() {
      if (set(moveCloser(state, holes))) void save();
    },

    suspend() {
      sound.loop('golfRoll', false);
      sound.hush();
      if (state.phase === 'rolling') endRoll(true);
      else void save();
    },

    async exit(onExit) {
      sound.hush();
      sound.loop('golfRoll', false);
      if (state.phase === 'rolling') endRoll(true);
      await save();
      onExit();
    },

    setSound(next) {
      if (next === host) return;
      host = next;
      emit();
    },
    setReducedMotion(next) {
      reducedNow = next;
    },

    dispose() {
      cancelTimers();
      sound.loop('golfRoll', false);
      disposed = true;
      listeners.clear();
    },
  };
  return ctl;
}
