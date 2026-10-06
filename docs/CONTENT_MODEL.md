# Content Model

How curriculum, activities, missions, themes, and narrative are stored as data, and how bad data gets caught before it reaches a child.

## Layers

```
Skill graph (shared)            content pack "skills" (today: content/fixtures/sample-pack.json)
  -> Item generators (shared)   src/engine/generation/generators/*.ts (pure code, versioned)
     -> Activities (shared)     content pack "activities" (generator + params + challenge + transfer)
        -> Themed activities    content/themes/<theme>/activities/*.json (framing, world object, assets, copy)
           -> Missions          theme-neutral missions (today: content/fixtures/sample-missions.json)
              -> Theme pack     content/themes/<theme>/theme.json        (world, art, audio, unlocks, narrative voice)
Learner profile                 runtime data (SQLite), points at one theme pack
```

The separation that matters most: an activity knows what is being learned and how it is scored. A themed activity knows what it looks like and what happens in the world. A child's theme never changes scoring.

## Schemas

- Written in TypeScript with Zod 4. Static types are inferred from the schemas, so the schema is the single source of truth.
- Every top-level record has `schemaVersion`. Loaders migrate older versions forward or fail loudly.
- IDs are stable strings: lowercase, digits, `.`, `_`, `-`. Theme-pack prefixes later (`eq.`, `mt.`), never a learner.

Implemented in M2 (`src/engine/content/`, `src/engine/skills/skill.ts`, `src/engine/evidence/attempt.ts`):

| Schema | Holds |
|---|---|
| `SkillDefinition` | id, domain, strand, label, optional gradeBand, prerequisites, representations, tags |
| `Misconception` | id, domain, description. The pack's catalog of tags generators may emit. |
| `ScaffoldingPolicy` | ordered help steps tagged with assistance levels, offer rule, leave-and-return, regenerate-after |
| `Activity` | generator id + version, params (validated by that generator's own schema), skills, challenge (practice / stretch / masteryEncounter), cued, representation, transfer context, scaffolding policy, optional per-budget seed overrides |
| `MasteryEncounter` | stages (activity ids), required skill levels, higher-order transfer context, scaffolding policy |
| `ContentPack` | all of the above, versioned |
| `GeneratedItem` / `ResponseOption` / `Response` | a theme-neutral generated item with choice options, optional misconception tags, signature |
| `AttemptEvidence` | durable record of one item interaction (see LEARNING_MODEL.md section 0). M3 adds optional `missionInstanceId`. |
| `CompletionRecord` (M3) | an activity, encounter, or mission instance finished: kind, instance id, target id, outcome, time. Written with the final attempt. |
| `MissionDefinition` (M3) | id, version, title, `completionTier` (low / normal / high), ordered steps: `narrative` {eventKey}, `activity` {activityId, items 1-10}, `encounter` {encounterId}. Duplicate step ids rejected, at least one non-narrative step. |
| `MissionPack` (M3) | versioned list of missions. The version is part of the derived-cache key. |
| `EngineConfig` | mastery policy + validation budgets (`content/engine-config.json`) |

M4 additions:
- `Activity.answer`: `{ mode: "choice" }` (default) or `{ mode: "value", min, max }`. The validator samples every value-mode activity and checks that the answer lies in the domain.
- `GeneratedItem.diagnostics`: every tagged wrong value the generator proposed, for misconception lookup on free values. It is not part of the signature.
- New generator `quantity.fillToCapacity` v1.

Shipped content (validated in CI with the fixtures):
- `content/packs/core.json`: add and subtract within 20, the moves-on-a-line and encounter help policies, and five activities, all value answers.
- `content/missions/core.json`: the mission `positions-and-capacity`, which Elevator Quest presents as "Floor 15".

Theme copy for Floor 15 (Lifty's lines, misconception translations, help labels, checklist, unlock catalog) lives in `src/themes/elevator-quest/content/floor15.ts` for this slice. It moves to data with a schema when a second mission or theme needs it.

Rules the schemas enforce beyond types: a cued activity cannot claim transfer evidence; help steps never decrease; `independent`/`retry` are not offerable help; assistance credit is non-increasing and 0 for demonstrated; a correct answer after wrong tries cannot be recorded as independent.

Missions are theme-neutral: steps reference activities and encounters by id and narrative beats by `eventKey`. A theme pack maps event keys and concepts to its own scenes and copy. `validateMissionPack(raw, pack)` rejects unknown activities or encounters, encounter-stage activities used as standalone steps, and duplicate mission keys. The purity test scans the mission fixtures for theme vocabulary.

Not yet built: `ThemedActivity`, theme packs, interaction types. Planned shape:

```ts
const ThemedActivity = z.object({
  id: z.string(),
  activity: z.string(),               // Activity id
  scene: z.string(),                  // scene asset id
  worldObject: z.string(),            // theme-specific object id
  copy: LocalizedCopy,                // instruction text, by reading level
  narration: z.array(NarrationRef),   // audio asset ids per line
  onCorrect: WorldEffect,             // the world consequence of a right answer
  onIncorrect: WorldEffect,           // informative consequence, never a red X
});
```

Narrative text is stored separately from logic so the same mission can be re-voiced, re-read at a different reading level, or (later) localized.

## Validation pipeline

`validateContentPack(raw, { registry, budget, budgetName })` (`src/engine/validation/`) returns `{ ok, issues[], samples[] }`. Every issue has a code and a path such as `activities[2].params.direction` or `activities[0] seed "validate:move-up.practice:17"`.

Implemented checks:
- Schema violations, with Zod paths.
- Skill graph: duplicates, missing prerequisites, self-dependencies, cycles.
- Duplicate ids in every collection.
- References: activity skills, scaffolding policies, generator id + version, encounter stages (must exist and be `masteryEncounter` activities), encounter skill requirements. `masteryEncounter` activities must belong to an encounter.
- Generator params validated against the generator's own schema.
- Every misconception tag a generator can emit must be in the pack catalog.
- Sampling, per activity, over the budgeted number of seeds: item schema, unique option ids, no duplicate option values, exactly one correct option, `correctOptionId` consistent, no tag on the correct option, the answer agrees with the generator's independent solver, tags declared, signature recomputes, same seed regenerates identically, and distinct items never exceed the declared variant count.

Commands:
- `npm run validate:content`: CI budget (1,000 seeds per activity, about 6 s on the sample pack in the build container).
- `npm run validate:content:release`: release budget (10,000 seeds, about 42 s).
- Plain `npm test` uses the dev budget (200 seeds).

### Theme copy (M5)

Child-facing theme text is data: `content/themes/elevator-quest/floor15.json`, schema `MissionCopySchema` in `src/themes/content/missionCopy.ts`. It holds the mission title and objective, the checklist, Lifty's lines, praise, misconception explanations, help labels and lines, Concept Rescue lines and focus framings, unlock labels and theme pacing (auto-ride time scale, success pauses).

Templates use `{name}` placeholders. Each theme declares a contract (`CONTRACT` in `content/floor15.ts`): the required line keys and which placeholders each may use. `validateMissionCopy(raw, { pack, mission, contract })` checks:
- required lines present, no unknown lines, no placeholder a line cannot fill (`copy.missingLine`, `copy.unknownLine`, `copy.unknownPlaceholder`)
- every mission step has exactly one checklist line, in order (`copy.missingStep`, `ref.unknownStep`, `copy.duplicateId`, `copy.order`)
- every help kind the mission's policies can offer has words, and no words for kinds it cannot (`copy.missingHelp`, `ref.unknownHelp`)
- misconception and rescue-focus tags exist in the pack catalog (`ref.unknownMisconception`), and a test requires words for every tag the mission's generators can emit
- Concept Rescue lines are required when any used policy can rescue
- unlock ids are unique and name this mission

A test also scans every child-facing string for internal vocabulary (practice, stretch, mastery, encounter, misconception, tag ids). Values only: keys are internal ids.

### World catalog (M5)

`content/worlds/catalog.json`, schema and validator in `src/themes/catalog/worldCatalog.ts`. Field list and the portal principle: GAME_DESIGN.md "Worlds and portals". No difficulty field exists by design.

### Placement (M5)

`content/placement/*.json`, `PlacementSchema` in `src/engine/learner/model.ts`. See LEARNING_MODEL.md section 1.

`npm run validate:content` now runs the pack sampling plus the theme copy and world catalog tests.

Planned, not built: asset and narration references, accessibility gaps, theme completeness, word-safety blocklist (word lists are content-supplied and reviewed today), exhaustive enumeration for tiny parameter spaces, a time limit per budget.

Content that fails validation never ships. That rule also covers any future AI-assisted authoring: generated content is a draft until it passes the same validator and an adult review.

## Sampling budgets

Generative validation is property-based. How many seeds to sample is a budget, not a product constant. Budgets live in `content/engine-config.json`:

```json
"validationBudgets": {
  "dev": { "seedsPerActivity": 200 },
  "ci": { "seedsPerActivity": 1000 },
  "release": { "seedsPerActivity": 10000 }
}
```

- Selected with `CONTENT_BUDGET=dev|ci|release`.
- An activity may override per budget: `"validation": { "seeds": { "release": 50000 } }`.
- Seeds are deterministic (`validate:<activity>:<n>`), and failures print the seed.

## Authoring

- V1: hand-edited JSON with schema-aware editor support (JSON Schema exported from Zod for editor autocomplete).
- A content preview screen in dev builds renders any activity by ID with a chosen seed. This is the main authoring tool.
- No content CMS. No remote content. Content ships inside the app bundle.

## Versioning and saves

Content changes between app versions. Saves must survive that.
- Attempts reference activity ID, template ID, seed, and content version.
- Removing content never deletes attempt history. Retired IDs stay in a `retired.json` list so validation knows they once existed.
- Mastery is recomputed from attempts when rules change (see ARCHITECTURE.md persistence).
