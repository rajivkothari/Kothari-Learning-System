# CLAUDE.md

Permanent operating rules for coding agents in this repository. Read this first, then docs/PROJECT_STATE.md, then the doc for your task.

## What this is

An offline educational adventure-game engine for iPad and Amazon Fire tablets. One engine, many themed experiences, each built for a learner archetype (LEARNER_PROFILES.md). Learning spans Pre-K to Grade 8, driven by skills and mastery, not grade. Which experiences exist and where they stand: PROJECT_STATE.md.

## Source of truth

| Question | Source |
|---|---|
| Permanent operating rules | this file |
| Current project status (branch, SHAs, milestone, open defects, device status) | docs/PROJECT_STATE.md |
| Planned and future work | docs/ROADMAP.md |
| How a subsystem behaves | its doc (doc map below) |
| Durable historical decisions | docs/DECISIONS.md (append only) |
| Scope of the current task | the active prompt |
| Independent findings | the Codex audit the prompt references (accepted audits: docs/audits/, read on demand) |
| Agent roles and prompting | docs/AI_WORKFLOW.md |

If sources conflict, report the conflict. Do not resolve it silently.

## Working rules

- Claude is the primary implementation engineer (roles: docs/AI_WORKFLOW.md).
- Work only on the requested scope. No opportunistic refactors; report what else you find instead.
- Never push to or merge into `main`. Push only when the user asks, and only to the branch the task names.
- Preserve the learning-evidence semantics (LEARNING_MODEL.md). Decorative and gameplay actions (touches, putts, crate moves, dress-up, navigation) never create academic evidence unless a decision explicitly designs them to.
- Preserve existing learner saves. Any change that would reset or reinterpret them needs explicit authorization, a migration and a migration test.
- Offline first (non-negotiable 1).
- Fire HD 8 and iPad are the primary targets. Browser and Node validation is not native certification: say "browser only" or "not checked on a device" every time.
- Respect accessibility and Reduced Motion (ACCESSIBILITY.md) in every UI, sound and animation change.
- Do not modify approved art or audio, or their rights and approval records, without authorization.
- Prefer existing platform components (engine, runtime, persistence, the mini-game session framework, design tokens, text roles, art and audio manifests) over parallel systems.
- Prefer one shared Canvas per visual surface. Multiple simultaneous Skia/WebGL canvases require a clear reason and must stay within supported context limits.
- Keep commits logically scoped: one remediation or feature per commit where practical.
- Report at the end of a task: the SHA, the tests and checks actually run with their results, any failures, and what was not tested.

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

Scope guard: do not add missions, Quest Tokens, portals, or new playable worlds unless the user asks.

## Engineering conventions

- TypeScript strict. Zod schemas are the source of truth for content types.
- Build vertically. Do not add abstractions, interaction types, or systems the current milestone does not use.
- Keep dependencies few. Every new dependency needs a reason in the PR description and a Fire compatibility check.
- Use Expo-recommended versions of native modules (`npx expo install`), not the latest npm tags. Major renderer upgrades (for example Skia v3) need a Device Lab run on Fire first. A react-native-skia upgrade also turns off the web memory release until its checks are re-run (D180).
- Reanimated shared values: use `.get()` / `.set()` (React Compiler lint rules reject `.value =`).
- Theme logic (`src/themes/*/sim`, `director`, `content`, pure audio and layout files) imports no React, React Native, Expo, or Skia. Theme code never scores: it uses `runtime.check` and committed intents. Sounds are semantic slots mapped by a profile, never filenames in logic.
- `src/dev/` must never import `src/engine/` or `src/themes/`. Engine and `src/presentation/layout/` must never import React, React Native, Expo, or Skia. `src/runtime/` and `src/persistence/` never import React, React Native, or Skia, and only `src/persistence/expoDatabase.ts` imports expo-sqlite.
- Every runtime command carries a `commandId` and commits in one transaction. New durable writes need stable ids and `INSERT OR IGNORE`, and a crash-injection case in `src/runtime/crashRecovery.test.ts`.
- Engine production code imports only `zod` and other engine files. No clock, `Math.random`, network, storage, or filesystem: callers pass time, seeds, ids, and evidence. No theme, setting, or learner vocabulary in the engine.
- Generators are pure and versioned. Any change to a generator's output for a given seed needs a version bump. Item signatures are hashed: do not change `random/hash.ts` without a migration plan. Tests pinned to a searched seed must be re-searched when a mission version changes.
- Never add a progression-value source keyed to wrong answers or attempt counts. Value must stay one-time events, and `value.property.test.ts` must keep passing.
- Tests: engine logic gets unit and property tests. Content changes must pass `validate-content`. Persistence changes need a migration plus a migration test.
- Performance claims require a measurement on a real Fire tablet, not the emulator or an iPad. Browser numbers are labelled browser only.
- Mastery thresholds and weights live in `content/engine-config.json`, never as literals in code.
- UI reads design token roles (`src/presentation/design/tokens.ts`), never raw colors. Red is for genuine danger only, never for a wrong answer.
- All child-facing gameplay and instructional text takes its size from the text roles (today `src/themes/elevator-quest/ui/textRoles.ts`). Developer and debug tooling is exempt.
- Child-facing theme text lives in `content/themes/` and must pass `validateMissionCopy`. No hard-coded copy in director or UI code.
- Everything durable is scoped to a supplied learner id. Never assume a single learner below the app entry point.
- Platform differences go in `*.web.ts` adapter files, never in `Platform.OS === 'web'` checks in game, runtime or engine code. The browser build is for development and playtests only.
- Developer tools act on test learners only and never write learning records themselves. Keep them out of production bundles (`npm run check:bundle`).
- Generated files (`ios/`, `android/`, the slim `runtime.json` manifests) are never edited by hand.

## Commands

```bash
npm run verify            # typecheck + lint + Jest (app, engine, runtime, theme) + Fire dependency scan. Run before every commit. There is no CI: this is the gate.
npm run test:engine       # engine only, plain Node
npx jest --selectProjects runtime   # persistence + runtime against real SQLite (node:sqlite)
npx jest --selectProjects theme     # simulation, audio semantics, director headless, layout
npm run validate:content  # packs, missions, theme copy, reading words, landing and world catalogs (:release for the release budget)
npm run web:playtest      # browser playtest dev server (http://localhost:8081)
npm run web:export        # static browser build in dist-web/
npm run web:e2e           # browser end-to-end against dist-web (CHROMIUM_PATH; E2E_ONLY, E2E_TOUCH, E2E_REDUCED, E2E_FLOORS)
npm run web:screenshots   # visual-review captures into web-screenshots/
npm run check:bundle      # Android + iOS production bundles carry no developer-only code
npm run bench             # history benchmark; persistence: node scripts/bench-persistence.js
node scripts/perf-rides.js | perf-games.js | perf-log.js | perf-directory.js --dist <dir>   # browser soaks, never a tablet
node scripts/generate-runtime-manifests.js [--check]   # slim art and audio runtime manifests
node scripts/generate-elevator-audio.js [--sources]    # prototype sounds; --sources rewrites sound requires from pack statuses
npx expo install <pkg>    # ALWAYS use for adding packages
npm run android | ios     # dev builds; lab:android:release | lab:ios:release for measurements
# package.json scripts that need environment variables use: node scripts/run-with-env.js NAME=value -- <command>
```

Expo changes between SDKs. Before touching an Expo or React Native API, check the docs for the installed SDK (`https://docs.expo.dev/versions/v57.0.0/`) or `https://docs.expo.dev/llms.txt`, not memory. `ios/` and `android/` are generated by `expo prebuild` and gitignored. Configure native behavior in `app.json`. More script options: WEB_PLAYTEST.md.

## Doc map

| Doc | Read when you are... |
|---|---|
| [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) | starting any task: where things stand now |
| [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) | writing or receiving an agent prompt, or reviewing another agent's work |
| [docs/PRODUCT.md](docs/PRODUCT.md) | doing anything. Vision, principles, non-goals. |
| [docs/LEARNER_PROFILES.md](docs/LEARNER_PROFILES.md) | designing for a learner archetype or touching profile data |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | writing code, adding dependencies, touching persistence or platform code |
| [docs/LEARNING_MODEL.md](docs/LEARNING_MODEL.md) | working on skills, mastery, templates, hints, adaptation |
| [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) | adding or validating content, schemas, themes |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | building worlds, missions, interactions, feedback, layout, the world catalog and portals |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | drawing anything, design tokens, colors, type, motion, Lifty, mistake and hint visuals |
| [docs/ART_ASSET_SPEC.md](docs/ART_ASSET_SPEC.md) | making, adding, reviewing or placing production art: canvases, safe core, layers, files, rights |
| [docs/ART_PROMPTS.md](docs/ART_PROMPTS.md) | generating production art with an image tool |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | building any UI, sound, or animation |
| [docs/REWARDS.md](docs/REWARDS.md) | touching unlocks, ranks, Quest Tokens, Parent Mode rewards |
| [docs/ROADMAP.md](docs/ROADMAP.md) | planning work, choosing scope, milestone history |
| [docs/DEVICE_LAB.md](docs/DEVICE_LAB.md) | physical device testing |
| [docs/ELEVATOR_QUEST.md](docs/ELEVATOR_QUEST.md) | the Elevator Quest theme: simulation, sound, director, recovery, mini-games |
| [docs/PLAYTEST.md](docs/PLAYTEST.md) | running a child playtest session |
| [docs/WEB_PLAYTEST.md](docs/WEB_PLAYTEST.md) | the browser build, developer tools, web persistence, screenshots, soaks |
| [docs/DECISIONS.md](docs/DECISIONS.md) | about to change a past decision. Append, never edit. |

## Truthfulness rules

- Do not describe file contents, test results, or device behavior you did not check in this session.
- Do not claim a test, build or check passed unless it ran in this session; name what ran.
- Library and platform facts in the docs carry a check date. Re-verify against current official docs before depending on a fact older than about three months, and update the doc with the new date.
- If a step was skipped or untested, say so.

## Git

- Push only when the user asks, only to the branch the task names, never to `main`. PROJECT_STATE.md names the active branch.
- Branch names describe the work. Never put personal or child names, or other unnecessary identifying information, in a branch name.
- Commit messages describe why, not only what.
- Docs change with the code that changes behavior. If a decision changes, append to DECISIONS.md.
- Do not rewrite another agent's branch history. Do not merge another agent's implementation wholesale without review and explicit approval; selectively integrate or cherry-pick when appropriate.
