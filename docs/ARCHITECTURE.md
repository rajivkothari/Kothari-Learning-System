# Architecture

Technical decisions, module boundaries, persistence, and platform risks. Facts about external libraries and platforms carry a source and the date checked. Re-verify anything older than about three months before relying on it.

## 1. Stack

Installed now (M1, Device Lab). Versions come from `npx expo install`, which picks the SDK 57 compatible version. Do not bump native modules past what Expo recommends.

| Package | Version | Why it is here |
|---|---|---|
| expo | ~57.0.26 | framework |
| react / react-native | 19.2.3 / 0.86.3 | Expo SDK 57 pair |
| @shopify/react-native-skia | 2.6.2 | scene rendering, drawing surface |
| react-native-reanimated / react-native-worklets | 4.5.1 / 0.10.1 | UI-thread animation |
| react-native-gesture-handler | ~2.32.0 | touch, drag, drawing input |
| react-native-safe-area-context | ~5.7.0 | safe-area insets (RN core `SafeAreaView` is iOS-only) |
| expo-audio | ~57.0.5 | audio probe |
| expo-asset | ~57.0.18 | required peer of expo-audio (flagged by Expo Doctor) |
| expo-sqlite | ~57.0.3 | durability probe |
| expo-status-bar | ~57.0.1 | template default |
| Dev: typescript ~6.0.3, eslint 9 + eslint-config-expo ~57.0.2, jest ~29.7 + jest-expo ~57.0.5, @testing-library/react-native ^14.0.1, @types/jest, @types/node ^22 | | tooling |

Not installed yet, on purpose: Expo Router, Zustand, Zod, fast-check, Maestro, Rive, Drizzle. Each arrives with the milestone that first needs it.

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

What exists today (M1):

```
App.tsx                         root: gesture + safe-area providers, Device Lab or placeholder
metro.config.js                 drops the Device Lab from production bundles without the flag
src/config/flags.ts             DEVICE_LAB_ENABLED
src/presentation/layout/        framework-free stage layout math (fit, arrangement, compact)
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

Dependency direction: `presentation -> engine`, `persistence -> engine types`, `engine -> nothing`, `dev -> presentation/layout only` (never engine).

Enforced by `eslint.config.js` (engine and layout math may not import React, React Native, Expo, or Skia; `src/dev` may not import the engine) and by `src/dev/device-lab/boundaries.test.ts`. The engine receives a `Clock`, `Rng`, and repository interfaces by injection so tests control time and randomness.

## 3. Runtime flow

```
Tap -> interaction renderer -> Response
  -> engine.evaluate(item, response) -> Evaluation (correct, misconception tag)
  -> engine.policy.next(state, evaluation, signals) -> Action (retry | feedback | clue | representation | guided | advance)
  -> persistence: append Attempt (transaction) -> update skill_state cache
  -> presentation plays world effect (car moves, hat appears)
```

Visual feedback on tap starts on the UI thread immediately (pressed state, sound) and never waits for evaluation or the database write.

## 4. Persistence and save model

Single SQLite database per device, WAL mode, one profile column on every learner table.

| Table | Kind | Purpose |
|---|---|---|
| `learners` | mutable | profile, theme pack, support profile |
| `learner_settings` | mutable | access and sensory settings |
| `sessions` | append | start/end, device, app version |
| `attempts` | append-only | every scored response: activity, template, seed, variant hash, response, correct, misconception, assistance level, context, timings, content version, rules version |
| `skill_state` | cache | derived mastery per skill. Rebuildable from `attempts`. |
| `mission_progress` | mutable | current mission, beat index, encounter stage, resumable checkpoint |
| `inventory` | append | in-game unlocks with source |
| `accomplishments` | append | permanent major achievements |
| `token_ledger` | append-only | see REWARDS.md. Unique (learner, idempotency_key). |
| `reward_catalog` | mutable | parent-defined rewards |
| `redemptions` | mutable status | request lifecycle, linked to ledger entries |
| `meta` | mutable | schema version, rules version, last backup |

Durability rules:
- Every attempt commits in its own transaction before the next beat starts. A crash loses at most the in-flight tap.
- Mission checkpoints save at each beat boundary. Relaunch resumes the beat.
- Schema migrations are numbered, forward-only, and tested against fixture databases from every prior version.
- When mastery rules change, bump `rules_version` and rebuild `skill_state` from `attempts`. Ledger entries are never recomputed.
- Backup: Parent Mode exports a JSON file (all learner data) through the OS share sheet / Files. Import restores into an empty install. This is the recovery path for a lost or replaced tablet.
- No `AsyncStorage` for anything that matters. Tiny UI prefs go in the same SQLite file (expo-sqlite kv-store) to keep one store.

Multiple learners: one database, `learner_id` on every row, the profile picker sets the active learner. No cross-learner queries exist outside Parent Mode, and Parent Mode never renders two learners' metrics side by side.

## 5. Rendering and animation

Skia is the leading renderer, chosen for the Device Lab to validate on Fire hardware. To keep it replaceable:
- Learning logic, scene geometry, and layout math are plain TypeScript (`src/presentation/layout`, `src/dev/device-lab/elevatorModel.ts` as the pattern). No Skia types outside rendering components.
- Game coordinates are logical stage units (1600 x 1000 in the lab), fitted to the window by `fitStage`. Nothing depends on device pixels or a fixed resolution.
- Interactive objects are React Native views (with accessibility props) layered over the canvas, or hit-tested from scene data. Skia draws, it does not own game state.
- Use Skia's Reanimated integration (shared values as props) for animation. Avoid Skia-only animation APIs, Skia `Picture` recording, and custom shaders until profiling justifies them.
- Shared values use `.get()` / `.set()`, which the React Compiler lint rules accept.


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
- Images: WebP (lossy for painted art, lossless for UI). Two resolution tiers. Atlases for small UI sprites.
- Audio: AAC (.m4a) for music and narration, short SFX as AAC or WAV after M1 latency tests.
- An asset budget per scene (texture memory) is set in M1 from Fire HD 8 measurements and enforced by `tools/` checks.

## 9. Testing

Current state (M1): `npm run verify` runs `tsc --noEmit`, `expo lint`, Jest, and `scripts/check-fire-compat.js`. Jest uses `jest-expo` plus `jest.setup.ts` (Gesture Handler setup, Reanimated `setUpTests`, the safe-area library mock, and a minimal Skia stand-in) and `jest.resolver.js` (composes jest-expo's resolver with the one shipped by react-native-worklets). SQLite SQL is tested against Node's built-in `node:sqlite` with a file database. Native rendering, audio, and expo-sqlite bindings are not exercised in Jest. That is what the physical checklist covers.

TypeScript 6 no longer auto-includes `@types/*`. `tsconfig.json` lists `"types": ["jest"]`, and Node-environment tests add `/// <reference types="node" />`.


| Layer | Tooling | Expectation |
|---|---|---|
| Engine | Jest (node env) + fast-check | near-full coverage. Property tests for mastery monotonicity, ledger invariants, template invariants, determinism by seed. |
| Content | `validate-content` CLI | runs in CI and pre-build |
| Persistence | Jest with fixture DBs | migration tests from every prior schema version |
| Components | jest-expo + React Native Testing Library | interaction renderers only |
| Device E2E | Maestro | slice happy path, kill-and-resume, quiet mode |
| Performance | on-device: Android `adb shell dumpsys gfxinfo`, Perf Monitor, Xcode Instruments | tracked per milestone on the real Fire tablet |

CI: GitHub Actions running typecheck, lint, Jest, and content validation on every push. Device tests are manual per milestone until a device lab exists.

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
| Tuning the mastery model | farming or frustration | debug panel + playtests in M4, rules versioned and replayable |
| Bundle size growth with narration | slow installs on Fire storage | AAC, per-world packs, track size per milestone |
| Single developer + agents drifting from philosophy | generic edu-app result | CLAUDE.md non-negotiables, slice success criteria tied to children's play |
