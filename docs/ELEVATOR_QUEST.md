# Elevator Quest

The learner-engineer experience. First slice: the mission "Floor 15" (M4). This doc covers the theme adapter, the elevator simulation, sound, recovery, and the renderer. Learning rules live in LEARNING_MODEL.md, and the engine stays theme-neutral.

## The principle

Operating the elevator is the fun. Learning gives the player a reason to operate it. A Floor 15 problem never shows a quiz card in front of the panel. The real panel is the answer interface: work out the floor, press it, and the lift goes there.

The full sequence is part of the reward: press, click, light, doors close, motor, indicator counting floor by floor, slowdown, stop, chime, doors open.

A wrong floor is a real ride to that floor. Lifty explains the consequence in building terms only after the doors open.

## Where things live

```
src/themes/elevator-quest/
  sim/elevator.ts        render-free elevator state machine (deterministic, injected time)
  audio/profile.ts       semantic sound slots and the prototype sound profile
  audio/cues.ts          simulation events -> audio cues (rate limits, loop ownership)
  audio/mix.ts           normal / quiet / muted gains per category
  audio/audioEngine.ts   expo-audio playback (the only audio file that touches native)
  audio/assets.ts        bundled asset map, kept equal to the manifest by a test
  content/floor15.ts     theme copy: Lifty lines, misconception translations, help labels, unlocks
  director/director.ts   the theme adapter: runtime intents <-> elevator world
  director/playtestLog.ts developer-only local log and text report
  ui/                    React Native + Skia components (thin)
  useFloor15.ts          device wiring: expo-sqlite -> runtime -> director -> audio
  testing/headless.ts    real director + runtime + node:sqlite on virtual time (tests only)
assets/themes/elevator-quest/audio/   prototype WAVs + manifest.json
scripts/generate-elevator-audio.js    the synthesizer that made them
content/packs/core.json               theme-neutral learning content the app ships
content/missions/core.json            theme-neutral mission "positions-and-capacity"
```

Lint rules and tests enforce the following:
- `sim/`, `director/`, `content/`, and `audio/{cues,mix,profile}.ts` import no React, React Native, Expo, or Skia.
- Theme code never calls scoring or modelling functions.
- The engine contains no elevator vocabulary. The theme-word scan now also covers lift, shaft, cabin and crate.
- The Device Lab and the theme never import each other.

## Theme adapter (director)

The director never decides correctness, computes answers, judges mastery or invents help. It owns the simulation and turns runtime views and intents into a view model for the UI.

| Runtime (theme-neutral) | Elevator Quest |
|---|---|
| `SHOW_ACTIVITY` positionAfterMove, cued, numeral | "We're on Floor 8. The repair kit is 7 floors up." The car first rides to Floor 8 by itself (a dispatch), then the panel is live. |
| same, representation verticalScale | The shaft map opens. Drag the car or tap a floor on it, or use the panel. |
| same, challenge stretch, transfer positionFromReference | "The crew is 5 floors above the beacon. The beacon is on Floor 11." The car stays where it is, and a beacon marks the reference floor on the shaft map. |
| encounter stage 1 (route) | "The loading dock is 6 floors below Floor 14, where we are now." |
| encounter stage 2, fillToCapacity | The cargo bay: capacity plate, units already aboard, crates on the dock. Drag or tap crates, then press DOOR CLOSE. The car weighs the load and refuses to move when overloaded. |
| narrative `mission.finale` | Only floor 15 is enabled. Pressing it rides to the repair level, and arrival completes the mission. |
| `RESPONSE_RESULT` wrong + misconception tag | A building-terms line, e.g. "One floor short. Floor 6 is where we start. Count the floors after 6." |
| `OFFER_SCAFFOLD` | The help button glows slowly. Nothing is forced. |
| `STEP_COMPLETE` | A checklist line is ticked. |
| `MISSION_COMPLETE` + `UNLOCK_GRANTED` | Power is restored, then MISSION COMPLETE, ENGINEER RANK 1, MAINTENANCE PANEL UNLOCKED. |

Answer timing: a panel answer locks at departure, when the doors have closed. At that moment the director evaluates it in memory with `runtime.check`, which is instant and makes no database call, and starts the durable commit. Feedback appears after the ride. Advancement waits for both the ride and the commit.

Before departure, a different floor replaces the destination. That is the "change of plan", and Lifty praises it. Choosing the floor the car is already on is still an answer, evaluated in place without a ride.

The panel is locked during the praise pause, so a late tap cannot answer the next job.

Automatic feedback never gives the answer away. The counting-convention hint marks only the first floor after the start. A full count is the guided help step, credited as guided.

The load sensor in the cargo bay is world physics: it knows the total weight, not the right answer. Correctness still comes from the engine.

## Elevator simulation

`sim/elevator.ts` is a pure reducer: `reduce(config, state, input) -> { state, events }`. It knows floors, buttons, doors, direction and motion. It does not know what a destination means educationally.

```
idleOpen -> doorsClosing -> departing -> traveling -> decelerating -> arrived -> doorsOpening -> idleOpen
                 \-> idleClosed (doors shut, no call)
Door Open while closing reverses the doors from where they are.
```

- Inputs are `press(floor, source)`, `doorOpen`, `doorClose`, `setPanel(enabled, disabledFloors)`, `place(floor, doors)` (recovery only) and `tick`. Every input first catches the machine up to its time, so results never depend on how often the caller ticks. A test compares 16 ms ticks with a single jump.
- Events carry their exact scheduled time:
  - floor buttons: `buttonPressed` (with source and reason), `buttonLit`, `buttonCleared`
  - doors: `doorButton`, `doorsClosing`, `doorsClosed`, `doorsOpening`, `doorsOpened`
  - travel: `departing`, `travelStarted`, `floorPassed`, `decelerating`, `arrived`, `chime`
- Motion follows a trapezoidal velocity profile: accelerate, cruise, decelerate. The indicator changes floor by floor at the exact moment the car is half a floor away, so it never jumps to the target.
- Single-destination mode is the only mode in this slice. Before departure a new floor replaces the call. While moving, presses click but change nothing. Door Open is refused between floors.
- Timing is "authentic feel, compressed time". Normal: doors 1.3 s, dwell 0.9 s, 0.38 s per floor after the first, chime 0.18 s after the stop, doors open at 0.65 s. A 7-floor ride from press to doors open takes about 8.7 s (about 7.8 s with Door Close). Reduced motion runs the same sequence, and the same floor-by-floor indicator, in about 3.4 s. The numbers are first guesses for playtests.

## Sound

The simulation emits semantic events. `audio/cues.ts` maps them to slots:
- buttons: `floorButtonPress`, `floorButtonActivate`, `doorButtonPress`
- doors: `doorMotor` (loop), `doorClosed`, `doorOpened`
- travel: `motorStart`, `travelLoop` (loop), `deceleration`, `arrivalStop`, `arrivalChime`
- other: `ambientMachinery` (loop), `overloadTone`, `powerRestore`, `completion`

A profile (`audio/profile.ts`) maps each slot to an asset and a gain. A new elevator character (old hydraulic, high-speed tower, futuristic) is a new profile. No game logic changes.

Rules the cue mapper enforces, all tested:
- Clicks are rate-limited to one per 90 ms, so mashing does not stack identical sounds.
- A dispatch by the machine lights the button without a click.
- The chime only follows an arrival.
- The travel loop is stopped by deceleration, with a fade, and never outlives the arrival.
- The door motor runs only while the doors move, including a reversal.

Mix (`audio/mix.ts`) has five categories: interface, elevator, ambient, dialogue (unused yet) and music.
- Quiet mode removes the ambient bed, softens machinery and keeps confirmations (click, call registered, chime, overload tone) audible.
- Mute silences everything.
- Effects volume scales the interface and elevator categories.

Sound is never the only carrier of information. Every line is on screen, the indicator is visible, and the panel shows lit buttons.

### Audio assets and licensing

Every file in `assets/themes/elevator-quest/audio/` is a synthesized prototype generated by `scripts/generate-elevator-audio.js`. It uses oscillators, filters and seeded noise only, with no recordings and no downloaded samples.

`manifest.json` lists for each asset:
- purpose, duration and loop flag
- source and license (project-original)
- `authentic: false`, `prototype: true`, `replace: true`

The files are deterministic: rerunning the script reproduces them byte for byte. They were checked visually as spectrograms in this session, for envelope shape, clicks and clipping. Nobody has listened to them on a device yet. They are placeholders meant to be mechanically plausible. They are not authentic elevator recordings and must not be presented as such.

Replacement plan: licensed or self-recorded real elevator audio (CC0 or a purchased royalty-free license with redistribution rights). Record the source and license per file in the manifest. A test checks that every synthesized asset is marked not authentic.

## Visual approach

Prototype art made of Skia shapes and gradients plus React Native views:
- palette: charcoal, brushed steel, deep blue, amber indicator digits, cool white ceiling light
- the cabin view is drawn in Skia: front wall, side walls, door frame, sliding doors, the landing beyond, and the indicator housing with direction lanterns
- buttons, text, the shaft map, the cargo bay and Lifty are native views, so text stays accessible and crisp

There are no textures, particles, blur stacks or video. The only continuous animations are the doors, the shaft-map car marker (both on the UI thread), the slow help glow and one completion light ramp. Nothing flashes.

The layout (`ui/layout.ts`) works across windows, and tests cover ten of them, from 320 x 768 to 1366 x 1024:
- Landscape or near-square: the cabin on the left and the panel on the right.
- Portrait: the cabin on top, then Lifty, then the panel.
- Panel buttons never drop below 64 pt. Small windows shrink the cabin instead.

## Recovery semantics

SQLite is the record. The world is presentation.

| Interrupted | Reopens as |
|---|---|
| before waking the lift | intro again, doors closed, power off |
| mid-ride (answer already committed at departure) | the next job or the same job (with the miss recorded), car parked at the job's start floor, doors open |
| after a wrong floor | same job, same item, `wrongTries` kept |
| after help | same job, the help ladder continues from the next step |
| in the cargo bay | cargo bay again, same numbers, crates unloaded (loading is not learning evidence) |
| finale | car parked on floor 3 with doors open, only 15 enabled |
| while saving the completion | finale again (the commit rolled back), then completes once |
| after completion | completion card, and the maintenance panel stays unlocked |

The car's floor, the door position and loaded crates are not persisted. A process death never resumes between floors: the car is placed at a coherent floor with its doors open. An uncommitted tap is lost, and the child taps again.

## In-game progression

Unlocks are theme content (`content/floor15.ts`). The runtime grants them inside the completion transaction, idempotently, into the append-only `unlocks` table:
- `eq.rank.engineer-1`
- `eq.system.maintenance-panel`

Replays never grant them again. The maintenance panel is visible in free ride: live state, direction and position readouts. There is no XP, no currency and no Quest Tokens.

## Renderer status

Renderer acceptance is **provisional**. No physical Device Lab run is recorded (DEVICE_LAB.md has only the empty run-log template). What has been checked:
- Jest tests and a headless runtime in Node
- production `expo export` bundles for Android and iOS
- a throwaway web build in a scratch copy, screenshotted in headless Chromium at several window sizes, to catch layout mistakes

None of that says anything about frame rate, touch latency or audio latency on a Fire HD 8. Rendering is isolated in `ui/`: the simulation, director, audio cues and layout are framework-free, so scene cost can be cut or the renderer replaced without touching game logic.
