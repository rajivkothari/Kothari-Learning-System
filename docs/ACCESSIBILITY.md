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
- Every line Lifty says in a full playthrough fits its speech bubble at 13 pt or larger at every tested size (tested).
- The landing's place name is native text, and the landing is announced as "Landing: floor N, Place". The painted floor number stays readable over every landing (contrast tested).
- A correct answer is confirmed by a steady green rim and a check on the indicator plus the words, never by color alone and never by flashing. The success replay shows all its steps at once under Reduced Motion.
- A save that keeps failing shows plain words and a large TRY AGAIN button for an adult instead of a stuck line.

## Built in M7.1 (exploration pass)

- The building directory (D134) is information, not a control: its rows are text for screen readers ("Floor 20, rooftop golf"), CLOSE is a full-size button, and the panel stays the only way to ride. Production art never carries text a reader needs: the floor number, the place name and every label stay native. On an illustrated landing the floor number is on the live sign beside the name (D136); the indicator above the doors always shows it, and the landing's screen-reader label names the floor.
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

## Requirements and their status

What every playable build must meet, and where Floor 15 stands today:

| Requirement | Status in Floor 15 |
|---|---|
| No required speech. Every activity has a non-verbal response (tap, drag, choose, draw). | Built: panel taps, shaft-map taps and drags, crate taps and drags. |
| Predictable structure: the mission's steps shown up front, the same start, play, finish rhythm. | Built: the in-world checklist. It hides in narrow cabins (its corner holds the help button). |
| Clear visual instructions; text and narration are layers on top. | Partly: Lifty's lines are text only, and the world shows the givens (start floor, beacon, capacity plate). |
| Optional narration per learner, plus tap-to-hear on any text. | Not built. There is no narration library yet. |
| Touch targets at least 64 x 64 pt for gameplay, with generous spacing. | Built for the panel, the help button, crates and test-run cells (tested). The shaft map's rows are smaller; it also accepts drags, and the panel always works. |
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
| Surprise audio | always off | no sudden loud sounds; all assets loudness-normalized; alarms in Elevator Quest are soft and announced visually first | Partly: the placeholder sounds are soft by design, and loudness is not measured on a device yet |
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
