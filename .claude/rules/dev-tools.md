---
paths:
  - "src/dev/**"
  - "src/devtools/**"
---

# Developer tool rules (src/dev/, src/devtools/)

- Developer tools act on test learners only and never write learning records themselves. Keep them out of production bundles (`npm run check:bundle`).
- `src/dev/` must never import `src/engine/` or `src/themes/`.
