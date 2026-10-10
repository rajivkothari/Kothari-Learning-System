# Magical Kingdom V0.2 QA — 2026-10-09

The gameplay and wardrobe revision passed the software gates below. The spoken voice replacement remains blocked by connection availability: the owner reports connecting ElevenLabs, but this chat's available tools and plugin search still expose no ElevenLabs capability. Standard API-key presence checks are empty. No new voice recording is claimed.

| Check | Observed result | Evidence |
|---|---|---|
| Full repository gate | 141 suites, 1,828 tests passed; typecheck, lint, and Fire dependency scan passed | `verify.log` |
| Authored content | Existing content gate: 13 suites, 250 tests passed. Kingdom contracts and sampled generation are also checked in the full gate | `content-validation.log`, kingdom director tests |
| Browser acceptance | Chromium 154.0.8037.98, four layouts passed | `browser-results.json`, `browser-tests.log` |
| Production boundary | Android and iOS exports exclude developer markers; explicit audit excludes all seven kingdom PNGs | `bundle-check.log` |
| Elevator Quest regression | Floor 15 to free ride; Word Golf word/putt/hole; Cargo load/weigh; return to the same elevator instance and records | `elevator-browser.log` |
| Browser export | Final source exported successfully | `web-export.log` |

The four simulated layouts are iPad 1180×820 and 820×1180, and Fire 960×600 and 600×960. The test drives actual touch gestures and taps, without injected academic state or keyboard answers. Each run confirms five sockets and five crystals on the first bridge; exact capacity on later bridges; prebuilt stones in the repair; reversible placement; wrong-answer retry; requested help; and a demonstration. Three-stage Ice and Garden replays reach their final acknowledgement before earning a mission gift.

Wardrobe checks cover locked-item rejection, every category, whole winter/garden/starlight outfits, crown/bow/wings/wand combinations, reload retention, and retention after a new book. Decorations and dressing create zero learning events before the first answer. Each run ends with nine correct academic attempts: retry, clue, six independent, and demonstrated. SQLite integrity is `ok`; the Elevator database has no rows from kingdom play. The unit suite additionally tests real database close/reopen during a repair celebration, tampered cosmetic settings, failed wardrobe writes, and failed gift reads after a committed completion.

All enabled gameplay controls checked in Castle, Ice, Garden, and repair fit their viewports and meet the 64-pixel target check. Browser media instrumentation records effect playback, no more than one concurrent recorded effect, and no new playback while muted. The tests report zero page errors and zero nonlocal requests. Offline play is exercised after assets have loaded; this is not a fresh offline browser installation test.

[The gallery](index.html) links 36 actual browser screenshots, nine per layout. Representative wardrobe and bridge screenshots were inspected at full size; that review caught and corrected a crown overlay covering the face. The final screenshots show a smaller crown, distinct crystal/flower/star wands, and wings behind the shoulders. Outfit PNG dimensions and alpha-zero corners were inspected, and their hashes are recorded in the outfit provenance file. Soft semitransparent glow remains around the figures.

The project uses five existing approved ElevenLabs sound-effect files. Playback checks establish browser behavior, not listening quality. Spoken narration still uses the local speech fallback; the finite 66-line recording brief is ready. Matching the reference voice, generating and bundling recordings, transcription checks, and a listening review are unfinished.

Physical iPad and Fire behavior, native speech, native interruption handling, screen-reader interaction, tablet memory/performance, and a new child usability session are untested. The raster concepts remain pending human art review. The prototype is a browser playtest, with the original two rooms and the existing KLS engine; it is not a production release or a broad curriculum.
