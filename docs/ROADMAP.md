# Roadmap

Build vertically. Each milestone ends with something a child can touch, or a measured answer to a technical risk. Test with the children at every milestone from M4 on.

## Current phase

M8.1 built in software (D158 to D162): the art set approved, the building directory, readable words, landing play during jobs, and a generated sound pack for review.
- Art: the owner's instruction approved every pending file after an agent audit (D158): Lifty's five other poses, twelve illustrated landings (1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20) and the moving props. A production build now draws all of them; the other eight floors, the mission objects and the floor icons stay vector, and every vector stays the fallback.
- The building directory (D159): a DIRECTORY control beside the panel opens every floor by number, emblem and name. Using it is part of the job, never help or evidence; Lifty introduces it once per learner. Every reading ride is answerable from its note plus the directory, each reading CLUE says a strategy, and the bold words of a note never give the answer away.
- Readability (D160): text roles with minimum sizes (the instruction biggest, Lifty's words 20 to 24 pt, nothing a child reads under 16 pt), words that scroll instead of shrinking, the help slot moved to the cabin's corner.
- Landing play during jobs (D161): while a job waits with its answer on another floor, the landing's things react quietly (reaction and sound only), so the rooftop golf ball now putts during a job; before, nothing on a landing could be touched while a job waited. The drawn ball is at least 6 pt, the flag flutters as the ball drops, the Archive's plan drawer slides out, the windmill's hub turns (a blades prop would read better; not made).
- Sound (D162): a generated pack (ElevenLabs) with a sound for every landing thing, a right answer, a gentle miss and a discovery. Its rights are pending, so native builds keep the synthesized placeholders; the browser playtest build plays it (`?sound=placeholder` for the old set). Approval is one status line.
- Remaining: a person listens to the sound pack and confirms its rights; the observed playtest (does the learner use the DIRECTORY, can they read Lifty and the note, does landing play during a job help or distract); the Fire tablet measures decode time and memory now that twelve landings ship.

M8 built in software: a richer tower (D154 to D157). The owner's goal: ride, discover, touch, read or reason, operate, see the reaction, keep exploring; more academic variety and more to do when the doors open, not a bigger worksheet.
- Math: pack composition and mission pools in the engine; mission version 3 with fourteen jobs a run (ten math, four reading); 21 new math activities (skip counting from any start, a ten and some ones, comparing and ordering, through ten, doubles and near doubles, same-way two-part trips, bigger stretch jobs), about 39% review, 47% second grade and 14% stretch per run; a regeneration never brings back the item it replaces.
- Language Arts: 31 authored reading jobs in six `ela.*` skills. The learner reads a short note and acts on it: touches a thing on a landing, rides to a floor, or picks a card. CLUE lights the key sentence, SHOW ME shows the answer, a second miss brings a fresh note.
- Landing play: twelve floors with something to touch (golf putt, toolbox, a fan, gears, spring, windmill, radio, crane, core, archive book, telescope), one reaction vocabulary, quiet reactions between jobs, the same objects as reading answers. World state only.
- Art: six more illustrated landings (2, 5, 6, 11, 17, 18) and the moving props, pending the owner's review in M8 (approved in M8.1, D158).
- Remaining: the observed playtest decides whether reading jobs and landing play hold the learner and whether fourteen jobs is too long; the Fire tablet measures decode time and memory. (The art review was done in M8.1.)

M7 built in software: Floor 15 stabilized so playtest evidence can be trusted, and made more engaging.
- Reliability: answers only from explicit answer windows (the arrival-window race is fixed), abandoned runs when content changes under them (schema v3), a learning-event evolution point, a clear TRY AGAIN instead of a stuck save, the OS reduce-motion default, frame callbacks only during travel, theme-neutral developer seeding, and a crash matrix on the real Floor 15 content.
- Experience: 20 data-driven landing identities with Floor 15 dormant until restored, Lifty in the scene at eye level and moving with the job, a help cue that shows on Fire, and the success replay (one honest way to the answer, drawn on the shaft map).

M7.1 built in software (the fun and exploration pass): the building is the game after Floor 15.
- Free-ride exploration on five floors (5, 7, 15, 17, 18): touch the object, it reacts, Lifty says one line, the discovery is remembered per learner (world memory, schema v4, never learning evidence).
- The Engineer Log clipboard, hall calls between jobs instead of automatic dispatch rides, an in-world completion with no card (restoration, panel sweep, rank plate, then free ride), quieter routine rides, and a once-per-learner DOOR CLOSE tip.
- Documented only, not built: Dark Tower restoration, Teach Lifty, Engineer Tools (GAME_DESIGN.md).

Correction round after M7.1 (built in software): success reinforcement is child-paced (NEXT JOB, no timed advance), the things jobs name stand on the landings (repair kit, toolbox, spare parts, crew, beacon, loading dock; absent at a wrong floor), labelled cargo crates, and less talk around a success. Concept art for a painted look was received; the decisions are recorded (D126 to D129): it is the visual target, the tower is mixed (special floors 7, 9, 13, 20), the numbered panel stays with a directory beside it, Lifty may hover very subtly. Nothing of it is built except the NEXT JOB styling.

Wider math in Floor 15 (built in software, D148): eleven jobs per run instead of six: two-part trips, where did it start, the trip meter (how far apart), two orders in the cargo bay, and the express (equal jumps of 2, 3 or 5, the first multiplication). Remaining: the playtest decides whether the longer run holds the child.

Corrections and illustrated landings (built in software, D149 and D150): a practice miss shows its consequence, a LET'S COUNT board works through the learner's own job, and a fresh job follows that the report tracks (right first try without help, or not). Landing backgrounds for Floors 1, 7, 9, 13, 15 (dormant and restored) and 20 were pending the owner's review (approved in M8.1, D158). Remaining: the playtest decides whether the correction lands (does the fresh job go right?), the owner reviews the six landings, and a Fire tablet measures decode time and memory before more floors get art.

Visual production milestone (built in software; **first production art approved**: the illustrated cabin and Lifty's neutral pose, D144, D145; landings, objects and the other Lifty poses were still vectors then; since M8.1 twelve landings and every pose are approved, D158): the mixed tower (7 PLATFORM HEIGHTS, 9 WIND RUINS, 13 BLOCK BUILDER, 20 ROOFTOP GOLF; the Machine Room moved to 6 with its old discovery key kept, D130), the art pipeline (a typed manifest and a separate rights record, approved-only production art, vectors as fallback and interaction geometry, D131), composition rules (safe core, reserved zones for native text, D132), Lifty's hover (D133), the building directory and the cel lip on door and help buttons (D134), on-demand loading with a small byte-budgeted cache (D135), development calibration art and overlays in the developer tools, and docs/ART_ASSET_SPEC.md for whoever makes the art.

Next for art: supply the 36 proof-floor files in the order ART_ASSET_SPEC.md gives (cabin, Lifty, 15, 9, 20, 13, 7, objects), review them, approve them in rights.json, and check them in the browser build. Then the Fire hardware gate measures decoded memory and frame pacing with the art before any other floor gets art. Since M8.1 (D158) twelve landings and all six Lifty poses are approved and ship before that gate ran, so the gate is overdue: run it with the production art. Do not start Mission 2 inside this.

M6 (browser playtest build) and M5 (cel-shaded Floor 15, Concept Rescue, theme text as data) are unchanged in purpose.

Not done yet:
- the physical device runs (M1 Device Lab plus the Floor 15 checks, [DEVICE_LAB.md](DEVICE_LAB.md)), Fire first
- the first child playtest ([PLAYTEST.md](PLAYTEST.md)), including the Floor Identity, Lifty and Success Replay observations, the M7.1 free-ride, hall-call, completion and DOOR CLOSE observations, and the M8 reading-job and landing-play observations, and the M8.1 directory, readability, landing-play-during-jobs and sound observations
- listening to the generated sound pack and confirming its rights (D162)

Renderer acceptance stays provisional until those runs happen. Native builds play the synthesized placeholder sounds; the browser playtest build plays the generated pack, which is pending rights review (D162). The browser build is a development target and decides nothing about device performance.

## First playable vertical slice: "Floor 15" (Elevator Quest, M4)

Why Elevator Quest (learner-engineer) first:
- Math in an elevator gives unambiguous, generatable items and a direct world consequence (the car moves). The fastest path to proving "learning action does something".
- It exercises the hardest engine pieces early: parameterized generation, misconception-tagged distractors, assistance tracking, the no-easier-on-failure policy, and mastery evidence.
- No dependency on handwriting, phonics audio, or a large narration library, which the Magic Tower slice needs on day one.
- The archetype's access requirements (quiet mode, reduced motion, no required speech) ship in the slice, which also proves the access layer early.

The Magic Tower slice follows (M10) so the theme-pack boundary is proven by a second real consumer before it hardens.

Slice contents:
- One learner profile (learner-engineer archetype), no profile picker yet beyond a stub.
- One environment: a lobby plus one elevator car and its panel, layered 2.5D, both 16:10 and 4:3.
- One mission, "Service Call": 4 beats.
  1. Practice: the car is on Floor 3 and must go up 6 floors to reach the technician. Press the right button. (`math.add.within20`, cued)
  2. Practice: the lab is 5 floors below Floor 14. Take the car there. (`math.sub.within20`, cued)
  3. Stretch: work order says "Deliver parts to the floor 7 above the one where the robot is." Robot is shown on the floor indicator. Two-step, operation not named. (`math.add.within20`, uncued)
  4. Mini encounter: capacity. The car holds 10 crates and 16 crates wait on the dock. Load the first trip, then work out how many are left for the second. (addition, subtraction, comparison, uncued)
- Hint and persistence: wrong press moves the car to the wrong floor and shows where it stopped. The slice's arithmetic scaffolding policy (data, not engine code) offers: retry, then an optional clue (floor strip with arrows), then a number-line representation, then guided steps. Each attempt records its assistance evidence. Never an easier item.
- One meaningful in-game reward: repaired panel faceplate (cosmetic) plus Engineer Rank 1 badge, shown on the hub elevator.
- Progress recording: attempts, assistance levels, skill evidence, mission completion, in SQLite, surviving app kill mid-mission.
- Settings: quiet mode, volume, reduced motion, skip animations.
- Dev-only: a debug panel showing skill evidence and state, so we can see the model working during playtests.

Explicitly not in the slice: Quest Tokens UI, Parent Mode, Magic Tower, handwriting, narration library, spaced review scheduler, encounter multi-session persistence.

Success criteria:
- The learner plays the mission start to finish without adult explanation.
- The learner hits the stretch beat, fails at least once, and succeeds without a demonstrated answer.
- Tap-to-response under 100 ms and steady animation on the target Fire tablet.
- Force-quit during beat 3 resumes at beat 3 with all prior attempts saved.

As built in M4 (details in [ELEVATOR_QUEST.md](ELEVATOR_QUEST.md)), differences from the plan above:
- Six steps instead of four beats: wake the lift, two cued service calls, the shaft map, the beacon stretch, the cargo-bay encounter, and the finale ride to Floor 15.
- Values are generated per play, not fixed: "Floor 3, up 6" is one possible item.
- The capacity encounter has two stages: route to the dock, then load to capacity (weighed on DOOR CLOSE).
- Help follows the core pack's policy (data): point at the givens after 2 misses, the shaft map as a number line after 3, how to count after 4, a Concept Rescue at 5 (M5), show the answer after 7, a new variant after 8. The next step can always be asked for early.
- The debug panel is the developer playtest report.

## Milestones

| # | Milestone | Proves |
|---|---|---|
| M0 | Foundation docs (done) | shared understanding |
| M1 | Device Lab (built, see DEVICE_LAB.md): Skia scene, touch, drag, drawing, audio, SQLite, diagnostics. Remaining: run the physical checklist on a Fire HD 8 and an iPad, record results, set per-scene texture and loudness budgets. | the stack survives the performance floor |
| M2 | Done. Engine core in pure TS: skill graph, evidence and assistance, mastery level + dimensions, spaced review, exposure classes, progression-value events, eligibility, 3 deterministic generators with misconception tags, scaffolding policies as data, content validator with budgets. 85 engine tests including property tests. No UI, no persistence wiring. | the learning model is correct and testable |
| M3 | Done. Non-rendering runtime: mission schema and pure runtime, presentation intents, deterministic seeds and resume, scaffolding at runtime, progression upgrades (best tier per opportunity), game-progress signals, SQLite schema v1 with migrations, one transaction per command, idempotent retries, rebuildable derived cache, crash-injection tests, headless full-flow and literacy tests, fake presentation adapters, Node benchmark. No UI, no token ledger. | the engine runs a real mission end to end and survives restarts |
| M4 | Built in software. "Floor 15" slice on the M3 runtime: 20-floor panel as the answer interface, wrong floors ride there, shaft map, beacon stretch, cargo-bay encounter, completion with unlocks, reduced motion, quiet/mute, playtest report. Remaining: physical runs and the first child playtest. | the core philosophy works with a real child |
| M5 | Built in software. Floor 15 visual system and cel-shaded art pass, progressive help without gaps, Concept Rescue, theme text as data, world catalog (non-playable), learner-scoped runtime, explicit placement, auto-ride pacing. Remaining: physical runs and the first observed playtest, then tuning from what the child does. | it is fun, not just correct |
| M6 | Built in software. Browser playtest build: web persistence adapter, developer tools (viewport simulator, test learners, jumps, Concept Rescue inspection, resets), screenshots, static export, cargo touch-target fix. | the slice is fast to play, inspect and review |
| M7 | Built in software. Stabilization and experience: answer windows (arrival race fixed), content-change and save-failure recovery, event evolution, Fire-visible help cue, OS reduce-motion default, frame callbacks only while moving, 20 data-driven landings with Floor 15 dormant/restored, Lifty in the scene, success replay. Remaining: device runs (Fire first) and the first observed playtest. | playtest evidence can be trusted, and the slice is engaging |
| M7.1 | Built in software. Fun and exploration pass: five touchable landings with one reaction each, world memory (schema v4), the Engineer Log, hall calls, in-world completion without a card, quiet routine rides, the DOOR CLOSE tip. Remaining: the observed playtest decides whether free ride holds a child after Floor 15. | there is a reason to keep playing after the mission |
| M8 | Built in software. A richer tower: pack composition (a reading pack beside core), mission pools, mission version 3 (ten math jobs from pools, four reading jobs), 21 new math activities, authored reading jobs answered by touching a landing thing, riding or picking a card, landing objects and one interaction framework on twelve floors, six more landing backgrounds and props pending review. Remaining: the observed playtest, the owner's art review, device runs. | more variety and more to do, not a bigger worksheet |
| M8.1 | Built in software. The pending art approved by the owner's instruction after an agent audit; the building directory (a DIRECTORY control, a one-time introduction, rides answerable from the note plus the directory, strategy clues, validated emphasis); text roles and minimum sizes; landing things that react while a job waits elsewhere and the golf fix; a generated sound pack pending rights. Remaining: listening and the rights check, the observed playtest, device runs. | every job answerable, readable and alive |
| M9 | Theme-pack boundary + profile picker + per-learner settings. Second Elevator Quest mission reusing templates. | content is data, not code |
| M10 | Magic Tower slice: one Magic Tower floor, letter-tile word building (CVC), beginning sounds with narration, simple tracing on a Skia drawing surface. | the engine powers a different game |
| M11 | Quest Token ledger + Parent Mode v1 (gate, reward catalog, redemption approvals, basic skill view) + JSON backup export | real-world rewards are trustworthy |
| M12 | First full arc per child ending in a Mastery Encounter set piece, spaced review, struggle signals | the challenge philosophy at full strength |

Store submission planning (privacy labels, Kids Category, Amazon Appstore listing) starts after M12. Milestone numbers changed in D103, D114 and D154 (DECISIONS.md); older decisions name the numbers of their time.

## Future presentations (documented, not scheduled)

Elevator Quest is one presentation of the shared learning engine. Skills, evidence, mastery and the response policy live in the engine and runtime; a presentation only draws the challenge and the learner's answer. Later presentations reuse the same engine. None is built or scheduled, and none starts unless the owner asks.

- Illustrated Challenge: standardized-test-style question formats set in comic or cel-shaded illustrated scenes.
- Skill Games: correct reasoning earns or enables an action the learner then performs. Golf: the challenge enables the shot, then the learner aims and hits. Bowling: a challenge enables the roll, and the pin state shows the arithmetic.

Theme code never scores (CLAUDE.md), so in a Skill Game the shot or roll is presentation: the reasoning is the evidence, and a missed putt records nothing about the skill.
