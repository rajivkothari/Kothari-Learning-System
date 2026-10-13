// Rooftop Word Golf's controller (D197): the pure game (game.ts) wired to the mini-game session, the
// sound and a clock. No React: the screen subscribes to it, the tests drive it headless with the mock
// session and fake timers.
//
// One play session is one hole (one runtime mission; one step per word turn). What reaches the session:
//   submit   only TRY IT, with the learner's whole word (the one evidence path)
//   help     only the HELP / SHOW ME control, for the step the policy offers
//   next     when the next turn's word is needed and the last right answer is still being held
//   save     gameplay only (turn, ball, lie, target, putting): at every step that matters
//   notes    the holes finished and the fewest shots on each (never evidence)
//   finish   once, when the ball drops
// Never: a target, a flight, a lie, a putt, a replayed word (HEAR IT), clearing tiles, entering or leaving.
import type { ChallengeView, HelpView, MiniGameSession, MiniGameSound } from '../types';
import { say } from './course';
import type { WgCopy } from './copy';
import type { ClueSource, WordClue } from './clues';
import type { Hole } from './fairway';
import {
  AIM_STEP,
  POWER_STEP,
  addHint,
  aimBy,
  carryOn,
  changeTarget,
  chooseTarget,
  clearTiles,
  closerOffer,
  fromSave,
  landed,
  moveCloser,
  newHole,
  notYet,
  place,
  powerBy,
  presentWord,
  putt,
  puttDone,
  setAim,
  setPower,
  swing,
  takeBack,
  targetsOf,
  toSave,
  undoTile,
  word,
  type GolfState,
  type Hint,
} from './game';
import { PHYS, pathSeconds } from './physics';
import { shotBeats, shotTiming } from './shotFeel';

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
  help: { kind: 'help' | 'show'; helpKind: string; offered: boolean } | null;
  wrongTries: number;
}

/** Game-wide notes (never evidence): the holes finished and the fewest shots on each. */
export interface GolfNotes {
  v: 1;
  finished: string[];
  best: Record<string, number>;
}

export interface WordGolfView {
  state: GolfState;
  hole: Hole;
  item: SpellItem | null;
  clue: WordClue | null;
  busy: boolean;
  canHear: boolean;
  /** Bumps on every shot and putt, so the screen starts its playback once per shot. */
  shotSeq: number;
  freshWord: boolean;
  finished: boolean;
  ready: boolean;
  /** The turn's word is on its way: the panel waits. */
  beginning: boolean;
  closer: boolean;
  /** The holes finished (runtime and notes), and the fewest shots per hole. */
  done: readonly string[];
  best: Readonly<Record<string, number>>;
}

export interface WordGolfController {
  getView(): WordGolfView;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  /** TEE OFF, or the next turn: the turn's word (the target choice or the spelling next). */
  begin(): Promise<void>;
  chooseTarget(id: string): void;
  changeTarget(): void;
  place(tileId: number): void;
  takeBack(slot: number): void;
  undo(): void;
  clear(): void;
  check(): Promise<void>;
  help(): Promise<void>;
  hear(): void;
  /** NEXT WORD, or onto the green after the last word. */
  carryOn(): Promise<void>;
  aimLeft(): void;
  aimRight(): void;
  setAim(angle: number): void;
  setPower(power: number): void;
  morePower(): void;
  lessPower(): void;
  shoot(): void;
  moveCloser(): void;
  /** Skip a flight or a roll that is playing (a tap on the course): it lands at once. */
  skip(): void;
  suspend(): void;
  exit(onExit: () => void): Promise<void>;
  setSound(sound: MiniGameSound): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

export interface ControllerOptions {
  session: MiniGameSession;
  sound: MiniGameSound;
  hole: Hole;
  copy: WgCopy;
  clues: ClueSource;
  timers?: Timers;
  reducedMotion?: boolean;
}

/** How long the green holds after a putt stops before the next card. */
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
  const text = clue?.phonics ? clue.phonics : item?.syllables ? say(copy.syllables, { syllables: item.syllables }) : item?.pattern ? say(copy.pattern, { pattern: item.pattern }) : copy.spellPrompt;
  return { kind: 'phonics', text, ...line };
}

const parseNotes = (raw: unknown): GolfNotes => {
  const n = raw as Partial<GolfNotes> | null;
  if (!n || n.v !== 1 || !Array.isArray(n.finished)) return { v: 1, finished: [], best: {} };
  const best: Record<string, number> = {};
  for (const [k, v] of Object.entries(n.best ?? {})) if (typeof v === 'number' && Number.isFinite(v)) best[k] = v;
  return { v: 1, finished: n.finished.filter((m): m is string => typeof m === 'string'), best };
};

export function createWordGolf(opts: ControllerOptions): WordGolfController {
  const { session, hole, copy, clues } = opts;
  const timers = opts.timers ?? REAL_TIMERS;
  let host = opts.sound;
  let reducedNow = opts.reducedMotion ?? false;
  const sound: MiniGameSound = {
    play: (slot) => host.play(slot),
    loop: (slot, on) => host.loop(slot, on),
    say: (key) => host.say(key),
    canSay: (key) => host.canSay(key),
    hush: () => host.hush(),
  };
  const listeners = new Set<() => void>();
  let state: GolfState = newHole(hole);
  let busy = false;
  let beginning = false;
  let shotSeq = 0;
  let freshWord = false;
  let finished = false;
  let ready = false;
  let disposed = false;
  let notes: GolfNotes = { v: 1, finished: [], best: {} };
  let pending: unknown[] = [];
  let saving: Promise<void> = Promise.resolve();
  let view: WordGolfView | null = null;

  const item = () => (state.phase === 'spell' || state.phase === 'target' ? itemOf(session.challenge()) : null);
  const build = (): WordGolfView => {
    const it = item();
    const clue = it?.wordId ? clues(it.wordId) : null;
    const done = [...new Set([...session.completedMissions, ...notes.finished])];
    return { state, hole, item: it, clue, busy, canHear: Boolean(it?.wordId && sound.canSay(narrationKey(it.wordId))), shotSeq, freshWord, finished, ready, beginning, closer: closerOffer(hole, state) !== null, done, best: notes.best };
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
    const snapshot = toSave(hole, state);
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
  const listen = (it: SpellItem) => {
    if (it.wordId && sound.canSay(narrationKey(it.wordId))) sound.say(narrationKey(it.wordId));
  };
  /** Words this hole's session has taken (the runtime's checkpoint: durable across leaving and restarts). */
  const answered = () => {
    const p = session.progress();
    return p.complete ? hole.turns.length : p.step.index;
  };
  /** The word the session holds as the last right answer, with its evidence (read back after a restart), else null. */
  const held = (): { word: string; evidence: string } | null => {
    const h = session.solvedAnswer();
    return session.progress().phase === 'solved' && h ? { word: String(h.value).toLowerCase(), evidence: h.evidence } : null;
  };

  const flightDone = () => {
    if (state.phase !== 'flight') return;
    cancelTimers();
    sound.loop('golfRoll', false);
    set(landed(hole, state));
    void save();
  };
  const startFlight = () => {
    const f = state.flight;
    if (!f) return;
    shotSeq += 1;
    emit();
    const t = shotTiming(f, reducedNow);
    for (const b of shotBeats(t, f)) later(() => (b.loop === undefined ? sound.play(b.slot) : sound.loop(b.slot, b.loop)), b.at);
    later(flightDone, t.totalMs);
  };

  const remember = async () => {
    const best = Math.min(notes.best[hole.id] ?? Infinity, state.strokes);
    notes = { v: 1, finished: [...new Set([...notes.finished, hole.mission])], best: { ...notes.best, [hole.id]: best } };
    emit();
    await session.saveNotes(notes).catch(() => undefined);
  };
  const holeDone = async () => {
    if (finished) return;
    await remember();
    await save();
    finished = true;
    await session.finish().catch(() => undefined);
    emit();
  };

  const puttEnd = (quiet: boolean) => {
    if (state.phase !== 'rolling') return;
    cancelTimers();
    sound.loop('golfRoll', false);
    const next = puttDone(hole, state);
    set(next);
    if (next.phase === 'sunk') {
      if (!quiet) sound.play('holeComplete');
      void holeDone();
    } else void save();
  };

  const ctl: WordGolfController = {
    getView: () => (view ??= build()),
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async start() {
      notes = parseNotes(await session.loadNotes().catch(() => null));
      const raw = await session.loadGame().catch(() => null);
      let s = (raw !== null ? fromSave(raw, hole) : null) ?? newHole(hole);
      // The session is the record of the words: a save behind it (the app closed between the answer
      // and the save) plays the owed shot from where the ball was, with the word and evidence it holds.
      const n = answered();
      if (s.turn > n) s = newHole(hole);
      if (s.turn < n && (s.phase === 'intro' || s.phase === 'target' || s.phase === 'spell')) {
        // The held answer shows its result card. Without one (the session already moved on to the next
        // word) the ball goes on from the target, and from the safe targets for any further word
        // behind (never expected); no card for a word the screen cannot name.
        const h = held();
        if (h) s = landed(hole, swing(hole, { ...s, phase: 'spell' }, h.word, h.evidence));
        let first = !h;
        while (s.turn < n && s.turn < hole.turns.length) {
          const quiet = landed(hole, swing(hole, { ...s, phase: 'spell', target: first ? s.target : null }, '', 'retry'));
          first = false;
          s = carryOn(hole, { ...quiet, words: s.words, report: null });
        }
      }
      state = s;
      ready = true;
      emit();
      if (s.phase === 'sunk') await holeDone();
      else void save();
    },

    async begin() {
      if (state.phase !== 'intro' || beginning) return;
      beginning = true;
      emit();
      try {
        if (state.turn >= hole.turns.length) return;
        let c = session.challenge();
        if (!c) {
          const p = session.progress();
          if (p.phase === 'solved' || p.phase === 'story') c = await session.next();
          if (!c && session.progress().phase === 'story') c = await session.next();
        }
        const it = itemOf(c);
        if (!it) return;
        freshWord = false;
        const next = presentWord(hole, state, it);
        set(next);
        if (next.phase === 'spell') listen(it);
        void save();
      } finally {
        beginning = false;
        emit();
      }
    },

    chooseTarget(id) {
      if (busy) return;
      if (set(chooseTarget(hole, state, id))) {
        sound.play('tilePlace');
        const it = item();
        if (it) listen(it);
        void save();
      }
    },
    changeTarget() {
      if (busy) return;
      if (set(changeTarget(hole, state))) void save();
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
      const it = itemOf(session.challenge());
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
        if ((r.reason === 'stale' || r.reason === 'noChallenge') && answered() > state.turn) {
          const h = held();
          set(swing(hole, state, h?.word ?? w, h?.evidence ?? 'retry', it?.pattern ?? null));
          void save();
          startFlight();
        } else {
          const next = itemOf(session.challenge());
          if (next && next.key !== state.challengeKey) set(presentWord(hole, state, next));
          emit();
        }
        return;
      }
      sound.hush();
      if (r.correct) {
        sound.play('answerRight');
        freshWord = false;
        set(swing(hole, state, w, r.evidence, it?.pattern ?? null));
        void save();
        startFlight();
        return;
      }
      sound.play('answerWrong');
      if (r.fresh) {
        const next = itemOf(session.challenge());
        if (next) {
          freshWord = true;
          set(presentWord(hole, state, next));
          listen(next);
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
      if (it?.wordId) sound.say(narrationKey(it.wordId));
    },

    async carryOn() {
      if (!set(carryOn(hole, state))) return;
      void save();
      if (state.phase === 'intro') await ctl.begin();
    },

    aimLeft: () => void set(aimBy(state, -AIM_STEP)),
    aimRight: () => void set(aimBy(state, AIM_STEP)),
    setAim: (a) => void set(setAim(state, a)),
    setPower: (p) => void set(setPower(state, p)),
    morePower: () => void set(powerBy(state, POWER_STEP)),
    lessPower: () => void set(powerBy(state, -POWER_STEP)),

    shoot() {
      if (state.phase !== 'aim') return;
      const next = putt(hole, state);
      if (next === state || !next.putting?.shot) return;
      shotSeq += 1;
      set(next);
      void save();
      sound.play('golfHit');
      sound.loop('golfRoll', true);
      const shot = next.putting.shot;
      const cup = shot.events.find((e) => e.kind === 'cup');
      if (cup)
        later(() => {
          sound.loop('golfRoll', false);
          sound.play('golfCup');
        }, cup.frame * PHYS.frameS * 1000);
      later(() => puttEnd(false), pathSeconds(shot) * 1000 + (reducedNow ? SETTLE_MS.reduced : SETTLE_MS.normal));
    },

    moveCloser() {
      if (set(moveCloser(hole, state))) void save();
    },

    skip() {
      if (state.phase === 'flight') flightDone();
      else if (state.phase === 'rolling') puttEnd(false);
    },

    suspend() {
      sound.loop('golfRoll', false);
      sound.hush();
      if (state.phase === 'flight') flightDone();
      else if (state.phase === 'rolling') puttEnd(true);
      else void save();
    },

    async exit(onExit) {
      sound.hush();
      sound.loop('golfRoll', false);
      if (state.phase === 'flight') flightDone();
      if (state.phase === 'rolling') puttEnd(true);
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

/** The targets a turn offers, for the screen (re-exported so the screen needs only the controller's view). */
export { targetsOf };
