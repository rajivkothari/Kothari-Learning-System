// The four picture games and the Royal Quest: copy and presentation data
// (content/themes/magical-kingdom/choiceGames.json and games-narration.json) read against the kingdom pack.
//
// Every turn is an authored item with three choices. The kind of a turn comes from its item id:
//   rhyme-<word>      hear a word, pick the picture that rhymes with it (tap picks up, the star commits)
//   sort-<word>       hear a word, tap the chest with its first letter (the tap answers)
//   hop-<word>        hear a word, tap how many beats it has: 1, 2 or 3 (the tap answers)
//   story-<question>  hear a three-sentence story, pick the picture that answers a question about it
// Item ids are shared between the single games and the quests, and mean the same item everywhere.
//
// The engine sees ids and values only; this file says what an id shows and says. Nothing here scores:
// right or wrong always comes from the runtime, and nothing here reads an item's answer to decide it.
// The answer is read only by the validators below (an adult-reviewed content check) and by help that
// teaches from the word itself (its first letter, its beats).
import { z } from 'zod';

import raw from '../../../../content/themes/magical-kingdom/choiceGames.json';
import narration from '../../../../content/themes/magical-kingdom/games-narration.json';
import learning from '../../../../content/themes/magical-kingdom/learning.json';
import garden from '../../../../content/themes/magical-kingdom/wordGarden.json';
import type { IconKind } from '../ui/MagicArt';

export const KINDS = ['rhyme', 'sort', 'hop', 'story'] as const;
export type Kind = (typeof KINDS)[number];
/** Each of the four games is one kind all the way through. */
export type ChoiceGameId = Kind;
export const CHOICE_GAME_IDS: readonly ChoiceGameId[] = KINDS;
/** What a choice flow can play: one of the four games, or the quest that mixes them. */
export type PlayId = ChoiceGameId | 'quest';

/** Words with a picture (ui/WordPicture draws them; `sun` and `bun` are code-drawn MagicArt kinds). */
/** The props of a told story's pictures: one a sentence, beside the story's characters. Never a word of any game. */
export const SCENE_PROPS: readonly IconKind[] = ['gift', 'hearts', 'worried', 'magnifier', 'party', 'basket', 'yum', 'telescope'];
export const PICTURES: readonly IconKind[] = ['fox', 'box', 'bee', 'key', 'moon', 'spoon', 'fish', 'dish', 'star', 'car', 'duck', 'truck', 'bunny', 'rainbow', 'apple', 'butterfly', 'banana', 'flower', 'umbrella', 'cat', 'hat', 'map', 'pig', 'snow', 'horse', 'book', 'sun', 'bun'];
const isPicture = (word: string | number): word is IconKind => (PICTURES as readonly (string | number)[]).includes(word);
const isScenePicture = (word: string): word is IconKind => isPicture(word) || (SCENE_PROPS as readonly string[]).includes(word);

const Text = z.string().min(1).max(120);
const Id = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/);
const Word = z.string().regex(/^[a-z]{2,10}$/);
const Letter = z.string().regex(/^[a-z]$/);
const ClipId = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/);

const GameSchema = z
  .object({
    title: Text,
    door: Text,
    mission: Id,
    /** The card's picture, and the picture a quest stone carries for a turn of this kind (MagicArt kinds). */
    icon: z.enum(['horse', 'chest', 'bunny', 'book']),
    backdrop: z.enum(['castle', 'ice', 'garden']),
    /** pickUp: a tap picks the picture up and says its word, and the star commits it. answer: the tap answers. */
    tap: z.enum(['pickUp', 'answer']),
  })
  .strict();

const Schema = z
  .object({
    schemaVersion: z.literal(1),
    games: z.object({ rhyme: GameSchema, sort: GameSchema, hop: GameSchema, story: GameSchema }).strict(),
    quest: z.object({ title: Text, door: Text, icon: z.enum(['quest']), backdrop: z.enum(['castle', 'ice', 'garden']), turns: z.number().int().min(1).max(10), missions: z.array(Id).min(1) }).strict(),
    labels: z.record(z.string(), Text),
    /** What is printed while a question is open: never the word asked about (print after sound). */
    asks: z.object({ rhyme: Text, sort: Text, hop: Text }).strict(),
    /** The kingdom narration line reused for a chest's guided help (spoken by its exact text). */
    guidedSort: Text,
    /** Chest sets: the three letters a chest turn offers. */
    sets: z.array(z.array(Letter).length(3)).min(1),
    /** Beats (syllables) of every hop word. */
    beats: z.record(Word, z.number().int().min(1).max(3)),
    // `scenes`: the pictures shown while each sentence is told (one set a sentence): the telling is a picture book.
    stories: z.record(Id, z.object({ cover: z.array(Word).min(1).max(2), sentences: z.array(ClipId).length(3), scenes: z.array(z.array(Word).min(1).max(3)).length(3) }).strict()),
    /** Question id -> its story, its clip, and which sentence (1-based) holds the answer. */
    questions: z.record(Id, z.object({ story: Id, clip: ClipId, clue: z.number().int().min(1).max(3) }).strict()),
  })
  .strict();
export type ChoiceCopy = z.infer<typeof Schema>;

const NarrationSchema = z
  .object({
    id: z.literal('kingdom-games-narration-v1'),
    voice: z.object({ provider: Text, voiceId: Text, name: Text, modelId: Text }).strict(),
    outputFormat: Text,
    budgetCredits: z.number().int().positive(),
    direction: z.record(z.string(), z.string().min(1).max(400)),
    clips: z.array(z.object({ id: ClipId, text: Text, kind: z.enum(['word', 'sentence']) }).strict()).min(1),
  })
  .strict();
type Narration = z.infer<typeof NarrationSchema>;

export const LABEL_KEYS = ['turn', 'hear', 'help', 'showMe', 'next', 'again', 'done', 'castle', 'listening', 'star', 'picture', 'story', 'option', 'chest', 'claps', 'held', 'empty', 'toy', 'hint', 'path', 'stone', 'questCastle', 'stones', 'pages', 'book', 'scene'] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];
/** Every line clip the flow can say (besides words, stories and questions). */
export const LINE_CLIPS = [
  'line.shared.hearThenStar', 'line.shared.retry', 'line.shared.yes', 'line.shared.shown', 'line.shared.done',
  'line.rhyme.ask', 'line.rhyme.clue', 'line.rhyme.guided', 'line.rhyme.right', 'line.rhyme.play',
  'line.sort.ask', 'line.sort.clue', 'line.sort.right', 'line.sort.play',
  'line.hop.ask', 'line.hop.clue', 'line.hop.guided', 'line.hop.right1', 'line.hop.right2', 'line.hop.right3', 'line.hop.play',
  'line.story.intro', 'line.story.clue', 'line.story.play',
] as const;

/** An authored item as the pack lists it. Only validators and help read `correct`. */
export interface Item {
  id: string;
  correct: string | number;
  distractors: { value: string | number }[];
}
export interface Turn {
  stepId: string;
  activityId: string;
  /** Null when a turn's items are not all one kind (a content error the validators report). */
  kind: Kind | null;
  items: Item[];
}

type Step = { kind: string; id: string; activityId?: string; items?: number };
type Mission = { id: string; steps: Step[] };
type Activity = { id: string; generator: { id: string }; params: Record<string, unknown> };
type Learning = { pack: { activities: unknown[] }; missions: { missions: unknown[] } };

/** The kind an item id names, or null. */
export const kindOf = (itemId: string): Kind | null => KINDS.find((k) => itemId.startsWith(`${k}-`)) ?? null;
/** What an item is about: the word (rhyme, sort, hop) or the question id (story). */
const subjectOf = (itemId: string): string => itemId.slice(itemId.indexOf('-') + 1);

const activityIn = (id: string | undefined, source: Learning) => (source.pack.activities as Activity[]).find((a) => a.id === id);
const itemsIn = (activityId: string | undefined, source: Learning): Item[] => {
  const a = activityIn(activityId, source);
  return a?.generator.id === 'literacy.authoredItem' && Array.isArray(a.params.items) ? (a.params.items as Item[]) : [];
};
const turnsIn = (missionId: string, source: Learning): Turn[] => {
  const mission = (source.missions.missions as Mission[]).find((m) => m.id === missionId);
  if (!mission) return [];
  return mission.steps.flatMap((s) => {
    if (s.kind !== 'activity') return [];
    const items = itemsIn(s.activityId, source);
    const kind = items.length ? kindOf(items[0]!.id) : null;
    return [{ stepId: s.id, activityId: s.activityId ?? '', kind: items.every((i) => kindOf(i.id) === kind) ? kind : null, items }];
  });
};

const valuesOf = (item: Item) => [item.correct, ...item.distractors.map((d) => d.value)];
const sameSet = (a: readonly (string | number)[], b: readonly (string | number)[]) => a.length === b.length && [...a].map(String).sort().join() === [...b].map(String).sort().join();

function itemProblems(c: ChoiceCopy, clips: ReadonlySet<string>, item: Item, kind: Kind): string[] {
  const problems: string[] = [];
  const subject = subjectOf(item.id);
  const values = valuesOf(item);
  const word = (w: string | number) => {
    if (!isPicture(w)) problems.push(`${item.id}: ${w} has no picture`);
    if (!Object.hasOwn(garden.words, String(w)) && !clips.has(`word.${w}`)) problems.push(`${item.id}: ${w} has no recording`);
  };
  if (values.length !== 3) problems.push(`${item.id}: a turn offers three choices, not ${values.length}`);
  if (kind === 'rhyme') {
    for (const w of [subject, ...values]) word(w);
    if (!clips.has(rhymeAskId(subject))) problems.push(`${item.id}: its whole ask ${rhymeAskId(subject)} is not in the recording script`);
    if (values.includes(subject)) problems.push(`${item.id}: a word cannot rhyme with itself`);
  } else if (kind === 'sort') {
    word(subject);
    if (item.correct !== subject[0]) problems.push(`${item.id}: the chest for ${subject} is its first letter, ${subject[0]}`);
    if (!c.sets.some((s) => sameSet(s, values))) problems.push(`${item.id}: its letters (${values.join(' ')}) are not a chest set`);
  } else if (kind === 'hop') {
    word(subject);
    if (c.beats[subject] === undefined) problems.push(`${item.id}: ${subject} has no beats`);
    else if (c.beats[subject] !== item.correct) problems.push(`${item.id}: ${subject} has ${c.beats[subject]} beats, not ${item.correct}`);
    if (!sameSet(values, [1, 2, 3])) problems.push(`${item.id}: the choices are 1, 2 and 3`);
  } else {
    const q = c.questions[subject];
    const story = q ? c.stories[q.story] : undefined;
    if (!q) problems.push(`${item.id}: question ${subject} is missing`);
    else if (!story) problems.push(`${item.id}: story ${q.story} is missing`);
    else if (story.cover.includes(String(item.correct))) problems.push(`${item.id}: the cover of story ${q.story} shows the answer (${item.correct})`);
    // The pictures of a telling never show a choice of a question on that story, right or wrong: the answer is
    // heard, not seen, and a picture of a wrong choice would point at it.
    else story.scenes.forEach((scene, n) => { for (const w of values) if (scene.includes(String(w))) problems.push(`${item.id}: the picture of sentence ${n + 1} of story ${q.story} shows a choice (${w})`); });
    for (const w of values) word(w);
  }
  return problems;
}

/** One mission's turns: a kind a turn, no item twice, one chest set a turn, every item presentable. */
function missionProblems(c: ChoiceCopy, clips: ReadonlySet<string>, source: Learning, missionId: string, only: Kind | null): string[] {
  const mission = (source.missions.missions as Mission[]).find((m) => m.id === missionId);
  if (!mission) return [`mission ${missionId} is missing from the kingdom pack`];
  const problems: string[] = [];
  mission.steps.forEach((s, i) => {
    const turn = Math.floor(i / 2) + 1;
    const last = i === mission.steps.length - 1;
    const id = s.kind === 'activity' ? `turn-${turn}` : last ? 'magic-restored' : `cheer-${turn}`;
    if ((i % 2 === 0) !== (s.kind === 'activity')) problems.push(`${missionId}: step ${s.id} breaks the turn, celebration order`);
    else if (s.id !== id) problems.push(`${missionId}: step ${s.id} should be ${id}`);
    if (s.kind === 'activity' && (s.items ?? 1) !== 1) problems.push(`${missionId}: step ${s.id} must ask one item`);
  });
  const seen = new Set<string>();
  for (const turn of turnsIn(missionId, source)) {
    if (activityIn(turn.activityId, source)?.generator.id !== 'literacy.authoredItem') problems.push(`${missionId}: ${turn.activityId} is not an authored-item activity`);
    if (!turn.kind) problems.push(`${missionId}: ${turn.activityId} mixes kinds or has no items`);
    else if (only && turn.kind !== only) problems.push(`${missionId}: ${turn.activityId} is a ${turn.kind} turn in a ${only} game`);
    for (const item of turn.items) {
      if (seen.has(item.id)) problems.push(`${missionId}: item ${item.id} could be asked twice`);
      seen.add(item.id);
      const kind = kindOf(item.id);
      if (kind) problems.push(...itemProblems(c, clips, item, kind));
    }
    if (turn.kind === 'sort' && !c.sets.some((s) => turn.items.every((i) => sameSet(s, valuesOf(i))))) problems.push(`${missionId}: ${turn.activityId} mixes chest sets`);
  }
  return problems;
}

/** An item id used by more than one activity must be the same item in each. */
function reuseProblems(source: Learning): string[] {
  const first = new Map<string, string>();
  const problems: string[] = [];
  for (const a of source.pack.activities as Activity[]) {
    for (const item of itemsIn(a.id, source)) {
      if (!kindOf(item.id)) continue;
      const text = JSON.stringify({ correct: item.correct, distractors: item.distractors });
      const known = first.get(item.id);
      if (known === undefined) first.set(item.id, text);
      else if (known !== text) problems.push(`item ${item.id} differs in ${a.id}`);
    }
  }
  return problems;
}

function parse(input: unknown, script: unknown): { copy: ChoiceCopy; clips: Set<string>; problems: string[] } | { copy: null; problems: string[] } {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { copy: null, problems: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const spoken = NarrationSchema.safeParse(script);
  if (!spoken.success) return { copy: null, problems: spoken.error.issues.map((i) => `narration ${i.path.join('.')}: ${i.message}`) };
  const ids = spoken.data.clips.map((c) => c.id);
  return { copy: parsed.data, clips: new Set(ids), problems: ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `narration clip ${id} is listed twice`) };
}

/**
 * Every problem with the four games' copy against the kingdom pack and the recording script: pictures,
 * recordings, no item twice in a game, chest = first letter and one set a turn, beats = answer, a cover
 * never shows an answer, a reused id identical everywhere. Empty when every turn can be presented.
 */
export function validateChoiceGames(input: unknown = raw, source: Learning = learning, script: unknown = narration): string[] {
  const p = parse(input, script);
  if (!p.copy) return p.problems;
  const { copy: c, clips } = p;
  const problems = [...p.problems];
  for (const k of LABEL_KEYS) if (!c.labels[k]) problems.push(`labels.${k} is missing`);
  for (const id of LINE_CLIPS) if (!clips.has(id)) problems.push(`line ${id} is not in the recording script`);
  for (const kind of KINDS) {
    const game = c.games[kind];
    if (game.tap !== (kind === 'rhyme' || kind === 'story' ? 'pickUp' : 'answer')) problems.push(`${kind}: the recorded lines say ${kind === 'rhyme' || kind === 'story' ? 'to tap the star' : 'that a tap answers'}`);
    problems.push(...missionProblems(c, clips, source, game.mission, kind));
  }
  for (const [id, story] of Object.entries(c.stories)) {
    for (const w of story.cover) if (!isPicture(w)) problems.push(`story ${id}: cover picture ${w} is not drawn`);
    for (const s of story.sentences) if (!clips.has(s)) problems.push(`story ${id}: sentence ${s} is not in the recording script`);
    if (story.scenes.length !== story.sentences.length) problems.push(`story ${id}: ${story.scenes.length} pictures for ${story.sentences.length} sentences`);
    story.scenes.forEach((scene, n) => {
      for (const w of scene) if (!isScenePicture(w)) problems.push(`story ${id}: picture ${w} of sentence ${n + 1} is not drawn`);
      if (new Set(scene).size !== scene.length) problems.push(`story ${id}: the picture of sentence ${n + 1} shows the same thing twice`);
      // Who the story is about is in every picture, so the pictures read as one story.
      if (!scene.some((w) => story.cover.includes(w))) problems.push(`story ${id}: the picture of sentence ${n + 1} shows none of its characters (${story.cover.join(', ')})`);
    });
    // One picture, one meaning: no two sentences of a story show the same picture.
    if (new Set(story.scenes.map((x) => [...x].sort().join('+'))).size !== story.scenes.length) problems.push(`story ${id}: two sentences show the same picture`);
  }
  for (const [id, q] of Object.entries(c.questions)) {
    if (!c.stories[q.story]) problems.push(`question ${id}: story ${q.story} is missing`);
    if (!clips.has(q.clip)) problems.push(`question ${id}: clip ${q.clip} is not in the recording script`);
  }
  problems.push(...reuseProblems(source));
  return problems;
}

/** Every problem with the Royal Quests: five turns each, a kind a turn, no item twice in a quest, items as in the games. */
export function validateQuests(input: unknown = raw, source: Learning = learning, script: unknown = narration): string[] {
  const p = parse(input, script);
  if (!p.copy) return p.problems;
  const { copy: c, clips } = p;
  const problems: string[] = [];
  c.quest.missions.forEach((missionId, q) => {
    const turns = turnsIn(missionId, source);
    if (turns.length !== c.quest.turns) problems.push(`${missionId}: a quest has ${c.quest.turns} turns, not ${turns.length}`);
    turns.forEach((t, i) => {
      if (t.activityId !== `quest-${q + 1}-turn-${i + 1}`) problems.push(`${missionId}: turn ${i + 1} should be the activity quest-${q + 1}-turn-${i + 1}`);
    });
    problems.push(...missionProblems(c, clips, source, missionId, null));
  });
  problems.push(...reuseProblems(source));
  return problems;
}

const problems = [...validateChoiceGames(), ...validateQuests()];
if (problems.length) throw new Error(`Picture games copy: ${problems.join('; ')}`);
export const CHOICE_GAMES = Schema.parse(raw);
const SCRIPT: Narration = NarrationSchema.parse(narration);
const CLIP_TEXT = new Map(SCRIPT.clips.map((c) => [c.id, c.text]));

/** The Royal Quest's card and rotation. */
export const QUEST = CHOICE_GAMES.quest;
export const QUEST_MISSIONS: readonly string[] = QUEST.missions;
export const QUEST_TURNS = QUEST.turns;
/** The quest to start after `finished` quests: 1, 2, 3, then round again. */
export const nextQuest = (finished: number): string => QUEST_MISSIONS[((Math.trunc(finished) % QUEST_MISSIONS.length) + QUEST_MISSIONS.length) % QUEST_MISSIONS.length]!;
/** The mission a play starts: the game's own, or the quest in turn. */
export const missionOf = (play: PlayId, finished = 0): string => (play === 'quest' ? nextQuest(finished) : CHOICE_GAMES.games[play].mission);
/** The 1-based number of a quest mission, or null. */
export const questNumber = (missionId: string): number | null => (QUEST_MISSIONS.includes(missionId) ? QUEST_MISSIONS.indexOf(missionId) + 1 : null);

/** The turns of a quest (or of one of the four games), in order: each turn's activity, kind and items. */
export const questTurns = (missionId: string): Turn[] => turnsIn(missionId, learning);
/** The authored items a turn's activity can ask. */
export const turnItems = (activityId: string): Item[] => itemsIn(activityId, learning);
/** An authored item by id (the same wherever it is used), or null. */
export const findItem = (itemId: string): Item | null => {
  for (const a of learning.pack.activities as unknown as Activity[]) {
    const item = itemsIn(a.id, learning).find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
};

/** The clip id of Rhyme Carousel's whole recorded ask for a word: "Which one rhymes with <word>?". */
export function rhymeAskId(word: string): string {
  return `line.rhyme.ask.${word}`;
}
/** A game clip's audio key (audio/games.ts). An unrecorded key plays nothing. */
export const clip = (id: string): string => `game:${id}`;
/** A word's audio key: the Word Garden's recording where it has one, else the games' own. */
export const wordKey = (word: string): string => (Object.hasOwn(garden.words, word) ? `slot:word:${word}` : clip(`word.${word}`));
/** The kingdom narration key for a chest's guided help (keyed by its exact text). */
export const GUIDED_SORT = `voice:${CHOICE_GAMES.guidedSort}`;
/** What a clip says ('' for an unknown id). */
export const textOf = (clipId: string): string => CLIP_TEXT.get(clipId) ?? '';
/** Every clip of the recording script, in order. */
export const narrationClips = (): readonly { id: string; text: string; kind: 'word' | 'sentence' }[] => SCRIPT.clips;

export const fillCopy = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (whole, k: string) => String(vars[k] ?? whole));
export const label = (key: LabelKey, vars: Record<string, string | number> = {}): string => fillCopy(CHOICE_GAMES.labels[key]!, vars);

/**
 * What to print for a view's `line`. `ask.rhyme`, `ask.sort` and `ask.hop` print the kind's short ask,
 * which never names the word (print after sound); `guided.sort` prints the kingdom's guided line;
 * anything else is a clip id (a story's ask is its question, which never holds its answer).
 */
export const lineText = (line: string): string => {
  if (line === 'guided.sort') return CHOICE_GAMES.guidedSort;
  const asks: Record<string, string> = CHOICE_GAMES.asks;
  return line.startsWith('ask.') ? asks[line.slice(4)] ?? '' : textOf(line);
};

export interface Presentation {
  kind: Kind;
  itemId: string;
  /** rhyme: the word to rhyme with. sort, hop: the pictured word. story: the question id (a1). */
  subject: string;
  /** The word the ask says and pictures (rhyme, sort, hop); null for a story. Never printed while the question is open. */
  word: string | null;
  /** The stage's pictures: the word, or the story's cover (characters only, never an answer). */
  pictures: IconKind[];
  /** story: the story id, its three sentence clip ids, the question's clip id and the sentence (1-based) that holds the answer. */
  story: string | null;
  sentences: string[];
  /** story: the pictures shown while each sentence is told, one set a sentence (never a choice of any question on the story). */
  scenes: IconKind[][];
  question: string | null;
  clue: number | null;
  /** hop: the beats of the word, for help and the toy. Never used to decide an answer. */
  beats: number | null;
  /** True when a tap picks a picture up and says its word and the star commits; false when the tap answers. */
  pickUp: boolean;
}

/** What an item shows and says, from its id alone. Null for an id the copy cannot present. */
export function present(kind: Kind, itemId: string): Presentation | null {
  if (kindOf(itemId) !== kind) return null;
  const subject = subjectOf(itemId);
  const pickUp = CHOICE_GAMES.games[kind].tap === 'pickUp';
  if (kind === 'story') {
    const q = CHOICE_GAMES.questions[subject];
    const story = q ? CHOICE_GAMES.stories[q.story] : undefined;
    if (!q || !story) return null;
    return { kind, itemId, subject, word: null, pictures: story.cover.filter(isPicture), story: q.story, sentences: [...story.sentences], scenes: story.scenes.map((x) => x.filter(isScenePicture)), question: q.clip, clue: q.clue, beats: null, pickUp };
  }
  if (!isPicture(subject)) return null;
  return { kind, itemId, subject, word: subject, pictures: [subject], story: null, sentences: [], scenes: [], question: null, clue: null, beats: kind === 'hop' ? CHOICE_GAMES.beats[subject] ?? null : null, pickUp };
}

export interface Print {
  word: string;
  /** The letters to print in gold, as [start, end) in the word, or null for a plain word. */
  gold: [number, number] | null;
}
/** From a word's first vowel to its end: what two rhyming words share when they are spelled alike. */
const rime = (word: string) => {
  const at = word.search(/[aeiou]/);
  return at < 0 ? '' : word.slice(at);
};
/**
 * A rhyme turn's word printed as help (D234): the word, its ending from the first vowel in gold, so the words that
 * rhyme and are spelled alike show the same gold ending (cat, hat), and the others a different one (car, moon).
 */
export function wordPrint(word: string): Print {
  const end = rime(word);
  return { word, gold: end ? [word.length - end.length, word.length] : null };
}
/**
 * What to print once a turn is answered: a rhyme pair with its shared ending in gold when the two are
 * spelled alike (cat, hat; not bee, key), a sorted word with its first letter in gold, the others plain.
 */
export function printOf(kind: Kind, subject: string, answer: string): Print[] {
  if (kind === 'rhyme') {
    const end = rime(subject);
    const alike = end.length > 0 && end === rime(answer);
    return [subject, answer].map((word) => ({ word, gold: alike ? [word.length - end.length, word.length] : null }));
  }
  if (kind === 'sort') return [{ word: subject, gold: [0, 1] }];
  if (kind === 'hop') return [{ word: subject, gold: null }];
  return [{ word: answer, gold: null }];
}
