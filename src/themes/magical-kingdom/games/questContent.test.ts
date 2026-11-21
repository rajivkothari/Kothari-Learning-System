/// <reference types="node" />
// The Royal Quest over the real runtime (node:sqlite) and the shipped kingdom content: each quest is the
// five turns of its table, played by the same flow with each turn's own rules; the three quests rotate;
// the rotation setting is never evidence and is recovered from the runtime's own record.
import { readRoyalCompletions, royalProgress } from '../wardrobe';
import { CHOICE_GAMES, QUEST_MISSIONS, QUEST_TURNS, clip, findItem, questTurns, rhymeAskId, validateQuests, type Kind } from './choiceContent';
import { QUEST_KEY, createChoiceFlow, idleChoiceView, type ChoiceFlow } from './choiceFlow';
import { LEARNER, hearOut, helped, testAudio, testClock, testWorld } from './testing';

const HOW = clip('line.shared.hearThenStar');

async function world() {
  const w = await testWorld();
  const clock = testClock();
  const a = testAudio();
  const open = async () => {
    const flow = createChoiceFlow({ runtime: w.runtime(), learnerId: LEARNER, play: 'quest', now: w.now, audio: a.audio, wait: clock.wait, guardMs: 0 });
    await flow.start();
    return flow;
  };
  const rotation = async () => JSON.parse((await w.runtime().settings(LEARNER))[QUEST_KEY] ?? 'null') as { finished: number; counted: string | null; current: string | null } | null;
  return { ...w, clock, a, open, rotation };
}
type World = Awaited<ReturnType<typeof world>>;

const right = (f: ChoiceFlow) => {
  const t = f.view().task!;
  return t.options.find((o) => o.value === String(findItem(t.itemId)!.correct))!.id;
};
const wrong = (f: ChoiceFlow) => f.view().task!.options.filter((o) => o.id !== right(f)).map((o) => o.id);
const commit = async (f: ChoiceFlow, id: string) => {
  await f.tap(id);
  if (f.view().task?.pickUp && f.view().stage === 'ask') await f.star();
};
/** Play the turn on screen right, first try, and go on. */
const turn = async (w: World, f: ChoiceFlow) => {
  hearOut(w);
  await commit(f, right(f));
  await f.next();
};
const finish = async (w: World, f: ChoiceFlow) => {
  while (f.view().stage === 'ask') await turn(w, f);
};

const TABLE: Record<number, Kind[]> = {
  1: ['rhyme', 'sort', 'hop', 'story', 'sort'],
  2: ['rhyme', 'sort', 'hop', 'story', 'rhyme'],
  3: ['hop', 'rhyme', 'sort', 'story', 'hop'],
};

describe('the Royal Quest', () => {
  it('the three quests play in turn, each five turns of its table with every turn played by its own rules', async () => {
    expect(validateQuests()).toEqual([]);
    expect(idleChoiceView('quest')).toMatchObject({ play: 'quest', stage: 'loading', turns: QUEST_TURNS, quest: null, path: [] });
    const w = await world();
    try {
      const f = await w.open();
      for (const quest of [1, 2, 3, 1]) {
        const mission = QUEST_MISSIONS[quest - 1]!;
        const items: string[] = [];
        for (let n = 1; n <= QUEST_TURNS; n++) {
          const kind = TABLE[quest]![n - 1]!;
          const t = f.view().task!;
          // The path carries each turn's kind; the turn on screen follows the rules of its own kind.
          expect(f.view()).toMatchObject({ play: 'quest', stage: 'ask', quest, turn: n, turns: QUEST_TURNS, path: TABLE[quest], listening: true });
          expect(t).toMatchObject({ kind, pickUp: kind === 'rhyme' || kind === 'story' });
          expect(questTurns(mission)[n - 1]!.items.map((i) => i.id)).toContain(t.itemId);
          expect(t.options).toHaveLength(3);
          expect(f.view().line).toBe(kind === 'story' ? t.question : `ask.${kind}`);
          if (kind === 'sort') expect(CHOICE_GAMES.sets.map((s) => s.join())).toContain(t.options.map((o) => o.value).join());
          if (kind === 'hop') expect(t.options.map((o) => o.value)).toEqual(['1', '2', '3']);
          // A story's first telling begins with the story itself, a sentence a part.
          if (kind === 'story') expect(w.a.last()).toEqual([clip(t.sentences[0]!)]);
          items.push(t.itemId);
          hearOut(w);
          if (t.pickUp) {
            // A tap only picks up; the star commits.
            await f.tap(right(f));
            expect(f.view()).toMatchObject({ stage: 'ask', held: right(f) });
            await f.star();
          } else {
            await f.tap(right(f));
          }
          expect(f.view()).toMatchObject({ stage: 'reward', turn: n, answer: { kind, itemId: t.itemId } });
          f.toy();
          await f.next();
        }
        expect(f.view()).toMatchObject({ stage: 'done', quest, task: null });
        expect(w.a.last()).toEqual([clip('line.shared.done')]);
        expect(new Set(items).size).toBe(QUEST_TURNS);
        await f.flush();
        await f.again();
      }
      // Four quests: twenty independent attempts, one a turn, on each turn's own activity.
      expect(await w.rows()).toEqual(Array.from({ length: 20 }, () => ['correct', 0, 'independent']));
      expect((await w.attempts()).slice(0, 15).map((x) => x.activityId)).toEqual([1, 2, 3].flatMap((q) => [1, 2, 3, 4, 5].map((t) => `quest-${q}-turn-${t}`)));
      // Every finished quest counts toward the garden's royal gifts.
      expect(royalProgress(await readRoyalCompletions(w.db(), LEARNER)).garden).toBe(4);
      // The fifth is quest 2 again.
      expect(f.view()).toMatchObject({ stage: 'ask', quest: 2, turn: 1 });
      expect((await w.rotation())!.finished).toBe(4);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the how-to line is taught once in a quest, on its first picture turn, and a chest or clap turn never says it', async () => {
    const w = await world();
    try {
      const f = await w.open();
      const asks: [Kind, boolean][] = [];
      for (let n = 1; n <= QUEST_TURNS; n++) {
        const from = w.a.said.length - 1;
        const kind = f.view().task!.kind;
        // The whole ask and whatever follows it, heard to the end.
        hearOut(w);
        asks.push([kind, w.a.said.slice(from).flat().includes(HOW)]);
        await turn(w, f);
      }
      expect(asks).toEqual([['rhyme', true], ['sort', false], ['hop', false], ['story', false], ['sort', false]]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a miss and help follow the turn’s own kind inside a quest, and stay on the same item', async () => {
    const w = await world();
    try {
      const f = await w.open();
      // Turn 1 is a rhyme: a committed wrong picture greys and is a miss.
      w.a.finish();
      const first = f.view().task!;
      await commit(f, wrong(f)[0]!);
      expect(f.view()).toMatchObject({ stage: 'ask', miss: 1, listening: true, task: { itemId: first.itemId } });
      expect(w.a.last()).toEqual(['effect:retry', clip('line.shared.retry'), clip(rhymeAskId(first.word!))]);
      w.a.finish();
      await commit(f, right(f));
      await f.next();
      // Turn 2 is a chest: help shows the first letter; the tap answers.
      w.a.finish();
      const chest = f.view().task!;
      await f.help();
      helped(w);
      await f.help();
      expect(f.view()).toMatchObject({ hint: chest.word![0], help: ['highlightGiven', 'guidedSteps'] });
      await f.tap(right(f));
      expect(await w.rows()).toEqual([['correct', 1, 'retry'], ['correct', 0, 'guided']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a quest in play is resumed where it was, whatever the rotation says; the rotation moves on only when a quest is finished', async () => {
    const w = await world();
    try {
      let f = await w.open();
      const first = (await w.rotation())!;
      expect(first).toMatchObject({ finished: 0, counted: null });
      expect(first.current).toContain('royal-quest-1');
      await turn(w, f);
      await turn(w, f);
      const item = f.view().task!.itemId;
      await f.flush();
      f.dispose();
      await w.restart();
      f = await w.open();
      expect(f.view()).toMatchObject({ quest: 1, turn: 3, task: { itemId: item } });
      expect(await w.rotation()).toEqual(first);
      // A rotation that says another quest is next does not abandon the one in play.
      f.dispose();
      await w.runtime().putSetting(LEARNER, QUEST_KEY, JSON.stringify({ finished: 2, counted: null, current: null }));
      f = await w.open();
      expect(f.view()).toMatchObject({ quest: 1, turn: 3, task: { itemId: item } });
      await finish(w, f);
      await f.flush();
      // Finishing counts once: 2 before, 3 now, and the next quest is the first again.
      expect(await w.rotation()).toMatchObject({ finished: 3, counted: first.current, current: first.current });
      await f.again();
      expect(f.view()).toMatchObject({ quest: 1, turn: 1 });
      expect(await w.attempts()).toHaveLength(5);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the rotation is recovered from the runtime’s record: a finish that was never counted, and a setting that was lost', async () => {
    const w = await world();
    try {
      let f = await w.open();
      const before = (await w.rotation())!;
      await finish(w, f);
      await f.flush();
      f.dispose();
      // The app died after the last step was committed and before the count was written.
      await w.runtime().putSetting(LEARNER, QUEST_KEY, JSON.stringify(before));
      await w.restart();
      f = await w.open();
      // The app comes back to the end of the quest it died on (its path walked), and the finish is counted now.
      expect(f.view()).toMatchObject({ stage: 'done', quest: 1, turn: QUEST_TURNS, path: TABLE[1] });
      await f.flush();
      expect(await w.rotation()).toMatchObject({ finished: 1, counted: before.current });
      // Opening again does not count the same finish twice; leaving the end screen, the card starts the next quest.
      f.dispose();
      f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'done', quest: 1 });
      await f.leave();
      f.dispose();
      f = await w.open();
      expect(f.view()).toMatchObject({ quest: 2, turn: 1 });
      expect((await w.rotation())!.finished).toBe(1);
      await finish(w, f);
      await f.leave();
      f.dispose();
      // The setting is gone or unreadable: the finished quests are counted from the runtime.
      await w.runtime().putSetting(LEARNER, QUEST_KEY, 'not json');
      f = await w.open();
      expect(f.view()).toMatchObject({ quest: 3, turn: 1 });
      expect((await w.rotation())!.finished).toBe(2);
      // The rotation is a setting, never evidence: ten attempts, two finished quests.
      expect(await w.attempts()).toHaveLength(10);
      expect(royalProgress(await readRoyalCompletions(w.db(), LEARNER)).garden).toBe(2);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the rotation is written in order: Play again while the play save is still being written leaves `current` naming the new quest', async () => {
    const w = await world();
    try {
      const f = await w.open();
      for (let n = 1; n <= QUEST_TURNS; n++) {
        hearOut(w);
        await commit(f, right(f));
        // The toy queues a play save; the count of the finished quest then queues behind it.
        f.toy();
        await f.next();
      }
      expect(f.view()).toMatchObject({ stage: 'done', quest: 1 });
      // Those writes are still queued when Play again opens the next quest and names it.
      await f.again();
      expect(f.view()).toMatchObject({ stage: 'ask', quest: 2 });
      await f.flush();
      const saved = (await w.rotation())!;
      expect(saved).toMatchObject({ finished: 1 });
      expect(saved.current).toMatch(/^royal-quest-2-/);
      expect(saved.counted).toMatch(/^royal-quest-1-/);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a quest and the single games keep separate play saves and never share an instance', async () => {
    const w = await world();
    try {
      const quest = await w.open();
      w.a.finish();
      const held = right(quest);
      await quest.tap(held);
      await quest.flush();
      quest.dispose();
      const rhymes = createChoiceFlow({ runtime: w.runtime(), learnerId: LEARNER, play: 'rhyme', now: w.now, audio: w.a.audio, wait: w.clock.wait });
      await rhymes.start();
      expect(rhymes.view()).toMatchObject({ play: 'rhyme', quest: null, turn: 1, held: null });
      w.a.finish();
      await commit(rhymes, right(rhymes));
      await rhymes.flush();
      rhymes.dispose();
      const back = await w.open();
      expect(back.view()).toMatchObject({ play: 'quest', quest: 1, turn: 1, held });
      expect((await w.attempts()).map((x) => x.activityId)).toEqual(['rhyme-turn-1']);
      back.dispose();
    } finally {
      await w.done();
    }
  });
});
