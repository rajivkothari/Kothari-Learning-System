// Can a child who cannot read yet follow a royal game by ear? Only when the clips it cannot do without
// are registered: every ask, every word the child must hear to choose, and a story's telling. The games
// room dims a card for which this is false, instead of offering a game the child cannot follow.
//
// Pure: it reads the shipped content and asks `has(key)` of the kingdom's audio (GameAudio.has).
// Effects, the how-to line, help, praise and the toy's lines are not essential: their meaning is shown.
import { CHOICE_GAMES, QUEST_MISSIONS, clip, present, questTurns, rhymeAskId, wordKey, type Kind, type PlayId } from './choiceContent';
import { GAME_IDS, turnsOf, voices, type GameId } from './content';

/** What can be asked: a letter game, a picture game or the quest. */
export type RoyalPlay = GameId | PlayId;

const isLetterGame = (play: RoyalPlay): play is GameId => (GAME_IDS as readonly string[]).includes(play);

/** The essential clips a royal game has no recording for (empty when it can be played by ear), in content order, each once. */
export function missingByEar(play: RoyalPlay, audio: { has(key: string): boolean }): string[] {
  const missing = new Set<string>();
  const need = (key: string) => {
    if (!audio.has(key)) missing.add(key);
  };
  if (isLetterGame(play)) {
    for (const t of turnsOf(play)) for (const word of t.words) {
      const ask = voices('ask', { word }, play);
      if (!ask.some((k) => audio.has(k))) missing.add(ask[0]!);
    }
    return [...missing];
  }
  const missions = play === 'quest' ? QUEST_MISSIONS : [CHOICE_GAMES.games[play].mission];
  for (const m of missions) for (const turn of questTurns(m)) for (const item of turn.items) {
    const kind = turn.kind as Kind;
    const p = present(kind, item.id);
    if (!p) continue;
    if (kind === 'story') {
      for (const s of p.sentences) need(clip(s));
      if (p.question) need(clip(p.question));
      continue;
    }
    const word = wordKey(p.subject);
    if (kind === 'rhyme') {
      // The whole recorded ask, or the fragment and the word's own clip.
      const whole = clip(rhymeAskId(p.subject));
      if (!audio.has(whole) && !(audio.has(clip('line.rhyme.ask')) && audio.has(word))) missing.add(whole);
      // Rhymes are chosen by hearing each picture's word.
      for (const v of [item.correct, ...item.distractors.map((d) => d.value)]) need(wordKey(String(v)));
    } else {
      need(word);
      need(clip(`line.${kind}.ask`));
    }
  }
  return [...missing];
}

/** True when every essential clip of the game is registered: the games room may offer its card at full strength. */
export function playableByEar(play: RoyalPlay, audio: { has(key: string): boolean }): boolean {
  return missingByEar(play, audio).length === 0;
}
