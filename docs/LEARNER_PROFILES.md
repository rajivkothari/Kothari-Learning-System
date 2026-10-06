# Learner Profiles

Tracked docs describe learner archetypes and the product requirements they create. They never name a real child or record a diagnosis or family detail. Real profile data lives in two places only:

1. On-device app storage (SQLite `learners` and `learner_settings` tables), created at runtime by a parent.
2. The gitignored `private/` folder for local design notes and optional dev seed data. See [private/README.md](../private/README.md).

## Archetypes

### learner-engineer (Elevator Quest)

- Early-elementary start. Initial math content around Grades 1-3, scaling toward Grade 8.
- Reading level may sit well above math level. Math missions can therefore carry technical text (maintenance notes, manuals), and narration is optional rather than primary.
- Subjects: math, science, reading comprehension, logic, problem solving.
- Interests the theme serves: elevators, engineering, machines, robots, systems, earthquakes, how things work.

Product requirements this archetype drives:
- Support expressive-language differences: never require speech to progress. Speech activities are optional enrichment.
- Predictable structure, clear visual instructions, short missions, low clutter.
- Strong sensory controls: quiet mode, no surprise loud sounds, reduced motion, skippable animations.
- Access support never lowers intellectual challenge.

### learner-storyteller (Magic Tower)

- Pre-K / kindergarten start.
- Primary: reading, phonics, early writing, vocabulary, comprehension. Secondary: early math and basic science.
- Mostly a pre-reader at the start: every instruction needs a path that does not depend on reading, and narration is a primary channel.
- Writing progression: trace -> copy -> construct -> independently write. Finger and stylus.

Product requirements this archetype drives:
- Narration on by default, tap-to-hear everywhere.
- Literacy letterforms that match early-writing instruction (single-story "a" and "g").
- Story-driven, character-driven feedback where the learning action changes the world.

## Profile data model (runtime)

```ts
interface LearnerProfile {
  id: string;               // UUID, generated on device
  displayName: string;      // entered by a parent on device, never in source
  archetype: string;        // "learner-engineer" | "learner-storyteller" | future
  themePack: string;        // "elevator-quest" | "magic-tower"
  avatar?: string;
  createdAt: string;
}

interface LearnerSettings {
  narrationDefault: boolean;
  quietMode: boolean;
  reducedMotion: "system" | "on" | "off";
  skipAnimations: boolean;
  volumes: { music: number; sfx: number; narration: number; dialogue: number; ambience: number };
  speechActivities: "off" | "optional";
  supportProfile: { helpOfferPatience: "early" | "standard" | "extended" };
  textScale: number;
}
```

Starting skill placement is set by a parent at profile creation (coarse per domain) and refined by play.

## Local dev seeding (planned, not built)

When profiles exist (M5), a dev-only script may read `private/learners.local.json` (shape: `private/learners.example.json`) and insert profiles into a development database. It must never import that file into the app bundle, so a release build cannot contain it.

## Rules

- Never compare learners' academic performance, token earnings, or progress anywhere, including Parent Mode.
- Each profile owns its own world, curriculum state, saves, settings, and reward presentation.
- Do not add real names, ages, diagnoses, or family details to tracked files, commit messages, test fixtures, or content IDs.
