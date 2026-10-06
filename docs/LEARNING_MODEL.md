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

A scaffolding policy is data per activity type: ordered steps, each tagged with the assistance level it represents and offered `onRequest` or `afterWrongTries: n`, plus `allowLeaveAndReturn` and `regenerateAfterWrongTries`. The schema rejects help that decreases and steps claiming `independent` or `retry`. The engine provides only `nextScaffold`, `shouldRegenerate`, and `assistanceForProgress`. The sample pack has three different policies (arithmetic, phonics, an encounter policy that never demonstrates answers).

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

Not built: idle-time and struggle-state triggers, and learner support-profile timing. The policy shape leaves room for them.

### Concept Rescue

A policy may declare `conceptRescue: { afterWrongTries, returnTo: "same" | "fresh" }` (default threshold about 5). The schema requires `regenerateAfterWrongTries` above the rescue threshold, so a rescue always happens on the item it is for.

When the miss count reaches the threshold:
1. The challenge pauses. Submitting the target or asking for other help is refused (`rescueActive`). The view shows no other scaffold.
2. The engine picks a parallel example: same generator and params, a different item and a different answer, deterministic (`<item seed>|rescue<k>`, k < 24). It prefers examples that keep the target's non-numeric givens (same direction) and the smallest numbers, so the idea is easy to see. The example is stored by seed and signature, so it survives a restart and a content change is detected.
3. Focus: misconception-specific only when the evidence is strong (the top tag appears at least twice and in at least half of the misses). Otherwise the rescue explains the concept generally.
4. The learner works the example (`rescueAnswer`). A wrong example answer is a retry of the example. Neither produces learning evidence: the example's answer is taught.
5. Return: `same` brings back the original item, unsolved, with its miss history. `fresh` resolves the old item as a miss and generates a new variation. Either way the learner does the final reasoning, and the target answer is never revealed by the rescue.

Evidence: the solved target is recorded as `guided` with `conceptRescue: true`. That is real but weak evidence of the item, never independent. Demonstrated-answer contamination rules are unchanged: only a demonstrated step contaminates an item, and the rescue example's signature never counts as solved. Tests: `mission/conceptRescue.test.ts`, `themes/elevator-quest/director/rescue.test.ts`.

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

Generators: `quantity.positionAfterMove@1`, `quantity.remainderAfterFullLoad@1`, `literacy.beginningSound@1`.

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

`applyCommand(ctx, state, command)` is a pure reducer. Commands: `acknowledge`, `submit`, `useScaffold`, each with a `commandId` and caller time. It returns the next checkpoint, presentation intents, and learning events. A repeated `commandId` is ignored.

Deterministic items: seed = `<seedBase>|<mission>@<version>|<step>|stage<s>|item<i>|gen<g>`. The checkpoint stores only position, wrong tries, help used, and the item signature, and regenerates the item from the seed on resume. A signature mismatch throws instead of silently showing a different item. The same item comes back until it is solved or regenerated after `regenerateAfterWrongTries`.

Scaffolding at runtime: the view lists at most one available help step (the policy's next step), as `offer` or `available`. `useScaffold` must name that step. The attempt records the most help used. Commands also include `rescueAnswer` (Concept Rescue, section 5).

Demonstrated answers contaminate one exact item, never the skill (`learner/demonstrated.test.ts`):
- The demonstrated attempt is recorded as `demonstrated` (0 credit) and counts as a scored zero in the recent window until it scrolls out.
- Its signature counts as seen, so solving that same item later is an exact replay: no accuracy, independence, retention, or opportunity value.
- A new legitimate variation of the same skill solved independently is full evidence. It moves levels and can upgrade opportunities, and lifetime value equals that of a learner who never needed the demonstration.

Answer modes: an activity's `answer` is `choice` (pick a generated option) or `value` (produce any integer in [min, max]). A value answer is harder, so the mode is content, not theme. Evaluation compares the value with the answer and surfaces a misconception when the value matches any tagged distractor the generator proposed (`diagnostics`), even one that did not fit in the option list. The views hide the options in value mode. Values outside the domain, or of the wrong mode, are refused without counting a try.

`checkResponse(ctx, state, response)` is the same evaluation `applyCommand` performs, exposed as a pure synchronous function. The runtime runs it on the in-memory checkpoint for instant feedback. The committed result cannot disagree with it.

Not built: the scheduler that fills missions from slots, struggle signals, and short-session limits.
