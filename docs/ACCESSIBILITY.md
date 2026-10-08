# Accessibility

Accessibility is a per-learner settings layer that sits between the engine and presentation. It changes how content is delivered and how the world behaves, never how hard the thinking is.

Two independent dials:
- Access: how instructions arrive, how responses are given, sensory load, timing.
- Challenge: skill difficulty, tier, uncued application. Owned by [LEARNING_MODEL.md](LEARNING_MODEL.md).

No code path may lower challenge because an access setting is on.

The game is never framed as a therapy or special-needs product. It is a well-made game with good settings.

## Built in M4 (Floor 15)

- Reduced motion: the same elevator sequence and floor-by-floor indicator, much shorter. No camera motion in either mode. The help cue is held still. Challenge is identical, and a test confirms the same learning record in both modes.
- Sound: normal, quiet (no ambient bed, confirmations kept), mute, and an effects volume. Settings are stored per learner. Every Lifty line is on screen, and no information is audio-only.
- Panel buttons are at least 64 pt in every tested window size. Small windows shrink the cabin, never the buttons.
- Native text for Lifty, the indicator (announced as "Floor indicator: N, going up"), and all controls. Every button has an accessibility label and an activate action.
- No flashing. The only repeating animation is a 0.5 Hz help pulse (M4 called it a glow). The completion is one slow light ramp. The overload tone is a soft two-note signal, never an alarm.
- Not built yet: narration and tap-to-hear (no narration library in this milestone).

## Built in M5 (visual system, Concept Rescue)

- Design tokens carry a reduced-motion equivalent for every duration, never slower than normal (`src/presentation/design/tokens.ts`, tested). Touch feedback stays immediate in both modes.
- Parallax (the shaft wall through the door vision panels, side-wall reflections) runs only while the car travels and is zero under Reduced Motion. Lifty never bounces. Two slow loops only: the system-check scan line (0.5 Hz) and a barely visible hover (0.4 Hz, at most 3 pt, D133); both stop under Reduced Motion. Production art adds a small settle of the landing layers as the doors open and one-shot moving pieces (a turbine turns, a flag tips); none of it runs under Reduced Motion, and nothing loops.
- Contrast is tested: body text 4.5:1 on every surface, accents and state colors 3:1, button labels 7:1 on their faces.
- Button states never rely on color alone: selected has a lamp ring, current floor a position lamp, a clue a ring outside the bezel. Current floor is announced ("the car is here").
- Red is reserved for genuine danger and is unused in Floor 15. Lifty's concern and wrong-floor feedback are warm amber. Overload, a real warning, is yellow.
- Concept Rescue is a calm mode: the cabin dims, the panel locks, one board with one accent. Its cells are at least 64 pt in every tested layout. No failure language.
- The landing's painted floor number is vector art with an accessibility label.

## Built in M6 (browser playtest build)

- Cargo crates stay at 64 pt in every window (they could shrink to 46 pt before). A side that cannot fit them scrolls vertically, sideways drags still move crates, and tapping a crate always works.
- The browser build keeps every access setting on the real settings path, and the developer tools toggle the same settings.
- Browser audio starts after the first tap or key press (autoplay rules). Nothing depends on sound, so the game is fully playable before that.

## Built in M7 (stabilization and experience)

- The help offer is visible on Fire: a thicker border, an outer ring, a "?" badge and a slow pulse (scale and ring opacity). It no longer depends on an iOS-only shadow, and it never relies on color alone. Reduced Motion holds the same cue still. Screen readers hear "Help is ready" once when the offer appears, and the button's label says it is ready (`ui/helpCue.ts`, tested).
- The OS reduce-motion switch (iOS Reduce Motion, Android "Remove animations", the browser's prefers-reduced-motion) is the starting setting for a learner who never chose one. A stored choice always wins, and the OS value is never written back (`sessionCore.resolveMotion`, tested).
- The help button stays in one place in every context of a layout (tested at twelve window sizes). Lifty moves around it.
- Lifty and Lifty's words never cover the floor buttons, the indicator, the doorway, the shaft map, the cargo bay or the test-run board (tested; one documented exception for cargo in a cabin under 400 pt wide). Lifty moves instantly under Reduced Motion.
- Every line Lifty says in a full playthrough fits its speech bubble at 13 pt or larger at every tested size (tested). Raised in M8.1 to 20 pt (below).
- The landing's place name is native text, and the landing is announced as "Landing: floor N, Place". The painted floor number stays readable over every landing (contrast tested).
- A correct answer is confirmed by a steady green rim and a check on the indicator plus the words, never by color alone and never by flashing. The success replay shows all its steps at once under Reduced Motion.
- A save that keeps failing shows plain words and a large TRY AGAIN button for an adult instead of a stuck line.

## Built in M7.1 (exploration pass)

- The building directory (D134) is information, not a control: its rows are text for screen readers ("Floor 20, rooftop golf"), CLOSE is a full-size button, and the panel stays the only way to ride. (M8.1 replaced the icon-row button and CLOSE with a labelled DIRECTORY control and Back; the rows are still text, below.) Production art never carries text a reader needs: the floor number, the place name and every label stay native. On an illustrated landing the floor number is on the live sign beside the name (D136); the indicator above the doors always shows it, and the landing's screen-reader label names the floor.
- Touchable landing objects: the object is the button, with a target of at least 64 pt even where the drawing is smaller, a role of button, and a label that names it ("Inspect the telescope"; afterwards "telescope, inspected. Touch it again to watch it work."). The affordance is a dashed outline (then a check), never color, hover or a tiny motion alone. Screen readers can activate it. Tested in `ui/GameScreen.test.tsx`.
- Landing reactions are about 1.2 s, ignore taps while running (no flicker from rapid tapping), and under Reduced Motion nothing moves: the pulse or revealed part shows its peak, still (tested in `content/exploration.test.ts`).
- Hall calls: a dashed ring, a CALL tab and a slow 0.5 Hz breath; still under Reduced Motion. The button announces "calling the lift". Every other floor is disabled, so the right press is the only one that lights (tested).
- The panel power sweep turns each lamp on once and off once (never a chase or a flash), and lights all lamps at once under Reduced Motion (tested).
- The Engineer Log is a modal clipboard over the cabin view with 64 pt CLOSE and replay buttons; each row is read as one sentence. No percentages, counts or grades.
- The completion card is gone, so nothing covers the restored landing; the rank and the clipboard are announced in Lifty's words and shown as a plate and a button.

## Built in the correction round

- Nothing academic is timed: after a correct answer the explanation stays until NEXT JOB is pressed. NEXT JOB is a 64 pt button with a word and an arrow, announced once, always in the help button's place. Reduced Motion shows the replay at once and still waits.
- Mission objects have labels; collectable ones are buttons with 64 pt targets and screen-reader activation ("Load the repair kit into the lift"). The beacon lamp is steady, never blinking.
- A wrong floor is signalled by the missing object and by words ("No repair kit here."), not by color.

## Built in M8 (reading jobs, landing play)

- Landing things: each is a button with a role, a touch area of at least 64 pt wherever the window has room (around the thing itself, even a golf ball), and a label that says what a touch does: "Putt the golf ball", "Open the toolbox" and, while open, "Close the toolbox"; once found, "golf ball, inspected. Putt the golf ball." Screen readers can activate them. The ring around a small thing is at least 40 pt so its check never covers it. Touch areas never cover the panel, the help button (or NEXT JOB and LET'S COUNT in its place), Lifty or his words, the shaft map, the cabin's icon row or the directory placard (since M8.1 the DIRECTORY plate), and two exploring things never share a touch (tested at fifteen window sizes, `ui/touchAreas.test.ts`).
- Answer targets (a read-and-touch job) are labelled by the thing's name and keep the dashed ring; they never show a check, so nothing marks right or wrong before the job does.
- Reactions play once and end at rest; nothing loops or repeats faster than 3 Hz. A touch on a thing while its reaction runs is ignored (rapid taps cannot restart a motion or make a light flicker). The lamps come on one by one and go out together, never a chase or a blink; the glow is one slow rise and fall.
- Reduced Motion: nothing turns, tilts, bounces or lowers; the glow and the lamps hold their peak still while the reaction runs; the toolbox changes state at once; the putt is a short straight move to the cup (0.25 s) with the cup's ring held still, then the ball is back. Same information, no travel (tested in `ui/landingReactions.test.ts`).
- A reaction that cannot be drawn (missing art, the vector landing without that part) glows instead, so a touch always shows something. Landing play is never required: it records nothing and blocks nothing.
- The Archive's tower book opens a short readable card: solid paper (never text over the art), the reading face at 20 pt (17 pt in a narrow window; since M8.1 the passage role, 20 to 24 pt), high contrast, a full-size close button ("Close the book"), and it scrolls if it must. Its box stays clear of the panel, the help button and the icon row at every tested size.
- Reading jobs: the note is native text on the same solid card, one accessible line per sentence, the clue sentence marked by a bar and weight (never colour alone) and announced as "Clue: ..."; the learner folds the note away and opens it again ("Read the note"). Cards are full-size buttons labelled with the option's words. A touch job falls back to the same choices as cards wherever the illustrated landing is not drawn or an option has no place on it, so a learner never has to find a thing that is not on screen. Since M8.1 the landings are approved art, so in production the cards appear only for the two lobby notes (the plant and the bench are not on the art), in the 2/3 split view and after a decode failure.
- Reading is the skill these jobs measure, so the note is not read aloud (there is no narration yet); Lifty's instruction ("Touch the thing that needs fixing.") is on screen like every line. Whether a future narration setting may read a note aloud is not decided: it would change what the job measures, so it needs its own decision (challenge and access are separate dials).
- Nothing in a reading job is timed. Speech is never required.

## Built in M8.1 (the directory, readability, sound)

- Text roles with floors (D160, `ui/textRoles.ts`, tested at fifteen window sizes in `ui/readability.test.ts`): what to do is the biggest text on screen (a reading instruction 24 to 28 pt), then Lifty's words (20 to 24 pt, were 13 to 20), the note and the cards (20 to 24 pt), directory names (18 to 22 pt), and labels, titles and button words (16 to 18 pt). Nothing a child must read is under 16 pt. No size is shrunk to fit: a box too small for its words scrolls and shows a still "more below" arrow (no words, hidden from screen readers), in Lifty's bubble, the note, the cards and the directory. Every line Lifty says in a full playthrough fits whole at 20 pt or more in every full window tested; in split views and Slide Over a long line scrolls with at least three lines showing.
- Lifty's words take the band's whole width: the help slot moved to the cabin's top corner, in one place per layout in every context (tested). The bubble's small LIFTY name tag is gone.
- Emphasis never rides on colour alone. A reading note's marked words (content, at most five per note, validated never to give the answer away, D159) are weight 900 and underlined as well as in the warm light accent; a math job's givens (numbers and up, down, above, below) are weight 900 in the accent; the clue sentence keeps its bar and weight and is read as "Clue: ...".
- The building directory (D159): a DIRECTORY control at least 64 pt tall (icon and word; screen-reader label "Building directory", role button, expanded state) beside the panel on every layout, never over the panel, the help button, the indicator, Lifty or his words, or the landing's touch areas (tested). The sheet lists all twenty floors, top first, in rows of 58 pt; screen readers hear each row as "Floor 1, lobby", and the car's floor adds the value "you are here". The car's floor is marked by the words YOU ARE HERE, a heavier border and weight, never colour alone. The sheet opens scrolled to the car's floor and Back (64 pt, an arrow and the word) closes it. The rows are text, never buttons: the panel is the only way to ride. Using the directory never counts as help and changes nothing in the job. Its one-time introduction pulses the plate at 0.5 Hz (a still ring under Reduced Motion).
- Sound is never required (D162). Every right answer, miss and discovery is also shown and said on screen; the new answer and discovery sounds add nothing the screen does not show. Mute and Quiet work as before; under Quiet an essential sound (the clicks, the chime, a right answer) keeps at least the interface level. Repeats are limited: a sound never restarts inside its gap, no more than four short sounds play at once, nothing is queued to play late. The generated pack is loudness-normalized by measurement (clicks quieter than the chime, loops quieter still, true peak at most -3.3 dBTP); nobody has listened to it yet, and loudness on tablet speakers is not measured. Native builds still play the placeholders until the pack's rights are approved.
- Landing play during a job (D161): while a job waits with its answer elsewhere, a landing thing reacts to a touch with its motion and sound only. It is never required, never an answer and never evidence, and nothing reacts while the note is open over the landing. The drawn golf ball is at least 6 pt in radius where the doorway has room (Fire HD 8 portrait: about 12 px across, was about 8); its touch area stays at least 64 pt. The new motions follow the same rules: the golf flag flutters out from its pole in two soft flaps over 0.7 s (under 3 Hz) and is still under Reduced Motion; the plan drawer slides out and back over 1.2 s (0.9 s), and under Reduced Motion shows a still glow instead. In the narrowest window (375 x 820) the doorway is about 40 pt wide, so landing things are hard to see, though their touch areas are full size.
- Not checked on a device or with a screen reader on a device.

## Requirements and their status

What every playable build must meet, and where Floor 15 stands today:

| Requirement | Status in Floor 15 |
|---|---|
| No required speech. Every activity has a non-verbal response (tap, drag, choose, draw). | Built: panel taps, shaft-map taps and drags, crate taps and drags; reading jobs by touching a landing thing, the panel, or a card (M8). |
| Predictable structure: the mission's steps shown up front, the same start, play, finish rhythm. | Built: the in-world checklist. It hides in narrow cabins (its corner holds the help button). |
| Clear visual instructions; text and narration are layers on top. | Partly: Lifty's lines are text only, and the world shows the givens (start floor, beacon, capacity plate). |
| Optional narration per learner, plus tap-to-hear on any text. | Not built. There is no narration library yet. |
| Touch targets at least 64 x 64 pt for gameplay, with generous spacing. | Built for the panel, the help button, the DIRECTORY control and its Back button (M8.1), crates, test-run cells and landing things (tested; landing things in the smallest split views may offer one thing at a time). The shaft map's rows are smaller; it also accepts drags, and the panel always works. |
| Low clutter: one primary action area at a time, HUD limited to essentials. | Built: the panel is the action area; the test run and the cargo bay take the stage alone. |
| No timers that cause failure. | Built: nothing in Floor 15 is timed. |

## Sensory settings (per learner, parent-editable, child-visible subset)

| Setting | Default | Effect | Status |
|---|---|---|---|
| Quiet mode | off | mutes music and ambience, keeps narration and soft feedback | Built as Normal / Quiet / Mute (no music or narration exist yet) |
| Volume buses | music 40%, sfx 60%, narration 80% | separate sliders | Not built: one effects volume only |
| Reduced motion | follows OS setting | replaces camera moves and parallax with cuts and fades | Built; follows the OS only until a choice is stored (M7) |
| Skip animations | on after first viewing | tap to skip any non-essential animation | Not built |
| Flash safety | always on | no flashing above 3 Hz anywhere, no full-screen white flashes | Built (design rule; nothing in Floor 15 repeats faster than 0.5 Hz) |
| Surprise audio | always off | no sudden loud sounds; all assets loudness-normalized; alarms in Elevator Quest are soft and announced visually first | Partly: the placeholder sounds are soft by design; the generated pack (pending, browser only) is normalized by measurement with peaks capped (D162); nobody has listened to it, and loudness is not measured on a device yet |
| Haptics | on | light feedback only | Not built |

Major celebration set pieces respect quiet mode and reduced motion (lights still restore, music stays low, camera does not swoop).

## Hints and help

Progressive and learner-controlled where possible. The hint button is always in the same place (tested since M7). The order of help follows the failure policy in LEARNING_MODEL.md. Since M5 the next help step can always be asked for once the first clue is used, so help is never a dead end, and repeated misses lead to a Concept Rescue rather than a shown answer.

## Text and reading

- Readable typefaces, large default sizes, high contrast against scene art (text panels have solid or blurred backing).
- Magic Tower: letterforms must match how early writers are taught (single-story "a" and "g" in literacy activities). Choose the font on purpose.
- Instruction text and content text are separate fields so narration and reading level can differ from the skill being tested.

## Platform accessibility

- Every interactive element gets an accessibility label and role (VoiceOver on iPad, TalkBack/VoiceView on Fire). Built for Floor 15's controls. Not yet checked with a screen reader on a device.
- Respect OS reduced motion (built as the starting default, M7) and bold text where practical (bold text: not built).
- Canvas-rendered scenes expose their interactive objects through an overlay of accessible views, since Skia canvases are invisible to screen readers. Floor 15 does this for the indicator, the landing and Lifty; the shaft map is a native view.

## Parent controls

Not built yet (Parent Mode is a later milestone, ROADMAP.md).

- Session length suggestion and soft break reminders (never a forced cutoff mid-activity).
- Support profile: how quickly help is offered (see struggle signals).
- Narration default, sensory defaults, text size.
