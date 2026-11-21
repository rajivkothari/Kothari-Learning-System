# Picture games and the Royal Quest

Four listening games and one quest that mixes them, for the learner-storyteller, a child who cannot read yet: everything works by ear and by picture. Decisions: DECISIONS.md D203, D206 and D207. The design these were rebuilt from is `docs/magical-kingdom/REBUILD_SPEC.md`.

## The games

| Game (card) | Mission | Skill | Turns | A tap | Icon, backdrop |
|---|---|---|---|---|---|
| Rhyme Carousel (Rhymes) | `rhyme-carousel` | `literacy.rhyme` | 4 | picks a picture up and says its word; the gold star commits | horse, garden |
| Treasure Chests (Chests) | `treasure-sort` | `literacy.sound.beginning` | 6 | answers | chest, castle |
| Bunny Hop (Bunny) | `bunny-hop` | `literacy.syllables` | 4 | answers | bunny, garden |
| Story Corner (Stories) | `story-corner` | `literacy.listening.comprehension` | 3 | picks a picture up and says its word; the star commits | book, castle |

`literacy.rhyme` and `literacy.syllables` are in the phonological-awareness strand and `literacy.listening.comprehension` in comprehension, grade band [-1, 0]. Every turn uses the generator `literacy.authoredItem` (at least two items an activity, three choices) and the policy `kingdom.reading`. A turn's kind comes from its item id: `rhyme-<word>`, `sort-<word>`, `hop-<word>`, `story-<question>`. An item id means the same item in every game and quest that uses it, and the validators check that.

Items (the full table is in the spec):
- Rhyme: cat, fox, bee, moon, fish, sun, star and duck, each with one rhyming picture and two that do not (cat: hat; car, moon).
- Chests: the answer is the word's first letter, and a turn's three chests are one set (b f m, c d s; h p t in the quest only).
- Bunny Hop: the answer is the number of beats (1, 2 or 3) of star, cat, moon, fish, bunny, rainbow, apple, flower, butterfly, banana or umbrella.
- Story Corner: three stories of three sentences (a fox in the snow, a duck's lost key, a picnic of the bee and the cat), two questions each. A story's cover shows its characters only, never an answer.

## A turn

1. The ask. The choices, the star and Help are held while what the child must hear to answer is said, and are live the moment the question ends:
   - Rhymes: "Which one rhymes with cat?" (`line.rhyme.ask.cat`, one recorded sentence), or "Which one rhymes with" then the word's clip while the whole sentence is not registered.
   - Chests: the word, then "Which letter does it start with?". Bunny Hop: the word, then "How many claps?".
   - Story Corner: the three sentences 450 ms apart, then the question. A page under the cover lights as each sentence begins (`view.page`; a state, not an animation). The story is told again until it has been heard to its end this visit; after that only the question is asked. "Listen to the story." is said only when the ear asks for a story again: in front of the first telling it was two seconds in which nothing could be touched.
   - On the two pick-up games, "Tap a picture to hear it. Then tap the star." follows the ask as a tail that holds nothing: a tap interrupts it (the picture is picked up and its word said). It counts as taught only when heard to its end, so an interrupted one is said again after the next ask.
   The printed line never names the word asked about (print after sound): "Which one rhymes?", "Which letter does it start with?", "How many claps?", or the story's question.
2. The child chooses: a tap on a chest or a clap count answers; on a rhyme or a story the tap picks a picture up and says its word, and the star commits it.
3. Wrong: a soft retry sound, "Not that one. Listen again." and the short ask, held again while it is said. The choice greys, the same item stays, and it never gets easier.
4. Right: a chime and what was found (the two rhyming words; the letter's sound and the word; "Two claps!"; "Yes!" and the answer), then what the toy does. The toy plays three times at most and NEXT is there from the start: the pair rides the carousel, a gem pops from the chest, the bunny hops the word's beats with a tick each, a gold star lands on the book. A rhyme pair is printed with its shared ending in gold when the two are spelled alike (cat, hat; not bee, key); a sorted word with its first letter in gold.
5. Help, the policy ladder: a clue (rhymes: listen to the ends, the word and each choice; chests: the first sound and the word twice; claps: say it slowly and clap; stories: the sentence that holds the answer), guided help (rhymes: the target beside each choice in pairs; chests: the first letter shown beside the picture with its sound; claps: the bunny counts the beats out, one tick a hop; stories: that sentence then the question), then SHOW ME after two misses: only the shown choice can be chosen.

## The Royal Quest

One guided adventure of five turns that mixes the four kinds, on a path of five stepping stones to a castle; the first and biggest card in the games room. Missions `royal-quest-1..3`, steps `turn-1, cheer-1, ..., turn-5, magic-restored`, each turn its own activity `quest-<q>-turn-<t>`; the table of turns is in the spec. A quest in play is resumed; otherwise `nextQuest(finished)` picks quest 1, 2, 3 in turn. The count lives in the setting `kingdom.quest` (`{finished, counted, current}`), is never evidence, and is recovered from the runtime's record when the app died before it was written or the setting was lost. The same flow plays every turn by its own kind's rules. Every game and quest counts toward the garden's royal gifts.

## Rules, and why

- Theme code never scores: right or wrong comes from `runtime.submit`; help is `runtime.useScaffold` and the runtime assigns the assistance. Hearing again, picking a picture up, reminders, the toy, NEXT, PLAY AGAIN, held taps and the path record nothing. So the evidence is one committed answer per item and the help it took.
- A miss never makes the item easier (CLAUDE.md rule 7): it greys the choice, keeps the item, and shows no spectacle.
- Pick up then the star, on rhymes and stories: a child who cannot read must hear a picture's word before choosing it, and hearing it must not count as an answer.
- Print after sound: no word is printed while its question is open, so a reader in the family cannot give it away and the child listens.
- A play save (`kingdom.play.<game>`) restores the tried and picked-up choices and the celebration's print after leaving or a restart. It is written without waiting and is never evidence; a lost one costs only the picture of what was answered.

## Voice and listening (what the child playtest forced, D207)

- Listening hold: the first ask of an item, and the ask after a miss, hold the choices, the star and Help (`view.listening`). The hold covers only what must be heard to answer (the ask; a story and its question) and ends when the question ends. Measured in Chromium on 2026-11-21 (browser only): see "Checked and not checked". The ear always works and starts the ask again.
- A held tap is answered, never ignored: the control shows its press and the "Listen first" badge turns gold (and swells once unless pictures are still) for 0.9 s after the last such tap (`games/ListeningBadge.tsx`, `MagicalPressable` `onLocked`). It does nothing else and records nothing.
- A telling is said in parts (`GameVoice.tell` in `games/flow.ts`): each sentence, then the question, then the tail. Each part is its own clip sequence, holds or not by itself, and is capped by itself; a part that does not finish (cut, refused, nothing recorded) ends the telling there, and a newer say takes over all of it.
- A say settles on its end report, at once when nothing could play, or at a 30 s cap. A cap while audio still sounds releases the hold and leaves the reminder to the real end.
- One press of Help is one rung (`view.helping`): Help is held while the rung it just gave is being said, and for at least `HELP_GUARD_MS` (1 s) after the press, so a double tap never spends the clue and guided help together. When the rung cannot sound (sound off, nothing recorded) only the 1 s guard holds it; a lost end report holds it to the 30 s cap at most. A held Help shows its press and does nothing.
- Reminders: 12 s after the voice stops, twice at most, the short ask. Then the ear glows slowly (`view.nudge`) until the next touch.
- A line counts as heard only when it is recorded and the sequence carrying it finished by itself (the how-to line, a story).
- In the browser sound waits for a first touch: an ask that could not play is said at that touch, once.
- Gaps: 400 ms between clips, 450 ms between a story's sentences (750 ms until 2026-11-21: with each clip's own tail and the Comfort pace that was nearly a second of nothing, four times a telling, with every control held), 450 ms in help. A closing game hushes only its own speech.
- With no `game:` clip registered (the narration is being recorded again), the games still play through with their lines as text and nothing held. Story Corner is not playable by ear until its clips are registered, and `playableByEar(play, audio)` (`games/playable.ts`) lets the games room dim a card whose essential clips are missing.

## Files

- `content/themes/magical-kingdom/choiceGames.json` (copy, sets, beats, stories, questions, the quest), `games-narration.json` (the recording script, 70 clips), `learning.json` (skills, activities, missions).
- `src/themes/magical-kingdom/games/choiceContent.ts`: `kindOf`, `present`, `printOf`, `questTurns`, `turnItems`, `findItem`, `QUEST`, `QUEST_MISSIONS`, `QUEST_TURNS`, `nextQuest`, `wordKey`, `clip`, `rhymeAskId`, `textOf`, `lineText`, `label`, `validateChoiceGames`, `validateQuests`.
- `games/choiceFlow.ts`: `createChoiceFlow` and its `ChoiceView`. `games/flow.ts`: the shared voice and `GameAudio`. `games/playable.ts`: `playableByEar`, `missingByEar`.
- `audio/playback.ts`: `sequence` with its end report, `busy`, `has`. `audio/recorded.ts`: the kingdom audio and the voice pace. `audio/games.ts` (the audio engineer's): the game clips, empty for now.
- Screens (the UI engineer's): `games/ChoiceGameScreen.tsx`, `games/GamesRoom.tsx`, `games/choiceLayout.ts`.

## Tests

`games/choiceFlow.test.ts` and `games/questContent.test.ts` over the real runtime (node:sqlite): each game whole, one independent attempt a turn, no item twice, nothing else recorded; pick up and the star; the how-to and story rules; help by kind and the bunny's counted hops; the toy; reminders; resume after a restart; a lost play save; the first touch in the browser; no game clips and recorded clips; the whole rhyme ask and its fallback; the three quests in rotation against the spec's table, resume, and the rotation's recovery. `games/content.test.ts`: the copy, the script and every validator rule. `games/playable.test.ts`. `audio/playback.test.ts`: the sequence and its end report.

## Checked and not checked

Checked on 2026-11-20: the tests above, `npm run verify` and `npm run validate:content`, in Node only. Not checked: the screens in a browser (`npm run web:e2e`), the child playtest harness (`scripts/kingdom-child-playtest.js` is not rebuilt), any device, and any child since the rebuild. No game clip is recorded, so nobody has heard any line of these games in this build.
