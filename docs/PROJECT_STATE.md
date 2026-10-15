# Project state

The single source of current factual status. Planned and future work is in ROADMAP.md; history is in DECISIONS.md. Update a line when it stops being true. Last checked: 2026-10-15, against the repository and `origin`.

## Code

- Active development branch: `claude/m7-floor15-playtest` (the local branch has the same name).
- Current branch HEAD: Word Golf's spelling card in the compact iPad windows (D200, issue #1), after the AI review bundles (`c4d467b`, docs/AI_REVIEW_BUNDLES.md) and the shared design-issue workflow (`659411c`, docs/AI_WORKFLOW.md). Before them, Word Golf polish (D199: `3533d61` wind, curved shots, the approach rule and the rooftop garden; `73bd9c1` the spelling card, capital letters and the shot cards) and the docs commit after them. Before it, Word Golf's production art (D198, through `0b28a32`). Before that, the Word Golf rebuild (D197, through `51f5105`). Before that, Tower Rescue's ten levels (D196, through `44e76c5`).
- Gates on `5ac4873` (D200; not fully gated in this container): Word Golf tests 140 of 140; `npm run verify` 2129 of 2130 (typecheck and lint clean; the one failure is the slow elevator screen test under Confirmed open defects), Fire dependency scan clean, `validate:content` 295 of 295, `check:bundle` passed; `npm run web:e2e` 21 of 23: the two landing walkthroughs missed the 250 ms touch-reaction budget (254 to 343 ms), and the floor walkthrough misses it the same way on `c4d467b`, before D200. Browser only.
- Last fully gated SHA: `73bd9c1` (D199): `npm run verify` passed (159 suites, 2120 tests, Fire dependency scan clean), `validate:content` 295 of 295, `check:bundle` passed, full `npm run web:e2e` 23 of 23 in one run (its Word Golf hole and Start Over included). Earlier: `8dfb316` (D198): `npm run verify` passed (159 suites, 2118 tests, Fire dependency scan clean), `validate:content` 295 of 295, `check:bundle` passed, full `npm run web:e2e` 23 of 23 in one run. Earlier: `f7487af` (D197; the gates ran on this code with the D197 docs in the tree): `npm run verify` passed (158 suites, 2089 tests, Fire dependency scan clean), `validate:content` 271 of 271, `check:bundle` passed, full `npm run web:e2e` 23 of 23 in one run. Earlier: `44e76c5` (D196).
- Engineering baseline status: candidate.
- Remote branches: `claude/m7-floor15-playtest` (pushed with the D191 hub work); `claude/m6-web-playtest` (`e14a1c5`, the M6 browser build from 2026-10-06, an ancestor of the active branch, and still the GitHub default branch); one Codex prototype branch (Active workstream). There is no `main` on GitHub.

## Milestones

- Current: Word Golf readability, course identity and wind (issue #1): the D199 polish (wind that curves the shots, a reason to go bold, a cleaner spelling card with capital letters, a rooftop garden beside the holes) and D200 (the spelling card in Split View and Slide Over). Waiting on the owner in issue #1: capitals or a lower-case reader font for l and i; over the approved art (D198) and the ten holes where the spelled word is the golf shot (D197). Built in software, verified in the browser and in Node only.
- Done or built in software: M0, M2 and M3 done; M4 to M9.1 built in software (ROADMAP.md). M1 Device Lab is built; its physical checklist has not been run.
- Next intended: the learner-storyteller V0.1 (Castle Hall, a magical door, an Ice Crystal adventure, a reward, back to the hall), by owner direction on 2026-10-11 (D184).
- Mission 2: deferred until explicitly authorized. The profile picker (ROADMAP M10) is deferred too (D184).

## In the product (Elevator Quest)

- Floor 15 mission `positions-and-capacity` version 3: math and reading jobs, corrections with LET'S COUNT, Concept Rescue.
- A 20-floor tower, every floor illustrated, with things to touch, the Engineer Log and the building directory.
- Mini-games: Word Golf (Floor 20, spelling; ten holes since D197, the word is the golf shot: missions `word-golf` v2 and `word-golf-2` to `word-golf-10` v1, the approved production art since D198 with vector fallbacks, wind, the rooftop garden and a cleaner spelling card since D199, 36 new words without narration yet) and Cargo Commander (Floor 4, two-digit add and subtract, mission `cargo-commander` v1). Word Golf: browser only, not checked on a device, not yet played by a child.
- Prototype mini-game for a playtest: Tower Rescue: Quake Control (Floor 10, D185): ten levels since D196 (missions `power-repair` v1 and `repair-*` v1, pack `repair`), a level map, NEXT LEVEL and replays. Not yet played by a child; its twelve reading reports need an adult's review first. Game-feel pass D193 (touch, install choreography, test-run payoff, room life; the first KLS game-feel reference). Draws the owner-approved 19-piece production art pack since D195 (vector fallback kept); browser only, not checked on a device.
- Prototype mini-game for a playtest: Elevator Express V0.1 (Floor 1, one arcade delivery route, mission `express-route` v1, D189). Vectors only, browser only; not yet played by a child or checked on a device.
- Prototype mini-game for a playtest: Strike Lab V0.1 (B1 BOWLING since D191, was Floor 8; a three-frame bowling round, mission `strike-lab` v1, D190). Vectors only, browser only; not yet played by a child or checked on a device.
- The hub (D191): express rides from the directory in free play and between jobs, B1 BOWLING below the lobby, game beacons, LAST GAME, the tower map, JOB DONE! with a central NEXT JOB, a MISSION or FREE PLAY tag, outline-free landing cues. Browser only; not checked on a device.
- Exploration and hub polish (D194): a B1 panel button under Floor 1, B1 pinned in the directory and on the map; a note on every touch of a landing thing (34 things, 6 new); three Engineer Secrets hidden in the landing art, counted on the map; a seamless machine-room ambience (re-cut file, gapless browser loops). Browser only; nobody has listened to the loop, not checked on a device.
- Sound packs `elevenlabs-v1`, `elevenlabs-v2` and `elevenlabs-narration-v1`: approved, not yet heard on a device.

## Confirmed open defects

- The DIRECTORY plate overlaps the rescue board on Fire portrait and the Engineer Log in Split View 1/3 (screenshots, the same before and after D182).
- In Split View 1/3 the live sign can still clip (D152).
- The browser saves the whole database image on every commit (D173).
- The directory open frame is 150 to 220 ms in headless Chromium (D174, WEB_PLAYTEST.md).
- Production sounds stay uncompressed WAV until the owner listens to the AAC comparison (D177).
- `ui/GameScreen.test.tsx` runs near its time budgets in the cloud container used on 2026-10-15 (about 2.5 s a job to render, the same on `0b28a32`, before D199): under the full `npm run verify` one to four of its tests time out at 20 or 30 s, and alone the completion test passes in 25.5 s. The owner's Windows run of `659411c` passed all 2120 tests. Not a product defect; the budgets or the test's job count need a look. In the same container the browser landing walkthroughs (`web:e2e`) show touch reactions at 254 to 343 ms against their 250 ms budget, before and after D200; on the machine that gated D199 they passed.

## Validation

- Physical devices: no Fire HD 8 or iPad run recorded (DEVICE_LAB.md). Renderer acceptance is provisional.
- Child playtest: not run (PLAYTEST.md).
- Latest accepted audit: Codex acceptance audit. Audited SHA `ee4b140`. Verdict PASS WITH FIXES. Findings: subsequently addressed by Claude (D179 to D183, `ef58b2a` to `4b55c11`). Independent post-remediation re-audit: pending. The canonical audit copy is not yet in `docs/audits/`.

## Active workstream

Magical Kingdom (learner-storyteller) literacy pass. The Codex prototype (`76f3f16`) is integrated selectively on this branch (D186; its branch name contains a child's name, so it is not written here). The garden door opens the Word Garden: letter sound, blend, spell (docs/magical-kingdom/WORD_GARDEN.md). Browser only, not checked on a device. Words and lines recorded (D188). Blocked for a child session on: the 16 letter sounds (owner audition of 10 generated candidates, 6 stop sounds to record by a person) and an adult rehearsal on a Fire HD 8 and an iPad. Temporary architecture exception: the kingdom's separate database (D188). Waiting on owner decisions: the character's name (placeholder now), recording the phonemes, and whether this learner's mastery shares the main database.
