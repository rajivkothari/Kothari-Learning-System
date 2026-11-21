# Third-party assets

Every file in the app that this project did not make itself: where it came from, at which version, under which licence, where it lives and which test holds it in place. Allowed licences are CC0, MIT, Apache-2.0 and SIL OFL only. Each library ships inside the app with its licence text and a manifest of hashes beside its files, so nothing is fetched at runtime (non-negotiable 1).

Each licence was read on the fetch date below, in the file or page named. Re-read it before depending on a fact older than about three months (CLAUDE.md, truthfulness rules).

Generated speech and generated art are not third-party libraries and are not listed here: see `assets/themes/magical-kingdom/audio/manifest.json`, `content/themes/magical-kingdom/wordGarden.recordings.json`, `assets/themes/magical-kingdom/provenance.json` and, for Elevator Quest, `assets/themes/elevator-quest/audio/manifest.json` and the art `rights.json`.

## Magical Kingdom (D204 to D206)

| Library | Used for | Licence | Version or commit | Files | Test |
|---|---|---|---|---|---|
| Microsoft Fluent Emoji, 3D style | 28 word pictures | MIT, "Copyright (c) Microsoft Corporation" | `microsoft/fluentui-emoji` commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc` | `assets/themes/magical-kingdom/pictures/` (28 PNG, 256 px, 941 KB, `LICENSE.fluentui-emoji.txt`, `manifest.json`) | `src/themes/magical-kingdom/ui/pictures.test.ts` |
| Kenney "Interface Sounds" 1.0 | effects `place`, `remove`, `retry` | CC0 1.0 | OpenGameArt `kenney_interfaceSounds.zip`, sha256 `f2193d07…81232` (full hash in the manifest) | `assets/themes/magical-kingdom/audio/effects-v1/` (`place.wav`, `remove.wav`, `retry.wav`, `LICENSE.kenney-interface-sounds.txt`, `manifest.json`) | `src/themes/magical-kingdom/audio/effects.test.ts` |
| Kenney "85 short music jingles" | effects `success`, `gift` | CC0 1.0 | OpenGameArt `jingleSounds_Kenney.zip`, sha256 `be324b6c…682e5` (full hash in the manifest) | the same folder (`success.wav`, `gift.wav`, `LICENSE.kenney-jingles.txt`) | the same test |
| Open Letter Sounds, voice `marin` | the Word Garden's 16 letter sounds | CC0 1.0 (the `sounds/` folder only; the library's code is MIT and is not used) | `purplecomputerorg/openlettersounds` commit `4f3263be3a961587d175f73b19553e3c07a016e5`, folder `sounds/en-us/marin` | `assets/themes/magical-kingdom/audio/word-garden-phonemes-review/library.<letter>.mp3` with `LICENSE.openlettersounds.txt`; production copies `assets/themes/magical-kingdom/audio/word-garden-v1/sound.<letter>.mp3`, with the same `LICENSE.openlettersounds.txt` beside them (the copies that ship); provenance in `content/themes/magical-kingdom/wordGarden.recordings.json` | `src/themes/magical-kingdom/wordGarden/flow.test.ts` (the checklist test) |
| Andika 6.101, Regular and Bold | the typeface for letters and words a child reads | SIL Open Font License 1.1, reserved font names "Andika" and "SIL" | `google/fonts` `ofl/andika` commit `515797205c54276da8c06026f479d3a9d5404932` | `assets/themes/magical-kingdom/fonts/` (`Andika-Regular.ttf`, `Andika-Bold.ttf`, `OFL.txt`, `manifest.json`, 1.35 MB) | `src/themes/magical-kingdom/ui/readingFont.test.ts` |

All five were fetched on 2026-11-20.

### What was done to each

- Pictures: nothing. Each is the 256 x 256 PNG as published, renamed to the word it pictures (`fox.png` is `assets/Fox/3D/fox_3d.png`). The map is `ui/pictures.ts`; `ui/WordPicture.tsx` falls back to the code-drawn icon when a word has no picture or the image fails to load. `sun` and `bun` have no emoji that reads as the word and stay code-drawn, as do the chests, the gem and every control (`ui/MagicArt.tsx`, original to this project).
- Effects: silence trimmed from both ends, mixed to mono, one fixed gain so each file measures -31 dBFS RMS (peaks -15 to -22 dBFS), a 4 ms fade in and a 30 ms fade out, 16 bit 44.1 kHz WAV. Each is quieter than the quietest Word Garden speech clip (-29.9 dB mean). The manifest says `heard: false`: nobody has listened to them in the app. No background music is shipped.
- Letter sounds: each WAV (16 bit mono 24 kHz) re-encoded to mp3 128 kbps mono 44.1 kHz with a fixed -4 dB gain. The voice is synthetic (the library says OpenAI `gpt-audio-1.5`, voice `marin`). They are in use on the owner's instruction and nobody has listened to one yet: the checklist records each as `approval: owner instruction, not yet heard by a person`, `humanReviewed: false`. `scripts/letter-sounds.js` is the only way a letter sound is registered.
- Typeface: nothing. The files are unmodified and keep their names, as the licence requires of a font that keeps its reserved name. Native builds embed them through the `expo-font` config plugin in `app.json`; the browser build loads them once (`ui/readingFont.ts`, `ui/readingFont.web.ts`).

### Credit

None of these licences requires a credit line in the app. MIT and the OFL require the copyright and licence text to travel with the files, which is why each licence file sits beside them and is hashed by the test. Kenney asks for credit as a courtesy, not a condition.

## Software libraries

npm dependencies are listed in `package.json` with their licences in `package-lock.json`. `expo-font` (~57.0.4, MIT) was added for the typeface; `npm run check:fire` passed after it (no Google Play Services dependency).

## Adding one

1. Read the licence yourself, in the source's own licence file. Only CC0, MIT, Apache-2.0 or SIL OFL.
2. Pin a commit or an archive hash. Download into an empty folder and run nothing from it.
3. Put the files under `assets/` with the licence text and a manifest (source path, commit or archive hash, sha256, bytes, what was changed).
4. Add a test that checks the files against the manifest, and a row here.
5. Never describe how a sound is heard unless a person has listened: measure it and say "not yet heard".
