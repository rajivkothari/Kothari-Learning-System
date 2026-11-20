/// <reference types="node" />
// Ice Bowling and Garden Golf over the real runtime (node:sqlite) and the shipped kingdom content: only
// a tapped letter is an answer; hearing again, reminders, rolling the ball, NEXT and PLAY AGAIN record
// nothing; the letters are held while the game says the ask; reminders come only in the quiet; leaving,
// an app restart and a lost play save all resume the same turn.
import { readRoyalCompletions, royalProgress } from '../wardrobe';
import type { GameId } from './content';
import { GAMES, shownLine } from './content';
import { MAX_REMINDERS, REMIND_MS, ROLL_MS, SPEECH_CAP_MS, createGameVoice, createLetterGameFlow, gameAudioFrom, idleGameView, type LetterGameFlow } from './flow';
import { spots } from './play';
import { LEARNER, testAudio, testClock, testWorld } from './testing';

const ASK = (word: string) => `voice:Find the first letter in ${word}.`;
const RETRY = 'voice:Listen to the word. Try its first sound again.';
const CLUE = 'voice:Say the word slowly. Listen at the beginning.';
const GUIDED = 'voice:Look at the first letter beside the picture.';
const PLAY = 'game:line.bowling.play';
const CLEARED = 'game:line.bowling.cleared';
const DONE = 'game:line.shared.done';

async function world(options: { whenReady?: boolean; recorded?: (key: string) => boolean } = {}) {
  const w = await testWorld();
  const clock = testClock();
  const a = testAudio(options);
  const open = async (game: GameId) => {
    const flow = createLetterGameFlow({ runtime: w.runtime(), learnerId: LEARNER, game, now: w.now, audio: a.audio, wait: clock.wait });
    await flow.start();
    return flow;
  };
  return { ...w, clock, a, open };
}

/** The test knows the answer from the word (the flow never compares). */
const right = (f: LetterGameFlow) => f.view().options.find((o) => o.letter === f.view().word![0])!.id;
const wrong = (f: LetterGameFlow) => f.view().options.filter((o) => o.letter !== f.view().word![0] && !f.view().tried.includes(o.id)).map((o) => o.id);
/** An aim as far from the shining pin or flag as the lane allows. */
const away = (f: LetterGameFlow) => (spots(f.view().options.length)[f.view().target!]! > 0 ? -1 : 1);

describe('Ice Bowling and Garden Golf', () => {
  it('a whole bowling game is four independent attempts, never the same word twice; nothing else records', async () => {
    const w = await world();
    try {
      expect(idleGameView('bowling')).toMatchObject({ game: 'bowling', stage: 'loading', turns: 4, tries: 2, listening: false });
      const f = await w.open('bowling');
      const words: string[] = [];
      for (let turn = 1; turn <= 4; turn++) {
        const word = f.view().word!;
        words.push(word);
        expect(f.view()).toMatchObject({ game: 'bowling', stage: 'ask', turn, turns: 4, listening: true, line: 'ask', tries: 2 });
        expect(f.view().options).toHaveLength(4);
        expect(w.a.last()).toEqual([ASK(word)]);
        w.a.finish();
        expect(f.view().listening).toBe(false);
        // The ear and the picture repeat the ask; that is never an answer.
        f.hear();
        expect(w.a.last()).toEqual([ASK(word)]);
        w.a.finish();
        // Nothing so far on this turn is evidence: the ask, the ear.
        expect(await w.attempts()).toHaveLength(turn - 1);
        const pick = right(f);
        await f.choose(pick);
        expect(f.view()).toMatchObject({ stage: 'play', word, target: f.view().options.findIndex((o) => o.id === pick), down: [], used: 0, line: 'play', listening: false });
        expect(w.a.last()).toEqual(['effect:success', PLAY]);
        const events = await w.events();
        // The ball is the reward: rolling it and cheering record nothing.
        f.rollAt(f.view().target!);
        expect(f.view()).toMatchObject({ stage: 'cleared', down: [0, 1, 2, 3], used: 1, line: 'cleared', roll: { n: 1, cleared: true } });
        w.clock.advance(ROLL_MS);
        expect(w.a.last()).toEqual(['effect:success', CLEARED]);
        f.hear();
        expect(await w.events()).toBe(events);
        expect(await w.attempts()).toHaveLength(turn);
        await f.next();
      }
      expect(f.view()).toMatchObject({ stage: 'done', line: 'done', word: null });
      expect(w.a.last()).toEqual([DONE]);
      expect(new Set(words).size).toBe(4);
      expect(await w.rows()).toEqual(Array.from({ length: 4 }, () => ['correct', 0, 'independent']));
      expect((await w.attempts()).map((x) => x.activityId)).toEqual(['bowl-letter-1', 'bowl-letter-2', 'bowl-letter-3', 'bowl-letter-4']);
      // A finished game counts toward the garden's royal gifts.
      expect(royalProgress(await readRoyalCompletions(w.db(), LEARNER)).garden).toBe(1);
      // PLAY AGAIN is a new game, not an answer.
      await f.again();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 1, listening: true });
      expect(await w.attempts()).toHaveLength(4);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a whole golf game is three turns of three flags; a putt that misses stays out and the third always drops', async () => {
    const w = await world();
    try {
      const f = await w.open('golf');
      const words: string[] = [];
      for (let turn = 1; turn <= 3; turn++) {
        expect(f.view()).toMatchObject({ game: 'golf', stage: 'ask', turn, turns: 3, tries: 3 });
        expect(f.view().options).toHaveLength(3);
        words.push(f.view().word!);
        w.a.finish();
        await f.choose(right(f));
        const hole = spots(3)[f.view().target!]!;
        f.roll(away(f));
        expect(f.view()).toMatchObject({ stage: 'play', used: 1, roll: { n: 1, cleared: false, x: away(f) } });
        f.roll(away(f));
        expect(f.view()).toMatchObject({ stage: 'play', used: 2, roll: { n: 2, cleared: false } });
        f.roll(away(f));
        expect(f.view()).toMatchObject({ stage: 'cleared', used: 3, roll: { n: 3, cleared: true, x: hole }, down: [] });
        // A fourth putt does nothing.
        f.roll(0);
        expect(f.view().roll!.n).toBe(3);
        await f.next();
      }
      expect(f.view().stage).toBe('done');
      expect(new Set(words).size).toBe(3);
      expect(await w.rows()).toEqual(Array.from({ length: 3 }, () => ['correct', 0, 'independent']));
      expect((await w.attempts()).map((x) => x.activityId)).toEqual(['golf-letter-1', 'golf-letter-2', 'golf-letter-3']);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a wrong letter greys, keeps the same word, says listen again with the ask, and the right one after it is a retry', async () => {
    const w = await world();
    try {
      const f = await w.open('bowling');
      w.a.finish();
      const word = f.view().word!;
      const miss = wrong(f)[0]!;
      await f.choose(miss);
      expect(f.view()).toMatchObject({ stage: 'ask', word, tried: [miss], line: 'retry', miss: 1, listening: true, target: null });
      expect(w.a.last()).toEqual(['effect:retry', RETRY, ASK(word)]);
      // Held while it says so: a tap now is not an answer.
      await f.choose(right(f));
      expect(f.view().stage).toBe('ask');
      w.a.finish();
      // A greyed letter is never sent twice.
      await f.choose(miss);
      expect(f.view()).toMatchObject({ tried: [miss], miss: 1 });
      expect(await w.attempts()).toHaveLength(0);
      await f.choose(right(f));
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('help climbs clue, guided (the first letter shown), then SHOW ME after two misses; then only the shown letter can be chosen', async () => {
    const w = await world();
    try {
      const f = await w.open('bowling');
      w.a.finish();
      const word = f.view().word!;
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven'], line: 'clue', hint: null, listening: false });
      expect(w.a.last()).toEqual([CLUE, ASK(word)]);
      expect(w.a.gaps.at(-1)).toBe(450);
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven', 'guidedSteps'], line: 'guided', hint: word[0], nextHelp: null });
      expect(w.a.last()).toEqual([GUIDED]);
      for (const id of wrong(f).slice(0, 2)) {
        await f.choose(id);
        w.a.finish();
      }
      expect(f.view().nextHelp).toEqual({ kind: 'showAnswer', demonstrated: true });
      await f.help();
      expect(f.view()).toMatchObject({ shown: right(f), line: 'shown', hint: word[0] });
      expect(w.a.last()).toEqual(['slot:line:showSound']);
      // The last wrong letter cannot be chosen any more.
      const other = wrong(f)[0]!;
      await f.choose(other);
      expect(f.view().tried).not.toContain(other);
      await f.choose(right(f));
      expect(await w.rows()).toEqual([['correct', 2, 'demonstrated']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the letters and Help are held while the ask is said; the ear still works; the hold ends with the ask or at the cap', async () => {
    const w = await world();
    try {
      const f = await w.open('bowling');
      const word = f.view().word!;
      expect(f.view().listening).toBe(true);
      await f.choose(right(f));
      await f.help();
      expect(f.view()).toMatchObject({ stage: 'ask', listening: true, help: [], tried: [] });
      expect(await w.events()).toBe(0);
      // The ear starts the ask again and the hold stays.
      f.hear();
      expect(w.a.said).toEqual([[ASK(word)], [ASK(word)]]);
      expect(f.view().listening).toBe(true);
      w.a.finish();
      expect(f.view().listening).toBe(false);
      // Once heard, hearing it again does not hold.
      f.hear();
      expect(f.view().listening).toBe(false);
      await f.choose(right(f));
      expect(f.view().stage).toBe('play');
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a clip that never reports its end holds for the cap at most; a cap while audio still sounds leaves the reminder to the real end', async () => {
    const w = await world();
    try {
      // The player loses the report: the cap is the end, and the reminder is armed from there.
      const f = await w.open('bowling');
      w.a.lose();
      w.clock.advance(SPEECH_CAP_MS - 1);
      expect(f.view().listening).toBe(true);
      w.clock.advance(1);
      expect(f.view().listening).toBe(false);
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(2);
      f.dispose();
      // A very long clip: the hold ends at the cap, but no reminder talks over it.
      const g = await w.open('golf');
      const said = w.a.said.length;
      w.clock.advance(SPEECH_CAP_MS);
      expect(g.view().listening).toBe(false);
      expect(w.a.speaking()).toBe(true);
      w.clock.advance(REMIND_MS * 3);
      expect(w.a.said).toHaveLength(said);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(said + 1);
      g.dispose();
    } finally {
      await w.done();
    }
  });

  it('reminds twice in the quiet, then the ear glows until the next touch; never over a clip, never once the letter is found', async () => {
    const w = await world();
    try {
      const f = await w.open('bowling');
      const word = f.view().word!;
      // Not while the ask is being said.
      w.clock.advance(REMIND_MS * 2);
      expect(w.a.said).toHaveLength(1);
      w.a.finish();
      w.clock.advance(REMIND_MS - 1);
      expect(w.a.said).toHaveLength(1);
      w.clock.advance(1);
      expect(w.a.said).toEqual([[ASK(word)], [ASK(word)]]);
      // A reminder does not hold the letters.
      expect(f.view()).toMatchObject({ listening: false, nudge: false });
      w.clock.advance(REMIND_MS * 2);
      expect(w.a.said).toHaveLength(2);
      w.a.finish();
      // Someone else's clip is sounding when the second is due: it waits for the quiet.
      w.a.others(true);
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(2);
      w.a.others(false);
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(3);
      expect(MAX_REMINDERS).toBe(2);
      expect(f.view().nudge).toBe(false);
      w.a.finish();
      expect(f.view().nudge).toBe(true);
      w.clock.advance(REMIND_MS * 5);
      expect(w.a.said).toHaveLength(3);
      // A touch ends the glow and the count starts over.
      f.hear();
      expect(f.view().nudge).toBe(false);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(5);
      w.a.finish();
      expect(await w.events()).toBe(0);
      // No reminder while the ball waits to be rolled.
      await f.choose(right(f));
      w.a.finish();
      const said = w.a.said.length;
      w.clock.advance(REMIND_MS * 5);
      expect(w.a.said).toHaveLength(said);
      expect(f.view().nudge).toBe(false);
      f.dispose();
      expect(w.clock.pending()).toBe(0);
    } finally {
      await w.done();
    }
  });

  it('in the browser an ask that could not play is said at the first touch, and holds the letters then', async () => {
    const w = await world({ whenReady: true });
    try {
      w.a.silence(true);
      const f = await w.open('bowling');
      const word = f.view().word!;
      // Nothing could play: nothing is held, and the ask waits for the touch.
      expect(f.view().listening).toBe(false);
      expect(w.a.waiting()).toBe(1);
      // Reminders that cannot play do not use the wait up.
      w.clock.advance(REMIND_MS * 3);
      expect(w.a.waiting()).toBe(1);
      expect(f.view().nudge).toBe(true);
      w.a.touch();
      expect(w.a.last()).toEqual([ASK(word)]);
      expect(f.view()).toMatchObject({ listening: true, nudge: false });
      expect(w.a.waiting()).toBe(0);
      w.a.finish();
      f.dispose();
      // Still no sound at the touch (Sound off): it is tried once, never in a loop.
      w.a.silence(true);
      const g = await w.open('golf');
      const said = w.a.said.length;
      w.a.touch();
      w.a.silence(true);
      expect(w.a.said.length).toBeLessThanOrEqual(said + 1);
      expect(w.a.waiting()).toBe(0);
      g.dispose();
      // The ear before the touch says the ask itself: nothing is left waiting to say it twice.
      w.a.silence(true);
      const h = await w.open('golf');
      expect(w.a.waiting()).toBe(1);
      w.a.silence(false);
      h.hear();
      expect(w.a.waiting()).toBe(0);
      h.dispose();
    } finally {
      await w.done();
    }
  });

  it('bowling: a ball off the shining pin knocks down what it reaches, a fallen pin stays down, and the second ball always clears', async () => {
    const w = await world();
    try {
      const f = await w.open('bowling');
      // Nothing rolls while the question is open.
      f.roll(0);
      f.rollAt(0);
      expect(f.view().roll).toBeNull();
      w.a.finish();
      await f.choose(right(f));
      const target = f.view().target!;
      const far = target === 0 ? 3 : 0;
      f.rollAt(9);
      expect(f.view().roll).toBeNull();
      f.rollAt(far);
      expect(f.view()).toMatchObject({ stage: 'play', down: [far], used: 1, roll: { n: 1, aim: spots(4)[far], hit: [far], cleared: false } });
      // No cheer for a ball that did not clear.
      w.clock.advance(ROLL_MS);
      expect(w.a.last()).toEqual(['effect:success', PLAY]);
      f.rollAt(far);
      expect(f.view()).toMatchObject({ stage: 'cleared', used: 2, roll: { n: 2, x: spots(4)[target], cleared: true } });
      expect([...f.view().down].sort()).toEqual([0, 1, 2, 3]);
      // NEXT before the cheer: the cheer is dropped, not said over the next ask.
      await f.next();
      const word = f.view().word!;
      w.clock.advance(ROLL_MS);
      expect(w.a.last()).toEqual([ASK(word)]);
      expect(await w.attempts()).toHaveLength(1);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('leaving, coming back and an app restart resume the same word, its greyed letter and the ball where it was', async () => {
    const w = await world();
    try {
      let f = await w.open('bowling');
      w.a.finish();
      const word = f.view().word!;
      const miss = wrong(f)[0]!;
      await f.choose(miss);
      await f.flush();
      f.dispose();
      f = await w.open('bowling');
      expect(f.view()).toMatchObject({ stage: 'ask', word, tried: [miss], listening: true });
      w.a.finish();
      await f.choose(right(f));
      const target = f.view().target!;
      const far = target === 0 ? 3 : 0;
      const letters = f.view().options;
      f.rollAt(far);
      await f.flush();
      await w.restart();
      f = await w.open('bowling');
      // The ball is still waiting, one try used, the same pin down.
      expect(f.view()).toMatchObject({ stage: 'play', turn: 1, word, target, down: [far], used: 1, options: letters, listening: false });
      expect(w.a.last()).toEqual([PLAY]);
      f.rollAt(far);
      expect(f.view().stage).toBe('cleared');
      await f.flush();
      f.dispose();
      f = await w.open('bowling');
      expect(f.view()).toMatchObject({ stage: 'cleared', word, target });
      expect(f.view().down).toHaveLength(4);
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2 });
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a lost play save costs only the ball: the turn is already answered and NEXT goes on', async () => {
    const w = await world();
    try {
      let f = await w.open('golf');
      w.a.finish();
      await f.choose(right(f));
      await f.flush();
      f.dispose();
      await w.runtime().putSetting(LEARNER, 'kingdom.play.golf', '{ not json');
      f = await w.open('golf');
      expect(f.view()).toMatchObject({ stage: 'cleared', turn: 1, word: null, options: [], target: null });
      f.roll(0);
      expect(f.view().roll).toBeNull();
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2 });
      // A save from another instance, or with a broken shape, is ignored the same way.
      w.a.finish();
      await f.choose(right(f));
      await f.flush();
      f.dispose();
      await w.runtime().putSetting(LEARNER, 'kingdom.play.golf', JSON.stringify({ v: 1, instance: 'someone-else', key: 'cheer-2', tried: [], word: 'sun', options: [], target: 0, down: [], used: 0, cleared: false }));
      f = await w.open('golf');
      expect(f.view()).toMatchObject({ stage: 'cleared', turn: 2, word: null });
      expect(await w.rows()).toEqual([['correct', 0, 'independent'], ['correct', 0, 'independent']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a closing game hushes only its own speech', async () => {
    const w = await world();
    try {
      // Its ask is sounding: closing stops it.
      let f = await w.open('bowling');
      f.dispose();
      expect(w.a.hushes()).toBe(1);
      expect(w.a.speaking()).toBe(false);
      // Its ask is over and the castle is talking: closing leaves that alone.
      f = await w.open('bowling');
      w.a.finish();
      w.a.others(true);
      f.dispose();
      expect(w.a.hushes()).toBe(1);
      // Nothing happens after it has closed.
      const seen = w.a.said.length;
      f.hear();
      await f.choose('a');
      w.clock.advance(REMIND_MS * 3);
      expect(w.a.said).toHaveLength(seen);
    } finally {
      await w.done();
    }
  });
});

describe('the game narration contract (game: clips may not be recorded yet)', () => {
  it('with no game clips both letter games play through: the lines are text, nothing holds on audio that cannot play', async () => {
    const w = await world({ recorded: (key) => !key.startsWith('game:') });
    try {
      for (const game of ['bowling', 'golf'] as const) {
        const f = await w.open(game);
        for (let turn = 1; turn <= f.view().turns; turn++) {
          // The ask is the kingdom's own recording: it still holds the letters until it ends.
          expect(f.view().listening).toBe(true);
          w.a.finish();
          await f.choose(right(f));
          // "Now roll the ball" has no recording: only the chime sounds, the line is on screen, and nothing is held.
          expect(f.view()).toMatchObject({ stage: 'play', line: 'play', listening: false });
          expect(w.a.last()).toEqual(['effect:success', PLAY]);
          w.a.finish();
          expect(shownLine(f.view().line, {}, game)).toBe(game === 'golf' ? 'You found it! Now putt the ball.' : GAMES.lines.play);
          for (let i = 0; i < f.view().tries && f.view().stage === 'play'; i++) f.roll(away(f));
          w.clock.advance(ROLL_MS);
          expect(f.view()).toMatchObject({ stage: 'cleared', line: 'cleared', listening: false });
          expect(w.a.last()).toEqual(['effect:success', CLEARED]);
          w.a.finish();
          await f.next();
        }
        expect(f.view()).toMatchObject({ stage: 'done', line: 'done' });
        expect(shownLine('done')).toBe('You finished the game!');
        f.dispose();
      }
      expect(await w.rows()).toEqual(Array.from({ length: 7 }, () => ['correct', 0, 'independent']));
    } finally {
      await w.done();
    }
  });

  it('Garden Golf says its own putt line when it is registered, and the bowling line until then', async () => {
    for (const [recorded, said] of [[() => true, 'game:line.golf.play'], [(k: string) => k !== 'game:line.golf.play', PLAY]] as const) {
      const w = await world({ recorded });
      try {
        const f = await w.open('golf');
        w.a.finish();
        await f.choose(right(f));
        expect(w.a.last()).toEqual(['effect:success', said]);
        w.a.finish();
        f.hear();
        expect(w.a.last()).toEqual([said]);
        f.dispose();
        // Bowling keeps its own line either way.
        const b = await w.open('bowling');
        w.a.finish();
        await b.choose(right(b));
        expect(w.a.last()).toEqual(['effect:success', PLAY]);
        b.dispose();
      } finally {
        await w.done();
      }
    }
  });

  it('gameAudioFrom passes the kingdom audio through: sequences, effects, hush, busy, what is recorded, the first touch', () => {
    const calls: unknown[][] = [];
    const ready: (() => void)[] = [];
    const audio = gameAudioFrom({
      sequence: (keys, gap, onEnd) => { calls.push(['sequence', keys, gap]); onEnd?.(false); return false; },
      play: (name) => { calls.push(['play', name]); return true; },
      hush: () => { calls.push(['hush']); },
      busy: () => true,
      has: (key) => key === 'game:word.fox',
      whenReady: (fn) => { ready.push(fn); return () => undefined; },
    });
    const ends: boolean[] = [];
    audio.say(['game:word.fox'], 400, (x) => ends.push(x));
    audio.effect('place');
    audio.hush();
    expect(calls).toEqual([['sequence', ['game:word.fox'], 400], ['play', 'place'], ['hush']]);
    expect(ends).toEqual([false]);
    expect([audio.busy?.(), audio.has('game:word.fox'), audio.has('game:word.box')]).toEqual([true, true, false]);
    audio.whenReady?.(() => undefined);
    expect(ready).toHaveLength(1);
    expect(gameAudioFrom({ sequence: () => true, play: () => true, hush: () => undefined, busy: () => false, has: () => true }).whenReady).toBeUndefined();
  });
});

describe('the game voice', () => {
  it('a newer say takes over: the older one’s end is ignored and only the newer settles', () => {
    const clock = testClock();
    const a = testAudio();
    const held: boolean[] = [];
    let quiet = 0;
    const ends: string[] = [];
    const v = createGameVoice(a.audio, clock.wait, { hold: (h) => held.push(h), quiet: () => quiet++ });
    expect(v.say(['game:a'], { hold: true, onEnd: (ok) => ends.push(`a ${ok}`) })).toBe(true);
    expect(v.say(['game:b'], { onEnd: (ok) => ends.push(`b ${ok}`) })).toBe(true);
    // The newer say does not hold, so the hold of the older one is released.
    expect(held).toEqual([true, false]);
    expect([ends, quiet]).toEqual([[], 0]);
    expect(v.speaking()).toBe(true);
    a.finish();
    expect([ends, quiet, v.speaking()]).toEqual([['b true'], 1, false]);
    // A say that cannot start settles at once and says so.
    a.silence(true);
    expect(v.say(['game:c'], { hold: true, onEnd: (ok) => ends.push(`c ${ok}`) })).toBe(false);
    expect([ends, quiet, held]).toEqual([['b true', 'c false'], 2, [true, false, true, false]]);
    // Cut from outside (a mute): it settles as not finished.
    a.silence(false);
    v.say(['game:d'], { onEnd: (ok) => ends.push(`d ${ok}`) });
    a.cut();
    expect([ends.at(-1), quiet]).toEqual(['d false', 3]);
    // stop() hushes its own speech only, and reports no quiet.
    v.say(['game:e']);
    v.stop();
    expect([a.hushes(), quiet]).toEqual([1, 3]);
    v.stop();
    expect(a.hushes()).toBe(1);
    v.dispose();
    expect(v.say(['game:f'])).toBe(false);
    expect(clock.pending()).toBe(0);
  });
});
