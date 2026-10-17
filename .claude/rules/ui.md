---
paths:
  - "src/**/*.tsx"
  - "src/presentation/**"
---

# UI rules (React Native views, presentation)

- Prefer one shared Canvas per visual surface. Multiple simultaneous Skia/WebGL canvases require a clear reason and must stay within supported context limits.
- Reanimated shared values: use `.get()` / `.set()` (React Compiler lint rules reject `.value =`).
- UI reads design token roles (`src/presentation/design/tokens.ts`), never raw colors. Red is for genuine danger only, never for a wrong answer.
- All child-facing gameplay and instructional text takes its size from the text roles (today `src/themes/elevator-quest/ui/textRoles.ts`). Developer and debug tooling is exempt.
- Engine and `src/presentation/layout/` must never import React, React Native, Expo, or Skia.
