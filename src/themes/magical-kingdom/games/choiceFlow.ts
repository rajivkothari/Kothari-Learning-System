// The four picture games and the Royal Quest: one flow, deciding everything a turn from its item's kind.
//
//   rhyme  hear a word; a tap picks a picture up and says its word; the gold star commits it.
//   sort   hear a word; a tap on a chest (a letter) answers.
//   hop    hear a word; a tap on 1, 2 or 3 claps answers.
//   story  hear a three-sentence story and a question; a tap picks a picture up; the star commits it.
//
// A single game is one kind all the way through; the quest is five turns that mix them, on a path of
// stepping stones to the castle. Which quest plays is a rotation kept in the setting `kingdom.quest`.
//
// Only a committed choice is an answer: the runtime records it and says right or wrong. Help is the
// activity's policy (clue, guided, then SHOW ME after two misses) and the runtime assigns the
// assistance. Hearing again, picking a picture up, reminders, the toy, NEXT, PLAY AGAIN, taps while the
// game is talking and the path record nothing. A miss greys the choice, keeps the same item and never
// makes it easier. No word is printed while its question is open.
//
// Timing (docs/magical-kingdom/PICTURE_GAMES.md "Voice and listening") is shared with the letter games
// through flow.ts: the choices, the star and Help are held while what the child must hear to answer is
// being said (the ask; a story and its question), and no longer: how to play comes after, as a tail a
// tap may interrupt. Reminders come only in the quiet; a closing game hushes only itself.
//
// Pure: no React. The screen renders view() and calls the actions; tests drive it over a real runtime.
import type { MissionView } from '../../../engine';
import type { GameRuntime } from '../../../runtime/gameRuntime';
import { CHOICE_GAMES, GUIDED_SORT, QUEST_MISSIONS, clip, kindOf, nextQuest, present, printOf, questNumber, questTurns, rhymeAskId, wordKey, type Kind, type PlayId, type Presentation, type Print } from './choiceContent';
import { GAP_MS, HELP_GAP_MS, STAGE_GUARD_MS, STORY_GAP_MS, createGameSpeech, realWait, type GameAudio, type SayPart, type Wait } from './flow';

/** How many times a turn's toy plays. NEXT is there from the start. */
export const MAX_PLAYS = 3;
/** One hop, and one tick, a beat. */
export const BEAT_MS = 450;
/** How many times how to play may be interrupted in a visit before it stops following the ask. The nudge still says it. */
export const HOW_TRIES = 2;
/** The setting that keeps the quest rotation. Never evidence. */
export const QUEST_KEY = 'kingdom.quest';

export type ChoiceStage = 'loading' | 'ask' | 'reward' | 'done' | 'failed';

export interface ChoiceOption {
  id: string;
  /** rhyme, story: a word (its picture is the choice). sort: a letter (a chest). hop: '1', '2' or '3' (claps). */
  value: string;
}

/** A turn: what its item shows and says (Presentation), its choices, and the item's signature. */
export interface ChoiceTask extends Presentation {
  /** The item's signature: a resumed item keeps its play state only if this matches. */
  key: string;
  /** The three choices. Chests and claps are in their own order (b f m; 1 2 3); pictures as the item deals them. */
  options: ChoiceOption[];
}

/** A turn's right answer, once the runtime has accepted it. */
export interface ChoiceAnswer {
  kind: Kind;
  itemId: string;
  /** The chosen option and its value. */
  optionId: string;
  value: string;
  /** What to print now that the question is closed (gold letters marked). */
  print: Print[];
  /** hop: the beats the bunny hops for the toy. */
  beats: number | null;
}

export interface ChoiceView {
  /** The game in play: one of the four, or the quest. */
  play: PlayId;
  stage: ChoiceStage;
  /** 1-based turn and how many there are. */
  turn: number;
  turns: number;
  /** The kind of every turn, in order: the quest's stepping stones each carry their turn's game picture (CHOICE_GAMES.games[kind].icon). */
  path: Kind[];
  /** The quest in play (1 to 3), or null in a single game. */
  quest: number | null;
  /** The turn. Kept through the reward so the choices stay on screen; null when not known (loading, done, a celebration resumed without its play save). */
  task: ChoiceTask | null;
  /** Options already tried wrong on this item: greyed, never sent twice. */
  tried: string[];
  /** rhyme, story: the option picked up, waiting for the star. */
  held: string | null;
  /** The game is saying the ask: choices, the star and Help are held (they show their press and do nothing). The ear works. */
  listening: boolean;
  /**
   * story: how many of the story's sentences have begun in this telling, for the screen to light one
   * page a sentence (0 before the first; all of them once the story has been heard this visit, and in
   * the celebration). 0 on every other kind of turn.
   */
  page: number;
  /**
   * story: the sentence being told right now (1-based), for the screen to show that sentence's picture
   * (task.scenes[scene - 1]) in place of the cover: the telling is a picture book. 0 when no sentence is
   * being told (before, during the question, after, and on every other kind of turn).
   */
  scene: number;
  /**
   * story: this turn asked only the question, because its story was already heard to its end in this
   * game. The book glows to offer the whole story again, until she touches it or answers.
   */
  offered: boolean;
  /** The reminders are used up: the ear glows slowly until the next touch. */
  nudge: boolean;
  /** Help is held: the rung it just gave is being said (or HELP_GUARD_MS has not passed). It shows its press and does nothing: one press, one rung. */
  helping: boolean;
  /** The stage has just changed (STAGE_GUARD_MS): Next, Help and Play again show a press and do nothing, so a double tap is one tap. */
  settling: boolean;
  /** Help shown on this item, newest last (policy kinds: highlightGiven, guidedSteps, showAnswer). */
  help: string[];
  /** The next help the policy offers, or null (SHOW ME waits for two misses). */
  nextHelp: { kind: string; demonstrated: boolean } | null;
  /** SHOW ME: the option to tap. Only it can be picked up or chosen. */
  shown: string | null;
  /** sort, guided help: the word's first letter, shown beside the picture. */
  hint: string | null;
  /** rhyme, the first turns of a visit (D234): the words are printed under the pictures, endings in gold, once the ask is heard. Help, recorded as visual support. */
  words: boolean;
  /** hop: how many of the bunny's stones are lit (guided help counts them out; so does the toy). 0 for none. */
  beat: number;
  /** reward: the accepted answer, with what to print. Null when not known. */
  answer: ChoiceAnswer | null;
  /** reward: how many times the toy has played (MAX_PLAYS at most), and a counter that bumps on each play for the screen to animate on. */
  plays: number;
  pulse: number;
  /** The line to print: choiceContent.lineText(line). Never names a word whose question is open. */
  line: string;
  /** Bumps when the last answer was wrong: the screen shakes the choice. */
  miss: number;
  busy: boolean;
}

/** The view before a flow has started (and what a screen can render while there is no flow yet). */
export const idleChoiceView = (play: PlayId): ChoiceView => {
  const path = play === 'quest' ? [] : questTurns(CHOICE_GAMES.games[play].mission).map((t) => t.kind ?? play);
  return {
    play, stage: 'loading', turn: 1, turns: play === 'quest' ? CHOICE_GAMES.quest.turns : path.length, path, quest: null, task: null, tried: [], held: null, listening: false, page: 0, scene: 0, offered: false, nudge: false, helping: false, settling: false,
    help: [], nextHelp: null, shown: null, hint: null, words: false, beat: 0, answer: null, plays: 0, pulse: 0, line: 'line.shared.done', miss: 0, busy: false,
  };
};

interface PlaySave {
  v: 1;
  instance: string;
  /** The item's signature while its question is open; the celebration's step id afterwards. */
  key: string;
  tried: string[];
  held: string | null;
  task: ChoiceTask | null;
  answer: ChoiceAnswer | null;
  plays: number;
  /** The game was finished and its end is on screen: an app restart there comes back to the end, not to a new game. */
  ended?: boolean;
}

/** The quest rotation: how many quests are finished, the last instance counted, and the one in play. */
interface QuestSave {
  finished: number;
  counted: string | null;
  current: string | null;
}

export interface ChoiceFlow {
  view(): ChoiceView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  /** The ear, or the stage picture: say this stage's line again (a story not yet heard to its end is told again). Free; works while the game is talking. */
  hear(): void;
  /**
   * The book of a story turn: tell the whole story again, with its pictures, then the question. Decorative:
   * it records nothing, and holds the choices only while it tells. Does nothing while the game is talking.
   */
  retell(): void;
  /** A choice was tapped. rhyme, story: it is picked up and its word is said. sort, hop: it is the answer. Does nothing while the game is talking. */
  tap(optionId: string): Promise<void>;
  /** The gold star: the picture picked up is the answer. With nothing picked up it says how to play. */
  star(): Promise<void>;
  /** The next help of the ladder. Does nothing while the game is talking, or while the rung it just gave is being said. */
  help(): Promise<void>;
  /** reward: play the turn's toy (MAX_PLAYS at most). */
  toy(): void;
  /** reward: on to the next turn, or the end (the mission is complete once the stage is `done`). */
  next(): Promise<void>;
  /** done: a new game (the next quest in turn). */
  again(): Promise<void>;
  /** Save the play state now (app to background). */
  flush(): Promise<void>;
  /** The child is leaving for the games room: hush this game's own speech, save, and forget a finished game's end screen, so the card starts a new game. */
  leave(): Promise<void>;
  dispose(): void;
}

/** The how-to line of a picture turn. */
const HOW = clip('line.shared.hearThenStar');
const ASK_LINE = (t: Presentation) => (t.kind === 'story' ? t.question ?? 'line.story.intro' : `ask.${t.kind}`);
const RIGHT_LINE = (kind: Kind, value: string) => (kind === 'hop' ? `line.hop.right${value}` : kind === 'story' ? 'line.shared.yes' : `line.${kind}.right`);
/** The help kind that prints a rhyme turn's words (policy kingdom.rhyme.words). */
const WORDS = 'printedWords';
const HELP_LINE = (kind: Kind, help: string) => (help === 'showAnswer' ? 'line.shared.shown' : help === 'guidedSteps' ? (kind === 'sort' ? 'guided.sort' : kind === 'story' ? 'line.story.clue' : `line.${kind}.guided`) : `line.${kind}.clue`);

export function createChoiceFlow(opts: {
  runtime: GameRuntime;
  learnerId: string;
  play: PlayId;
  now: () => number;
  audio: GameAudio;
  wait?: Wait;
  /** The guard after a stage change (default STAGE_GUARD_MS; 0 for none). */
  guardMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
}): ChoiceFlow {
  const { runtime, learnerId, play, now, audio } = opts;
  const wait = opts.wait ?? realWait;
  const guardMs = opts.guardMs ?? STAGE_GUARD_MS;
  const log = opts.log ?? (() => undefined);
  const SAVE_KEY = `kingdom.play.${play}`;
  const listeners = new Set<() => void>();
  let instance: string | null = null;
  let mission: MissionView | null = null;
  let revision = 0;
  let disposed = false;
  let saving: Promise<void> = Promise.resolve();
  let quest: QuestSave | null = null;
  /** The how-to line has been heard to its end this visit. */
  let taught = false;
  /** How to play is due or being said after an ask: a newer say now is her interrupting it. And how often she has. */
  let howDue = false;
  let howCuts = 0;
  let unhow: (() => void) | null = null;
  /** The stories heard to their end in this game (one mission instance): one that comes round again is not told twice. */
  const heard = new Set<string>();
  let unhop: (() => void) | null = null;
  let unsettle: (() => void) | null = null;
  /** The finished instance whose end screen was come back to after a restart (no mission is open then). */
  let ended: string | null = null;
  let v: ChoiceView = idleChoiceView(play);
  const set = (patch: Partial<ChoiceView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  /** The stage has just changed under the child's finger: what appeared takes no press for the guard. */
  const settle = () => {
    unsettle?.();
    unsettle = null;
    if (!(guardMs > 0) || disposed) return;
    set({ settling: true });
    unsettle = wait(guardMs, () => {
      unsettle = null;
      set({ settling: false });
    });
  };
  const command = (kind: string) => ({ commandId: `${instance}:choice:r${revision}:${kind}`, basedOn: revision });

  /**
   * The short ask: what a reminder and the ask after a miss say. Rhymes use the whole recorded sentence
   * for the word when there is one, and the fragment then the word's own clip otherwise.
   */
  const shortAsk = (t: ChoiceTask): string[] => {
    if (t.kind === 'story') return t.question ? [clip(t.question)] : [];
    const word = wordKey(t.word ?? t.subject);
    if (t.kind !== 'rhyme') return [word, clip(`line.${t.kind}.ask`)];
    const whole = clip(rhymeAskId(t.subject));
    return audio.has(whole) ? [whole] : [clip('line.rhyme.ask'), word];
  };
  const speech = createGameSpeech(audio, wait, {
    open: () => v.stage === 'ask',
    remind: () => {
      if (v.task) speak(shortAsk(v.task));
    },
    listening: (held) => set({ listening: held }),
    helping: (held) => set({ helping: held }),
    // Rhymes, first sounds, claps and a told story: with no sound there is nothing to answer.
    byEar: true,
    nudge: (on) => {
      if (v.nudge === on) return;
      set({ nudge: on });
      unhow?.();
      unhow = null;
      // Idle through both reminders on a picture turn: she may not know what to do. The nudge says how to play, once.
      if (on && v.stage === 'ask' && v.task?.pickUp && !taught) {
        unhow = wait(GAP_MS, () => {
          unhow = null;
          if (disposed || !v.nudge || v.stage !== 'ask') return;
          speak([HOW], { onEnd: learned });
        });
      }
    },
  });
  const { touch } = speech;
  /** Before every say: the picture of a sentence that was being told goes, and a how-to it cuts is counted as interrupted. */
  const before = () => {
    if (v.scene !== 0) set({ scene: 0 });
    if (howDue) {
      howDue = false;
      howCuts++;
    }
  };
  const speak: typeof speech.speak = (keys, opts) => {
    before();
    return speech.speak(keys, opts);
  };
  const learned = (finished: boolean) => {
    if (finished && audio.has(HOW)) taught = true;
  };
  /** A story's sentences as parts: each lights its page and shows its picture as it begins. */
  const sentenceParts = (t: ChoiceTask, hold: boolean): SayPart[] => t.sentences.map((sentence, i) => ({ keys: [clip(sentence)], hold, begin: () => set({ page: i + 1, scene: i + 1 }) }));
  /** The question that ends a telling: the picture goes back to the cover; heard to its end, the story counts as heard. */
  const questionPart = (t: ChoiceTask, hold: boolean, told: boolean): SayPart => ({
    keys: shortAsk(t),
    hold,
    begin: () => {
      if (v.scene !== 0) set({ scene: 0 });
    },
    end: (finished) => {
      if (finished && told && t.story !== null && t.sentences.every((sentence) => audio.has(clip(sentence)))) heard.add(t.story);
    },
  });
  const sceneOver = () => {
    if (v.scene !== 0) set({ scene: 0 });
  };

  /**
   * The ask, in parts. What the child must hear to answer holds the choices: a story's sentences (unless
   * it was already heard to its end in this game), then the question or the ask. The hold ends when the
   * question ends. On a picture turn how to play follows as a tail that holds nothing, so a tap may
   * interrupt it, until it has been heard to its end once or interrupted HOW_TRIES times. A line counts
   * as heard only when it is recorded and was played to its end: with no recording the story is told and
   * the how-to said at every ask. `again` (the ear asked): a story is announced with "Listen to the
   * story." first; the first telling is not, because every second of it is a second she cannot touch anything.
   */
  const sayAsk = (hold: boolean, again = false): boolean => {
    const t = v.task;
    if (!t) return false;
    const tell = t.kind === 'story' && t.story !== null && !heard.has(t.story);
    const how = t.pickUp && !taught && howCuts < HOW_TRIES;
    const parts: SayPart[] = [];
    if (tell) {
      if (again) parts.push({ keys: [clip('line.story.intro')], hold, begin: () => set({ page: 0, scene: 0 }) });
      parts.push(...sentenceParts(t, hold));
    }
    const question = questionPart(t, hold, tell);
    parts.push({
      ...question,
      end: (finished) => {
        question.end?.(finished);
        // How to play is due: a newer say from here on, until it has ended, is her interrupting it.
        if (finished && how) howDue = true;
      },
    });
    if (how) {
      parts.push({
        keys: [HOW],
        end: (finished) => {
          howDue = false;
          learned(finished);
        },
      });
    }
    before();
    return speech.tell(parts, { gapMs: tell ? STORY_GAP_MS : GAP_MS, onEnd: sceneOver });
  };
  /** The first ask of an item holds the choices. In the browser, an ask that could not play is said at the first touch. */
  const ask = () => {
    const key = v.task?.key;
    speech.first(
      () => sayAsk(true),
      () => v.stage === 'ask' && v.task?.key === key,
    );
  };

  const stopHop = () => {
    unhop?.();
    unhop = null;
  };
  /** The bunny hops `count` beats: one stone lights, with a tick, each beat. */
  const hop = (count: number) => {
    stopHop();
    if (disposed || !(count >= 1)) return;
    const step = (n: number) => {
      unhop = null;
      if (disposed) return;
      set({ beat: n });
      audio.effect('place');
      if (n < count) unhop = wait(BEAT_MS, () => step(n + 1));
    };
    set({ beat: 0 });
    step(1);
  };

  const turnOf = (m: MissionView) => Math.min(v.turns, Math.floor((m.step?.index ?? 0) / 2) + 1);
  /** The task the runtime's activity presents, or null when it is not a picture-game item. */
  const taskOf = (m: MissionView): ChoiceTask | null => {
    const a = m.activity;
    const itemId = typeof a?.prompt.item === 'string' ? a.prompt.item : null;
    const kind = itemId ? kindOf(itemId) : null;
    const shown = a && itemId && kind ? present(kind, itemId) : null;
    if (!a || !shown) return null;
    const options = a.options.map((o) => ({ id: o.id, value: String(o.value) }));
    // Chests and claps always stand in their own order; pictures stay as the item dealt them.
    if (shown.kind === 'sort' || shown.kind === 'hop') options.sort((x, y) => (x.value < y.value ? -1 : x.value > y.value ? 1 : 0));
    return { ...shown, key: a.itemSignature, options };
  };
  const helpOf = (m: MissionView, t: ChoiceTask | null): Pick<ChoiceView, 'help' | 'nextHelp' | 'shown' | 'hint' | 'words'> => {
    const s = m.activity?.scaffolds;
    const next = s?.available[0];
    const help = s?.shown.map((x) => x.kind) ?? [];
    return {
      help,
      nextHelp: next ? { kind: next.kind, demonstrated: next.assistance === 'demonstrated' } : null,
      shown: s?.shown.some((x) => x.assistance === 'demonstrated') ? s.revealedOptionId ?? null : null,
      // Guided help on a chest shows the letter the word begins with. This is help, never a check of an answer.
      hint: t?.kind === 'sort' && t.word && help.includes('guidedSteps') ? t.word[0]! : null,
      words: t?.kind === 'rhyme' && help.includes(WORDS),
    };
  };

  const persist = () => {
    if (!instance || disposed) return saving;
    const key = mission?.activity?.itemSignature ?? mission?.narrative?.stepId ?? '';
    const data: PlaySave = { v: 1, instance, key, tried: v.tried, held: v.held, task: v.task, answer: v.answer, plays: v.plays, ended: v.stage === 'done' };
    const text = JSON.stringify(data);
    // A play save is a convenience (the answers are safe in the runtime): never block play on it.
    saving = saving.then(() => runtime.putSetting(learnerId, SAVE_KEY, text)).catch((e: unknown) => log('choice.saveFailed', { message: String(e) }));
    return saving;
  };
  const saveQuest = () => {
    if (!quest || disposed) return;
    const text = JSON.stringify(quest);
    saving = saving.then(() => runtime.putSetting(learnerId, QUEST_KEY, text)).catch((e: unknown) => log('choice.questSaveFailed', { message: String(e) }));
  };

  /** A turn's play state, cleared. `listening` is not here: only the voice holds and releases. */
  const blank = { tried: [], held: null, help: [], nextHelp: null, shown: null, hint: null, words: false, beat: 0, answer: null, plays: 0 } satisfies Partial<ChoiceView>;

  /**
   * The first rhyme turns of a visit give the words (D234): when the turn's policy starts with printed words, the
   * game takes that rung itself as the turn is shown, so the answer is recorded as visual support, never as
   * independent. The screen prints them once the ask has been heard (sound first). Help then goes on up the ladder.
   */
  const giveWords = async () => {
    const step = mission?.activity?.scaffolds.available[0];
    const t = v.task;
    if (disposed || v.stage !== 'ask' || t?.kind !== 'rhyme' || !instance || step?.kind !== WORDS) return;
    const res = await runtime.useScaffold(instance, { ...command('help'), scaffoldStepId: step.stepId });
    revision = res.revision;
    mission = res.view;
    if (v.task === t) set({ ...helpOf(res.view, t) });
  };

  /** Show what the mission is at now, with the play save of the same instance when there is one. */
  const show = (m: MissionView, saved: PlaySave | null = null) => {
    mission = m;
    stopHop();
    if (m.status === 'completed') {
      set({ ...blank, stage: 'done', turn: v.turns, task: null, page: 0, scene: 0, offered: false, line: 'line.shared.done' });
      return;
    }
    if (m.narrative) {
      // The celebration of a right answer. What was answered lives in the play save only.
      const same = saved !== null && saved.key === m.narrative.stepId && saved.task !== null && saved.answer !== null;
      const answer = same ? saved.answer : null;
      set({ ...blank, stage: 'reward', turn: turnOf(m), task: same ? saved.task : null, answer, page: same && saved.task?.kind === 'story' ? saved.task.sentences.length : 0, scene: 0, offered: false, plays: same ? Math.max(0, Math.min(MAX_PLAYS, Math.trunc(saved.plays) || 0)) : 0, line: answer ? RIGHT_LINE(answer.kind, answer.value) : 'line.shared.yes' });
      return;
    }
    const task = taskOf(m);
    if (!task) {
      log('choice.unsupported', { activityId: m.activity?.activityId ?? null });
      set({ stage: 'failed', task: null });
      return;
    }
    const same = saved !== null && saved.key === task.key;
    const tried = same ? saved.tried.filter((id) => task.options.some((o) => o.id === id)).slice(0, m.activity!.wrongTries) : [];
    const help = helpOf(m, task);
    const held = same && task.pickUp && saved.held !== null && task.options.some((o) => o.id === saved.held) && !tried.includes(saved.held) && (help.shown === null || help.shown === saved.held) ? saved.held : null;
    // Guided help on a hop word has counted its beats out: the stones stay lit.
    const beat = task.kind === 'hop' && help.help.includes('guidedSteps') ? task.beats ?? 0 : 0;
    // A story already heard to its end in this game keeps its pages lit and is not told again: only its question
    // is asked, and the book offers the whole story. One still to be told starts dark.
    const known = task.kind === 'story' && task.story !== null && heard.has(task.story);
    set({ ...blank, stage: 'ask', turn: turnOf(m), task, tried, held, beat, page: known ? task.sentences.length : 0, scene: 0, offered: known, line: ASK_LINE(task), ...help });
  };

  /** The celebration, said again: the line that is printed (what was found), then what the toy does. Print and sound agree. */
  const sayReward = (a: ChoiceAnswer) => speak([clip(RIGHT_LINE(a.kind, a.value)), clip(`line.${a.kind}.play`)]);

  /** After show(): say what the stage it landed on needs said. */
  const announce = () => {
    if (v.stage === 'ask') ask();
    else if (v.stage === 'reward' && v.answer) sayReward(v.answer);
    else if (v.stage === 'done') speak([clip('line.shared.done')]);
  };

  async function guard(task: () => Promise<void>) {
    if (v.busy || disposed) return;
    set({ busy: true });
    try {
      await task();
    } catch (e) {
      log('choice.failed', { message: String(e) });
      speech.stop();
      set({ stage: 'failed' });
    } finally {
      set({ busy: false });
    }
  }

  /** An active instance of a mission that the installed content can still show, or null (an incompatible one is abandoned). */
  const activeOf = async (missionId: string): Promise<string | null> => {
    const id = await runtime.findActiveMission(learnerId, missionId);
    if (!id) return null;
    if ((await runtime.missionCompatibility(id)).ok) return id;
    await runtime.abandonMission(id, { commandId: `${id}:incompatible` });
    return null;
  };

  /** The quest rotation as saved, brought up to date from the runtime's own record. */
  const readQuest = async (text: string | undefined): Promise<QuestSave> => {
    let saved: QuestSave | null = null;
    try {
      const raw = JSON.parse(text ?? 'null') as Partial<QuestSave> | null;
      if (raw && Number.isInteger(raw.finished) && raw.finished! >= 0) saved = { finished: raw.finished!, counted: typeof raw.counted === 'string' ? raw.counted : null, current: typeof raw.current === 'string' ? raw.current : null };
    } catch {
      // An unreadable rotation is rebuilt below.
    }
    const latest = await Promise.all(QUEST_MISSIONS.map((m) => runtime.latestMission(learnerId, m)));
    // No rotation saved: count the quests the runtime shows finished.
    if (!saved) return { finished: latest.filter((l) => l?.status === 'completed').length, counted: null, current: null };
    // The app died after the quest's last step was committed and before the count was written.
    if (saved.current && saved.current !== saved.counted && latest.some((l) => l?.id === saved.current && l.status === 'completed')) return { finished: saved.finished + 1, counted: saved.current, current: saved.current };
    return saved;
  };

  /** Open the play's mission: the active one, or a new one (for the quest, the next in turn). Says where it is. */
  const open = async (fresh: boolean) => {
    if (!(await runtime.getLearner(learnerId))) throw new Error(`no learner ${learnerId}`);
    const settings = await runtime.settings(learnerId);
    let missionId = play === 'quest' ? '' : CHOICE_GAMES.games[play].mission;
    let id: string | null = null;
    if (play === 'quest') {
      quest = await readQuest(settings[QUEST_KEY]);
      if (!fresh) {
        for (const m of QUEST_MISSIONS) {
          const active = await activeOf(m);
          if (active && (!id || active === quest.current)) {
            id = active;
            missionId = m;
          }
        }
      }
      if (!id) missionId = nextQuest(quest.finished);
    } else if (!fresh) {
      id = await activeOf(missionId);
    }
    let stored: PlaySave | null = null;
    try {
      const raw = JSON.parse(settings[SAVE_KEY] ?? 'null') as PlaySave | null;
      const task = (x: ChoiceTask | null) => x === null || (typeof x === 'object' && kindOf(String(x.itemId)) === x.kind && Array.isArray(x.options) && Array.isArray(x.pictures));
      const answer = (x: ChoiceAnswer | null) => x === null || (typeof x === 'object' && typeof x.value === 'string' && typeof x.kind === 'string' && Array.isArray(x.print));
      if (raw?.v === 1 && typeof raw.instance === 'string' && Array.isArray(raw.tried) && task(raw.task ?? null) && answer(raw.answer ?? null)) stored = { ...raw, task: raw.task ?? null, answer: raw.answer ?? null, held: typeof raw.held === 'string' ? raw.held : null };
    } catch {
      // An unreadable play save starts the item afresh; the answers are in the runtime.
    }
    if (!id && !fresh && stored?.ended) {
      // The app was restarted on the end screen of a finished game: come back to it, not to a new game.
      const candidates = play === 'quest' ? QUEST_MISSIONS : [missionId];
      const latest = await Promise.all(candidates.map((m) => runtime.latestMission(learnerId, m)));
      const at = latest.findIndex((l) => l?.id === stored.instance && l.status === 'completed');
      if (at >= 0) {
        const finished = candidates[at]!;
        const turns = questTurns(finished);
        if (instance) runtime.deactivate(instance);
        instance = null;
        mission = null;
        ended = stored.instance;
        // A finish the rotation had not counted yet (the app died first) is counted now.
        saveQuest();
        stopHop();
        set({ ...blank, turns: turns.length, path: turns.map((t) => t.kind ?? 'rhyme'), quest: questNumber(finished), stage: 'done', turn: turns.length, task: null, page: 0, line: 'line.shared.done' });
        announce();
        return;
      }
    }
    ended = null;
    if (!id) {
      id = `${missionId}-${learnerId}-${now().toString(36)}`;
      await runtime.startMission({ learnerId, missionId, instanceId: id });
    }
    if (quest) {
      // Through the same chain as every other write of the rotation, so an older queued write cannot land after this one.
      quest = { ...quest, current: id };
      saveQuest();
      await saving;
    }
    if (instance && instance !== id) runtime.deactivate(instance);
    // A new game tells its stories afresh.
    if (instance !== id) heard.clear();
    instance = id;
    const active = await runtime.activate(id);
    revision = active.revision;
    const turns = questTurns(missionId);
    set({ turns: turns.length, path: turns.map((t) => t.kind ?? 'rhyme'), quest: questNumber(missionId) });
    show(active.view, stored?.instance === id ? stored : null);
    await giveWords();
    announce();
  };

  /** Send the choice. The runtime says right or wrong. */
  const answer = async (option: ChoiceOption) => {
    const t = v.task!;
    audio.effect('place');
    const res = await runtime.submit(instance!, { ...command('submit'), optionId: option.id });
    revision = res.revision;
    mission = res.view;
    const result = res.intents.find((i) => i.type === 'RESPONSE_RESULT');
    // A refused command (a late or doubled tap) is not an answer: nothing greys.
    if (result?.type !== 'RESPONSE_RESULT') return;
    if (result.correct) {
      stopHop();
      const won: ChoiceAnswer = { kind: t.kind, itemId: t.itemId, optionId: option.id, value: option.value, print: printOf(t.kind, t.subject, option.value), beats: t.kind === 'hop' ? Number(option.value) : null };
      set({ ...blank, stage: 'reward', answer: won, page: t.kind === 'story' ? t.sentences.length : 0, scene: 0, offered: false, line: RIGHT_LINE(t.kind, option.value) });
      // Next is drawn where the star stood: the second tap of a double tap must not skip the celebration.
      settle();
      const word = wordKey(t.word ?? t.subject);
      // The chime, what was found, then what the toy does.
      speak(
        t.kind === 'rhyme' ? ['effect:success', word, wordKey(option.value), clip('line.rhyme.right'), clip('line.rhyme.play')]
          : t.kind === 'sort' ? ['effect:success', `slot:sound:${option.value}`, word, clip('line.sort.right'), clip('line.sort.play')]
            : t.kind === 'hop' ? ['effect:success', clip(`line.hop.right${option.value}`), clip('line.hop.play')]
              : ['effect:success', clip('line.shared.yes'), wordKey(option.value), clip('line.story.play')],
      );
    } else if (res.view.activity?.itemSignature !== t.key) {
      // The runtime moved on (not this policy today): show whatever it presents now.
      show(res.view);
      await giveWords();
      announce();
    } else {
      // A miss greys the choice and keeps the same item: it never gets easier.
      set({ tried: v.tried.includes(option.id) ? v.tried : [...v.tried, option.id], held: null, line: 'line.shared.retry', miss: v.miss + 1, ...helpOf(res.view, t) });
      speak(['effect:retry', clip('line.shared.retry'), ...shortAsk(t)], { hold: true });
    }
    void persist();
  };

  /** The option, if it may be touched now: a live question, not held by the ask, not greyed, and the shown one after SHOW ME. */
  const live = (optionId: string): ChoiceOption | null => {
    const t = v.task;
    if (v.stage !== 'ask' || !t || v.listening || v.tried.includes(optionId) || (v.shown !== null && v.shown !== optionId)) return null;
    return t.options.find((o) => o.id === optionId) ?? null;
  };

  const flow: ChoiceFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    start: () => guard(() => open(false)),

    hear() {
      if (disposed) return;
      speech.touching();
      // While the game is still saying the ask, the ear starts it again and the choices stay held.
      if (v.stage === 'ask') sayAsk(v.listening, true);
      else if (v.stage === 'reward' && v.answer) sayReward(v.answer);
      else if (v.stage === 'done') speak([clip('line.shared.done')]);
    },

    retell() {
      const t = v.task;
      // Held while the game is telling or asking (the book shows its press, like every held control).
      if (disposed || v.stage !== 'ask' || !t || t.kind !== 'story' || t.story === null || v.listening || speech.deaf()) return;
      speech.touching();
      if (v.offered) set({ offered: false });
      before();
      speech.tell([{ keys: [clip('line.story.intro')], hold: true, begin: () => set({ page: 0, scene: 0 }) }, ...sentenceParts(t, true), questionPart(t, true, true)], { gapMs: STORY_GAP_MS, onEnd: sceneOver });
    },

    tap: (optionId) =>
      guard(async () => {
        const option = live(optionId);
        const t = v.task;
        // Nothing is picked up or answered for a question that cannot be heard: the ask waits for sound, held.
        if (!option || !t || speech.deaf()) return;
        touch();
        if (!t.pickUp) {
          await answer(option);
          return;
        }
        // Picking a picture up says its word. It is not an answer until the star.
        set({ held: option.id });
        speak([wordKey(option.value)]);
        void persist();
      }),

    star: () =>
      guard(async () => {
        const t = v.task;
        if (v.stage !== 'ask' || !t || !t.pickUp || v.listening || speech.deaf()) return;
        touch();
        const option = v.held === null ? null : live(v.held);
        if (option) {
          await answer(option);
          return;
        }
        // Nothing picked up yet: say how to play.
        speak([HOW], { onEnd: learned });
      }),

    help: () =>
      guard(async () => {
        const t = v.task;
        const step = mission?.activity?.scaffolds.available[0];
        // One press, one rung: Help is held while the rung it gave is being said.
        if (v.stage !== 'ask' || !t || v.listening || v.helping || v.settling || !step || speech.deaf()) return;
        touch();
        const res = await runtime.useScaffold(instance!, { ...command('help'), scaffoldStepId: step.stepId });
        revision = res.revision;
        mission = res.view;
        const h = helpOf(res.view, t);
        // After SHOW ME only the shown choice can be picked up.
        set({ ...h, line: HELP_LINE(t.kind, step.kind), held: h.shown !== null && v.held !== h.shown ? null : v.held });
        const word = wordKey(t.word ?? t.subject);
        const choices = t.options.filter((o) => !v.tried.includes(o.id)).map((o) => wordKey(o.value));
        const part = t.clue !== null && t.sentences[t.clue - 1] ? [clip(t.sentences[t.clue - 1]!)] : [];
        if (step.kind === 'showAnswer') {
          speak([clip('line.shared.shown')], { gapMs: HELP_GAP_MS, help: true });
        } else if (step.kind === 'guidedSteps') {
          if (t.kind === 'rhyme') speak([clip('line.rhyme.guided'), ...choices.flatMap((c) => [word, c])], { gapMs: HELP_GAP_MS, help: true });
          else if (t.kind === 'sort') speak([GUIDED_SORT, ...(h.hint ? [`slot:sound:${h.hint}`] : []), word], { gapMs: HELP_GAP_MS, help: true });
          // The printed line is "Listen to this part again.": say it, then the part, then the question.
          else if (t.kind === 'story') speak([clip('line.story.clue'), ...part, ...shortAsk(t)], { gapMs: HELP_GAP_MS, help: true });
          // The bunny counts the word's beats out once the line has been said (or could not be).
          else speak([clip('line.hop.guided'), word], { gapMs: HELP_GAP_MS, help: true, onEnd: () => hop(t.beats ?? 0) });
        } else if (t.kind === 'rhyme') {
          speak([clip('line.rhyme.clue'), word, ...choices], { gapMs: HELP_GAP_MS, help: true });
        } else if (t.kind === 'sort') {
          speak([clip('line.sort.clue'), word, word], { gapMs: HELP_GAP_MS, help: true });
        } else if (t.kind === 'hop') {
          speak([clip('line.hop.clue'), word], { gapMs: HELP_GAP_MS, help: true });
        } else {
          speak([clip('line.story.clue'), ...part], { gapMs: HELP_GAP_MS, help: true });
        }
        void persist();
      }),

    toy() {
      if (disposed || v.busy || v.stage !== 'reward' || v.plays >= MAX_PLAYS) return;
      touch();
      set({ plays: v.plays + 1, pulse: v.pulse + 1 });
      // The bunny hops the word's beats with a tick each; the other toys make one small sound.
      if (v.answer?.kind === 'hop' && v.answer.beats) hop(v.answer.beats);
      else audio.effect('place');
      void persist();
    },

    next: () =>
      guard(async () => {
        if (v.stage !== 'reward' || v.settling || !instance || !mission?.narrative) return;
        touch();
        const res = await runtime.acknowledge(instance, command('next'));
        revision = res.revision;
        show(res.view);
        settle();
        // A finished quest moves the rotation on, once.
        if (res.view.status === 'completed' && quest && quest.counted !== instance) {
          quest = { ...quest, finished: quest.finished + 1, counted: instance };
          saveQuest();
        }
        await giveWords();
        announce();
        void persist();
      }),

    again: () =>
      guard(async () => {
        if (v.stage !== 'done' || v.settling) return;
        touch();
        await open(true);
        settle();
        void persist();
      }),

    flush: () => persist(),

    leave() {
      // Leaving: nothing more of this game is said, not even the next clip of a line in its gap while the save is written.
      if (!disposed) speech.stop();
      if (disposed || v.stage !== 'done') return persist();
      // Leaving the end screen: the card in the games room starts a new game next time.
      const id = instance ?? ended;
      ended = null;
      if (!id) return saving;
      const text = JSON.stringify({ v: 1, instance: id, key: '', tried: [], held: null, task: null, answer: null, plays: 0, ended: false } satisfies PlaySave);
      saving = saving.then(() => runtime.putSetting(learnerId, SAVE_KEY, text)).catch((e: unknown) => log('choice.saveFailed', { message: String(e) }));
      return saving;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopHop();
      unsettle?.();
      unhow?.();
      speech.dispose();
      if (instance) runtime.deactivate(instance);
      listeners.clear();
    },
  };
  return flow;
}
