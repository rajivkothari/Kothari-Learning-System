# Elevator Quest

The learner-engineer experience (Engineer World). First slice: the mission "Floor 15" (M4, hardened in M5 and M7), and the free-ride building around it (M7.1 exploration pass). This doc covers the theme adapter, the elevator simulation, sound, recovery, and the renderer. Learning rules live in LEARNING_MODEL.md, and the engine stays theme-neutral.

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
  content/floor15.ts     loads the copy JSON; the copy contract, building constants, template helpers
  content/landings.ts    the landing catalog schema, validation, Floor 15 dormant/restored (M7)
  director/director.ts   the theme adapter: runtime intents <-> elevator world
  director/playtestLog.ts developer-only local log and text report
  ui/                    React Native + Skia components (thin)
  ui/buttonLook.ts, liftyPose.ts, cabinGeometry.ts, rescueLayout.ts, layout.ts   pure visual logic (tested)
  ui/landingArt.ts, liftyPlacement.ts, helpCue.ts, tripMotion.ts   pure visual logic added in M7 (tested)
  ui/LandingLayer.tsx    draws any landing from its shape list (one renderer for all floors), with its hero's reaction
  ui/Hotspot.tsx         the touchable thing on a landing (free ride): 64 pt target, ring, check (M7.1)
  ui/EngineerLog.tsx     the Engineer Log clipboard (M7.1)
  session.ts             wiring without React: database (platform adapter) -> runtime -> director -> audio
  sessionCore.ts         session shape, settings store, which instance to reopen (no native imports)
  useFloor15.ts          React hook over session.ts
  devtools/              developer-only jumps, simulated misses, inspection, visual-review scenarios (WEB_PLAYTEST.md)
  testing/headless.ts    real director + runtime + node:sqlite on virtual time (tests only)
assets/themes/elevator-quest/audio/   prototype WAVs + manifest.json
scripts/generate-elevator-audio.js    the synthesizer that made them
content/themes/elevator-quest/floor15.json   all child-facing Floor 15 text, unlocks, pacing, replay words (validated)
content/themes/elevator-quest/landings.json  the 20 landing identities (validated)
src/presentation/reinforcement/strategy.ts   success replay model and strategy choice (theme-neutral, pure)
content/placement/demo-start.json     the starting-placement assumption
src/presentation/design/              design tokens, cel bands, stencil digits (shared, pure)
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
| `SHOW_ACTIVITY` positionAfterMove, cued, numeral | First a hall call: "We've got a call on Floor 8. Press 8 to pick it up." Only 8 can light; the learner presses it and rides there (M7.1). Then "We're on Floor 8. The repair kit is 7 floors up." and the panel is live for the answer. |
| same, representation verticalScale | The shaft map opens. Drag the car or tap a floor on it, or use the panel. |
| same, challenge stretch, transfer positionFromReference | "The crew is 5 floors above the beacon. The beacon is on Floor 11." The car stays where it is, and a beacon marks the reference floor on the shaft map. |
| encounter stage 1 (route) | "The loading dock is 6 floors below Floor 14, where we are now." |
| encounter stage 2, fillToCapacity | The cargo bay: capacity plate, units already aboard, crates on the dock. Drag or tap crates, then press DOOR CLOSE. The car weighs the load and refuses to move when overloaded. |
| `SHOW_ACTIVITY` positionAfterTwoMoves (D148) | A hall call to the start floor, then "Two-part trip: from Floor 4, go 3 floors down, then 4 floors up. The spare parts are waiting there." A panel answer, which may be ridden in two legs (D152): leaving the start floor for exactly the floor where the first part ends is a step, not an answer (the engine's check tags that floor `quantity.ignoredSecondMove`); Lifty says "First part done: Floor 8. Now 3 floors up." and the next floor chosen is the answer. Once per job; choosing the first part's floor again is the answer (a miss). CLUE rings the start floor; HOW TO COUNT counts the first part only. |
| `SHOW_ACTIVITY` startBeforeMove | The car waits where the crew got off: "The crew rode 4 floors up and got off here, on Floor 6. They left their toolbox where they got on. Take us there." A panel answer. The clues count back from here. |
| `SHOW_ACTIVITY` distanceBetween | The trip meter takes the panel's place (the floor buttons are not the answer): "We're on Floor 7. The crew is on Floor 1. How many floors is that? Set the meter, then press GO." FEWER and MORE set a count (0 to the top or bottom of the building), GO at 0 only asks for a count, and GO locks the count as the answer and rides that many floors toward the crew. A miss shows where the count went ("The meter took us 5 floors, to Floor 7. The crew is on Floor 6.") and then the lift rides back to the job's floor by itself, because the count is measured from there; the same job waits with the meter as it was. The shaft map's beacon marks the crew's floor. |
| `SHOW_ACTIVITY` equalJumps | No hall call (the express runs from the bottom of the shaft). "Express service! This car stops at 2, 4, and on up, 2 floors at a time. The repair kit is at stop 3. Which floor is that?" A panel answer. CLUE rings the two stops given; HOW TO COUNT marks them 1 and 2 on the shaft map, a stop apart. |
| `SHOW_ACTIVITY` combineGroups | The cargo bay with an order plate ("ORDERS 4 AND 2") instead of a limit, no crates aboard, and more crates on the dock than the orders. The car takes the whole dock, so it never claims an overload: only the check knows what the orders add up to, so a wrong load reads CHECK ORDER, "That load doesn't match the orders: 4 crates and 2 crates." plus the mistake's line when there is one. |
| narrative `mission.finale` | Only floor 15 is enabled. Pressing it rides to the repair level, and arrival completes the mission. |
| `RESPONSE_RESULT` wrong + misconception tag | A building-terms line, e.g. "One floor short. Floor 6 is where we start. Count the floors after 6." |
| `OFFER_SCAFFOLD` | The help button gets a thicker border, an outer ring, a "?" badge and a slow 0.5 Hz pulse (static under Reduced Motion), and the offer is announced once. No shadow glow: Android ignores iOS shadow props, so the M4 glow was invisible on Fire. Nothing is forced. Before an offer, the next step can still be asked for. |
| `SCAFFOLD_SHOWN` | CLUE rings the floors the job names (the start; the two express stops; the trip's two floors). SHAFT MAP opens the number line. HOW TO COUNT marks the first two counts only, never the stop (a stop apart on the express). SHOW ME (after the rescue) rings the answer, or on the trip meter sets the meter, and the learner still presses GO. Each job has its own words (`help.<kind>.jobs`). |
| `CONCEPT_RESCUE` | After the consequence line, the TEST RUN board takes the stage over the dimmed cabin (see below). |
| `RESCUE_RESULT` wrong | The count resets with a calm line. No verdict. |
| `CONCEPT_RESCUE_COMPLETE` | "Floor 7. 3 moves, and the floor we started on was not one of them." Then back to the real job: the car rides to its start, "Now the real job. Same idea..." |
| `STEP_COMPLETE` | A checklist line is ticked. |
| `RESPONSE_RESULT` correct | The doors open on what the job was about (the repair kit, the crew, the dock; see "Mission objects" below) with Lifty quiet for a beat, a steady green rim and check on the indicator. Then Lifty names it ("There it is: the repair kit."), specific praise only where it adds something (stretch, a changed plan, after a test run), and the success replay. Then it settles and waits for NEXT JOB (D122). |
| `RESPONSE_RESULT` wrong, any job | The thing is not on this landing, and Lifty says so first: "No repair kit here." (on the beacon job at the beacon's floor: "No crew here. That's the beacon."), then the explanation as before. |
| `MISSION_COMPLETE` + `UNLOCK_GRANTED` | In the world, no card (M7.1): the Floor 15 landing wakes from dormant to restored and its core pulses, the panel lamps sweep once bottom to top, Lifty says "Floor 15 has power again", then "Engineer Rank 1. Your Engineer Log is on the clipboard. Ride anywhere you like." A rank plate appears on the panel, the clipboard in the cabin, and the controls are free. A replay ends with "Floor 15 is running again." instead of the rank line. |

Answer timing: a panel answer locks at departure, when the doors have closed. At that moment the director evaluates it in memory with `runtime.check`, which is instant and makes no database call, and starts the durable commit. Feedback appears after the ride. Advancement waits for both the ride and the commit.

Before departure, a different floor replaces the destination. That is the "change of plan", and Lifty praises it. Choosing the floor the car is already on is still an answer, evaluated in place without a ride.

Answer windows (M7, DECISIONS D105). A press becomes an answer only if it happened while that exact item was accepting answers. The director opens a window (a token plus the item signature) when a job is presented, and again after a wrong answer on the same job. It closes the window when an answer locks, on every transition, at Concept Rescue, during hall calls and in free rides. Outside a window the panel is locked and any waiting call is cancelled, and a departure is judged only if its press carried the open window's token and the item signature still matches. Before M7 a tap during an arrival could depart under the next job and be judged against it. Tests: `director/answerWindow.test.ts` (the reproduction seed, arrival, door opening, praise, rapid taps, reposition rides, current-floor taps), `director/answerWindow.property.test.ts` (random tapping), `sim/elevator.property.test.ts`.

Help ladder (core pack policy `moves.on-a-line`, data): the first miss starts a correction on the learner's own job, then a fresh job (D149). On that fresh job CLUE points at the givens after 2 misses, SHAFT MAP after 3, HOW TO COUNT after 4, SHOW ME after 7, and a new variant after 8; the variant keeps the rescue with it, so it never starts a second correction and is never independent evidence (D153). Tests that check the ladder's own steps pin the generic policy (`LADDER_CONTENT`). Each next step can be asked for before it is offered. The beacon and cargo encounter policy (`encounter.clues-only`) offers CLUE and the shaft map on request only, never SHOW ME, and a Concept Rescue at 5.

Automatic feedback never gives the answer away. The counting-convention hint marks only the first floor after the start. A full count is the guided help step, credited as guided.

The load sensor in the cargo bay is world physics: it knows the total weight, not the right answer. Correctness still comes from the engine.

### Corrections (D149)

A miss on a practice job teaches through what happened, then a count, then a fresh job:
1. The world shows it. The ride (or the meter's ride) goes to the floor chosen, the doors open on what is not there ("No repair kit here."), and the shaft map draws the move the answer made as an amber bracket with its size, from the job's floor to the floor reached (+6 when the job said 7). Where-did-it-start draws the crew's ride as it would have gone from the floor chosen; the express draws nothing (a move from the bottom says nothing about stops). A wrong load opens the load meter, the room still left outlined on an underload. The answer is never drawn.
2. Lifty gives one cue: the mistake's line when the engine tagged one ("One floor short. Floor 8 is where we start. Count the floors after 8."), else the job's own wrong-floor line.
3. LET'S COUNT waits in the help slot. No timer starts the correction; the panel stays locked meanwhile.
4. The board (tag LET'S COUNT) works through the learner's own job: "Let's count it together." and "We start on Floor 8. The job is 7 floors up. Tap the next floor." Same counting, parts, stops and count-on as the test run below.
5. The board's last line names the method ("Floor 15. 7 moves, and the floor we started on was not one of them.").
6. "New job." and a fresh job of the same kind, never the same question or answer as the one just counted (D151), from its own floor (the lift rides there by itself). Praise after it is solved: "After that count, you worked this one out yourself."
7. The playtest report lists each correction and whether the next job went right first try without help (`correction.followUp` in the log).

A restart during a correction comes back to the board (counting restarts: counts are presentation). The encounter is a mastery check: its misses keep the same job waiting (with the load meter opened on a wrong load) and its test run stays at the fifth miss.

### Concept Rescue in the elevator (the test run)

On the fifth miss of the encounter (policy data), the ride still happens and Lifty names where we went. LET'S COUNT starts it. Then the job pauses:
- the cabin dims to 45%, the panel locks and dims, Lifty's display shows the help arrow
- the TEST RUN board shows a different example from the engine, for example "we start on Floor 4 and move 3 floors up"
- the learner taps the floors one at a time. Tapping the start floor is answered with "Try the floor right next to the last one we counted". Each counted floor gets a MOVE n badge
- then "So where does the lift stop?" The learner taps the stop. The answer goes to `runtime.rescueAnswer`. It is never evidence
- capacity jobs use the same board with load spaces and a "how many more fit" choice row
- the newer jobs (D148) use the same board: a two-part trip is counted in two parts, the second starting where the first stopped ("First part done, at Floor 3. Now 4 floors up."); where-did-it-start counts back from where the ride ended; the express taps its stops from the bottom, a stop at a time (STOP n badges); the trip meter counts the floors on the way, then asks "How many floors was that trip?" from a choice row; two orders show the first order already in and count on from it ("That makes 3."), then ask how many in all
- misconception-specific framing appears only when the engine reports a strong focus (for example "The floor where we START is not one of the moves")
- back on the real job, the learner still solves it. Success praise: "After that count, you worked this one out yourself."

The word is TEST RUN, an engineering word. Child-facing copy never says "practice", "lesson" or "wrong". A rescue in progress survives closing the app.

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
- Automatic rides (the car repositioning to the next job, or back to a job after a rescue) still happen, faster: travel timings scale by `pacing.autoRideTimeScale` in the copy JSON (0.7 now, bounded 0.3 to 1.5). Doors keep their normal feel. The learner's own rides are never scaled. Tune from the playtest.
- Timing is "authentic feel, compressed time". Normal: doors 1.3 s, dwell 0.9 s, 0.38 s per floor after the first, chime 0.18 s after the stop, doors open at 0.65 s. A 7-floor ride from press to doors open takes about 8.7 s (about 7.8 s with Door Close). Reduced motion runs the same sequence, and the same floor-by-floor indicator, in about 3.4 s. The numbers are first guesses for playtests.

## Sound

The simulation emits semantic events. `audio/cues.ts` maps them to slots:
- buttons: `floorButtonPress`, `floorButtonActivate`, `doorButtonPress`
- doors: `doorMotor` (loop), `doorClosed`, `doorOpened`
- travel: `motorStart`, `travelLoop` (loop), `deceleration`, `arrivalStop`, `arrivalChime`
- other: `ambientMachinery` (loop), `overloadTone`, `powerRestore`, `completion`
- exploration: `landingReaction` (M7.1), mapped to the existing soft confirmation sound as a placeholder. There is no per-landing audio.

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

Cel-shaded 2.5D, from the shared design system. ART_DIRECTION.md has the rules, this is what Floor 15 does:
- Tokens: `src/presentation/design/tokens.ts` (Engineer World palette roles, surfaces, states, type roles, motion with reduced equivalents, parallax, accomplishment sizes). `ui/palette.ts` maps them to the short `eq.*` names.
- Cabin (`ui/CabinScene.tsx`, geometry in `ui/cabinGeometry.ts`): segmented back-wall panels in three flat bands, cyan side light columns, ceiling light panels, an indicator in a steel bezel, a door frame lit from the key-light side, door leaves with a seam and narrow vision panels, a threshold plate, angled side walls with handrails, one maintenance label. The cabin is the same on every floor.
- Landings (M7, `content/landings.ts`, `ui/landingArt.ts`, `ui/LandingLayer.tsx`): every floor is a place, from data. Each of the 20 entries in `landings.json` picks a wall swatch, a light, a wall pattern, a sign style, a back doorway, a room silhouette, a window, up to three props and an emblem, plus a short place name (LOBBY, WORKSHOP, MACHINE ROOM, ...) and a kind: `service` for the grounded floors, `destination` for the four themed floors (7 PLATFORM HEIGHTS, 9 WIND RUINS, 13 BLOCK BUILDER, 20 ROOFTOP GOLF, D130). One renderer draws any entry from flat shapes (rects, circles, lines, polygons in door units). The place name is native text on the sign, seen through the gap between the door leaves. The landing's light spills onto the cabin floor as the doors open. The floor number is still painted as a vector stencil. Floor 15 is dormant (dim, unlit sign) until its power is restored, then restored for good. Tests: `src/themes/content/landings.test.ts` (validity, uniqueness of wall, silhouette, emblem and name, any two floors differ in at least four features, fallback, Floor 15 states, bounds, a 90-shape budget per landing, and nothing behind the number that makes it hard to read).
- Parallax: while the car moves, the shaft wall scrolls past the vision panels and reflections slide on the side walls. Zero under Reduced Motion.
- Production art (visual production milestone, D131 to D135; `src/themes/elevator-quest/art/`, `ui/art/`): any cabin part, landing, Lifty pose or mission object can be an image from the art manifest, drawn in place of its vector and falling back to it while loading or if missing. Landings use a square canvas cover-fitted to the doorway with a safe core and reserved zones for the native number, sign and objects (`art/fit.ts`; vectors for doorway shapes outside 0.72 to 1.12). Landing layers settle by depth as the doors open; moving pieces play one reaction (touch or arrival); Floor 15 adds a power overlay per state. An explore floor with art uses the art's touch area. An illustrated landing shows the floor number on the live sign beside the name ("15 · PRIMARY POWER", D136) instead of the big painted number; vector landings keep the painted number. Lifty's art poses (neutral, help, thinking, success, concerned, quiet) come from the director's mood via `liftyArtPose()` (D137). The cabin's twelve parts are placed by the cabin geometry; door leaves move with the doors. The illustrated cabin is all or nothing: it draws only when the backing, the three frame strips and both leaves are all present, otherwise the whole vector cabin does (D142). Lifty is drawn 98 to 136 pt square by layout, in the spare height above the 20 pt door frame (D142). Images load when their slot mounts and are cached within a byte budget; the destination's landing loads while the car travels. **Approved art (D145)**: the six required cabin pieces, the ceiling, floor and side walls, and Lifty's neutral pose (D144), so production draws the illustrated cabin and Lifty in every layout; landings and mission objects have no approved art yet, and Lifty's five other poses are pending candidates made from the neutral master (D147): Review draws them, production shows the neutral image for them, and a pose that is loading or fails to decode shows the neutral image too; the backing covers the visible back wall between the side walls, ceiling and floor, and the threshold plate reuses the lintel strip. Development calibration art (`assets/dev/art/`) and overlays (doorway crop, safe zones, hit boxes) are in the developer tools. docs/ART_ASSET_SPEC.md is the art brief.
- Directory (D134, `ui/Directory.tsx`): a sheet from the cabin icon row listing the twenty floors (number, emblem, name; rows are text, not buttons), and a placard under the panel naming the current floor where a wide window has spare height.
- Panel (`ui/FloorButton.tsx`, `ui/buttonLook.ts`): hardware buttons with bezel, recessed face, engraved number and lamp ring. Selected (amber lamp), current (position lamp), clue (cyan ring outside), disabled, and the serviced fade. M7.1 adds: a hall call (dashed cool-white ring outside the bezel, a CALL tab, a 0.5 Hz breath that never drops below 55% and is still under Reduced Motion), a 6 pt service dot on floors whose landing was inspected, a one-time power sweep when Floor 15 comes back (each lamp on once, bottom to top, then all fade; 1.6 s, 0.9 s and all at once under Reduced Motion), and an engraved ENGINEER RANK 1 plate in the panel header once earned.
- Landing heroes (M7.1, `ui/landingArt.ts` HERO, `ui/LandingLayer.tsx`, `ui/Hotspot.tsx`): five silhouettes have a movable part drawn in the silhouette's layer: fan blades spin, the motor wheel turns, the core cells pulse, a plan drawer slides out as a blueprint appears, the telescope tilts as a star brightens. One progress value runs on the UI thread and each part derives a rotation, a slide or an opacity from it (`heroPose`, pure and tested: returns to rest, whole turns, under 3 Hz, no movement under Reduced Motion). The touch area is the object, grown to 64 pt.
- Lifty (`ui/Lifty.tsx`, `ui/liftyPose.ts`, `ui/liftyPlacement.ts`): compact maintenance robot drawn in Skia, six states as display glyphs and arm poses. When Lifty has nothing to say (a free ride, a quiet arrival, after a hall call is taken) the bubble goes and the figure stays (M7.1). Since M7 Lifty stands in the scene, in an eye-level band between the indicator and the door frame, with a speech bubble beside it and the help button in reach. Lifty moves within the band with the job (toward the panel for panel help, toward the shaft map for map help, above the crates or the test run), in 320 ms, instantly under Reduced Motion. The band never overlaps the panel, the indicator, the doorway, the shaft map, the cargo bay or the test-run board at the tested sizes. One exception: a cabin under 400 pt wide during cargo puts the band at the top of the cabin, over the indicator, as the cargo bay did before (DECISIONS D112). Every line said in a full headless playthrough is checked to fit its bubble (`ui/liftyPlacement.test.ts`).
- Concept Rescue board (`ui/RescueBoard.tsx`, `ui/rescueLayout.ts`): one surface, cyan accent, cells at least 64 pt, vertical floors when they fit.
- Text: DISPLAY for titles, UI for labels, READING for Lifty and the board (native text, accessible).

There are no textures, particles, blur stacks or video in the scene. Continuous animation: doors, the travel parallax and shaft-map car marker, the slow help pulse, the system-check scan line, and the completion light ramp. Nothing flashes. The travel frame callbacks (cabin parallax, shaft-map car) are registered inactive and switched on only while the car travels (`ui/useTripPosition.ts`, `tripMotion.ts`). Before M7 they ran on every frame for the whole session.

### Success replay (M7)

After a correct answer, and only then, the game shows one way to reach it (DECISIONS D113). The model is theme-neutral (`src/presentation/reinforcement/strategy.ts`): concept, answer summary, strategy, representation, steps, evidence basis (observed or suggested), observations and intensity. The words are theme copy (`replay` in `floor15.json`).
- Choice is deterministic. Observed first: an answer chosen on the shaft map ("You found it on the shaft map: 4 → 10"), crates loaded in the cargo bay ("You loaded 6: 4 + 6 = 10"). Otherwise the simplest efficient suggestion: count on or back for up to 3 floors, bridge through a ten when the move crosses one ("One quick way: 8 → 10 → 15"), make or leave a ten when it lands on one, count for 4 or 5 floors, chunks of five going up, a distance check going down, and the offset from the beacon on stretch jobs.
- The game says "you" only for what it saw. The copy validator rejects a suggested line that says "you". A changed plan is noted as an observation but never turns a suggested strategy into "yours".
- In the world: a steady green rim and check on the indicator, the path drawn on the shaft map hop by hop (all at once under Reduced Motion), and the load sum on the cargo bay's status chip. No card, no confetti.
- Intensity follows the challenge: the replay animates for about 1.6 s routine, 2.2 s stretch, 2.8 s mastery; under Reduced Motion it shows at once.
- Child-paced (correction round, D122). The sequence is `arrival` (0.8 s, 0.25 s reduced: the landing and its object, nothing in front), `animating` (Lifty's words and the replay), `review` (everything stays; NEXT JOB appears in the help button's place). No timer ever starts the next job: only `director.nextJob()` does, and only in `review`. The cargo bay's accepted load and the success after a Concept Rescue wait the same way. Free ride has no NEXT JOB.
- Nothing is recorded: no learning event, attempt or upgrade, and NEXT JOB writes nothing either. No answer window is open during a success and the panel is locked, so taps cannot answer the next job, open its window or queue a call (tested in every phase). Never after a wrong answer. A crash or reload while waiting resumes at the next job (the answer was committed before the doors opened).
- Tests: `presentation/reinforcement/strategy.test.ts` (strategy table, property test), `director/successReplay.test.ts`.

The landing floor number used Skia `matchFont`, which found no font in the web preview, so the number never rendered there. It is now drawn from rectangles (`stencilDigits.ts`), with no font lookup at all, and the landing carries an accessibility label. Verified in the scratch web preview in this session. Not verified on a device.

The layout (`ui/layout.ts`) works across windows, and tests cover eleven of them, from 320 x 768 to 1366 x 1024:
- Landscape or near-square: the cabin on the left and the panel on the right.
- Portrait: the cabin on top, then the panel. Lifty is inside the cabin in both orientations (M7).
- Panel buttons never drop below 64 pt. Small windows shrink the cabin instead, and a short narrow window keeps the buttons at 64 pt so the cabin keeps its room.
- Cargo crates never drop below 64 pt either (`ui/cargoLayout.ts`, M6). A side that cannot fit its crates scrolls, and the cargo bay always stays inside the cabin view.

## Recovery semantics

SQLite is the record. The world is presentation.

| Interrupted | Reopens as |
|---|---|
| before waking the lift | intro again, doors closed, power off |
| mid-ride (answer already committed at departure) | the next job or the same job (with the miss recorded), car parked at the job's start floor, doors open |
| after a wrong floor | same job, same item, `wrongTries` kept |
| after help | same job, the help ladder continues from the next step |
| during a Concept Rescue | the TEST RUN board again, same example, count restarted (the count is presentation) |
| in the cargo bay | cargo bay again, same numbers, crates unloaded (loading is not learning evidence) |
| finale | car parked on floor 3 with doors open, only 15 enabled |
| while saving the completion | finale again (the commit rolled back), then completes once |
| during a hall call | the job at the calling floor, doors open (the call was a ride, nothing to recover) |
| after completion | free ride at the restored Floor 15 with the doors open, rank plate and clipboard (M7.1; before that a completion card). RUN FLOOR 15 AGAIN in the Engineer Log starts a new run (fixed in M6: a cold start used to open a fresh intro) |
| during free ride | free ride at Floor 15; every discovery made before the interruption is still in the log (world memory is written at the touch) |
| during a success replay or while NEXT JOB waits | the next job (the replay is presentation, the answer was already committed); a collected repair kit is not remembered (session only) |
| after an app update changed the content under an active run | that run ends as `abandoned` (evidence kept, no value, no unlock) and a fresh run starts (M7, DECISIONS D106) |
| a save keeps failing (three tries) | a clear stop: "Saving did not work", TRY AGAIN reloads the last durable save, BACK TO LAUNCHER where a launcher exists. The failed answer is not recorded (M7, DECISIONS D108) |

The car's floor, the door position and loaded crates are not persisted. A process death never resumes between floors: the car is placed at a coherent floor with its doors open. An uncommitted tap is lost, and the child taps again.

## In-game progression

Unlocks are theme content (`content/themes/elevator-quest/floor15.json`). The runtime grants them inside the completion transaction, idempotently, into the append-only `unlocks` table:
- `eq.rank.engineer-1`
- `eq.system.maintenance-panel`
- `eq.landing.floor-15-restored` (M7): Floor 15's landing is restored for this learner from then on. Saves from before M7 have only the rank unlock, which also counts as restored.

Replays never grant them again (the `unlocks` table is unique per learner and unlock, tested in `director/faultMatrix.test.ts`). The maintenance panel is visible in free ride: live state, direction and position readouts, and the Engineer Log clipboard. The readout sits in the cabin's bottom-left corner only where it leaves the door opening clear (`maintenanceReadoutBox`, tested at every window size); narrow windows drop it so the landing and its object stay visible (M7.1, found in the narrow-window screenshot review). There is no XP, no currency and no Quest Tokens.

## Mission objects (correction round, D123)

The things the jobs talk about stand on the landings. Content: `content/themes/elevator-quest/objectives.json`, schema and validator in `content/objectives.ts`, drawn by `ui/landingArt.ts` (`objectShapes`) into the landing layer, in front of the landing's light, front and centre below the painted number.

| Job (step) | The words | Object | Where | Interaction |
|---|---|---|---|---|
| first service call (`cued-moves`, item 1) | "The repair kit is 6 floors up" | hard-shell orange technician case, wrench mark | the answer floor, after a correct answer | optional tap: loads it into the lift (slides toward the car, gone) |
| second service call (`cued-moves`, item 2) | "The toolbox is 3 floors up" | steel toolbox, orange lid, tools showing | the answer floor | optional tap: loads it |
| shaft map job | "The spare parts are 4 floors down" | parts bin with gears | the answer floor | optional tap: loads it |
| beacon job (`reference-stretch`) | "The beacon is on Floor 11" | short mast with the amber diamond lamp, the same mark as the shaft map's beacon | the beacon's (given) floor, for the whole job | none, recognised ("That's the beacon.") |
| beacon job | "We're 5 floors above the beacon" (the crew) | two crew members in helmets and hi-vis, a work cart with a radio | the answer floor | none, recognised ("There's the crew.") |
| route to the dock | "The loading dock is 6 floors below Floor 14" | hazard-striped dock edge and a pallet of strapped crates | the answer floor (the cargo bay then takes the view, with its own labelled crates) | none, recognised |
| cargo | crates | the cargo bay's crates now carry straps and CABLE / PARTS / BOLTS stencils | cargo bay | as before |
| two-part trip (`two-moves`, D148) | "The spare parts are waiting there" | parts bin with gears | the answer floor | optional tap: loads it |
| where did they get on (`start-unknown`) | "They left their toolbox where they got on" | steel toolbox | the answer floor | optional tap: loads it |
| trip meter (`distance`) | "The crew is on Floor 6" | the crew and their cart | the crew's floor, after the right count rides there (the floor itself is a given; the beacon marks it on the shaft map) | none, recognised |
| express (`equal-jumps`) | "The repair kit is at stop 3" | repair kit | the answer floor | optional tap: loads it |
| two orders (`two-groups`) | crates | the cargo bay, with the order plate | cargo bay | none: the bay is the job |
| finale | power on Floor 15 | the landing's core, dormant then restored and waking | Floor 15 | as before (in-world completion) |

- A destination object is placed when the car stops, only if the locked answer checked correct (`runtime.check`, the same check that decides feedback). It never appears before the answer, so it cannot show the way, and it never appears at a wrong floor.
- Session state only (`view.props`): no table, no world memory, no evidence. Floor 15's restored power stays the one durable world state.
- Accessibility: every object has a label; a collectable one is a button ("Load the repair kit into the lift") with a 64 pt target and screen-reader activation.

## Exploration (M7.1)

The free ride after Floor 15 is the exploration toy. GAME_DESIGN.md has the design; this is how it works.

- Content: a landing may carry `explore` spots in `landings.json` (1 to 3; id, `target: "hero"`, a discovery key `eq.discovery.floor-<n>[...]`, the object's name, Lifty's line, the log fact). The validator refuses a spot on a silhouette without a hero part, a duplicate key, or a key for another floor. Floors 5, 7, 15, 17 and 18 have one spot each.
- Memory: `runtime.remember(learnerId, key)` writes one row per learner and key into `world_memory` (schema v4, append-only, `INSERT OR IGNORE`); `runtime.memories(learnerId)` reads them. The director loads them at start and writes at the first touch. Nothing in the learning processor, progression, unlocks or the value model reads this table. The DOOR CLOSE tip uses the same store (`eq.tip.door-close`).
- Director: `inspect(spotId)` works only in free ride with the doors fully open and the log closed, and only for a spot on the current floor (the dormant core never reacts). Every touch sets `view.reaction` (a new seq replays the animation) and plays `landingReaction`; a touch during a running reaction is ignored, so taps cannot make a pulse flicker. The first touch adds the discovery and Lifty says the spot's line. `openLog` / `closeLog` (free ride, after the clipboard is earned). Free-ride departures clear Lifty's line; free-ride arrivals at a floor with an undiscovered spot get "Try tapping the ..." after 0.9 s (0.3 s under Reduced Motion).
- Hall calls: `stage: 'call'` with `view.hallCall`. The panel is enabled with every other floor disabled; the press lights the call, locks the panel and rides at normal timing. Rides back from a test run stay automatic at the auto-ride pace. The headless harness presses hall calls itself unless `autoHallCalls: false`.
- Tests: `director/exploration.test.ts` (hall calls, quiet rides, in-world completion, inspection, persistence, learner isolation, the log, the tip), `runtime/worldMemory.test.ts`, a crash case in `runtime/crashRecovery.test.ts`, `persistence/migrations.test.ts` (v3 to v4), `themes/content/exploration.test.ts` (content, hero geometry and poses, the log model), `ui/visuals.test.ts` (call, service dot, sweep), `ui/GameScreen.test.tsx` (no card, clipboard, hotspot size and labels, hall-call button).

## Renderer status

Renderer acceptance is **provisional**. No physical Device Lab run is recorded (DEVICE_LAB.md has only the empty run-log template). What has been checked:
- Jest tests and a headless runtime in Node
- production `expo export` bundles for Android and iOS
- a throwaway web build in a scratch copy, screenshotted in headless Chromium at several window sizes, to catch layout mistakes (M5: landscape 1180 x 820, portrait 820 x 1180, a narrow 504 x 820 window and Reduced Motion, through the whole mission including a Concept Rescue)
- the browser playtest build (M6, M7, M7.1): `npm run web:screenshots` captures of landings, Lifty contexts, replays, cargo, the Concept Rescue, the in-world completion, the five explorable landings (before, reacting, inspected), the Engineer Log and hall calls at iPad, Fire HD 8 and Split View sizes (WEB_PLAYTEST.md)

None of that says anything about frame rate, touch latency or audio latency on a Fire HD 8. Rendering is isolated in `ui/`: the simulation, director, audio cues and layout are framework-free, so scene cost can be cut or the renderer replaced without touching game logic.
