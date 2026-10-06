# CLAUDE.md

Guide for coding agents working in this repository. Read this first, then the doc relevant to your task.

## What this is

An offline educational adventure-game engine for iPad and Amazon Fire tablets. One engine, many themed experiences. The first two: Elevator Quest (learner-engineer archetype, engineering) and Magic Tower (learner-storyteller archetype, storybook fantasy). Learning spans Pre-K to Grade 8, driven by skills and mastery, not grade.

## Current phase

M0 complete: foundation docs only. No app code exists yet. Next planned step is M1 (device tech spike). See [docs/ROADMAP.md](docs/ROADMAP.md). Do not start gameplay work unless the user asks for it.

## Doc map

| Doc | Read when you are... |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | doing anything. Vision, principles, non-goals. |
| [docs/LEARNER_PROFILES.md](docs/LEARNER_PROFILES.md) | designing for a learner archetype or touching profile data. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | writing code, adding dependencies, touching persistence or platform code |
| [docs/LEARNING_MODEL.md](docs/LEARNING_MODEL.md) | working on skills, mastery, templates, hints, adaptation |
| [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) | adding or validating content, schemas, themes |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | building worlds, missions, interactions, feedback, layout |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | building any UI, sound, or animation |
| [docs/REWARDS.md](docs/REWARDS.md) | touching unlocks, ranks, Quest Tokens, Parent Mode rewards |
| [docs/ROADMAP.md](docs/ROADMAP.md) | planning work, choosing scope |
| [docs/DECISIONS.md](docs/DECISIONS.md) | about to change a past decision. Append, never edit. |

## Non-negotiables

1. Core gameplay works fully offline. No network call may sit on a gameplay path.
2. No Google Play Services dependency, direct or transitive. Check a native library's Android build file before adding it. Known offenders are listed in ARCHITECTURE.md section 10.
3. No ads, accounts, analytics SDKs, paid currency, loot boxes, streaks, lives, leaderboards, or sibling comparison.
4. No live AI generating children's content. All content is deterministic, schema-validated, and reviewed.
5. `src/engine/` is pure TypeScript: no imports from react, react-native, expo, or I/O. Time and randomness are injected.
6. `attempts` and `token_ledger` are append-only. Never update or delete rows. Corrections are new entries. Never store a mutable token balance.
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
- Use Expo-bundled versions of native modules (`npx expo install`), not the latest npm tags. Skia stays on the v2 line Expo bundles until v3 is tested on Fire hardware.
- Tests: engine logic gets unit and property tests. Content changes must pass `validate-content`. Persistence changes need a migration plus a migration test.
- Performance claims require a measurement on a real Fire tablet, not the emulator or an iPad.
- Mastery thresholds and weights live in `content/engine-config.json`, never as literals in code.

## Truthfulness rules for agents

- Do not describe file contents, test results, or device behavior you did not check in this session.
- Library and platform facts in the docs carry a check date. Re-verify against current official docs before depending on a fact older than about three months, and update the doc with the new date.
- If a step was skipped or untested, say so.

## Git

- Default branch `main`. Commit messages describe why, not only what.
- Docs change with the code that changes behavior. If a decision changes, append to DECISIONS.md.
