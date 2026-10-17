---
paths:
  - "src/runtime/**"
  - "src/persistence/**"
---

# Runtime and persistence rules

- Every runtime command carries a `commandId` and commits in one transaction. New durable writes need stable ids and `INSERT OR IGNORE`, and a crash-injection case in `src/runtime/crashRecovery.test.ts`.
- `src/runtime/` and `src/persistence/` never import React, React Native, or Skia, and only `src/persistence/expoDatabase.ts` imports expo-sqlite.
