# Royal games: Ice Bowling and Garden Golf

Two letter games in the Magical Kingdom for the learner-storyteller, a child who cannot read yet. Both ask for the first letter of a word the child hears and sees as a picture, then let the child roll or putt a ball as the reward. Decisions: DECISIONS.md D202 (and D206, D207 for the timing rules). The design these were rebuilt from is `docs/magical-kingdom/REBUILD_SPEC.md`.

## A game

| | Ice Bowling | Garden Golf |
|---|---|---|
| Mission | `royal-bowling` | `royal-golf` |
| Turns | 4 (activities `bowl-letter-1..4`) | 3 (`golf-letter-1..3`) |
| Letters a turn | 4, on pins | 3, on flags |
| Tries with the ball | 2 | 3 |
| Backdrop, card icon | ice, pin | garden, flag |

Both use the generator `literacy.beginningSound`, the skill `literacy.sound.beginning` and the scaffolding policy `kingdom.gentle`. The words are sun, cat, fox, bee, moon, fish, duck and hat; each turn draws from its own words, so a word never comes twice in one game. Each mission alternates an activity step and a narrative step (`eventKey: kingdom.celebrate`), and the last narrative step is `magic-restored`.

## A turn

1. Ask. The picture is shown and the kingdom's recorded sentence "Find the first letter in sun." is said. The printed ask is "Listen. Find the first letter." and never names the word (print after sound). A tap on the picture or the ear says it again.
2. The child taps a letter. That tap is the answer, sent to the runtime, which says right or wrong.
3. Wrong: the letter greys, the same word stays, and "Listen to the word. Try its first sound again." is said with the ask. The item is never made easier.
4. Right: the play stage. The child taps the lane to aim, or taps a pin or a flag. `play.ts` decides where the ball goes: pure functions `spots(n)` (pin and flag positions), `bowl(aim, up, target, last)` and `putt(aim, count, target, attempt, last)`. Bowling knocks down what the ball reaches, and reaching the shining pin knocks them all down. Golf drops the ball when it comes close to the shining flag's hole. The last try always clears. The word is printed now, with its first letter in gold.
5. Cleared: a cheer `ROLL_MS` (600 ms) after the clearing roll, then NEXT. After the last turn, "You finished the game!" and PLAY AGAIN.

Help is the policy ladder: a clue ("Say the word slowly. Listen at the beginning." then the ask), guided help (shows the word's first letter beside the picture), then SHOW ME after two misses (the shining letter; only it can be chosen after that).

Lines: play is "You found it! Now roll the ball." for bowling and "You found it! Now putt the ball." for golf. Golf's own clip `game:line.golf.play` is said when it is registered, and bowling's `game:line.bowling.play` until then.

## Evidence

Only a tapped letter is evidence, and only through `runtime.submit`; help is `runtime.useScaffold`, and the runtime assigns the assistance (`retry` after a miss). Hearing again, reminders, the ball, NEXT, PLAY AGAIN and taps while the game is talking record nothing. Theme code never scores. The play state (greyed letters, the ball, which pin is down) is saved in the setting `kingdom.play.bowling` or `kingdom.play.golf` without waiting; it is a convenience, never evidence, and a lost save costs only the ball.

## Voice and listening

Shared with the picture games (PICTURE_GAMES.md, "Voice and listening"): the letters and Help are held while the first ask of a word, or the ask after a miss, is being said; the ear always works; reminders come only in the quiet; a closing game hushes only its own speech.

## Files

- `content/themes/magical-kingdom/games.json`: titles, labels, lines, clips, golf's own play line. `learning.json`: the missions and activities.
- `src/themes/magical-kingdom/games/content.ts`: the copy read against the pack (`validateGames`, `turnsOf`, `voices`, `voice`, `shownLine`, `label`).
- `games/flow.ts`: `createLetterGameFlow` and its `GameView`; also the shared voice (`createGameVoice`, `createGameIdle`, `createGameSpeech`), `GameAudio` and `gameAudioFrom`.
- `games/play.ts`: the ball. `games/playable.ts`: `playableByEar`.
- Screens (the UI engineer's): `games/LetterGameScreen.tsx`, `games/layout.ts`.

## Tests

`games/flow.test.ts` (over the real runtime on node:sqlite): a whole game is one independent attempt a turn and never the same word twice; nothing records but answers and help; a miss and retry; the help ladder and SHOW ME; listening holds, the end and the 30 s cap; reminders and the nudge; the browser's first touch; the ball; resume after leaving and after an app restart; a lost play save; a closing game; both games with no game clips; golf's own line with and without its clip. `games/play.test.ts`: the ball. `games/content.test.ts`: the copy, the clips and the validator. `games/playable.test.ts`.

## Checked and not checked

Checked on 2026-11-20: the tests above, `npm run verify` and `npm run validate:content`, in Node only. Not checked: the screen in a browser (`npm run web:e2e`), any device, and any child. The game narration clips (`game:`) are not recorded yet, so the play, cleared and done lines are text only; the asks, retry, clue and guided lines use the kingdom's earlier narration recordings (`narration-v1`), not yet heard in these games.
