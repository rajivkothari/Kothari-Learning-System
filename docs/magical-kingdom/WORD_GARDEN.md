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

## Audio: not recorded

No clip exists for any Word Garden sound, word or line (`wordGarden.json` `recordings.status: "pending"`, `audio/reading.ts` empty). Every slot plays nothing and the text stays on screen. `recordingList()` in `wordGarden/content.ts` is the checklist: 20 letter sounds, 5 words in three forms (natural, stretched, sound by sound), 19 lines and 5 reactions. **A beginning reader cannot play this without the sounds.** Phonemes must be pure (no "suh", "kuh"): a person records them, or each generated take is auditioned by ear before it ships.

## Expert usability review (not a child playtest)

Browser only, iPad and Fire HD 8 viewport sizes, no device, no sound heard. Before (prototype garden):

- The word was printed under the picture (CAT), so the first letter could be matched by sight with no sound knowledge. Removed: the Word Garden never prints the word it asks about.
- Two-step answer (pick a letter, then MAKE MAGIC) with a disabled button a non-reader cannot read. Now the tap is the answer for letters and pictures; a word checks itself when full.
- Help lines were instructions ("Say the word slowly"), not help. Now each step changes what the child hears or sees.
- Instructions were adult text ("Drag a letter into the flower, or tap it. Then make magic!"). Now short lines meant to be spoken, pending recordings.
- `MagicalPressable` never exposed a disabled state to the browser (`aria-disabled`). Fixed.

After, from the play-throughs: the floating HELP covered three spelling tiles on Fire landscape (fixed: HELP sits under the card, the picture moves beside the spaces on short screens); the reward bar repeated a different line than the card (fixed).

Still open: the spelling generator adds confusable tiles, so CAT's tray holds a `k`; a child spelling "kat" spells the sound right and is told "Not yet". The c/k and other look-alike pairs (b/d/p) need a real child's reaction before deciding.

## Tests

`wordGarden/flow.test.ts` (real runtime, node:sqlite): three first-try magics are three independent attempts and nothing else records; wrong letter greys and retries; wrong word and the order hint; the ladder and SHOW ME as demonstrated; leaving, a fresh visit mid-celebration, and an app restart resume the same item with its tried letter, heard letters and placed tiles; a finished garden counts toward the royal gifts.
