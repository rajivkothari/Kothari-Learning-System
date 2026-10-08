# Elevator Quest

The learner-engineer experience (Engineer World). First slice: the mission "Floor 15" (M4, hardened in M5 and M7), and the free-ride building around it (M7.1 exploration pass). M8 adds pool steps with wider math, reading jobs, and things to touch on twelve landings (D154 to D157). M8.1 approves the art set, adds the building directory, readable text roles, landing play while a job waits elsewhere and a generated sound pack, approved once the owner confirmed the rights (D158 to D163). M8.2 illustrates the last eight floors, so every landing is illustrated and has something to touch, and fits the live sign so it is never cut off (D164, D165). This doc covers the theme adapter, the elevator simulation, sound, recovery, and the renderer. Learning rules live in LEARNING_MODEL.md, and the engine stays theme-neutral.

## The principle

Operating the elevator is the fun. Learning gives the player a reason to operate it. A Floor 15 problem never shows a quiz card in front of the panel. The real panel is the answer interface: work out the floor, press it, and the lift goes there.

The full sequence is part of the reward: press, click, light, doors close, motor, indicator counting floor by floor, slowdown, stop, chime, doors open.

A wrong floor is a real ride to that floor. Lifty explains the consequence in building terms only after the doors open.

## Where things live

```
src/themes/elevator-quest/
  sim/elevator.ts        render-free elevator state machine (deterministic, injected time)
  audio/profile.ts       semantic sound slots, the placeholder profile PROTOTYPE_MODERN and the generated ELEVENLABS_V1 (M8.1)
  audio/packs.ts         pack status from the manifest, PRODUCTION_PROFILE, the review profile and the ?sound= switch (M8.1, pure)
  audio/voices.ts        the one-shot voice policy: gaps, shared files, the four-voice cap (M8.1, pure)
  audio/activeSet.ts, activeSet.web.ts   platform adapter: which sound set plays (native: approved only; browser: the newest pack that is not rejected by default)
  audio/cues.ts          simulation events -> audio cues (rate limits, loop ownership)
  audio/mix.ts           normal / quiet / muted gains per category
  audio/audioEngine.ts   expo-audio playback (the only audio file that touches native)
  audio/assets.ts        bundled map of APPROVED sound files, written by generate-elevator-audio.js --sources, kept equal to the manifest by a test
  content/floor15.ts     loads the copy JSON; the copy contract, building constants, template helpers
  content/landings.ts    the landing catalog schema, validation, Floor 15 dormant/restored (M7); objects, spots, reactions (M8)
  content/reading.ts     the reading words: schema, loader, line helpers, validator against the pack and the landings (M8)
  director/director.ts   the theme adapter: runtime intents <-> elevator world
  director/jobs.ts       each concept as a job: its floor, givens, counting clue, words, success replay plan
  director/landingTouch.ts what a touch on the open landing does now: explore, quiet or answer (M8, pure)
  director/playtestLog.ts developer-only local log and text report
  ui/                    React Native + Skia components (thin)
  ui/buttonLook.ts, liftyPose.ts, cabinGeometry.ts, rescueLayout.ts, layout.ts   pure visual logic (tested)
  ui/landingArt.ts, liftyPlacement.ts, helpCue.ts, tripMotion.ts   pure visual logic added in M7 (tested)
  ui/LandingLayer.tsx    draws any landing from its shape list (one renderer for all floors), with its hero's reaction
  ui/Hotspot.tsx         a touchable thing on a landing: 64 pt target, ring, check (M7.1); answer targets never show a check (M8)
  ui/touchAreas.ts       where each landing thing can be touched in this layout (M8, pure, tested at every window size)
  ui/LandingSpots.tsx, ui/landingReactions.ts   one renderer for every landing reaction, and its pure motion curves (M8)
  ui/ReadingCard.tsx, ui/readingCardLayout.ts   a short readable card (the Archive's book, the reading note) and where it may go (M8)
  ui/EngineerLog.tsx     the Engineer Log clipboard (M7.1)
  ui/Directory.tsx, ui/directoryLayout.ts   the DIRECTORY control and the directory sheet (M8.1)
  ui/textRoles.ts, ui/emphasis.ts, ui/ScrollMore.tsx   text roles and sizes, marked words, the "more below" cue (M8.1; the first two pure)
  ui/signFit.ts          the live place sign fitted to its plate: one line, two lines, or the name alone; never cut off (M8.2, pure, D165)
  session.ts             wiring without React: database (platform adapter) -> runtime -> director -> audio
  sessionCore.ts         session shape, settings store, which instance to reopen (no native imports)
  useFloor15.ts          React hook over session.ts
  devtools/              developer-only jumps, simulated misses, inspection, visual-review scenarios (WEB_PLAYTEST.md)
  testing/headless.ts    real director + runtime + node:sqlite on virtual time (tests only)
assets/themes/elevator-quest/audio/   prototype WAVs, the generated pack elevenlabs-v1/ (approved D163, M8.1) and manifest.json
scripts/generate-elevator-audio.js    the synthesizer that made the prototypes; --sources rewrites the sound require lists
scripts/lib/landingWalk.js            reads a landing from the page and rides floor to floor in free ride (the e2e walkthrough and the contact sheets, M8.2)
scripts/floor-contact-sheet.js        every floor's landing as one labelled grid per layout (M8.2, WEB_PLAYTEST.md)
src/devtools/audioReviewSources.ts    requires of sound pending review (browser playtest build only, empty since D163, M8.1)
content/themes/elevator-quest/floor15.json   all child-facing Floor 15 text, unlocks, pacing, replay words (validated)
content/themes/elevator-quest/landings.json  the 20 landing identities, their objects and exploration spots (validated)
content/themes/elevator-quest/reading.json   the words of every reading job, keyed by item id (M8, validated)
src/presentation/reinforcement/strategy.ts   success replay model and strategy choice (theme-neutral, pure)
content/placement/demo-start.json     the starting-placement assumption
src/presentation/design/              design tokens, cel bands, stencil digits (shared, pure)
content/packs/core.json               theme-neutral math content the app ships
content/packs/reading.json            theme-neutral reading content, composed after core (M8)
content/missions/core.json            theme-neutral mission "positions-and-capacity" (version 3 since M8)
```

Lint rules and tests enforce the following:
- `sim/`, `director/`, `content/`, and `audio/{cues,mix,profile,packs,voices}.ts` import no React, React Native, Expo, or Skia (`packs.ts` and `voices.ts` through `src/dev/device-lab/boundaries.test.ts`).
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
| `SHOW_ACTIVITY` positionAfterTwoMoves@2, the same way (M8) | A two-part trip whose second part goes on the same way ("go 3 floors up, then 4 floors up"): three numbers added. The two-leg rule of D152 holds. A miss that took the second part back the other way gets "The second part goes up too, the same way as the first." |
| `SHOW_ACTIVITY` combineGroups@2, doubles and near doubles (M8) | The cargo bay with two orders of the same size, or one apart. A load of one order twice gets "That's one order twice. The orders are 4 and 5, one apart." |
| `SHOW_ACTIVITY` missingInSequence (M8) | No hall call: the hall lamps can be seen from anywhere. "Lamp check: the hall lamps go 4, 6, ?, 10, 12. One lamp is out, and the crew is there. Take us to that floor." Or the next lamp after the last one, or a pattern of 5s. A panel answer. The counting clue counts from the first lamp, a whole step at a time; the correction board counts the lamps the same way. No bracket is drawn after a miss (a move says nothing about a pattern). |
| `SHOW_ACTIVITY` tensAndOnes (M8) | A hall call to the start floor, then "Ten-floor express! From Floor 3: one 10-floor jump up, then 4 more floors up. The toolbox is there." Also ten more or ten less alone ("one jump of 10 floors down"), and, with no hall call, a teen number from the bottom of the shaft ("one 10-floor jump up, then 7 more floors"). A panel answer. The correction board counts the ten floor by floor, then the ones ("That's 10 floors: one ten, at Floor 13. Now 4 more up."). |
| `SHOW_ACTIVITY` orderPositions (M8) | A hall call to Floor 1 (going up) or Floor 20 (going down), then "Calls on Floors 13, 8 and 17. Going up from Floor 1, which do we reach second? The crew is there." Two calls compare, three put in order; the content asks for the second call or later. A panel answer. The correction board rides past the calls in order from the first one met. |
| `SHOW_ACTIVITY` authoredItem: a reading job (M8) | A short note to read and act on: touch a thing on the landing, ride to a floor, or pick a card. See "Reading jobs" below. |
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

### Mission version 3 (M8, D154)

`positions-and-capacity` version 3 has fourteen jobs a run. A pool step presents one of its activities, chosen from the run's seed (the same one again after a resume or a restart). The checklist has a line per step.

| Step | Checklist | What the run presents |
|---|---|---|
| intro | Wake the lift | the lift wakes |
| cued-moves | Run the first service call | one cued move up (was two) |
| read-1 | Read a job note | a reading job: key details, touch or ride |
| second-representation | Read the shaft map | one of: a move down on the shaft map, a teen move up or down, a move up or down through ten |
| two-groups | Load two orders | one of: any two orders, doubles, make ten, near doubles |
| read-2 | Follow the steps in a note | a reading job: sequence, touch or ride |
| two-moves | Run a two-part trip | one of: back the other way, on the same way |
| number-sense | Count in jumps | one of: ten more or less, a teen from the bottom, a lamp gap by 2s, the next lamp by 2s, a ten and some ones up, the express, a lamp pattern of 5s |
| read-3 | Find the clue in a note | a reading job: inference (touch or ride) or cause and effect (touch) |
| start-unknown | Find the crew's toolbox | where did the crew get on |
| compare-distance | Compare and measure | one of: two calls, the trip meter, three calls, the trip meter for 8 to 15 floors |
| stretch | Take on a big job | one of: the beacon, where did they get on (6 to 9 floors), a wide two-part trip, a ten and some ones down, 10 to 12 floors up |
| read-4 | Puzzle out the words | a reading job: a word in context (touch or cards) or a sentence (cards) |
| capacity-encounter | Load the service car | the route to the dock, then the cargo bay |
| finale | Restore Floor 15 | the ride to Floor 15 |

Every new math job is practice on the core policies, so its first miss starts a correction on the learner's own job (D149) with its own board words, and each has its own clue words (`help.<kind>.jobs`: `sequence`, `tens`, `tenJump`, `tensFromZero`, `compare`, `order`), wrong-floor line and success replay (the lamps by the pattern's step, the ten then the ones, the calls in the order of travel). Mission objects follow the pool member: an objective may name the `activities` it is for (the crew for lamps and calls, the toolbox for the ten-floor express, the repair kit for 10 to 12 floors up). Not measured yet: how far one clean run moves each skill, and how long a run takes the learner.

### Reading jobs (M8, D155)

A short note says what to do. Its words are `content/themes/elevator-quest/reading.json`, keyed by the item id in the prompt (`content/reading.ts`); the director never reads the prompt's answer and never scores.

- Touch (17 items): the car goes to the item's landing like any job (a hall call between jobs), the note opens, and the item's options become the landing's answer targets (`setAnswerTargets`, `director/landingTouch.ts` mode `answer`): "Touch the thing that needs fixing." The panel stays locked; a touch answers only while the job's answer window is open, through `runtime.check` and `submit` like a panel press. A touched thing with a reaction plays it, right or not.
- Ride (9 items): answered with the panel like a move job ("Ride to where the lights go."). A miss rides to the floor chosen: "This is Floor 9, Wind ruins." and a cue. Every ride is answerable from its note plus the building directory (M8.1, D159, below): the item lists the directory `places` its note names and a `solve` that leads to one floor, and the validator checks that floor is the pack's answer.
- Cards (5 items): vocabulary and sentence items, read-4 only ("What does jammed mean here?"). A card sends the same option a touch would (`chooseReading(value)`), so the evidence is the same.
- After a miss: what happened ("That is the drill.", or the floor reached) and one cue: the item's likely misreading ("Check left and right. Hold up your left hand to see.") or "Read the note again. It tells you what to do."
- Help (`reading.text-clue`): CLUE lights the key sentence and opens the note, and Lifty says the item's own `clue`, a strategy for that note ("Find the Archive in the directory. Then count two floors up."; M8.1, D159; the generic "The lit-up words tell which one. Read them again." only for an item without one); it can be asked for at any time and is offered after the first miss. A clue never gives the answer away (`leak.clue`). Once CLUE has been used after a miss, SHOW ME shows the answer: the thing (then the only answer target), the floor (ringed on the panel) or the card ("It's the toolbox. Touch it."), recorded as demonstrated. A second miss brings a fresh item after a short pause ("New call coming in. A different job, same kind."), never the same note. No test run and no LET'S COUNT: the board is for counting.
- A right answer: the item's own world line ("The lid pops open. Wrenches for the crew!"), then NEXT JOB as for every job. No success replay.
- Floor 15 never hosts a reading job: its landing is dormant until the mission restores it.
- Bold words (M8.1, D159): each item's `emphasis` names at most five exact, whole-word spans of its note or instruction; `readingMarks` turns them into character ranges and the director passes them on as `ReadingView.lineMarks` (one list per sentence) and `askMarks`. The screen sets them at weight 900 in the warm light accent with an underline (`MARKED` in `ui/palette.ts`), never by colour alone. The validator refuses a span that gives the answer away (`leak.emphasis`, see CONTENT_MODEL.md), and a test checks that the marks in the view never cover the answer.

Read-and-ride audit (M8.1). The nine rides, the places their notes name (with each place's floor in the directory) and how the floor follows. Answers unchanged.

| Item | Places (floor) | Solve | Answer |
|---|---|---|---|
| grow-lights | Lobby 1, Hydroponics 16 | the place Hydroponics | 16 |
| ladder-not-in-storage | Storage 4, Workshop 2 | the place Workshop | 2 |
| spare-springs | Platform Heights 7 | the place Platform Heights | 7 |
| kit-above-archive | Archive 17 | Archive, 2 up | 19 |
| lost-toy-between | Lobby 1, Storage 4, Workshop 2 | between Lobby and Storage, not Workshop | 3 |
| ball-down-two | Rooftop Golf 20 | Rooftop Golf, 2 down | 18 |
| painter-and-plumber | none (the note names Floors 12 and 13) | Floor 13 | 13 |
| jobs-before-lunch | Test Lab 8, Machine Room 6 | the place Machine Room | 6 |
| hose-first | Hydroponics 16, Storage 4 | the place Storage | 4 |

Tests: `src/themes/content/readingAudit.test.ts` (every ride answerable from note plus directory, with Floor 15 dormant and restored; places listed under their directory names; no giveaway in bold words or clues; the validator's rejections; mark ranges).

The note on screen (`ui/readingCardLayout.ts`, `ui/readingSurface.ts`, `ui/ReadingNote.tsx`, tested at fifteen window sizes in `ui/readingLayout.test.ts`):
- a solid card (`ui/ReadingCard.tsx`, test id `reading-note`) headed by the note's source, one accessible line per sentence at the passage size (20 to 24 pt by window, M8.1), the instruction under it at the question size (24 to 28 pt, the biggest words on screen, set apart by a rule), the clue line labelled "Clue: ..." and marked by a bar and weight; it sits in the cabin under Lifty's band (`readingCardBox`), clear of the panel, the door buttons and the help button, and of Lifty where the cabin has room (in a split view too short for that it covers Lifty's words while open; in the shortest split view, 320 x 768, it also covers the corner DIRECTORY plate, which waits under it until the note is put away, M8.1). The doorway sits inside that box at every window size, so the note opens first (read) and the learner folds it to answer
- the learner folds it with "Got it" (`reading-note-close`) and opens it again with "Read the note" (`reading-note-open`, a 64 pt button on the cabin wall beside the doorway, or on the shaft strip in Slide Over); it folds during a ride, and SHOW ME folds it so the thing or card shown is in view (`openNote`, `closeNote`)
- cards: one button per option (`reading-choice-<value>`, labelled with the option's name) for card jobs, and for a touch job whenever the illustrated landing is not drawn (a decode failure, a doorway outside the art's range such as the 2/3 split view; since M8.1 every landing that hosts a touch job is approved art, D158) or an option has no place on it (Floor 1's plant and bench, so the two lobby notes use cards); the cards sit in the note's box once it is folded (`reading-choices`, one column where it fits, each at least 64 pt tall and 140 pt wide, the words 20 to 24 pt; a sheet too small for them scrolls with the "more below" cue instead of cutting a card off); landing answer targets are `landing-touch-<objectId>` (`-shown` while SHOW ME marks one), exploring spots `landing-spot-<objectId>`. A job never mixes the two: the whole job uses the landing only when every option got a touch area on the landing drawn now (`answerReach`), and that choice holds through SHOW ME and a door close

Tests: `src/themes/content/reading.test.ts` (the pack, the words, the landings, the copy rules; part of `validate:content`), `ui/ReadingChoices.test.tsx` and `ui/readability.test.ts` (M8.1: every card whole or scrolling), `src/engine/generation/generators/authoredItem.test.ts`, `src/engine/mission/regeneration.test.ts` (a fresh item is never the one it replaces), `director/landingTouch.test.ts` (answer targets).

### Building directory (M8.1, D159)

A labelled DIRECTORY control beside the panel opens every floor by number, emblem and name, so a note that names a place ("two floors above the Archive") never needs knowledge the game has not shown. It is information, never a ride and never help.

- Control (`ui/Directory.tsx` `DirectoryButton`, placed by `ui/layout.ts` `GameLayout.directory`): a brass-lipped plate with a drawn directory-board icon and the word (copy `directory.button`), at least 64 pt tall; it also names the car's floor ("1 · LOBBY") where the plate is 360 pt wide or more (the old placard's job). Landscape: under the panel (the panel's buttons size to leave it room, never under 64 pt: Fire HD 8 landscape buttons are now 64 pt, were 78). Portrait: to the right of the panel where the width allows, else in the cabin's bottom-left corner just over the panel (Split View 1/3), else under the panel (Slide Over). It replaces the icon-row directory button and the placard of D134; `GameLayout.placard` remains the plate's box where it meets the cabin, so the touch-area and note-button checks keep clear of it.
- When: shown once the lift is awake; it opens in a job (the note open or folded), a hall call, free ride, the finale and a success; dimmed and disabled in the other stages and while the Engineer Log is open. A floor press or a door button puts it away.
- Sheet (`DirectorySheet`, `ui/directoryLayout.ts`): all twenty floors from `directoryRows`, top floor first, one column, or two from 540 pt wide; rows 58 pt with the number, the emblem (icon art when approved, else the vector emblem) and the name in the reading face, title case, at the directory size. It covers the cabin view where the cabin is at least 420 pt tall (the panel stays usable beside it), else the cabin and the panel. It opens scrolled to the car's floor, which is marked by a heavier brass border, a lighter plate, weight 900 and the words YOU ARE HERE (copy `directory.here`). Back (copy `directory.back`, 64 pt) closes it. The sheet is given only the rows and the car's floor, so it can never mark an answer.
- Director: opening calls `directoryOpened()`, which remembers the world-memory key `eq.tip.directory` and logs `directory {open, stage, floor, first, hint}`; closing calls `directoryClosed()` (a log line). No runtime command, and no change to the job, its answer window, the help ladder, scaffolds, the panel or the note. Never evidence, never a help step.
- Introduction: when a job starts that needs the directory (a ride whose item lists `places`, or a job line naming a directory place; no current math line does), and the learner has neither seen the introduction nor opened the directory, Lifty says the job's line and then "Need to find a place? Check the DIRECTORY!" (copy `directory.intro`), the key is remembered and `view.directoryHint` is true: the plate gets a cyan ring breathing at 0.5 Hz (scale 1 to 1.04; a still ring under Reduced Motion). The hint clears when the directory opens or the job ends. Once per learner.
- Tests: `director/directory.test.ts` (the introduction once per learner and never after the learner opened the directory; opening and closing during a reading ride, a math job and a touch job leave the job, window, help, scaffolds and evidence identical and the answer still counts; the intro line fits Lifty's bubble on Fire HD 8), `ui/Directory.test.tsx`, `ui/GameScreen.reading.test.tsx` (no job state changes; YOU ARE HERE only on the car's floor; the answer floor's row has no mark), `ui/readability.test.ts` (the plate full size beside the panel at fifteen window sizes, clear of Lifty, his words, help, the indicator and the landing's touch areas; the sheet shows at least four rows of at least 56 pt).

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

The director asks for the rest directly (M8.1, D162), one sound once, never on every frame:
- landing things: a touched thing plays its spot's own `sound`, or its `closeSound` when it shuts, else `landingReaction` (the M7.1 slot, kept as the fallback). Slots: `toolboxOpen`, `toolboxClose`, `fanStart`, `gearTurn`, `springBoing`, `windmillTurn`, `radioStatic`, `craneLower`, `coreHum`, `drawerSlide`, `bookOpen`, `telescopeTurn`, and `golfPutt` (one composite: the putter tap at 0 ms, the roll to about 1300 ms, the cup drop from 1300 to about 1550 ms, matching `PUTT_MS.normal`, roll 1300 plus drop 250). Which spot names which slot (`landings.json`, checked by `validateLandings`, `ref.sound`): Floor 1 gear `gearTurn`, 2 toolbox `toolboxOpen` / `toolboxClose`, 5 fan `fanStart`, 6 motor `gearTurn`, 7 spring `springBoing`, 9 windmill `windmillTurn`, 11 radio `radioStatic`, 13 crane `craneLower`, 15 core `coreHum`, 17 plan cabinet `drawerSlide`, 17 book `bookOpen`, 18 telescope `telescopeTurn`, 20 ball `golfPutt`. M8.2 (D164) adds no slot and no audio; its spots reuse these: Floor 3 valve `telescopeTurn`, 3 toy robot `springBoing`, 4 hose reel `craneLower`, 4 storage bin `drawerSlide`, 8 flasks `coreHum`, 8 monitor `radioStatic`, 10 relay lamps `gearTurn`, 10 big dial `telescopeTurn`, 12 crane hook `craneLower`, 12 pulley wheel `gearTurn`, 14 hanging lamp `windmillTurn`, 16 grow lights `coreHum`, 16 plants `springBoing`, 19 far door `landingReaction` (named in the data), 19 turbine `windmillTurn`.
- feedback: `answerRight` once where a success begins (panel, reading and cargo), `answerWrong` once where a miss is presented (panel, a rescue pause, reading, cargo; not after a cargo overload, whose `overloadTone` already sounded), `discovery` once on a first discovery.

A profile (`audio/profile.ts`) maps each slot to an asset and a gain. A new elevator character (old hydraulic, high-speed tower, futuristic) is a new profile. No game logic changes. Two profiles exist:
- `PROTOTYPE_MODERN`: the synthesized placeholders. The new landing slots reuse the soft confirmation the landings used before; `answerRight`, `answerWrong` and `discovery` are silent, as before M8.1.
- `ELEVENLABS_V1`: the generated pack. Every slot has a file except `deceleration`, which is silent on purpose (the travel loop fades over the slow-down); `overloadTone` shares the gentle answer-wrong note; `landingReaction` uses the gear clicks.

Each slot also has a category, a loop flag, whether it is essential, and a `gapMs` rate limit (every one-shot has one). Landing things are category `elevator` (0.35 under Quiet); `answerRight` is `interface` and essential; `answerWrong` is `interface` and not essential; `discovery` is `music`.

Rules the cue mapper enforces, all tested:
- Clicks are rate-limited to one per 90 ms, so mashing does not stack identical sounds.
- A dispatch by the machine lights the button without a click.
- The chime only follows an arrival.
- The travel loop is stopped by deceleration, with a fade, and never outlives the arrival.
- The door motor runs only while the doors move, including a reversal.

Playback (`audio/audioEngine.ts`, voice policy in `audio/voices.ts`, pure, M8.1):
- A slot never restarts inside its `gapMs`; two slots sharing a file never start it twice within 120 ms.
- At most four one-shots sound at once. A further non-essential one is dropped; an essential one (the arrival chime, a right answer, button clicks, the completion) replaces the oldest non-essential voice. Nothing is ever queued: a late sound is worse than none.
- One player per file is made up front, more on demand (at most three per file). A loop never stops with a hard cut (a fade of at least 80 ms).
- A missing file, a player that fails to load or a `play()` that throws leaves only that slot silent. `status()` gains optional `profile`, `dropped` and `silent`.
- Browser only: nothing plays before the first gesture; one-shots asked for before it are dropped, and loops start when the gate opens (WEB_PLAYTEST.md).

Mix (`audio/mix.ts`) has five categories: interface, elevator, ambient, dialogue (unused yet) and music.
- Quiet mode removes the ambient bed, softens machinery and keeps confirmations (click, call registered, chime, overload tone, a right answer) audible: an essential slot keeps at least the interface level.
- Mute silences everything.
- Effects volume scales the interface and elevator categories. Gains are trims, never above 1.

Sound is never the only carrier of information. Every line is on screen, the indicator is visible, the panel shows lit buttons, and every right answer, miss and discovery is shown in the world.

### Sound packs, assets and licensing (M8.1, D162)

Every asset in `assets/themes/elevator-quest/audio/manifest.json` belongs to a pack, and the pack's `status` decides where its files may go (`audio/packs.ts`, the same pattern as the art):
- `approved`: required from `audio/assets.ts`, so production builds carry and play them.
- `pending`: required only from `src/devtools/audioReviewSources.ts`, which only the browser adapter `audio/activeSet.web.ts` imports, so native bundles never carry them.
- `rejected`: required from nowhere.

Both require lists are written by `node scripts/generate-elevator-audio.js --sources` from the manifest; `audio.test.ts` fails and names the command when they drift. `npm run check:bundle` fails if a native export carries a sound whose pack is not approved or lacks an approved one, and checks that the web playtest export carries the pending pack and no rejected sound (`CHECK_WEB_DIR=<dir>` checks another web export than `dist-web`).

Which set plays:
- Native (iPad, Fire): `session.ts` plays `PRODUCTION_PROFILE`, which is `PROTOTYPE_MODERN` until the generated pack is approved, then `ELEVENLABS_V1`.
- Browser playtest build: the newest pack that is not rejected by default (since D163 the approved `elevenlabs-v1`, the same as production); `?sound=placeholder` plays the placeholders, `?sound=production` exactly what a production build plays. (`?audio=quiet|muted|normal` in the developer tools is the output setting; both work together.)

Packs:
- `prototype` (approved): synthesized by `scripts/generate-elevator-audio.js` from oscillators, filters and seeded noise only, no recordings and no downloaded samples, project-original. Each entry lists purpose, duration, loop flag, source and licence, `authentic: false`, `prototype: true`, `replace: true`. The script writes only this pack's files and entries, keeps every other pack in the manifest, and reproduces the files byte for byte. They were checked as spectrograms; nobody has listened to them on a device. They are placeholders, not authentic elevator recordings, and must not be presented as such.
- `elevenlabs-v1` (approved, D163): 28 mono 16-bit WAV files at 44.1 kHz (`elevenlabs-v1/el1-*.wav`, 2.9 MB) made with ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) on 2026-10-08, four variations per prompt, one chosen per sound by measurement (duration, onset, peaks, loudness, spectrum, spectrogram), then trimmed, faded and loudness-normalized: about -20 LUFS for the chime and the completion, -21 to -24 for landing things and feedback, -26 for clicks, -26 to -27 for the door and travel loops, -36 for the machine-room bed, true peak at most -3.3 dBTP (EBU R128 integrated). Three are assembled: the chime (one strike, then the same strike four semitones lower 380 ms later), the answer-right (a soft marimba note, then four semitones up 110 ms later) and the golf putt (tap, roll, cup drop; its marks are in the manifest and tested). Each entry records the prompt, generation id, variation, settings, date, processing and measured loudness. The processing tools and the raw takes are not in the repository (the takes stay in the ElevenLabs flow). Nobody has listened to these files yet.
- Rights: ElevenLabs' page https://elevenlabs.io/sound-effects/commercial (checked 2026-10-08) says sound effects are royalty free for commercial projects on paid plans and the free plan requires attribution to elevenlabs.io. On 2026-10-08 the owner confirmed the generating account is on a paid subscription, so the pack is `approved` (D163); its `rights` text and `approvedBy` record that.
- To approve a pack: confirm the rights (the plan, or the attribution a free plan needs), ideally after a person listens to every file (the browser build plays a pending pack by default; `elevenlabs-v1` was approved on the rights alone, with no listening review recorded), writes who approved it in the pack's `rights` text, changes `"status": "pending"` to `"approved"`, and runs `node scripts/generate-elevator-audio.js --sources`. Native builds then play `ELEVENLABS_V1` with no code change.

Tests: `audio/audio.test.ts` (cue order; mute and quiet for both profiles; every slot of both profiles resolves to a manifest entry of its own pack with file, source, licence and loop flag; the require lists match the pack statuses), `audio/soundPack.test.ts` (every WAV belongs to an entry and decodes with the manifest length; peaks, edges, loop seams and loudness limits; the golf marks; the pack rules: pending now, approval is the one status line, the review default and the URL switch, rejected plays nowhere; the M8.1 slot contract; feedback and landing slots are rate-limited one-shots), `audio/voices.test.ts`, `audio/audioEngine.test.tsx` (fake expo-audio: mute and quiet, 20 taps in 200 ms start at most 3 clicks, the voice cap and the chime replacing the oldest, the browser gate, loop fades, failing files stay silent, the web adapter's default and `?sound=`).

Not checked: listening by anyone, native playback on iPad and Fire, the first sound's latency, loudness on tablet speakers, and the cost of about 30 more players on a Fire tablet once the pack is approved (Device Lab).

## Visual approach

Cel-shaded 2.5D, from the shared design system. ART_DIRECTION.md has the rules, this is what Floor 15 does:
- Tokens: `src/presentation/design/tokens.ts` (Engineer World palette roles, surfaces, states, type roles, motion with reduced equivalents, parallax, accomplishment sizes). `ui/palette.ts` maps them to the short `eq.*` names.
- Cabin (`ui/CabinScene.tsx`, geometry in `ui/cabinGeometry.ts`): segmented back-wall panels in three flat bands, cyan side light columns, ceiling light panels, an indicator in a steel bezel, a door frame lit from the key-light side, door leaves with a seam and narrow vision panels, a threshold plate, angled side walls with handrails, one maintenance label. The cabin is the same on every floor.
- Landings (M7, `content/landings.ts`, `ui/landingArt.ts`, `ui/LandingLayer.tsx`): every floor is a place, from data. Each of the 20 entries in `landings.json` picks a wall swatch, a light, a wall pattern, a sign style, a back doorway, a room silhouette, a window, up to three props and an emblem, plus a short place name (LOBBY, WORKSHOP, MACHINE ROOM, ...) and a kind: `service` for the grounded floors, `destination` for the four themed floors (7 PLATFORM HEIGHTS, 9 WIND RUINS, 13 BLOCK BUILDER, 20 ROOFTOP GOLF, D130). One renderer draws any entry from flat shapes (rects, circles, lines, polygons in door units). The place name is native text on the sign, seen through the gap between the door leaves; since M8.2 (D165, `ui/signFit.ts`) it is fitted to its plate on one line or two and never cut off (see "Production art"). The landing's light spills onto the cabin floor as the doors open. The floor number is still painted as a vector stencil. Floor 15 is dormant (dim, unlit sign) until its power is restored, then restored for good. Tests: `src/themes/content/landings.test.ts` (validity, uniqueness of wall, silhouette, emblem and name, any two floors differ in at least four features, fallback, Floor 15 states, bounds, a 90-shape budget per landing, and nothing behind the number that makes it hard to read).
- Parallax: while the car moves, the shaft wall scrolls past the vision panels and reflections slide on the side walls. Zero under Reduced Motion.
- Production art (visual production milestone, D131 to D135; `src/themes/elevator-quest/art/`, `ui/art/`): any cabin part, landing, Lifty pose or mission object can be an image from the art manifest, drawn in place of its vector and falling back to it while loading or if missing. Landings use a square canvas cover-fitted to the doorway with a safe core and reserved zones for the native number, sign and objects (`art/fit.ts`; vectors for doorway shapes outside 0.72 to 1.12). Landing layers settle by depth as the doors open; moving pieces play one reaction (touch or arrival); Floor 15 adds a power overlay per state. A landing object's touch area on the art is its own box from `landings.json` (M8); a spot without one (Floor 15's core) uses the art's `hit`. A transparent prop a spot moves (the golf ball, the toolbox lid) is drawn and moved by `ui/LandingSpots.tsx`, not by the landing art layer. An illustrated landing shows the floor number on the live sign beside the name ("15 · PRIMARY POWER", D136) instead of the big painted number; vector landings keep the painted number. The sign takes the first layout that reads at 10 pt or more (`SIGN_READABLE`), else the largest: the numbered line; the numbered sign on two lines (the number with the first word); the name alone (the indicator still shows the floor); the name on two lines (M8.2, D165, `ui/signFit.ts`). Until M8.2 it was one line held at 7 pt at the smallest and ellipsised ("7 · PLATFORM HEI…" on Fire HD 8 portrait). It never goes below 5 pt (`SIGN_MIN`); only Split View 1/3 gets there, where it can still be cut off (D152). In the browser build iPad landscape keeps the number on every floor and Fire HD 8 portrait drops it on sixteen floors (all but 1, 2, 6 and 13). Lifty's art poses (neutral, help, thinking, success, concerned, quiet) come from the director's mood via `liftyArtPose()` (D137). The cabin's twelve parts are placed by the cabin geometry; door leaves move with the doors. The illustrated cabin is all or nothing: it draws only when the backing, the three frame strips and both leaves are all present, otherwise the whole vector cabin does (D142). Lifty is drawn 98 to 136 pt square by layout, in the spare height above the 20 pt door frame (D142). Images load when their slot mounts and are cached within a byte budget; the destination's landing loads while the car travels. **Approved art**: the six required cabin pieces, the ceiling, floor and side walls, and Lifty's neutral pose (D144, D145), so production draws the illustrated cabin and Lifty in every layout; since M8.1 (D158) also Lifty's five other poses (edits of the neutral master, D147), the landing backgrounds of Floors 1, 2, 5, 6, 7, 9, 11, 13, 15 (dormant and restored), 17, 18 and 20, and the golf ball, toolbox (closed and open) and telescope props; since M8.2 (D164) the backgrounds of Floors 3, 4, 8, 10, 12, 14, 16 and 19 and the Floor 14 lamp and Floor 19 rotor props, so every floor is illustrated. Nothing is pending, so Review draws what Production draws. Mission objects and floor icons have no approved art and draw as vectors; a landing draws its vectors only as the fallback. A pose that is loading or fails to decode shows the neutral image; the backing covers the visible back wall between the side walls, ceiling and floor, and the threshold plate reuses the lintel strip. Development calibration art (`assets/dev/art/`) and overlays (doorway crop, safe zones, hit boxes) are in the developer tools. docs/ART_ASSET_SPEC.md is the art brief.
- Directory (D134, rebuilt in M8.1, D159, `ui/Directory.tsx`): the DIRECTORY plate beside the panel opens a sheet listing the twenty floors (number, emblem, name; rows are text, not buttons). The icon-row button and the placard are gone; the plate names the car's floor where it is wide enough. See "Building directory" above.
- Panel (`ui/FloorButton.tsx`, `ui/buttonLook.ts`): hardware buttons with bezel, recessed face, engraved number and lamp ring. Selected (amber lamp), current (position lamp), clue (cyan ring outside), disabled, and the serviced fade. M7.1 adds: a hall call (dashed cool-white ring outside the bezel, a CALL tab, a 0.5 Hz breath that never drops below 55% and is still under Reduced Motion), a 6 pt service dot on floors whose landing was inspected, a one-time power sweep when Floor 15 comes back (each lamp on once, bottom to top, then all fade; 1.6 s, 0.9 s and all at once under Reduced Motion), and an engraved ENGINEER RANK 1 plate in the panel header once earned.
- Landing heroes (M7.1, `ui/landingArt.ts` HERO, `ui/LandingLayer.tsx`, `ui/Hotspot.tsx`): five silhouettes have a movable part drawn in the silhouette's layer: fan blades spin, the motor wheel turns, the core cells pulse, a plan drawer slides out as a blueprint appears, the telescope tilts as a star brightens. One progress value runs on the UI thread and each part derives a rotation, a slide or an opacity from it (`heroPose`, pure and tested: returns to rest, whole turns, under 3 Hz, no movement under Reduced Motion). The touch area is the object, grown to 64 pt. M8 adds vector heroes for the lobby gear, the workshop toolbox and the platform spring (both with a new `hop` motion), the wind ruins turbine and the block builder's crane hook. With a vector box for things that are not a hero (the radio console, the tower book, the golf ball), every exploration spot works on the vector landing; spots that are not the hero react in `ui/LandingSpots.tsx` (see "Exploration").
- Lifty (`ui/Lifty.tsx`, `ui/liftyPose.ts`, `ui/liftyPlacement.ts`): compact maintenance robot drawn in Skia, six states as display glyphs and arm poses. When Lifty has nothing to say (a free ride, a quiet arrival, after a hall call is taken) the bubble goes and the figure stays (M7.1). Since M7 Lifty stands in the scene, in an eye-level band between the indicator and the door frame, with a speech bubble beside it and the help button in reach. Lifty moves within the band with the job (toward the panel for panel help, toward the shaft map for map help, above the crates or the test run), in 320 ms, instantly under Reduced Motion. The band never overlaps the panel, the indicator, the doorway, the shaft map, the cargo bay or the test-run board at the tested sizes. One exception: a cabin under 400 pt wide during cargo puts the band at the top of the cabin, over the indicator, as the cargo bay did before (DECISIONS D112). Every line said in a full headless playthrough is checked to fit its bubble (`ui/liftyPlacement.test.ts`). Since M8.1 (D160) the words are 20 to 24 pt (were 13 to 20) and fit whole at 20 pt or more in every full window tested; in split views and Slide Over a long line shows at 20 pt and scrolls with at least three lines showing and a "more below" cue. The help slot (help, NEXT JOB, LET'S COUNT, and the clipboard in a free ride) moved out of Lifty's band to the cabin's top corner (top right beside settings where there is room, else top left), so the words take the band's width; the band grows to hold a long job line (`REFERENCE_LINE`, at most `WORDS_BAND_MAX` 184 pt and 42% of a short cabin), and the doorway gives up only what the words need (Fire HD 8 landscape 243 x 232 pt, was 263 x 251). The bubble has no name tag; its tail points at him. A math job's line marks its givens (numbers and up, down, above, below; `ui/emphasis.ts`) by weight and the warm light accent while the job waits and nothing on the panel is ringed.
- Concept Rescue board (`ui/RescueBoard.tsx`, `ui/rescueLayout.ts`): one surface, cyan accent, cells at least 64 pt, vertical floors when they fit.
- Text: DISPLAY for titles, UI for labels, READING for Lifty, the board, the note, the cards and the directory (native text, accessible). Since M8.1 sizes come from text roles per window class (`ui/textRoles.ts`, `GameLayout.text`; ART_DIRECTION.md "Typography"): question 24 to 28 pt, Lifty 20 to 24, passage and choice 20 to 24, directory names 18 to 22, labels 16 to 18. A box too small for its words scrolls (`ui/ScrollMore.tsx`), never shrinks them. The mission banner (16 pt objective and step) sits in its own box left of the indicator and above Lifty (`bannerBox`).

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
- Panel buttons never drop below 64 pt. Small windows shrink the cabin instead, and a short narrow window keeps the buttons at 64 pt so the cabin keeps its room. Since M8.1 the panel leaves room for the DIRECTORY plate (Fire HD 8 landscape buttons are 64 pt, were 78; iPad unchanged at 92). `ui/readability.test.ts` checks text sizes, the plate and the directory sheet at fifteen window sizes.
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
| during free ride | free ride at Floor 15; every discovery made before the interruption is still in the log (world memory is written at the touch); open lids and an open card are not kept (session state) |
| during a reading job (M8) | the same note ("Welcome back." and the instruction); a touch job reopens at its landing with the doors open; misses and help used are kept by the engine, the note's clue mark is not (presentation) |
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
| second service call (`cued-moves`, item 2; version 2 only, version 3 has one item) | "The toolbox is 3 floors up" | steel toolbox, orange lid, tools showing | the answer floor | optional tap: loads it |
| shaft map job (`second-representation`) | "The spare parts are 4 floors down" | parts bin with gears | the answer floor | optional tap: loads it |
| beacon job (`stretch`, the beacon member) | "The beacon is on Floor 11" | short mast with the amber diamond lamp, the same mark as the shaft map's beacon | the beacon's (given) floor, for the whole job | none, recognised ("That's the beacon.") |
| beacon job | "We're 5 floors above the beacon" (the crew) | two crew members in helmets and hi-vis, a work cart with a radio | the answer floor | none, recognised ("There's the crew.") |
| route to the dock | "The loading dock is 6 floors below Floor 14" | hazard-striped dock edge and a pallet of strapped crates | the answer floor (the cargo bay then takes the view, with its own labelled crates) | none, recognised |
| cargo | crates | the cargo bay's crates now carry straps and CABLE / PARTS / BOLTS stencils | cargo bay | as before |
| two-part trip (`two-moves`, D148) | "The spare parts are waiting there" | parts bin with gears | the answer floor | optional tap: loads it |
| where did they get on (`start-unknown`) | "They left their toolbox where they got on" | steel toolbox | the answer floor | optional tap: loads it |
| trip meter (`compare-distance`, the meter members) | "The crew is on Floor 6" | the crew and their cart | the crew's floor, after the right count rides there (the floor itself is a given; the beacon marks it on the shaft map) | none, recognised |
| express (`number-sense`, the express member) | "The repair kit is at stop 3" | repair kit | the answer floor | optional tap: loads it |
| lamp check (`number-sense`, M8) | "One lamp is out, and the crew is there" | the crew and their cart | the answer floor | none, recognised |
| ten-floor express (`number-sense`; `stretch` going down, M8) | "The toolbox is there" | steel toolbox | the answer floor | optional tap: loads it |
| calls in order (`compare-distance`, M8) | "The crew is there" | the crew and their cart | the answer floor | none, recognised |
| stretch members (M8) | the far start, the wide two-part trip, 10 to 12 floors up | toolbox, parts bin, repair kit | the answer floor | optional tap: loads it |
| two orders (`two-groups`) | crates | the cargo bay, with the order plate | cargo bay | none: the bay is the job |
| finale | power on Floor 15 | the landing's core, dormant then restored and waking | Floor 15 | as before (in-world completion) |

- Pool steps (M8): an objective may name the `activities` it is for, so each math pool member brings its own object.
- A destination object is placed when the car stops, only if the locked answer checked correct (`runtime.check`, the same check that decides feedback). It never appears before the answer, so it cannot show the way, and it never appears at a wrong floor.
- Session state only (`view.props`): no table, no world memory, no evidence. Floor 15's restored power stays the one durable world state.
- Accessibility: every object has a label; a collectable one is a button ("Load the repair kit into the lift") with a 64 pt target and screen-reader activation.

## Exploration and landing play (M7.1, rewritten for M8, updated in M8.1 and M8.2)

The free ride after Floor 15 is the exploration toy. Since M8 the same landing things also react between jobs and are the answers of read-and-touch jobs: one framework, not two (D156). GAME_DESIGN.md has the design; this is how it works.

- Objects: a landing may name `objects` in `landings.json` (1 to 6): `id` (canonical, shared with the art and the reading items), `name` (for screen readers and cards), `box` (where it is in the landing art, in canvas fractions inside the safe core: the space of the art manifest's `hit`), `provisional` (measured on a draft or not yet; replaced when the final art is measured), and `vector` (a box in door units on the vector landing, or `hero`, the vector hero part).
- Spots: `explore` (1 to 3 per landing). Each spot has an `id`, a `target` object, a `reaction` (`spin`, `tilt`, `bounce`, `lower`, `glow`, `lights`, `open`, `putt`, and `slide` since M8.1), a discovery key `eq.discovery.floor-<n>[...]` (with `legacy` keys for a place that moved, D130), the thing's name (`object`), Lifty's first-touch `line` and the log `fact`. Optional: `prop` and `openProp` (art manifest ids of transparent layers the reaction moves), `disc`, `turns` and `linked` (round parts of the art that turn, a gear train), `hoist` (rope, load and drop for `lower`), `to` and `cup` (where a putt goes), `flag` (the putt's flag strip, M8.1), `slide` (a drawer's strip, M8.1), `sound` and `closeSound` (its sound slots, M8.1), `card` (a short readable card) and `action` / `closeAction` (what a touch does, for screen readers). CONTENT_MODEL.md lists the validator's checks.

| Floor | Objects | What a touch does |
|---|---|---|
| 1 LOBBY | gear, desk, plant, bench | the big gear in its case turns once |
| 2 WORKSHOP | toolbox, drill, workbench | the toolbox opens; the next touch shuts it |
| 3 UTILITY (M8.2) | valve, gauge, robot | the valve wheel turns once as a disc of the art, and the gauge face is linked so its needle sweeps once; the toy robot bounces |
| 4 STORAGE (M8.2) | hose, bins, shelves | the hose reel turns once (the whole reel is a disc of the art); the left storage bin slides out and back (`slide`) |
| 5 VENTILATION | fan-west, fan-east, switch | the west fan's blades turn twice |
| 6 MACHINE ROOM | gear-big, gear-small, motor | the gear train turns (big gear and linked small gears) |
| 7 PLATFORM HEIGHTS | platform-orange, platform-teal, platform-yellow, spring | the spring bounces |
| 8 TEST LAB (M8.2) | flasks, monitor, lamp | the five flasks light up (`lights`, its five lamps on the five painted flasks); the monitor glows. The floor lamp has no spot |
| 9 WIND RUINS | windmill, banner, bridge | the windmill's hub turns twice (a disc of the art, M8.1; it only glowed before). The sails cannot turn without a transparent blades prop, since a disc that big would turn the tower top too; at iPad size the hub's turn is small and easy to miss, and a blades prop (`landing.9.blades`) is a possible follow-up, not made |
| 10 RELAY ROOM (M8.2) | relays, dial, monitor | the relay lamps come on (`lights`; the box spans five painted lamps, so the five drawn lamps fall on them); the big dial turns once as a disc |
| 11 COMMUNICATIONS | radio, printer, dish | the radio console's lamps come on one by one, then go out together |
| 12 ENGINEERING BAY (M8.2) | gantry, wheel, toolboard, trolley | the gantry crane's hook lowers (`lower`, a drop of 0.08 of the canvas) and rises; the pulley wheel turns once as a disc (an edit painted a plain navy plate behind its spokes) |
| 13 BLOCK BUILDER | crane, blocks, cart | the crane lowers its block and raises it again (M8.1: its box widened to take in the counterweight, still clear of the blocks; M8.2: widened again to the jib tip, so the lowered block is inside the crane's box, `ref.hoist`; it now overlaps the blocks, which, smaller, stay in front during a read-and-touch job) |
| 14 HIGH SERVICE (M8.2) | lamp, ladder, cones | the hanging lamp swings (`tilt`, its prop `landing.14.lamp` about the top of its chain) |
| 15 PRIMARY POWER | core, gauge-left, gauge-right | the core glows (restored only; the dormant core never reacts) |
| 16 HYDROPONICS (M8.2) | grow-lights, plants | the five grow lamps come on (`lights`, on the five painted lamps); the row of plants springs up and settles (`bounce`) |
| 17 ARCHIVE | book, drawers, map | the plan cabinet's middle drawer slides out toward you and back (`slide`, M8.1; it only glowed before); the tower book opens a short card ("The Tower Book", closed with "Close the book") |
| 18 OBSERVATORY | telescope, chart, crank | the telescope tilts and returns |
| 19 SKY BRIDGE (M8.2) | turbine, door | the far tower door glows (the first spot, so Lifty's arrival hint names it); the turbine's rotor spins twice (its prop `landing.19.rotor`). The door comes first because the rotor is about 30 pt across on iPad landscape and under 20 pt on Fire HD 8 portrait, too small for its spin to read |
| 20 ROOFTOP GOLF | ball, hole, windmill | the ball putts into the hole |

- What a touch moves is part of the thing touched (M8.2, D164): a hoist's rope and its load, lowered too, and a turning disc's centre sit inside the target object's box (`validateLandings`: `ref.hoist`, `ref.disc`), so the motion always shows inside the thing's own touch area. The walkthrough found the Floor 13 crane breaking it (the block lowered beside the crane's box, and a touch there showed nothing inside it).
- Touch modes (`director/landingTouch.ts`, pure). `touchMode(view)` says what a touch on the open landing does now, and `touchTargets(view)` lists what it reaches, with labels, smaller things in front. The screen draws its hotspots from it and the director checks every touch against it (`touchObject(objectId)`; `inspect(spotId)` stays for scenarios), so the two always agree.
  - `explore`: free ride. Every touch plays the reaction; the first touch of a spot is a discovery (`runtime.remember`) and Lifty says its line; a card opens.
  - `quiet` (widened in M8.1, D161): the mission is on and its answer is not on this landing. `QUIET_STAGES` is call, task, cargo, pause and success (every success phase, arrival to review): a hall call waiting, a math job on the panel, shaft map, trip meter or cargo bay, a ride or card reading job with its note folded, a miss's pause, the success up to NEXT JOB; also any landing while a touch job waits on another floor. The thing reacts and plays its own sound, and that is all: no discovery, no Lifty line, no world memory, never an answer, never evidence.
  - `answer`: a read-and-touch job made some objects of this landing its answer targets (`setAnswerTargets`). Only those options can be touched there; a touch goes to the job, which checks its own answer window, and the touched thing plays its reaction as the consequence, right or wrong (never a discovery). On the Floor 20 reading job (check-the-hole) the ball is an option, so it putts only as that consequence, never as play.
  - Nothing reacts (no hotspot at all) with the doors moving or shut, behind the Engineer Log or the Archive card, with a reading job's note open over the landing (`TouchState.reading.open`, new in M8.1), at the dormant Floor 15, or in the intro, a correction board (`rescue`), the finale, the completion, a reposition, a ride, loading or an error.
  - Why it changed (the Floor 20 golf failure in the playtest): until M8.1 `touchMode()` returned null whenever a job waited (`task`, `cargo`, `pause`, the success before NEXT JOB), so no hotspot was drawn and a tap landed on the bare canvas. Floor 20 is where a job waits more than anywhere: every "calls going down" job (`orderPositions`, `director/jobs.ts`) parks the car there with the doors open ("Calls on Floors 7 and 14. Going down from Floor 20, which do we reach second?"). The unit tests touched things in free ride only, so they missed it. A screenshot that showed no ball was a separate tools fault: `golf-rolling` said READY 650 ms after the touch and the capture came 600 ms later, in the calm pause when the ball is in the hole (drawn at opacity 0). There is no duplicate ball: the approved background paints none, the prop is the only one.
- Reactions: 1.2 s (0.9 s under Reduced Motion); the putt 3.6 s (1.85 s); the toolbox lid 0.45 s (0.12 s). Each spot has its own running reaction: a touch on it meanwhile is ignored, so rapid taps cannot restart a motion or make a light flicker; another spot may react at the same time. Since M8.1 each reaction plays its spot's own sound (`sound`, and `closeSound` when a thing shuts; `landingReaction` when it has none; see "Sound"). When the car departs, the reaction, open lids and any card are cleared (the landing tidies itself).
- Drawing (`ui/LandingSpots.tsx`, motion curves in `ui/landingReactions.ts`, pure and tested). On the art, a spot's own prop moves when it has one; a round thing without one turns as a disc of the art, a spring stretches up from its base, a crane's rope pays out, a drawer slides out (M8.1: its strip of the art grows about its centre by up to 30%, `SLIDE_GROW`, sits at most half its growth lower, with a dark band under it as its shadow; a still glow under Reduced Motion), the golf flag flutters; each covers the painted original, so nothing ghosts. A reaction that cannot be drawn (a prop missing or failed to decode, a part the vector landing does not have) glows instead. On the vector landing the hero part reacts in `ui/LandingLayer.tsx`. Every reaction starts and ends at rest and never loops. Reduced Motion: nothing turns, tilts, bounces or lowers; the glow and the lamps hold their peak still while the reaction runs; the lid changes state at once; the putt is a short straight move to the cup, the ring held still, then the ball is back.
- The putt: the ball rolls to the hole on a gentle curve (slowing), drops in, the cup answers with one soft ring, the ball waits in the hole, then is back at rest by itself, ready to putt again. No score, no strokes, nothing counted. Timing (`PUTT_MS`): roll 1300 ms, drop 250, rest 1600, back 450; Reduced Motion roll 250, rest 1600. Since M8.1 (D161): the drawn ball's radius is at least 6 pt (`MIN_BALL_R`) where the doorway has room for it (3% of the art's placement width, half the vector box), so on Fire HD 8 portrait it went from about 8 px to 12 px across (iPad landscape unchanged); the flag answers as the ball drops in: its strip of the art (`flag` in `landings.json`, left edge on the pole) stretches out from the pole by up to 15% (`FLAG_STRETCH`) in two soft flaps over 700 ms, only ever stretching so the painted flag never shows, and stays still under Reduced Motion. Measured in an instrumented copy in headless Chromium: tap at 22 ms, the animation started at 37 ms, the first moved frame at 74 ms, so about 50 ms from tap to motion in the page (not measured on a device).
- Touch areas (`ui/touchAreas.ts`, pure): a thing's area is its box on the art (the art's `hit` for a hero without a box), else its vector place; it grows to at least 64 pt where the window has room, inside the doorway, its frame and the floor below it, clear of the shaft map's column. Exploring, two things never share a touch: an area that would overlap a neighbour's moves to one side of its thing (still on it), and only in a doorway too small for both is one left out (the one not yet found is offered) and a collectable mission object keeps its own touch; answer targets are all kept, moved apart the same way where they can be. `Hotspot.tsx` draws the ring (at least 40 pt around something small) and the check; an answer target never shows a check.
- Memory: `runtime.remember(learnerId, key)` writes one row per learner and key into `world_memory` (schema v4, append-only, `INSERT OR IGNORE`); `runtime.memories(learnerId)` reads them. The director loads them at start and writes at the first touch. Nothing in the learning processor, progression, unlocks or the value model reads this table. The DOOR CLOSE tip uses the same store (`eq.tip.door-close`).
- Engineer Log: one row per explorable floor (twelve in M8; every floor, twenty, since M8.2). A row reads INSPECTED once any of its spots is found and shows the first fact found. `openLog` / `closeLog` (free ride, after the clipboard is earned).
- Free ride: departures clear Lifty's line; an arrival at a floor with something still to find gets "Try tapping the ..." (the first thing not yet found) after 0.9 s (0.3 s under Reduced Motion).
- Hall calls: `stage: 'call'` with `view.hallCall`. The panel is enabled with every other floor disabled; the press lights the call, locks the panel and rides at normal timing. Rides back from a test run stay automatic at the auto-ride pace. The headless harness presses hall calls itself unless `autoHallCalls: false`.
- Tests: `director/landingTouch.test.ts` (the modes, since M8.1 quiet whenever the mission is on and its answer is elsewhere, and nothing under an open note; a job waiting at the rooftop lets the ball be putted quietly; every thing on every landing is world play only, with no attempt, mastery or progress; the putt, the toolbox, the book card, quiet touches between jobs and during a job, answer targets, rapid taps, the arrival hint, the developer previews), `ui/landingReactions.test.ts` (M8.1: the ball leaves at once, the flag's two flaps, the drawer slide, every spot's sound a real slot and only an opening thing a closing one, drawers and flags on their thing inside the safe core), `ui/touchAreas.test.ts` (every spot full size at fifteen window sizes, clear of the panel, help button, Lifty, his words, the shaft map, the icon row and the placard, since M8.1 the DIRECTORY plate's box), `ui/LandingSpots.test.tsx` (M8.1: the ball a full-size touch during a job on the art and on the vector landing, no hotspot when no touch is offered, the flag, drawer and windmill hub drawn as copies of the art over their originals), `themes/content/landings.test.ts` and `exploration.test.ts` (content and validation; since M8.2 the explorable floors come from the catalog, every illustrated floor must have something to touch, and the hoist and disc rule is tested), `ui/signFit.test.ts` (M8.2: every floor's sign whole and inside its plate at six doorway sizes), `director/exploration.test.ts` (hall calls, quiet rides, in-world completion, persistence, learner isolation, the log, the tip), `runtime/worldMemory.test.ts`, a crash case in `runtime/crashRecovery.test.ts`, `persistence/migrations.test.ts` (v3 to v4).

## Renderer status

Renderer acceptance is **provisional**. No physical Device Lab run is recorded (DEVICE_LAB.md has only the empty run-log template). What has been checked:
- Jest tests and a headless runtime in Node
- production `expo export` bundles for Android and iOS
- a throwaway web build in a scratch copy, screenshotted in headless Chromium at several window sizes, to catch layout mistakes (M5: landscape 1180 x 820, portrait 820 x 1180, a narrow 504 x 820 window and Reduced Motion, through the whole mission including a Concept Rescue)
- the browser playtest build (M6, M7, M7.1): `npm run web:screenshots` captures of landings, Lifty contexts, replays, cargo, the Concept Rescue, the in-world completion, the explorable landings (before, reacting, inspected), the Engineer Log and hall calls at iPad, Fire HD 8 and Split View sizes (WEB_PLAYTEST.md)
- M8.1: the art audit's own web export (production art on every illustrated floor, D158), Chromium captures of the directory, the text roles and the reading note at several sizes, and a Chromium run of the sound pack (only generated files played by default, only placeholders with `?sound=placeholder`, every played file decoded, no request left the local server); `npm run web:e2e` check "rooftop golf during a job" (finds the drawn ball by its pixels, taps it and follows it in the screencast; it fails against the M8 build, where the ball never moved, and passes against M8.1), and mid-motion captures of every spot (`m81-*`, WEB_PLAYTEST.md)
- M8.2: the `npm run web:e2e` walkthrough rode a fresh test learner's free ride to every floor (`E2E_FLOORS=all`) on the integrator's export and passed: every landing drawn from production art (its doorway 340 to 1039 colours; the eight vector landings it replaced measured 43 to 100 before their art), its own sign, every one of the 28 spots changing pixels in its touch area 81 to 180 ms after the press in headless software-rendered Chromium, and nothing recorded (the Floor 14 lamp's Lifty line was reworded after that run; nothing else in the landing data changed). Contact sheets (`node scripts/floor-contact-sheet.js`) of every floor on iPad landscape and Fire HD 8 portrait, and a sample with Reduced Motion and in Split View 1/3 (where every sampled sign is cut off, D152)

None of that says anything about frame rate, touch latency or audio latency on a Fire HD 8. Rendering is isolated in `ui/`: the simulation, director, audio cues and layout are framework-free, so scene cost can be cut or the renderer replaced without touching game logic.
