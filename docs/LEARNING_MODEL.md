# Learning Model

How the engine represents skills, judges mastery, classifies challenge, records assistance, and responds to failure.
Everything here will live in `src/engine/` as pure TypeScript with no React, Expo, or rendering imports, so it runs in unit tests and survives a change of presentation technology.

All numbers below are starting assumptions. They will live in one versioned config file (`content/engine-config.json`) and get tuned after playtests.

## 1. Skill graph

A skill is the unit of learning. Grade is a tag, not a level.

```ts
type SkillId = string; // dotted, stable, never reused: "math.add.within20"

interface Skill {
  id: SkillId;
  domain: "math" | "literacy" | "science" | "logic";
  strand: string;              // "operations", "phonics", "forces"...
  title: string;               // parent-facing label
  gradeBand: [number, number]; // metadata only, -1 = Pre-K, 0 = K
  prerequisites: { skill: SkillId; minLevel: MasteryLevel }[];
  representations: string[];   // "numeral", "numberLine", "floorPanel", "objects", "word"
  reviewable: boolean;         // eligible for spaced review once mastered
}
```

Rules:
- The graph is a DAG. The content validator rejects cycles, unknown IDs, and orphaned prerequisites.
- Skills are fine-grained enough to pinpoint gaps (`math.add.within10` and `math.add.within20` are separate) but not so fine that every item becomes a skill.
- Composite abilities (multi-step routing, finding a circuit fault) are encounters that require several skills, not giant skills.
- Skill IDs are permanent. Renaming means adding a new skill and migrating evidence.

Seed strands (illustrative, not final):
- Math: numberSense, counting, add/subtract within 10/20/100, placeValue, multiplication, division, fractions, measurement, time, money, geometry, ratios, proportionalReasoning, expressions, equations, statistics, linearRelationships.
- Literacy: letterRecognition, caseMatching, letterSounds, beginningSounds, endingSounds, rhyming, syllables, phonemeBlending, cvcWords, sightWords, vocabulary, sentenceConstruction, sentenceComprehension, sequencing, mainIdea, inference, evidence, spelling, handwriting.
- Science: forces, motion, simpleMachines, electricity, magnetism, weather, earthScience (earthquakes belong here), ecosystems, habitats, lifeScience, matter, energy, engineeringDesign.
- Logic: patterns, classification, spatialReasoning, conditionals, sequencingSteps, debugging.

## 2. Skill state: one level plus four evidence dimensions

Decision (supersedes the earlier six-step chain ending in "Applied"): application is an evidence dimension, not a terminal state. A learner can show transfer before full mastery, and a mastered fact can still lack transfer.

Per learner, per skill:

```ts
type MasteryLevel = "locked" | "introduced" | "practicing" | "proficient" | "mastered";

interface SkillState {
  level: MasteryLevel;          // the headline, derived from the dimensions below
  dimensions: {
    accuracy: number;           // 0..1, weighted recent correctness on this skill's items
    independence: number;       // 0..1, share of recent successes at low assistance
    retention: RetentionState;  // successes separated by time: "none" | "sameDay" | "multiDay" | "durable"
    transfer: TransferState;    // uncued/novel use: "none" | "emerging" | "demonstrated"
  };
  variantsSolved: number;       // distinct item variants solved
  representationsSolved: string[];
  nextReviewAt?: string;
  rulesVersion: string;
}
```

What each dimension answers:
- accuracy: can they get it right (factual/procedural success)?
- independence: without help?
- retention: does it hold across days?
- transfer: can they use it when nobody names the operation, in a new context?

Level gates (initial values, all configurable):

| Level | Gate |
|---|---|
| locked | prerequisites not at their required level |
| introduced | first exposure or demonstration |
| practicing | first scored attempt |
| proficient | accuracy >= 0.8, independence >= 0.7, at least 3 distinct variants |
| mastered | proficient + retention `multiDay` or better + at least 2 representations |

Transfer is reported alongside the level ("Mastered, transfer emerging"). Parent Mode shows all four dimensions. Encounters require component skills to reach a level and can additionally ask for transfer evidence.

Skill state is derived from the attempt log. The `skill_state` table is a cache that can be rebuilt by replaying attempts under the current `rulesVersion`.

### Evidence weighting

Each scored attempt carries: assistance evidence (section 5), context (practice, stretch, uncued application, encounter stage), and novelty (section 3). Weights are configurable. Directionally: independent and uncued success count most, a demonstrated answer counts zero, an exact repeat counts zero.

Why not five correct in a row: identical items prove recall of that item. Variants, representations, spacing, and uncued use prove the skill. `8 x 6 = ?` is weak evidence. "8 elevator cars each carry 6 repair drones. Is there room for 50?" is strong evidence for multiplication and comparison, and feeds the transfer dimension.

## 3. Repetition, review, and novelty

The engine classifies every item presentation relative to the learner's history:

| Class | Definition | Mastery evidence | Progression / reward value |
|---|---|---|---|
| Exact replay | same variant hash, already solved | none | none (play for fun is allowed) |
| Easy variation | new variant of a skill already mastered at this difficulty, not due for review | minimal | none or negligible |
| Due spaced review | mastered skill whose review date has arrived | retention evidence | small |
| Novel application | mastered skill used uncued in a new context or representation | transfer evidence | meaningful |
| Higher-order application | skill combined with others in multi-step reasoning, diagnosis, comparison, or justification | transfer evidence for each skill | significant |

Rules:
- Value depends heavily on novelty and challenge. A mastered skill is never "worth nothing forever". Its value moves to review and application.
- Review intervals expand (initial guess 3, 7, 21, 60 days). Passing extends, failing demotes one level and shortens the interval. History is never deleted.
- Review items appear inside normal missions, never as a quiz screen.
- When a learner picks content that is all exact replay or easy variation, the game allows it and offers: "You've mastered this. Let's find something new." with a harder version, related skill, encounter, or different topic.

## 4. Item generation

Most activities are parameterized templates driven by a seeded PRNG.

```ts
interface ItemTemplate<P> {
  id: string;
  skills: SkillId[];
  paramSchema: ZodType<P>;
  generate(params: P, rng: Rng): ItemInstance;
  evaluate(item: ItemInstance, response: Response): Evaluation;
  distractors(item: ItemInstance): TaggedDistractor[];
  invariants(item: ItemInstance): InvariantResult[]; // used by validation sampling
}
```

- Same seed, same item. Reproducible bugs and tests.
- Distractors carry misconception tags (`countedStartFloor`, `subtractedInsteadOfAdded`, `reversedB_D`). The tag drives feedback and the next scaffold.
- Variant identity is a hash of the generated item's meaningful content, used by the novelty classes above.
- Validation sampling budgets are configurable per environment. See CONTENT_MODEL.md.

Hand-authored items still exist for narrative beats, comprehension passages, and encounters.

## 5. Assistance evidence vs scaffolding policy

These are separate on purpose.

Assistance evidence: what help the learner actually received. Recorded identically for every activity so mastery and Parent Mode can compare across domains.

```ts
type AssistanceLevel =
  | "independent"        // first try, no help
  | "retry"              // independent success after an error, no added help
  | "clue"               // small nudge (highlight, reminder of info in the world)
  | "verbalHint"         // text or narrated hint
  | "visualSupport"      // alternate representation, diagram, number line, letter guide
  | "guided"             // stepwise walk-through, learner still acts
  | "demonstrated";      // answer shown
```

An attempt records the highest assistance level received before success (or before leaving).

Scaffolding policy: what help to offer, in what order, after what signals. Data, not engine code.

```ts
interface ScaffoldingPolicy {
  id: string;                         // "arithmetic.default", "literacy.cvc", "trace.default", "encounter.blackout"
  steps: ScaffoldStep[];              // ordered; each step maps to one AssistanceLevel
  triggers: {                         // when to offer the next step
    afterWrongAttempts?: number;
    afterIdleMs?: number;
    onStruggleState?: StruggleState[];
    learnerRequested: boolean;        // hint button
  };
  allowLeaveAndReturn: boolean;
  regenerateVariantAfterRetries?: number; // never loop the identical item
}
```

- Activities reference a policy by ID. Literacy, arithmetic, engineering puzzles, handwriting, and encounters each get their own.
- A learner's `supportProfile` scales timing (offer sooner or later) but cannot reorder or skip steps in a way that changes what is recorded.
- The engine executes policies generically. Adding a new scaffolding sequence means adding data.

Fixed principles regardless of policy:
- An incorrect answer never automatically makes the next item easier.
- The first response to an error is usually an independent retry, with informative world feedback.
- No identical item loops. After a configured number of retries the engine regenerates a sibling variant at the same difficulty.
- Leaving and returning is always allowed. Encounter progress persists.

## 6. Challenge categories

Practice, Stretch, and Mastery Encounter are semantic categories attached to activities and missions:

| Category | Meaning |
|---|---|
| Practice | builds fluency on known or developing skills |
| Stretch | beyond current comfort, requires real thinking |
| Mastery Encounter | combines skills, uncued, multi-stage, may take several tries or sessions. Relatively rare and memorable. |

There is no fixed ratio. Composition will be decided per mission by a future scheduler using learner stage, skill familiarity, session purpose, recent performance, recent struggle, mission structure, age and development, and preferences. Earlier docs floated "about 55/30/10". That was brainstorming, not a rule.

What exists now so a scheduler can be added later:
- Every activity declares its category.
- Missions declare slots with constraints (`category`, `skills`, `optional`) rather than fixed activity lists, so a scheduler can fill them.
- The scheduler will be a pure function `(learnerState, missionTemplate, sessionContext, config) -> filled mission`, swappable without touching renderers.

Not built yet: the adaptive scheduler itself.

Challenge requires contrast. A mission with no easy beats makes the hard beat feel like noise. A mission with no hard beat teaches nothing.

## 7. Struggle signals (gameplay state, not emotion)

Observed per activity: wrong attempts, hint requests, time since last meaningful action, rapid tapping across targets, resets, abandonment, session length, return-after-leaving.

These produce `struggleState: "none" | "productive" | "unproductive" | "disengaged"`, which scaffolding policy triggers can read.

| State | Example signals | Typical policy response |
|---|---|---|
| productive | 1-2 wrong, deliberate pacing | wait, stay quiet |
| unproductive | rapid random taps, repeated same misconception | offer a clue or different representation |
| disengaged | long idle, repeated resets, exits | offer break, switch activity, come back later |

Younger learners get offers sooner. Patience windows widen as a learner shows persistence over weeks. Parents can adjust. The engine never labels emotions and never shows these states to the learner.

## 8. Missions

- Short (target 5-10 minutes), clear start and end, steps visible up front.
- Built from slots (see section 6). Due reviews are mixed in sparingly.
- Encounters unlock when component skills reach their required levels.
