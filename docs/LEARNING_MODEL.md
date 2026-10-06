# Learning Model

How the engine represents skills, judges mastery, classifies repetition, records assistance, decides eligibility, and rates progression value.

Status: implemented in M2 as pure TypeScript in `src/engine/` (module map in ARCHITECTURE.md section 2). It runs entirely in Node tests. Every number is a tunable assumption in `content/engine-config.json` (`status: "initial-unvalidated"`). None of them is research-validated. Tune them after playtests.

## 0. The core separation

| Durable (never rewritten) | Derived (recomputed any time) |
|---|---|
| Attempt evidence: what happened on each item | Skill levels, dimensions, review schedule |
| | Exposure class (replay, review, application...) |
| | Progression value events |

`deriveLearnerState({ graph, policy, attempts })` and `runTimeline(...)` replay evidence in a deterministic order. Change the policy and the same evidence produces new state. Evidence carries the facts it needs (skills, challenge, transfer context, representation, assistance, signature) so it stays meaningful even if content changes later.

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

Not built: idle-time and struggle-state triggers, and learner support-profile timing. The policy shape leaves room for them.

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

## 7. Progression value (`progression/`)

Not a currency. A future reward system reads it. Value comes only from one-time events with stable keys:

| Event | Tier | Assistance cap |
|---|---|---|
| `firstClear`: first successful clear of a Stretch activity (normal) or Mastery Encounter (high) | normal / high | yes |
| `levelPeak`: a skill reaches Proficient (normal) or Mastered (high) for the first time | normal / high | no (gates already require independence) |
| `transferContext`: first success in a declared context, with at most `clue` help | novel normal / higher-order high | qualification gate |
| `reviewStage`: a due spaced review passed, reaching a new stage | low | qualification gate |

Completion tier = highest event tier, else `none`. The cap: demonstrated voids the event, guided caps at low, verbalHint/visualSupport drop one tier. Practice completions earn nothing on their own. Their progress shows up as level milestones.

Invariants, property-tested in `value.property.test.ts` over two generators (mixed behaviour and steady learning that reaches mastery and reviews):
- Inserting deliberately failed attempts anywhere (separate or inside a completion) never adds an event, raises an event's tier, or raises the total.
- Extra wrong tries never raise the first affected completion's value.
- More help on a completion never raises its value.
- Replaying an already-solved item never has value.

One documented subtlety: added failures can delay a milestone, so it appears on a later completion than it would have. It is the same one-time event, not an extra one.

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

## 11. Missions (not built)

Short (5-10 minutes), steps visible up front, built from slots so a scheduler can fill them. Encounters unlock through eligibility.
