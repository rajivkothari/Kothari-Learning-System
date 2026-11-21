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
4. Right (Next takes no press for 0.8 s, see "Voice and listening"): a chime and what was found (the two rhyming words; the letter's sound and the word; "Two claps!"; "Yes!" and the answer), then what the toy does. The toy plays three times at most and NEXT is there from the start: the pair rides the carousel, a gem pops from the chest, the bunny hops the word's beats with a tick each, a gold star lands on the book. A rhyme pair is printed with its shared ending in gold when the two are spelled alike (cat, hat; not bee, key); a sorted word with its first letter in gold. A story's answer is shown as its own picture with its word printed under it, beside the book that takes the stars (never the word under the book). The ear in the celebration says the printed line and then what the toy does ("They rhyme! Tap the horse for a ride!"), so print and sound agree.
5. Help, the policy ladder: a clue (rhymes: listen to the ends, the word and each choice; chests: the first sound and the word twice; claps: say it slowly and clap; stories: the sentence that holds the answer), guided help (rhymes: the target beside each choice in pairs; chests: the first letter shown beside the picture with its sound; claps: the bunny counts the beats out, one tick a hop; stories: "Listen to this part again.", that sentence, then the question), then SHOW ME after two misses: only the shown choice can be chosen. The shown choice gets a gold frame with a tick and swells once (the frame and tick alone when pictures are still), so SHOW ME is seen to do something even when two misses have left only that choice.

## The Royal Quest

One guided adventure of five turns that mixes the four kinds, on a path of five stepping stones to a castle; the first and biggest card in the games room. Missions `royal-quest-1..3`, steps `turn-1, cheer-1, ..., turn-5, magic-restored`, each turn its own activity `quest-<q>-turn-<t>`; the table of turns is in the spec. A quest in play is resumed; otherwise `nextQuest(finished)` picks quest 1, 2, 3 in turn. The count lives in the setting `kingdom.quest` (`{finished, counted, current}`), is never evidence, and is recovered from the runtime's record when the app died before it was written or the setting was lost. The same flow plays every turn by its own kind's rules. Every game and quest counts toward the garden's royal gifts.

## Rules, and why

- Theme code never scores: right or wrong comes from `runtime.submit`; help is `runtime.useScaffold` and the runtime assigns the assistance. Hearing again, picking a picture up, reminders, the toy, NEXT, PLAY AGAIN, held taps and the path record nothing. So the evidence is one committed answer per item and the help it took.
- A miss never makes the item easier (CLAUDE.md rule 7): it greys the choice, keeps the item, and shows no spectacle.
- Pick up then the star, on rhymes and stories: a child who cannot read must hear a picture's word before choosing it, and hearing it must not count as an answer.
- Print after sound: no word is printed while its question is open, so a reader in the family cannot give it away and the child listens.
- A play save (`kingdom.play.<game>`) restores the tried and picked-up choices and the celebration's print after leaving or a restart. It is written without waiting and is never evidence; a lost one costs only the picture of what was answered.
- The end screen survives a restart: the play save marks a finished game (`ended`), and an app restart or a browser reload on the end screen comes back to it (no new game is started behind it, nothing is recorded). Leaving for the games room (`flow.leave()`, which the screen calls when it closes) clears the mark, so the card starts a new game.
- The quest rotation is written through the one save chain, so an older queued write cannot land after a newer one.

## Voice and listening (what the child playtest forced, D207)

- Listening hold: the first ask of an item, and the ask after a miss, hold the choices, the star and Help (`view.listening`). The hold covers only what must be heard to answer (the ask; a story and its question) and ends when the question ends. Measured in Chromium on 2026-11-21 (browser only): see "Checked and not checked". The ear always works and starts the ask again.
- A held tap is answered, never ignored: the control shows its press and the "Listen first" badge turns gold (and swells once unless pictures are still) for 0.9 s after the last such tap (`games/ListeningBadge.tsx`, `MagicalPressable` `onLocked`). It does nothing else and records nothing.
- A telling is said in parts (`GameVoice.tell` in `games/flow.ts`): each sentence, then the question, then the tail. Each part is its own clip sequence, holds or not by itself, and is capped by itself; a part that does not finish (cut, refused, nothing recorded) ends the telling there, and a newer say takes over all of it.
- A say settles on its end report, at once when nothing could play, or at a 30 s cap. A cap while audio still sounds releases the hold and leaves the reminder to the real end.
- One press of Help is one rung (`view.helping`): Help is held while the rung it just gave is being said, and for at least `HELP_GUARD_MS` (1 s) after the press, so a double tap never spends the clue and guided help together. When the rung cannot sound (sound off, nothing recorded) only the 1 s guard holds it; a lost end report holds it to the 30 s cap at most. A held Help shows its press and does nothing.
- A guard after every stage change (`STAGE_GUARD_MS`, 0.8 s, `view.settling`): what has just appeared under the child's finger shows a press and does nothing. After a right answer Next waits (it is drawn where the star stood, so the second tap of a double tap on the star would skip the celebration); after Next, Help waits; at the end, Play again and More games wait; the games room's cards wait 0.8 s on arrival (More games sits over a card). The toy is not guarded.
- A stalled clip: a clip still sounding at the 30 s cap gets `STALL_MS` (10 s) more; then it is hushed and the say settles, so the reminders and the nudge still come.
- Reminders: 12 s after the voice stops, twice at most, the short ask. Then the ear glows slowly (`view.nudge`) until the next touch.
- A line counts as heard only when it is recorded and the sequence carrying it finished by itself (the how-to line, a story). A clip that failed (a play the browser refused, a file that would not load or decode) did not play: the clip reports `finished(false)` (`audio/clip.web.ts`, `audio/clip.ts`), the sequence ends there at once and reports false, and nothing is marked told or taught. A failure never holds anything.
- Two channels (`audio/playback.ts`): the voice (speech and whole sequences, one at a time) and one-shot effects (a tap's tick). An effect is refused while the voice is speaking, but a voice that starts after it does not cut it: the tick of the tap that answers plays out under the chime and the first word. `hush`, Sound off and `release` cut both.
- Sound that cannot play (DECISIONS.md D212). These games are played by ear, so while sound cannot play (Sound off in Comfort, the app behind another, the browser before its first touch) the ask is owed: the choices, the star and Help stay held, no reminder is spent, nothing is picked up, answered or helped, and the ask is said again from the start when sound can play (`createGameSpeech` with `byEar`; `GameAudio.canSound` and `whenReady`). An ask cut because sound went away is owed the same way. With Sound off in Comfort the games room dims every royal game and shows a speaker with a line through it on each card, and a game already open pauses to that picture with the way back to the games room (`games/SoundOff.tsx`, `audio/soundSwitch.ts`); a game restored at launch is not opened until sound is on. An audio that cannot tell whether sound can play holds nothing for it.
- Gaps: 400 ms between clips, 450 ms between a story's sentences (750 ms until 2026-11-21: with each clip's own tail and the Comfort pace that was nearly a second of nothing, four times a telling, with every control held), 450 ms in help. A closing game hushes only its own speech.
- A clip that is not registered plays nothing and its line stays on screen as text; nothing is held for it. A game missing a clip it cannot do without (an ask, a word to choose by, a story's telling or question) is dimmed in the games room: `playableByEar(play, audio)` (`games/playable.ts`). All the clips of batch 1 are registered in `audio/games.ts` today.

## Files

- `content/themes/magical-kingdom/choiceGames.json` (copy, sets, beats, stories, questions, the quest), `games-narration.json` (the recording script, 70 clips; the takes in use are registered in `audio/games.ts`), `learning.json` (skills, activities, missions).
- `src/themes/magical-kingdom/games/choiceContent.ts`: `kindOf`, `present`, `printOf`, `questTurns`, `turnItems`, `findItem`, `QUEST`, `QUEST_MISSIONS`, `QUEST_TURNS`, `nextQuest`, `wordKey`, `clip`, `rhymeAskId`, `textOf`, `lineText`, `label`, `validateChoiceGames`, `validateQuests`.
- `games/choiceFlow.ts`: `createChoiceFlow` and its `ChoiceView`. `games/flow.ts`: the shared voice and `GameAudio`. `games/playable.ts`: `playableByEar`, `missingByEar`.
- `audio/playback.ts`: `sequence` with its end report, `busy`, `has`. `audio/recorded.ts`: the kingdom audio and the voice pace. `audio/soundSwitch.ts`: whether sound can play (the switch and the first touch), `kingdomSound` for the screens. `audio/games.ts`: the game clips.
- Screens: `games/ChoiceGameScreen.tsx`, `games/GamesRoom.tsx`, `games/choiceLayout.ts`, `games/ListeningBadge.tsx` (the badge and the held taps), `games/SoundOff.tsx` (the picture, the card, `useSoundOff`).

## Tests

`games/refusedClip.test.ts` (a browser that refuses to play, over the real player), `audio/soundSwitch.test.ts`, `audio/letterSounds.test.ts` (the licence beside the shipped letter sounds; f has no sound yet, so Treasure Chests' set b f m says nothing for f). `games/choiceFlow.test.ts` and `games/questContent.test.ts` over the real runtime (node:sqlite): each game whole, one independent attempt a turn, no item twice, nothing else recorded; pick up and the star; the how-to and story rules; help by kind and the bunny's counted hops; the toy; reminders; resume after a restart; a lost play save; the first touch in the browser; no game clips and recorded clips; the whole rhyme ask and its fallback; the three quests in rotation against the spec's table, resume, and the rotation's recovery. `games/content.test.ts`: the copy, the script and every validator rule. `games/playable.test.ts`. `audio/playback.test.ts`: the sequence and its end report.

## Checked and not checked

Checked on 2026-11-21, in Node and in Chromium only (browser only: not on a device, with no child, and nobody has listened to a clip):
- The tests above, `npm run verify`, `npm run validate:content`.
- `npm run web:kingdom-playtest` at 1180 x 820 on an export of this branch (the three scripted children, then `KP_SOUND=off`), no failures. The listener's hold on the first turn, before and after the hold rule changed: Rhymes 8.6 s to 3.4 s; Story Corner 20.7 s to 11.8 s when the duck's story comes first and 23.6 s to 14.6 s when the fox's does; the quest's story turn 17.3 s to 13.6 s. The masher (taps everything the instant it can): the four picture games in 227 to 259 s with 15 to 19 misses over three runs, never an answer while an ask was being said (261 s and 20 misses before). With Sound off the same masher used to clear the four games in 5.2 s with 11 misses, all recorded; now no card starts a game and nothing is recorded, a game open when Sound is switched off pauses to the picture, and its story is told again from the start when Sound is back.
- The explorer's checks of each fix (the header of `scripts/kingdom-child-playtest.js` lists them): Help double-tapped, how to play interrupted, a held tap answered, the story's pages, the right letter and the star double-tapped, the answer under its own picture, the reading typeface, SHOW ME's tick, a reload on the end screen, More games double-tapped. No tap's tick was cut (40 of 40 played out in one run) and no clip was refused.
- `E2E_ONLY="Magical Kingdom" npm run web:e2e`: six checks, among them Sound off in the games room and a reload on the end screen of Garden Golf and Bunny Hop.

Not checked: any tablet (so no claim about timing, sound or touch on a Fire HD 8 or an iPad), Reduced Motion on a device, a real child, and a person's ear on any clip. The game clips are the default takes of batch 1, picked by measurement (`humanReviewed: false`). The letter f has no sound.
