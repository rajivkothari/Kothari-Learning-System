# Roadmap

Build vertically. Each milestone ends with something a child can touch, or a measured answer to a technical risk. Test with the children at every milestone from M4 on.

## Current phase

M7 built in software: Floor 15 stabilized so playtest evidence can be trusted, and made more engaging.
- Reliability: answers only from explicit answer windows (the arrival-window race is fixed), abandoned runs when content changes under them (schema v3), a learning-event evolution point, a clear TRY AGAIN instead of a stuck save, the OS reduce-motion default, frame callbacks only during travel, theme-neutral developer seeding, and a crash matrix on the real Floor 15 content.
- Experience: 20 data-driven landing identities with Floor 15 dormant until restored, Lifty in the scene at eye level and moving with the job, a help cue that shows on Fire, and the success replay (one honest way to the answer, drawn on the shaft map).

M7.1 built in software (the fun and exploration pass): the building is the game after Floor 15.
- Free-ride exploration on five floors (5, 7, 15, 17, 18): touch the object, it reacts, Lifty says one line, the discovery is remembered per learner (world memory, schema v4, never learning evidence).
- The Engineer Log clipboard, hall calls between jobs instead of automatic dispatch rides, an in-world completion with no card (restoration, panel sweep, rank plate, then free ride), quieter routine rides, and a once-per-learner DOOR CLOSE tip.
- Documented only, not built: Dark Tower restoration, Teach Lifty, Engineer Tools (GAME_DESIGN.md).

Correction round after M7.1 (built in software): success reinforcement is child-paced (NEXT JOB, no timed advance), the things jobs name stand on the landings (repair kit, toolbox, spare parts, crew, beacon, loading dock; absent at a wrong floor), labelled cargo crates, and less talk around a success. Concept art for a painted look was received and is recorded as an open decision (D125), not built.

M6 (browser playtest build) and M5 (cel-shaded Floor 15, Concept Rescue, theme text as data) are unchanged in purpose.

Not done yet:
- the physical device runs (M1 Device Lab plus the Floor 15 checks, [DEVICE_LAB.md](DEVICE_LAB.md)), Fire first
- the first child playtest ([PLAYTEST.md](PLAYTEST.md)), including the Floor Identity, Lifty and Success Replay observations and the M7.1 free-ride, hall-call, completion and DOOR CLOSE observations

Renderer acceptance stays provisional until those runs happen. The sounds are synthesized placeholders. The browser build is a development target and decides nothing about device performance.

## First playable vertical slice: "Floor 15" (Elevator Quest, M4)

Why Elevator Quest (learner-engineer) first:
- Math in an elevator gives unambiguous, generatable items and a direct world consequence (the car moves). The fastest path to proving "learning action does something".
- It exercises the hardest engine pieces early: parameterized generation, misconception-tagged distractors, assistance tracking, the no-easier-on-failure policy, and mastery evidence.
- No dependency on handwriting, phonics audio, or a large narration library, which the Magic Tower slice needs on day one.
- The archetype's access requirements (quiet mode, reduced motion, no required speech) ship in the slice, which also proves the access layer early.

The Magic Tower slice follows (M9) so the theme-pack boundary is proven by a second real consumer before it hardens.

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
| M8 | Theme-pack boundary + profile picker + per-learner settings. Second Elevator Quest mission reusing templates. Not before the M7.1 playtest. | content is data, not code |
| M9 | Magic Tower slice: one Magic Tower floor, letter-tile word building (CVC), beginning sounds with narration, simple tracing on a Skia drawing surface. | the engine powers a different game |
| M10 | Quest Token ledger + Parent Mode v1 (gate, reward catalog, redemption approvals, basic skill view) + JSON backup export | real-world rewards are trustworthy |
| M11 | First full arc per child ending in a Mastery Encounter set piece, spaced review, struggle signals | the challenge philosophy at full strength |

Store submission planning (privacy labels, Kids Category, Amazon Appstore listing) starts after M11. Milestone numbers changed in D103 and again in D114 (DECISIONS.md); older decisions name the numbers of their time.
