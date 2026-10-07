# Decisions and Assumptions

Append-only log. New decisions go at the bottom with a date. To reverse a decision, add a new entry that supersedes it. Do not edit old entries.

Status: Accepted, Assumption (to validate), Superseded.

## 2026-10-06

D1. Repository starts empty. Initial branch `main`. Accepted.

D2. Documentation lives in `CLAUDE.md` (agent guide) plus `docs/`. The user's suggested `CURRICULUM.md` became `LEARNING_MODEL.md` because the skill graph, mastery, and adaptation share one data model and split badly. `CONTENT_MODEL.md`, `LEARNER_PROFILES.md`, and this file were added. Accepted.

D3. No real learner identities, diagnoses, or family details in tracked files. Tracked docs use archetypes (`learner-engineer`, `learner-storyteller`). Private notes live in the gitignored `private/` folder. Runtime profiles live in on-device storage. Accepted.

D4. Stack: Expo (development builds, not Expo Go) + React Native + TypeScript strict. Scenes on React Native Skia, animation on Reanimated, touch on Gesture Handler. See ARCHITECTURE.md for alternatives considered. Accepted, pending the M1 device spike.

D5. One app, one package, folder boundaries enforced by lint rules. No monorepo until a second app or a shared package needs it. Accepted.

D6. `src/engine/` is pure TypeScript. No React, React Native, Expo, or I/O imports. Accepted.

D7. SQLite is the single durable store. Attempts and ledger entries are append-only. Skill state is a rebuildable cache. Accepted.

D8. Quest Tokens use an append-only ledger with idempotency keys. No mutable balance column. Accepted.

D9. Items come from deterministic, seeded, parameterized templates plus hand-authored narrative content. No runtime AI. Accepted.

D10. Landscape is the primary design target, but layouts must survive portrait and resized windows because of iPadOS 26 changes (Apple TN3192). Accepted.

D11. First vertical slice is Elevator Quest ("Floor 15", learner-engineer). Magic Tower follows at M6. Accepted.

D12. Mastery thresholds, evidence weights, tier mix, and struggle windows in LEARNING_MODEL.md are starting guesses. Assumption, to tune in M4.

D13. Mission length target 5-10 minutes. Assumption, to tune with the children.

D14. Parent gate is a parent-set PIN plus a press-and-hold, not an arithmetic question, because the learners will learn the arithmetic. Recovery path to be designed in M7. Accepted.

D15. No analytics SDKs, crash reporters that phone home, ads, or accounts in V1. Diagnostics stay on device. Accepted.

D16. Narration is pre-generated or recorded audio files shipped in the bundle. No on-device or online TTS dependency for core play. Accepted.

D17. Handwriting V1 is tracing evaluation by path coverage and deviation, not recognition. Accepted.

D18. Stay on `@shopify/react-native-skia` v2 (OpenGL ES) as bundled by Expo SDK 57. Skia v3 needs Vulkan and Android API 26+, and Vulkan quality on Fire GPUs is not verified. Revisit after testing v3 on a Fire HD 8. Accepted.

D19. The performance floor device is the Fire HD 8 (2022 or 2024, Mali-G52 MC2). The Fire 7 (2 GB) gets best-effort support until measured. Accepted.

D20. Use expo >= 57.0.17 to avoid the Hermes v1 memory and dev-startup regressions fixed in SDK 57 patch releases. Accepted.

D21. Pre-push privacy rewrite. Before the first push, local history was rebuilt so no reachable commit contains real learner names, ages, or diagnoses. Entries D2, D3, D11, and D14 were edited in place as part of that rewrite. That is the only sanctioned in-place edit of this log. Accepted.

D22. Challenge composition is adaptive. Practice, Stretch, and Mastery Encounter are semantic categories. No fixed ratio is a product rule (the earlier "55/30/10" was brainstorming). Missions declare slots so a future pure-function scheduler can fill them. The scheduler is not built yet. Accepted.

D23. The token economy must never pay more for wrong answers. Within an activity, payout is non-increasing in errors and assistance. Persistence is rewarded only through cross-session growth signals, once per skill per milestone, sized so that failing now and succeeding later never beats succeeding now. Property tests required when token rules are built (M7). Accepted.

D24. Repetition is classified as exact replay, easy variation, due spaced review, novel application, or higher-order application. Reward and evidence value depend on that class. Mastered skills keep value through review and application. Accepted.

D25. Assistance evidence (fixed, recorded on every attempt) is separate from scaffolding policy (data, per activity type, scaled by learner support profile). No universal hint ladder in engine code. Supersedes the nine-step ladder framing. Accepted.

D26. Skill state is a mastery level (locked -> introduced -> practicing -> proficient -> mastered) plus four evidence dimensions: accuracy, independence, retention, transfer. "Applied" is no longer a terminal state. Transfer is reported alongside the level. Supersedes the six-state chain. Accepted.

D27. Content validation sampling budgets are configurable per environment (dev, ci, release) and per template. Supersedes the fixed "2,000 seeds per activity". Accepted.

D28. Use the Skia version Expo SDK 57 recommends (`npx expo install`), currently 2.6.x. Skia is the leading rendering choice, not an irreversible commitment. Skia types stay inside `src/presentation` and `src/dev`. Scene descriptions, layout math, and all learning logic are framework-independent. Supersedes the "stay on v2" framing of D18 with the same practical result. Accepted.

D29. Layout tolerates portrait, landscape, iPad multitasking, and resized windows. Game coordinates are logical stage units scaled to the available window, never device pixels or a fixed resolution. The experience may later show a "best in landscape" treatment, but nothing breaks when resized. Refines D10. Accepted.

D30. The Device Lab is developer-only, lives in `src/dev/device-lab/`, is enabled by `__DEV__` or `EXPO_PUBLIC_DEVICE_LAB=1`, and is removed by deleting that folder plus one import. Accepted.

D31. Production bundles built without `EXPO_PUBLIC_DEVICE_LAB=1` exclude the Device Lab through a Metro resolver rule (`metro.config.js`) that swaps in a stub. The runtime flag alone left the lab code and audio in the bundle (measured: 3.4 MB vs 2.6 MB Android bundle). Accepted.

D32. Only dependencies needed by the Device Lab are installed. Expo Router, Zustand, Zod, fast-check, Maestro, Rive, and Drizzle wait for the milestone that needs them. Accepted.

D33. The expo-audio config plugin runs with recording and background playback disabled, so the app requests no microphone permission and no foreground service. Accepted.

D34. Bundle IDs are `com.kotharifamily.learning` (iOS and Android). Placeholder, changeable until the first store submission. Assumption.

D35. Performance numbers count only from release builds on physical hardware. Debug builds, emulators, and simulators are for functional checks. Accepted.

## 2026-10-06 (M2)

D36. Zod 4 (runtime schemas) and fast-check 4 (property tests, dev only) added for the engine. Both are pure JavaScript with no native code. Accepted.

D37. Mastery policy values live in `content/engine-config.json` with `status: "initial-unvalidated"`. The engine has a schema, no default numbers. Supersedes the D12 wording (same intent). Accepted.

D38. Level gates count successes and treat failures as 0 independence credit (independence = mean credit per scored attempt). This makes "an added failure can only lower or delay a level" hold, which the anti-failure value invariants depend on. Accepted.

D39. Unlocking uses prerequisite PEAK levels, so a prerequisite dip never re-locks dependents. Accepted.

D40. The spaced-review schedule moves only on qualifying successes. A failed due review sets `needsReconsolidation` (current level drops to Proficient, peak stays) instead of shortening intervals, so deliberate failing cannot make reviews more frequent. Relearning is offered through eligibility. Accepted, revisit after playtests.

D41. Exposure classes add `developing` (learning a not-yet-mastered skill) to the five replay classes from D24. Accepted.

D42. Progression value is a tier (none / low / normal / high) from one-time keyed events only: first clear (Stretch / Encounter), new peak level (Proficient / Mastered), first success in a transfer context, new review stage. Practice completions earn nothing by themselves. Wrong attempts are never an input. Accepted.

D43. The anti-failure invariant is stated over the whole timeline (events subset, tiers and total no higher), plus per-completion where prior history is identical. Added failures can delay a one-time milestone to a later completion. That is not extra value. Accepted.

D44. Item signatures hash template id, version, concept, and prompt with a pinned cyrb128 hash. Generators must bump their version whenever output for a seed could change. Accepted.

D45. Encounter completion succeeds when every stage's final attempt is correct. Encounter scaffolding in the sample pack never demonstrates answers. Accepted.

D46. Jest runs two projects: `engine` (plain Node, no React Native setup) and `app` (jest-expo). Accepted.

D47. Expo patch updates applied at Expo Doctor's request during M2 (expo 57.0.27, expo-asset 57.0.19, expo-sqlite 57.0.4). Fire scan re-run clean. Accepted.

## 2026-10-06 (M3)

D48. Progression value becomes an upgrade model. Each opportunity key has a ceiling tier, the ledger keeps the best tier demonstrated, and a stronger later demonstration records only the increment. Lifetime value = sum of best tiers. Supersedes the per-completion "first event wins" rule in D42 (event kinds unchanged, `missionComplete` added). Accepted.

D49. A demonstration requires a fresh credited success in the completion (non-replay, correct, credit > 0). This closed a failure-insertion exploit found by the property tests, where a replayed completion plus an inserted failed new item earned a clear. Accepted.

D50. Peak-level opportunities are checked for every skill at every completion, not only the completion's own skills. A dependent skill that peaks through an unlock is recognized immediately instead of by a later replay. Accepted.

D51. Three concepts stay separate: learning evidence (`learning_events`), in-game progression signals (`GAME_PROGRESS`, classifications only, no XP formula, nothing time- or login-based), and progression opportunities (`progression_events`, read by a future token rule). The engine never knows token amounts. No token ledger exists in M3. Accepted.

D52. Completion records are durable learning events written in the same transaction as the final attempt. They are explicit replay boundaries, so replay never infers where a play-through ended. Accepted.

D53. The mission runtime is a pure reducer `(ctx, checkpoint, command) -> { checkpoint, intents, events }` with caller-supplied time and command ids. It emits presentation intents with no theme, screen, or animation names, and views never include option correctness. Accepted.

D54. Item seeds are derived from `seedBase | mission@version | step | stage | item | generation`. The checkpoint stores the item signature, not the item, and resume refuses to continue on a signature mismatch. Accepted.

D55. A demonstrated-and-correct item counts as seen (`answerShown`), so solving the same signature later is an exact replay with no credit. Accepted.

D56. The sample arithmetic scaffolding policy regenerates after 4 wrong tries (was 3) so "show answer" at 3 is reachable before the item changes. Content change, not engine. Accepted.

D57. Persistence is expo-sqlite behind a small `SqlDatabase` interface, tested against `node:sqlite` with the same SQL. Schema v1: `learners`, `learning_events` and `progression_events` (append-only via triggers), `mission_instances` (checkpoint with revision), `derived_cache`, `schema_migrations`. Drizzle is still not used. Accepted.

D58. One transaction per command: learning events, newly announced progression events, mission checkpoint, and derived cache commit together. Writes go through one serialized queue. Touch feedback is UI-only and never waits for it. Right/wrong may be shown from a pure `preview`. Completion and upgrades are announced only from the committed result. Accepted.

D59. Idempotency by stable ids and `INSERT OR IGNORE`: attempts and completions by position and generation, progression events by `learner|key->tier`, commands by the checkpoint's last command id plus its stored intents. Accepted.

D60. The derived cache is keyed by policy, model and processor state versions, content pack id@version, and mission set version. Missing, stale, or unreadable snapshots are rebuilt from `learning_events`. Never authoritative. Accepted.

D61. Migrations are numbered, gap-free, forward-only, one transaction each, and refuse edited names or a database newer than the app. Accepted.

D62. Roadmap renumbered: M3 is the non-rendering runtime (done), "Floor 15" becomes M4, and later milestones shift by one. Accepted.

D63. Measured on Node/V8 (not a device): per-command commit about 2.5 ms p50 regardless of history size, cache about 45 KB, cold rebuild without cache 2.3 s at 50k attempts. Full rebuilds must move off the launch path before any policy change ships. Measure on Fire before relying on any of these numbers. Accepted.

## 2026-10-06 (M4)

D64. A demonstrated answer contaminates that exact item only: solving the same signature again is an exact replay with no credit. A new variation of the same skill, solved independently, counts as full evidence and can upgrade opportunities. The demonstration itself is a scored zero in the recent window, and it scrolls out. Explicit tests in `learner/demonstrated.test.ts`. Behaviour unchanged from M3, now pinned. Accepted.

D65. Activities declare how the learner answers: `answer: { mode: "choice" }` (default) or `{ mode: "value", min, max }`. A value answer (any floor on the panel) is harder than picking from a few options, so it is content, not theme. Generated items now carry `diagnostics` (every tagged wrong value), so a free value still surfaces its misconception. The signature is unchanged. Accepted.

D66. `checkResponse` evaluates a response against the current item, purely and synchronously, exactly as `applyCommand` will. The runtime keeps the active mission's committed checkpoint in memory (`activate`, `check`, `currentView`), so answer feedback never reads SQLite. The in-memory checkpoint advances only after a successful commit. A failed commit drops it and the next call reloads from SQLite. Accepted.

D67. Commands may carry `basedOn` (the checkpoint revision the UI saw). A mismatch is refused as `stale` with no write, so a second tap racing the first cannot answer the next item. Accepted.

D68. The shipped learning content is `content/packs/core.json` and `content/missions/core.json`, theme-neutral and validated in CI. The test fixtures stay separate. The core pack lists add and subtract within 20 without prerequisites. This is a placement assumption for the slice. Earlier skills return with placement work. Accepted.

D69. New generator `quantity.fillToCapacity` v1 (missing addend in a capacity context), for the encounter's load stage. Accepted.

D70. Migration v2 `unlocks-and-settings` adds `unlocks` (append-only, unique per learner and unlock) and `learner_settings` (mutable access and sensory settings). Unlocks are a content catalog matched against committed `missionComplete` signals inside the command transaction. No amounts, no balance. Accepted.

D71. Elevator Quest's simulation, audio cue mapping, director, and theme content are render-free and lint-guarded. Only `ui/` and `audio/audioEngine.ts` touch React Native, Skia, or expo-audio. The elevator simulation never knows what a destination means educationally. Accepted.

D72. A panel answer locks at departure. Before that, a different floor replaces the call (a change of plan). A wrong but valid floor is a real ride to that floor, and feedback comes after the doors open. Choosing the current floor is an answer evaluated in place. The panel is locked while Lifty reacts to a correct answer. Accepted.

D73. Automatic misconception feedback may explain a convention (the first floor after the start is "1") but never counts to the destination. The full count is the guided help step, recorded as guided. Accepted.

D74. Sound is semantic: the simulation emits events, a cue mapper turns them into slots, and a profile maps slots to assets. Clicks are rate-limited, a machine dispatch makes no click, the chime only follows an arrival, and loops are owned by the events that end them. Quiet keeps confirmations and drops the ambient bed. Sound never carries information alone. Accepted.

D75. All M4 sounds are synthesized prototypes made by `scripts/generate-elevator-audio.js` and marked `authentic: false, replace: true` in the manifest. No third-party audio was downloaded. Replace with licensed or self-recorded audio before release. Accepted.

D76. Recovery: SQLite holds learning state, while the car's floor, the doors, and loaded crates are presentation state. A resume never restores a car between floors. It parks the car at the current job's start floor with its doors open. Accepted, revisit if playtests show confusion.

D77. Development and lab builds open a developer launcher (Elevator Quest or Device Lab). Production builds open Elevator Quest directly. Both screens load lazily. Accepted.

D78. Renderer acceptance remains provisional: no physical Device Lab run exists. M4 was built anyway, as the user directed, with rendering isolated in `ui/` so scene cost can be cut or the renderer replaced. Accepted, must be revisited after the first Fire run.

D79. One neutral learner id (`learner-1`) until profiles exist (M6). No names in code or data. Accepted.

## 2026-10-06 (M5)

D80. A shared visual design system lives in `src/presentation/design/` as pure TypeScript tokens (palette roles, surface levels, interactive states, type roles, spacing, radii, outlines, shadow, glow, lighting, icon sizes, minimum touch target, motion with reduced equivalents, parallax, accomplishment sizes). Components read roles, never raw colors. Contrast and reduced-motion rules are tested. Accepted.

D81. Art direction is 2D/2.5D cel shading: two or three flat value bands per material, selective dark edges, graphic highlights, depth by layers. No textures, blur stacks or particles in the Floor 15 scene. See ART_DIRECTION.md. Accepted.

D82. Red is reserved for genuine danger and yellow for genuine warnings. Mistake feedback uses the world's consequence plus warm amber, never red. Accepted.

D83. Story World swaps the DISPLAY type face only. READING and UI text stay identical across worlds. System faces only until a bundled font has a license check and a Fire run. Accepted.

D84. Help steps are requestable before their threshold by default (`requestableEarly`), so help is never a dead end after the first clue. Demonstrated steps can never be requested early. Supersedes the M4 behaviour where nothing was available between the clue and the next miss. Accepted.

D85. Concept Rescue is a policy feature (`conceptRescue: { afterWrongTries, returnTo }`), default threshold 5 in the core pack. It teaches with a deterministic parallel example, pauses the target, never reveals the target answer, records no evidence for the example, and records the solved target as `guided` with `conceptRescue: true`. Misconception focus only on strong evidence (top tag at least twice and at least half the misses). `regenerateAfterWrongTries` must exceed the rescue threshold. Accepted.

D86. The rescue example uses the same generator and params as the target, seeded `<item seed>|rescue<k>`, preferring the same non-numeric givens and the smallest numbers. It is stored by seed and signature and survives restarts. Accepted.

D87. Child-facing theme text moves into schema-validated JSON (`content/themes/<theme>/<mission>.json`) with a per-theme contract of required lines and allowed placeholders. Validation covers required text, misconception mappings, unknown references and duplicate ids. Accepted.

D88. The world catalog (`content/worlds/catalog.json`) describes worlds and floors with no difficulty field. The world decides the fantasy, the learner profile decides the challenge. Curriculum affinities steer selection only, never scoring. Only Elevator Quest is playable. No protected franchise names in content (tested denylist). Accepted.

D89. The runtime accepts a supplied local learner id and every durable read and write is scoped to it. A mission instance id belongs to one learner, and reusing it for another learner is refused. The app still supplies one default id until a picker exists. Supersedes D79. Accepted.

D90. Starting placement is an explicit, typed assumption (`PlacementSchema`, `source: assumption`) that unlocks skills for play without claiming prerequisites. It is part of the derived-cache key. It will later come from parent setup, calibration and observed play. Supersedes the placement note in D68. Accepted.

D91. Automatic rides stay, and their travel time is a theme pacing parameter (`pacing.autoRideTimeScale`, 0.7, bounded 0.3 to 1.5). Learner-initiated rides are never scaled. Accepted, tune after the playtest.

D92. Signs and numbers painted in the scene are vector stencils, not font text, so they render without a font lookup on every platform. This fixes the landing number that did not render in the web preview. Accepted, device check pending.

D93. Concept Rescue is presented as a TEST RUN, an engineering word. Child-facing copy never says practice, lesson or wrong. Accepted.

## 2026-10-06 (M6)

D94. The browser build is a supported playtest and development target, never a shipping target. iPad and Fire stay authoritative for performance, touch, audio and display. Accepted.

D95. Browser persistence is sql.js (SQLite as WebAssembly, 1.14.2) in memory, saving the whole database image to IndexedDB after every committed transaction, behind the existing `SqlDatabase` interface. Same SQL, migrations and triggers as native. Rejected: expo-sqlite web (its docs call web support alpha, and it needs COOP/COEP headers for SharedArrayBuffer, which also rules out plain-http LAN access from a tablet), and a hand-written IndexedDB store (it would duplicate the persistence logic and lose the triggers). Committed means durable: a failed save restores the last saved image and rejects. Accepted.

D96. Platform differences live only in Metro platform-extension files (`*.web.ts`): app start, database, audio gate, text export, environment, launch parameters, reload, and the Device Lab storage probe. No `Platform.OS === 'web'` checks in game, runtime or engine code. Accepted.

D97. Developer tools (viewport simulator, test learners, jumps, simulated misses, resets, inspection, visual-review scenarios) are on in development builds and in builds with `EXPO_PUBLIC_DEV_TOOLS=1` (the web playtest export). metro.config.js replaces them with an empty stub in other production bundles, and `npm run check:bundle` checks exported Android and iOS bundles for marker strings. Accepted.

D98. Developer tools act on test learners only (`learner-test-a`, `learner-test-b`, `fresh-learner`, with generations `-g<n>`), never the default learner. A reset never deletes rows: it moves the profile to a new empty generation. Jumps write a mission checkpoint only (engine `startMissionAt`, no learning events). Simulated misses go through `runtime.submit`. Accepted.

D99. The viewport simulator hands the simulated size to the game through `src/presentation/viewport.tsx`, and the game runs its real layout. No CSS scaling. Preset sizes are approximate and labelled simulated. Accepted.

D100. Browser audio waits for the first user gesture (autoplay rules). Until then one-shots are dropped and loops start when sound is allowed. Native behaviour is unchanged. Accepted.

D101. Cargo crates are child touch targets and never shrink below 64 pt. A cargo side that cannot fit its crates scrolls, and dragging a crate is a sideways gesture there. The cargo bay always stays inside the cabin view. Fixes the 46 pt minimum from M4. Accepted.

D102. Reopening the app after finishing Floor 15 shows the completed mission (completion card, unlocks, Play again) instead of starting a fresh intro, as the M4 recovery table already stated. The session picks the active instance, else the latest completed one, else starts new. Bug fix. Accepted.

D103. Roadmap renumbered: M6 is the browser playtest build. The profile picker and second mission move to M7, Magic Tower to M8, Quest Tokens and Parent Mode to M9, the first full arc to M10. Earlier decisions that name milestone numbers (D11, D14, D23, D79) refer to the old numbering. Accepted.

D104. Open learning question, recorded and not acted on: the Concept Rescue's final "where does it stop?" may be too easy because the learner has just counted to that floor. Decide from observation (PLAYTEST.md) whether a stronger final transfer check is needed. Accepted as an open question.

## 2026-10-06 (M7)

D105. A learner input becomes an academic answer only if it happened while that exact item was the active, answer-accepting item. The director holds an explicit answer window (a token plus the item signature). It opens when a job is presented (and again after a wrong answer on the same job), and closes when an answer is locked, on any transition, at Concept Rescue and in free rides. A press records the window's token only while the window accepts, and a departure is judged only if its token and the current item signature still match. Outside a window the panel is locked and a waiting call is cancelled. Fixes the audit's arrival-window race, where a tap during an arrival could be judged against the next item. Accepted.

D106. An active mission whose stored item no longer regenerates (content or generator changed, mission version gone) ends as `abandoned` through a new `abandon` command: one mission completion record with `outcome: "abandoned"`, no invented attempt, no value, no unlock. The instance refuses further commands and the learner starts a fresh one. Schema migration v3 allows the status. There is no item-level migration framework. Accepted.

D107. Learning event payloads are read through one per-schemaVersion upgrade point (`evidence/evolution.ts`). Additive optional fields keep the version; anything else bumps it and adds one pure upgrader. Payloads newer than the app, without an upgrade path, or malformed are refused with a typed error, and stored rows are never rewritten. Accepted.

D108. A save that keeps failing stops in a clear state with an adult TRY AGAIN that reloads the last durable save (and BACK TO LAUNCHER where a launcher exists). The failed answer is not recorded and is never retried behind the learner. Replaces the permanent "Saving the logbook" line. Accepted.

D109. The help offer is drawn with border, ring, badge and a slow pulse (scale and opacity), never with an iOS-only shadow, and is static under reduced motion. It is announced once. Help thresholds are unchanged. Accepted.

D110. The OS reduce-motion switch is the initial motion setting only when nothing is stored for the learner, and it is never written back. A stored choice always wins. Accepted.

D111. Floors are places: each of the 20 floors is a landing entry in `content/themes/elevator-quest/landings.json`, built from a fixed vocabulary (wall swatch, light, pattern, sign, doorway, silhouette, window, props, emblem) and drawn by one renderer from flat shapes. Swatches are token roles kept away from the semantic colors. Floor 15 is dormant until restored; the restored state comes from a new unlock (`eq.landing.floor-15-restored`), with the M4 rank unlock accepted as a legacy signal. Supersedes the five cycling landing paints. Accepted.

D112. Lifty lives in the scene, in an eye-level band between the indicator and the door frame, never in a strip below the cabin. Lifty moves within the band by context (panel help, shaft map, cargo, test run, completion), instantly under reduced motion. The band never overlaps the floor buttons, the indicator, the doorway, the shaft map, the cargo bay or the test-run board. Exception: in a cabin under 400 pt wide during cargo, the band takes the top of the cabin (over the indicator), as the cargo bay itself did before. Accepted.

D113. Success replay: after a correct answer only, a short in-world replay of one way to reach the answer (shaft map hops, or the load sum in the cargo bay), with a steady check on the indicator. Strategy choice is deterministic: observed first, then simplest efficient, on the familiar representation. The game says "you" only for what it observed; suggestions read "One quick way". Replays write nothing, are never evidence, open no answer window, and last about 1.6 s for routine successes (longer for stretch and mastery, shorter and static under reduced motion). Accepted.

D114. Roadmap renumbered again: M7 is this stabilization and experience milestone. The theme-pack boundary, profile picker and second mission move to M8, Magic Tower to M9, Quest Tokens and Parent Mode to M10, the first full arc to M11. D103's numbers are superseded. Accepted.

D115. Proficiency thresholds are unchanged, and recorded as a playtest caution. Measured headless on 2026-10-06: one clean run of Floor 15 (every job right first time) brings `math.add.within20` and `math.sub.within20` to Proficient (4 of 4 scored each) and marks transfer `demonstrated` for both. Read skill levels after a single session with that in mind (PLAYTEST.md). Accepted as a recorded caution, not a change.

## 2026-10-07 (M7.1 exploration pass)

D116. The building is the game. After Floor 15, free ride is an exploration toy: five landings (5 Ventilation, 7 Machine Room, 15 Primary Power, 17 Archive, 18 Observatory) hold one touchable object each, with one cheap reaction (spin, tilt, slide, pulse, reveal) that plays on every touch and a discovery that is remembered once. Floor 18 was chosen over Floor 9 because its telescope gives an obvious object to touch and Floor 9 (a railing and a view) has none. The other fifteen floors keep their identity and nothing to touch yet. Accepted.

D117. Discoveries and one-time tips are world memory, not learning and not unlocks: a separate append-only table `world_memory` (schema v4), one row per learner and theme-namespaced key, written idempotently by `runtime.remember` in its own transaction. Unlocks were not reused because they are granted by mission signals inside the learning transaction and may feed rewards later. Nothing in evidence, mastery, independence, retention, transfer, progression value, unlocks or tokens reads world memory, and no value source may ever be keyed to it. Tests hold it (director, runtime, crash case). Accepted.

D118. Hall calls replace the automatic dispatch ride between jobs: the next job's floor calls the lift and the learner presses that floor. Only that floor can light, no answer window is open, and the window opens when the doors open at the calling floor, as before (D105 unchanged). Rides back from a Concept Rescue test run stay automatic at the auto-ride pace. The headless harness presses hall calls itself so job-level tests stay about jobs. Accepted.

D119. Completion happens in the world, with no card: the landing restores and its core wakes, the panel lamps sweep once, Lifty names the rank and the clipboard, and free ride starts by itself. Reopening a completed mission goes to free ride at Floor 15 (this supersedes the completion card of D102; the rule that a cold start never opens a fresh intro stays). PLAY AGAIN moves into the Engineer Log as RUN FLOOR 15 AGAIN. Accepted.

D120. Routine rides are quiet: an answer ride keeps the job on screen instead of "Heading to Floor N" (the line is gone from the copy), free rides clear Lifty's bubble, and a free-ride arrival speaks only when the floor still has something undiscovered, after a short beat that blocks nothing. The DOOR CLOSE tip is shown once per learner after three lit rides, only in free ride or a taken hall call, and never to a learner who already used DOOR CLOSE with a call waiting. Accepted.

D121. Documented, not built: Dark Tower restoration (systems come back mission by mission; never show dead floors before their content exists), Teach Lifty (Lifty errs on a parallel problem and the learner corrects it; needs its own evidence semantics first), and Engineer Tools (Shaft Map, Load Gauge, Ruler, Scratchpad, Blueprint Viewer, Trip Counter as names only). B1 is not built and not revealed. Mission 2 waits for the M7.1 playtest. Accepted.

## 2026-10-07 (correction round: child-paced success, mission objects)

D122. Success reinforcement is learner-paced. After a correct answer the director runs `arrival` (the landing first, about 0.8 s), `animating` (Lifty's words and the success replay), then `review`, where everything stays on screen and NEXT JOB waits. No timer advances the academic sequence: only `nextJob()` in `review` does, for routine, stretch, mastery, cargo and post-rescue successes alike. The panel stays locked and no answer window opens until the next job presents itself (D105 unchanged). Waking the lift (not a job) still moves on by itself. The control is called NEXT JOB, a game action. Supersedes the timed advance of D113. Accepted.

D123. Concrete noun, concrete world representation. Each concrete thing a Floor 15 job names (repair kit, toolbox, spare parts, crew, beacon, loading dock) is content (`objectives.json`) bound to its step and copy line, validated, and drawn as a vector prop layered onto the landing it stands on. Destination objects appear only after the locked answer checks correct, so they never reveal a floor; they are absent at a wrong floor. Reference objects (the beacon) stand on their given floor. Objects are session state, never stored, never evidence; the repair kit, toolbox and parts can optionally be loaded into the lift with one tap. Accepted.

D124. World acknowledgement and learning reinforcement are separate. A routine success says what the world shows ("There it is: the repair kit.") and one way to the answer; the generic praise lines (first try, no clue, with help, route) are removed. Stretch, a changed plan and the success after a Concept Rescue keep one specific line. A wrong floor leads with the absence ("No repair kit here."). The resume greeting is shortened to "Welcome back." so the job line after it fits Lifty's bubble on Fire. Accepted.

D125. Concept art received (painted, warm brass cabin, round hovering Lifty, fantasy-world floors, a floor directory, a "Correct!" card). Not adopted yet. Recorded conflicts to decide first: fantasy floors versus the engineering tower, a directory with arrows versus the numbered panel that is the answer interface, generic "Correct!" praise and sparkles versus D124 and the no-confetti rule, an explanation card over the doorway, and an idling Lifty versus the sensory rule. Painted assets also need a source and license record (ART_DIRECTION.md) and a Fire memory budget from the Device Lab. Only the NEXT JOB pill style was taken from it. Open.

## 2026-10-07 (concept art decisions, recorded during the correction round)

D126. Resolves D125. The concept pack is the visual target: premium 2D / 2.5D cel-shaded art, illustrated depth, richer materials, warm/cool lighting. The current code-drawn vectors are placeholders and interaction geometry, not the final look. The pack was made with OpenAI image generation via ChatGPT for this project; it is a reference, not shippable art, and needs human review and redraw or approval before production use (ART_DIRECTION.md "Art sources"). A dedicated visual production / art integration milestone follows this round. Accepted.

D127. A mixed tower. Mostly grounded engineering and building floors, with a few surprising themed destinations: Floor 7 an original retro platformer-inspired world, Floor 9 an original Wind Ruins / sky-temple world, Floor 13 an original block-building world, Floor 20 Rooftop Golf. Destinations, not difficulty tiers. Designs stay original (no Nintendo, Mojang or Zelda properties). Not built; the Floor 7 machine room and its discovery key must move first. Accepted.

D128. The 20-button numbered panel stays the answer control. The concept's destination list becomes a separate directory placard or display (number, name, emblem, small preview). Strategy explanations never cover the doorway: they sit beside the destination or on a cabin-side surface, drawn on the real shaft and floors, and never describe controls that do not exist. NEXT JOB keeps the concept's bold yellow, tactile treatment within the 64 pt rules. The generic "Correct!" banner, sparkles and confetti are not adopted (D124 stands). Accepted.

D129. Lifty may get a very subtle hover in the visual milestone (at most about 0.5 Hz, small amplitude, still under Reduced Motion); contextual motion (pointing, thinking, attending, success) matters more than idle motion. Amends the "never idles" line in ART_DIRECTION.md; not built. Accepted.

