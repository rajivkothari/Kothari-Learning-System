// The mini-game host (M9), without React: which game is open, and the moves in and out of it.
// The elevator session (director, runtime, audio) stays alive the whole time; the screen
// (ElevatorQuestApp) draws the elevator or the open game from this host's state.
//
//   open(id)   the landing's PLAY button: the director pauses (only if it offers that game now),
//              the return floor is recorded (a learner setting), and the game's play session opens
//              (its unfinished instance resumes, else a new one starts)
//   close()    BACK TO ELEVATOR: the game's session closes (the instance stays for next time), the
//              record is cleared, and the director resumes: the same floor, the doors open, the job
//              exactly where it was
//   dispose()  the elevator session is stopping (leaving, Start Over): the game closes, nothing
//              resumes, and the record is cleared (only an app that is killed keeps it)
//
// After an app restart in a game, session.ts reads the record (readHostRecord): the lift comes back
// at that landing (the director's resumeAt) and the entrance offers the unfinished game again.
// Nothing here is evidence: entering and leaving a game never reach the learning records.
import type { GameRuntime } from '../../../runtime/gameRuntime';
import type { AudioCue } from '../audio/cues';
import type { Director } from '../director/director';
import { MINI_GAMES, isMiniGameId } from './catalog';
import { createGameSound, type GameSound, type Narration } from './hostSound';
import { GAME_SETTING_PREFIX, openMiniGameSession, type MiniGameSessionHandle } from './session';
import type { MiniGameEntry, MiniGameId, MiniGameSession } from './types';

/** The learner setting that says a game is open, and at which floor the elevator waits. */
export const HOST_KEY = `${GAME_SETTING_PREFIX}host`;

export interface HostRecord {
  v: 1;
  game: MiniGameId;
  floor: number;
}

/** The record in a learner's settings, if it is a valid one. */
export function readHostRecord(settings: Readonly<Record<string, string>>, catalog: readonly MiniGameEntry[] = MINI_GAMES): HostRecord | null {
  const text = settings[HOST_KEY];
  if (!text) return null;
  try {
    const r = JSON.parse(text) as Partial<HostRecord>;
    const game = catalog.find((g) => g.id === r.game);
    return r.v === 1 && isMiniGameId(r.game) && game && r.floor === game.floor ? { v: 1, game: r.game, floor: r.floor } : null;
  } catch {
    return null;
  }
}

export type HostState =
  | { phase: 'elevator' }
  /** The game's session is opening (the screen shows the game's loading view). */
  | { phase: 'opening'; game: MiniGameEntry }
  | { phase: 'open'; game: MiniGameEntry; session: MiniGameSession; sound: GameSound }
  /** The game could not open: its mission is not installed ("missing"), or storage failed ("trouble"). BACK TO ELEVATOR still works. */
  | { phase: 'failed'; game: MiniGameEntry; reason: 'missing' | 'trouble'; detail: string }
  | { phase: 'closing'; game: MiniGameEntry };

export interface MiniGameHost {
  get(): HostState;
  subscribe(listener: () => void): () => void;
  /** Games with an unfinished play session for this learner (the entrance offers to go back). */
  unfinished(): readonly MiniGameId[];
  /**
   * Open a game from its landing. False (and nothing changes) unless the director offers it now.
   * `session`: developer tools only, a scripted session (testing/mockSession.ts) instead of the runtime's.
   */
  open(id: MiniGameId, opts?: { session?: MiniGameSession }): Promise<boolean>;
  /** BACK TO ELEVATOR. */
  close(): Promise<void>;
  /** The elevator session is stopping: close the game, resume nothing. */
  dispose(): Promise<void>;
  /** Re-read which games are unfinished. */
  refresh(): Promise<void>;
}

export interface MiniGameHostDeps {
  runtime: GameRuntime;
  learnerId: string;
  director: Director;
  clock: { now(): number };
  /** The elevator's audio engine (the game's sound goes through it). */
  audio: { handle(cues: readonly AudioCue[]): void };
  narration?: Narration | null;
  log?: (kind: string, data: Record<string, unknown>) => void;
  /** Tests: which games there are (a test mission id). Default: catalog.ts. */
  catalog?: readonly MiniGameEntry[];
  newInstanceId?: (game: MiniGameEntry) => string;
}

export function createMiniGameHost(deps: MiniGameHostDeps): MiniGameHost {
  const { runtime, learnerId, director } = deps;
  const catalog = deps.catalog ?? MINI_GAMES;
  const log = (kind: string, data: Record<string, unknown> = {}) => deps.log?.(kind, data);
  const listeners = new Set<() => void>();
  let state: HostState = { phase: 'elevator' };
  let unfinished: MiniGameId[] = [];
  let handle: MiniGameSessionHandle | null = null;
  let opening: Promise<unknown> | null = null;
  let disposed = false;
  let generation = 0;
  let closing: Promise<void> | null = null;

  const set = (next: HostState) => {
    state = next;
    for (const l of listeners) l();
  };
  const putRecord = (value: string) => runtime.putSetting(learnerId, HOST_KEY, value).catch((e: unknown) => log('minigame.recordFailed', { error: String(e) }));

  async function refresh() {
    const found: MiniGameId[] = [];
    for (const g of catalog) {
      try {
        for (const m of new Set([g.missionId, ...(g.missions ?? [])])) {
          if (await runtime.findActiveMission(learnerId, m)) {
            found.push(g.id);
            break;
          }
        }
      } catch {
        // Unreadable: the entrance just says PLAY.
      }
    }
    if (found.join() !== unfinished.join()) {
      unfinished = found;
      for (const l of listeners) l();
    }
  }
  void refresh();

  /** Close the open game once: a second BACK while it closes waits for the first. */
  function shut(resume: boolean): Promise<void> {
    if (state.phase === 'elevator') return Promise.resolve();
    closing ??= closeGame(resume).finally(() => (closing = null));
    return closing;
  }

  async function closeGame(resume: boolean) {
    if (state.phase === 'elevator') return;
    const game = state.game;
    const g = ++generation;
    if (state.phase === 'open') state.sound.stopAll();
    set({ phase: 'closing', game });
    await opening?.catch(() => undefined);
    const h = handle;
    handle = null;
    await h?.close();
    // An orderly stop (leaving, Start Over) is not a crash: the record only survives an app that was killed.
    const cleared = putRecord('');
    if (!resume) return void (await cleared);
    await director.resumeFromGame();
    if (g !== generation || disposed) return;
    log('minigame.host.closed', { game: game.id });
    set({ phase: 'elevator' });
    await refresh();
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unfinished: () => unfinished,
    refresh,

    async open(id, opts = {}) {
      const game = catalog.find((g) => g.id === id);
      if (disposed || !game || state.phase !== 'elevator') return false;
      if (!director.openGame(id)) return false;
      const g = ++generation;
      log('minigame.host.open', { game: id, floor: game.floor, mock: Boolean(opts.session) });
      void putRecord(JSON.stringify({ v: 1, game: id, floor: game.floor } satisfies HostRecord));
      set({ phase: 'opening', game });
      const sound = () => createGameSound({ audio: deps.audio, now: deps.clock.now, narration: deps.narration ?? null, log });
      if (opts.session) {
        set({ phase: 'open', game, session: opts.session, sound: sound() });
        return true;
      }
      const task = openMiniGameSession({ runtime, learnerId, game, clock: deps.clock, log, ...(deps.newInstanceId ? { newInstanceId: () => deps.newInstanceId!(game) } : {}) });
      opening = task;
      try {
        const h = await task;
        if (g !== generation || disposed) {
          await h.close();
          return true;
        }
        handle = h;
        set({ phase: 'open', game, session: h.session, sound: sound() });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        log('minigame.host.failed', { game: id, detail });
        if (g === generation && !disposed) set({ phase: 'failed', game, reason: /Unknown mission/.test(detail) ? 'missing' : 'trouble', detail });
      } finally {
        opening = null;
      }
      return true;
    },

    close: () => shut(true),

    async dispose() {
      if (disposed) return;
      await shut(false);
      disposed = true;
      listeners.clear();
    },
  };
}
