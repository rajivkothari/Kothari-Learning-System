# Quality audit, 2026-10-23

Branch `audit/2026-10-23` from `claude/m7-floor15-playtest` at `82ec49b` (the accepted integration branch). Strike Lab's stage 2 redesign (issue #3, PRs #4 and the `claude/strike-lab-challenges` branch) is under review and is not on this base; Strike Lab is audited as the shipped V0.1 round. Everything below was run in this session in headless Chromium on Linux unless marked Untested. Nothing here is a device result. Learner archetypes follow LEARNER_PROFILES.md; no learner details are recorded.

## 1. Inventory

| Game | Entry point | Learning objective (skills, grade band from the packs) | Archetype | Input |
|---|---|---|---|---|
| Elevator Quest, Floor 15 (`positions-and-capacity` v3) | launcher ELEVATOR QUEST, `?open=quest`; `src/themes/elevator-quest/ElevatorQuestApp.tsx` | Floor arithmetic (count up/down, add and subtract within 20, compare, order, two-part trips, ten-jumps), cargo loads (fill to capacity), reading jobs (key details, grades 1 to 2); math skills grades K to 2 (`content/packs/core.json`, `reading.json`) | learner-engineer | Tap floor buttons, DOOR OPEN/CLOSE, cargo crates, landing things, reading cards |
| Word Golf (Floor 20) | PLAY WORD GOLF on the Floor 20 landing; dev `scenario=minigame-word-golf`; `minigames/wordGolf/` | Spelling: short vowels, blends, digraphs, long vowels, two-syllable (`spelling.json`, grades K to 2); ten holes | learner-engineer | Tap letter tiles, tap targets, drag/tap aim, power buttons, PUTT |
| Cargo Commander (Floor 4) | PLAY CARGO COMMANDER; `scenario=minigame-cargo`; `minigames/cargo/` | Two-digit add and subtract, with and without a new ten (`two-digit.json`, grades 1 to 2); tiers approachable/solid/stretch | learner-engineer | Tap crates, WEIGH, SHIP |
| Tower Rescue: Quake Control (Floor 10) | PLAY TOWER RESCUE; `scenario=minigame-tower-rescue`; `minigames/towerRescue/` | Fill a power gap (`power-cells.fill`: missing addend within 10/20) and short reading reports (`repair` pack); ten levels | learner-engineer | Tap a cell, RUN TEST, level map |
| Elevator Express (Floor 1) | PLAY ELEVATOR EXPRESS; `scenario=minigame-express`; `minigames/express/` | Count up and down, read a note to pick a place, fill a power gap (`express-route` v1) | learner-engineer | Tap up/down, GO, options, places |
| Strike Lab V0.1 (B1 BOWLING) | PLAY STRIKE LAB at B1; `scenario=minigame-strike`; `minigames/strike/` | Fill a power gap, then pick two numbered pins that make a target (`pairs.make-target`, `quantity.pairToTarget`) | learner-engineer | Tap a module, tap two pins, drag to aim, POWER/SPIN, BOWL |
| Magical Kingdom (Ice Crystal, Flower Garden, Word Garden) | launcher MAGICAL KINGDOM, `?open=kingdom`; `src/themes/magical-kingdom/KingdomApp.tsx` | Fill to capacity 1 to 10 (crystal bridge), beginning letter sounds, letter sound to letter, blend three-letter words to a picture, spell three-letter words (`content/themes/magical-kingdom/learning.json`; placement K start) | learner-storyteller (pre-reader) | Tap or drag crystals/flowers, tap letters, pictures, tiles; HEAR |

Shared code every game is built on: the engine (`src/engine/`, pure; generators, evaluation, scaffolding ladders, mastery), the runtime (`src/runtime/gameRuntime.ts`: commands, append-only learning events, settings, world memory), persistence (`src/persistence/`: SQLite native, sql.js + IndexedDB in the browser), the mini-game session framework (`minigames/session.ts`: `submit` is the only evidence path, saves per instance, notes per learner; `host.ts`, `hostScreen.tsx`, `hostControls.tsx` BACK TO ELEVATOR, `hostSound.ts` semantic sound slots), the audio engine (`audio/audioEngine.ts`, `mix.ts` Normal/Quiet/Mute), design tokens and text roles (`presentation/design/tokens.ts`, `ui/textRoles.ts`), the developer tools (`src/devtools/`) and the browser e2e suite (`scripts/web-e2e.js`).

Deviations from the shared code:
- Magical Kingdom runs its own runtime over a separate database (D188, a documented temporary exception), its own audio (`magical-kingdom/audio`, `narration.ts`) and its own copy module, and it is not in the mini-game catalog, the host, the dev scenarios or the e2e suite.
- Word Golf and Tower Rescue choose levels with `chooseMission`; Cargo Commander chooses an instance id by tier (`cargo/tiers.ts`); Elevator Express and Strike Lab have one mission each.
- Narration exists only for Word Golf's words (38 recorded, 36 without) and Word Garden (lines recorded; 16 letter sounds pending the owner's audition, PROJECT_STATE.md). Lifty's lines in Elevator Quest are text only (ACCESSIBILITY.md: "no narration library yet").

## 2. Build and test suite on the base (verbatim exit codes)

| Command | Exit | Output |
|---|---|---|
| `npm run verify` | 0 | `Test Suites: 159 passed, 159 total` / `Tests: 2130 passed, 2130 total`; typecheck, lint and the Fire scan clean |
| `npm run validate:content` | 0 | `Tests: 295 passed, 295 total` |
| `npm run web:export` | see section 5 | |
| `npm run check:bundle` | see section 5 | |
| `npm run web:e2e` | see section 5 | |

## 3. Findings

(Filled in after the browser runs: see section 4.)

## 4. Per-game check log

(Filled in after the browser runs.)

## 5. Post-fix results

(Filled in after the fixes.)
