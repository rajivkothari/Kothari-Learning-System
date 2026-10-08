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
| `MissionDefinition` (M3) | id, version, title, `completionTier` (low / normal / high), ordered steps: `narrative` {eventKey}, `activity` {activityId or, since M8, a pool `activityIds` of two or more distinct activities, never both; items 1-10}, `encounter` {encounterId}. Duplicate step ids rejected, at least one non-narrative step. |
| `MissionPack` (M3) | versioned list of missions. The version is part of the derived-cache key. |
| `EngineConfig` | mastery policy + validation budgets (`content/engine-config.json`) |

M4 additions:
- `Activity.answer`: `{ mode: "choice" }` (default) or `{ mode: "value", min, max }`. The validator samples every value-mode activity and checks that the answer lies in the domain.
- `GeneratedItem.diagnostics`: every tagged wrong value the generator proposed, for misconception lookup on free values. It is not part of the signature.
- New generator `quantity.fillToCapacity` v1.

M8 additions (D154, D155):
- Pack composition: `composeContentPacks(packs)` (`src/engine/content/compose.ts`, pure) makes one `ContentPack` of several, concatenating skills, misconceptions, scaffolding policies, activities and encounters in pack order. The id, version and schemaVersion come from the first pack. An id that appears twice in any collection, within one pack or across packs, throws `ContentCompositionError` naming the collection, the id and both packs: never a silent override. The app, the runtime test harness and the engine's test support compose core, then reading.
- Mission pools: an activity step may name `activityIds` instead of `activityId` (see `MissionDefinition`). `validateMissionPack` checks every member like a single activity (unknown ids and encounter stages refused, with the member's path, `steps[j].activityIds[k]`). Which member an instance presents is `poolChoice` (LEARNING_MODEL.md section 11).
- New generators `quantity.missingInSequence` v1, `quantity.tensAndOnes` v1, `quantity.orderPositions` v1, `quantity.positionAfterTwoMoves` v2, `quantity.combineGroups` v2 and `literacy.authoredItem` v1 (LEARNING_MODEL.md section 6).

M9 additions (D167, D168):
- `Activity.answer` gains `{ mode: "text", maxLength }` (1 to `TEXT_ANSWER_MAX` = 24). The response is an ordinary `value` response carrying a string, compared after `normalizeTextAnswer` (LEARNING_MODEL.md section 11). The validator samples every text-mode activity: the answer must be lower-case a to z and at most `maxLength` letters (`item.answerOutOfDomain`).
- Generator contract: `solve(prompt, params?)`. Most generators solve from the prompt alone; an authored generator whose prompt must not carry the answer (spelling) looks it up in the activity's params, and content validation passes them. `countVariants` may return undefined for params whose count is not computable.
- New generators `literacy.spelling` v1 and `quantity.twoDigit` v1 (LEARNING_MODEL.md section 6).
- Every loader composes four packs: core, reading, spelling, two-digit (`appContent.ts`, the engine's test support `SHIPPED_PACKS`, the runtime test harness).

Shipped content (validated by `npm run validate:content` with the fixtures; there is no CI service yet):
- `content/packs/core.json` (version 2026.10.8): add and subtract within 20, equal jumps within 20 (D148), skip counting, a ten and some ones, and comparing within 20 (M8), the moves-on-a-line, loads-counted and encounter help policies, and 31 activities, all value answers (21 added in M8, D154).
- `content/packs/reading.json` (M8, D155): six `ela.*` skills, eleven `reading.*` misconception tags, the help policy `reading.text-clue`, and ten activities on `literacy.authoredItem` holding 31 authored items. Its representation says how a reading activity is answered in a theme: `sceneObject` (a choice of landing objects), `numeral` (a value 1 to 20) or `textCards` (a choice of cards). Composed after core.
- `content/packs/spelling.json` (M9, version 2026.10.8): six `ela.spelling.*` skills (short vowels, blends, digraphs, long vowels, two-syllable words, challenge words; no prerequisites), nine `spelling.*` misconception tags, the help policy `spelling.word-clues`, and six practice activities on `literacy.spelling@1` (`spelling.short-vowels`, `.blends`, `.digraphs`, `.long-vowels`, `.two-syllable`, `.challenge`) holding 38 words with ids `w01` to `w37` and `w39`. Each word has an id that never contains it, the word, its spelling `pattern`, its syllable count and authored misspellings with their causes; each activity sets `extraTiles` (2 to 4) and a text answer of at most 8 or 10 letters; representation `letterTiles`. Word `w38` was retired before shipping (it was the word on Word Golf's BACK TO ELEVATOR button); ids are never reused. Composed after reading.
- `content/packs/two-digit.json` (M9, version 2026.10.8): seven two-digit add and subtract skills (no prerequisites), eight `quantity.*` misconception tags, the help policy `cargo.tens-and-ones`, and thirteen practice activities on `quantity.twoDigit@1` named `cargo.<kind>.<tier>` (`deliveries`, `room-left`, `exact`, `compare`, `missing`, `two-step`; tiers approachable, solid, stretch as labels for the mix), value answers 1 to 169 (the most the freight floor holds) or 1 to 299 for exact loads. `cargo.two-step.stretch` is in no mission yet. Composed after spelling.
- `content/missions/core.json`: the mission `positions-and-capacity` version 3 (M8, D154), which Elevator Quest presents as "Floor 15": intro, a cued move, a reading job, a pool for the shaft map, a pool of two orders, a reading job, a pool of two-part trips, a number-sense pool, a reading job, start unknown, a compare-or-measure pool, a stretch pool, a reading job, the capacity encounter, finale. A version bump re-seeds every item (seeds include the version); a run saved under an older version is abandoned with its evidence kept and a fresh run starts (the content-change recovery of M7). Completions and unlocks are keyed by the mission id, so they stay.
- `content/missions/core.json` also holds (M9, mission pack version `2026.10.8-m9`) `word-golf` version 1 (steps `hole-1` [short vowels, blends], `hole-2` [digraphs, long vowels], `hole-3` [two-syllable, challenge], one word each) and `cargo-commander` version 1 (steps `delivery-1` to `delivery-5`, each a pool of the twelve cargo activities other than two-step, one load each). Both `completionTier: "low"`, with theme-neutral titles (the purity test scans the file); no unlock rule names them. Elevator Quest runs each play session of its mini-games as one instance (D166).

Theme copy for Floor 15 (Lifty's lines, misconception translations, help labels, checklist, unlock catalog, success replay words) is data in `content/themes/elevator-quest/floor15.json` since M5 (see "Theme copy" below). `src/themes/elevator-quest/content/floor15.ts` only loads it, declares the copy contract and fills templates. The 20 landing identities are data in `content/themes/elevator-quest/landings.json` (M7, `src/themes/elevator-quest/content/landings.ts`).

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

Child-facing theme text is data: `content/themes/elevator-quest/floor15.json`, schema `MissionCopySchema` in `src/themes/content/missionCopy.ts`. It holds the mission title and objective, the checklist, Lifty's lines, praise, misconception explanations, help labels and lines, Concept Rescue lines and focus framings, success replay words (M7), unlock labels, the adult recovery panel's words (M7), the hall-call, exploration-hint, DOOR CLOSE tip, rank and Engineer Log words (M7.1) and theme pacing (auto-ride time scale, success pauses). The landing objects' own words (Lifty's line and the log fact per place) live in the landing catalog.

Templates use `{name}` placeholders. Each theme declares a contract (`CONTRACT` in `content/floor15.ts`): the required line keys and which placeholders each may use. `validateMissionCopy(raw, { pack, mission, contract })` checks:
- required lines present, no unknown lines, no placeholder a line cannot fill (`copy.missingLine`, `copy.unknownLine`, `copy.unknownPlaceholder`)
- every mission step has exactly one checklist line, in order (`copy.missingStep`, `ref.unknownStep`, `copy.duplicateId`, `copy.order`)
- every help kind the mission's policies can offer has words, and no words for kinds it cannot (`copy.missingHelp`, `ref.unknownHelp`)
- misconception and rescue-focus tags exist in the pack catalog (`ref.unknownMisconception`), and a test requires words for every tag the mission's generators can emit
- Concept Rescue lines are required when any used policy can rescue
- unlock ids are unique and name this mission
- success replay (M7): every strategy key has words, with known placeholders only, and a suggested strategy's words never say "you" (`copy.claimsUnobserved`): the game only attributes what it observed
- per-job help words (D148): a help entry may carry `jobs`, the same help in the words of one kind of job (`twoMoves`, `startFloor`, `express`, `tripMeter`, `orders`, and since M8 `sequence`, `tens`, `tenJump`, `tensFromZero`, `compare`, `order` for Floor 15; the contract's `helpJobs`). An unknown job key is `copy.unknownJob`. A job without its own words uses `line` (or `altLine` in the cargo bay)

At runtime a misconception or help template is filled only when every placeholder in it has a value for the current job; otherwise the line is left out (or the help falls back to a plain clue), so a raw `{start}` never reaches the screen. A test fills every job line, wrong-floor line and misconception line with a full set of job words and checks nothing is left unfilled.

A test also scans every child-facing string for internal vocabulary (practice, stretch, mastery, encounter, misconception, tag ids). Values only: keys are internal ids.

Directory copy (M8.1, `floor15.json` lines, exposed as `LINES.directory`): `directoryButton` "DIRECTORY", `directoryHere` "YOU ARE HERE", `directoryBack` "Back", `directoryIntro` "Need to find a place? Check the DIRECTORY!", besides the earlier `directoryOpen` (the accessibility label "Building directory"), `directoryTitle`, `directoryNote` and `directoryClose`.

### Reading words (M8)

`content/themes/elevator-quest/reading.json`, schema `ReadingCopySchema` and `validateReading` in `src/themes/elevator-quest/content/reading.ts`, tested in `src/themes/content/reading.test.ts` (part of `validate:content`). The reading pack says what is learned and scored (each item's id, answer and wrong answers with their likely misreadings); this file says what the learner reads and does, keyed by item id. Theme code looks words up by the item id in the prompt and never scores.

- Top level: `schemaVersion`, `theme`, `pack` (the pack the items belong to), `lines` (Lifty's and the note's own words: `touched` {label}, `arrived` {floor, place}, `again`, `noteOpen`, `noteClose`, `cards`), `help` (per help kind the reading policy offers, one line for each mode: `touch`, `ride`, `choose`; SHOW ME may use {label} or {revealed}), `misconceptions` (a cue per misreading tag), `items`.
- An item: `mode` (`touch`, `ride`, `choose`), `floor` (touch only: the landing it is answered on), `source` (the note's heading), `passage` (1 to 4 sentences), `key` (the sentence CLUE lights), `ask` (the instruction), `options` (touch and choose: a name for every option value, used by the cards and screen readers), `done` (the world's reaction once the job is done).
- Added in M8.1 (D159), all optional in the schema: `places` (ride only: every building-directory place the note names, written as the note writes it, for example "Machine Room"); `solve` (ride only, and required for a ride: how the floor follows from the note and the directory: `{place, offset?}`, `{between: [a, b], not?: [...]}` for exactly one floor strictly between two places leaving out ruled-out ones, or `{floor}` when the note names "Floor N"); `emphasis` (at most 5, `EMPHASIS_MAX`: exact, whole-word, case-sensitive spans of the passage or the instruction, set in bold); `clue` (10 to 110 characters: what Lifty says on CLUE instead of the generic line, under the same copy rules as the passage). Every one of the 31 items has `emphasis` and a `clue`; all nine rides have `solve`, and eight have `places` (one names only floor numbers). The context gains `directory` (the rows of `directoryRows`) and an optional `objectName`. Helpers: `emphasisMarks`, `readingMarks`, `placesIn`, `titleCase`, `hasWords`, `needsDirectory`, `answerGiveaways`, `giveawaysIn`, `solveFloor`, `solvePlaces`.

`validateReading(raw, { pack, floors, objectsOn, tags, names })` checks, as explicit relationships:
- every authored item in the pack has words and no words exist for an unknown item (`missing.item`, `ref.unknownItem`); an item id is used by one activity only (`dup.item`)
- the mode matches how the activity is answered (`sceneObject` touch, `numeral` ride, `textCards` choose; a ride takes a value, touch and cards a choice) (`ref.mode`, `ref.representation`)
- a touch item names a landing that has objects, and every option value is an object there (`ref.floor`, `ref.object`, `missing.floor`); a ride item's answer and wrong floors are real floors and it has no landing or options; choice items name every option and nothing else (`missing.option`, `ref.option`)
- passages of 15 to 60 words, each entry one whole sentence, and the CLUE sentence exists (`copy.length`, `copy.sentence`, `ref.key`)
- the instruction says what to do: "Touch", "Ride", or a question for cards (`copy.ask`)
- copy rules on every string: no internal vocabulary, protected names, dashes, odd characters or unknown placeholders; a capitalised word inside a sentence must be a known place or name, so no person's name slips in (`copy.properNoun`)
- every reading line present and no others (`missing.line`, `ref.unknownLine`); help words for every help kind the reading policies offer and none for others (`missing.help`, `ref.unknownHelp`); no reading policy with a Concept Rescue (`ref.rescue`)
- words for every misreading the generator can emit, each tag in the pack's catalog (`missing.misconception`, `ref.unknownMisconception`)
- read and ride (M8.1): every place in `places` is a directory name (case-insensitive) and appears in the note, and every directory name the note contains (title case, whole words) is listed (`missing.place`); a ride has a `solve` (`missing.solve`), only a ride has one, its places are the note's, a `{floor}` solve is named in the note, and the floor it resolves to is the pack's answer (`ref.solve`)
- no giveaways (M8.1): at most five bold spans (`copy.emphasis`); a span never contains a giveaway (`leak.emphasis`): a ride's answer floor in digits or words; a touch or card job's right option label, its landing object's name, or any word of them that no wrong option shares, except relation words (left, right, above, below, up, down, first, last, next, then, before, after, more, fewer, not, top, bottom); a ride's answer place may be bold only beside another place or a "Floor N" of the note, never singled out. A clue contains no giveaway, and a ride's clue never names the answer's place (`leak.clue`)

`src/themes/content/readingAudit.test.ts` (M8.1) adds: every ride is answerable from its note plus the directory with Floor 15 dormant and restored, the playtest item, no "Comms" (Floor 11 is Communications), no giveaway in any bold word or clue, the validator's rejections, and the mark ranges. The test adds: the landing catalog carries every canonical object; every generated item finds its words and every option has a name; no reading job goes to Floor 15 (dormant until restored); help lines fill completely with the values the game has; the pack has 25 to 35 items in the planned mix of kinds, and most are answered by touching or riding.

### Mini-game words (M9)

Loaded and validated by `src/themes/elevator-quest/content/minigames.ts`, tested in `src/themes/content/minigames.test.ts` (part of `validate:content`). The copy rules are the reading words' (`copyProblems`): no internal vocabulary, dashes, odd characters or unknown placeholders, plus `copy.internal` for an id in the text.

- `content/themes/elevator-quest/minigames/wordGolf.json`: `labels` (TRY IT, UNDO, CLEAR, HEAR IT AGAIN, HELP, NEXT HOLE, ALL DONE, BACK TO ELEVATOR, the title and HOLE {hole}), `lines` (Lifty's), `help` (a label and a line per spelling help kind), `misconceptions` (a line per `spelling.*` cause) and `words`, keyed by word id: `blank` (a sentence with one "___" where the word goes), `meaning`, `phonics` and an optional `picture`. `validateWordGolf(raw, { pack })` checks: every spelling word in the pack has clues, no clues for an unknown id, a word id in one activity only (`missing.word`, `ref.unknownWord`, `dup.word`); one blank per sentence (`copy.blank`); clues of 10 to 110 characters (`copy.length`); a capitalised word inside a clue is Lifty or Floor (`copy.properNoun`); no clue word contains the word or its stem (the word without a final e), and no run of neighbouring words spells it, as "mag net" would (`leak.word`); no line, label, help line or cause line names any word of the pack, because those show while any word is up (`leak.line`); help words for every help kind the spelling policy offers and none for others (`missing.help`, `ref.unknownHelp`); a line for every cause the generator can tag and none for others (`missing.misconception`, `ref.unknownMisconception`).
- `content/themes/elevator-quest/minigames/cargo.json`: `copy` has exactly the shape Cargo Commander's screen reads (buttons, unit, emphasis words, a brief per kind, cues, hints, labels, accessibility labels, the toolkit's words), plus `helpLabels` and `misconceptions`. `validateCargoCopy(raw, { pack })` checks each line against its placeholder contract (`CARGO_COPY_CONTRACT`): givens only, and `{answer}` only in the two SHOW ME hints (`showFiller`, `showCrates`), else `leak.answer`; a brief for every kind the pack uses (`missing.brief`); capitals in a brief only for the emphasis words (`copy.emphasis`); help labels and cause lines covering the policy and the generator and nothing else (`missing.help`, `ref.unknownHelp`, `missing.misconception`, `ref.unknownMisconception`). `cargoBrief(prompt)` fills a brief and returns the ranges to mark (numbers and emphasis words).
- `content/themes/elevator-quest/minigames/host.json`: the game names, the entrance labels (PLAY ..., BACK TO ...), PLAY, BACK TO ELEVATOR, their screen-reader hints, and the loading, missing, trouble and placeholder lines. `validateHostCopy(raw, { titleKeys })` checks a name, an entrance and a resume label for every game in the catalog and none for unknown games (`missing.game`, `ref.unknownGame`), plus the copy rules.
- `content/themes/elevator-quest/minigames/golfCourses.json`: three holes in course units (100 x 150: the green as a polygon, walls, round posts, tee, cup, the designed number of putts) and the putting and screen-reader words. Validated by `validateCourses` in `src/themes/elevator-quest/minigames/wordGolf/course.ts` (a tee inside a wall, a cup off the green, crossing rails, dashes, unknown placeholders and score words are refused) and proved playable in `wordGolf/course.test.ts`; theme tests, not part of `validate:content`. `wordGolf/copy.test.ts` scans every Word Golf line, both files, against the pack's words.

### Landing catalog (M7)

`content/themes/elevator-quest/landings.json`, schema and validator in `src/themes/elevator-quest/content/landings.ts`. One entry per floor (1 to 20): `floor`, `id`, `name` (the sign, upper case, at most 16 characters), `look` (wall, accent and trim swatches and a light, all names from the design tokens' `places`; pattern, signage, signLit, doorway, silhouette, window, up to three props, emblem, each from a fixed vocabulary), optional `kind`,, and optional `states.dormant` overrides (Floor 15). `validateLandings` checks: every floor once and none outside 1..20 (`dup.floor`, `missing.floor`, `ref.floor`), unique ids and names, known swatches and lights (`ref.swatch`, `ref.light`), no duplicate prop, and no two floors with exactly the same look (`dup.identity`). Tests add the design checks: unique wall, silhouette and emblem per floor, any two floors differing in at least four visible features, a shape budget, and the floor number's contrast over everything drawn behind it. A floor without an entry gets a plain "SERVICE LEVEL" landing.

Objects and exploration spots (M7.1, reworked in M8, D156). An entry may add `objects` (1 to 6) and `explore` (1 to 3 spots).
- An object: `id` (lowercase, the canonical id shared with the art and the reading items), `name` (3 to 40 characters, for screen readers and cards), optional `box` (in landing canvas fractions, the space of the art manifest's `hit`), `provisional: true` (the box is not yet measured on the final art), and `vector` (a box in door units on the vector landing, or `"hero"`).
- A spot: `id`, `target` (an object on this landing), `reaction` (`spin`, `tilt`, `bounce`, `lower`, `glow`, `lights`, `open`, `putt`, and since M8.1 `slide`), `discovery`, optional `legacy` (at most 3), `object` (the thing's name in Lifty's hint and the accessibility label), `line` (Lifty at the first touch, at most 110 characters), `fact` (the Engineer Log's sentence, at most 120), and what its reaction needs: `prop` and `openProp` (art manifest ids `landing.<floor>.<piece>`), `disc` {x, y, r} and `turns` (spin; whole turns, never 0), `linked` (up to 3 more discs, a gear train), `hoist` {rope, load, drop} (lower), `to` and `cup` (putt), `card` {title, 2 or 3 lines, close} (a short readable card), `action` and `closeAction` (screen-reader labels).
- `validateLandings` checks: unique object ids per floor (`dup.object`) and spot ids (`dup.spot`); a box inside the safe core x 0.16 to 0.84, y 0.08 to 0.92 (`ref.safe`), the same core as the art pipeline (a test checks they agree); a vector box inside the doorway (`ref.vector`); `hero` only on a silhouette with a hero part, and only one per floor (`ref.hero`, `dup.hero`); no box hidden completely behind another (`ref.hidden`; overlaps are allowed, smaller things sit in front); a spot's target exists (`ref.target`) and has a vector place, so nothing is dead on the vector landing (`missing.vector`); a prop belongs to its floor and moves for one spot only (`ref.prop`, `dup.prop`); a putt rolls to another object that has a place wherever the ball does, and only a putt has `to` or `cup` (`ref.to`); discs, linked discs, hoists and the cup stay inside the safe core; only a spin turns a disc, only a lowering has a hoist and a lowering needs one or a prop (`ref.disc`, `ref.hoist`, `missing.hoist`); only an opening thing has `openProp` or `closeAction` (`ref.open`); discovery keys unique across the catalog, legacy keys included (`dup.discovery`), and each is `eq.discovery.floor-<that floor>` or starts with it plus a dot (`ref.discovery`).
- Added in M8.1 (D161, D162): a spot may name `sound` (a sound slot from `audio/profile.ts`, played with every reaction; default the generic `landingReaction`) and, for an opening thing, `closeSound` (played as it shuts; default `sound`); the reaction `slide` with its `slide` box (the drawer's strip of the art, canvas fractions, on its object's box inside the safe core); and, for a putt, a `flag` box (the flag's strip of the art, its left edge on the pole, inside the safe core). `validateLandings` adds: `ref.sound` (a name that is not one of `SOUND_SLOTS`, or a `closeSound` on a spot that does not open), `ref.slide` (a `slide` box on a spot that does not slide), `missing.slide` (a slide without one), `ref.flag` (a flag on a spot that does not putt) and `ref.safe` for a flag or drawer outside the safe core. The schema only checks the name's form (`SoundName`); the validator checks it is a real slot.
- Added in M8.2 (D164): what a touch moves is part of the thing touched. A hoist's rope, and its load lowered to the end of its `drop`, sit inside the target object's box (`ref.hoist`), and a disc's centre sits on it (`ref.disc`), so a reaction always shows inside the thing's own touch area (the Floor 13 crane's box was widened to its jib for this). Since M8.2 every floor has objects and spots (28 spots on twenty floors); the tests derive the explorable floors from the catalog instead of a fixed list.
- Facts are short and plain, and claim nothing an engineer would dispute. A test scans them for internal vocabulary. Discoveries are world memory (ARCHITECTURE.md), never learning evidence. The Machine Room (Floor 6, formerly 7) keeps its old key as a legacy key (D130).

Kind (visual production milestone): an entry may set `kind` to `destination` (default `service`). Floors 7, 9, 13 and 20 are destinations. The building directory (`directoryRows`) lists every floor's number, name and emblem; it never selects anything.

## Production art manifest

`content/themes/elevator-quest/art/manifest.json` (schema and `validateArt` in `src/themes/elevator-quest/art/manifest.ts`) and `art/rights.json`. Each asset: `id`, `kind` (cabin, landing, lifty, object, icon), `file` under `assets/themes/elevator-quest/art/` in its kind's folder, `width`, `height`, `alpha`, `provenance` (provider, aiGenerated, humanReviewed, license), and its kind's keys (cabin `layer`; landing `layer`, `floor`, `state`, `rect`, `safe`, `signInk`, `depth`, `motion`, `hit`; lifty `pose`; object `visual`; icon `floor`). Each rights record: asset, source, madeWith (tool or artist role), date, aiGenerated, humanReviewed, license, modifications, approval (pending, approved, rejected), approvedBy (a role). `references` lists reference-only images (the concept pack). The validator checks: the schema, unique ids and slots, keys that belong to the kind, the kind's folder, floors inside the tower (no Floor 21), dormant or restored art only where a floor has that state, moving pieces with a pivot and a place inside the safe core (since M8 a piece an exploration spot moves, its `prop` or `openProp`, takes its motion from the spot and needs no `motion` of its own), touch areas only on explore floors and inside the safe core (required once the floor has art, except on a floor whose spots all carry their own object boxes in `landings.json`, M8), the decoded-memory budgets, a rights record for every asset that agrees with its provenance, approval only after a human review and with an approver, no reference image as an asset, no third-party reference, and no franchise names in ids, files or provenance (`content/ipGuard.ts`). Production draws only approved, reviewed, bundled art. Since M8.1 every non-rejected asset is approved (D158): the 22 approved by the owner's instruction after an agent audit carry `approvedBy: "project owner, by instruction for M8.1 (2026-10-08), after an agent audit"`, the D145 eleven `"project owner"`. `npm run validate:content` runs these checks, and the development calibration manifest (`assets/dev/art/calibration.json`) is checked against the same schema. docs/ART_ASSET_SPEC.md is the brief for making the art.

### Mission objectives (correction round)

`content/themes/elevator-quest/objectives.json`, schema and `validateObjectives` in `src/themes/elevator-quest/content/objectives.ts`, tested in `src/themes/content/objectives.test.ts` (part of `validate:content`). One entry per concrete thing a job names: `id`, `step`, `items` (`first`, `rest`, `all`), `at` (`destination` or `reference`), `noun`, `copy` (the copy line that names it), `visual` (one of the drawn kinds), `interaction` (`collect` or `none`), `label` (accessibility), `action` (accessibility, collectables), `found` and `absent` (Lifty). Checks are explicit relationships, not language analysis: known step and copy line, the line contains the noun, a destination line is relative (`{change}`) and a reference line gives the floor (`{start}`), destination objects have absence words, collectables have an action label and sit at the destination, and every item of every job that sends the lift somewhere has exactly one destination object (`missing.objective`, `dup.objective`). Pool steps (M8): an entry may list the `activities` of its step it is for (`ref.activity` for one the step cannot present); an entry without `activities` is for every activity of its step, and coverage is checked per pool member.

Copy changes in the same round: `nextJob` ("NEXT JOB"), `crateLabels`, `resume` shortened to "Welcome back." (the job line after it now fits the bubble on Fire with the help slot), and the generic praise lines `firstTry`, `noClue`, `withHelp`, `route` removed (D124).

### World catalog (M5)

`content/worlds/catalog.json`, schema and validator in `src/themes/catalog/worldCatalog.ts`. Field list and the portal principle: GAME_DESIGN.md "Worlds and portals". No difficulty field exists by design.

### Placement (M5)

`content/placement/*.json`, `PlacementSchema` in `src/engine/learner/model.ts`. See LEARNING_MODEL.md section 1.

`npm run validate:content` runs the pack sampling plus the theme copy, reading words, mission objectives, landing catalog, art and world catalog tests.

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
