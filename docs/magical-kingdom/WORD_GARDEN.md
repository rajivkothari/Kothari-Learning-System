# Word Garden (Magical Kingdom literacy pass, D186)

The kingdom's garden door opens the Word Garden: one mission (`word-garden` v1), three magics, each a step up for a beginning reader (learner-storyteller archetype). It replaces the prototype's first-letter flower in the UI. The prototype director's old garden loop stays in code and tests, unreachable from the castle, until the owner decides to remove it.

## Play

`npm run web:export`, serve `dist-web`, open `?open=kingdom` (or the developer launcher's MAGICAL KINGDOM), tap the Royal Garden door. Production builds stub the kingdom out (metro stub, `kingdom-v01-prototype-marker`).

| Magic | The child | The answer (evidence) | The world |
|---|---|---|---|
| 1 Letter sound | hears a sound (s, m, p, c, h), taps the letter that makes it. Letters stay silent here: hearing each first would turn it into sound matching | the tapped letter (`letter-sound`, authoredItem) | a sleeping flower wakes |
| 2 Blend | taps each letter of cat, sun, map or pig to hear its sound, as often as wanted, then picks the picture | the tapped picture (`blend-word`, authoredItem) | a cat jumps out, the sun melts the ice, the map unrolls, a pig rolls in |
| 3 Spell | hears the word (picture shown), builds it from five big tiles; each placed tile says its sound; a placed tile can be taken back | the word, checked when the last space fills (`spell-word`, spelling generator) | the same word reaction, then "The whole garden is awake!" |

Hearing the word again (ear button, the picture, the sound bubble), tapping letters to hear them, placing and taking back tiles, the celebrations and NEXT MAGIC record nothing. The runtime decides right or wrong. The theme never compares letters.

## Help ladder (policy `kingdom.reading`)

1. Hear it again: free and unlimited (re-presenting the prompt is not help).
2. HELP, clue: the target sound stretched; blend and spell play the word sound by sound, and the letters or spaces light.
3. HELP, guided: sound shows a keyword picture (s → sun); blend plays the sounds close together; spell ghosts the middle (vowel) letter in its space.
4. SHOW ME (demonstrated), only after two misses: the right letter or picture shines; a word appears ghosted in its spaces and the child copies it tile by tile.

A wrong letter or picture greys out and cannot be sent twice. A wrong word springs its tiles back. The item never gets easier on a miss (non-negotiable 7). The authored letter-order misspelling (last two letters swapped) gets "Good letters! Listen to the order of the sounds."

## Audio: recording manifest, pending owner approval

`content/themes/magical-kingdom/wordGarden.recordings.json` is the exact checklist (a test keeps it equal to what the game can play and to `audio/reading.ts`). It holds 44 clips: 34 required and 10 "later". One required clip is recorded by reuse: the bloom line is now "A little bloom of magic!", the kingdom's existing garden success clip in the same voice. 33 required clips are missing:

- 16 isolated letter sounds: a b c d e g h i m n o p s t u z (every letter a sound item, blend word or spelling tile can show).
- 5 spoken words: cat, sun, map, pig (targets) and hat (the keyword for h).
- 12 lines: the four instructions (sound, blend, blendReady, spell), the four retries, the three SHOW ME lines, and done.

Later (shown as text meanwhile): the six help framing lines (stretch, model) and the four word reactions.

What plays: the instruction, then the sound or word; a tapped letter or placed tile says its sound; a right answer plays the success chime, the sound or word, then the reward line; a miss plays the retry chime, the retry line, then the sound or word again. Help builds its stretched and close-together sounds from the letter clips in sequence (`sequence()` in `audio/playback.ts`), so no separate stretched or segmented recordings are needed. Unrecorded clips are skipped. The chimes are the project's approved effects.

Generating needs ElevenLabs credits: the kingdom narration took 19 to 53 credits per clip (average 32), so the 33 required clips are about 1,050 credits at that average (630 to 1,750 at the extremes; short phonemes should cost less). The voice and direction are in the manifest. Phonemes must be pure (no "puh", "kuh"): a person records them, or every generated take is auditioned by ear before it ships.

## Phonics traps (audited)

The spelling generator adds look-alike tiles. On the four words: CAT had `k` ("kat" spells every sound right and was marked wrong). Fixed with the generator's new optional `excludeTiles: "k"` on `spell-word`; CAT's tray is now a t c d o. SUN has `z`, MAP has `b`, PIG has `b` and `e`: each is a different sound, and the tile says it when placed, so these are fair discrimination, not traps. PIG's tray can also build "big", a real word with a different first sound. The letter-sound items (s m p c h) contain no letter that shares a sound. No spelling-rule instruction is added.

## Expert usability review (not a child playtest)

Browser only, iPad and Fire HD 8 viewport sizes, no device, no sound heard. Before (prototype garden):

- The word was printed under the picture (CAT), so the first letter could be matched by sight with no sound knowledge. Removed: the Word Garden never prints the word it asks about.
- Two-step answer (pick a letter, then MAKE MAGIC) with a disabled button a non-reader cannot read. Now the tap is the answer for letters and pictures; a word checks itself when full.
- Help lines were instructions ("Say the word slowly"), not help. Now each step changes what the child hears or sees.
- Instructions were adult text ("Drag a letter into the flower, or tap it. Then make magic!"). Now short lines meant to be spoken, pending recordings.
- `MagicalPressable` never exposed a disabled state to the browser (`aria-disabled`). Fixed.

After, from the play-throughs: the floating HELP covered three spelling tiles on Fire landscape (fixed: HELP sits under the card, the picture moves beside the spaces on short screens); the reward bar repeated a different line than the card (fixed).

## Persistence (investigated, not changed)

The kingdom uses the shared KLS model: the same migrations and schema, `openGameRuntime`, append-only `learning_events` with the same attempt and assistance semantics, mission instances, settings and learner ids. Only the file differs: `kls-magical-kingdom.db` beside Elevator Quest's `kothari-learning.db` (`services.ts`). The reason is real: a runtime serves one content set and keys each learner's derived cache to that content (`cacheKeyFor`: pack id and version, missions version, policy, placement), so two runtimes with different packs over one file would rebuild or reject each other's caches. ARCHITECTURE.md section 4 says "Multiple learners: one database", so this is a documented deviation, not a broken evidence rule.

One learner profile across both experiences needs a shared change: one runtime over one database serving the composed content of every experience (`composeContentPacks` already composes Elevator Quest's packs), a migration that moves kingdom history into the main file, and a decision on skill ids (the kingdom's `literacy.*` skills and the main pack's `ela.*` skills do not overlap, so mastery would not be shared until they are mapped). Not started: it needs owner approval. Also noted: `wardrobe.ts` reads `mission_instances` with raw SQL for royal gifts instead of a runtime query.

## Tests

`wordGarden/flow.test.ts` (real runtime, node:sqlite): three first-try magics are three independent attempts and nothing else records; wrong letter greys and retries; wrong word and the order hint; the ladder and SHOW ME as demonstrated; leaving, a fresh visit mid-celebration, and an app restart resume the same item with its tried letter, heard letters and placed tiles; a finished garden counts toward the royal gifts.
