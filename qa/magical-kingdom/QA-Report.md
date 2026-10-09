# Vienna V0.1 — QA report

Reviewed 2026-10-09 in the isolated `codex/vienna-magical-kingdom` checkout. Base commit: `ee4b1405f44e775b0736bb1925bcbd6600fa0b79`, the accessible committed M9.1 baseline on `claude/m7-floor15-playtest`. No remote `main` branch was present when refs were inspected. The other checkout was not changed. The delivery message supplies the feature commit SHA; this report and its evidence are part of that commit.

## Confirmed passes

| Check | Result | Recoverable evidence |
| --- | --- | --- |
| `npm run verify` | Exit 0: types, lint, 141 suites / 1,821 tests, Fire dependency scan | `verify.log` |
| `npm run validate:content` | Exit 0: 13 suites / 250 tests | `content-command.log` |
| CI content sampling including new kingdom director | Exit 0: 14 suites / 262 tests | `content-validation.log` |
| `npm run check:bundle` | Exit 0: Android/iOS production developer-marker exclusion; existing approved Elevator asset checks; playtest marker inclusion | `bundle-check.log` |
| `npm run web:export` | Exit 0 on final SVG-browser/native-Skia sources | `web-export.log` |
| `node scripts/generate-runtime-manifests.js --check` | Exit 0, manifests up to date | Command output inspected in this session |
| `node scripts/kingdom-e2e.js` | Four fresh contexts passed in Chromium 154.0.8037.98; no page exceptions or nonlocal requests | `browser-tests.log`, `browser-results.json`, script source |
| Existing M9 browser regression | Floor 15 completed; Word Golf spell/putt/hole and Cargo load/weigh completed; returned to same landings and unchanged Elevator mission; one record per answered item | `elevator-browser.log`, existing `scripts/web-e2e.js`, `E2E_ONLY=mini-games (M9)` |
| Screenshot gallery | 32 images decoded, zero broken images | `index.html`, `screenshots/` |

Tablet viewport coverage: iPad 1180×820 and 820×1180; Fire 960×600 and 600×960. These are CSS pixel browser viewports, not physical device runs. The final castle, Ice, and Garden captures were inspected at all four sizes; text and primary controls fit. Enabled controls are authored at least 64 pixels, with automated bounds checks. Portrait uses two rows of five crystals. Screenshots also show filled constructions, completion, planted letters, and demonstrations.

The browser script sends actual touchscreen taps and CDP touch drags. It completes activities without a keyboard or injected game state. It covers all three doors, three dress-up colors, decorative reactions, crystal drag/tap/removal, letter drag/tap/removal, wrong answers, clue/guided/demonstrated help, completion, return home, partial reload, celebration reload, offline play after asset load, comfort toggles, new-book confirmation/cancellation, and safe exit. Hear it is tapped in all three rooms; this exercises the control without establishing audible voice quality. The script reads persisted SQLite bytes only to inspect evidence and integrity.

Each context ends with four correct attempt records: `retry` (one wrong try), `clue` (one wrong try), `independent` (zero wrong tries), and `demonstrated` (two wrong tries). Decoration and dress-up produced zero learning records; placement alone produced zero attempts. Reloaded celebrations did not duplicate answers. The kingdom did not open or modify Elevator's `kothari-learning.db`. SQLite integrity returned `ok`.

The 12 new director tests validate content and mission contracts, generated replay counts 1–10, duplicate submission protection, letter selection/removal, navigation persistence, real close/reopen, assistance labeling, restart evidence retention, retained motion/cosmetics, transaction failure rollback, and optional play-save failures. Shared engine, runtime, persistence, and Elevator gameplay source files have no feature diff.

## Failures found and corrected

- Crystal/letter drag originally fought the web press responder; a letter drop could immediately toggle off, and later touch buttons could stop responding. The kingdom now uses one gesture family with an exclusive drag/tap token and dedicated tap controls. Final touch walkthroughs passed.
- Landscape background images retained intrinsic dimensions and misaligned the doors. Explicit viewport sizing corrected the final captures.
- Many individual Skia web contexts caused older icons to disappear after extended play. An attempted static-context rendering mode also exposed a zero-size draw on navigation. The final web adapter renders the same authored paths as SVG; native keeps Skia. All final captures contain vector geometry, and the late demonstration captures were visually checked for retained icons.
- The first full verify failed two byte-exact generated-manifest tests due to CRLF conversion. Explicit LF attributes plus regeneration corrected them; parsed JSON was unchanged. `verify-initial.log` preserves that run.
- A verification run overlapped export output replacement and TypeScript saw a disappearing generated JS file. An earlier Elevator browser run similarly collided with export replacement. Both were rerun against a finished export and passed. No acceptance claim uses those interrupted runs.

No known failing check remains in the final automated run. This does not establish native-device acceptance.

## Untested behavior and review limits

- Physical Fire HD 8 and iPad installation, gestures, frame rate, battery, native screen reader, OS hardware-back behavior, background interruption, and native crash/relaunch have not been exercised. Node close/reopen and browser reload were exercised.
- Narration audibility, installed voice availability, pronunciation, and subjective calmness have not been checked on tablets. Native uses optional OS speech; browser requires an explicitly local English voice. A missing local voice leaves visual play usable. There is no music or bespoke SFX pack.
- Offline browser acceptance covers play after loading assets, not a fresh offline navigation or installable PWA. No service worker was added.
- The child-facing experience has not been playtested with a child. Generated room art and the single princess pose remain pending human review. Dress-up is three accessory colors, and character motion is a single-pose bob/celebration, not a completed animated wardrobe.
- Garden evidence is cued beginning-letter practice because the word is printed beside the picture. It must not be presented as uncued sound mastery. The assumed starting placement unlocks the activity without awarding prerequisite evidence.

## Reproduce

```powershell
npm run verify
npm run validate:content
npm run web:export
node scripts/kingdom-e2e.js
$env:E2E_ONLY='mini-games (M9)'
node scripts/web-e2e.js
Remove-Item Env:E2E_ONLY
```

Do not export into `dist-web` while a browser regression or typecheck is using that directory. For manual play and visual-direction notes, see `docs/magical-kingdom/V01.md`. The original generated PNGs and their hashes live under `assets/themes/magical-kingdom/`; the prompt briefs name the built-in generation tool and pending-review status.
