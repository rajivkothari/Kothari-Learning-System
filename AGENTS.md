# AGENTS.md

Shared rules for every coding agent in this repository. Claude Code loads this file through the import in CLAUDE.md; Codex reads it directly. Read this first, then docs/CURRENT_STATE.md, then the doc for your task.

## What this is

An offline educational adventure-game engine for iPad and Amazon Fire tablets. One engine, many themed experiences, each built for a learner archetype (LEARNER_PROFILES.md). Learning spans Pre-K to Grade 8, driven by skills and mastery, not grade. Which experiences exist and where they stand: CURRENT_STATE.md.

## Source of truth

| Question | Source |
|---|---|
| Shared operating rules | this file (area rules: `.claude/rules/`, see Folder rules below) |
| Current state (major capabilities, active branch, open defects, device status) | docs/CURRENT_STATE.md |
| Planned and future work | docs/ROADMAP.md (approved work only; unapproved ideas: docs/ICEBOX.md, not normal coding context) |
| How a subsystem behaves | its doc (doc map below) |
| Durable decisions | docs/decisions/ from 0201 on; D1 to D200 in docs/DECISIONS.md (history, append only) |
| Scope of the current task | the active prompt |
| Shared product design and owner decisions | the linked GitHub design issue and its comments |
| Independent findings | the audit the prompt references (old audits: docs/archive/, historical) |
| Agent roles and prompting | docs/AI_WORKFLOW.md |
| Saved procedures (P01, P05 to P08, P17) | docs/ai/PLAYBOOKS.md, run only when asked |

If sources conflict, report the conflict. Do not resolve it silently.

## Working rules

- For substantial product work, read the linked GitHub design issue and its comments before implementation. Follow the shared-issue protocol in docs/AI_WORKFLOW.md: post material engineering constraints/options, escalate genuine owner decisions, and report implementation SHA and actual test status back to that issue.
- Work only on the requested scope. No opportunistic refactors; report what else you find instead.
- Preserve the learning-evidence semantics (LEARNING_MODEL.md). Decorative and gameplay actions (touches, putts, crate moves, dress-up, navigation) never create academic evidence unless a decision explicitly designs them to.
- Preserve existing learner saves. Any change that would reset or reinterpret them needs explicit authorization, a migration and a migration test.
- Fire HD 8 and iPad are the primary targets. Browser and Node validation is not native certification: say "browser only" or "not checked on a device" every time.
- Respect accessibility and Reduced Motion (ACCESSIBILITY.md) in every UI, sound and animation change.
- Do not modify approved art or audio, or their rights and approval records, without authorization.
- Prefer existing platform components (engine, runtime, persistence, the mini-game session framework, design tokens, text roles, art and audio manifests) over parallel systems.
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
- Tests: engine logic gets unit and property tests. Content changes must pass `npm run validate:content`. Persistence changes need a migration plus a migration test.
- Performance claims require a measurement on a real Fire tablet, not the emulator or an iPad. Browser numbers are labelled browser only.
- Everything durable is scoped to a supplied learner id. Never assume a single learner below the app entry point.
- Platform differences go in `*.web.ts` adapter files, never in `Platform.OS === 'web'` checks in game, runtime or engine code. The browser build is for development and playtests only.
- Generated files (`ios/`, `android/`, the slim `runtime.json` manifests) are never edited by hand.

## Folder rules

Rules for one part of the code live in `.claude/rules/`. Claude Code loads each file when it works with matching files. Other agents: read the matching file before editing there.

| File | Applies to |
|---|---|
| `.claude/rules/engine.md` | `src/engine/` |
| `.claude/rules/runtime-persistence.md` | `src/runtime/`, `src/persistence/` |
| `.claude/rules/themes.md` | `src/themes/`, `content/themes/` |
| `.claude/rules/ui.md` | `*.tsx` under `src/`, `src/presentation/` |
| `.claude/rules/dev-tools.md` | `src/dev/`, `src/devtools/` |

ESLint (`eslint.config.js`) also enforces the engine, theme and Device Lab import boundaries and the engine's no-clock rule.

## Commands

```bash
npm run verify            # typecheck + lint + Jest (app, engine, runtime, theme) + Fire dependency scan. Run before every commit. There is no CI: this is the gate.
npm run test:engine       # engine only, plain Node
npx jest --selectProjects runtime   # persistence + runtime against real SQLite (node:sqlite)
npx jest --selectProjects theme     # simulation, audio semantics, director headless, layout
npm run validate:content  # packs, missions, theme copy, reading words, landing and world catalogs (:release for the release budget)
npm run web:export        # static browser build in dist-web/
npm run web:e2e           # browser end-to-end against dist-web (CHROMIUM_PATH; E2E_ONLY, E2E_TOUCH, E2E_REDUCED, E2E_FLOORS)
npm run check:bundle      # Android + iOS production bundles carry no developer-only code
npx expo install <pkg>    # ALWAYS use for adding packages
# package.json scripts that need environment variables use: node scripts/run-with-env.js NAME=value -- <command>
```

There is no separate build command: `npm run web:export` builds the browser version and `npm run android` / `npm run ios` build the apps. Occasional tools (playtest server, screenshots, benchmarks, browser soaks, manifest and audio generators, review bundles, device builds) and environment variable names: docs/ENVIRONMENT.md.

Expo changes between SDKs. Before touching an Expo or React Native API, check the docs for the installed SDK (`https://docs.expo.dev/versions/v57.0.0/`) or `https://docs.expo.dev/llms.txt`, not memory. `ios/` and `android/` are generated by `expo prebuild` and gitignored. Configure native behavior in `app.json`. More script options: WEB_PLAYTEST.md.

## Doc map

| Doc | Read when you are... |
|---|---|
| docs/CURRENT_STATE.md | starting any task |
| docs/AI_WORKFLOW.md | prompting, reviewing or working a design issue |
| docs/PRODUCT.md | doing anything (vision, principles, non-goals) |
| docs/LEARNER_PROFILES.md | designing for a learner archetype |
| docs/ARCHITECTURE.md | writing code, adding dependencies, persistence or platform code |
| docs/LEARNING_MODEL.md | skills, mastery, templates, hints, adaptation |
| docs/CONTENT_MODEL.md | content, schemas, themes |
| docs/GAME_DESIGN.md | worlds, missions, interactions, feedback, layout, portals |
| docs/ART_DIRECTION.md, docs/ART_ASSET_SPEC.md, docs/ART_PROMPTS.md | drawing, design tokens, production art, image prompts |
| docs/ACCESSIBILITY.md | any UI, sound or animation |
| docs/REWARDS.md | unlocks, ranks, Quest Tokens, Parent Mode rewards |
| docs/ROADMAP.md | planning, scope, milestone history |
| docs/DEVICE_LAB.md, docs/PLAYTEST.md | device testing, child playtests |
| docs/ELEVATOR_QUEST.md | the Elevator Quest theme and its mini-games |
| docs/WEB_PLAYTEST.md, docs/ENVIRONMENT.md | the browser build, developer tools, occasional commands |
| docs/decisions/, docs/DECISIONS.md | about to change a past decision |
| docs/AI_REVIEW_BUNDLES.md | preparing an external AI review |

## Truthfulness rules

- Do not describe file contents, test results, or device behavior you did not check in this session.
- Do not claim a test, build or check passed unless it ran in this session; name what ran.
- Library and platform facts in the docs carry a check date. Re-verify against current official docs before depending on a fact older than about three months, and update the doc with the new date.
- If a step was skipped or untested, say so.

## Git and branches

- This repository has no `main`. The integration branch is the one docs/CURRENT_STATE.md names (`claude/m7-floor15-playtest` today); treat it as main. GitHub's default branch (`claude/m6-web-playtest`) is stale.
- One task, one branch, one PR into the integration branch. Never commit routine work directly to the integration branch. Before editing, bring the task branch up to date with it; preserve local work, and stop and explain if that cannot be done safely.
- Push only when the user asks, and only to the task's branch. Never merge without the owner's explicit approval, and never while required checks are failing or still running. Claude Code is blocked from merging PRs in `.claude/settings.json`; branch protection on GitHub has not been verified, so for other agents this is a process rule, not a lock.
- Merging does not deploy: there is no CI, deployment configuration or over-the-air update channel, and device and store builds are manual. If that changes, pause before merge.
- Branch names describe the work. Never put personal or child names, or other unnecessary identifying information, in a branch name.
- Commit messages describe why, not only what.
- Docs change with the code that changes behavior. A new or changed decision gets a record in docs/decisions/ (a later record replaces an earlier one; never rewrite history). Change docs/CURRENT_STATE.md only when a major capability changes status or is removed or replaced, never for routine fixes; a task's results go in its PR.
- Do not rewrite another agent's branch history. Do not merge another agent's implementation wholesale without review and explicit approval; selectively integrate or cherry-pick when appropriate.
