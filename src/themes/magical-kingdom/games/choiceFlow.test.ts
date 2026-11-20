/// <reference types="node" />
// The four picture games over the real runtime (node:sqlite) and the shipped kingdom content: only a
// committed choice is an answer; picking a picture up, hearing again, reminders, the toy, NEXT and PLAY
// AGAIN record nothing; the choices are held while the game says the ask; the how-to line and a story
// are said until heard to their end; leaving, an app restart and a lost play save resume the same turn.
import { readRoyalCompletions, royalProgress } from '../wardrobe';
import { CHOICE_GAMES, GUIDED_SORT, clip, findItem, lineText, questTurns, rhymeAskId, wordKey, type ChoiceGameId, type PlayId } from './choiceContent';
import { BEAT_MS, MAX_PLAYS, createChoiceFlow, idleChoiceView, type ChoiceFlow } from './choiceFlow';
import { REMIND_MS } from './flow';
import { LEARNER, testAudio, testClock, testWorld } from './testing';

const HOW = clip('line.shared.hearThenStar');
const RETRY = clip('line.shared.retry');

async function world(options: { whenReady?: boolean; recorded?: (key: string) => boolean } = {}) {
  const w = await testWorld();
  const clock = testClock();
  const a = testAudio(options);
  const open = async (play: PlayId) => {
    const flow = createChoiceFlow({ runtime: w.runtime(), learnerId: LEARNER, play, now: w.now, audio: a.audio, wait: clock.wait });
    await flow.start();
    return flow;
  };
  return { ...w, clock, a, open };
}
type World = Awaited<ReturnType<typeof world>>;

/** The test knows the answers from the authored items (the flow never reads them). */
const right = (f: ChoiceFlow) => {
  const t = f.view().task!;
  return t.options.find((o) => o.value === String(findItem(t.itemId)!.correct))!.id;
};
const wrong = (f: ChoiceFlow) => f.view().task!.options.filter((o) => o.id !== right(f) && !f.view().tried.includes(o.id)).map((o) => o.id);
/** Commit a choice the way this turn's kind is played: pick it up then the star, or just the tap. */
const commit = async (f: ChoiceFlow, id: string) => {
  await f.tap(id);
  if (f.view().task?.pickUp && f.view().stage === 'ask') await f.star();
};
/** Open a game on a turn of its own with the first ask heard. */
const ready = async (w: World, play: PlayId) => {
  const f = await w.open(play);
  w.a.finish();
  return f;
};
/** The short ask of the turn on screen, with every clip recorded (a rhyme's is its whole recorded sentence). */
const short = (f: ChoiceFlow) => {
  const t = f.view().task!;
  return t.kind === 'story' ? [clip(t.question!)] : t.kind === 'rhyme' ? [clip(rhymeAskId(t.word!))] : [wordKey(t.word!), clip(`line.${t.kind}.ask`)];
};

describe('the four picture games', () => {
  it.each<[ChoiceGameId, number, string]>([['rhyme', 4, 'rhyme-turn'], ['sort', 6, 'sort-turn'], ['hop', 4, 'hop-turn'], ['story', 3, 'story-turn']])('a whole game of %s is %i independent attempts, never the same item twice; nothing else records', async (play, turns, activity) => {
    const w = await world();
    try {
      expect(idleChoiceView(play)).toMatchObject({ play, stage: 'loading', turns, path: Array.from({ length: turns }, () => play), quest: null, task: null, listening: false });
      const f = await w.open(play);
      const items: string[] = [];
      for (let turn = 1; turn <= turns; turn++) {
        const t = f.view().task!;
        items.push(t.itemId);
        expect(f.view()).toMatchObject({ play, stage: 'ask', turn, turns, quest: null, listening: true, task: { kind: play, pickUp: play === 'rhyme' || play === 'story' } });
        expect(f.view().path).toEqual(Array.from({ length: turns }, () => play));
        expect(t.options).toHaveLength(3);
        expect(questTurns(CHOICE_GAMES.games[play].mission)[turn - 1]!.items.map((i) => i.id)).toContain(t.itemId);
        w.a.finish();
        // The ear, a picked-up picture and the star with nothing in it are never answers.
        f.hear();
        w.a.finish();
        if (t.pickUp) {
          await f.star();
          await f.tap(wrong(f)[0]!);
          await f.tap(right(f));
          expect(f.view().held).toBe(right(f));
        }
        expect(await w.attempts()).toHaveLength(turn - 1);
        const pick = right(f);
        await commit(f, pick);
        expect(f.view()).toMatchObject({ stage: 'reward', turn, answer: { kind: play, itemId: t.itemId, optionId: pick }, held: null, plays: 0, listening: false });
        // The turn stays on screen through the celebration.
        expect(f.view().task!.itemId).toBe(t.itemId);
        const events = await w.events();
        f.toy();
        f.hear();
        expect(await w.events()).toBe(events);
        await f.next();
      }
      expect(f.view()).toMatchObject({ stage: 'done', task: null, answer: null, line: 'line.shared.done' });
      expect(w.a.last()).toEqual([clip('line.shared.done')]);
      expect(new Set(items).size).toBe(turns);
      expect(await w.rows()).toEqual(Array.from({ length: turns }, () => ['correct', 0, 'independent']));
      expect((await w.attempts()).map((x) => x.activityId)).toEqual(Array.from({ length: turns }, (_, i) => `${activity}-${i + 1}`));
      // A finished game counts toward the garden's royal gifts; PLAY AGAIN is a new game, not an answer.
      expect(royalProgress(await readRoyalCompletions(w.db(), LEARNER)).garden).toBe(1);
      await f.again();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 1, listening: true });
      expect(await w.attempts()).toHaveLength(turns);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('rhymes: a tap picks a picture up and says its word; only the star commits; a miss greys it and keeps the word', async () => {
    const w = await world();
    try {
      const f = await ready(w, 'rhyme');
      const t = f.view().task!;
      expect(f.view().line).toBe('ask.rhyme');
      // Print after sound: the printed ask never names the word.
      expect(lineText(f.view().line)).not.toContain(t.word!);
      const [miss, other] = wrong(f) as [string, string];
      const value = (id: string) => t.options.find((o) => o.id === id)!.value;
      await f.tap(miss);
      expect(f.view()).toMatchObject({ held: miss, stage: 'ask', listening: false });
      expect(w.a.last()).toEqual([wordKey(value(miss))]);
      // Picking another up just swaps it.
      await f.tap(other);
      expect(f.view().held).toBe(other);
      await f.tap(miss);
      expect(await w.events()).toBe(0);
      await f.star();
      expect(f.view()).toMatchObject({ stage: 'ask', tried: [miss], held: null, miss: 1, line: 'line.shared.retry', listening: true });
      expect(w.a.last()).toEqual(['effect:retry', RETRY, clip(rhymeAskId(t.word!))]);
      // Held while it says so: nothing can be picked up or committed.
      await f.tap(right(f));
      await f.star();
      expect(f.view()).toMatchObject({ held: null, stage: 'ask' });
      w.a.finish();
      // A greyed picture cannot be picked up again.
      await f.tap(miss);
      expect(f.view().held).toBeNull();
      expect(f.view().task!.itemId).toBe(t.itemId);
      const pick = right(f);
      await f.tap(pick);
      await f.star();
      expect(f.view()).toMatchObject({ stage: 'reward', line: 'line.rhyme.right', answer: { value: value(pick) } });
      expect(w.a.last()).toEqual(['effect:success', wordKey(t.word!), wordKey(value(pick)), clip('line.rhyme.right'), clip('line.rhyme.play')]);
      // The pair is printed now, never before.
      expect(f.view().answer!.print.map((p) => p.word)).toEqual([t.word, value(pick)]);
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('chests and claps: the tap answers; the choices stand in their own order; a right chest says its sound', async () => {
    const w = await world();
    try {
      const f = await w.open('sort');
      const t = f.view().task!;
      expect(w.a.last()).toEqual([wordKey(t.word!), clip('line.sort.ask')]);
      expect(t.options.map((o) => o.value)).toEqual([...t.options.map((o) => o.value)].sort());
      expect(CHOICE_GAMES.sets.map((s) => s.join())).toContain(t.options.map((o) => o.value).join());
      w.a.finish();
      // The star is not part of this game.
      await f.star();
      expect(w.a.said).toHaveLength(1);
      const miss = wrong(f)[0]!;
      await f.tap(miss);
      expect(f.view()).toMatchObject({ stage: 'ask', tried: [miss], held: null, listening: true });
      expect(w.a.last()).toEqual(['effect:retry', RETRY, wordKey(t.word!), clip('line.sort.ask')]);
      w.a.finish();
      await f.tap(right(f));
      const letter = t.word![0]!;
      expect(w.a.last()).toEqual(['effect:success', `slot:sound:${letter}`, wordKey(t.word!), clip('line.sort.right'), clip('line.sort.play')]);
      expect(f.view().answer).toMatchObject({ value: letter, print: [{ word: t.word, gold: [0, 1] }] });
      f.dispose();
      const g = await w.open('hop');
      const h = g.view().task!;
      expect(w.a.last()).toEqual([wordKey(h.word!), clip('line.hop.ask')]);
      expect(h.options.map((o) => o.value)).toEqual(['1', '2', '3']);
      w.a.finish();
      await g.tap(right(g));
      const beats = CHOICE_GAMES.beats[h.word!]!;
      expect(w.a.last()).toEqual(['effect:success', clip(`line.hop.right${beats}`), clip('line.hop.play')]);
      expect(g.view()).toMatchObject({ line: `line.hop.right${beats}`, answer: { beats, print: [{ word: h.word, gold: null }] } });
      expect(await w.rows()).toEqual([['correct', 1, 'retry'], ['correct', 0, 'independent']]);
      g.dispose();
    } finally {
      await w.done();
    }
  });

  it('the how-to line ends every ask of a picture turn until it has been heard to its end, and never a chest or clap turn', async () => {
    const w = await world();
    try {
      const f = await w.open('rhyme');
      const ask = short(f);
      expect(w.a.last()).toEqual([...ask, HOW]);
      // The ear cuts the first ask: it starts again, how-to included, and the pictures stay held.
      f.hear();
      expect(w.a.last()).toEqual([...ask, HOW]);
      expect(f.view().listening).toBe(true);
      // Cut from outside: still not heard.
      w.a.cut();
      f.hear();
      expect(w.a.last()).toEqual([...ask, HOW]);
      w.a.finish();
      // Heard to its end: never again this visit, on this turn or the next.
      f.hear();
      expect(w.a.last()).toEqual(ask);
      w.a.finish();
      // A reminder is the short ask.
      w.clock.advance(REMIND_MS);
      expect(w.a.last()).toEqual(ask);
      w.a.finish();
      await commit(f, right(f));
      await f.next();
      expect(w.a.last()).toEqual(short(f));
      f.dispose();
      // The star with nothing picked up says it, and hearing that to its end counts too.
      const g = await w.open('rhyme');
      w.a.cut();
      await g.star();
      expect(w.a.last()).toEqual([HOW]);
      w.a.finish();
      g.hear();
      expect(w.a.last()).toEqual(short(g));
      g.dispose();
      for (const play of ['sort', 'hop'] as const) {
        const h = await w.open(play);
        expect(w.a.last()).not.toContain(HOW);
        h.dispose();
      }
    } finally {
      await w.done();
    }
  });

  it('Story Corner: the story is told before its question until it has been heard to its end; then only the question is asked', async () => {
    const w = await world();
    try {
      const f = await w.open('story');
      const t = f.view().task!;
      const telling = [clip('line.story.intro'), ...t.sentences.map(clip), clip(t.question!), HOW];
      expect(t.sentences).toEqual([1, 2, 3].map((n) => `story.${t.story}.${n}`));
      expect(w.a.last()).toEqual(telling);
      expect(w.a.gaps.at(-1)).toBe(750);
      // The cover shows who the story is about, never an answer, and the line printed is the question.
      expect(t.pictures).toEqual(CHOICE_GAMES.stories[t.story!]!.cover);
      for (const o of t.options) expect(t.pictures).not.toContain(o.value);
      expect(f.view().line).toBe(t.question);
      // A tap during the telling does nothing: the telling is not cut.
      await f.tap(right(f));
      await f.star();
      await f.help();
      expect(w.a.said).toHaveLength(1);
      expect(f.view()).toMatchObject({ listening: true, held: null, help: [] });
      // The ear retells it until it has been heard to its end.
      f.hear();
      expect(w.a.last()).toEqual(telling);
      w.a.cut();
      f.hear();
      expect(w.a.last()).toEqual(telling);
      w.a.finish();
      f.hear();
      expect(w.a.last()).toEqual([clip(t.question!)]);
      expect(w.a.gaps.at(-1)).toBe(400);
      w.a.finish();
      // A miss says listen again and the question, not the whole story.
      const miss = wrong(f)[0]!;
      await commit(f, miss);
      expect(w.a.last()).toEqual(['effect:retry', RETRY, clip(t.question!)]);
      w.a.finish();
      const pick = right(f);
      const word = t.options.find((o) => o.id === pick)!.value;
      await commit(f, pick);
      expect(w.a.last()).toEqual(['effect:success', clip('line.shared.yes'), wordKey(word), clip('line.story.play')]);
      expect(f.view().answer!.print).toEqual([{ word, gold: null }]);
      // The next question: its story is told unless it is the one just heard.
      await f.next();
      const u = f.view().task!;
      const again = [clip('line.story.intro'), ...u.sentences.map(clip), clip(u.question!)];
      expect(w.a.last()).toEqual(u.story === t.story ? [clip(u.question!)] : again);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('help climbs clue, guided, then SHOW ME after two misses; after it only the shown choice can be picked up', async () => {
    const w = await world();
    try {
      // Rhymes: the words, then the words side by side.
      const f = await ready(w, 'rhyme');
      const t = f.view().task!;
      const word = wordKey(t.word!);
      const choices = t.options.map((o) => wordKey(o.value));
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven'], line: 'line.rhyme.clue', listening: false });
      expect(w.a.last()).toEqual([clip('line.rhyme.clue'), word, ...choices]);
      expect(w.a.gaps.at(-1)).toBe(450);
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven', 'guidedSteps'], line: 'line.rhyme.guided', nextHelp: null });
      expect(w.a.last()).toEqual([clip('line.rhyme.guided'), ...choices.flatMap((c) => [word, c])]);
      for (const id of wrong(f)) {
        await commit(f, id);
        w.a.finish();
      }
      expect(f.view().nextHelp).toEqual({ kind: 'showAnswer', demonstrated: true });
      await f.help();
      expect(f.view()).toMatchObject({ shown: right(f), line: 'line.shared.shown' });
      expect(w.a.last()).toEqual([clip('line.shared.shown')]);
      await commit(f, right(f));
      expect(await w.rows()).toEqual([['correct', 2, 'demonstrated']]);
      f.dispose();

      // Chests: the first sound, then the first letter shown beside the picture and said.
      const g = await ready(w, 'sort');
      const s = g.view().task!;
      await g.help();
      expect(w.a.last()).toEqual([clip('line.sort.clue'), wordKey(s.word!), wordKey(s.word!)]);
      expect(g.view().hint).toBeNull();
      await g.help();
      expect(g.view()).toMatchObject({ hint: s.word![0], line: 'guided.sort' });
      expect(w.a.last()).toEqual([GUIDED_SORT, `slot:sound:${s.word![0]}`, wordKey(s.word!)]);
      // SHOW ME: the other chest left cannot be chosen.
      await g.tap(wrong(g)[0]!);
      w.a.finish();
      const last = wrong(g)[0]!;
      await g.tap(last);
      w.a.finish();
      await g.help();
      expect(g.view().shown).toBe(right(g));
      await g.tap(g.view().tried[0]!);
      expect(g.view().tried).toHaveLength(2);
      await g.tap(right(g));
      expect((await w.rows()).at(-1)).toEqual(['correct', 2, 'demonstrated']);
      g.dispose();

      // Stories: the part that holds the answer, then that part and the question.
      const h = await ready(w, 'story');
      const q = h.view().task!;
      const part = clip(q.sentences[q.clue! - 1]!);
      await h.help();
      expect(h.view().line).toBe('line.story.clue');
      expect(w.a.last()).toEqual([clip('line.story.clue'), part]);
      await h.help();
      expect(w.a.last()).toEqual([part, clip(q.question!)]);
      // The printed line never shows the sentence that holds the answer.
      expect(h.view().line).toBe('line.story.clue');
      // After SHOW ME a picture that is not the shown one cannot be picked up.
      await commit(h, wrong(h)[0]!);
      w.a.finish();
      await commit(h, wrong(h)[0]!);
      w.a.finish();
      await h.help();
      await h.tap(h.view().tried[0]!);
      expect(h.view().held).toBeNull();
      await commit(h, right(h));
      expect((await w.rows()).at(-1)).toEqual(['correct', 2, 'demonstrated']);
      h.dispose();
    } finally {
      await w.done();
    }
  });

  it('Bunny Hop: guided help counts the hops out with a tick each, and the toy hops the word’s beats', async () => {
    const w = await world();
    try {
      const f = await ready(w, 'hop');
      const t = f.view().task!;
      const beats = CHOICE_GAMES.beats[t.word!]!;
      await f.help();
      expect(w.a.last()).toEqual([clip('line.hop.clue'), wordKey(t.word!)]);
      await f.help();
      expect(f.view()).toMatchObject({ line: 'line.hop.guided', beat: 0 });
      expect(w.a.last()).toEqual([clip('line.hop.guided'), wordKey(t.word!)]);
      // The hops start when the line has been said.
      w.clock.advance(BEAT_MS * 5);
      expect(f.view().beat).toBe(0);
      const ticks = w.a.effects.length;
      w.a.finish();
      for (let n = 1; n <= beats; n++) {
        expect(f.view().beat).toBe(n);
        expect(w.a.effects.slice(ticks)).toEqual(Array.from({ length: n }, () => 'place'));
        w.clock.advance(BEAT_MS);
      }
      expect(f.view().beat).toBe(beats);
      expect(await w.events()).toBe(0);
      await f.tap(right(f));
      expect(f.view()).toMatchObject({ stage: 'reward', beat: 0, plays: 0, pulse: 0 });
      expect((await w.rows()).at(-1)).toEqual(['correct', 0, 'guided']);
      // The toy: three plays at most, each hopping the beats again.
      w.a.finish();
      for (let play = 1; play <= MAX_PLAYS + 2; play++) {
        f.toy();
        expect(f.view()).toMatchObject({ plays: Math.min(play, MAX_PLAYS), pulse: Math.min(play, MAX_PLAYS) });
        if (play <= MAX_PLAYS) expect(f.view().beat).toBe(1);
        w.clock.advance(BEAT_MS * 3);
        expect(f.view().beat).toBe(beats);
      }
      expect(await w.attempts()).toHaveLength(1);
      // NEXT stops the hopping.
      await f.next();
      expect(f.view().beat).toBe(0);
      w.clock.advance(BEAT_MS * 4);
      expect(f.view().beat).toBe(0);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the toy plays three times at most and bumps the pulse each time; NEXT is there from the start', async () => {
    const w = await world();
    try {
      const f = await ready(w, 'sort');
      // No toy while the question is open.
      f.toy();
      expect(f.view()).toMatchObject({ plays: 0, pulse: 0 });
      await f.tap(right(f));
      w.a.finish();
      for (let play = 1; play <= 5; play++) f.toy();
      expect(f.view()).toMatchObject({ plays: MAX_PLAYS, pulse: MAX_PLAYS });
      expect(w.a.effects.filter((e) => e === 'place').length).toBeGreaterThanOrEqual(MAX_PLAYS);
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2, plays: 0, answer: null });
      w.a.finish();
      // NEXT without the toy.
      await f.tap(right(f));
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 3 });
      expect(await w.attempts()).toHaveLength(2);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('reminds with the short ask in the quiet, twice, then the ear glows; a locked tap does nothing', async () => {
    const w = await world();
    try {
      const f = await w.open('story');
      const question = short(f);
      // Nothing while the story is being told.
      w.clock.advance(REMIND_MS * 2);
      expect(w.a.said).toHaveLength(1);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.last()).toEqual(question);
      expect(f.view().listening).toBe(false);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(3);
      w.a.finish();
      expect(f.view().nudge).toBe(true);
      w.clock.advance(REMIND_MS * 4);
      expect(w.a.said).toHaveLength(3);
      // Picking a picture up is a touch: the glow goes, and the quiet is counted again.
      await f.tap(right(f));
      expect(f.view().nudge).toBe(false);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.last()).toEqual(question);
      w.a.finish();
      await f.star();
      w.a.finish();
      // No reminder during the celebration.
      const said = w.a.said.length;
      w.clock.advance(REMIND_MS * 4);
      expect(w.a.said).toHaveLength(said);
      expect(await w.attempts()).toHaveLength(1);
      f.dispose();
      expect(w.clock.pending()).toBe(0);
    } finally {
      await w.done();
    }
  });

  it('leaving, coming back and an app restart resume the same item with its greyed and picked-up pictures, and the celebration with its print', async () => {
    const w = await world();
    try {
      let f = await ready(w, 'rhyme');
      const item = f.view().task!.itemId;
      const miss = wrong(f)[0]!;
      await commit(f, miss);
      w.a.finish();
      const pick = right(f);
      await f.tap(pick);
      await f.flush();
      f.dispose();
      await w.restart();
      f = await w.open('rhyme');
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 1, tried: [miss], held: pick, listening: true, task: { itemId: item } });
      w.a.finish();
      await f.star();
      const answer = f.view().answer!;
      f.toy();
      f.toy();
      await f.flush();
      f.dispose();
      await w.restart();
      f = await w.open('rhyme');
      // Mid-celebration: the same pair in print, the toy where it was, and the toy line said again.
      expect(f.view()).toMatchObject({ stage: 'reward', turn: 1, answer, plays: 2, pulse: 0, task: { itemId: item }, listening: false });
      expect(w.a.last()).toEqual([clip('line.rhyme.play')]);
      f.toy();
      f.toy();
      expect(f.view().plays).toBe(MAX_PLAYS);
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2 });
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a lost play save costs only the picture of what was answered: NEXT goes on, and an open item starts clean', async () => {
    const w = await world();
    try {
      let f = await ready(w, 'sort');
      await f.tap(right(f));
      await f.flush();
      f.dispose();
      await w.runtime().putSetting(LEARNER, 'kingdom.play.sort', '{ not json');
      f = await w.open('sort');
      expect(f.view()).toMatchObject({ stage: 'reward', turn: 1, task: null, answer: null });
      f.toy();
      expect(f.view().plays).toBe(1);
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2 });
      w.a.finish();
      const miss = wrong(f)[0]!;
      await f.tap(miss);
      await f.flush();
      f.dispose();
      // A save from another instance is not this game's.
      await w.runtime().putSetting(LEARNER, 'kingdom.play.sort', JSON.stringify({ v: 1, instance: 'someone-else', key: 'x', tried: [miss], held: null, task: null, answer: null, plays: 0 }));
      f = await w.open('sort');
      expect(f.view()).toMatchObject({ stage: 'ask', turn: 2, tried: [] });
      w.a.finish();
      // The runtime still knows the miss: the answer is a retry.
      await f.tap(right(f));
      expect(await w.rows()).toEqual([['correct', 0, 'independent'], ['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('in the browser an ask that could not play is said at the first touch; with no game clips recorded the game still plays', async () => {
    const w = await world({ whenReady: true });
    try {
      w.a.silence(true);
      const f = await w.open('story');
      expect(f.view().listening).toBe(false);
      expect(w.a.waiting()).toBe(1);
      const telling = w.a.last();
      w.a.touch();
      expect(w.a.last()).toEqual(telling);
      expect(f.view().listening).toBe(true);
      expect(w.a.waiting()).toBe(0);
      f.dispose();
    } finally {
      await w.done();
    }
    // No `game:` clip exists yet: words the Word Garden recorded still play, everything else is text.
    const quiet = await world({ recorded: (key) => !key.startsWith('game:') });
    try {
      const f = await quiet.open('sort');
      for (let turn = 1; turn <= 6; turn++) {
        // An ask with nothing recorded holds nothing.
        if (!quiet.a.speaking()) expect(f.view().listening).toBe(false);
        quiet.a.finish();
        await f.help();
        await f.help();
        quiet.a.finish();
        await f.tap(right(f));
        expect(f.view().stage).toBe('reward');
        expect(lineText(f.view().line)).toBe('Into the chest!');
        quiet.a.finish();
        f.toy();
        await f.next();
      }
      expect(f.view().stage).toBe('done');
      f.dispose();
      const g = await quiet.open('hop');
      quiet.a.finish();
      await g.help();
      await g.help();
      // The guided line could not be said (or was only the word): the hops are still counted out.
      quiet.a.finish();
      expect(g.view().beat).toBeGreaterThanOrEqual(1);
      g.dispose();
    } finally {
      await quiet.done();
    }
  });

  it('Rhyme Carousel asks in one recorded sentence when it is recorded, and the fragment then the word when it is not', async () => {
    const whole = await world();
    try {
      const f = await whole.open('rhyme');
      const word = f.view().task!.word!;
      expect(whole.a.last()).toEqual([clip(rhymeAskId(word)), HOW]);
      whole.a.finish();
      whole.clock.advance(REMIND_MS);
      expect(whole.a.last()).toEqual([clip(rhymeAskId(word))]);
      f.dispose();
    } finally {
      await whole.done();
    }
    const stitched = await world({ recorded: (key) => !key.startsWith('game:line.rhyme.ask.') });
    try {
      const f = await stitched.open('rhyme');
      const word = f.view().task!.word!;
      expect(stitched.a.last()).toEqual([clip('line.rhyme.ask'), wordKey(word), HOW]);
      stitched.a.finish();
      await f.tap(wrong(f)[0]!);
      await f.star();
      expect(stitched.a.last()).toEqual(['effect:retry', RETRY, clip('line.rhyme.ask'), wordKey(word)]);
      f.dispose();
      // The quest's rhyme turns follow the same rule.
      const q = await stitched.open('quest');
      expect(q.view().task!.kind).toBe('rhyme');
      expect(stitched.a.last()).toEqual([clip('line.rhyme.ask'), wordKey(q.view().task!.word!), HOW]);
      q.dispose();
    } finally {
      await stitched.done();
    }
  });

  it('with no game clips a line is never counted as heard: the how-to and the story come back at every ask, and nothing holds the choices', async () => {
    const quiet = await world({ recorded: (key) => !key.startsWith('game:') });
    try {
      // Stories: nothing of the telling is recorded, so nothing is held and the question is on screen.
      const f = await quiet.open('story');
      const t = f.view().task!;
      const telling = [clip('line.story.intro'), ...t.sentences.map(clip), clip(t.question!), HOW];
      expect(quiet.a.last()).toEqual(telling);
      expect(f.view()).toMatchObject({ listening: false, line: t.question });
      expect(lineText(f.view().line)).not.toBe('');
      expect(quiet.a.speaking()).toBe(false);
      f.hear();
      expect(quiet.a.last()).toEqual(telling);
      // Choices work at once: pick up and commit with the star.
      await commit(f, right(f));
      expect(f.view().stage).toBe('reward');
      expect(await quiet.rows()).toEqual([['correct', 0, 'independent']]);
      f.dispose();
      // Rhymes on a Word Garden word: only the word sounds, and finishing it does not teach the how-to.
      const g = await quiet.open('rhyme');
      const ask = quiet.a.last();
      expect(ask.at(-1)).toBe(HOW);
      quiet.a.finish();
      g.hear();
      expect(quiet.a.last()).toEqual(ask);
      g.dispose();
    } finally {
      await quiet.done();
    }
    // The same games once the clips appear: heard to its end, the story and the how-to are not said again.
    const recorded = await world();
    try {
      const f = await recorded.open('story');
      const t = f.view().task!;
      expect(f.view().listening).toBe(true);
      recorded.a.finish();
      f.hear();
      expect(recorded.a.last()).toEqual([clip(t.question!)]);
      f.dispose();
    } finally {
      await recorded.done();
    }
  });

  it('a closing game hushes only its own speech', async () => {
    const w = await world();
    try {
      let f = await w.open('rhyme');
      f.dispose();
      expect(w.a.hushes()).toBe(1);
      f = await ready(w, 'rhyme');
      w.a.others(true);
      f.dispose();
      expect(w.a.hushes()).toBe(1);
      const seen = w.a.said.length;
      f.hear();
      await f.tap('a');
      await f.star();
      f.toy();
      w.clock.advance(REMIND_MS * 3);
      expect(w.a.said).toHaveLength(seen);
      expect(await w.events()).toBe(0);
    } finally {
      await w.done();
    }
  });
});
