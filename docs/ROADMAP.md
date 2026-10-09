# Roadmap

Build vertically. Each milestone ends with something a child can touch, or a measured answer to a technical risk. Test with the children at every milestone from M4 on.

## Current phase

M9.1 built in software, verified in the browser and in Node only (D171 to D178): stabilization, performance and storage after an independent audit. No new features, no new content, no schema or engine change.
- Safety of the shared repository: the tracked settings allow only read-only MCP tools (D171).
- Correctness: mini-game resume keyed to the runtime checkpoint (Cargo's half-loaded deliveries survive leaving, Word Golf never skips a hole after a crash, a game finished during its last putt or freight run reopens, a wrong WEIGH is never counted twice), with real-runtime resume tests that failed 9 of 9 before the fix (D172).
- Storage: the derived learner cache is written when due, not on every command, with cache plus tail proven equal to a full replay over a synthetic year (D173).
- Memory and rendering (browser): reference-counted art images and a web-only release of the Skia memory react-native-skia 2.6.2 keeps (D174); Cargo paths through PathBuilder and a Word Golf drag that redraws only the aim line and the meter (D175).
- Tooling: the test harness closes its databases before deleting temp directories, npm scripts set environment variables on any shell (D176); browser soaks and timings (`scripts/perf-*.js`) and the persistence benchmark (`scripts/bench-persistence.js`, `scripts/bench-idb.js`).
- Bundle: placeholder sounds development-only, slim runtime manifests, the cabin as lossless WebP (D177); unused mini-game code removed (D178).
- Not done: no run on an iPad or a Fire tablet (DEVICE_LAB.md section H: WebP decoding, memory over rides natively, drag responsiveness, mini-game resume); Windows not checked; the production sounds stay uncompressed WAV until the owner listens to the AAC comparison (loops may gap at the seam); the browser still saves the whole database image on every commit (an open cost at long histories); the directory's open frame in the browser (150 to 220 ms in headless Chromium) is unchanged.

### M9.1 report (measured numbers, from the commits)

Development machine only: Node (V8, node:sqlite, sql.js) and headless or desktop Chromium. None of these is a tablet number.

| Area | Before | After | Source |
|---|---|---|---|
| Characters written per submit at month 12 | 205,697 | 2,960 | `bench-persistence.js`, e9b3d4b |
| Derived cache writes per play day | 28 | 4 | same |
| node:sqlite submit p50 at month 12 | 3.74 ms | 1.51 ms | same |
| sql.js submit p50 at month 12 | 8.32 ms | 4.83 ms | same |
| WebAssembly heap at rides 0 / 50 / 100 | 128 / 265 / 382 MB | 128 / 128 / 128 MB | `perf-rides.js`, 8f08bdf |
| Live WebGL contexts after 50 Word Golf rounds | 257 | 3 | `perf-games.js`, 8f08bdf |
| Detached DOM nodes after 50 Word Golf rounds | 20,330 | 87 | same |
| Word Golf renders per drag move | 115 | 30 | 63f7d6d |
| Word Golf main-thread time, 60-move drag (aim / power) | 1240 / 1441 ms | 964 / 967 ms | same |
| Native production export, Android / iOS | 17,155,497 / 17,148,393 B | 15,702,748 / 15,695,573 B | 805a46e + bb2281a vs a4223b8 |
| Web playtest export (dev flags) | 24,771,558 B | 24,015,898 B | 8416621 vs 2ae9aba, `du -sb` |
| Final soak on 2ae9aba: WebAssembly heap at rides 0 / 50 / 100 | | 128 / 128 / 128 MB (second half +0.0 MB, 0 landings missing art) | `perf-rides.js --rides 100` |
| Final, 50 Cargo Commander rounds: live WebGL contexts / detached DOM nodes | 357 / 25,980 (B's base run) | 3 / 87 | `perf-games.js` on 2ae9aba |
| Startup to panel shown (median of 5, same machine, back to back) | 945 ms (918 to 1003) | 902 ms (869 to 970) | `perf-timing.js`, within noise |
| Word Golf entry to every canvas drawn, first (median of 5) | 396 ms (359 to 415) | 351 ms (255 to 399) | same, ranges overlap |
| Cargo entry to every canvas drawn, first (median of 5) | 526 ms (472 to 656) | 481 ms (441 to 652) | same, ranges overlap |

Still open at 12 months in the browser: a 10.5 MB image, about 75 whole-image saves per play day, about 780 MB copied per day; one 10 MB IndexedDB save takes 11.5 to 13.3 ms in desktop Chromium (D173). Sound compression measured, not applied: 3,689,016 B of production WAV would be 555,818 B as AAC (D177). Tests at the last commit (bb2281a): full Jest 1809/1809; `check:bundle` passes on Android, iOS and web exports.

M9 built in software (D166 to D169): two full-screen mini-games, opened from a landing while the elevator waits paused.
- The frame: a labelled button beside the doorway (PLAY WORD GOLF on Floor 20, PLAY CARGO COMMANDER on Floor 4) opens the game's own screen; BACK TO ELEVATOR returns to the same floor with the doors open and the job exactly where it was. Each play session is its own mission instance (`word-golf`, `cargo-commander`), with idempotent commands, a per-learner play save and recovery after a restart (D166).
- Engine and content: text answers, the spelling generator and pack (38 words in six skills), the two-digit generator and pack (seven add and subtract skills) (D167, D168).
- Word Golf: three holes, one spelled word each, free putts, a help ladder from a sound hint to SHOW ME, MOVE CLOSER after three putts. Cargo Commander: five loads built from crates or sacks and boxes, the exact weight only after WEIGH, a help ladder from tens and ones to SHOW ME, a tier mix that rises with success and never steps down. Only the spelled word and the weighed load are evidence (D169).
- Art, game sounds and spoken words: D170 (approved by the owner's instruction after an agent audit; nobody has listened to the sounds or words yet).
- Not done: no run on an iPad or a Fire tablet, nobody has listened to the game sounds or the narration, no screen reader on a device, no child playtest. The Word Golf session length (3.5 to 5 minutes) is an estimate. The playtest report has no mini-game summary yet.
- Remaining: the observed playtest (do the games hold the learner, is the spelling right for the learner's level, does golf reward or distract, is MOVE CLOSER enough), device runs (memory with a game screen mounted, the fade, sound latency), and two-step loads, which are in the pack but in no mission.

M8.2 built in software (D164, D165): the last eight illustrated floors, so every floor of the tower is illustrated.
- Art: backgrounds for Floors 3 UTILITY, 4 STORAGE, 8 TEST LAB, 10 RELAY ROOM, 12 ENGINEERING BAY, 14 HIGH SERVICE, 16 HYDROPONICS and 19 SKY BRIDGE, and two props (the Floor 14 hanging lamp, the Floor 19 turbine rotor, each approved with its background), approved by the owner's instruction after an agent audit, recorded as D158. Production draws all twenty landings; vectors stay the fallback.
- Landing play: each new floor has one or two things to touch (a valve that turns a gauge needle, a toy robot, a hose reel, a storage bin, flasks, a monitor, relay lamps, a big dial, a crane hook, a pulley wheel, a hanging lamp, grow lights, plants, the far door of the sky bridge and its turbine), with existing reactions and sounds. Every floor is in the Engineer Log. What a touch moves must sit inside its thing's box (a new validator rule; it fixed the Floor 13 crane).
- The live sign never cuts a name off (D165): two lines, or the name without the number on a small doorway.
- Tooling: an e2e walkthrough that rides to every floor and checks the art, the sign and every touch from the page (`E2E_FLOORS=all`), and contact sheets of every floor per layout (`node scripts/floor-contact-sheet.js`).
- Remaining: the Fire tablet measures decode time and memory riding through all twenty illustrated floors (DEVICE_LAB.md section G); the observed playtest (does the learner explore the new floors).

M8.1 built in software (D158 to D163): the art set approved, the building directory, readable words, landing play during jobs, and a generated sound pack (approved on its rights, D163).
- Art: the owner's instruction approved every pending file after an agent audit (D158): Lifty's five other poses, twelve illustrated landings (1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20) and the moving props. A production build now draws all of them; the other eight floors stayed vector until M8.2 (D164); the mission objects and the floor icons stay vector, and every vector stays the fallback.
- The building directory (D159): a DIRECTORY control beside the panel opens every floor by number, emblem and name. Using it is part of the job, never help or evidence; Lifty introduces it once per learner. Every reading ride is answerable from its note plus the directory, each reading CLUE says a strategy, and the bold words of a note never give the answer away.
- Readability (D160): text roles with minimum sizes (the instruction biggest, Lifty's words 20 to 24 pt, nothing a child reads under 16 pt), words that scroll instead of shrinking, the help slot moved to the cabin's corner.
- Landing play during jobs (D161): while a job waits with its answer on another floor, the landing's things react quietly (reaction and sound only), so the rooftop golf ball now putts during a job; before, nothing on a landing could be touched while a job waited. The drawn ball is at least 6 pt, the flag flutters as the ball drops, the Archive's plan drawer slides out, the windmill's hub turns (a blades prop would read better; not made).
- Sound (D162): a generated pack (ElevenLabs) with a sound for every landing thing, a right answer, a gentle miss and a discovery. Approved by the owner after confirming a paid ElevenLabs subscription (D163), so every build plays it (`?sound=placeholder` in the browser for the old set). Approval is one status line.
- Remaining: a person listens to the sound pack (its rights were confirmed in D163); the observed playtest (does the learner use the DIRECTORY, can they read Lifty and the note, does landing play during a job help or distract); the Fire tablet measures decode time and memory now that twelve landings ship (twenty since M8.2).

M8 built in software: a richer tower (D154 to D157). The owner's goal: ride, discover, touch, read or reason, operate, see the reaction, keep exploring; more academic variety and more to do when the doors open, not a bigger worksheet.
- Math: pack composition and mission pools in the engine; mission version 3 with fourteen jobs a run (ten math, four reading); 21 new math activities (skip counting from any start, a ten and some ones, comparing and ordering, through ten, doubles and near doubles, same-way two-part trips, bigger stretch jobs), about 39% review, 47% second grade and 14% stretch per run; a regeneration never brings back the item it replaces.
- Language Arts: 31 authored reading jobs in six `ela.*` skills. The learner reads a short note and acts on it: touches a thing on a landing, rides to a floor, or picks a card. CLUE lights the key sentence, SHOW ME shows the answer, a second miss brings a fresh note.
- Landing play: twelve floors with something to touch (golf putt, toolbox, a fan, gears, spring, windmill, radio, crane, core, archive book, telescope; every floor since M8.2), one reaction vocabulary, quiet reactions between jobs, the same objects as reading answers. World state only.
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

Visual production milestone (built in software; **first production art approved**: the illustrated cabin and Lifty's neutral pose, D144, D145; landings, objects and the other Lifty poses were still vectors then; since M8.1 twelve landings and every pose are approved, D158, and since M8.2 all twenty landings, D164): the mixed tower (7 PLATFORM HEIGHTS, 9 WIND RUINS, 13 BLOCK BUILDER, 20 ROOFTOP GOLF; the Machine Room moved to 6 with its old discovery key kept, D130), the art pipeline (a typed manifest and a separate rights record, approved-only production art, vectors as fallback and interaction geometry, D131), composition rules (safe core, reserved zones for native text, D132), Lifty's hover (D133), the building directory and the cel lip on door and help buttons (D134), on-demand loading with a small byte-budgeted cache (D135), development calibration art and overlays in the developer tools, and docs/ART_ASSET_SPEC.md for whoever makes the art.

Next for art: supply the 36 proof-floor files in the order ART_ASSET_SPEC.md gives (cabin, Lifty, 15, 9, 20, 13, 7, objects), review them, approve them in rights.json, and check them in the browser build. Then the Fire hardware gate measures decoded memory and frame pacing with the art before any other floor gets art. Since M8.1 (D158) twelve landings and all six Lifty poses are approved and ship before that gate ran, and since M8.2 (D164) all twenty landings, so the gate is overdue: run it with the production art on every floor. Do not start Mission 2 inside this.

M6 (browser playtest build) and M5 (cel-shaded Floor 15, Concept Rescue, theme text as data) are unchanged in purpose.

Not done yet:
- the physical device runs (M1 Device Lab plus the Floor 15 checks, [DEVICE_LAB.md](DEVICE_LAB.md)), Fire first
- the first child playtest ([PLAYTEST.md](PLAYTEST.md)), including the Floor Identity, Lifty and Success Replay observations, the M7.1 free-ride, hall-call, completion and DOOR CLOSE observations, and the M8 reading-job and landing-play observations, the M8.1 directory, readability, landing-play-during-jobs and sound observations, and the M8.2 new-floor observations
- listening to the generated sound pack (D162; its rights were confirmed in D163)
- measuring decode time and memory on a Fire tablet riding through all twenty illustrated floors (D164, DEVICE_LAB.md section G)

Renderer acceptance stays provisional until those runs happen. Every build plays the generated sound pack (D163); nobody has listened to it on a tablet yet. The browser build is a development target and decides nothing about device performance.

## First playable vertical slice: "Floor 15" (Elevator Quest, M4)

Why Elevator Quest (learner-engineer) first:
- Math in an elevator gives unambiguous, generatable items and a direct world consequence (the car moves). The fastest path to proving "learning action does something".
- It exercises the hardest engine pieces early: parameterized generation, misconception-tagged distractors, assistance tracking, the no-easier-on-failure policy, and mastery evidence.
- No dependency on handwriting, phonics audio, or a large narration library, which the Magic Tower slice needs on day one.
- The archetype's access requirements (quiet mode, reduced motion, no required speech) ship in the slice, which also proves the access layer early.

The Magic Tower slice follows (M11) so the theme-pack boundary is proven by a second real consumer before it hardens.

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
| M8.1 | Built in software. The pending art approved by the owner's instruction after an agent audit; the building directory (a DIRECTORY control, a one-time introduction, rides answerable from the note plus the directory, strategy clues, validated emphasis); text roles and minimum sizes; landing things that react while a job waits elsewhere and the golf fix; a generated sound pack, approved once the owner confirmed a paid ElevenLabs subscription (D163). Remaining: listening and the rights check, the observed playtest, device runs. | every job answerable, readable and alive |
| M8.2 | Built in software. The last eight illustrated floors and two props, approved by the owner's instruction after an agent audit (D164): every floor illustrated, one or two things to touch on each, the Engineer Log covering every floor; a validator rule that a touch moves only its own thing; a live sign that never cuts a name off (D165); a twenty-floor e2e walkthrough and per-layout contact sheets. Remaining: decode time and memory over twenty floors on a Fire tablet, the observed playtest, device runs. | the whole tower is a place worth riding to |
| M9 | Built in software. Full-screen mini-games over a paused elevator: Word Golf on Floor 20 (text answers, a spelling generator and pack, three holes with deterministic putting physics) and Cargo Commander on Floor 4 (a two-digit generator and pack, WEIGH as the committed answer, an adaptive tier mix); each play session its own mission instance, with idempotent commands, a play save and restart recovery; evidence only from the spelled word and the weighed load (D166 to D169). Remaining: device runs, listening, the observed playtest. | a game can reward learning without becoming the learning |
| M9.1 | Built in software, verified in the browser and in Node only. Stabilization, performance and storage, no new features: read-only MCP permissions in the tracked settings; mini-game resume keyed to the checkpoint; the derived cache written when due, proven equal to a full replay; reference-counted art images and a web-only Skia memory release; a lighter Word Golf drag; cross-platform scripts; smaller native bundles (development-only placeholder sounds, slim runtime manifests, WebP cabin) (D171 to D178). Remaining: device runs (DEVICE_LAB.md section H), the owner listening before any sound compression, the browser's whole-image save. | the slice stays correct, small and steady over a long history |
| M10 | Theme-pack boundary + profile picker + per-learner settings. Second Elevator Quest mission reusing templates. | content is data, not code |
| M11 | Magic Tower slice: one Magic Tower floor, letter-tile word building (CVC), beginning sounds with narration, simple tracing on a Skia drawing surface. | the engine powers a different game |
| M12 | Quest Token ledger + Parent Mode v1 (gate, reward catalog, redemption approvals, basic skill view) + JSON backup export | real-world rewards are trustworthy |
| M13 | First full arc per child ending in a Mastery Encounter set piece, spaced review, struggle signals | the challenge philosophy at full strength |

Store submission planning (privacy labels, Kids Category, Amazon Appstore listing) starts after M13. Milestone numbers changed in D103, D114, D154 and D166 (DECISIONS.md); older decisions name the numbers of their time.

## Future presentations (documented, not scheduled)

Elevator Quest is one presentation of the shared learning engine. Skills, evidence, mastery and the response policy live in the engine and runtime; a presentation only draws the challenge and the learner's answer. Later presentations reuse the same engine. None is built or scheduled, and none starts unless the owner asks.

- Illustrated Challenge: standardized-test-style question formats set in comic or cel-shaded illustrated scenes.
- Skill Games: correct reasoning earns or enables an action the learner then performs. Golf: the challenge enables the shot, then the learner aims and hits. Bowling: a challenge enables the roll, and the pin state shows the arithmetic.

Theme code never scores (CLAUDE.md), so in a Skill Game the shot or roll is presentation: the reasoning is the evidence, and a missed putt records nothing about the skill.
