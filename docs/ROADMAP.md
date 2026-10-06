# Roadmap

Build vertically. Each milestone ends with something a child can touch, or a measured answer to a technical risk. Test with the children at every milestone from M4 on.

## Current phase

M6 built in software: a browser playtest build of Floor 15 ([WEB_PLAYTEST.md](WEB_PLAYTEST.md)) so the slice can be played, reset, inspected and screenshotted on a desktop: `npm run web:playtest`, a static export, sql.js + IndexedDB persistence behind the same database interface, a developer shell with a device viewport simulator, test learners, jump-to-state, Concept Rescue inspection and real settings, a screenshot script, and a browser end-to-end check. Also fixed: cargo crates no longer shrink below 64 pt, and reopening after completion shows the completion again.

M5 (cel-shaded Floor 15, gap-free help, Concept Rescue, theme text as data, learner-scoped runtime) is unchanged in behaviour.

Not done yet:
- the physical device runs (M1 Device Lab plus the Floor 15 checks, [DEVICE_LAB.md](DEVICE_LAB.md))
- the first child playtest ([PLAYTEST.md](PLAYTEST.md))

Renderer acceptance stays provisional until those runs happen. The sounds are synthesized placeholders. The browser build is a development target and decides nothing about device performance.

## First playable vertical slice: "Floor 15" (Elevator Quest, M4)

Why Elevator Quest (learner-engineer) first:
- Math in an elevator gives unambiguous, generatable items and a direct world consequence (the car moves). The fastest path to proving "learning action does something".
- It exercises the hardest engine pieces early: parameterized generation, misconception-tagged distractors, assistance tracking, the no-easier-on-failure policy, and mastery evidence.
- No dependency on handwriting, phonics audio, or a large narration library, which the Magic Tower slice needs on day one.
- The archetype's access requirements (quiet mode, reduced motion, no required speech) ship in the slice, which also proves the access layer early.

The Magic Tower slice follows (M8) so the theme-pack boundary is proven by a second real consumer before it hardens.

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
- Help follows the core pack's policy: point at the givens, the shaft map as a number line after two misses, count along, show the answer after three misses.
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
| M7 | Theme-pack boundary + profile picker + per-learner settings. Second Elevator Quest mission reusing templates. | content is data, not code |
| M8 | Magic Tower slice: one Magic Tower floor, letter-tile word building (CVC), beginning sounds with narration, simple tracing on a Skia drawing surface. | the engine powers a different game |
| M9 | Quest Token ledger + Parent Mode v1 (gate, reward catalog, redemption approvals, basic skill view) + JSON backup export | real-world rewards are trustworthy |
| M10 | First full arc per child ending in a Mastery Encounter set piece, spaced review, struggle signals | the challenge philosophy at full strength |

Store submission planning (privacy labels, Kids Category, Amazon Appstore listing) starts after M10.
