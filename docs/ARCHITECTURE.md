# Architecture

Technical decisions, module boundaries, persistence, and platform risks. Facts about external libraries and platforms carry a source and the date checked. Re-verify anything older than about three months before relying on it.

## 1. Stack

Installed now (M1 Device Lab + M2 engine). Versions come from `npx expo install`, which picks the SDK 57 compatible version. Do not bump native modules past what Expo recommends.

| Package | Version | Why it is here |
|---|---|---|
| expo | ~57.0.27 | framework (patch-bumped in M2 at Expo Doctor's request) |
| react / react-native | 19.2.3 / 0.86.3 | Expo SDK 57 pair |
| @shopify/react-native-skia | 2.6.2 | scene rendering, drawing surface |
| react-native-reanimated / react-native-worklets | 4.5.1 / 0.10.1 | UI-thread animation |
| react-native-gesture-handler | ~2.32.0 | touch, drag, drawing input |
| react-native-safe-area-context | ~5.7.0 | safe-area insets (RN core `SafeAreaView` is iOS-only) |
| expo-audio | ~57.0.5 | audio probe |
| expo-asset | ~57.0.19 | required peer of expo-audio (flagged by Expo Doctor) |
| expo-sqlite | ~57.0.4 | durability probe |
| zod | ^4.6.5 | runtime schemas for content, evidence, policy (pure JS, no dependencies) |
| expo-status-bar | ~57.0.1 | template default |
| Dev: typescript ~6.0.3, eslint 9 + eslint-config-expo ~57.0.2, jest ~29.7 + jest-expo ~57.0.5, @testing-library/react-native ^14.0.1, fast-check ^4.10.2, @types/jest, @types/node ^22 | | tooling. fast-check (depends only on pure-rand) is for property tests and is banned from engine production code. |

Not installed yet, on purpose: Expo Router, Zustand, Maestro, Rive, Drizzle. Each arrives with the milestone that first needs it.

Target stack (full product):

| Concern | Choice | Notes |
|---|---|---|
| App framework | Expo SDK 57 (React Native 0.86), development builds via prebuild. Never Expo Go for real testing. | Use expo >= 57.0.17 (see Hermes note) |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | |
| JS engine | Hermes v1 (Expo default since SDK 56) | |
| Scene rendering | `@shopify/react-native-skia` at the version Expo recommends (2.6.2 for SDK 57). Leading choice, not a permanent commitment. The Device Lab decides. | see section 5 |
| Animation | Reanimated 4 + react-native-worklets (UI thread) | requires New Architecture, which Expo 55+ mandates |
| Touch | react-native-gesture-handler (Expo-bundled version) | |
| Character animation | Skia sprite sheets + Reanimated first. Evaluate Rive only if that proves insufficient. | not installed |
| App navigation | Expo Router for the shell only (profile picker, hub, parent area) | gameplay scenes are managed by the scene runner, not routes |
| UI/session state | Zustand | small, no boilerplate |
| Durable state | expo-sqlite with WAL | single store |
| Schemas | Zod | types inferred from schemas |
| Audio | expo-audio with `preload()` | measure SFX latency on Fire in M1 |
| Tests | Jest via `jest-expo`, fast-check for property tests, Maestro for device E2E | |
| Lint | ESLint flat config from Expo, with import boundary rules (`eslint.config.js`) | Prettier not added yet |

Verified facts behind the table (checked 2026-10-06):
- Expo SDK 57 is latest stable (expo 57.0.26, 2026-09-29), React Native 0.86, Android 7+ (minSdk 24), targetSdk 36, iOS 16.4+. Sources: docs.expo.dev/versions/latest, expo.dev/changelog/sdk-57.
- New Architecture cannot be disabled from SDK 55 on. Source: docs.expo.dev/guides/new-architecture (modified 2026-09-03).
- Hermes v1 had a memory spike when importing Reanimated/worklets, fixed in expo 57.0.9. A dev-startup regression was fixed in 57.0.17. Source: SDK 57 changelog.
- expo-av was removed in SDK 55. expo-audio replaces it. Source: expo.dev/blog/upgrading-to-sdk-55 (2026-02-26).
- Expo SDK 57 bundles Skia 2.6.2, Reanimated 4.5.1, worklets 0.10.1. Source: expo@57.0.26 bundledNativeModules.json.
- expo-sqlite supports sync and async APIs, WAL, and lists Drizzle as compatible. Source: docs.expo.dev/versions/latest/sdk/sqlite.

### Why Expo + React Native for this product

This game is mostly structured interaction: tapping panels, dragging tiles, tracing letters, reading signs and manuals, settings, parent dashboards, accessibility labels. Real-time physics and 3D are absent. That profile favors a UI framework with a fast GPU canvas over a game engine with a weak UI layer.

- One TypeScript codebase for iPad and Fire. The learning engine, content validator, and tests share types.
- Native text rendering, accessibility APIs (VoiceOver, TalkBack/VoiceView), and native input methods for free. Game engines make all three harder.
- Skia gives a GPU canvas for layered 2.5D scenes and the drawing surface. Reanimated runs animation on the UI thread, so a busy JS thread does not drop frames.
- Amazon officially supports React Native and Expo on Fire tablets and recommends Expo in its getting-started guide. Sources: developer.amazon.com/docs/fire-tablets/get-started-with-react-native.html (2025-07-22), supported-react-native-libraries.html (2025-07-22).
- Fast iteration with coding agents: TypeScript, Jest, file-based content.

### Alternatives considered

| Option | Verdict | Reason |
|---|---|---|
| Godot 4.7 | Strong second choice | Better for scene-heavy animation and particles. Supports Android 7+ via the GLES3 Compatibility renderer (docs.godotengine.org system requirements, 4.7.2 released 2026-08-18). Weaker for text-heavy UI, accessibility, parent dashboards, and sharing a typed content/validation toolchain. Revisit only if M1 shows Skia cannot hold frame rate on Fire. |
| Unity | Rejected | Heavier runtime and install size on a 2 GB Fire 7, slower iteration, poor fit for UI-heavy screens. Licensing is no longer the blocker (Runtime Fee cancelled 2024-09-12, unity.com). |
| Flutter + Flame | Viable, not chosen | Comparable capability. Dart splits the toolchain and Fire-specific evidence is thinner. |
| Web app in a WebView (Capacitor) | Rejected | Fire WebView version and performance not verified, and WebView rendering on low-end GPUs is the riskiest path for animation. |

## 2. Module layout

One Expo app. Boundaries are enforced with ESLint `no-restricted-imports`, not packages.

Platform adapters (M6): code that differs between native and the browser playtest build lives only in files resolved by Metro platform extensions (`*.web.ts` next to the native `*.ts`): `src/platform/` (startApp, textExport, environment, launchParams, reload), `src/persistence/openAppDatabase`, and the Elevator Quest audio gate. Engine, runtime, director and UI code never check `Platform.OS === 'web'`. Developer tools live in `src/devtools/` and `src/themes/*/devtools/` and are stubbed out of production child bundles (see WEB_PLAYTEST.md).

What exists today (M7):

```
App.tsx                         root: gesture + safe-area providers; developer launcher (Elevator Quest / Device Lab /
                                developer tools) when a flag allows it, otherwise opens Elevator Quest directly
metro.config.js                 drops the Device Lab and the developer tools from production bundles without their flags
src/config/flags.ts             DEVICE_LAB_ENABLED, DEV_TOOLS_ENABLED, PLAYTEST_ENABLED, LAUNCHER_ENABLED
src/platform/                   platform adapters (*.ts native, *.web.ts browser): start, text export, environment,
                                launch params, reload, OS reduce-motion setting (osMotion.ts)
src/presentation/layout/        framework-free stage layout math (fit, arrangement, compact)
src/presentation/design/        design tokens (incl. place swatches and lights), cel bands, stencil digits (pure)
src/presentation/reinforcement/ success replay model and strategy choice (pure, theme-neutral, M7)
src/presentation/viewport.tsx   the window size the game lays out for (simulated in the developer tools)
src/engine/                     PURE TypeScript learning engine (M2), imports only zod and itself:
  random/        seeded PRNG (sfc32) and stable hashing (cyrb128, canonical JSON)
  skills/        SkillDefinition schema, levels, prerequisite graph validation
  evidence/      assistance scale, AttemptEvidence and CompletionRecord schemas, payload evolution (M7)
  content/       GeneratedItem, Activity, MasteryEncounter, ScaffoldingPolicy, ContentPack schemas; pack composition (M8)
  generation/    generator contract, generateItem, registry, the generators (math, and the authored reading item since M8)
  evaluation/    evaluateResponse (surfaces misconception tags)
  scaffolding/   per-activity help sequences on the shared assistance scale
  mastery/       MasteryPolicy + EngineConfig schemas (values live in content/engine-config.json)
  review/        spaced review schedule
  learner/       deterministic replay model, derived state types, exposure classification
  progression/   completion summaries, value tiers, opportunity upgrades, game-progress signals,
                 the event processor (evidence -> learner state -> upgrades + signals)
  mission/       mission schema, pure mission runtime (reducer, incl. abandon), presentation intents, pools (M8)
  eligibility/   explainable activity / encounter eligibility
  validation/    content pack validator with sampling budgets
  testing/       test-only helpers (not exported)
content/engine-config.json      mastery policy + validation budgets (tunable, initial-unvalidated)
content/fixtures/sample-pack.json  representative skills, activities, encounter, policies, misconceptions
content/fixtures/sample-missions.json  theme-neutral missions (quantity + literacy)
src/persistence/                SQLite only (M3): driver interface, migrations, repositories
  driver.ts      SqlExecutor / SqlDatabase interface and connection pragmas
  expoDatabase.ts  expo-sqlite adapter (the only file that imports a native module)
  migrations.ts  numbered, transactional, forward-only schema migrations (v4 since M7.1)
  store.ts       repositories for learners, learning events, missions, progression, cache, unlocks, settings
  sqljsDatabase.ts, openAppDatabase(.web).ts, web/   the browser adapter (sql.js + IndexedDB, M6)
  testing/       node:sqlite adapter with fault injection, for tests and benchmarks
src/runtime/                    non-rendering game service (M3, M4)
  gameRuntime.ts  commands -> pure runtime -> processor -> one transaction -> intents;
                  active mission held in memory (activate / check / currentView)
  unlocks.ts      content-defined unlock rules matched against committed signals
  devSeed.ts      developer-tool seeding on test learners (theme pack supplied by the caller)
  testing/        headless harness (temp DB, fake clock, answer finder)
  bench/          history-size benchmark (`npm run bench`)
src/themes/content/             theme copy schema and validator (missionCopy.ts), shared by theme packs
src/themes/catalog/             the world catalog (non-playable entries, portals)
src/themes/elevator-quest/      Elevator Quest (M4 to M7), see docs/ELEVATOR_QUEST.md
  sim/            render-free elevator state machine
  audio/          sound profile, cue mapping, mix (pure); expo-audio engine; asset map
  content/        loads the copy JSON (floor15.ts), the landing catalog (landings.ts) and the reading words (reading.ts, M8); contracts, helpers
  director/       theme adapter over the runtime (answer windows, success replay, recovery); playtest log
  art/            production art pipeline (pure): manifest schema and validator, rights cross-check, lookups,
                  crop and placement math (fit.ts); sources.ts holds the static requires of bundled art
  ui/             React Native + Skia components; pure layout, landing art and Lifty placement math
  ui/art/         art renderers: context (useArt), image slots with vector fallback and a byte-budgeted
                  cache, landing art layers, development overlays
  devtools/       developer-only jumps, scenarios, inspection (stubbed out of production bundles)
src/devtools/                   developer tools shell, viewport presets, calibration art set (WEB_PLAYTEST.md)
content/themes/elevator-quest/  floor15.json (all child-facing text), landings.json (20 landing identities, objects, spots),
                                reading.json (the words of the reading jobs, M8), objectives.json, art/manifest.json and art/rights.json (production art, D131)
assets/themes/elevator-quest/art/                     production art (only approved files are required from art/sources.ts; ART_ASSET_SPEC.md)
assets/dev/art/                 development calibration art + calibration.json (never in production bundles)
scripts/generate-art-calibration.js                   makes the calibration art
content/worlds/catalog.json     world catalog data
content/packs/core.json, content/packs/reading.json, content/missions/core.json   shipped theme-neutral learning content (the packs are composed, core first)
assets/themes/elevator-quest/audio/                   synthesized prototype sounds + manifest
scripts/generate-elevator-audio.js                    the synthesizer
src/dev/device-lab/             developer-only harness, see docs/DEVICE_LAB.md
src/dev/DeviceLabStub.tsx       production stand-in
scripts/check-fire-compat.js    Google Play / Firebase dependency scan
assets/dev/audio/               temporary lab sounds
```

Target layout (folders appear only when a milestone needs them):

```
app/                    Expo Router shell (profile picker, hub, parent, settings)
src/
  engine/               PURE TS. No react, react-native, expo, or I/O imports.
    skills/             skill graph, prerequisite checks
    mastery/            evidence, state transitions, spaced review
    templates/          item templates (generate, evaluate, distractors)
    policy/             failure response, struggle signals, challenge selection
    missions/           mission runner state machine
    rewards/            unlock rules, token award rules, ledger math
    rng.ts              seeded PRNG
  content/              Zod schemas, loaders, migrations of content versions
  persistence/          SQLite schema, migrations, repositories (only layer that touches the DB)
  presentation/
    scene/              Skia scene renderer, camera, layers
    interactions/       theme-agnostic interaction renderers (panelPress, letterTiles, trace...)
    hud/                mission steps, hint, settings, exit
    feedback/           proportional feedback and set pieces
  themes/               theme-pack runtime binding (loads content/themes/<id>)
  platform/             audio, haptics, device capability tier, orientation, file export
  parent/               Parent Mode screens and gate
content/                data: curriculum, activities, themes, narration manifests, engine-config.json
assets/                 images, audio, fonts, per theme pack
tools/                  validate-content CLI, asset checks, JSON schema export
```

Dependency direction: `themes/*/ui -> themes/*/director -> runtime -> persistence + engine`, `themes/*/sim` and `audio` cue logic depend on nothing, `persistence -> engine types`, `engine -> zod only`, `dev -> presentation/layout only` (never engine).

Enforced three ways:
- `eslint.config.js`: `src/themes/*/{sim,director,content}` and the pure audio and layout files may not import React, React Native, Expo, Skia, or the Device Lab. `src/runtime` and `src/persistence` may not import React, React Native, Skia, app layers, or Expo modules (only `src/persistence/expoDatabase.ts` may import expo-sqlite). Engine production files may not import React, React Native, Expo, Skia, Reanimated, worklets, Gesture Handler, SQLite, MMKV, Zustand, Drizzle, `node:*`/fs/path/network modules, app layers, or fast-check, and may not call `Date.now`, `Math.random`, `performance.now`, `new Date()`, `fetch`, or storage globals. `src/dev` may not import the engine.
- `src/engine/purity.test.ts`: import allowlist (relative + zod), banned-API scan, and a theme-vocabulary scan (no theme, setting, or learner names in engine code or the sample pack). Both rules were checked with positive controls.
- The `engine` Jest project runs in plain Node with no React Native setup, so a native import fails at runtime. The engine receives a `Clock`, `Rng`, and repository interfaces by injection so tests control time and randomness.

## 3. Runtime flow

```
Tap -> UI thread pressed state + sound (immediate, no I/O)
    -> runtime.check(instance, response)     pure, synchronous, in memory (active mission), no SQLite
    -> runtime.submit(instance, {commandId, value | optionId, basedOn: revision})
         applyCommand(missionCtx, checkpoint, command)   pure: new checkpoint, intents, learning events
         processor.apply(events)                          pure: learner state, upgrades, game signals
         ONE transaction: learning events + new progression events + checkpoint + derived cache
    -> PresentationIntent[]  (RESPONSE_RESULT, WORLD_EVENT, SHOW_ACTIVITY, STEP_COMPLETE, PROGRESSION_UPGRADE, ...)
    -> theme adapter maps intents to its fiction (car moves to floor N, a rune glows)
```

Optimistic vs authoritative:
- Optimistic, UI only: pressed state, tap sound, selection highlight. Never waits for evaluation, I/O, or SQLite.
- Optimistic, allowed: right/wrong via `check` on the in-memory checkpoint (deterministic, so the commit cannot disagree). Floor 15 shows it only after the ride, so the world delivers the consequence first.
- Authoritative, only from the committed result: step completion, mission completion, progression upgrades, game-progress signals.
- Writes are serialized through one queue in the runtime. expo-sqlite fails concurrent writers.
- The in-memory checkpoint advances only after a commit succeeds. A command built against an older revision (`basedOn`) is refused as stale and writes nothing.
- Measured (Node/V8, `npm run bench`, 2026-10-06): one committed command takes about 2.5 ms p50 and stays flat from 1k to 50k attempts of history. Not measured on a Fire tablet yet.

## 4. Persistence and save model

Single SQLite database per device (expo-sqlite), WAL mode, foreign keys on, `learner_id` on every learner row. The browser playtest build uses the same schema through sql.js saved to IndexedDB, behind the same `SqlDatabase` interface (`src/persistence/openAppDatabase(.web).ts`). Differences are listed in WEB_PLAYTEST.md.

Schema v4 (`src/persistence/migrations.ts`; v1 in M3, v2 in M4, v3 in M7, v4 in M7.1):

| Table | Kind | Purpose |
|---|---|---|
| `schema_migrations` | append | version, name, applied_at. Edited names and newer-than-app databases are refused. |
| `learners` | mutable | neutral id, theme pack, optional display name entered on device |
| `learning_events` | append-only (trigger-enforced) | the source of truth: attempt evidence and completion records, ordered by `seq` |
| `mission_instances` | mutable checkpoint | mission state, `revision` (optimistic concurrency), last command id and its intents. Status `active`, `completed` or (v3) `abandoned`. |
| `progression_events` | append-only (trigger-enforced) | announced opportunity upgrades, id `learner|key->tier` |
| `derived_cache` | cache | processor snapshot, `cache_key`, `through_seq`. Never authoritative. |
| `unlocks` (v2) | append-only (trigger-enforced) | in-game unlocks, unique per learner and unlock id |
| `learner_settings` (v2) | mutable | access and sensory settings (motion, sound output, effects volume) |
| `world_memory` (v4) | append-only (trigger-enforced) | what the world remembers about a learner's play that is not learning: places inspected, one-time tips shown. Theme-namespaced keys (`eq.discovery.floor-6`, `eq.tip.door-close`; a place that moves floors lists its old key as a legacy key, D130), unique per learner and key, written with `INSERT OR IGNORE` by `runtime.remember`, read by `runtime.memories`. Never read by the learning processor, progression, unlocks or value. Not a currency, never a balance. |

Planned for later milestones, not created yet: `sessions`, `accomplishments`, `token_ledger` (REWARDS.md), `reward_catalog`, `redemptions`.

Migrations: numbered, gap-free, forward-only. Each migration runs in its own transaction with its `schema_migrations` row, so a failure leaves no partial DDL. Tests cover fresh install, reopen, upgrade with data (v1 to v2, v2 to v3 keeping every checkpoint row, v3 to v4), rollback of a failing migration, and refusal of edited or future migrations. v3 rebuilds `mission_instances` to widen its status check (SQLite cannot alter a CHECK); the table is mutable by design and nothing references it.

Stored learning event payloads are read through `evidence/evolution.ts`: older payload versions are upgraded in memory one version at a time, never rewritten; newer or unreadable ones are refused with a typed error (LEARNING_MODEL.md section 12).

Transaction boundary (one per command): learning events + new progression events + mission checkpoint + derived cache commit together or not at all.

Idempotency (stable ids, `INSERT OR IGNORE` on UNIQUE ids):
- attempt `attempt:<instance>:<step>:stage<s>:item<i>:gen<g>`, completion `completion:<kind>:<instance>`
- progression event `<learner>|<key>-><tier>`: an upgrade is announced once, ever
- commands: the checkpoint stores the last command id and its intents. A retried command returns the stored intents and writes nothing.
- `startMission` with an existing instance id resumes instead of creating a second instance.

Derived cache: keyed by a hash of mastery policy, model and processor state versions, content pack id@version, and mission set version. Missing, stale-key, or unreadable snapshots are ignored and rebuilt from `learning_events`. A current snapshot is restored and only events after `through_seq` are applied. Tests assert cache == full replay after every scenario.

Crash assumptions: SQLite transactions are atomic on both platforms (WAL). A crash before commit loses the in-flight command only, and the UI retries it with the same command id. A crash after commit but before the UI saw the result is answered from the stored result. In-memory processor state is discarded whenever a commit fails.

Durability rules that still hold from M0:
- When mastery rules change, the cache key changes and state is rebuilt from `learning_events`. Ledger entries (future) are never recomputed.
- Backup: Parent Mode will export a JSON file through the OS share sheet / Files. Import restores into an empty install. Not built.
- No `AsyncStorage` for anything that matters.

Multiple learners: one database, `learner_id` on every row. No cross-learner queries exist outside Parent Mode, and Parent Mode never renders two learners' metrics side by side.

## 5. Rendering and animation

Skia is the leading renderer, chosen for the Device Lab to validate on Fire hardware. To keep it replaceable:
- Learning logic, scene geometry, and layout math are plain TypeScript (`src/presentation/layout`, `src/dev/device-lab/elevatorModel.ts` as the pattern). No Skia types outside rendering components.
- Game coordinates are logical stage units (1600 x 1000 in the lab), fitted to the window by `fitStage`. Nothing depends on device pixels or a fixed resolution.
- Interactive objects are React Native views (with accessibility props) layered over the canvas, or hit-tested from scene data. Skia draws, it does not own game state.
- Use Skia's Reanimated integration (shared values as props) for animation. Avoid Skia-only animation APIs, Skia `Picture` recording, and custom shaders until profiling justifies them.
- Shared values use `.get()` / `.set()`, which the React Compiler lint rules accept.
- Skia renders a Canvas's children with its own React renderer: React context from outside the Canvas does not reach them. Read context (for example `useArt()`) outside the Canvas and pass values in as props (`art.test.ts` checks where `useArt()` is called).
- Production art (D131 to D135): images are drawn with Skia `Image` from `useImage`, placed by pure math (`themes/elevator-quest/art/fit.ts`: cover or contain, never an uneven stretch), each with its vector drawing as the fallback while loading or if missing. Images load when their slot mounts; decoded images are cached within a byte budget (`ui/art/ArtSlot.tsx`); the destination landing loads while the car travels. Lighting is flat overlay images whose opacity follows state; no shaders, blur or particles.


- Scenes are layered parallax: 3-6 pre-lit image layers + a few animated elements + light effects. Lighting is painted into art. Dynamic light is additive glow sprites, not shaders, unless profiling proves a shader cheap on Fire.
- One Skia canvas per scene. Interactive objects are hit-tested in JS from scene data, mirrored by an invisible accessible view overlay for screen readers.
- Animation via Reanimated shared values driving Skia props. No per-frame React re-renders.
- Device capability tier (`low` for Fire 7 / HD 8, `standard` for Fire HD 10 / Max 11 / iPad): low tier drops parallax layers, particle counts, and texture resolution.
- Reduced motion swaps camera moves for cuts.

## 6. Audio

- expo-audio. Five buses: music, ambience, sfx, narration, dialogue. Quiet mode and per-bus volume applied in one mixer module.
- SFX preloaded per scene. Narration loaded per beat.
- All assets loudness-normalized in the asset pipeline (target to be set in M1 by listening tests on the actual tablets). No asset ships without normalization.
- Narration is pre-generated or recorded files with a manifest keyed by line ID. No runtime TTS.
- Fallback if expo-audio latency is poor for SFX in M1: react-native-audio-api (Software Mansion), currently 0.13.6, pre-1.0. Treat it as an experiment.

## 7. Drawing and handwriting

- One reusable `DrawingSurface`: Gesture Handler pan on the UI thread -> points into a shared value -> Skia path render. Strokes stored as arrays of `{x, y, t, pressure?}` in normalized coordinates.
- Tracing evaluation in pure TS (`src/engine/templates/trace`): sample the target path, measure coverage (share of target samples within tolerance of a child stroke) and deviation (share of child points far from the target). Optional stroke order and direction later.
- Recognition is deferred. Elevator Quest annotation uses the same surface.

## 8. Assets

- All assets ship in the app bundle. Grouped per theme pack and per world, loaded on world entry, released on exit.
- Images: WebP (lossy for painted art, lossless or alpha for transparent pieces), PNG accepted for transparent pieces. Elevator Quest uses one runtime size per asset today (docs/ART_ASSET_SPEC.md); a second tier waits for the Fire memory measurement. Checked 2026-10-07: Metro bundles both formats, the installed Skia native libraries include a WebP decoder, and the browser build decodes WebP; device decode time and memory are not measured.
- Audio: AAC (.m4a) for music and narration, short SFX as AAC or WAV after M1 latency tests.
- An asset budget per scene (texture memory) is set in M1 from Fire HD 8 measurements and enforced by `tools/` checks.

## 9. Testing

Current state (M7): `npm run verify` runs `tsc --noEmit`, `expo lint`, Jest, and `scripts/check-fire-compat.js`. `jest.config.js` defines four projects plus an opt-in fifth. `engine`: plain Node, Babel TypeScript transform only, `src/engine/**/*.test.ts`. `runtime`: plain Node, `src/persistence` and `src/runtime` tests against real SQLite files through `node:sqlite` (migrations, headless full flow, crash injection at commit boundaries, cache, literacy, fake presentation adapters, active mission, unlocks, settings). `theme`: plain Node, `src/themes/**/*.test.ts` (elevator simulation, audio semantics and assets, layout, the Floor 15 director headless on real SQLite and virtual time, save and resume, theme boundary). `*.test.tsx` under `src/themes` run in `app` (the rendered Floor 15 screen). `bench`: only with `BENCH=1` (`npm run bench`). `app`: `jest-expo` plus `jest.setup.ts` (Gesture Handler setup, Reanimated `setUpTests`, the safe-area library mock, and a minimal Skia stand-in) and `jest.resolver.js` (composes jest-expo's resolver with the one shipped by react-native-worklets). SQLite SQL is tested against Node's built-in `node:sqlite` with a file database. The native adapter (`expoDatabase.ts`) is exercised against a substituted bridge backed by real separate SQLite connections, including per-connection foreign keys, rollback and connection cleanup. Native rendering, audio and the actual expo-sqlite bindings are not exercised in Jest; the physical checklist covers those.

`npm run test:engine` runs the engine alone. `npm run validate:content[:release]` validates the packs, missions, theme copy, reading words, landing catalog and world catalog at the `ci` or `release` sampling budget (budget names in `content/engine-config.json`; "ci" is a budget size, not a running CI service). Browser checks: `npm run web:e2e` and `npm run web:screenshots` against `npm run web:export` (WEB_PLAYTEST.md). `npm run check:bundle` exports the Android and iOS production bundles and fails if developer-only code is inside.

TypeScript 6 no longer auto-includes `@types/*`. `tsconfig.json` lists `"types": ["jest"]`, and Node-environment tests add `/// <reference types="node" />`.


| Layer | Tooling | Expectation |
|---|---|---|
| Engine | Jest (node env) + fast-check | near-full coverage. Property tests for mastery monotonicity, ledger invariants, template invariants, determinism by seed. |
| Content | `npm run validate:content` (Jest suites) | run locally before a commit; no CI yet |
| Persistence | Jest with fixture DBs | migration tests from every prior schema version |
| Components | jest-expo + React Native Testing Library | interaction renderers only |
| Device E2E | Maestro | slice happy path, kill-and-resume, quiet mode |
| Performance | on-device: Android `adb shell dumpsys gfxinfo`, Perf Monitor, Xcode Instruments | tracked per milestone on the real Fire tablet |

CI: none is configured. The repository has no `.github/workflows`, so nothing runs on push. Contributors run `npm run verify` (and the content, browser and bundle checks above) locally before committing. A GitHub Actions workflow running typecheck, lint, Jest and content validation is the plan, not the state. Device tests are manual per milestone with the Device Lab.

## 10. Amazon Fire specifics

Verified 2026-10-06:
- Current Fire tablets run Fire OS 8 (Android 10/11, API 29/30). Amazon requires targetSdk >= 30 for Fire OS 8 devices. Sources: developer.amazon.com fire-os-8 (2025-09-10), device-filtering-and-compatibility (2026-05-27).
- Fire OS 14 and 16 are Fire TV only. Vega OS is Fire TV Sticks, not tablets.
- Hardware floor (Amazon spec pages, 2025-04-09): Fire 7 (2022) MT8168, Mali-G52 MC1, 2 GB. Fire HD 8 (2022/2024) Mali-G52 MC2, 2-4 GB. Fire HD 10 (2023) 3 GB. Fire Max 11 (2023) 4 GB.
- Amazon Appstore closed on non-Fire Android on 2025-08-20 and continues on Fire tablets. Source: Amazon developer blog 2025-02-20.
- No Google Play Services on Fire OS. Amazon: "any library that requires this will not be compatible." Source: supported-react-native-libraries (2025-07-22).
- Reported (Reuters via TechAdvisor, 2025-08-29) but not verified as launched: a premium 2026 Fire tablet on open Android. Do not plan around it.

Automated check: `npm run check:fire` scans every native Android module in node_modules for Google Play Services, Firebase, Play Core, Billing, and Integrity references. It passed on 2026-10-06 with 18 native modules. A positive control (fake module with `play-services-location`) made it fail as expected. It does not see dependencies injected by config plugins at prebuild. `expo prebuild` output was inspected manually on 2026-10-06: no Google references.

Generated Android manifest (prebuild, 2026-10-06) requests INTERNET, MODIFY_AUDIO_SETTINGS, VIBRATE, SYSTEM_ALERT_WINDOW, and READ/WRITE_EXTERNAL_STORAGE (maxSdk 32, so they apply on Fire OS 8 / API 30). No RECORD_AUDIO and no foreground services, because the expo-audio plugin is configured with recording and background playback off (its defaults are on). Before store submission, review SYSTEM_ALERT_WINDOW and the storage permissions with `android.blockedPermissions`.

Default React Native builds include four ABIs (armeabi-v7a, arm64-v8a, x86, x86_64). Skia's static libraries are large (about 48-61 MB per ABI before linking). Measure APK size in the device run and consider ABI splits for distribution. Record each Fire device's `ro.product.cpu.abilist`.

`@expo/dom-webview` is a native dependency of `expo` itself and is autolinked even though nothing uses it. No Google dependency. Noted, not acted on.

Libraries to avoid or isolate (Google dependency read from Expo SDK 57 module build files):
- `expo-notifications` (firebase-messaging). Not needed. No push notifications in V1.
- `expo-location` (play-services-location). Not needed.
- `expo-store-review` (Play review API). Not needed.
- Google Sign-In, Firebase (Analytics, Crashlytics, Auth), Play Integrity, Play Billing, Google Mobile Ads. Not needed and against product rules anyway.
- Any WebView-based rendering. Fire WebView version not verified.

Safe as checked: expo-audio, expo-sqlite, expo-updates have no Google dependency in their build files. Every new native dependency must be checked for Google dependencies before adding (rule in CLAUDE.md).

Target device decision: the M1 floor device is a Fire HD 8 (2022 or 2024). Fire 7 (2 GB) is best-effort until proven.

## 11. Apple specifics

- iPadOS 26 deprecated `UIRequiresFullScreen`. Apple says support all orientations and resizable scenes. From iOS/iPadOS 27 SDK builds, the key no longer opts out of resizing. A launch screen is required for submission from iOS 27. Source: Apple TN3192, revised 2026-08-13. Consequence: layouts are fluid, see GAME_DESIGN.md.
- Kids Category (App Store Review Guidelines 1.3 and 5.1.4, checked 2026-10-06, page undated): no third-party analytics or ads in practice, no links out or purchases outside a parental gate, privacy policy required, COPPA compliance. Our offline, no-SDK design already fits.
- iOS 16.4+ minimum through Expo SDK 57.
- `app.json`: `orientation: "default"`, `ios.supportsTablet: true`, `ios.requireFullScreen: false`. Prebuild output (2026-10-06) lists all four orientations for iPad and `UIRequiresFullScreen` false. No microphone usage string and no background audio mode.

## 12. Cloud boundary (future, optional)

V1 makes zero network calls during gameplay. If sync or backup arrives later:
- It reads from the append-only tables (`attempts`, `token_ledger`, `inventory`, `accomplishments`). They merge naturally by ID.
- It lives in one `sync/` module behind an interface, off by default, parent-enabled.
- Gameplay never waits on it. Content never comes from it without passing the validator.
- UUIDs on every append-only row from day one keep this door open at no cost.

## 13. Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| Skia/Reanimated frame rate on Mali-G52 MC2 | stutter on the performance floor | M1 spike on real hardware before any art investment. Capability tiers. |
| Skia v3 (Graphite/Vulkan, Android API 26+) becomes the only maintained line | forced migration, unknown Vulkan quality on Fire GPUs | use the Expo-recommended version. Test any major upgrade in the Device Lab on Fire first. Vulkan on Fire models not verified. |
| expo-audio SFX latency | feedback feels laggy | measure in M1, fallback library identified |
| Memory on 2-3 GB devices | crashes during set pieces | per-scene texture budgets, world-scoped loading |
| iPad resizable windows | broken layouts | fluid stage layout from the first scene |
| Content volume | slice feels thin | templates over hand lists, validator from M2 |
| Tuning the mastery model | farming or frustration | debug panel + playtests in M5, rules versioned and replayable |
| Native SQLite adapter uses an isolated transaction connection | The adapter enables foreign keys before BEGIN IMMEDIATE and closes the connection after commit/rollback. A real-SQLite bridge regression verifies enforcement and rollback; native bindings remain untested in cloud. | Confirm constraint enforcement and crash recovery on device. |
| Synthesized prototype sounds | elevator may not feel authentic | replace with licensed recordings before release (ELEVATOR_QUEST.md). |
| Full rebuild cost after a policy change | slow launch with long histories | measured 2.3 s for 50k attempts on Node/V8, dominated by loading and re-validating rows. Hermes on Fire will be slower (not measured). Rebuild only on cache-key change. Move rebuild off the launch path before a policy change ships. |
| Bundle size growth with narration | slow installs on Fire storage | AAC, per-world packs, track size per milestone |
| Single developer + agents drifting from philosophy | generic edu-app result | CLAUDE.md non-negotiables, slice success criteria tied to children's play |
