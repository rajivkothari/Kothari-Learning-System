---
paths:
  - "src/engine/**"
---

# Engine rules (src/engine/)

- Engine production code imports only `zod` and other engine files. No clock, `Math.random`, network, storage, or filesystem: callers pass time, seeds, ids, and evidence. No theme, setting, or learner vocabulary in the engine.
- Generators are pure and versioned. Any change to a generator's output for a given seed needs a version bump. Item signatures are hashed: do not change `random/hash.ts` without a migration plan. Tests pinned to a searched seed must be re-searched when a mission version changes.
- Never add a progression-value source keyed to wrong answers or attempt counts. Value must stay one-time events, and `value.property.test.ts` must keep passing.
- Mastery thresholds and weights live in `content/engine-config.json`, never as literals in code.
- Non-negotiable 5 in AGENTS.md also applies here.
