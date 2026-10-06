# Content Model

How curriculum, activities, missions, themes, and narrative are stored as data, and how bad data gets caught before it reaches a child.

## Layers

```
Skill graph (shared)            content/curriculum/skills/*.json
  -> Item templates (shared)    src/engine/templates/*.ts  (generator + evaluator code)
     -> Activities (shared)     content/activities/*.json  (template + params + interaction type)
        -> Themed activities    content/themes/<theme>/activities/*.json (framing, world object, assets, copy)
           -> Missions          content/themes/<theme>/missions/*.json   (ordered beats, arc, rewards)
              -> Theme pack     content/themes/<theme>/theme.json        (world, art, audio, unlocks, narrative voice)
Learner profile                 runtime data (SQLite), points at one theme pack
```

The separation that matters most: an activity knows what is being learned and how it is scored. A themed activity knows what it looks like and what happens in the world. A child's theme never changes scoring.

## Schemas

- Written in TypeScript with Zod. Static types are inferred from the schemas, so the schema is the single source of truth.
- Every content file has `schemaVersion`. Loaders migrate older versions forward or fail loudly.
- IDs are stable strings, namespaced: `eq.blackout.m03`, `mt.icepalace.encounter` (prefix = theme pack, never a learner).

Sketch:

```ts
const Activity = z.object({
  id: z.string(),
  schemaVersion: z.literal(1),
  template: z.string(),               // ItemTemplate id
  skills: z.array(SkillId).min(1),
  tier: z.enum(["practice", "stretch", "encounterStage"]),
  interaction: InteractionType,       // "panelPress" | "choice" | "letterTiles" | "trace" | ...
  params: z.record(z.unknown()),      // validated against the template's own param schema
  cued: z.boolean(),                  // is the operation named? false = application evidence
  hints: z.array(HintSpec),           // ordered, with assistance level each
});

const ThemedActivity = z.object({
  id: z.string(),
  activity: z.string(),               // Activity id
  scene: z.string(),                  // scene asset id
  worldObject: z.string(),            // "elevatorPanel", "puppyHat"
  copy: LocalizedCopy,                // instruction text, by reading level
  narration: z.array(NarrationRef),   // audio asset ids per line
  onCorrect: WorldEffect,             // "carMovesTo(answer)", "showHat"
  onIncorrect: WorldEffect,           // informative consequence, never a red X
});
```

Narrative text is stored separately from logic so the same mission can be re-voiced, re-read at a different reading level, or (later) localized.

## Validation pipeline

`npm run validate:content` runs in CI and before every build. It fails on:

- Schema violations in any content file.
- Unknown references: skill IDs, template IDs, asset IDs, narration files, unlock IDs.
- Skill graph cycles or unreachable skills.
- Template sampling failures: generate seeds per activity and check the template's invariants (unique answer, answer in range, distractors distinct from answer, words from the approved word list). Sampling budget is configurable, see below.
- Accessibility gaps: an instruction with no visual form, narrated line with no audio file, touch target specs under minimum.
- Theme completeness: every mission beat has art and copy for its theme. Every unlock has an asset.
- Word safety for Magic Tower's generated words and letter combinations (blocklist check).

Content that fails validation never ships. This rule also covers any future AI-assisted authoring: generated content is a draft until it passes the same validator and an adult review.

## Sampling budgets

Generative validation is property-based. How many seeds to sample is a budget, not a product constant.

```jsonc
// content/validation-budgets.json (planned)
{
  "dev":     { "seedsPerTemplate": 200,   "timeLimitMs": 15000 },
  "ci":      { "seedsPerTemplate": 2000,  "timeLimitMs": 120000 },
  "release": { "seedsPerTemplate": 20000, "timeLimitMs": 900000, "exhaustiveWhenParamSpaceBelow": 50000 }
}
```

- Selected by `--budget dev|ci|release`. Unit tests use fast-check's `numRuns` from the same file.
- Templates may override (a tiny parameter space is enumerated exhaustively, a large one gets more samples).
- Seeds are derived from a fixed base seed per run, and any failure prints the seed so it reproduces locally.
- Release builds require the `release` budget to pass.

## Authoring

- V1: hand-edited JSON with schema-aware editor support (JSON Schema exported from Zod for editor autocomplete).
- A content preview screen in dev builds renders any activity by ID with a chosen seed. This is the main authoring tool.
- No content CMS. No remote content. Content ships inside the app bundle.

## Versioning and saves

Content changes between app versions. Saves must survive that.
- Attempts reference activity ID, template ID, seed, and content version.
- Removing content never deletes attempt history. Retired IDs stay in a `retired.json` list so validation knows they once existed.
- Mastery is recomputed from attempts when rules change (see ARCHITECTURE.md persistence).
