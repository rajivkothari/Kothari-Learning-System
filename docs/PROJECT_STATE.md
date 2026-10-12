# Project state

The single source of current factual status. Planned and future work is in ROADMAP.md; history is in DECISIONS.md. Update a line when it stops being true. Last checked: 2026-10-12, against the repository and `origin`.

## Code

- Active development branch: `claude/m7-floor15-playtest` (the local branch has the same name).
- Current branch HEAD: the D191 hub work (`fdb905b` director, `ab8d948` UI) and the documentation commits after it.
- Last fully gated SHA: `ab8d948` (`npm run verify`, `validate:content`, `check:bundle`; the commits after it change documentation only).
- Engineering baseline status: candidate.
- Remote branches: `claude/m7-floor15-playtest` (pushed with the D191 hub work); `claude/m6-web-playtest` (`e14a1c5`, the M6 browser build from 2026-10-06, an ancestor of the active branch, and still the GitHub default branch); one Codex prototype branch (Active workstream). There is no `main` on GitHub.

## Milestones

- Current: the M9.1 audit follow-up is done (D179 to D183). Built in software, verified in the browser and in Node only.
- Done or built in software: M0, M2 and M3 done; M4 to M9.1 built in software (ROADMAP.md). M1 Device Lab is built; its physical checklist has not been run.
- Next intended: the learner-storyteller V0.1 (Castle Hall, a magical door, an Ice Crystal adventure, a reward, back to the hall), by owner direction on 2026-10-11 (D184).
- Mission 2: deferred until explicitly authorized. The profile picker (ROADMAP M10) is deferred too (D184).

## In the product (Elevator Quest)

- Floor 15 mission `positions-and-capacity` version 3: math and reading jobs, corrections with LET'S COUNT, Concept Rescue.
- A 20-floor tower, every floor illustrated, with things to touch, the Engineer Log and the building directory.
- Mini-games: Word Golf (Floor 20, spelling) and Cargo Commander (Floor 4, two-digit add and subtract), missions `word-golf` v1 and `cargo-commander` v1.
- Prototype mini-game for a playtest: Tower Rescue: Quake Control V0.1 (Floor 10, one power repair, mission `power-repair` v1, D185). Vectors only; not yet played by a child.
- Prototype mini-game for a playtest: Elevator Express V0.1 (Floor 1, one arcade delivery route, mission `express-route` v1, D189). Vectors only, browser only; not yet played by a child or checked on a device.
- Prototype mini-game for a playtest: Strike Lab V0.1 (B1 BOWLING since D191, was Floor 8; a three-frame bowling round, mission `strike-lab` v1, D190). Vectors only, browser only; not yet played by a child or checked on a device.
- The hub (D191): express rides from the directory in free play and between jobs, B1 BOWLING below the lobby, game beacons, LAST GAME, the tower map, JOB DONE! with a central NEXT JOB, a MISSION or FREE PLAY tag, outline-free landing cues. Browser only; not checked on a device.
- Sound packs `elevenlabs-v1`, `elevenlabs-v2` and `elevenlabs-narration-v1`: approved, not yet heard on a device.

## Confirmed open defects

- The DIRECTORY plate overlaps the rescue board on Fire portrait and the Engineer Log in Split View 1/3 (screenshots, the same before and after D182).
- In Split View 1/3 the live sign can still clip (D152).
- The browser saves the whole database image on every commit (D173).
- The directory open frame is 150 to 220 ms in headless Chromium (D174, WEB_PLAYTEST.md).
- Production sounds stay uncompressed WAV until the owner listens to the AAC comparison (D177).

## Validation

- Physical devices: no Fire HD 8 or iPad run recorded (DEVICE_LAB.md). Renderer acceptance is provisional.
- Child playtest: not run (PLAYTEST.md).
- Latest accepted audit: Codex acceptance audit. Audited SHA `ee4b140`. Verdict PASS WITH FIXES. Findings: subsequently addressed by Claude (D179 to D183, `ef58b2a` to `4b55c11`). Independent post-remediation re-audit: pending. The canonical audit copy is not yet in `docs/audits/`.

## Active workstream

Magical Kingdom (learner-storyteller) literacy pass. The Codex prototype (`76f3f16`) is integrated selectively on this branch (D186; its branch name contains a child's name, so it is not written here). The garden door opens the Word Garden: letter sound, blend, spell (docs/magical-kingdom/WORD_GARDEN.md). Browser only, not checked on a device. Words and lines recorded (D188). Blocked for a child session on: the 16 letter sounds (owner audition of 10 generated candidates, 6 stop sounds to record by a person) and an adult rehearsal on a Fire HD 8 and an iPad. Temporary architecture exception: the kingdom's separate database (D188). Waiting on owner decisions: the character's name (placeholder now), recording the phonemes, and whether this learner's mastery shares the main database.
