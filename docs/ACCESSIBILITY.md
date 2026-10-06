# Accessibility

Accessibility is a per-learner settings layer that sits between the engine and presentation. It changes how content is delivered and how the world behaves, never how hard the thinking is.

Two independent dials:
- Access: how instructions arrive, how responses are given, sensory load, timing.
- Challenge: skill difficulty, tier, uncued application. Owned by [LEARNING_MODEL.md](LEARNING_MODEL.md).

No code path may lower challenge because an access setting is on.

The game is never framed as a therapy or special-needs product. It is a well-made game with good settings.

## Built in M4 (Floor 15)

- Reduced motion: the same elevator sequence and floor-by-floor indicator, much shorter. No camera motion in either mode. The help glow becomes steady. Challenge is identical, and a test confirms the same learning record in both modes.
- Sound: normal, quiet (no ambient bed, confirmations kept), mute, and an effects volume. Settings are stored per learner. Every Lifty line is on screen, and no information is audio-only.
- Panel buttons are at least 64 pt in every tested window size. Small windows shrink the cabin, never the buttons.
- Native text for Lifty, the indicator (announced as "Floor indicator: N, going up"), and all controls. Every button has an accessibility label and an activate action.
- No flashing. The only repeating animation is a 0.5 Hz help glow. The completion is one slow light ramp. The overload tone is a soft two-note signal, never an alarm.
- Not built yet: narration and tap-to-hear (no narration library in this milestone).

## Required from the first playable build

- No required speech. Every activity has a non-verbal response method (tap, drag, choose, draw).
- Predictable structure: every mission shows its steps up front (a mission board or route map) and uses the same start, play, finish rhythm.
- Clear visual instructions. Every instruction has a visual form. Text and narration are layers on top.
- Optional narration, per learner default (on for learner-storyteller, off for learner-engineer, both changeable), plus tap-to-hear on any text.
- Touch targets at least 64 x 64 pt for gameplay, sized for small fingers and imprecise taps. Generous spacing between adjacent targets.
- Low clutter: one primary action area at a time, HUD limited to essentials.
- No timers that cause failure. Timing pressure, if ever used, is opt-in and never in a learning-critical activity.

## Sensory settings (per learner, parent-editable, child-visible subset)

| Setting | Default | Effect |
|---|---|---|
| Quiet mode | off | mutes music and ambience, keeps narration and soft feedback |
| Volume buses | music 40%, sfx 60%, narration 80% | separate sliders |
| Reduced motion | follows OS setting | replaces camera moves and parallax with cuts and fades |
| Skip animations | on after first viewing | tap to skip any non-essential animation |
| Flash safety | always on | no flashing above 3 Hz anywhere, no full-screen white flashes |
| Surprise audio | always off | no sudden loud sounds; all assets loudness-normalized; alarms in Elevator Quest are soft and announced visually first |
| Haptics | on | light feedback only |

Major celebration set pieces respect quiet mode and reduced motion (lights still restore, music stays low, camera does not swoop).

## Hints and help

Progressive and learner-controlled where possible. The hint button is always in the same place. The order of help follows the failure policy in LEARNING_MODEL.md.

## Text and reading

- Readable typefaces, large default sizes, high contrast against scene art (text panels have solid or blurred backing).
- Magic Tower: letterforms must match how early writers are taught (single-story "a" and "g" in literacy activities). Choose the font on purpose.
- Instruction text and content text are separate fields so narration and reading level can differ from the skill being tested.

## Platform accessibility

- Every interactive element gets an accessibility label and role (VoiceOver on iPad, TalkBack/VoiceView on Fire).
- Respect OS reduced motion and bold text where practical.
- Canvas-rendered scenes expose their interactive objects through an overlay of accessible views, since Skia canvases are invisible to screen readers.

## Parent controls

- Session length suggestion and soft break reminders (never a forced cutoff mid-activity).
- Support profile: how quickly help is offered (see struggle signals).
- Narration default, sensory defaults, text size.
