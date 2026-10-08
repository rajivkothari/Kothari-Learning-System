# Device Lab

A developer-only harness that answers one question before gameplay work starts: can Expo + React Native + Skia + Reanimated + Gesture Handler + expo-audio + expo-sqlite deliver the interaction quality we need on an affordable Fire tablet and an iPad?

It is not gameplay and not production UI. It lives in `src/dev/device-lab/` and never imports the learning engine.

Hardware status (checked 2026-10-06): no physical run has been recorded. The run log below is still the empty template. Renderer acceptance for Skia + React Native is therefore provisional, including for the Floor 15 slice (M4, and the M5 art pass), which was built on top of it anyway. A physical run of both parts below decides it.

## What it contains

| Tab | Tests | Notes |
|---|---|---|
| Scene + Touch | Skia 2.5D elevator scene (parallax skyline, shaft, moving car with doors and counterweight, floor indicator text, glows, rotating fan, 1 Hz status lights, arrival ring). Floor buttons 1-6, lock toggle (disabled state), rapid-tap pad, optional SQLite write per tap, optional arrival "ding". | Representative load, not a stress test. Controls sit beside the stage in landscape and below it in portrait. |
| Drag | Crate dragged onto a bay. Forgiving hit area (24 pt slop), snap radius ~75% of the crate, spring snap, glow on success, spring back on miss. | Crate position is stored in logical stage units, so a resize mid-drag keeps it in place. |
| Draw | Finger or stylus strokes rendered with Skia, one dashed "C" trace guide with start (green) and end (red) dots, undo, clear. | No scoring or recognition. |
| Audio | Success chime as WAV and AAC, single player vs a 4-player pool, burst of 8, narration placeholder, volume and mute. | Narration is a tonal placeholder. The build container has no offline TTS, and online TTS is off-limits. |
| SQLite | Launch counter, event counter, journal mode, +1 / +100 events, clear. | Separate `device-lab.db`. Not the future attempts table or ledger. |
| Diag (overlay) | Device, OS, Hermes/Fabric, debug vs release, window and screen size, orientation, aspect, safe-area insets, UI and JS frame stats, press-to-frame, SQLite write time, audio status. "Share report" exports the text. | Every approximation is labeled in the panel. |

The top bar shows a live UI-thread FPS meter. "Meter" toggles measurement off to check its own cost.

## How honest are the numbers?

| Metric | What it measures | What it does not |
|---|---|---|
| UI frames | Interval between Reanimated frame callbacks on the UI thread | GPU completion, dropped frames inside the compositor, display latency |
| JS frames | Interval between JS `requestAnimationFrame` callbacks | Anything native |
| Press to next UI frame | Time from the gesture's `onBegin` on the UI thread to the next frame callback, on the animation clock | Touch digitizer latency, display scan-out. Real tap-to-photon is longer. |
| SQLite write | Wall time of one async insert, measured on JS | Whether the data reached disk (verify with force-quit) |
| Audio play call | JS cost of `seekTo(0)` + `play()` | When sound actually comes out |
| Narration status | `play()` until the status event says playing (50 ms polling) | Audio onset, upper bound only |

Real tap-to-visual and tap-to-sound latency needs a slow-motion phone video (240 fps if available): film the finger and the screen, count frames between contact and change. Do this for the floor buttons and the chime.

Debug builds are much slower than release builds. Only release-build numbers count.

## Running it

Prerequisites on your own machine: Node 22, a JDK and Android SDK (Android Studio) for Fire, a Mac with Xcode 26.4+ for iPad (Expo SDK 57 requirement). The cloud container that wrote this code has no Android SDK, no Xcode, and no devices, so nothing below has been run on hardware yet.

```bash
npm install
npm run verify          # typecheck, lint, unit tests, Fire dependency scan
```

Development build (hot reload, slow, functional checks only):

```bash
npm run android         # Fire tablet connected over adb
npm run ios             # iPad connected, or pick a simulator
```

Release build with the lab enabled (use this for every performance number):

```bash
npm run lab:android:release   # EXPO_PUBLIC_DEVICE_LAB=1 expo run:android --variant release
npm run lab:ios:release       # EXPO_PUBLIC_DEVICE_LAB=1 expo run:ios --configuration Release
```

Alternative without local Android tooling: EAS Build can produce an installable APK in the cloud. That needs an Expo account and an `eas.json` profile, which this repo does not have yet. Add it only if local builds are impractical.

Production builds without `EXPO_PUBLIC_DEVICE_LAB=1` exclude the lab: `metro.config.js` swaps in a stub and the audio test assets drop out. Verified with `expo export`: 2.6 MB Android bundle without the lab vs 3.4 MB with it, and zero lab strings in the former. Whether the Gradle release task sets `NODE_ENV=production` the same way is not verified. If the lab appears in a release build without the flag, file it.

### Running Floor 15 and the Device Lab from one install

Development builds and lab release builds (`EXPO_PUBLIC_DEVICE_LAB=1`) open a developer launcher with two choices: **Elevator Quest** (Floor 15) and **Device Lab**. Restart the app to switch. Plain production builds open Elevator Quest directly and contain no lab code.

The Floor 15 playtest report (developer only) is in development builds, or in release builds made with `EXPO_PUBLIC_PLAYTEST=1`:

```bash
EXPO_PUBLIC_DEVICE_LAB=1 EXPO_PUBLIC_PLAYTEST=1 npx expo run:android --variant release
EXPO_PUBLIC_DEVICE_LAB=1 EXPO_PUBLIC_PLAYTEST=1 npx expo run:ios --configuration Release --device
```

Open it with a 2-second long-press on the "POWER RESTORATION" checklist, or Settings > Playtest report.

### Fire tablet setup

1. Settings > Device Options > tap Serial Number 7 times to show Developer Options. Enable ADB. (Menu names vary by Fire OS version.)
2. Connect USB, accept the RSA prompt, check `adb devices`.
3. Record `adb shell getprop ro.build.version.sdk`, `ro.product.model`, `ro.product.cpu.abilist`. The ABI list matters: if the device reports only `armeabi-v7a`, the 32-bit build path must be in every release.

## Physical test checklist

Run on a Fire HD 8 (2022 or 2024) first. It is the performance floor. Then an iPad. Use release builds. Charge above 50%, close other apps, and note the room temperature if the device feels warm.

For each run, open Diag and "Share report" at the start and after each section. Paste reports into the run log template at the bottom.

### A. Fire HD 8

1. Install: `npm run lab:android:release`. App opens to the Device Lab. Diag says "release build", Hermes yes, Fabric yes.
2. Orientation: rotate portrait <-> landscape on every tab. Nothing clips, overlaps, or needs a restart. Scene stays centered with building art filling the extra space.
3. Scene idle: leave the Scene tab for 60 s. Record UI fps, p95, slow frames.
4. Scene load: press floors 1 -> 6 -> 2 -> 5 repeatedly for 30 s with Ding on. Record UI fps, p95, worst frame, press-to-frame median.
5. Rapid tap: tap TAP as fast as possible for 10 s with "Save taps: SQLite" on. Every tap shows press feedback. Counter matches taps (spot check). Record taps/s, SQLite write median, UI p95.
6. Disabled state: Lock panel. Floor buttons look disabled and do nothing. Unlock restores them.
7. Drag: 20 drags. Crate tracks the finger without lag or jumps. Drops near the bay snap. Far drops return. Rotate the device with the crate snapped: it stays on the bay.
8. Draw: write several letters and trace the C guide 5 times. The line follows the finger with no visible lag or gaps. Undo and Clear work. Then draw continuously for 30 s and watch for slowdown as strokes accumulate.
9. Audio: Play chime 10 times slowly (WAV, pool), then AAC, then single-player mode. Burst x8 in each mode. Listen for missing, clipped, or late chimes. Play narration, stop, play again. Mute and volume behave. Film one chime tap in slow motion and count frames from touch to sound if your camera records audio in slow-mo, otherwise judge by ear.
10. Persistence: SQLite tab, +100 events, note counts. Force-stop from recent apps. Relaunch. Launches +1, events unchanged, journal mode `wal`.
11. Interruption: with narration playing, press Home and return. App resumes, nothing crashes, audio does not keep playing in the background.
12. Memory: `adb shell dumpsys meminfo com.kotharifamily.learning` after step 4 and after step 8. Record TOTAL PSS.
13. Frame truth: `adb shell dumpsys gfxinfo com.kotharifamily.learning reset`, run step 4 for 30 s, then `adb shell dumpsys gfxinfo com.kotharifamily.learning`. Record janky frames % and 90th/95th percentile.

### C. Floor 15 (both devices, after A or B)

From the launcher choose Elevator Quest. Release build. Film steps 2, 4, and 6 in slow motion if possible.

1. Wake: press DOOR OPEN. Lights come up in one smooth ramp, doors open, ambient hum starts quietly. The lift then rides by itself to the first job.
2. Panel touch response: press a floor. The button depresses on the frame after the finger lands (slow-mo: count frames, target <= 3 frames, about 50 ms) and the click is heard at the same time. The light comes on with a soft confirmation tone.
3. Rapid pressing: mash the lit floor 10 times, then other floors while the doors close and during travel. Exactly one ride, one chime, no stacked clicks (at most about 11 clicks per second), no stuck states. Report shows one answer.
4. Doors: watch close and open at normal speed. Smooth, no stutter, motor sound starts with the motion and stops when the doors meet. Press DOOR OPEN while closing: doors reverse from where they are.
5. Travel: the indicator counts every floor in order and never shows the target at departure. The car marker on the shaft map moves smoothly and agrees with the indicator. The motor sound changes at slowdown and is gone at the stop.
6. Arrival sync: stop, then chime, then doors open. No chime while still moving (slow-mo with audio if your camera records it, else by ear).
7. Repeated audio: ten rides in a row. No missing, clipped, or late sounds, no drift between sound and doors.
8. Wrong floor: press a wrong floor. The lift goes there, then Lifty explains. Retry from there.
9. Shaft map: in the shaft job, drag the car marker to a floor. The ghost label follows the finger, release sends the lift.
10. Cargo bay: drag crates into the car and back, and tap them. Crates follow the finger. Overload: DOOR CLOSE plays the soft overload tone, doors stay open. Correct load: doors close.
11. Force-close mid-ride, mid-cargo, and on the completion card (swipe away from recents). Relaunch: coherent state each time (see ELEVATOR_QUEST.md, recovery table), car stopped at a floor with doors open, nothing duplicated in the report.
12. Settings: Reduced motion makes rides and doors much shorter and the indicator still steps floor by floor. Quiet removes the ambient bed and keeps clicks and the chime. Mute silences all. Settings survive a restart.
13. Rotate and, on iPad, resize (Split View 1/2, 1/3, Slide Over) during a ride. Layout re-fits, buttons stay at least 64 pt, nothing overlaps.
14. M5 visuals: during a ride the shaft wall scrolls through the door vision panels without stutter (none under Reduced Motion). The landing's painted floor number appears when the doors open. Lifty's display glyph changes with the state and nothing on Lifty moves except the system-check scan line. Released calls fade out rather than snap off.
15. M5 Concept Rescue: miss the same job five times. The TEST RUN board appears over a dimmed cabin, the panel locks, cells respond on touch-down, and the board survives a force-close.
16. Frame truth (Fire): `adb shell dumpsys gfxinfo com.kotharifamily.learning reset`, play two rides, then `adb shell dumpsys gfxinfo com.kotharifamily.learning`. Record janky %, p90, p95. Memory: `adb shell dumpsys meminfo com.kotharifamily.learning` after the cargo bay.
17. Share the playtest report and paste it into the run log.

### D. M7 gate: Floor 15 stabilization and experience (Fire HD 8 first, then iPad)

Nothing in M7 has run on a device yet. The browser screenshots are layout evidence only. Run this on a Fire HD 8 before any child session, then on an iPad. Release build with the playtest report:

```bash
adb devices                                   # the Fire is listed as "device"
EXPO_PUBLIC_DEVICE_LAB=1 EXPO_PUBLIC_PLAYTEST=1 npx expo run:android --variant release
adb shell pm clear com.kotharifamily.learning # fresh save between runs (wipes ALL learners on the device)
```

iPad: `EXPO_PUBLIC_DEVICE_LAB=1 EXPO_PUBLIC_PLAYTEST=1 npx expo run:ios --configuration Release --device`. Fresh save: delete and reinstall.

Each item is PASS / FAIL / NOTE in the run log. Film items 1, 2 and 6 in slow motion where possible. Run section C first (it covers initial load, press latency, doors, travel, the Concept Rescue, cargo controls, Normal / Quiet / Mute, frame truth, memory and kill/resume); this section adds what M7 changed.

0. Initial load: from a cold start (force-stop, then launch), time from tap on the app icon to the cabin on screen. NOTE the seconds. PASS if under about 5 s on the Fire HD 8 and nothing flashes.
1. Arrival taps (the P0 race). Answer a job correctly. Tap other floors rapidly from the moment the car stops until the next job is on screen, about 5 taps per second. PASS: the next job starts with no lit button and no ride, and the report shows one `answer` for the first job and none for taps outside a window (`panel.press ... window: null`). Repeat after a wrong floor: taps while the doors open never become the next try.
2. Help cue on Fire. Miss a job twice. PASS: the help button visibly changes (thicker border, ring, "?" badge, slow pulse) on the Fire screen at arm's length, without relying on a glow. With Reduced Motion: the same cue, still. TalkBack/VoiceView on: "Help is ready" is spoken once.
3. OS reduce motion as the default. Fresh save. Turn on the system "remove animations" setting (Fire OS accessibility; menu names vary), or `adb shell settings put global transition_animation_scale 0` (React Native 0.86.3 reads this global setting; checked in its Android source in this repo's node_modules). Launch. PASS: rides are short and parallax is off. Then choose Normal motion in Settings, relaunch with the OS setting still on: PASS if it stays Normal. Restore with `adb shell settings put global transition_animation_scale 1`. iPad: Settings > Accessibility > Motion > Reduce Motion.
4. Frame callbacks. Leave the game idle at a job for 60 s, then ride. `adb shell dumpsys gfxinfo com.kotharifamily.learning reset` before each phase and `adb shell dumpsys gfxinfo com.kotharifamily.learning` after. NOTE the frame counts: idle should render far fewer frames than travel. The shaft-map car and cabin parallax stay smooth during rides.
5. Landings. Free ride (after a completion, or the developer tools' floor tour) to floors 1, 2, 6, 7, 9, 11, 13, 15, 19, 20. PASS: each landing reads as a different place before the number is read; the painted number and the sign's name are readable at arm's length; nothing flickers as the doors open; the light spill on the cabin floor follows the doors. NOTE frame pacing while the doors open on the busiest landings (6 MACHINE ROOM, 19 SKY BRIDGE).
6. Floor 15 dormant to restored. Play to the finale on a fresh save. PASS: Floor 15 is dark with an unlit sign until the repair, the power ramp is one slow rise with no flash, and after completion the landing is restored. Force-close and relaunch: still restored. Play again and finish: no second "FLOOR 15 POWER RESTORED" unlock in the report.
7. Lifty in the scene. Through a whole run, note where Lifty stands: by the words at a job, toward the panel after CLUE, toward the shaft map in the shaft job, above the crates, above the test run. PASS: Lifty and the bubble never cover the panel, the indicator, the doorway, the shaft map, the cargo bay or the test-run board, and the help button stays in one place. Reduced Motion: Lifty jumps, no slide. NOTE any line that looks too long or too small to read.
8. Success replay. Answer several jobs correctly. PASS: a steady green rim and check on the indicator, the green path on the shaft map hop by hop (all at once under Reduced Motion), the "One quick way" line, and the next job within about 2 s for routine jobs (stretch and the route a little longer). After a wrong floor: no replay. Tap during a replay: nothing answers the next job (see item 1). In the shaft job, choose the floor on the shaft map: Lifty says "You found it on the shaft map".
9. Recovery. Force-close during a replay, during the test run, and mid-ride. PASS: coherent state each time, nothing duplicated in the report. (Content-change and save-failure recovery are covered by tests; they cannot be provoked on a device without a special build.)
10. Rotate (and on iPad resize through Split View 1/2, 1/3 and Slide Over) at a job, in the cargo bay and during a replay. PASS: layout re-fits, buttons stay at least 64 pt, Lifty keeps clear of everything above. In a cabin under 400 pt wide during cargo, Lifty's band covers the indicator: that is the one accepted exception.
11. Memory after a full mission: play from wake to the completion card, then `adb shell dumpsys meminfo com.kotharifamily.learning`. Record TOTAL PSS next to the section C numbers.
12. Share the playtest report and paste it into the run log with the item results.

### E. Art gate (Fire HD 8 first): before any floor beyond the proof floors gets art

Nothing about production art has run on a device. The art memory budgets in docs/ART_ASSET_SPEC.md are arithmetic. Measure them with the development calibration art (same sizes as the production spec) in a release build that includes the developer tools:

```bash
EXPO_PUBLIC_DEV_TOOLS=1 EXPO_PUBLIC_PLAYTEST=1 npx expo run:android --variant release
```

In the developer tools' Art section choose Calibration art, then:

1. Memory: free ride to floors 15, 9, 20, 13, 7 and back, then `adb shell dumpsys meminfo com.kotharifamily.learning`. Record TOTAL PSS and Graphics against the same walk with Vectors only. PASS: the difference stays under the cabin budget plus two landings (about 32 MB) and does not grow on a second walk.
2. Decode: ride to a floor with art. PASS: the art is on screen when the doors open (it loaded during the ride), no vector flash; NOTE any frame over 32 ms as the doors open (`dumpsys gfxinfo`).
3. Lifty poses: answer, miss, ask for help. PASS: pose changes never flash the vector figure (the cache holds the poses).
4. Motion: doors opening on Floors 9 and 20 (moving pieces, parallax settle). PASS: no dropped-frame burst; with Reduced Motion on, nothing moves and the hover stops.
5. Leave a job idle 60 s with the hover running. NOTE UI-thread frames (`dumpsys gfxinfo`): the hover is the only loop and must not keep the GPU busy at a full frame rate cost.

Record the results in the run log. Until this passes, only the proof floors (cabin, Lifty, 15, 9, 20, 13, 7, objects) may get art.

M8.1 (D158): the owner approved twelve illustrated landings (1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20), their props and all six Lifty poses before this gate ran, so a production build now draws them. The gate is overdue: run items 1 to 5 again with Production art (not only Calibration art), walking every floor with art, and record the numbers.

### F. M8.1 checks (Fire HD 8 first, then iPad)

Nothing in M8.1 has run on a device. Release build with the playtest report, as in section D.

1. Readability at arm's length: Lifty's words (20 to 24 pt), a reading note and its instruction, the cards, the DIRECTORY plate and the directory's names. PASS: readable without leaning in; NOTE any box that scrolls and whether the "more below" arrow is noticed.
2. DIRECTORY: open it during a job, a hall call and free ride. PASS: the sheet lists all twenty floors with YOU ARE HERE on the car's floor, Back closes it, a floor press rides and puts it away, and the job is unchanged. The plate never covers the panel or Lifty after rotating. With TalkBack or VoiceOver: "Building directory", then each row as "Floor N, name".
3. Landing play during a job: start a "calls going down" job (the car waits at Floor 20; the developer tools' `calls-top` jump in a release build with the tools) and tap the golf ball. PASS: it putts at once (film it: tap to first motion, the browser measured about 50 ms in the page), drops in, the flag flutters, the ball comes back, and the job is unchanged (no NEXT JOB, no Lifty line). Repeat on other floors during a math job. NOTE whether the first discovery touch in a free ride stalls (the browser build stalls about 1.2 s there with production art; the cause is not found).
4. Sound: a native build plays the synthesized placeholders until the generated pack is approved (D162). After approval, repeat section C items 2, 3, 6 and 7 by ear and on video, tap twenty landing things quickly (no stacked or late sounds), and record memory with the pack loaded (about 30 more players).


### B. iPad

1. Install: `npm run lab:ios:release` on a physical iPad. Diag says release build.
2. Orientation: same as A2 in portrait and landscape.
3. Multitasking: Split View at 1/2 and 1/3 width, Slide Over, and Stage Manager free resizing (if the iPad supports it). Resize continuously while the car moves and while dragging. Layout re-fits every time. The narrow-window banner appears at small sizes. Nothing crashes. Record window sizes from Diag at each step.
4. Repeat A3-A11 (A12-A13 are Android commands: use Xcode Instruments > Animation Hitches and Allocations instead if time allows).
5. Apple Pencil: draw and trace with the Pencil. Strokes follow the tip. Palm resting on the screen does not break drawing badly (note behavior, no fix expected yet).
6. Silent switch / Control Center mute: note whether chimes play. The lab sets `playsInSilentMode: true`. The product decision for real gameplay is still open.

### What counts as a FAIL that reopens the Skia / React Native decision

Measured on a Fire HD 8 release build, after one round of obvious fixes (reducing layers, glow, or redraw scope):

- Scene under load (A4) below 45 fps average, or more than 10% slow frames (> 33 ms), or any frame over 250 ms during ordinary use.
- Press feedback visibly late: more than about 3 display frames (~50 ms) from touch to visible change in slow-motion video, or any tap that shows no feedback at all.
- Drag or draw visibly trailing the finger by more than a fingertip's width at normal speed, or broken strokes.
- Short effects that drop, clip, or start more than about 150 ms after the tap by ear or video, with no working pool or format alternative.
- Lost SQLite data after force-stop, or a write that blocks touch feedback.
- Crash or out-of-memory during the checklist, or PSS high enough that a real scene with art would not fit (judge against the device's RAM).
- iPad layout that cannot survive resize or portrait without restart or broken controls.

Results inside these limits but marginal are not a fail. They set the art and animation budget instead.

If a fail happens, record it, capture the Diag report and gfxinfo, and stop gameplay work until the decision is reviewed. Options in order: reduce scene cost, move effects to pre-rendered sprites, isolate the renderer (layout math and engine are already framework-free), and only then evaluate the Godot fallback from ARCHITECTURE.md.

### Run log template

```
Date:
Device / OS / ABI:
Build: release / debug, commit:
A3 idle:        fps   p95   slow
A4 load:        fps   p95   worst   press->frame
A5 rapid tap:   taps/s   sqlite write   UI p95
A7 drag:        pass/fail, notes
A8 draw:        pass/fail, notes
A9 audio:       WAV pool / AAC pool / single: notes, slow-mo frames
A10 persist:    launches before/after, events before/after, journal
A12 memory:     PSS after scene / after draw
A13 gfxinfo:    janky %, p90, p95
iPad resize:    pass/fail, sizes tested
Floor 15:       press->visible (slow-mo frames)   press->click (by ear/slow-mo)   rapid press: pass/fail
                doors smooth: y/n   travel smooth: y/n   indicator in step: y/n   chime after stop: y/n
                cargo drag: pass/fail   force-close x3: pass/fail   gfxinfo janky % / p90 / p95   PSS
                playtest report attached: y/n
Verdict:
```
