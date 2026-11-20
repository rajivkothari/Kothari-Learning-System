/// <reference types="node" />
// The royal games' copy against the shipped kingdom pack, the recording script and the recordings the
// kingdom already has: every turn can be presented and said, and the validators catch each rule the
// spec names (docs/magical-kingdom/REBUILD_SPEC.md).
import fs from 'node:fs';
import path from 'node:path';

import choiceRaw from '../../../../content/themes/magical-kingdom/choiceGames.json';
import gamesRaw from '../../../../content/themes/magical-kingdom/games.json';
import narration from '../../../../content/themes/magical-kingdom/games-narration.json';
import learning from '../../../../content/themes/magical-kingdom/learning.json';
import ui from '../../../../content/themes/magical-kingdom/ui.json';
import garden from '../../../../content/themes/magical-kingdom/wordGarden.json';
import { REWARD_MISSIONS, loadKingdomContent } from '../appContent';
import {
  CHOICE_GAMES, CHOICE_GAME_IDS, GUIDED_SORT, LINE_CLIPS, PICTURES, QUEST, QUEST_MISSIONS, QUEST_TURNS, clip, findItem, kindOf, lineText, narrationClips, nextQuest, present, printOf,
  questTurns, textOf, turnItems, validateChoiceGames, validateQuests, wordKey,
} from './choiceContent';
import { GAMES, GAME_IDS, gameOfMission, shownLine, turnsOf, validateGames, voice, wordsOf } from './content';

const source = (file: string) => fs.readFileSync(path.join(__dirname, '../audio', file), 'utf8');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
type Pack = { pack: { activities: { id: string; params: { items?: { id: string; correct: string | number; distractors: { value: string | number }[] }[]; words?: { word: string; onset: string }[]; optionCount?: number } }[] }; missions: { missions: { id: string; steps: { id: string }[] }[] } };
const edit = (change: (p: Pack) => void) => {
  const copy = clone(learning) as unknown as Pack;
  change(copy);
  return copy;
};
const activity = (p: Pack, id: string) => p.pack.activities.find((a) => a.id === id)!;

describe('Ice Bowling and Garden Golf copy', () => {
  it('names the games as the spec does and asks every word once at most', () => {
    expect(validateGames(gamesRaw)).toEqual([]);
    expect(GAME_IDS.map((g) => [GAMES.games[g].title, GAMES.games[g].door, GAMES.games[g].mission, GAMES.games[g].choices, GAMES.games[g].tries])).toEqual([
      ['Ice Bowling', 'Bowling', 'royal-bowling', 4, 2],
      ['Garden Golf', 'Golf', 'royal-golf', 3, 3],
    ]);
    expect(turnsOf('bowling').map((t) => [t.stepId, t.activityId, t.choices])).toEqual([1, 2, 3, 4].map((n) => [`turn-${n}`, `bowl-letter-${n}`, 4]));
    expect(turnsOf('golf').map((t) => [t.stepId, t.activityId, t.choices])).toEqual([1, 2, 3].map((n) => [`turn-${n}`, `golf-letter-${n}`, 3]));
    for (const g of GAME_IDS) {
      expect([...wordsOf(g)].sort()).toEqual(['bee', 'cat', 'duck', 'fish', 'fox', 'hat', 'moon', 'sun']);
      expect(gameOfMission(GAMES.games[g].mission)).toBe(g);
    }
    expect(gameOfMission('word-garden')).toBeNull();
  });

  it('says each line with a recording the kingdom has or the games script lists, and never prints the word it asks about', () => {
    const voices = source('sources.ts');
    const reading = source('reading.ts');
    const scripted = new Map(narration.clips.map((c) => [`game:${c.id}`, c.text]));
    for (const g of GAME_IDS) for (const w of wordsOf(g)) expect(voices).toContain(JSON.stringify(voice('ask', { word: w })));
    for (const key of ['retry', 'clue', 'guided'] as const) expect(voices).toContain(JSON.stringify(voice(key)));
    // The same sentences the kingdom recorded for its first-letter flower.
    expect([GAMES.lines.ask, GAMES.lines.retry, GAMES.lines.clue, GAMES.lines.guided]).toEqual([ui.gardenInstruction, ui.gardenRetry, ui.gardenClue, ui.gardenGuided]);
    expect(voice('shown')).toBe('slot:line:showSound');
    expect(reading).toContain(`'${voice('shown')}'`);
    expect(GAMES.lines.shown).toBe(garden.lines.showSound);
    for (const key of ['play', 'cleared', 'done'] as const) expect(scripted.get(voice(key))).toBe(GAMES.lines[key]);
    expect([voice('play'), voice('cleared'), voice('done')]).toEqual(['game:line.bowling.play', 'game:line.bowling.cleared', 'game:line.shared.done']);
    // Print after sound: the printed ask has no word in it; the spoken one does.
    expect(shownLine('ask', { word: 'sun' })).not.toContain('sun');
    expect(voice('ask', { word: 'sun' })).toBe('voice:Find the first letter in sun.');
    expect(shownLine('play')).toBe('You found it! Now roll the ball.');
  });

  it('the validator catches a repeated word, a wrong number of letters and a printed word', () => {
    expect(validateGames(gamesRaw, edit((p) => activity(p, 'bowl-letter-2').params.words!.push({ word: 'sun', onset: 's' })))).toContain('bowling: the word sun could be asked twice in one game');
    expect(validateGames(gamesRaw, edit((p) => { activity(p, 'golf-letter-1').params.optionCount = 4; }))).toContain('golf: golf-letter-1 stands up 4 letters, not 3');
    expect(validateGames({ ...gamesRaw, labels: { ...gamesRaw.labels, ask: 'Find the first letter in {word}.' } })).toContain('labels.ask must not print the word');
    const { done: _done, ...lines } = gamesRaw.lines;
    expect(validateGames({ ...gamesRaw, lines })).toContain('lines.done is missing');
    expect(validateGames(gamesRaw, edit((p) => { p.missions.missions = p.missions.missions.filter((m) => m.id !== 'royal-golf'); }))).toContain('golf: mission royal-golf is missing from the kingdom pack');
  });
});

describe('the picture games and the Royal Quest copy', () => {
  it('ships copy that presents every turn of the four games', () => {
    expect(validateChoiceGames()).toEqual([]);
    expect(CHOICE_GAME_IDS.map((g) => [g, CHOICE_GAMES.games[g].title, CHOICE_GAMES.games[g].door, CHOICE_GAMES.games[g].mission, CHOICE_GAMES.games[g].icon, CHOICE_GAMES.games[g].backdrop, questTurns(CHOICE_GAMES.games[g].mission).length])).toEqual([
      ['rhyme', 'Rhyme Carousel', 'Rhymes', 'rhyme-carousel', 'horse', 'garden', 4],
      ['sort', 'Treasure Chests', 'Chests', 'treasure-sort', 'chest', 'castle', 6],
      ['hop', 'Bunny Hop', 'Bunny', 'bunny-hop', 'bunny', 'garden', 4],
      ['story', 'Story Corner', 'Stories', 'story-corner', 'book', 'castle', 3],
    ]);
    const subjects = (mission: string) => questTurns(mission).map((t) => t.items.map((i) => i.id.slice(i.id.indexOf('-') + 1)));
    expect(subjects('rhyme-carousel')).toEqual([['cat', 'fox'], ['bee', 'moon'], ['fish', 'sun'], ['star', 'duck']]);
    expect(subjects('treasure-sort')).toEqual([['moon', 'bee'], ['fox', 'map'], ['box', 'fish', 'bun'], ['cat', 'duck'], ['sun', 'car'], ['dish', 'star']]);
    expect(subjects('bunny-hop')).toEqual([['star', 'bunny', 'rainbow'], ['apple', 'butterfly', 'moon'], ['cat', 'banana'], ['flower', 'umbrella', 'fish']]);
    expect(subjects('story-corner')).toEqual([['a1', 'b1'], ['a2', 'c1'], ['b2', 'c2']]);
    // The items, as the spec lists them (correct, then distractors).
    const item = (id: string) => [findItem(id)!.correct, ...findItem(id)!.distractors.map((d) => d.value)];
    expect(['cat', 'fox', 'bee', 'moon', 'fish', 'sun', 'star', 'duck'].map((w) => item(`rhyme-${w}`))).toEqual([
      ['hat', 'car', 'moon'], ['box', 'fish', 'key'], ['key', 'bun', 'duck'], ['spoon', 'map', 'fish'], ['dish', 'fox', 'sun'], ['bun', 'star', 'hat'], ['car', 'sun', 'box'], ['truck', 'dish', 'bee'],
    ]);
    expect(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((q) => item(`story-${q}`))).toEqual([['hat', 'fish', 'key'], ['apple', 'bun', 'banana'], ['key', 'hat', 'spoon'], ['box', 'car', 'dish'], ['bun', 'fish', 'apple'], ['moon', 'sun', 'star']]);
    expect(Object.entries(CHOICE_GAMES.beats).map(([w, n]) => `${w} ${n}`)).toEqual(['star 1', 'cat 1', 'moon 1', 'fish 1', 'bunny 2', 'rainbow 2', 'apple 2', 'flower 2', 'butterfly 3', 'banana 3', 'umbrella 3']);
    expect(item('hop-butterfly')[0]).toBe(3);
    expect(item('sort-pig')).toEqual(['p', 'h', 't']);
    expect(findItem('sort-nothing')).toBeNull();
    expect(turnItems('rhyme-turn-1').map((i) => i.id)).toEqual(['rhyme-cat', 'rhyme-fox']);
    expect(Object.fromEntries(Object.entries(CHOICE_GAMES.stories).map(([id, s]) => [id, s.cover]))).toEqual({ a: ['fox', 'snow'], b: ['duck'], c: ['bee', 'cat'] });
    expect(Object.fromEntries(Object.entries(CHOICE_GAMES.questions).map(([id, q]) => [id, q.clue]))).toEqual({ a1: 2, a2: 3, b1: 1, b2: 3, c1: 2, c2: 3 });
  });

  it('a turn is presented from its item id: kind, pictures, what a tap does, and the print after the answer', () => {
    expect(['rhyme-cat', 'sort-moon', 'hop-star', 'story-a1', 'blend-cat'].map(kindOf)).toEqual(['rhyme', 'sort', 'hop', 'story', null]);
    expect(present('rhyme', 'rhyme-cat')).toMatchObject({ subject: 'cat', word: 'cat', pictures: ['cat'], pickUp: true, story: null });
    expect(present('sort', 'sort-moon')).toMatchObject({ word: 'moon', pictures: ['moon'], pickUp: false });
    expect(present('hop', 'hop-butterfly')).toMatchObject({ word: 'butterfly', beats: 3, pickUp: false });
    expect(present('story', 'story-b2')).toMatchObject({ subject: 'b2', word: null, pictures: ['duck'], story: 'b', sentences: ['story.b.1', 'story.b.2', 'story.b.3'], question: 'q.b2', clue: 3, pickUp: true });
    expect(present('rhyme', 'sort-moon')).toBeNull();
    expect(present('story', 'story-z9')).toBeNull();
    // A rhyme pair's shared ending is gold only when the two are spelled alike.
    expect(printOf('rhyme', 'cat', 'hat')).toEqual([{ word: 'cat', gold: [1, 3] }, { word: 'hat', gold: [1, 3] }]);
    expect(printOf('rhyme', 'moon', 'spoon')).toEqual([{ word: 'moon', gold: [1, 4] }, { word: 'spoon', gold: [2, 5] }]);
    expect(printOf('rhyme', 'duck', 'truck')).toEqual([{ word: 'duck', gold: [1, 4] }, { word: 'truck', gold: [2, 5] }]);
    expect(printOf('rhyme', 'bee', 'key')).toEqual([{ word: 'bee', gold: null }, { word: 'key', gold: null }]);
    expect(printOf('sort', 'moon', 'm')).toEqual([{ word: 'moon', gold: [0, 1] }]);
    expect(printOf('hop', 'bunny', '2')).toEqual([{ word: 'bunny', gold: null }]);
    expect(printOf('story', 'a1', 'hat')).toEqual([{ word: 'hat', gold: null }]);
  });

  it('the recording script is the 61 clips of the spec, and every word is said by the Word Garden or the script', () => {
    const clips = narrationClips();
    expect(narration.id).toBe('kingdom-games-narration-v1');
    expect(narration.voice).toMatchObject({ voiceId: 'jemqINv7N9LKUclcLQnU', name: 'Jo M. ~ Friendly Professional Voice', modelId: 'eleven_multilingual_v2' });
    expect(narration.budgetCredits).toBe(1500);
    expect(clips).toHaveLength(61);
    expect(clips.filter((c) => c.kind === 'word').map((c) => c.text)).toEqual(['fox', 'box', 'bee', 'key', 'moon', 'spoon', 'fish', 'dish', 'bun', 'star', 'car', 'duck', 'truck', 'bunny', 'rainbow', 'apple', 'butterfly', 'banana', 'flower', 'umbrella']);
    for (const c of clips.filter((x) => x.kind === 'word')) expect(c.id).toBe(`word.${c.text}`);
    for (const id of LINE_CLIPS) expect(textOf(id)).not.toBe('');
    expect(textOf('line.shared.hearThenStar')).toBe('Tap a picture to hear it. Then tap the star.');
    expect(textOf('story.c.2')).toBe('They ate a big, sweet bun.');
    expect(textOf('q.b2')).toBe('Where was the key?');
    expect(textOf('nothing.here')).toBe('');
    // The Word Garden's five words are reused, not recorded again.
    const reading = source('reading.ts');
    expect(['cat', 'hat', 'sun', 'map', 'pig'].map(wordKey)).toEqual(['slot:word:cat', 'slot:word:hat', 'slot:word:sun', 'slot:word:map', 'slot:word:pig']);
    for (const w of ['cat', 'hat', 'sun', 'map', 'pig']) expect(reading).toContain(`'${wordKey(w)}'`);
    expect(wordKey('fox')).toBe('game:word.fox');
    expect(clip('line.rhyme.ask')).toBe('game:line.rhyme.ask');
    // The chest's guided line is the kingdom's recorded one.
    expect(source('sources.ts')).toContain(JSON.stringify(GUIDED_SORT));
    // What is printed while a question is open never names the word.
    expect(lineText('ask.rhyme')).toBe('Which one rhymes?');
    expect(lineText('guided.sort')).toBe(ui.gardenGuided);
    expect(lineText('line.sort.right')).toBe('Into the chest!');
    // Pictures cover every word any turn can show.
    const words = new Set<string>();
    for (const m of [...CHOICE_GAME_IDS.map((g) => CHOICE_GAMES.games[g].mission), ...QUEST_MISSIONS]) {
      for (const t of questTurns(m)) for (const i of t.items) {
        const p = present(kindOf(i.id)!, i.id)!;
        for (const w of p.pictures) words.add(w);
        if (p.word) words.add(p.word);
        if (t.kind === 'rhyme' || t.kind === 'story') for (const v of [i.correct, ...i.distractors.map((d) => d.value)]) words.add(String(v));
      }
    }
    for (const w of words) expect(PICTURES).toContain(w);
    // Every picture is a file ui/pictures.ts maps, or one of the two code-drawn words.
    const mapped = fs.readFileSync(path.join(__dirname, '../ui/pictures.ts'), 'utf8');
    for (const w of PICTURES) expect(w === 'sun' || w === 'bun' || mapped.includes(`  ${w}: require(`)).toBe(true);
  });

  it('the three quests are the table in the spec', () => {
    expect(validateQuests()).toEqual([]);
    expect([QUEST.title, QUEST.door, QUEST.icon, QUEST.backdrop, QUEST_TURNS]).toEqual(['Royal Quest', 'Quest', 'quest', 'garden', 5]);
    expect(QUEST_MISSIONS).toEqual(['royal-quest-1', 'royal-quest-2', 'royal-quest-3']);
    expect([0, 1, 2, 3, 4, 7].map(nextQuest)).toEqual(['royal-quest-1', 'royal-quest-2', 'royal-quest-3', 'royal-quest-1', 'royal-quest-2', 'royal-quest-2']);
    const table = (mission: string) => questTurns(mission).map((t) => `${t.kind}: ${t.items.map((i) => i.id.slice(i.id.indexOf('-') + 1)).join(', ')}`);
    expect(table('royal-quest-1')).toEqual(['rhyme: moon, star', 'sort: bee, fox, box, bun', 'hop: cat, bunny, butterfly', 'story: a1, a2', 'sort: hat, pig, truck']);
    expect(table('royal-quest-2')).toEqual(['rhyme: cat, duck', 'sort: car, dish, star', 'hop: fish, rainbow, banana', 'story: b1, b2', 'rhyme: sun, moon']);
    expect(table('royal-quest-3')).toEqual(['hop: star, apple, umbrella', 'rhyme: bee, fox', 'sort: hat, pig, truck', 'story: c1, c2', 'hop: fish, flower, butterfly']);
    for (const [q, m] of QUEST_MISSIONS.entries()) {
      expect(questTurns(m).map((t) => [t.stepId, t.activityId])).toEqual([1, 2, 3, 4, 5].map((n) => [`turn-${n}`, `quest-${q + 1}-turn-${n}`]));
      const steps = (learning.missions.missions.find((x) => x.id === m)!.steps as { id: string }[]).map((s) => s.id);
      expect(steps).toEqual(['turn-1', 'cheer-1', 'turn-2', 'cheer-2', 'turn-3', 'cheer-3', 'turn-4', 'cheer-4', 'turn-5', 'magic-restored']);
    }
  });

  it('the validators catch each content rule', () => {
    const items = (p: Pack, id: string) => activity(p, id).params.items!;
    const bad = (change: (p: Pack) => void, quests = false) => (quests ? validateQuests(choiceRaw, edit(change)) : validateChoiceGames(choiceRaw, edit(change)));
    // No item twice in a game or a quest.
    expect(bad((p) => items(p, 'rhyme-turn-2').push(clone(items(p, 'rhyme-turn-1')[0]!)))).toContain('rhyme-carousel: item rhyme-cat could be asked twice');
    expect(bad((p) => items(p, 'quest-1-turn-5').push(clone(items(p, 'quest-1-turn-2')[0]!)), true)).toContain('royal-quest-1: item sort-bee could be asked twice');
    // A chest is the word's first letter, and a turn is one set of chests.
    expect(bad((p) => { items(p, 'sort-turn-1')[0] = { id: 'sort-moon', correct: 'b', distractors: [{ value: 'f' }, { value: 'm' }] }; })).toContain('sort-moon: the chest for moon is its first letter, m');
    expect(bad((p) => items(p, 'sort-turn-1').push(clone(items(p, 'sort-turn-4')[0]!)))).toContain('treasure-sort: sort-turn-1 mixes chest sets');
    expect(bad((p) => { items(p, 'sort-turn-1')[0]!.distractors = [{ value: 'b' }, { value: 'z' }]; }).some((x) => x.includes('are not a chest set'))).toBe(true);
    // Beats are the answer.
    expect(bad((p) => { items(p, 'hop-turn-1')[0]!.correct = 2; items(p, 'hop-turn-1')[0]!.distractors = [{ value: 1 }, { value: 3 }]; })).toContain('hop-star: star has 1 beats, not 2');
    // A cover never shows an answer.
    expect(validateChoiceGames({ ...choiceRaw, stories: { ...choiceRaw.stories, b: { ...choiceRaw.stories.b, cover: ['duck', 'key'] } } })).toContain('story-b1: the cover of story b shows the answer (key)');
    // Pictures and recordings.
    expect(bad((p) => { items(p, 'rhyme-turn-1')[0]!.distractors[0] = { value: 'zebra' }; })).toEqual(expect.arrayContaining(['rhyme-cat: zebra has no picture', 'rhyme-cat: zebra has no recording']));
    expect(validateChoiceGames(choiceRaw, learning, { ...narration, clips: narration.clips.filter((c) => c.id !== 'word.fox' && c.id !== 'line.hop.ask' && c.id !== 'q.a1') })).toEqual(expect.arrayContaining(['rhyme-fox: fox has no recording', 'line line.hop.ask is not in the recording script', 'question a1: clip q.a1 is not in the recording script']));
    // A reused id is the same item everywhere.
    expect(bad((p) => { items(p, 'quest-2-turn-1')[0]!.distractors = [{ value: 'car' }, { value: 'map' }]; }, true)).toContain('item rhyme-cat differs in quest-2-turn-1');
    // A quest has five turns, each one kind.
    expect(bad((p) => { const m = p.missions.missions.find((x) => x.id === 'royal-quest-3')!; m.steps = m.steps.slice(0, 8); }, true)).toContain('royal-quest-3: a quest has 5 turns, not 4');
    expect(bad((p) => items(p, 'quest-1-turn-1').push(clone(items(p, 'hop-turn-3')[1]!)), true)).toContain('royal-quest-1: quest-1-turn-1 mixes kinds or has no items');
    // A game is one kind all the way through.
    expect(bad((p) => { activity(p, 'hop-turn-1').params.items = clone(items(p, 'sort-turn-6')); })).toContain('bunny-hop: hop-turn-1 is a sort turn in a hop game');
    const { star: _star, ...labels } = choiceRaw.labels;
    expect(validateChoiceGames({ ...choiceRaw, labels })).toContain('labels.star is missing');
  });

  it('every game and quest is in the shipped pack and counts toward the garden gifts', () => {
    const content = loadKingdomContent();
    expect(content.pack.version).toBe('2026.11.3');
    expect(content.missionsVersion).toBe('2026.11.3');
    expect(content.pack.skills.filter((s) => ['literacy.rhyme', 'literacy.syllables', 'literacy.listening.comprehension'].includes(s.id)).map((s) => [s.id, s.strand, s.gradeBand])).toEqual([
      ['literacy.rhyme', 'phonologicalAwareness', [-1, 0]],
      ['literacy.syllables', 'phonologicalAwareness', [-1, 0]],
      ['literacy.listening.comprehension', 'comprehension', [-1, 0]],
    ]);
    const missions = [...GAME_IDS.map((g) => GAMES.games[g].mission), ...CHOICE_GAME_IDS.map((g) => CHOICE_GAMES.games[g].mission), ...QUEST_MISSIONS];
    for (const m of missions) {
      expect(content.missions.some((x) => x.id === m)).toBe(true);
      expect(REWARD_MISSIONS.garden).toContain(m);
    }
    const skillOf = (id: string) => content.pack.activities.find((a) => a.id === id)!;
    expect([skillOf('rhyme-turn-1'), skillOf('sort-turn-1'), skillOf('hop-turn-1'), skillOf('story-turn-1'), skillOf('bowl-letter-1'), skillOf('golf-letter-3')].map((a) => [a.skills[0], a.scaffoldingPolicy])).toEqual([
      ['literacy.rhyme', 'kingdom.reading'], ['literacy.sound.beginning', 'kingdom.reading'], ['literacy.syllables', 'kingdom.reading'], ['literacy.listening.comprehension', 'kingdom.reading'],
      ['literacy.sound.beginning', 'kingdom.gentle'], ['literacy.sound.beginning', 'kingdom.gentle'],
    ]);
  });
});
