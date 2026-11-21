// Ice Bowling and Garden Golf: copy and presentation data (content/themes/magical-kingdom/games.json)
// read against the kingdom pack. Both games ask for a pictured word's first letter (the letters stand on
// pins or flags), then let the child roll or putt the ball. The engine sees words and letters only; this
// file says which mission a game is, what its turns can ask, and which recording says each line.
// Nothing here scores: right or wrong always comes from the runtime.
import { z } from 'zod';

import raw from '../../../../content/themes/magical-kingdom/games.json';
import learning from '../../../../content/themes/magical-kingdom/learning.json';

const Text = z.string().min(1).max(120);
const Id = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/);

const GameSchema = z
  .object({
    /** The name on the game's own screen, and the short word on its card in the games room. */
    title: Text,
    door: Text,
    mission: Id,
    /** Letters a turn stands up (pins or flags). */
    choices: z.number().int().min(3).max(4),
    /** Rolls or putts a turn allows; the last one always clears. */
    tries: z.number().int().min(1).max(5),
    target: z.enum(['pin', 'flag']),
    /** The card's picture (a MagicArt kind, drawn by ui/). */
    icon: z.enum(['pin', 'flag']),
    backdrop: z.enum(['castle', 'ice', 'garden']),
    /** This game's own wording of a shared line (golf putts where bowling rolls). */
    lines: z.record(z.string(), Text).optional(),
    /** This game's own recording of a line, preferred over the shared clip whenever it is registered. */
    clips: z.record(z.string(), z.string().regex(/^(slot|game):[a-zA-Z0-9.:]+$/)).optional(),
  })
  .strict();

const Schema = z
  .object({
    schemaVersion: z.literal(1),
    games: z.object({ bowling: GameSchema, golf: GameSchema }).strict(),
    labels: z.record(z.string(), Text),
    lines: z.record(z.string(), Text),
    /** Lines with their own recording. A line not listed is spoken from the kingdom narration by its exact text. */
    clips: z.record(z.string(), z.string().regex(/^(slot|game):[a-zA-Z0-9.:]+$/)),
  })
  .strict();

export type GamesCopy = z.infer<typeof Schema>;
export type GameId = 'bowling' | 'golf';
export const GAME_IDS: readonly GameId[] = ['bowling', 'golf'];
export const LINE_KEYS = ['ask', 'retry', 'clue', 'guided', 'shown', 'play', 'cleared', 'done'] as const;
export type LineKey = (typeof LINE_KEYS)[number];
export const LABEL_KEYS = ['turn', 'hear', 'help', 'showMe', 'next', 'again', 'done', 'castle', 'listening', 'ask', 'picture', 'pin', 'flag', 'fallen', 'lane', 'ball', 'tries', 'hint', 'soundOff', 'soundOffHow'] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

type Step = { kind: string; id: string; activityId?: string; items?: number };
type Mission = { id: string; steps: Step[] };
type Activity = { id: string; generator: { id: string }; params: Record<string, unknown> };
type Learning = { pack: { activities: unknown[] }; missions: { missions: unknown[] } };

export interface Turn {
  stepId: string;
  activityId: string;
  /** The words this turn can ask (one is drawn a play). */
  words: string[];
  /** How many letters stand up. */
  choices: number;
}

const turnsIn = (missionId: string, source: Learning): Turn[] => {
  const mission = (source.missions.missions as Mission[]).find((m) => m.id === missionId);
  if (!mission) return [];
  return mission.steps.flatMap((s) => {
    if (s.kind !== 'activity') return [];
    const activity = (source.pack.activities as Activity[]).find((a) => a.id === s.activityId);
    const params = (activity?.params ?? {}) as { words?: { word: string }[]; optionCount?: number };
    return [{ stepId: s.id, activityId: s.activityId ?? '', words: (params.words ?? []).map((w) => w.word), choices: params.optionCount ?? 0 }];
  });
};

/** Every problem with the copy against the kingdom pack; empty when both games can present every turn. */
export function validateGames(input: unknown, source: Learning = learning): string[] {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const c = parsed.data;
  const problems: string[] = [];
  for (const k of LINE_KEYS) if (!c.lines[k]) problems.push(`lines.${k} is missing`);
  for (const k of LABEL_KEYS) if (!c.labels[k]) problems.push(`labels.${k} is missing`);
  for (const k of Object.keys(c.clips)) if (!(LINE_KEYS as readonly string[]).includes(k)) problems.push(`clips.${k} is not a line`);
  // The printed ask never names the word (print after sound); the spoken one must.
  if (c.labels.ask?.includes('{word}')) problems.push('labels.ask must not print the word');
  if (c.lines.ask && !c.lines.ask.includes('{word}')) problems.push('lines.ask must say the word');
  for (const id of GAME_IDS) {
    const game = c.games[id];
    for (const k of [...Object.keys(game.lines ?? {}), ...Object.keys(game.clips ?? {})]) if (!(LINE_KEYS as readonly string[]).includes(k)) problems.push(`${id}: ${k} is not a line`);
    for (const k of Object.keys(game.clips ?? {})) if (!c.clips[k]) problems.push(`${id}: its own ${k} clip has no shared clip to fall back on`);
    const mission = (source.missions.missions as Mission[]).find((m) => m.id === game.mission);
    if (!mission) {
      problems.push(`${id}: mission ${game.mission} is missing from the kingdom pack`);
      continue;
    }
    mission.steps.forEach((s, i) => {
      const last = i === mission.steps.length - 1;
      if ((i % 2 === 0) !== (s.kind === 'activity')) problems.push(`${id}: step ${s.id} breaks the turn, celebration order`);
      if (last && s.id !== 'magic-restored') problems.push(`${id}: the last step must be magic-restored`);
      if (s.kind === 'activity' && (s.items ?? 1) !== 1) problems.push(`${id}: step ${s.id} must ask one item`);
    });
    const seen = new Set<string>();
    for (const turn of turnsIn(game.mission, source)) {
      const activity = (source.pack.activities as Activity[]).find((a) => a.id === turn.activityId);
      if (activity?.generator.id !== 'literacy.beginningSound') problems.push(`${id}: ${turn.activityId} is not a first-letter activity`);
      if (turn.choices !== game.choices) problems.push(`${id}: ${turn.activityId} stands up ${turn.choices} letters, not ${game.choices}`);
      if (!turn.words.length) problems.push(`${id}: ${turn.activityId} has no words`);
      for (const w of turn.words) {
        if (seen.has(w)) problems.push(`${id}: the word ${w} could be asked twice in one game`);
        seen.add(w);
      }
    }
  }
  return problems;
}

const problems = validateGames(raw);
if (problems.length) throw new Error(`Royal games copy: ${problems.join('; ')}`);
export const GAMES = Schema.parse(raw);

/** A game's turns, in order, from its mission. */
export const turnsOf = (game: GameId): Turn[] => turnsIn(GAMES.games[game].mission, learning);
/** Every word a game can ask (each needs a picture and a spoken ask). */
export const wordsOf = (game: GameId): string[] => turnsOf(game).flatMap((t) => t.words);
/** The game a mission belongs to, or null. */
export const gameOfMission = (missionId: string): GameId | null => GAME_IDS.find((g) => GAMES.games[g].mission === missionId) ?? null;

export const fillCopy = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (whole, k: string) => String(vars[k] ?? whole));

/** A line's text: the game's own wording where it has one, else the shared one. */
const lineOf = (key: LineKey, game?: GameId): string => (game ? GAMES.games[game].lines?.[key] : undefined) ?? GAMES.lines[key]!;

/**
 * The recordings that can say a line, best first. A game's own clip comes first (golf's play line), then
 * the shared clip; a line with no clip is spoken from the kingdom narration, keyed by its exact text
 * (audio/sources.ts: `voice:<text>`). A flow says the first one that is registered.
 */
export const voices = (key: LineKey, vars: Record<string, string | number> = {}, game?: GameId): string[] => {
  const own = game ? GAMES.games[game].clips?.[key] : undefined;
  const shared = GAMES.clips[key] ?? `voice:${fillCopy(lineOf(key, game), vars)}`;
  return own && own !== shared ? [own, shared] : [shared];
};

/** The shared recording that says a line (see `voices` for a game's own). An unrecorded key plays nothing. */
export const voice = (key: LineKey, vars: Record<string, string | number> = {}): string => voices(key, vars)[0]!;

/**
 * What to print for a line, in the game's own wording when given. While a question is open the word is
 * never printed (print after sound), so the ask prints its label instead of the spoken sentence.
 */
export const shownLine = (key: LineKey, vars: Record<string, string | number> = {}, game?: GameId): string => (key === 'ask' ? GAMES.labels.ask! : fillCopy(lineOf(key, game), vars));

export const label = (key: LabelKey, vars: Record<string, string | number> = {}): string => fillCopy(GAMES.labels[key]!, vars);
