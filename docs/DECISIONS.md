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
