# Recorded kingdom narration QA — 2026-10-10

The recording pack has 67 game clips and one saved audition. The connected ElevenLabs workspace returned the existing project's Jo M. narrator and `eleven_multilingual_v2`. All game clips were downloaded unchanged, hashed, and registered as local static assets. The provider's returned generation prices total 2,755 credits / 55.10 US cents, including four audition takes. These records do not independently verify the billing statement.

| Executed check | Observed result | Evidence |
|---|---|---|
| Authored speech | 67 of 67 transcripts match the script after case, punctuation, and number-form normalization | `transcripts.json` |
| Repository gate | 144 suites / 1,840 tests; typecheck, lint, Fire dependency scan passed | `verify.log` |
| Audio browser acceptance | Four layouts; all 67 MP3s decode; recorded guide and goals play; rapid replay, mute, offline voice after loading, and exit cleanup pass | `audio-browser-results.json`, `audio-browser.log` |
| Gameplay browser regression | Four layouts pass earned outfits, locked-item rejection, exact bridge capacity, repair, three-stage quests, reload, offline play, restart, mute, and SQLite evidence isolation | `gameplay-results.json`, `gameplay-browser.log` |
| Native production boundary | Android/iOS exports exclude all 75 prototype art and voice files | `bundle-check.log`, `prototype-boundary.log` |
| Web export | Final cancellation fix exported successfully | `web-export.log` |

The browser is Chromium 154.0.8037.98. Layouts are iPad 1180×820 and 820×1180, Fire 960×600 and 600×960. Each audio run records no playback before a gesture, one maximum concurrent player, no new playback while muted, offline playback from retained local blobs, and revocation of all 67 voice blobs on exit. It reports zero page errors, media errors, and nonlocal requests. Full decode checks run on every clip in every layout; playback checks exercise representative guide, room-introduction, bridge-goal, and garden-goal clips.

The original gameplay browser regression exposed rejected play promises when a pending Expo web clip was immediately paused. The browser adapter now attaches a rejection handler before cancellation can occur; two focused regression tests cover deliberate cancellation and active playback failure. The full gate passed with an import-order warning in that test file; the import was reordered, then focused lint and both tests passed. That warning does not remain in the source.

Each final gameplay run reports nine correct academic attempts, SQLite integrity `ok`, zero page errors, zero nonlocal requests, and one maximum concurrent recorded clip. Outfit choices and gifts survive reload and a new book; dressing adds no academic evidence. The test also confirms no kingdom records enter the Elevator database. The 36 final gameplay screenshots stay in the ignored `.expo/kingdom-voice-gameplay/screenshots` directory; the existing V0.2 gallery shows the same wardrobe and gameplay visuals.

The initial native exports and explicit asset audit establish prototype exclusion. The final change to playback cancellation is inside that excluded prototype. Physical iPad/Fire playback, native interruptions, screen-reader behavior, and memory/performance on a tablet have not been tested. No person has approved the sound quality, tone, or pace, so the asset manifest keeps `humanReviewed: false`. Transcription is a wording check, not a listening review. Offline browser checks require the page's assets to have loaded; a fresh offline installation is not supplied.
