# Roadmap

Build vertically. Each milestone ends with something a child can touch, or a measured answer to a technical risk. Test with the children at every milestone from M3 on.

## Current phase

M1, Device Lab. The Expo app is scaffolded with a developer-only Device Lab that tests rendering, touch, drag, drawing, audio, and SQLite. Physical Fire and iPad runs are pending. See [DEVICE_LAB.md](DEVICE_LAB.md). No gameplay exists yet.

## First playable vertical slice: "Floor 15" (Elevator Quest)

Why Elevator Quest (learner-engineer) first:
- Math in an elevator gives unambiguous, generatable items and a direct world consequence (the car moves). The fastest path to proving "learning action does something".
- It exercises the hardest engine pieces early: parameterized generation, misconception-tagged distractors, assistance tracking, the no-easier-on-failure policy, and mastery evidence.
- No dependency on handwriting, phonics audio, or a large narration library, which the Magic Tower slice needs on day one.
- The archetype's access requirements (quiet mode, reduced motion, no required speech) ship in the slice, which also proves the access layer early.

The Magic Tower slice follows (M6) so the theme-pack boundary is proven by a second real consumer before it hardens.

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

## Milestones

| # | Milestone | Proves |
|---|---|---|
| M0 | Foundation docs (done) | shared understanding |
| M1 | Device Lab (developer-only harness, see DEVICE_LAB.md): Expo SDK 57 dev build on a real Fire HD 8 and an iPad. Skia v2 layered scene, Reanimated tap feedback, gesture drag, expo-audio SFX latency, SQLite write under force-quit, portrait and resized-window layout on iPad, Rive yes/no. Record frame times, tap latency, memory. Set per-scene texture and audio loudness budgets. | the stack survives the performance floor |
| M2 | Engine core in pure TS: skill graph loader, item template interface + 2 templates, evaluator, assistance evidence, skill state dimensions, one scaffolding policy as data, attempt log schema. Content validator CLI. Full unit + property tests. No UI. | the learning model is correct and testable |
| M3 | "Floor 15" vertical slice (above) | the core philosophy works with a real child |
| M4 | Playtest-driven tuning: thresholds, hint ladder, feedback timing, art pass on the one scene | it is fun, not just correct |
| M5 | Theme-pack boundary + profile picker + per-learner settings. Second Elevator Quest mission reusing templates. | content is data, not code |
| M6 | Magic Tower slice: one Magic Tower floor, letter-tile word building (CVC), beginning sounds with narration, simple tracing on a Skia drawing surface. | the engine powers a different game |
| M7 | Quest Token ledger + Parent Mode v1 (gate, reward catalog, redemption approvals, basic skill view) + JSON backup export | real-world rewards are trustworthy |
| M8 | First full arc per child ending in a Mastery Encounter set piece, spaced review, struggle signals | the challenge philosophy at full strength |

Store submission planning (privacy labels, Kids Category, Amazon Appstore listing) starts after M8.
