/// <reference types="node" />
// Test support for the royal games: a real runtime over a temp SQLite file with the shipped kingdom
// content, a clock the test moves by hand, and an audio double whose clips the test finishes, cuts or
// refuses. Imported by tests only.
import { loadLearningEvents } from '../../../persistence/store';
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../../runtime/gameRuntime';
import { tempDir } from '../../../runtime/testing/harness';
import { THEME, loadKingdomContent } from '../appContent';
import type { GameAudio, Wait } from './flow';

export const LEARNER = 'learner-storyteller-test';
const content = loadKingdomContent();

/** Timers that run only when the test moves the clock. */
export function testClock() {
  let time = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const wait: Wait = (ms, fn) => {
    const timer = { at: time + ms, fn };
    timers.push(timer);
    return () => {
      timers = timers.filter((t) => t !== timer);
    };
  };
  return {
    wait,
    /** Move time on, running every timer that comes due (and any it sets that are due too), in order. */
    advance(ms: number) {
      const until = time + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        time = due.at;
        due.fn();
      }
      time = until;
    },
    pending: () => timers.length,
  };
}

/** The kingdom's audio as a game sees it. One clip sequence at a time; the test decides how each ends. */
export function testAudio(options: { whenReady?: boolean; recorded?: (key: string) => boolean } = {}) {
  /** Every say, in order: its keys. */
  const said: string[][] = [];
  const gaps: (number | undefined)[] = [];
  const effects: string[] = [];
  let pending: ((finished: boolean) => void) | null = null;
  let silent = false;
  let other = false;
  let hushes = 0;
  let ready: (() => void)[] = [];
  const end = (finished: boolean) => {
    const report = pending;
    pending = null;
    report?.(finished);
  };
  const audio: GameAudio = {
    say(keys, gapMs, onEnd) {
      end(false);
      said.push([...keys]);
      gaps.push(gapMs);
      // Nothing recorded, the gesture gate closed or sound off: the report comes before say returns.
      if (silent || !keys.some((k) => options.recorded?.(k) ?? true)) {
        onEnd?.(false);
        return;
      }
      pending = onEnd ?? (() => undefined);
    },
    effect: (name) => {
      // The real player refuses an effect while speech is sounding.
      if (!pending) effects.push(name);
    },
    hush() {
      hushes++;
      end(false);
    },
    busy: () => pending !== null || other,
  };
  if (options.whenReady) {
    audio.whenReady = (fn) => {
      ready.push(fn);
      return () => {
        ready = ready.filter((x) => x !== fn);
      };
    };
  }
  return {
    audio,
    said,
    gaps,
    effects,
    /** The last say's keys. */
    last: () => said.at(-1) ?? [],
    /** The clip sequence sounding now finishes by itself. */
    finish: () => end(true),
    /** Something outside the game cuts it (a mute, the castle speaking). */
    cut: () => end(false),
    /** The player never reports the end. */
    lose() {
      pending = null;
    },
    speaking: () => pending !== null,
    /** Sound cannot play (the browser before a first touch, or Sound off). */
    silence(value: boolean) {
      silent = value;
    },
    /** Someone else's clip is sounding. */
    others(value: boolean) {
      other = value;
    },
    /** The first touch: sound may play, and everything waiting for it runs. */
    touch() {
      silent = false;
      const waiting = ready;
      ready = [];
      for (const fn of waiting) fn();
    },
    waiting: () => ready.length,
    hushes: () => hushes,
  };
}
export type TestAudio = ReturnType<typeof testAudio>;

/** A learner, a database file and a runtime that can be killed and reopened. */
export async function testWorld() {
  const tmp = tempDir();
  let time = 100_000;
  const now = () => ++time;
  let db = openNodeDatabase(tmp.file);
  let runtime: GameRuntime = await openGameRuntime(db, content, { now });
  await runtime.createLearner({ id: LEARNER, themePack: THEME });
  const attempts = async () => (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));
  return {
    now,
    runtime: () => runtime,
    db: () => db,
    /** The app is killed: memory gone, the database file reopened. */
    async restart() {
      runtime.dropMemory();
      await db.close();
      db = openNodeDatabase(tmp.file);
      runtime = await openGameRuntime(db, content, { now });
    },
    attempts,
    /** [outcome, wrong tries, assistance] of every attempt, in order. */
    rows: async () => (await attempts()).map((a) => [a.outcome, a.wrongTries, a.assistance]),
    /** Every learning event (attempts and completion records). */
    events: async () => (await loadLearningEvents(db, LEARNER)).length,
    async done() {
      await db.close();
      tmp.cleanup();
    },
  };
}
export type TestWorld = Awaited<ReturnType<typeof testWorld>>;
