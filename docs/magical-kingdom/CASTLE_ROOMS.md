# The castle's own rooms by ear: the Ice Palace, Dress-up, the hall (2026-11-21, D211)

The royal games were rebuilt to the "by ear, for small hands" standard (REBUILD_SPEC.md). This brings the castle's older parts to it. The Word Garden's part is in WORD_GARDEN.md. Browser only: looked at in Chromium at 1180x820, 960x600 and 375x820; not checked on a device, and no sound was heard.

## Ice Palace (the crystal bridge)

The director (`director/kingdom.ts`) is unchanged and keeps the evidence: placing and taking back crystals is never an answer; only MAKE MAGIC submits the count. The room speaks through `director/bridge.ts` (`createAdventureVoice`, pure, tested in `bridge.test.ts`), which uses the royal games' `createGameSpeech`:

- The first ask of a bridge (the intro and the instruction; on the next bridge the instruction alone) holds the crystals, the sockets, Help and MAKE MAGIC (`bridge-listening`). A held crystal can still be dragged, but a drop or a tap places nothing.
- The ear (`bridge-hear`) says the instruction again at any time; a reminder says it 12 s into the quiet, twice, then the ear glows until the next touch. After a miss the room says "Count each glowing crystal…" and the instruction, held. Solved: no reminders; the ear says the success line.
- In the browser an instruction that could not play is said at the first touch.
- Counting aloud: a crystal placed says the number now on the bridge, one taken back the number left (`game:count.<n>`, n 0 to 10), only when that clip is registered; until then the place or remove chime plays and nothing is said (the count is always on screen). The numbers are not recorded yet (see Recordings).
- Words for one (`bridgeGoal`): "Place 1 crystal on the bridge." (`ui.json` `iceInstructionOne`) and "1 stone is ready. Add {count} crystals." (`iceRepairOne`). Kingdom narration is keyed by its exact words (`voice:<line>`, `audio/sources.ts`), so the old takes ("Place 1 crystals…", "1 stones are ready…") can never play under the new words; those lines are silent until re-recorded.
- Help is the light bulb (`adventure-help`). MAKE MAGIC is the check (`make-magic`, label kept for screen readers): `MagicArt` has no wand, and the check reads as "this is my answer" while the smiling star means "choose" inside the royal games. Next is the arrow, the way home the castle.
- How to place and take back is a picture strip under the tray (`bridge-gesture`): a crystal, an arrow up, a lit socket; a lit socket, an arrow down, a crystal. The words stay as its accessibility label.
- A used crystal in the tray stays solid; only its picture fades (`ui/DragToken.tsx`).
- In a narrow window the bridge is lifted so the tray never covers a socket.

## Dress-up (`ui/WardrobeScreen.tsx`)

- A locked gift wears a padlock (`LockArt` in `ui/WardrobeArt.tsx`) over its faded picture, and under its name the picture of what unlocks it, the same pictures the castle uses: the Ice Palace door's crystal for ice gifts; the garden's flower and the Royal Games' castle path for garden gifts (both count, `REWARD_MISSIONS`); all three for "any adventure". One dot per adventure it needs, filled as they are done. The goal's words stay, small, for grown-ups and in the screen-reader label, and a tap on a locked gift still says them aloud.
- Tabs are pictures of a thing of that kind (the hanger for outfits) with their names beside them (dropped under 480 pt; the names stay as labels). Done is a check. What she wears is ticked.
- Cosmetic only: nothing here is evidence.

## The castle hall (`KingdomApp.tsx` `Castle`)

- At 375 wide the Royal Games button covered the princess's legs: where it would, she is made smaller and stands between the door labels and the button; her name tag is left out when there is no room for it (the header names her).
- At 960 wide "Royal Garden →" wrapped: door labels are one line, as wide as the words need up to the gap to the next door, 17 pt under 1100 wide. Under 560 wide they drop the arrow and may take two lines of whole words.
- At 375 the hall's name sat over the reward ribbon: under 560 wide it sits below it.
- At launch nothing shows or sounds until the learner's Quiet, motion, voice pace and saved place are applied together (`director/restore.ts`), so a child whose adult chose Sound off hears no chime and a waiting gift is not announced over a game about to reopen.
- The gift's line, after a reload with the dialog open, is said at the browser's first touch if the dialog is still open (`director/gift.ts`); "Back to castle" on the gift leaves the child where she was (the games room stays the games room).

## Recordings

Everything new to record is in `content/themes/magical-kingdom/recordings-pending.json` (not registered; the tests that require a recording for every script line do not read it):

- `count.0` to `count.10`: zero, one, two, three, four, five, six, seven, eight, nine, ten (register as `game:count.<n>`, move into `games-narration.json` once recorded).
- Re-record in `narration-script.json`: `bridge.1` "Place 1 crystal on the bridge."; `repair.1.2` to `repair.1.9` "1 stone is ready. Add <n> crystals." (n 2 to 9).

## Not done

No device, no child, no sound heard. The bridge's tray holds exactly the crystals the goal asks for, so placing every crystal is always right (unchanged; a decision for the owner whether the tray should hold one extra). The old letter-garden adventure room shares the bridge's screen and now speaks the same way, but the castle no longer opens it.
