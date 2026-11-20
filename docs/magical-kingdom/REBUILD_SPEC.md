# Rebuild spec: the Magical Kingdom games (D202 to D207)

This work was built once, checked, and then lost on 2026-11-20 with an unpushed branch (DECISIONS.md D208). This file is the design as it stood when it was lost, written down so it can be rebuilt without rediscovering anything. It is a spec, not a record of code that exists: tick the status list at the end as each part lands. Delete this file when the list is fully ticked and the docs it names exist.

Rebuild straight to the final design. The intermediate states do not matter.

## Who it is for

The learner-storyteller: five years old, cannot read yet. Everything must work by ear and by picture. Never write a real name, age or family detail in any tracked file, test, comment, commit message or branch name (CLAUDE.md rule 14).

## What already exists on this branch (do not rebuild)

`src/themes/magical-kingdom/`: `KingdomApp.tsx` (castle hall, ice adventure, Comfort dialog, gift dialog, wardrobe), `director/kingdom.ts`, `wordGarden/` (flow, screen, content), `audio/` (`playback.ts` with `speak`, `slot`, `play`, `hush`; `recorded.ts`; `sources.ts` keyed by exact text as `voice:<text>`; `reading.ts` with `slot:word:cat|hat|map|pig|sun` and `slot:line:*`; `effects.ts`), `ui/` (`MagicalPressable`, `MagicArt` icons, `Princess`, `WardrobeArt`, `palette`), `appContent.ts`, `wardrobe.ts`. Content in `content/themes/magical-kingdom/` (`learning.json` pack and missions at version 2026.10.2, `ui.json`, `wardrobe.json`, `wordGarden.json`, `wordGarden.recordings.json`). Backdrops `castle.png`, `ice.png`, `garden.png`. Recorded narration in `assets/themes/magical-kingdom/audio/narration-v1/` includes "Find the first letter in <word>." for sun, cat, fox, bee, moon, fish, duck, hat, plus the garden retry, clue and guided lines (see `ui.json`: `gardenInstruction`, `gardenRetry`, `gardenClue`, `gardenGuided`).

Read before building: `CLAUDE.md`, `docs/magical-kingdom/WORD_GARDEN.md`, `wordGarden/flow.ts` and its test (the pattern every game flow follows), `scripts/web-e2e.js` (the Magical Kingdom check).

## Rules every game obeys

- Theme code never scores. Right or wrong comes from `runtime.submit`. Evidence is only a committed answer and help (`runtime.useScaffold`). Hearing again, picking a picture up, reminders, toys, NEXT, PLAY AGAIN, locked taps, the crown and the path record nothing.
- A miss greys the choice, keeps the same item, earns no spectacle, and never makes the item easier.
- Each game is a runtime mission: steps alternate `activity` and `narrative` (`eventKey: kingdom.celebrate`, last narrative id `magic-restored`). A mission instance per play: `findActiveMission`, `missionCompatibility` (abandon if incompatible), `startMission`, `activate`, `submit`, `useScaffold`, `acknowledge`, `deactivate`. A play save in settings (`kingdom.play.<game>`) restores tried choices and the play state; it is a convenience written without awaiting (`void persist()`), never evidence.
- Help is the policy ladder: clue (`highlightGiven`), guided (`guidedSteps`), SHOW ME (`showAnswer`, demonstrated, offered after two misses; then only the shown choice can be chosen). After a miss the assistance recorded is `retry`.
- Print after sound: no word is printed while a question is open.
- Copy lives in `content/themes/`, never in code. Reduced Motion (`still`) means nothing moves or pulses.

## Voice and timing (the part the child playtest forced)

- `audio/playback.ts` `sequence(keys, gapMs, onEnd?)` plays recorded keys in order, skips unrecorded ones, and calls `onEnd` exactly once: `true` when the last clip finished by itself; `false` when cut (a new request, `hush`, mute, `release`), when nothing could play (nothing recorded, the browser's gesture gate closed, sound disabled) and then synchronously with `sequence` returning false. Effects (`play`) are refused during a sequence, gaps included. `busy()` says whether a sequence or clip is running.
- `GameAudio { say(keys, gapMs?, onEnd?), effect(name), hush(), whenReady?(fn) }`. A shared `createGameVoice(audio, wait, { hold, quiet })` in `games/flow.ts` gives each `say` a serial; a newer say takes over; the voice settles on the end report, at once if the say did not start, or at a cap (`SPEECH_CAP_MS = 30_000`). Settling releases the hold and arms the reminder, except that a cap firing while `audio.busy()` waits for the real end before arming.
- Listening time: the first ask of an item, and after a miss "listen again" plus the ask, hold the choices and Help (`view.listening`). While held, taps on choices, the star and Help do nothing and record nothing, but still show their press. The ear always works and replays the ask. Reminders, help audio, picking up and celebrations do not hold.
- Reminder: `REMIND_MS = 12_000` after the voice stops, `MAX_REMINDERS = 2`, the short ask. After the last one `view.nudge = true` (the ear keeps a slow glow, about 0.4 Hz, a static ring when still) until the next touch.
- The how-to line "Tap a picture to hear it. Then tap the star." is appended to every ask of a picture turn until a sequence carrying it has finished by itself (`taught`).
- Story Corner: a story counts as heard only when a sequence containing it finished by itself. Until then the ear retells the story then asks; after that it asks only the question.
- In the browser sound waits for a first touch: an ask that could not play is said at that touch (`whenReady`, from the audio gate's `onOpen`; keep the platform difference in the adapter).
- A closing game hushes only its own speech. Gaps: 400 ms between clips, 750 ms between a story's sentences, 450 ms in help.
- All speech follows the Comfort voice pace (`SLOW_VOICE = 0.88`, on by default, pitch kept; setting `kingdom.voice`).
- `ui/MagicalPressable`: `maxDuration` 3000 ms; a `locked` prop keeps the press animation, reports `aria-disabled`, and does not fire.

## The six games

### Ice Bowling and Garden Golf (`games/flow.ts`, `play.ts`, `layout.ts`, `LetterGameScreen.tsx`, `content.ts`, `content/.../games.json`)

Missions `royal-bowling` (four turns, activities `bowl-letter-1..4`, four letter choices) and `royal-golf` (three turns, `golf-letter-1..3`, three choices), generator `literacy.beginningSound`, skill `literacy.sound.beginning`, policy `kingdom.gentle`, each turn drawing from its own words so a word never repeats in a game. Words: sun, cat, fox, bee, moon, fish, duck, hat.

- ask: picture and "Find the first letter in sun." (recorded, `voice:<text>`). Letters on pins (bowling) or flags (golf). A tap on the picture or the ear repeats it.
- play (after a right letter): tap the lane to aim, or tap a pin or flag. `play.ts` is pure: `spots(n)` are the x positions (for 3: -0.75, 0, 0.75; for 4: -0.75, -0.25, 0.25, 0.75), `bowl(aim, up, target, last)`, `putt(aim, count, target, attempt, last)`. Bowling: the ball knocks down what it reaches and reaching the shining pin knocks them all down; two tries. Golf: the ball drops when it comes close to the shining flag's hole; three tries. The last try always clears. A fallen pin shows no letter.
- lines: retry "Listen to the word. Try its first sound again." (recorded), clue "Say the word slowly. Listen at the beginning." then the ask, guided "Look at the first letter beside the picture." (shows the letter), shown = Word Garden's `slot:line:showSound`, play `game:line.bowling.play`, cleared `game:line.bowling.cleared`, done `game:line.shared.done`.
- After the answer the word is printed with its first letter in gold.
- testIDs: `royal-game-<game>`, `game-picture-<word>`, `game-target-<letter>`, `game-lane`, `game-ball`, `game-word`, `game-revealed`, `game-line`, `game-next`, `game-done`, `game-again`, `game-castle`, `game-hear`, `game-help`, `game-listening`.

### The four picture games (`games/choiceFlow.ts`, `choiceContent.ts`, `choiceLayout.ts`, `ChoiceGameScreen.tsx`, `content/.../choiceGames.json`)

Generator `literacy.authoredItem` (`params.items: [{id, correct, distractors:[{value}]}]`, at least two items an activity), policy `kingdom.reading`, three choices. The kind of a turn comes from its item id prefix (`kindOf`): `rhyme-<word>`, `sort-<word>`, `hop-<word>`, `story-<question>`. Item ids are shared between the single games and the quest and must be identical everywhere.

| Game | Mission | Skill | Turns | Tap | Icon, backdrop |
|---|---|---|---|---|---|
| Rhyme Carousel ("Rhymes") | `rhyme-carousel` | `literacy.rhyme` | 4 | picks up and says the word; the gold star commits | horse, garden |
| Treasure Chests ("Chests") | `treasure-sort` | `literacy.sound.beginning` | 6 | answers | chest, castle |
| Bunny Hop ("Bunny") | `bunny-hop` | `literacy.syllables` | 4 | answers | bunny, garden |
| Story Corner ("Stories") | `story-corner` | `literacy.listening.comprehension` | 3 | picks up and says the word; the star commits | book, castle |

New skills: `literacy.rhyme`, `literacy.syllables` (strand phonologicalAwareness), `literacy.listening.comprehension` (strand comprehension), grade band [-1, 0].

Items (correct, then distractors):
- rhyme: cat→hat [car, moon]; fox→box [fish, key]; bee→key [bun, duck]; moon→spoon [map, fish]; fish→dish [fox, sun]; sun→bun [star, hat]; star→car [sun, box]; duck→truck [dish, bee]. Turns: {cat, fox}, {bee, moon}, {fish, sun}, {star, duck}.
- sort (the answer is the first letter; the three choices are the chest set): set b f m: moon, bee, fox, map, box, fish, bun; set c d s: cat, duck, sun, car, dish, star; set h p t (quest only): hat, pig, truck. Turns: {moon, bee}, {fox, map}, {box, fish, bun}, {cat, duck}, {sun, car}, {dish, star}.
- hop (the answer is the number of beats; choices 1, 2, 3): star 1, cat 1, moon 1, fish 1, bunny 2, rainbow 2, apple 2, flower 2, butterfly 3, banana 3, umbrella 3. Turns: {star, bunny, rainbow}, {apple, butterfly, moon}, {cat, banana}, {flower, umbrella, fish}.
- story: a1 hat [fish, key]; a2 apple [bun, banana]; b1 key [hat, spoon]; b2 box [car, dish]; c1 bun [fish, apple]; c2 moon [sun, star]. Turns: {a1, b1}, {a2, c1}, {b2, c2}. Story covers show characters only, never an answer: a = fox, snow; b = duck; c = bee, cat. Clue sentence (the one that holds the answer): a1 2, a2 3, b1 1, b2 3, c1 2, c2 3.

What is said (clip ids are in the narration list below; `word(x)` is the word's clip):
- first ask: rhyme `line.rhyme.ask` + word(target); sort word + `line.sort.ask`; hop word + `line.hop.ask`; story `line.story.intro` + the three sentences + the question (the story is told when it was not the last one told this visit).
- picking a picture up: word(value). Wrong: `effect:retry`, `line.shared.retry`, the short ask.
- right: rhyme success, word(target), word(answer), `line.rhyme.right`, `line.rhyme.play`; sort success, the letter's sound (`slot:sound:<letter>` when recorded), word, `line.sort.right`, `line.sort.play`; hop success, `line.hop.right<n>`, `line.hop.play`; story success, `line.shared.yes`, word(answer), `line.story.play`.
- clue: rhyme `line.rhyme.clue`, word(target), each choice's word; sort `line.sort.clue`, word, word; hop `line.hop.clue`, word; story `line.story.clue`, the clue sentence.
- guided: rhyme `line.rhyme.guided` then target and each choice in pairs; sort the kingdom's recorded "Look at the first letter beside the picture." then the letter's sound and the word, with the letter shown beside the picture; hop `line.hop.guided`, word, one `effect:place` tick a beat while the bunny hops them; story the clue sentence then the question.
- shown `line.shared.shown`. Done `line.shared.done`.
- toy (after a right answer, three taps at most, NEXT is there from the start): rhyme the pair rides up and down; sort a gem pops from the chest; hop the bunny hops the word's beats with a tick each; story a gold star (the 3D star picture, no face) on the book.

After the answer: a rhyme pair is printed with its shared ending in gold when the two are spelled alike (cat, hat; not bee, key); a sorted word with its first letter in gold; the others plain.

testIDs: `choice-game-<id>`, `choice-item-<itemId>`, `choice-picture-<word>`, `choice-story-<id>`, `choice-option-<value>`, `choice-held-<value>`, `choice-star`, `choice-payoff`, `choice-next`, `choice-done`, `choice-again`, `choice-castle`, `choice-hear`, `choice-help`, `choice-line`, `choice-print-<word>`, `choice-revealed`, `choice-listening`, `choice-path`, `choice-stone-<n>` / `choice-stone-lit-<n>` (the bunny's stones).

### The Royal Quest

One guided adventure of five turns that mixes the picture games; first and biggest card in the games room; title "Royal Quest", door "Quest", icon `quest`, backdrop garden. Missions `royal-quest-1..3`, steps `turn-1, cheer-1 … turn-5, magic-restored`, each turn its own activity `quest-<q>-turn-<t>`:

| Quest | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 1 | rhyme: moon, star | chest b f m: bee, fox, box, bun | hop: cat, bunny, butterfly | story a: a1, a2 | chest h p t: hat, pig, truck |
| 2 | rhyme: cat, duck | chest c d s: car, dish, star | hop: fish, rainbow, banana | story b: b1, b2 | rhyme: sun, moon |
| 3 | hop: star, apple, umbrella | rhyme: bee, fox | chest h p t: hat, pig, truck | story c: c1, c2 | hop: fish, flower, butterfly |

The same flow and screen as the four games, deciding everything per turn. Which quest: resume an active one; otherwise `nextQuest(finished)` rotating 1, 2, 3; the count is in the setting `kingdom.quest` (`{finished, counted, current}`, never evidence, recovered from the runtime's record if the app died before it was written). The turn dots become a path of five stepping stones each carrying that turn's game picture (done gold, current ringed) ending at a castle (the `home` icon, lit when done); on windows where stones would be under 40 pt the path takes its own row. The end shows the princess celebrating (`ui/Princess`, `celebration`, the learner's `look`) beside the quest picture, and says `line.shared.done`. All three quests count toward the garden's royal gifts. testIDs: `play-quest`, `choice-game-quest`, `quest-path`, `quest-stone-<n>[-done|-now]`, `quest-castle[-done]`.

Helpers in `choiceContent.ts`: `kindOf`, `present(kind, itemId)`, `questTurns(missionId)`, `turnItems`, `findItem`, `QUEST`, `QUEST_MISSIONS`, `QUEST_TURNS`, `nextQuest`, `wordKey` (Word Garden words use `slot:word:<w>`, others `game:word.<w>`), `clip(id)` = `game:<id>`, `textOf(clipId)`, `validateChoiceGames()` and `validateQuests()` (pictures, recordings, no item twice in a game or quest, chest = first letter and one set a turn, beats = answer, a cover never shows an answer, a reused id identical everywhere).

## The castle, the games room, the pictures

- The castle hall gets one Royal Games button above the guide (`open-games`), positioned from the guide's measured height. It opens a games room (`games-room`): the quest card across the top, six game cards below (three across in landscape, two in portrait), `play-<id>`. A finished game returns to the room; the done button reads MORE GAMES. `kingdom.place` remembers the room, a game or the quest across a reload. The cards stay live while the director is briefly busy.
- The crown (Comfort, `comfort-crown`) opens only after a two-second hold, with a ring that fills; a quick tap wiggles it. Comfort has a voice pace button.
- The gift dialog (`gift-dialog`, `gift-open`, `gift-keep`, `gift-item-<id>`) shows the gifts as pictures, has an ear, a hanger on "Open my wardrobe" and the castle on "Back to castle"; "A royal gift for you!" is spoken when the dialog appears and never over a game. Gifts already announced are kept in the setting `kingdom.gifts`, so one not yet put away returns after a reload; on first run everything already unlocked counts as announced.
- Inside a game the smiling gold star is only the choose button (the recorded line says "tap the star"). Next is an arrow, Play Again a circular arrow, Help a light bulb in a speech bubble (the word "Help" drops below about 420 pt wide), the empty held frame shows the horse or the book and is solid.
- Choice tiles stay opaque in every state and fade only their contents: live (pale blue), waiting (cream, contents 60%), tried (stone, 35%), not chosen after the answer (paper, 30%). Next, Play Again and More Games are at least 64 pt tall; choices at least 64 pt.
- Layout is pure math with a window test: 1180x820, 820x1180, 1366x1024, 1133x744, 960x600, 600x960, 590x820, 375x820. A stage of two slots above three choices, beside them in short landscape windows.

## Recordings

### Game narration (61 clips, already generated once: ElevenLabs flow `SYNPSZyz8kjVDGZsdawC`, voice `jemqINv7N9LKUclcLQnU` "Jo M. ~ Friendly Professional Voice", model `eleven_multilingual_v2`, mp3_44100_128, words at default settings, sentences at speed 0.88; 1,063 credits, plus a 32 credit pilot)

Try to download the existing takes from that flow before generating anything. Regenerating costs credits and needs the owner's approval (asked for on 2026-11-20). Processing was: fixed gain to -26 LUFS integrated with true peak at or under -1.5 dBTP, mp3 128 kbps mono 44.1 kHz, end silence over 0.4 s cut to 0.15 s. Files `assets/themes/magical-kingdom/audio/games-v1/<id>.mp3`, `manifest.json` (text, bytes, sha256, duration, words per second, credits, transcript, `aiGenerated: true`, `humanReviewed: false`), sources `audio/games.ts` as `'game:<id>': require(...)`, script `content/themes/magical-kingdom/games-narration.json`. A test keeps script, manifest and sources in step and `humanReviewed` false until a person listens. Measured pace: sentences 1.6 to 4.5 words a second, median 3.1; a pilot at speed 0.7 still measured 3.3. Nobody has heard any clip.

- Words `word.<w>`: fox, box, bee, key, moon, spoon, fish, dish, bun, star, car, duck, truck, bunny, rainbow, apple, butterfly, banana, flower, umbrella. (cat, hat, sun, map, pig reuse the Word Garden's.)
- `line.shared.hearThenStar` "Tap a picture to hear it. Then tap the star." · `line.shared.retry` "Not that one. Listen again." · `line.shared.yes` "Yes!" · `line.shared.shown` "Here it is. Tap the shining one." · `line.shared.done` "You finished the game!"
- `line.bowling.play` "You found it! Now roll the ball." · `line.bowling.cleared` "Hooray!"
- `line.rhyme.ask` "Which one rhymes with" · `.clue` "Listen to the end of each word." · `.guided` "Listen to them side by side." · `.right` "They rhyme!" · `.play` "Tap the horse for a ride!"
- `line.sort.ask` "Which letter does it start with?" · `.clue` "Listen to the first sound." · `.right` "Into the chest!" · `.play` "Tap the chest to get your gem!"
- `line.hop.ask` "How many claps?" · `.clue` "Say it slowly and clap." · `.guided` "Count the hops." · `.right1` "One clap!" · `.right2` "Two claps!" · `.right3` "Three claps!" · `.play` "Tap the bunny to hop!"
- `line.story.intro` "Listen to the story." · `.clue` "Listen to this part again." · `.play` "Tap the book for a gold star!"
- `story.a.1` "A little fox was cold in the snow." · `.a.2` "The princess gave the fox a warm hat." · `.a.3` "Then they shared a sweet apple."
- `story.b.1` "The duck lost her shiny key." · `.b.2` "She looked in the car." · `.b.3` "The key was in the box!"
- `story.c.1` "The bee and the cat had a picnic." · `.c.2` "They ate a big, sweet bun." · `.c.3` "Then they looked up at the moon."
- `q.a1` "What did the princess give the fox?" · `q.a2` "What did they share?" · `q.b1` "What did the duck lose?" · `q.b2` "Where was the key?" · `q.c1` "What did they eat?" · `q.c2` "What did they look at?"

### Letter sounds (D204, D205)

The Word Garden's 16 sounds (a b c d e g h i m n o p s t u z) each use the take from Open Letter Sounds (`https://github.com/purplecomputerorg/openlettersounds`, commit `4f3263be3a961587d175f73b19553e3c07a016e5`, folder `sounds/en-us/marin`, CC0 1.0, a synthetic voice; only that folder is CC0). Each WAV re-encoded to mp3 128 kbps mono 44.1 kHz with a fixed -4 dB gain into `audio/word-garden-phonemes-review/library.<letter>.mp3`, with the library's licence text beside them and source, commit and hashes in `wordGarden.recordings.json`. The owner instructed that all 16 be used without saying anyone listened, so each is `audition: approved`, `approval: owner instruction, not yet heard by a person`, `humanReviewed: false`, copied to `audio/word-garden-v1/sound.<letter>.mp3` and registered in `audio/reading.ts` as `slot:sound:<letter>`. `scripts/letter-sounds.js` has `status`, `page`, `library <dir>`, `level` (brings the kingdom-voice takes up to about -27 dB mean, the words' level), and `approve <letter> <takeN|library|file.mp3> --heard|--owner` (never stores a name).

## Open assets (D206), all shipped inside the app with a manifest, licence text and a hash test beside them, listed in `docs/THIRD_PARTY_ASSETS.md`

- Pictures: Microsoft Fluent Emoji, 3D style, MIT, `microsoft/fluentui-emoji` at commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc` (`assets/<Name>/3D/<name>_3d.png` from raw.githubusercontent.com), 256 px PNGs in `assets/themes/magical-kingdom/pictures/`. fox Fox, box Package, bee Honeybee, key Key, moon Crescent moon, spoon Spoon, fish Fish, dish Fork and knife with plate, star Star, car Automobile, duck Duck, truck Delivery truck, bunny Rabbit face, rainbow Rainbow, apple Red apple, butterfly Butterfly, banana Banana, flower Blossom, umbrella Umbrella, cat Cat, hat Womans hat, map World map, pig Pig face, snow Snowflake, horse Carousel horse, book Open book, pin Bowling, flag Flag in hole. `sun` and `bun` stay code-drawn (no emoji reads as either), as do chests, gem and every control. `ui/WordPicture.tsx` draws a word's picture and falls back to `MagicIcon`; `ui/pictures.ts` is the map. Picture cards sit on pale blue.
- Code-drawn icons to add to `MagicArt.tsx`: pin, flag, bun, chest, chestOpen, gem, carrot, heart, check, arrow, again, quest, stone, ear, hanger, bulb. Prefer lines and quadratic curves (SVG arcs are untested on native Skia).
- Effects: Kenney "Interface Sounds" and "85 short music jingles" (CC0, from OpenGameArt): place `drop_002`, remove `minimize_008`, success `jingles_PIZZA16`, retry `question_004`, gift `jingles_PIZZA02`; trimmed, 4 ms fade in and 30 ms out, peaks under -3 dBFS, each quieter than speech; WAV in `audio/effects-v1/`; `heard: false`. No background music.
- Typeface: Andika 6.101 Regular and Bold (SIL OFL), from `google/fonts` `ofl/andika` at commit `515797205c54276da8c06026f479d3a9d5404932`, unmodified, in `assets/themes/magical-kingdom/fonts/`, via `expo-font` (`npx expo install expo-font`, config plugin in `app.json`, `ui/readingFont.ts` and `.web.ts` returning `{ regular, bold }` styles only once loaded). Used only for letters and words a child reads.

## Checks

- Unit tests over the real runtime (node:sqlite) for both flows, in the style of `wordGarden/flow.test.ts`: a whole game is one independent attempt a turn and never repeats an item; nothing records but answers and help; misses, the help ladder, SHOW ME; listening holds, releases and the cap; reminders only in the quiet; the nudge; the how-to and story rules; resume after a restart; a lost play save; gifts; the quest's rotation, resume and per-turn rules; content validators; manifests and hashes.
- `scripts/web-e2e.js`: checks for bowling and golf, the picture games, the Royal Quest (each through a miss and a mid-game reload), the crown hold and a long press.
- `scripts/kingdom-child-playtest.js` (`npm run web:kingdom-playtest`): three scripted children. Listener, masher (taps everything at once), explorer (presses of 80 ms to 3.5 s, taps during the telling, the ear, a drag, forty idle seconds, two misses then SHOW ME, leaving and returning, the toy six times, NEXT twice, the crown, the gift). It logs every clip the page plays and fails on: a press of up to 2.9 s that does not activate, a first telling cut by a tap, a reminder that starts while a clip plays, an answer before the ask has finished, a game that cannot be finished, a gift line not heard to its end, a page error.
- Numbers to beat or match (1180 x 820): before the timing work the masher finished the four picture games in 21 s with 17 misses; after it, 177 s, never answering during the ask. Listener: rhymes 69 s, chests 85 s, bunny 44 s, stories 77 s, quest 86 s; first-turn listening 6.5 s in rhymes, 16 s in stories.
- Gates: `npm run verify`, `npm run validate:content`, `npm run web:export`, `npm run web:e2e`, `npm run check:bundle`.

## Status (tick when it exists on this branch and its checks pass)

- [ ] Content: skills, activities, missions (six games, three quests), `games.json`, `choiceGames.json`, `games-narration.json`
- [ ] Audio layer: `sequence` with its end report, `busy`, the voice helper, pace
- [ ] Bowling and Golf
- [ ] The four picture games
- [ ] The Royal Quest
- [ ] Castle button, games room, place memory, crown gate, gift dialog and `kingdom.gifts`
- [ ] Game narration clips recovered or regenerated (2026-11-20: not recovered. The flow and its 61 finished nodes are still there, but the connector gives a take's audio only for the run's session id, and those ids were lost with the first build. Not regenerated: the owner judged this recipe poor, and a new recording follows an audition by ear, D209. `GAME_SOURCES` is empty and the games show their lines as text.)
- [x] Letter sounds from the library, approved on the owner's instruction (not yet heard by a person)
- [x] Pictures, effects, typeface, `THIRD_PARTY_ASSETS.md` (looked at in Chromium and measured; not yet seen or heard on a device), and the code-drawn icons
- [ ] Browser checks and the child playtest harness
- [ ] Docs: `ROYAL_GAMES.md`, `PICTURE_GAMES.md`, DECISIONS D202 to D207, `PROJECT_STATE.md`
