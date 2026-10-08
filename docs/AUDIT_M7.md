# M7 engineering and product audit

Scope: `claude/m7-floor15-playtest`, starting at remote commit
`604e2ce0ecec72f0788df01c8d7efff5fa900ac1`. The checkout and remote were verified before edits.
This assesses the current Floor 15 cartridge, not a proposed second mission or engine rewrite.
Before push, the remote advanced through `9a27cfa` and `ee86ca2`. Their fresh-question/answer
selection, wrong-load visibility, rescue layout fixes and optional two-leg trips were inspected
and preserved by rebasing the audit onto `ee86ca26f1930b2a6f55a8cdea79f7a737698080`.
The final browser harness rides both parts of a two-part trip.

## 1. Executive assessment

The build is a healthy vertical slice with unusually careful learning-record and crash-recovery
design. It is suitable for further supervised playtests. It is not yet demonstrated ready for
tablet release: native execution, memory, assistive technology, and the learner's understanding
after correction still need direct observation. Passing tests alone did not establish correctness;
the audit reproduced five scene/storage bugs and found a native connection constraint gap.

Approximate judgments out of 10, after the fixes; these are not measured scores:

| Area | Rating | Reason |
|---|---:|---|
| Architecture | 8 | Pure engine, useful runtime boundary, serializable content; a large cartridge director. |
| Reliability | 8 | Atomic evidence/checkpoints, idempotency and recovery; native validation outstanding. |
| Test quality | 8 | Real SQLite and fault injection; render mocks and device coverage remain limitations. |
| Performance readiness | 6 | Sensible animation ownership and bounded image cache; no Fire measurements. |
| Offline readiness | 8 | Local content, audio, art and storage; installation and native airplane-mode tests outstanding. |
| Accessibility | 6 | Good targets, contrast, calm motion and labels; reading and screen-reader gaps. |
| Game UX | 7 | A satisfying operating loop and exploration; one mission, uneven instruction density. |
| Learning UX | 7 | Specific correction and fresh follow-up; transfer and anti-guessing effectiveness unproven. |
| Cartridge/platform readiness | 6 | Reusable educational core, but only one substantial rendered cartridge. |

## 2. Most important findings

| Rank | Severity / value | Finding, impact, and disposition |
|---|---|---|
| 1 | P0 / HIGH LEVERAGE | Native exclusive transactions opened another connection without explicitly enabling foreign keys there. SQLite's setting is per connection and cannot be enabled after BEGIN. Fixed the adapter to open an isolated connection, apply pragmas before BEGIN IMMEDIATE, commit/rollback and close it. A real-SQLite bridge test starts connections with foreign keys OFF, verifies invalid references fail and partial writes disappear. Native binding behavior still needs device confirmation. |
| 2 | P1 / HIGH LEVERAGE | After cargo item regeneration, the bay and Lifty could retain the old orders while the runtime evaluated a new item. Reproduced after correction and repeated misses. Fixed by locking the old load during its consequence, then rebuilding from the regenerated runtime view. The regression solves that new item and checks its evidence signature. |
| 3 | P1 / HIGH LEVERAGE | Rapid replay taps created two new mission instances. Replay during a ride also needed a clean mechanical scene and explicit save recovery. Fixed with a synchronous loading/save guard, orderly mission handoff, canceled scene timers, a stationary initial cabin, and the existing save-error/retry path. Tests cover double taps, moving replay and failed creation. |
| 4 | P1 / HIGH LEVERAGE | An older tab's delayed BroadcastChannel claim incorrectly stopped the newest tab. Reproduced with an intentionally delayed real browser message. Fixed notifications to recheck durable IndexedDB ownership; atomic ownership checks on writes remain the protection against overwrites. Added a controlled delayed-message browser regression. |
| 5 | P1 / REASONABLE | Delayed success/scene callbacks ran after director disposal. Reproduced view changes after advancing virtual time on a disposed scene. Fixed ownership/cancellation of scheduled callbacks, guarded asynchronous startup and scene updates, and cleared subscribers. Disposal remains idempotent and stops active audio loops. |
| 6 | P2 / REASONABLE | A failed discovery write stayed optimistically marked and could never be retried in that session. Fixed removal of the failed optimistic key and refresh of the log; another inspection retries the save. Discovery remains separate from academic evidence. |
| 7 | P2 / HIGH LEVERAGE | WebP validation checked its container/header, not decoded pixels; Skia UI tests substitute the renderer. The real image-failure rehearsal also exposed unhandled fetch rejections in Skia's useImage hook. Added browser decoding of every approved/pending source, actual Review interaction, and an owned image-loading promise that catches rejected reads and null decoder results, reports missing assets and keeps vectors. A regression rejects the loader promise. Existing CRC/inflate PNG and production bundle checks are preserved. |
| 8 | P1 / EXPENSIVE BUT JUSTIFIED | Text-only instructions can obscure WHY a mistake was wrong for an emerging reader. Deferred narration/tap-to-hear and learner observation to a dedicated milestone; adding a narration pipeline here would exceed a contained audit fix. |
| 9 | P2 / HIGH LEVERAGE | Physical native crash, accessibility and memory behavior are not established by Node/Chromium tests. Deferred the device matrix, not its importance. |

No demonstrated evidence corruption remains unfixed. This is not proof that every possible
native crash or device failure has been exercised.

## 3. Improvements implemented

The changes repair state ownership at the cartridge/storage boundaries. They do not change
academic difficulty, scoring, content, rescue policy, or rewards. Replay is now a single recoverable
operation; cargo regeneration shows the item being evaluated; disposed scenes stop working;
failed world-memory writes can retry; and browser announcements respect the durable owner.
The native transaction adapter now establishes its constraints on the connection doing the work.
Image loads now handle rejected reads as well as failed decoding and ignore late results after
unmount or source changes, retaining the existing cache and vector presentation.

Browser tooling additionally supports `E2E_TOUCH=1` (960 × 600 logical Fire-preset window with touch capability) and
`E2E_REDUCED=1`, rejects unexpected external-origin requests, validates actual image decodes,
and exercises Review art and delayed tab claims. These are development tools, not learner features.
An additional browser fault rehearsal aborts illustrated image requests and checks the game still
accepts the first mechanical action through its vector presentation.

## 4. Learning-system findings

The learning definitions, skills, prerequisites, evidence policy and mission/scaffold definitions
are serializable and renderer-independent. Evaluation is deterministic. React forwards actions;
the engine decides correctness and the runtime owns durable evidence. Command ids, revisions,
item signatures and the director's answer window defend against duplicate and stale submissions.
Checkpoint, evidence, progression/unlocks and derived cache updates share a transaction.

Practice correction uses the learner's missed job, asks them to count it through, records the miss,
then offers a fresh equivalent. A correct response supported by rescue is not independent evidence.
The follow-up is also guided; encounter rescue uses a parallel example. The integrated upstream
change searches deterministically for a follow-up with both a different question signature and
a different answer (bounded, with an ordinary next-generation fallback for a tiny candidate range).
Those distinctions are
valuable: counting a revealed route cannot honestly demonstrate independent mastery.

Feedback already includes missing objects at wrong floors, travel comparisons, load limits,
misconception-specific counting cues, and visible count steps. Success Replay waits for NEXT JOB.
This is a sound Predict → Act → Observe → Revise structure. The cargo regeneration fix repairs a
break in that structure: the visible givens must match the evaluated givens.

Random guesses can still finish a job with sufficient support. That is compatible with the calm
product philosophy; it must not be interpreted as mastery. Different givens and a different answer
prevent simply repeating the correction's answer, but are not proof of transfer. Measure whether the
learner predicts the new destination/load and can explain the machine's consequence without help.
Do not respond by adding timers, penalties or withdrawing earned progress.

## 5. Gameplay findings

Operating the lift is the strongest part: floor lamps, floor-by-floor movement, doors, hall calls,
load consequences and machine inspection make actions tangible. Floor 15 restoration and the
Engineer Log allow a satisfying transition to free ride without a completion card blocking the
landing. The directory and labeled landing objects give exploration a purpose beyond questions.

Two-part trips can be ridden in two legs: the first part is a mechanical step, not an academic
submission or a mistake; only the final answer creates evidence. Upstream tests cover that
distinction, and the browser playthrough now performs both legs.

The first wrong answer now immediately offers a learner-paced correction; later scaffolds are
available without a help dead end. Correction and success explanations stay until an action.
Lifty's placement and speech have extensive layout coverage, but fitting text is not the same as
making it easy to understand. Several instructions combine two clauses or reverse relationships;
they need child observation, especially two-part trips and finding the starting floor.

Pending landing art and Lifty poses can improve identity and emotional readability, but approval
should follow actual review. Production legitimately uses approved art plus vector fallbacks;
the illustrated Review scene is not evidence that pending art ships.

## 6. Architecture findings

`src/engine` can run without React Native, Expo, SQLite or theme art. Boundary lint/tests prohibit
ambient randomness and clocks. `src/runtime` coordinates persistence/evidence; it is not an
elevator renderer. Simulation, audio semantics and the Floor 15 director are pure theme code.
World-memory discoveries are learner-scoped and do not become learning attempts.

The director is the largest maintenance risk (roughly 1,900 lines): it combines travel, cargo,
correction/follow-up, pacing, audio and mission presentation. This is still an understandable
vertical-slice tradeoff. Extract a cohesive responsibility only when adding a real interaction
requires it; do not introduce a generic cartridge framework just to shrink a file.

A Unity migration would still require porting TypeScript evaluation/simulation or an interop layer,
storage adaptation, and a new renderer. Serializable educational content survives much better
than React presentation. Some job-shape interpretation and corrective board construction are
handwritten in the director; they are portable logic, but not yet a renderer-neutral interaction
specification. Keep future educational meaning out of components; do not start a Unity port now.

## 7. Performance findings

Travel animation uses Reanimated rather than per-frame React state. The deterministic simulation
emits mechanical transitions; scene truth does not depend on animation completion. Audio is
pooled and has cleanup. The audit fixes timer callbacks and subscriber retention after disposal.

Decoded art is the main likely Fire pressure. The category LRU budgets total about 42.5 MiB,
excluding mounted/live references, GPU textures, canvases, audio and runtime overhead. An LRU
budget is not a process-memory ceiling. Source files are small because compression hides decoded
cost. Preload and repeated scene mounts should be measured on Fire before enlarging the art set.

Web persistence exports and stores the whole sql.js image after each transaction. This is a
reasonable playtest solution, with atomic ownership/durability checks, but scales differently
from native SQLite WAL. History benchmarks run on cloud V8/SQLite, not Fire/Hermes; they do not
establish device latency. No speculative micro-optimization or dependency upgrade was made.

## 8. Offline findings

Core content, assets and audio are bundled; native storage is local SQLite. No gameplay cloud API,
CDN font, Canva request, live AI or remote content dependency was found. Microphone recording
permissions are disabled in Expo configuration. Browser WASM files are copied locally by the
web preparation script; the browser playtest is not a PWA and cannot be assumed to reopen offline
without a running local server/cache. An installed native app has a different delivery contract.

The browser network guard tests gameplay with external origins denied. This establishes that
tested browser flows use local assets; it does not substitute for airplane-mode launch after
native installation. Browser profile clearing/incognito loses that local save by design.

## 9. Accessibility findings

The audit followed `docs/ACCESSIBILITY.md`. Large panel/crate/rescue targets, non-color state cues,
contrast checks, accessible control labels, visual audio equivalents, calm pacing and Reduced
Motion are meaningful strengths. Stored motion preference overrides the OS; access settings
do not lower cognitive challenge. Nothing imposes time pressure or punishment for help.

The main unresolved barrier is reading: no narration or tap-to-hear. Secondary HUD icons have
48 pt visuals with hit slop; shaft rows are smaller than the primary 64 pt controls and have a
panel alternative. Check real touch spacing rather than treating hit slop as a guaranteed 64 pt
layout. Text sometimes disables font scaling and uses finite lines; large text needs device review.
Modal focus isolation and VoiceOver/VoiceView activation have not been proven by labels or mocks.
No physical screen reader, sound-level or tablet accessibility claim is made.

## 10. Test quality

Strong coverage includes real file-backed SQLite migrations/constraints, interrupted transactions,
idempotent commands, checkpoint recovery, supported versus independent evidence, deterministic
simulation, equivalent Reduced Motion records, complete headless missions, layouts, art rights,
PNG binary integrity and native release bundle isolation. These test contracts, not just counts.

Eight new unit/integration regressions cover the fixes; the browser checks also reproduce delayed
claims and decode actual art. Remaining gaps include native bridge execution, GPU/Skia decoding
on Fire, assistive technology, mobile browser lifecycle suspension, OS termination, and true
child transfer. Component tests use a Skia stand-in and cannot prove visual quality.

Heavy simultaneous cloud checks caused a 5-second component-test timeout and cascading act()
failures. The original isolated suite passed without changing its assertions or timeouts. The
integrated upstream commits independently give two lengthy rendered integration cases a 20-second
limit; their assertions remain intact. Bound resource use in CI and do not silently count failed
invocations as passing evidence. CI is absent; the existing gates need an
automated runner before wider distribution. Some art UI tests also share ordered setup/state;
avoid using those alone as a production-art guarantee.

## 11. Deferred recommendations

| Classification | Severity | Next work |
|---|---|---|
| HIGH LEVERAGE | P1 | Observe wrong-answer → correction → fresh-job behavior with a learner; record predictions/explanations and help use locally. |
| HIGH LEVERAGE | P2 | Put verify, release content/art and bundle gates in CI with explicit Node/browser versions and bounded workers. |
| HIGH LEVERAGE | P2 | Physical Fire/iPad crash, airplane-mode, rapid replay and art-fallback rehearsal. |
| REASONABLE | P2 | Review text scaling, modal focus, secondary HUD hit areas, and malformed settings/save-error handling. |
| REASONABLE | P2 | Expo's web audio player discards the media play() promise; pausing a pending play may emit a harmless AbortError. The harness reports and narrowly excludes that specific interruption, while other errors still fail. Address at a documented audio-adapter/dependency boundary rather than globally suppressing errors. |
| REASONABLE | P2 | Retain the new follow-up diversity constraint when adding templates; explicitly validate tiny generator ranges where its bounded search may fall back. Current follow-up diversity was addressed in the integrated upstream change. |
| REASONABLE | P3 | Update stale milestone/Git documentation and tidy ordered art-test fixtures in a maintenance pass. |
| EXPENSIVE BUT JUSTIFIED | P1 | Optional local narration/tap-to-hear with reviewed content, quiet-mode integration and device accessibility tests. |
| EXPENSIVE BUT JUSTIFIED | P2 | Measure Fire decoded/GPU/process memory, cold launch and history restore before changing preload strategy. |
| SCOPE TRAP | P3 | Unity port, generic no-code cartridge engine, Mission 2, floor-exit worlds, Golf/Bowling, online accounts, dashboards, economy or adaptive AI. Not started. |

The established product philosophy was preserved. No disagreement was used to silently change it.

## 12. Verification

Final command results are recorded after completing all gates. Environment: Node 24 / npm 11,
headless Chromium, cloud Linux. Browser touch capability/viewport and Reduced Motion are simulations,
not physical iPad or Fire testing. Raw logs and diagnostic screenshots stay outside tracked files.

| Command/check | Actual result |
|---|---|
| Baseline `npm run verify` | 77 suites / 666 tests passed before the regression probes. |
| Final `npm run verify` | TypeScript, lint, 80 suites / 678 tests and Fire compatibility passed after integrating the new remote commits (674 tests before integration). |
| Targeted audit regressions | 7 real-SQLite/virtual-time tests passed; four original scene bugs first failed their regressions. The additional rejected-image regression and all 8 existing art-screen tests passed. |
| `npm run validate:content:release` | 8 suites / 125 tests passed, including content budgets, manifest/rights and binary art integrity. |
| `npm run web:export -- --max-workers 2` | Completed export of the final code; local WASM and asset files included. |
| `E2E_TOUCH=1 E2E_REDUCED=1 npm run web:e2e` | All 14 checks passed at 960 × 600 logical pixels with touch capability, the Fire HD 8 simulator preset and reduced-motion preference. A separate pre-integration 1280 × 800 touch run also passed all 14 checks. |
| Final normal-motion `npm run web:e2e` | All 14 checks passed at 1180 × 820, including mission/resume, completion, exploration, replay, Start Over, correction records, tab races, all 23 approved/pending image decodes, Review and forced image failure. No unexpected external requests or unhandled errors in either final run. |
| Direct touch rehearsal (scratch browser harness) | Normal and Reduced Motion: wake/hall call, wrong floor/miss, counted correction, fresh job, clue, correct answer, child-paced success and reload; no page errors. Rescue taps scoped to the board to avoid duplicate floor labels. |
| `npm run check:bundle` | Android and iOS production exports passed: all 11 approved assets, no 13 pending/rejected assets, no developer markers. Development web positive controls contain calibration + 12 pending assets and exclude the rejected file. |
| `npm run bench` | Pre-integration diagnostic passed at ~1k/10k/50k attempts. At ~50k: cold rebuild 2.06 s, current-cache restore 0.44 ms, command p50/p90 1.32/1.47 ms on this cloud V8/SQLite run. Concurrent workloads make these diagnostic, not acceptance budgets. |
| Privacy review / source scan | No gameplay network API/analytics SDK/remote content calls found; audio recording permissions off; browser tests deny unexpected external requests. Changed files inspected for secrets/private learner data. |
| `npm run doctor` | 19/21 passed; Expo schema API and React Native Directory metadata checks failed because remote services could not be reached (`EAI_AGAIN exp.host` / unexpected server response). External metadata validation remains incomplete; no dependency was upgraded. |
| Final diff / script syntax | `git diff --check` and `node --check scripts/web-e2e.js` passed; generated exports, logs, temporary scripts and screenshots stay untracked outside the commit. |

Two contended full-suite invocations failed at the existing 5-second trip-meter component test,
then cascaded into act()/query failures. The isolated invocation passed without assertion or timeout
changes. The subsequently integrated upstream commits raise two lengthy integration test timeouts
to 20 seconds, as noted above. An intermediate browser invocation was invalidated by rebuilding its export while its
server was still reading it; the final invocations use the completed export. Neither failed
invocation is presented as passing evidence.

## 13. Exact pushed HEAD

The final response supplies the exact pushed commit, verified against
`refs/heads/claude/m7-floor15-playtest`. This document cannot contain its own Git commit hash.
No push to main and no pull request are part of this task.

## 14. Recommended next three milestones

1. **Prove the correction loop.** Supervised learner sessions on this mission: wrong predictions,
   visible consequence, counted correction, fresh prediction, explanation and delayed transfer.
   Refine short cues only where observations show a problem; preserve evidence distinctions.
2. **Prove tablet readiness.** Installed Fire/iPad builds: native SQLite constraints and crash recovery,
   airplane-mode launch, decoded/GPU memory, long sessions, rapid controls, failed art and screen readers.
   Establish device acceptance budgets from measurements, not cloud benchmark numbers.
3. **Close access and release gaps.** Optional local narration/tap-to-hear, validated focus/text scaling,
   reviewed candidate art, and automated reproducible gates. Extract interaction logic only where this
   work reveals a concrete portability need. Do not begin a second cartridge yet.

These milestones are recommendations only; this audit does not start them.
