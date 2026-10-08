# Learning Model

How the engine represents skills, judges mastery, classifies repetition, records assistance, decides eligibility, and rates progression value.

Status: implemented in M2, revised in M3 (upgrade model, missions), as pure TypeScript in `src/engine/` (module map in ARCHITECTURE.md section 2). It runs entirely in Node tests. Every number is a tunable assumption in `content/engine-config.json` (`status: "initial-unvalidated"`). None of them is research-validated. Tune them after playtests.

## 0. The core separation

| Durable (never rewritten) | Derived (recomputed any time) |
|---|---|
| Attempt evidence: what happened on each item | Skill levels, dimensions, review schedule |
| Completion records: an activity, encounter, or mission instance finished | Exposure class (replay, review, application...) |
| | Progression opportunities (best tier per key) and upgrades |
| | Game-progress signals |

`createProcessor(ctx)` applies learning events (attempts and completion records) in the order given. Persistence feeds them in insertion order (`seq`). `replayEvents` dedupes by id. `deriveLearnerState` and `runTimeline` are conveniences for attempt-only callers: they sort by (time, id) and synthesize completion records. Processor state exports to a versioned snapshot (the derived cache) and restores from it. Change the policy and the same evidence produces new state. Evidence carries the facts it needs (skills, challenge, transfer context, representation, assistance, signature) so it stays meaningful even if content changes later.

## 1. Skill graph (`skills/`)

```ts
SkillDefinition {
  id: "math.add.within20";       // dotted, permanent
  domain: "math" | "literacy" | "science" | "logic";
  strand: string;
  label: string;                 // parent/developer label, never shown as a grade
  gradeBand?: [low, high];       // metadata only: -1 = Pre-K, 0 = K, 1..8
  prerequisites: SkillId[];
  representations: string[];     // mastery asks for variety across these
  tags: string[];
}
```

`buildSkillGraph` rejects duplicate IDs, missing prerequisites, self-dependencies, and cycles (reporting the cycle path), and returns a prerequisites-first order. A skill unlocks when every prerequisite's PEAK level has reached `prerequisiteMinLevel` (default `proficient`). Peaks never drop, so a later dip in a prerequisite does not re-lock anything.

### Starting placement (an explicit assumption)

A placement (`PlacementSchema`, `content/placement/demo-start.json`) unlocks named skills for play when their prerequisites have no evidence yet. It never claims anything about the prerequisites: their levels, peaks and evidence stay exactly as observed (`learner/placement.test.ts`). A placed skill still progresses only on its own evidence.

Each placement records its `source`: `assumption` (today: the Floor 15 demo places the learner at add and subtract within 20), `parentSetup`, `calibration` or `observed`. Only `assumption` exists now. Later, placement comes from parent setup at profile creation, a short calibration, and observed play, in that order of arrival. The placement is part of the derived-cache key, so changing it triggers a rebuild from history.

The sample pack has 12 skills from Pre-K counting to Grade 8 linear equations, plus three literacy skills. It is not a curriculum, only proof that the graph spans the range.

The app ships two packs, composed into one (M8, D154): `content/packs/core.json` (math) and `content/packs/reading.json` (reading), core first (`composeContentPacks`; a duplicate id is an error). M8 added three math skills to core (`math.count.skip.within20`, `math.placeValue.teens`, `math.compare.within20`; grade band 1 to 2, prerequisite `math.count.within20`) and six reading skills. The reading skills have no prerequisites, so nothing locks reading:

| Skill | What it means | Grade band |
|---|---|---|
| `ela.comprehension.keyDetails` | read a short text and act on its key details | 1 to 2 |
| `ela.comprehension.inference` | work out what a text means but does not say, from its clues | 2 to 3 |
| `ela.comprehension.sequence` | follow the order of steps (first, before, after) | 1 to 2 |
| `ela.vocabulary.context` | work out a word's meaning from the sentences around it | 1 to 2 |
| `ela.comprehension.causeEffect` | tell what caused an event | 2 to 3 |
| `ela.language.sentences` | tell a whole sentence and a question, and what a word like "it" points back to | 1 to 2 |

## 2. Skill state: level + four dimensions (`learner/model.ts`)

Levels: `locked -> introduced -> practicing -> proficient -> mastered`. "Applied" is not a level. Transfer is a dimension reported next to the level, and it can appear before mastery.

| Dimension | Computed as | Answers |
|---|---|---|
| accuracy | successes / scored, over the last `recentWindow` (10) scored attempts | can they get it right? |
| independence | mean assistance credit per scored attempt in that window, failures = 0 | without help? |
| retention | count of qualifying successes at least `retentionGapHours` (20) apart: none / single / spaced / durable | does it hold over time? |
| transfer | distinct transfer contexts succeeded with at most `clue` help: none / emerging / demonstrated (2+) | used uncued, in a new context? |

Plus variety: distinct item signatures solved, and representations solved.

Level gates (initial, tunable):

| Level | Gate |
|---|---|
| locked | a prerequisite's peak is below `prerequisiteMinLevel` |
| introduced | unlocked, no scored attempts yet |
| practicing | at least one scored attempt |
| proficient | >= 4 recent successes, accuracy >= 0.8, independence >= 0.65, >= 3 distinct items |
| mastered | proficient + >= 5 distinct items + representations (min of 2 and what the skill declares) + retention `spaced`, and no failed review awaiting reconsolidation |

Each state carries a plain-language `explanation` of what is missing for the next level.

Evidence rules:
- A scored attempt is any correct or incorrect attempt, except a correct exact repeat of an item already solved (it adds nothing). An abandoned attempt is not scored.
- A demonstrated answer earns 0 credit, so it is never a success and never independence evidence.
- Assistance credit (independent 1, retry 0.75, clue 0.5, verbalHint 0.35, visualSupport 0.3, guided 0.1, demonstrated 0) must be non-increasing. The policy schema rejects anything else.
- Gates count successes, not attempts, and treat failures as 0 credit. That is deliberate: it makes "an extra failure can only lower or delay a level" a provable property, so failing cannot accelerate a milestone.

Known nuance: if an item was first shown with a demonstrated answer and the learner later solves that same item independently, the later solve counts as new evidence. That is correct behaviour (they had not solved it before), so "more help on one attempt never raises the level" is only claimed for distinct items, and tested that way.

## 3. Repetition and novelty (`learner/exposure.ts`)

Every item presentation is classified from explicit evidence (signature, declared transfer context, mastery peak, review schedule). Text comparison and inference play no part.

| Class | Rule (checked in this order) |
|---|---|
| exactReplay | the item signature is already solved for every skill it exercises |
| novelApplication / higherOrderApplication | the item declares a transfer context not yet succeeded for some skill |
| dueSpacedReview | all skills mastered (peak) and a review is due |
| easyVariation | all skills mastered (peak), no review due |
| developing | anything else: ordinary learning |

`developing` is a sixth class the original five needed: practice on skills not yet mastered.

The signature hashes the item's meaning (template id, version, concept, prompt), not its seed, option order, or presentation text. The hash is pinned by a test because stored signatures depend on it.

## 4. Spaced review (`review/review.ts`)

Small and adjustable, not a memory-science claim.
- The review clock starts when a skill first reaches Mastered.
- A review is due when `reviewIntervalsDays[stage]` (3, 7, 21, 60, then 60 repeating) has passed since the last qualifying demonstration.
- A qualifying success (correct, at most `clue` help, not an exact replay) while due passes the review: stage +1, clock resets.
- A review can never be due immediately after mastery (property-tested).
- The schedule moves only on qualifying successes. A failure while due sets `needsReconsolidation`, which lowers the current level to Proficient (peak stays Mastered) until a qualifying success at least `retentionGapHours` after the failure.
- Failures never make reviews come sooner. That is a deliberate trade: pedagogically you might want quicker relearning, but a schedule that responds to failure lets deliberate failing earn more review value. Relearning practice is offered through eligibility (`needsReconsolidation` makes practice eligible again) instead.

## 5. Assistance evidence vs scaffolding policy (`evidence/`, `scaffolding/`)

Assistance evidence uses one fixed scale for every activity: `independent, retry, clue, verbalHint, visualSupport, guided, demonstrated`. An attempt records the most help received, and at least `retry` after a wrong answer (the schema rejects "independent" after wrong tries).

A scaffolding policy is data per activity type: ordered steps, each tagged with the assistance level it represents and offered `onRequest` or `afterWrongTries: n`, plus `allowLeaveAndReturn` and `regenerateAfterWrongTries`. `allowLeaveAndReturn` is declared data only: no runtime reads it yet (see "Leaving a job and coming back" below). The schema rejects help that decreases and steps claiming `independent` or `retry`. The engine provides only `nextScaffold`, `shouldRegenerate`, and `assistanceForProgress`. The sample pack has three different policies (arithmetic, phonics, an encounter policy that never demonstrates answers).

Steps are offered at their threshold, and a step whose threshold has not arrived is still available on request (`requestableEarly`, default true), so help is never a dead end after the first clue. A demonstrated step is never requestable early (the schema rejects it). Floor 15's default ladder (`moves.on-a-line`, all thresholds are data):

| Miss | What happens |
|---|---|
| 1 | consequence (the ride) plus brief feedback, misconception-specific when tagged. The clue can be asked for |
| 2 | attention hint offered: the givens are ringed (clue) |
| 3 | visual tool offered: the shaft map as a number line (visualSupport) |
| 4 | explicit strategy offered: how to count, marking only the first two floors (guided) |
| 5 | Concept Rescue |
| 7 | show the answer (demonstrated), after the rescue |
| 8 | regenerate a sibling item |

Reading jobs use their own policy, `reading.text-clue` (M8, D155). The text is the help:

| Miss | What happens |
|---|---|
| 0 | CLUE can be asked for at any time: the key sentence of the note is lit (clue) |
| 1 | consequence (what was touched, named, or the floor the ride reached) plus one cue, misreading-specific when tagged. CLUE is offered |
| after CLUE, once there has been a miss | SHOW ME is offered: the answer is shown (demonstrated, no credit) |
| 2 | the item is resolved as an incorrect attempt and a fresh item replaces it (`regenerateAfterWrongTries: 2`), so three options are never cleared by elimination |

No Concept Rescue: the counting board is for counting, and the theme's reading validator refuses a reading policy that has one.

A regeneration after too many misses picks the next generation whose question and answer both differ from the item it replaces, else the next whose question differs, else simply the next generation (`nextDifferentItem`, the same choice as the fresh item after a correction, D151, D154). With a small pool of authored items the plain next generation could be the same item. Deterministic and bounded; no generator output changes.

Not built: idle-time and struggle-state triggers, and learner support-profile timing. The policy shape leaves room for them.

### Leaving a job and coming back

The principle (long term): leaving a hard job and coming back to it later is a legitimate move, never a failure. The world remembers the job, nothing is lost or penalized, and coming back does not make the job easier. Policies already carry `allowLeaveAndReturn` for it.

What Floor 15 does today: there is no way to park a job and pick another. The first miss on a practice job starts a correction (D149, below): the learner counts that job through, then a fresh job of the same kind replaces it. On the fresh job help grows with misses (section 5) and a new variant replaces it after `regenerateAfterWrongTries`. The mastery encounter keeps the generic rescue at the fifth miss. Closing the app and reopening it is a resume, not a leave-and-return: the same job comes back with its misses and help kept. Building real leave-and-return (a job board, parked jobs, a return path) is later work and needs its own decision.

### Concept Rescue

A policy may declare `conceptRescue: { afterWrongTries, returnTo: "same" | "fresh" }` (default threshold about 5). The schema requires `regenerateAfterWrongTries` above the rescue threshold, so a rescue always happens on the item it is for.

When the miss count reaches the threshold:
1. The challenge pauses. Submitting the target or asking for other help is refused (`rescueActive`). The view shows no other scaffold.
2. The engine picks a parallel example: same generator and params, a different item and a different answer, deterministic (`<item seed>|rescue<k>`, k < 24). It prefers examples that keep the target's non-numeric givens (same direction) and the smallest numbers, so the idea is easy to see. The example is stored by seed and signature, so it survives a restart and a content change is detected.
3. Focus: misconception-specific only when the evidence is strong (the top tag appears at least twice and in at least half of the misses). Otherwise the rescue explains the concept generally.
4. The learner works the example (`rescueAnswer`). A wrong example answer is a retry of the example. Neither produces learning evidence: the example's answer is taught.
5. Return: `same` brings back the original item, unsolved, with its miss history. `fresh` resolves the old item as a miss and generates a new variation. Either way the learner does the final reasoning, and the target answer is never revealed by the rescue.

Correction (`example: "target"`, D149). A policy may make the rescue work through the item the learner just missed instead of a parallel example: `conceptRescue: { afterWrongTries: 1, returnTo: "fresh", example: "target" }`. The schema requires `fresh` with `target`, because the item's answer is worked out on the board, so it is never answered again. On completion the missed item is resolved as an incorrect attempt (`conceptRescue: true`, its misconceptions kept) and a fresh equivalent item (same activity and params) takes its place with `rescuedBefore`: the next generation whose question and answer both differ from the missed item, chosen deterministically from a bounded set (D151), so the learner never gets the job they just counted out. A rescue happens at most once per item lineage (the item, the fresh item that replaced it, and any variant a later regeneration brings), so a correction never loops; misses on the fresh item use the ordinary ladder. A regeneration after a rescue carries `rescuedBefore` to the variant (D153), so a first-try right answer on it is `guided` with `conceptRescue: true`, never independent; a learner never rescued gets a clean variant as before. The view says which kind it is (`RescueView.source`). The core pack's practice policies (`moves.on-a-line`, `loads.counted`) correct at the first miss; `encounter.clues-only` keeps the parallel rescue at five. Not easier: the fresh item comes from the same params as the missed one (non-negotiable 7).

Evidence: the solved target is recorded as `guided` with `conceptRescue: true`. After a correction the fresh item is recorded the same way (`guided`, `conceptRescue: true`) even when the learner solves it first try with no help: the correction was help. Whether they managed it alone is still readable (outcome, `wrongTries` 0, no scaffold steps), and the theme's playtest report states it per correction. That is real but weak evidence of the item, never independent. Demonstrated-answer contamination rules are unchanged: only a demonstrated step contaminates an item, and the rescue example's signature never counts as solved. Tests: `mission/conceptRescue.test.ts`, `themes/elevator-quest/director/rescue.test.ts`, `themes/elevator-quest/director/correction.test.ts`, and the crash matrix (`faultMatrix.test.ts`).

Fixed principles regardless of policy:
- An incorrect answer never automatically makes the next item easier.
- No identical item loops: policies regenerate a sibling variant after N wrong tries.
- Leaving and returning is always allowed.

## 6. Deterministic generation and misconception tags (`generation/`, `evaluation/`)

- `generateItem(generator, params, seed)` seeds an sfc32 PRNG from `"<template>@<version>:<seed>"`. Same template version + params + seed gives the identical item. `Math.random` is banned in the engine (lint rule, purity test, and a spy test).
- Generators are pure `(params, rng) -> draft` with an independent `solve(prompt)` used by validation, and an exact `countVariants(params)`.
- Changing a generator's output for any seed requires bumping its version.
- Items are theme-neutral: `{ concept: "positionAfterMove", prompt: { start, change, direction, low, high } }`. The theme layer decides it is a building, a path, or a number line.
- Distractors may carry a misconception tag (`quantity.reversedDirection`, `quantity.countedStartingPosition`, `quantity.countedOneExtra`, `quantity.answeredWithChange`, `literacy.choseFinalSound`, `literacy.mirroredLetter`, ...). Untagged distractors are allowed: not every wrong answer has one likely cause. `evaluateResponse` surfaces the tag of the chosen option.

Generators: `quantity.positionAfterMove@1`, `quantity.remainderAfterFullLoad@1`, `quantity.fillToCapacity@1`, `literacy.beginningSound@1`, and since D148 (2026-10-07):

| Generator | Concept | The question, theme-neutral | Answer | Tags |
|---|---|---|---|---|
| `quantity.positionAfterTwoMoves@1` | `positionAfterTwoMoves` | start at A, move B one way, then C back the other way (C differs from B; every stop in bounds) | a position | `ignoredSecondMove`, `sameDirectionTwice`, `ignoredFirstMove` (off-by-one fillers untagged: over two moves no single cause is likely) |
| `quantity.startBeforeMove@1` | `startBeforeMove` | a move of B ended at E; where did it start? | a position | `repeatedTheMove` (applied the move again from the end), and the counting causes measured backward from the end: `countedStartingPosition`, `countedOneExtra`, `answeredWithChange` |
| `quantity.equalJumps@1` | `equalJumps` | jumps of S from zero, the first two landings shown; where is jump N (N at least 3)? | a position | `oneJumpShort`, `oneJumpExtra`, `addedInsteadOfMultiplied`, `answeredWithJumpCount` |
| `quantity.distanceBetween@1` | `distanceBetween` | at A, the target at B: how far apart? | a count | `countedBothEnds` (counted the start too), `answeredWithTarget`, `answeredWithStart` |
| `quantity.combineGroups@1` | `combineGroups` | two groups asked for, more waiting than that | a count | `countedOneGroupOnly`, `tookEverythingWaiting`, `countedOneExtra` |

The core pack ships one activity each (`two-moves.line.cued`, `start-unknown.line`, `equal-jumps.line.cued` with jumps of 2, 3 or 5 and landings up to 20, `distance.meter` with distances 3 to 9, `combine-groups.objects` with orders of 2 to 6 totalling at most 11 and 2 or 3 extra waiting), all value answers. Skill `math.mult.equalGroups.within20` (grade band 2 to 3, prerequisite `math.add.within20`) is new; the others count toward add and subtract within 20. Start-unknown and distance are not cued (the operation that answers them is not the one named), and claim no transfer. Measured headless on 2026-10-07: one clean run of the longer Floor 15 scores 7 of 7 for add and subtract within 20 (Proficient, transfer demonstrated), and 1 of 1 for equal jumps (Practicing: needs 3 more recent successes and 2 more distinct items). One express job per run cannot take multiplication further in one session.

M8 (D154, D155) added three math generators, a version 2 of two, and the reading generator:

| Generator | Concept | The question, theme-neutral | Answer | Tags |
|---|---|---|---|---|
| `quantity.missingInSequence@1` | `missingInSequence` | a pattern going up or down by S from any start (the first term always shown), one term missing: in the middle, or the next one | a position | `countedByOnes`, `skippedATerm` |
| `quantity.tensAndOnes@1` | `tensAndOnes` | from a start, one jump of ten, then some ones the same way; from zero it builds a teen number | a position | `countedTenAsOne`, `ignoredTheOnes`, `ignoredTheTen`, and the move's `reversedDirection`, `countedStartingPosition`, `countedOneExtra` |
| `quantity.orderPositions@1` | `orderPositions` | two or three positions; going up or down, which is reached first, second or third | a position | `comparedOnesDigits`, `reversedOrder`, `choseListedOrder` |
| `quantity.positionAfterTwoMoves@2` | `positionAfterTwoMoves` | as version 1, and the second move may go the same way (`secondDirection`: opposite, same, either) | a position | version 1's, plus `reversedSecondMove` |
| `quantity.combineGroups@2` | `combineGroups` | as version 1, with the pairs any, doubles or near doubles (`pairs`) | a count | version 1's, plus `doubledOneGroup` |
| `literacy.authoredItem@1` | `authoredItem` | one of the authored items the activity lists (an id, the answer, one to five wrong values) | the authored value: a landing object id, a floor, or a card id | `reading.*`: `ignoredNegation`, `choseFirstNamed`, `choseLastNamed`, `wrongDirection`, `wentToOtherPlace`, `usedNumberAsAnswer`, `followedWordOrder`, `mixedUpSides`, `otherWordMeaning`, `swappedCauseAndEffect`, `matchedWordsOnly` |

Version 1 of the two changed generators stays registered unchanged for the activities and evidence that use it. The core pack has 21 new math activities, on these and on the older generators (bigger ranges, through ten, teens), all practice with value answers, on `moves.on-a-line` or `loads.counted`, and the reading pack has ten activities with 31 items.

Authored items are written, not computed. The prompt is the item id and its authored answer, so the signature is per item and changes if an answer is edited (a saved item whose answer changed is detected as changed content). The solver returns the authored answer: that the answer is right is checked by the content validation and an adult review. A presentation layer never shows it: it learns correctness from the response result, as for every item. An activity needs at least two items, so a fresh item can replace a missed one. Evidence for a reading job follows the usual rules: a first-try right answer with no help is independent, CLUE caps it at clue, a right answer after a miss is at least retry, SHOW ME makes it demonstrated, and a second miss records the item as incorrect. Answering by touching a landing thing or by pressing its card is the same option and the same command, so the evidence does not depend on how the learner answered. An activity holds only two to five items, so a later run often brings back a note the learner already solved: that is an exact replay and adds no evidence (section 3). More items are content work.

## 7. Three separate concepts (`progression/`)

| Concept | What it is | Where | Who reads it |
|---|---|---|---|
| Learning evidence | what the learner did and how much help they had | `learning_events` (append-only) | learner model, Parent Mode later |
| In-game progression | visible acknowledgement of continued learning: practice credit, skill milestones, mission completion | `GAME_PROGRESS` intents (`signals.ts`) | a future XP/rank formula. Classifications only, no numbers, nothing time- or login-based. |
| Progression opportunities | scarce one-time accomplishments, each with a best tier | `progression_events` (append-only) and processor state | a future Quest Token system. The engine never knows token amounts. |

Routine practice feeds evidence and game signals. It creates no opportunity on its own.

### Opportunities and upgrades

Every opportunity has a stable key and a ceiling tier. The ledger remembers the best tier demonstrated per key. A later, stronger demonstration upgrades it and only the increment is new. Lifetime value = sum of best tiers, so it can never exceed what an immediate strongest demonstration would have earned.

| Kind | Key | Ceiling |
|---|---|---|
| `firstClear` | Stretch activity / Mastery Encounter | normal / high |
| `transferContext` | declared context | novel normal / higher-order high |
| `levelPeak` | skill + level | Proficient normal / Mastered high |
| `reviewStage` | skill + stage | low |
| `missionComplete` | mission id | mission `completionTier` |

Demonstrated tier = ceiling capped by assistance: demonstrated voids it, guided caps at low, verbalHint/visualSupport drop one tier. A demonstration needs a fresh credited success in the completion (not an exact replay, correct, credit > 0). `levelPeak` is checked for every skill at every completion, so a peak reached through an unlock is recognized immediately, not by a later replay.

Invariants, property-tested in `value.property.test.ts`:
- Upgrade increments sum to lifetime value.
- Inserting failures anywhere, adding wrong tries, or adding unnecessary help never raises lifetime value.
- A weaker earlier demonstration of the same key plus a later strong one totals no more than the strong one alone.
- Duplicated events and replayed completions add nothing.

## 8. Eligibility (`eligibility/`)

`checkActivityEligibility` and `checkEncounterEligibility` return `{ eligible, playableForFun, reasons[] }`, never a bare boolean.

| Reason | When |
|---|---|
| skillLocked | a skill's prerequisites have not peaked high enough (lists them) |
| belowStretchLevel | Stretch needs the skill at `stretchMinLevel` (practicing) |
| encounterRequirement | an encounter's `requires` levels are not met |
| masteredNoReviewDue | practice on mastered skills with no review due or reconsolidation needed (for fun only) |
| replayExhausted | every variant of the activity has been solved (for fun only) |
| encounterStageOnly | encounter stages are played through their encounter |

Not built: choosing what comes next. There is no scheduler yet.

## 9. Challenge categories

Practice, Stretch, and Mastery Encounter are semantic categories on activities and evidence. No fixed ratio exists anywhere. A future scheduler (a pure function of learner state, mission template, session context, and config) will choose composition. Mastery Encounters stay rare and memorable.

## 10. Struggle signals (not built)

Planned as gameplay state, never emotion: wrong attempts, hint requests, idle time, rapid random taps, resets, abandonment. These will produce `struggleState: none | productive | unproductive | disengaged`, which scaffolding triggers can read. Younger learners get offers sooner. The engine will never label emotions or show these states to the learner.

## 11. Missions (`mission/`)

A mission is an ordered list of steps: `narrative` (acknowledge), `activity` (1-10 items), or `encounter` (its stages in order). Schema and fixtures: CONTENT_MODEL.md.

Pools (M8, D154). An activity step may list `activityIds` (two or more) instead of one `activityId`. Each mission instance presents one member, picked by `poolChoice(seedBase, missionKey, step)` (`mission/pool.ts`): a pure function of stable inputs, so it is never stored, a resumed or restarted instance gets the same activity, and different instances see different members. The item seed formula below is unchanged. The view names the chosen activity (`step.activityId`) and the pool (`step.pool`), and the attempt records the chosen activity, so evidence says which activity it came from. The choice formula is treated as versioned.

The shipped mix (`positions-and-capacity` version 3): fourteen jobs a run, ten math (the encounter's two stages included) and four reading. Each pool member is equally likely, so the expected math per run is about 39% review (upper first grade), 47% solid second grade and 14% stretch within second grade, and no math skill used starts after grade 2. The level of each activity is a content judgement recorded in `validation/missionMix.test.ts`, which checks the arithmetic. These levels are labels for the mix, not challenge categories (section 9): of the stretch pool only the beacon job is a `stretch` activity, and the rest are practice, so they earn no stretch first-clear. Pools give variety; they do not adapt. Nothing picks a member from the learner's state: choosing what comes next from evidence is the scheduler, still not built (section 8).

`applyCommand(ctx, state, command)` is a pure reducer. Commands: `acknowledge`, `submit`, `useScaffold`, `rescueAnswer`, `abandon`, each with a `commandId` and caller time. It returns the next checkpoint, presentation intents, and learning events. A repeated `commandId` is ignored.

Deterministic items: seed = `<seedBase>|<mission>@<version>|<step>|stage<s>|item<i>|gen<g>`. The checkpoint stores only position, wrong tries, help used, and the item signature, and regenerates the item from the seed on resume. A signature mismatch throws instead of silently showing a different item (see "Content changed under an active mission" below). The same item comes back until it is solved or regenerated after `regenerateAfterWrongTries`.

Scaffolding at runtime: the view lists at most one available help step (the policy's next step), as `offer` or `available`. `useScaffold` must name that step. The attempt records the most help used. `rescueAnswer` is Concept Rescue (section 5).

Demonstrated answers contaminate one exact item, never the skill (`learner/demonstrated.test.ts`):
- The demonstrated attempt is recorded as `demonstrated` (0 credit) and counts as a scored zero in the recent window until it scrolls out.
- Its signature counts as seen, so solving that same item later is an exact replay: no accuracy, independence, retention, or opportunity value.
- A new legitimate variation of the same skill solved independently is full evidence. It moves levels and can upgrade opportunities, and lifetime value equals that of a learner who never needed the demonstration.

Answer modes: an activity's `answer` is `choice` (pick a generated option) or `value` (produce any integer in [min, max]). A value answer is harder, so the mode is content, not theme. Evaluation compares the value with the answer and surfaces a misconception when the value matches any tagged distractor the generator proposed (`diagnostics`), even one that did not fit in the option list. The views hide the options in value mode. Values outside the domain, or of the wrong mode, are refused without counting a try.

Success replays (M7, `src/presentation/reinforcement/strategy.ts`) are presentation only: after a correct answer the theme shows one way to reach it, chosen from the givens and from what the game observed. A replay writes no learning event, changes no checkpoint, and is never evidence of the strategy it shows unless the learner was seen using it, and even then it is not recorded.

`checkResponse(ctx, state, response)` is the same evaluation `applyCommand` performs, exposed as a pure synchronous function. The runtime runs it on the in-memory checkpoint for instant feedback. The committed result cannot disagree with it.

### Content changed under an active mission

An app update can change a generator or remove a mission version while a mission is in progress. The stored checkpoint then no longer regenerates the item it recorded. `missionCompatibility(ctx, state)` reports this. The caller sends the `abandon` command, which needs no content: the instance ends with status `abandoned` and one mission completion record with `outcome: "abandoned"` (an existing lifecycle value). Attempts already recorded stay exactly as they are, the open item gets no invented attempt, an abandoned completion carries no value and grants no unlock, and the instance refuses further commands (`missionAbandoned`). The learner starts a fresh instance. Floor 15 does this when it reopens (`chooseFloor15Instance`) and notes it in the playtest log. Tests: `src/themes/elevator-quest/director/contentChange.test.ts`. There is no item-level migration framework: a changed item is abandoned, never remapped.

Not built: the scheduler that fills missions from slots, struggle signals, and short-session limits.

## 12. Evidence evolution (`evidence/evolution.ts`)

Attempts and completion records are append-only, so every future reader must read every payload ever written. The contract:

- Backward compatible, no version bump: adding an optional field, or an enum value that old readers never meet.
- Everything else (a new required field, a renamed or retyped field, a changed meaning) bumps that record's `schemaVersion` and adds one upgrader from the previous version in `LEARNING_EVENT_EVOLUTION`. Upgraders are pure: no content, no clock. They must not change what an old record claimed happened (outcome, assistance, wrong tries, misconceptions, signature, time). A field the old record never had gets an explicit "unknown" value, not a guess.
- Reading upgrades in memory, one version at a time, then validates with the current schema. Stored rows are never rewritten.
- A payload newer than the app, without an upgrade path, or malformed is refused with `LearningEventVersionError` (`newerThanApp`, `noUpgradePath`, `malformed`). Nothing is changed or dropped, other learners keep working, and a newer app reads the row again. That is the recovery.
- Both records are at version 1 today, so the upgrade table is empty. Tests: `evidence/evolution.test.ts` (an upgrade chain over a pretend future version, refusals) and `src/runtime/eventEvolution.test.ts` (a newer row in real SQLite).
