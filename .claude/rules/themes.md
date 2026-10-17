---
paths:
  - "src/themes/**"
  - "content/themes/**"
---

# Theme rules (src/themes/, content/themes/)

- Theme logic (`src/themes/*/sim`, `director`, `content`, pure audio and layout files) imports no React, React Native, Expo, or Skia. Theme code never scores: it uses `runtime.check` and committed intents. Sounds are semantic slots mapped by a profile, never filenames in logic.
- Child-facing theme text lives in `content/themes/` and must pass `validateMissionCopy`. No hard-coded copy in director or UI code.
