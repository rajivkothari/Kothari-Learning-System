# CLAUDE.md

Guide for coding agents working in this repository. Read this first, then the doc relevant to your task.

## What this is

An offline educational adventure-game engine for iPad and Amazon Fire tablets. One engine, many themed experiences. The first two: Elevator Quest (learner-engineer archetype, engineering) and Magic Tower (learner-storyteller archetype, storybook fantasy). Learning spans Pre-K to Grade 8, driven by skills and mastery, not grade.

## Current phase

M8.1 (built in software, D158 to D163). Art: the owner's instruction approved every pending file after an agent audit (D158; the rights records say `approvedBy: "project owner, by instruction for M8.1 (2026-10-08), after an agent audit"`, so no person looked at each file). Production now draws every illustrated landing (Floors 1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20), the moving props and all six Lifty poses; `src/devtools/artReviewSources.ts` is empty, the rejected Quiet stays rejected, and vectors stay the fallback. The building directory (D159): a DIRECTORY control beside the panel (`ui/Directory.tsx`) opens all twenty floors; opening it is normal task behaviour (`director.directoryOpened()` / `directoryClosed()`: world memory `eq.tip.directory` and a log line, never a runtime command, help or evidence), and Lifty introduces it once per learner (`view.directoryHint`). Reading items in `reading.json` gain `places` and `solve` (a ride is answerable from its note plus the directory, validated), `clue` (CLUE says the item's own strategy) and `emphasis` (bold words, validated against answer leaks: `leak.emphasis`, `leak.clue`). Readability (D160): text roles and floors in `ui/textRoles.ts` (question 24 to 28 pt, Lifty 20 to 24, passage and cards 20 to 24, labels at least 16); a box too small scrolls, never shrinks its words. Landing play during jobs (D161): while a job waits with its answer elsewhere, the open landing's things react quietly (reaction and sound only: no discovery, no Lifty line, never evidence; `QUIET_STAGES` in `director/landingTouch.ts` is call, task, cargo, pause and success). Before, `touchMode()` returned null whenever a job waited, so the Floor 20 golf ball (where "calls going down" jobs park the car) drew no hotspot and a tap hit bare canvas. Nothing reacts with the note open over the landing, the doors moving or shut, or in the intro, a correction board or the finale. New: the `slide` reaction (the Archive's plan drawer), a windmill hub that turns, a golf flag that flutters, a drawn ball of at least 6 pt, spot `sound` / `closeSound` fields. Sound (D162): a generated ElevenLabs pack `elevenlabs-v1` (`assets/themes/elevator-quest/audio/manifest.json` pack status), approved by the owner after confirming a paid ElevenLabs subscription (D163): every build plays it through `PRODUCTION_PROFILE`; the browser build can switch with `audio/activeSet.web.ts` (`?sound=placeholder` for the synthesized set). A pack's status line plus `node scripts/generate-elevator-audio.js --sources` decides where its files go. Nobody has listened to the pack on a device yet. New sound slots for every landing thing, `golfPutt`, `answerRight`, `answerWrong` and `discovery`; voice limits in `audio/voices.ts`.

M8, a richer tower (built in software): ride, discover, touch, read, operate, see the reaction. Content packs compose (`content/packs/reading.json` after `core.json`, `src/engine/content/compose.ts`) and a mission step can be a pool (`activityIds`, one member per instance picked from the seed, `src/engine/mission/pool.ts`), D154. Mission `positions-and-capacity` is version 3: fourteen jobs a run, ten math (21 new activities; generators `missingInSequence@1`, `tensAndOnes@1`, `orderPositions@1`, `positionAfterTwoMoves@2`, `combineGroups@2`; about 39% review, 47% second grade, 14% stretch) and four reading jobs `read-1` to `read-4`. Language Arts (D155): `literacy.authoredItem@1`, six `ela.*` skills, 31 authored items whose words live in `content/themes/elevator-quest/reading.json`; the learner touches a thing on a landing, rides to a floor, or picks a card; CLUE lights the key sentence, SHOW ME shows the answer, a second miss brings a fresh item, no Concept Rescue. Landing play (D156): `objects` and up to three `explore` spots per landing in `landings.json`, twelve floors to touch, one reaction vocabulary (spin, tilt, bounce, lower, glow, lights, open, putt), touch modes explore, quiet and answer (`director/landingTouch.ts`), world state only, never evidence. Six more illustrated landings (2, 5, 6, 11, 17, 18) and the moving props were pending review in M8 (D157) and are approved since M8.1 (D158); a read-and-touch job answers with cards only where the illustrated landing is not drawn or an option has no place on it (Floor 1's plant and bench).

Visual production milestone (built in software; the first production art is approved: the illustrated cabin and Lifty's neutral pose, D145). The mixed tower: 7 PLATFORM HEIGHTS, 9 WIND RUINS, 13 BLOCK BUILDER, 20 ROOFTOP GOLF, and the Machine Room moved to Floor 6 with its old discovery key kept as a legacy key (D130). The art pipeline: `content/themes/elevator-quest/art/manifest.json` (typed, `src/themes/elevator-quest/art/manifest.ts`), a separate rights record (`rights.json`), static requires in `art/sources.ts`, crop and placement math in `art/fit.ts`, renderers in `src/themes/elevator-quest/ui/art/` with every vector kept as the fallback and the interaction geometry (D131, D132). Production shows only approved, bundled art whose rights record says human reviewed (for the M8.1 set that is the owner's approval by instruction after an agent audit, D158); the concept pack is reference-only. Skia draws a Canvas's children in its own renderer, so components inside a Canvas get the art settings as a prop, never from `useArt()`. Development calibration patterns live in `assets/dev/art/` (regenerate with `node scripts/generate-art-calibration.js`) and never ship. docs/ART_ASSET_SPEC.md is the brief for whoever makes the art. Lifty hovers very slightly (D133); a building directory sits beside the panel (D134; since M8.1 a DIRECTORY control opens it, its rows are never a control, D159). Resolved after the first asset sheets: illustrated landings carry the floor number on the live sign (D136), production Lifty is the screen-face robot with six poses (D137), and both sheets are reference-only with stricter originality briefs for floors 7, 9, 13 and 20 (D138). Since the second art delivery (D141) the art tests decode every file in the art folder against its manifest entry, Lifty art shows only once the neutral pose exists, and the backing spec carries measured zones. Owner decisions (D142): the Quiet candidate is rejected; the illustrated cabin is all or nothing (backing, three frame strips, both doors; "Inspect cabin pieces" is the only partial view); Lifty is bigger (132 pt drawing on iPad, 120 on Fire) without shrinking the doorway; the frame is 20 pt with 32:1 strips. Playtest builds have Settings > Start over (D143): a fresh learner generation, nothing deleted. The first real illustrated candidates (D144, Canva AI image generation) are in the repository: the cabin back wall, three frame strips, both doors, the ceiling, floor and side walls, and Lifty's neutral pose. The owner approved all eleven (D145): they are in `art/sources.ts`, so every build draws them and vectors stay the fallback. New candidates go in `src/devtools/artReviewSources.ts` first and draw in Review (`?open=quest&art=review`); after approval their line moves to `art/sources.ts`. Lifty's five other poses (Quiet, Success, Help, Concerned, Thinking) are edits of the neutral master (D147), approved in M8.1 (D158); a pose that is loading or fails to decode shows the neutral image. `node scripts/lifty-board.js` renders the character review board. The browser save: the newest tab wins (D146). Landing art for Floors 1, 7, 9, 13, 15 and 20 (D150): one Canva background per floor (Floor 15: the dormant scene as the base and the restored scene over it), approved in M8.1 with the M8 set (D158). A landing background declares its painted sign plate (`sign`, canvas fractions inside the safe core) and the live name centres on it at every doorway shape.

Wider math in Floor 15 (D148, built in software): mission `positions-and-capacity` is version 2 with eleven jobs, each kind once per run. New theme-neutral generators `positionAfterTwoMoves`, `startBeforeMove`, `equalJumps` (skip counting by 2, 3, 5: the multiplication entry point, skill `math.mult.equalGroups.within20`), `distanceBetween` and `combineGroups`. `src/themes/elevator-quest/director/jobs.ts` maps each concept to a job; a count answer ("how many floors?") uses the trip meter (`ui/TripMeter.tsx`), which rides the count. Help copy can have per-job words (`help.<kind>.jobs`). Dev jumps were re-indexed (`devtools/floor15Tools.ts`); tests pinned to a searched seed must be re-searched whenever the mission version changes (item seeds include it).

Corrections (D149, built in software): a practice miss shows its consequence (the shaft map draws the wrong move against the job; a wrong load opens the load meter with the room left outlined), Lifty gives one cue, LET'S COUNT (child-paced) counts the learner's own job on the rescue board, then "New job." brings a fresh equivalent job. Engine: Concept Rescue `example: "target"` with `returnTo: "fresh"`, one rescue per item lineage; the missed job is one incorrect attempt, nothing on the board is evidence, the fresh job is `guided` (never independent), and the playtest report says whether it went right first try without help. The encounter keeps its parallel test run at five misses.

Correction round on top of M7.1 (built in software): child-paced success (arrival, replay, then NEXT JOB; no timer advances a job, D122), mission objects on the landings from `content/themes/elevator-quest/objectives.json` (D123), and less talk around a success (D124). Concept art decisions are recorded (D126 to D129): the concept pack is the visual target and the current vectors are placeholders, the tower is mixed (special floors 7, 9, 13, 20, all original designs), the numbered panel stays with a directory beside it. The art overhaul is the next milestone; do not start it inside other work.

M7.1 built in software (the fun and exploration pass): after Floor 15 the building is the game. Free-ride exploration on five floors (5, 6, 15, 17, 18; the Machine Room was on 7 until D130) where the child touches an object, it reacts, and the discovery is remembered per learner in `world_memory` (schema v4, never learning evidence); the Engineer Log clipboard; hall calls between jobs instead of automatic dispatch rides; an in-world completion with no card; quieter routine rides; a once-per-learner DOOR CLOSE tip. GAME_DESIGN.md "The building is the game" has the design, ELEVATOR_QUEST.md "Exploration" the mechanics. Dark Tower, Teach Lifty and Engineer Tools are documented only. Do not start Mission 2 before the M7.1 playtest.

M7 built in software: Floor 15 stabilized and made more engaging. Explicit answer windows (a tap only answers the item that was accepting answers), recovery for content changes (abandoned runs, schema v3) and stuck saves (TRY AGAIN), a learning-event evolution point, a Fire-visible help cue, the OS reduce-motion default, travel frame callbacks only while moving, 20 data-driven landing identities (`content/themes/elevator-quest/landings.json`) with Floor 15 dormant until restored, Lifty in the scene at eye level, and the success replay (`src/presentation/reinforcement/`). It sits on M6 (browser playtest build, docs/WEB_PLAYTEST.md), M5 (cel-shaded Floor 15, Concept Rescue, theme text as JSON in `content/themes/`) and M4 (`src/themes/elevator-quest/`, docs/ELEVATOR_QUEST.md). The pure engine (`src/engine/`) stays theme-neutral, `src/persistence/` holds SQLite schema v4, and `src/runtime/gameRuntime.ts` commits each command in one transaction. The browser is a development target only. Physical device runs and the first child playtest (docs/PLAYTEST.md) are still pending, so renderer acceptance is provisional, and the generated sound pack (D163) has not been heard on a tablet yet. See [docs/ROADMAP.md](docs/ROADMAP.md). Do not add missions, the Magic Tower, Quest Tokens, portals, or new playable worlds unless the user asks.

## Commands

```bash
npm run verify            # typecheck + lint + Jest (app, engine, runtime and theme projects) + Fire dependency scan. Run before every commit. There is no CI: this is the gate.
npm run test:engine       # engine only, plain Node
npx jest --selectProjects runtime   # persistence + runtime against real SQLite (node:sqlite)
npm run bench             # history benchmark at 1k/10k/50k attempts (BENCH_SIZES=1000 for a quick run)
npm run validate:content  # packs + missions at the "ci" sampling budget, theme copy, reading words, landing catalog, world catalog (:release for the release budget)
npx jest --selectProjects theme   # elevator simulation, audio semantics, Floor 15 director headless, layout
node scripts/generate-elevator-audio.js   # regenerate the synthesized prototype elevator sounds + their manifest entries (other packs are kept)
node scripts/generate-elevator-audio.js --sources   # rewrite the sound require lists from the pack statuses (after approving or rejecting a pack)
node scripts/generate-art-calibration.js  # regenerate the development calibration art (assets/dev/art) + its manifest and require list
npm run web:playtest      # browser playtest dev server (http://localhost:8081): launcher, game, developer tools
                          # URL switches: ?open=quest&art=review|vector; ?sound=placeholder|production (default: the newest pack that is not rejected)
npm run web:export        # static browser playtest build in dist-web/ (npm run web:serve to serve it)
npm run web:e2e           # plays Floor 15 in Chromium against dist-web (needs Chrome or CHROMIUM_PATH)
npm run web:screenshots   # visual-review captures from dist-web into web-screenshots/
npm run check:bundle      # exports Android + iOS production bundles and fails if developer-only code is inside
npm run doctor            # Expo Doctor
npx expo install <pkg>    # ALWAYS use for adding packages; picks SDK-compatible versions
npm run android | ios     # dev builds
npm run lab:android:release | lab:ios:release   # release builds with the Device Lab, for measurements
```

Expo changes between SDKs. Before touching an Expo or React Native API, check the docs for the installed SDK (`https://docs.expo.dev/versions/v57.0.0/`) or `https://docs.expo.dev/llms.txt`, not memory. `ios/` and `android/` are generated by `expo prebuild` and gitignored. Never edit them by hand. Configure native behavior in `app.json`.

## Doc map

| Doc | Read when you are... |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | doing anything. Vision, principles, non-goals. |
| [docs/LEARNER_PROFILES.md](docs/LEARNER_PROFILES.md) | designing for a learner archetype or touching profile data. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | writing code, adding dependencies, touching persistence or platform code |
| [docs/LEARNING_MODEL.md](docs/LEARNING_MODEL.md) | working on skills, mastery, templates, hints, adaptation |
| [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) | adding or validating content, schemas, themes |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | building worlds, missions, interactions, feedback, layout, the world catalog and portals |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | drawing anything, touching design tokens, colors, type, motion, Lifty, mistake and hint visuals |
| [docs/ART_ASSET_SPEC.md](docs/ART_ASSET_SPEC.md) | making, adding, reviewing or placing production art: canvases, safe core, layers, pivots, files, rights |
| [docs/ART_PROMPTS.md](docs/ART_PROMPTS.md) | generating the production art files one at a time with an image tool |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | building any UI, sound, or animation |
| [docs/REWARDS.md](docs/REWARDS.md) | touching unlocks, ranks, Quest Tokens, Parent Mode rewards |
| [docs/ROADMAP.md](docs/ROADMAP.md) | planning work, choosing scope |
| [docs/DEVICE_LAB.md](docs/DEVICE_LAB.md) | running or changing the Device Lab, physical device testing (including Floor 15 checks) |
| [docs/ELEVATOR_QUEST.md](docs/ELEVATOR_QUEST.md) | working on the Elevator Quest theme: simulation, sound, director, recovery, renderer status |
| [docs/PLAYTEST.md](docs/PLAYTEST.md) | running a child playtest session |
| [docs/WEB_PLAYTEST.md](docs/WEB_PLAYTEST.md) | running or changing the browser build, developer tools, web persistence, screenshots |
| [docs/DECISIONS.md](docs/DECISIONS.md) | about to change a past decision. Append, never edit. |

## Non-negotiables

1. Core gameplay works fully offline. No network call may sit on a gameplay path.
2. No Google Play Services dependency, direct or transitive. Run `npm run check:fire` after adding any native dependency. Known offenders are listed in ARCHITECTURE.md section 10.
3. No ads, accounts, analytics SDKs, paid currency, loot boxes, streaks, lives, leaderboards, or sibling comparison.
4. No live AI generating children's content. All content is deterministic, schema-validated, and reviewed.
5. `src/engine/` is pure TypeScript: no imports from react, react-native, expo, or I/O. Time and randomness are injected.
6. `learning_events` (attempts and completion records), `progression_events`, `world_memory`, and the future `token_ledger` are append-only (database triggers enforce it for the first three). World memory (discoveries, tips) is never evidence, value or currency. Never update or delete rows. Corrections are new entries. Never store a mutable token balance.
7. An incorrect answer never automatically makes the next item easier. Follow the response policy in LEARNING_MODEL.md.
8. Tokens are never subtracted for academic mistakes.
9. Access settings never lower challenge. They are separate dials.
10. Speech is never required to progress.
11. Tap feedback starts immediately on the UI thread and never waits on evaluation, I/O, or the database.
12. No flashing above 3 Hz and no sudden loud audio, ever.
13. Never compare learners anywhere in the app.
14. Never put real names, ages, diagnoses, or family details in tracked files, commit messages, fixtures, or content IDs. Use archetypes. Private notes go in the gitignored `private/` folder (see private/README.md).

## Engineering conventions

- TypeScript strict. Zod schemas are the source of truth for content types.
- Build vertically. Do not add abstractions, interaction types, or systems the current milestone does not use.
- Keep dependencies few. Every new dependency needs a reason in the PR description and a Fire compatibility check.
- Use Expo-recommended versions of native modules (`npx expo install`), not the latest npm tags. Major renderer upgrades (for example Skia v3) need a Device Lab run on Fire first.
- Reanimated shared values: use `.get()` / `.set()` (React Compiler lint rules reject `.value =`).
- Theme logic (`src/themes/*/sim`, `director`, `content`, pure audio and layout files) imports no React, React Native, Expo, or Skia. Theme code never scores: it uses `runtime.check` and committed intents. Sounds are semantic slots mapped by a profile, never filenames in logic.
- `src/dev/` must never import `src/engine/` or `src/themes/`. Engine and `src/presentation/layout/` must never import React, React Native, Expo, or Skia. `src/runtime/` and `src/persistence/` never import React, React Native, or Skia, and only `src/persistence/expoDatabase.ts` imports expo-sqlite.
- Every runtime command carries a `commandId` and commits in one transaction. New durable writes need stable ids and `INSERT OR IGNORE`, and a crash-injection case in `src/runtime/crashRecovery.test.ts`.
- Engine production code imports only `zod` and other engine files. No clock, `Math.random`, network, storage, or filesystem: callers pass time, seeds, ids, and evidence. No theme, setting, or learner vocabulary in the engine.
- Generators are pure and versioned. Any change to a generator's output for a given seed needs a version bump. Item signatures are hashed: do not change `random/hash.ts` without a migration plan.
- Never add a progression-value source keyed to wrong answers or attempt counts. Value must stay one-time events, and `value.property.test.ts` must keep passing.
- Tests: engine logic gets unit and property tests. Content changes must pass `validate-content`. Persistence changes need a migration plus a migration test.
- Performance claims require a measurement on a real Fire tablet, not the emulator or an iPad.
- Mastery thresholds and weights live in `content/engine-config.json`, never as literals in code.
- UI reads design token roles (`src/presentation/design/tokens.ts`), never raw colors. Red is for genuine danger only, never for a wrong answer.
- Child-facing theme text lives in `content/themes/` and must pass `validateMissionCopy`. No hard-coded copy in director or UI code.
- Everything durable is scoped to a supplied learner id. Never assume a single learner below the app entry point.
- Platform differences go in `*.web.ts` adapter files, never in `Platform.OS === 'web'` checks in game, runtime or engine code. The browser build is for development and playtests only.
- Developer tools act on test learners only and never write learning records themselves. Keep them out of production bundles (`npm run check:bundle`).

## Truthfulness rules for agents

- Do not describe file contents, test results, or device behavior you did not check in this session.
- Library and platform facts in the docs carry a check date. Re-verify against current official docs before depending on a fact older than about three months, and update the doc with the new date.
- If a step was skipped or untested, say so.

## Git

- Local work happens on `main`. On GitHub the only branch so far is `claude/m6-web-playtest`; GitHub made it the default because it was the first branch pushed, and `main` has not been pushed. Push only when the user asks. Commit messages describe why, not only what.
- Docs change with the code that changes behavior. If a decision changes, append to DECISIONS.md.
