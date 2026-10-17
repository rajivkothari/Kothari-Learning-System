# Environment

Occasional commands and the environment variable names the scripts read. Core check commands are in AGENTS.md. No secret values belong in this file or anywhere in the repository.

## Services

Gameplay is offline: no network service sits on a gameplay path (AGENTS.md, non-negotiable 1). The repository has no CI, no deployment configuration and no over-the-air update channel; the browser build is for development and playtests only, and device builds are made by hand (docs/DEVICE_LAB.md).

## Occasional commands

```bash
npm run web:playtest      # browser playtest dev server (http://localhost:8081)
npm run web:screenshots   # visual-review captures into web-screenshots/
npm run bench             # history benchmark; persistence: node scripts/bench-persistence.js
node scripts/perf-rides.js | perf-games.js | perf-log.js | perf-directory.js --dist <dir>   # browser soaks, never a tablet
node scripts/generate-runtime-manifests.js [--check]   # slim art and audio runtime manifests
node scripts/generate-elevator-audio.js [--sources]    # prototype sounds; --sources rewrites sound requires from pack statuses
npm run review:word-golf  # AI review bundles into .ai-review/ (gitignored): project, learning-engine, elevator-quest, word-golf; change: npm run review:bundle -- change --base <sha> --head <sha> (docs/AI_REVIEW_BUNDLES.md)
npm run android | ios     # dev builds; lab:android:release | lab:ios:release for measurements
```

More options for the browser scripts: docs/WEB_PLAYTEST.md.

## Environment variable names

| Name | Read by | Purpose |
|---|---|---|
| `CHROMIUM_PATH` | browser scripts (`scripts/lib/browser.js`) | the Chromium or Chrome to drive when none is found |
| `E2E_ONLY`, `E2E_TOUCH`, `E2E_REDUCED`, `E2E_FLOORS`, `E2E_DIST` | `scripts/web-e2e.js` | run only some checks, touch input, Reduced Motion, which floors, which build folder (see the script's header) |
| `E2E_SHOTS`, `E2E_VERBOSE`, `E2E_REACT_MS`, `E2E_MIN_COLOURS` | `scripts/web-e2e.js` | screenshots, logging and check thresholds (see the script) |
| `CHECK_WEB_DIR` | `scripts/check-bundle.js` | which web build to scan |
| `BENCH` | `jest.config.js` | `BENCH=1` adds the opt-in benchmark project |
| `EXPO_PUBLIC_DEV_TOOLS`, `EXPO_PUBLIC_PLAYTEST`, `EXPO_PUBLIC_DEVICE_LAB` | build flags | developer tools, playtest build, Device Lab (docs/WEB_PLAYTEST.md, docs/DEVICE_LAB.md); production builds leave them unset |

Scripts that need a variable from a `package.json` script use `node scripts/run-with-env.js NAME=value -- <command>`.
