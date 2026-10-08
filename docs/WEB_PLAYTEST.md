# Web Playtest

A desktop-browser build of Floor 15 for playing, inspecting, resetting and screenshotting. It is a playtest and development target only. iPad and Fire remain the shipping targets, and nothing measured in a browser is a device result.

## Start it

```bash
npm install
npm run web:playtest          # dev server; open http://localhost:8081 in Chrome
```

The page opens a launcher: ELEVATOR QUEST (the game as a child plays it, default learner), DEVICE LAB, DEVELOPER TOOLS. Reload the page to switch. The URL can skip the launcher: `?open=quest`, `?open=devtools`, `?open=lab`.

`scripts/web.js` sets the build flags (`EXPO_PUBLIC_DEV_TOOLS=1`, `EXPO_PUBLIC_PLAYTEST=1`, `EXPO_PUBLIC_DEVICE_LAB=1`) and runs `scripts/prepare-web.js`, which copies two WebAssembly files from installed packages into `public/` (gitignored): `canvaskit.wasm` (Skia) and `sql-wasm-browser.wasm` (SQLite). Extra arguments go to Expo, for example `npm run web:playtest -- --port 8082`.

## Static export

```bash
npm run web:export            # -> dist-web/ (static files, developer tools included)
npm run web:serve             # serves dist-web on http://localhost:8090
```

`dist-web/` can be served by any static file server. Requirements: serve `.wasm` as `application/wasm` (most servers do; `scripts/serve-web.js` does). No cross-origin isolation headers are needed (COOP/COEP), because the build uses neither expo-sqlite's web worker nor SharedArrayBuffer. Unknown paths can fall back to `index.html`. The export is not deployed anywhere.

## Another device on the same network

Development only, nothing in the game changes.
- Dev server: Expo serves on the LAN by default. On the tablet open `http://<computer's LAN IP>:8081`.
- Export: `npm run web:serve -- --lan` prints the LAN address (port 8090).

Plain `http://` on a LAN IP is not a secure context, so Copy in the report may be blocked (Save .txt still works). The one-save-per-browser rule below still holds there. Each browser keeps its own save. A tablet browser is still not the native app: judge layout and flow there, not performance or audio.

## Architecture

The native layering is unchanged:

```
pure engine -> mission runtime -> SqlDatabase interface -> platform adapter -> theme / presentation
```

Platform differences live only in files resolved by Metro's platform extensions (`*.web.ts`). Game and engine code has no `Platform.OS === 'web'` checks.

| Adapter | Native | Browser |
|---|---|---|
| `src/platform/startApp` | register the app | load Skia's CanvasKit, then register |
| `src/persistence/openAppDatabase` | expo-sqlite file | sql.js + IndexedDB |
| `src/themes/elevator-quest/audio/audioGate` | open | opens on the first tap or key press |
| `src/platform/textExport` | share sheet | clipboard copy, `.txt` download |
| `src/platform/environment`, `launchParams`, `reload` | OS description, none, none | user agent, URL query, page reload |
| `src/dev/device-lab/storage/labDb` | expo-sqlite probe | "devices only" |

## Persistence in the browser

`src/persistence/sqljsDatabase.ts`: real SQLite compiled to WebAssembly (sql.js 1.14.2) running in memory, implementing the same `SqlDatabase` interface as expo-sqlite and node:sqlite. Same SQL, migrations, constraints and append-only triggers. After every committed transaction the whole database image is saved to IndexedDB (`kothari-learning` / `sqlite-images`, key = database name).

Why not expo-sqlite on the web: its docs (checked 2026-10-06, page dated 2026-08-21) call web support "alpha and may be unstable", and it needs `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy` headers for SharedArrayBuffer. That means special server configuration and no plain-http access from a tablet on the LAN. The scratch build in M5 also had to patch its transaction behaviour.

Differences from native, all deliberate:
- One connection. Transactions run one at a time, and reads wait for a running transaction, so nothing reads uncommitted rows.
- A transaction resolves only after the image is saved. If saving fails, memory is restored from the last saved image and the transaction rejects: committed always means durable.
- No WAL (there is no shared file system). The saved image is the database.
- The whole image is written on each commit. Fine for a playtest (a few hundred KB), not a design for large histories.
- The newest tab wins (D146): opening or reloading the game in a tab takes the save over, and any older tab of the same browser stops at once with "The game is open in another tab" and a PLAY HERE button (which reloads it and takes the save back). An older tab never overwrites a newer one: if the notice did not reach it, its next save is refused in the same IndexedDB transaction that would have written it.
- The save belongs to that browser profile. Clearing site data deletes it. Nothing is uploaded.

Tested in Node with the same adapter and an in-memory store (`src/runtime/webPersistence.test.ts`): save and resume after a reload, history, unlocks, settings and completion across a reload, learner isolation, idempotent commands, append-only triggers, rollback, and failed saves. `npm run web:e2e` repeats the important parts with IndexedDB in a real Chromium.

## Developer tools

Open DEVELOPER TOOLS. The game runs on the left in a simulated device viewport, the tool panel is on the right ("Hide" collapses it). Everything acts on test learners only (`learner-test-a`, `learner-test-b`, `fresh-learner`). The default learner (`learner-1`, used by ELEVATOR QUEST) is never written by the tools.

Viewport simulator: Fire HD 8, iPad 10.9/11-inch, iPad mini, large iPad (12.9/13-inch), narrow window (Split View 1/3), half window (1/2), free resize, with LANDSCAPE / PORTRAIT where it applies. The game receives the simulated width and height and runs its real layout (`src/presentation/viewport.tsx`). Nothing is scaled with CSS. A preset larger than the browser window scrolls. The sizes are approximate logical sizes from specifications: confirm a device's real window with the Device Lab Diag screen. Settings and report sheets are modals and cover the whole page, not just the frame.

Panel sections:
- Learner: choose a test profile, Reset this learner, Fresh learner. A reset never deletes anything (learning history is append-only): the profile moves to a new empty id `<profile>-g<n>`. Inspect shows unlocks, settings, the placement assumption, skill levels, attempt and completion counts, and the last attempt (assistance, misses, after Concept Rescue or not).
- Mission: Start / resume, Reset current mission (a new instance), jumps, and the completion state. Since M8 (D154) a jump names a step by id, and for a pool step the member to show: the jump searches seed bases (`dev:<jump>`, then `dev:<jump>:1`, ...) until the step's pool picks that member, as play would (`jumpPosition` in `devtools/floor15Tools.ts`). Jumps: start, practice, shaft (the shaft map), bridge-up, bridge-down (through ten), orders, make-ten, doubles, near-doubles, two-part, same-way, express, lamps, lamps-next, fives, ten-jump, teen, ten-and-ones, start-floor, meter, meter-far, compare, order, stretch (the beacon), start-far, two-part-wide, ten-and-ones-down, add-teen, route, cargo, finale.
- Reading jumps (M8, D155): read-touch (read-1, the Floor 13 cart note, every thing on the art), read-ride (read-1, a ride note), read-order (read-2, what comes first), read-touch-cards (read-3, the lobby plant note: the plant and bench are not on the art, so the job answers with cards) and read-cards (read-4, a word in context). A jump can name the item it wants, and the seed search keeps a seed only when the step generates that item. Every mission step has at least one jump (`devtools.test.ts` checks it).
- Help: next help, misses up to the visual tool, misses up to Concept Rescue. Thresholds are read from the policy data.
- Concept Rescue: enter it (general explanation, or misconception-specific), count the test run, answer it, and a readout of the parallel example, its answer (shown to the developer only), the focus and the phase. Watch the return to the real job and the last-attempt record.
- Access and sound: Normal / Reduced motion, Normal / Quiet / Mute. These call the same settings path as the in-game sheet and persist for that learner.
- Art (development, visual production milestone): Production art (approved, reviewed, bundled art only), Review (approved art plus art pending a person's review, which is never in production bundles; rejected art never), Vectors only, or Calibration art (test patterns from `assets/dev/art/`, not game art). Toggles for cabin art and parallax; overlays for the doorway crop (doorway, the landing image's bounds, the safe core), the safe zones (sign and object slot; the floor-number zone only on vector landings, D136) and hit boxes; Floor 15's landing as dormant or restored (display only, the mission is unchanged); a Lifty pose (neutral, help, thinking, success, concerned, quiet; display only; it shows a pose's art even when the neutral pose has none, which play never does, D141); Inspect cabin pieces (draws whatever cabin parts exist over the vector cabin; Review and Production show the illustrated cabin only when all six required parts exist, D142); landing buttons for floors 6, 7, 9, 13, 15, 20 (free ride, nothing recorded). A line lists any image that failed to load (its vector shows). The plain game (no tools panel) draws the approved production art by default (the illustrated cabin and Lifty's neutral pose, D145) and opens with another art set from the URL: `?open=quest&art=review` (approved art plus candidates pending review) or `?open=quest&art=vector` (the A/B partner); production child builds ignore it (a stub, D144). URL parameters do the same in the tools: `&art=calibration|review|vector|production`, `&overlay=doorway,safe,hitboxes`, `&floor15=dormant|restored`, `&liftyPose=help`, `&parallax=off`, `&cabinArt=off`, `&inspect=cabin`. Reduced Motion (Access and sound) stops parallax, moving pieces and the hover.
- Visual review: one button per representative state (see Screenshots).
- Inspect: refresh, and Open playtest report.
- Browser save: wipe this browser's whole save (all learners, including the default one), then reload.

What the tools write, exactly:
- Jumps (`src/runtime/devSeed.ts`, `startMissionAt` in the engine) write a mission checkpoint only. No attempts, completions, progression or unlocks.
- Simulated misses go through `runtime.submit` like taps. A miss changes the checkpoint only. An attempt is written when the item is resolved, by whoever resolves it.
- The completion state switches to a fresh learner and presses 15 on the finale. That writes one real completion record and the rank unlocks, on that test learner.
- The free-ride scenarios (M7.1: exploration, Engineer Log, floor tour) do the same completion first, on a fresh test learner. The log scenarios then seed discoveries with `seedDiscoveries` (`devtools/floor15Tools.ts`): world-memory keys only, test learners only, with the game unmounted. Never a learning record.
- Tests: `src/themes/elevator-quest/devtools/devtools.test.ts` (real learners refused, zero learning events from jumps and misses, reset touches one profile, isolation).

Jumps open a mission mid-way, so Lifty greets with "Welcome back." That is the real resume line (shortened in the M7.2 correction round so the job line after it fits the bubble on Fire with the help button showing).

## Screenshots

```bash
npm run web:export
npm run web:screenshots       # -> web-screenshots/*.png (gitignored)
```

`scripts/web-screenshots.js` serves `dist-web`, opens a fresh browser context per capture (fresh save), drives the real game to a scenario through `?open=devtools&scenario=<id>&preset=<id>&orientation=<o>[&motion=reduced]`, waits for the panel to report `READY scenario:<id>`, and photographs the device frame. Captures: iPad landscape (start, selected, wrong floor, Concept Rescue, cargo, the in-world completion before / during / after, the CLUE state, eight landings, routine, stretch and cargo success replays, the five explorable landings before a touch / mid-reaction / inspected, the Engineer Log empty / partial / complete, a hall call offered and taken), iPad portrait (idle, Concept Rescue, cargo, replay, Floor 15, an inspected landing, the log), narrow window (idle, cargo, replay, a landing, an inspected landing, the log), Fire HD 8 landscape (the CLUE state, help offered, a landing, an explorable landing, the log, a hall call, after completion) and Fire HD 8 with Reduced Motion (wrong floor, help offered, replay, a still hall call). `--only <text>` filters, `--out <dir>` changes the folder. Without Chrome installed, point `CHROMIUM_PATH` at a Chromium binary (in the cloud container: `/opt/pw-browsers/chromium`).

Scenario ids: start, idle, selected, traveling, wrong-floor, clue, help-offered (M7: two misses, the offer showing), shaft-map, visual-scaffold, count-strategy, stretch, rescue-generic, rescue-misconception, rescue-counting, rescue-not-next (a test-run count that skips ahead: Lifty's Thinking line, D147), rescue-ask, rescue-return, cargo, overload, finale, completion, replay-routine, replay-stretch, replay-cargo (M7: a correct answer through the real director, photographed once every replay step shows), floor-1 to floor-20 (a free ride on a fresh test learner to that floor's landing; since M7.1 free ride exists only after Floor 15, so the scenario completes the mission first and Floor 15 shows restored), floor-15-dormant (completion, before: arrived at the dormant floor), completion (during: restored, panel sweep), completion-after (free ride, rank, clipboard), hall-call and hall-call-ride, explore-N, explore-N-reaction and explore-N-after for the explorable floors (five in M7.1, twelve since M8), log-empty, log-partial and log-complete (M7.1). Correction round: replay-routine, replay-stretch, replay-cargo and replay-after-rescue wait until the success settles on NEXT JOB; success-arrival (the doors open on the repair kit before Lifty speaks), collect-kit, objective-toolbox, objective-parts, objective-crew, objective-dock, beacon (rode to the beacon's floor on the beacon job) and wrong-stretch (no crew here). The scenarios press NEXT JOB themselves where they need the next job (test learners only). Corrections (D149): correction-ready (a wrong floor, the move on the shaft map, Lifty's cue, LET'S COUNT), correction-board (LET'S COUNT pressed, two floors counted on the learner's own job), correction-fresh (the fresh job after a correction), underload (the encounter's load meter with the room left outlined). rescue-generic, rescue-counting, rescue-not-next, rescue-ask, rescue-return and replay-after-rescue now show the correction (the practice job's first miss); rescue-misconception shows the encounter's test run (five misses sharing a tag); clue, visual-scaffold and count-strategy ask for the help without a miss; help-offered reaches the offer on the fresh job after a correction. The wider arithmetic (D148): orders, orders-mismatch (one order loaded), replay-orders, two-part, two-part-leg (the first part ridden, the second to go, D152), two-part-wrong (both parts ridden the same way), start-floor, replay-start-floor, meter, meter-set (a count set, before GO), meter-wrong (one floor too many, before the ride back), replay-meter, express, express-count (the counting clue a stop apart), replay-express, and test runs rescue-two-part (into the second part), rescue-meter, rescue-orders and rescue-express. The screenshot script captures them on iPad landscape, and meter-set, orders and express-count on Fire, iPad portrait, Split View 1/3 and Slide Over. It captures the four correction scenarios on iPad landscape, Fire landscape and iPad portrait (`--only correction-`), and the illustrated landings pending review (D150) with `art=review` for floor-1, floor-7, floor-9, floor-13, floor-15-dormant, floor-15 and floor-20 on iPad landscape, Fire landscape, iPad portrait and Split View 1/3 (`--only landing-`). Split View 1/3 draws the art too, in a doorway about 31 by 37 points where the sign cannot be read (D152); only the 2/3 split view falls back to vectors. The e2e play-through answers one job from each step (`E2E_VERBOSE=1` prints each action); since M8 a pool step shows one of its members, so a single run sees a subset of the job kinds (it reads the lamp pattern, the ten-floor express and the calls from Lifty's line). Same build and scenario give the same items (jumps use a fixed seed base).

M8 scenarios (D154 to D156):
- New math jobs, each as the job, its success replay settled on NEXT JOB, and its correction board with a count under way: `m8-<id>`, `replay-m8-<id>` and `rescue-m8-<id>` for `lamps` (a gap in a pattern of 2s), `fives`, `ten-and-ones`, `teen` (from the bottom), `compare` (two calls), `order` (three calls), `same-way` (a two-part trip the same way twice) and `doubles` (two equal orders).
- Landing play, after a completed mission on a fresh test learner: `explore-N`, `explore-N-reaction` and `explore-N-after` for every explorable floor (1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20); `touch-N-<spot>` and `touch-N-<spot>-reduced` (every spot mid-reaction, normal and under Reduced Motion, for example `touch-20-ball`, `touch-2-toolbox`, `touch-17-book`); `golf-rolling`, `golf-sunk` (in the cup, the cup's ring), `golf-reset` (the ball back at rest) and `golf-reduced`; `toolbox-open` and `toolbox-shut`; `archive-card` (the tower book's card); `touch-between-jobs` (the lobby gear turns during a hall call: no discovery, Lifty stays on the call); `log-complete` now lists twelve places.
- Reading jobs (D155), nothing answered: `read-touch`, `read-ride` and `read-cards` (the note open in the answer window) and their `-folded` versions (the note folded on what answers it: the landing's things, the panel, the cards); `read-touch-cards` (the lobby note answered with cards); `read-clue` (CLUE lights the key sentence); `read-show-me` (one miss, then CLUE and SHOW ME: the thing glows, note folded). The screenshot script captures them on iPad landscape and Fire, plus portrait, narrow and Reduced Motion variants, and the six new landings (2, 5, 6, 11, 17, 18) with vectors and with `art=review`, the toolbox open and shut, and the golf ball rolling and at rest.
- The e2e play-through answers the reading jobs too: it recognises the note from its sentences and takes the answer from `content/packs/reading.json`, never from the screen. Before an answer it checks that nothing outside the note and the cards names the answer and that nothing glows; it folds the note, answers by touch (`landing-touch-<id>`), card (`reading-choice-<value>`) or the panel, uses CLUE once (exactly one "Clue: " line), and misses one note on purpose (the same note returns, CLUE offered). With `art=review` it touches the Floor 13 thing and checks that the lobby note uses cards.
- The six new landing backgrounds and the props draw only with `art=review` (`?open=quest&art=review`, or the tools' Review art set), like D150's.

Browser: playwright-core (a dev dependency, no browser download). It uses `$CHROMIUM_PATH`, else Playwright's browsers, else an installed Google Chrome or Edge.

Art captures (visual production milestone): files named `art-*` use the calibration art with the overlays on, `art-clean-*` without overlays, across iPad landscape, Fire, iPad portrait and the narrow window; `*-building-directory` captures open the directory. The calibration patterns check layer order, crops, pivots, touch areas and fallbacks; they say nothing about how the final art will look. `review-*` captures show art pending a person's review in the real game, `vector-*` the same states with vectors only (the A/B pair), `lifty-size-<calibration|review>-*` the neutral pose at Lifty's real sizes (iPad, Fire, Split View 1/3 and the Slide Over preset: about 119, 108, 105 and 88 pt of visible robot), and `pose-<pose>-*` each Lifty pose in its moment (D147). `node scripts/lifty-board.js` writes web-screenshots/lifty-character-board.png: every live pose beside the neutral master at source size with the master's guides and measurements, over the master's silhouette, and at about 120, 105 and 90 pt.

This is visual QA, not pixel regression testing.

## Browser audio

Browsers block sound until the page receives a user gesture. The audio engine stays the same semantic engine: until the first click, tap or key press it drops one-shot sounds and remembers which loops should be running, then starts them. In practice the first tap (for example DOOR OPEN) unlocks sound, and that first tap's click may be silent. The playtest report notes when audio is still waiting. Native apps play immediately. Browser audio latency, mixing and loudness say nothing about the device: judge sound on iPad and Fire.

## Playtest report

Long-press POWER RESTORATION for 2 seconds, use Settings > Playtest report, or Inspect > Open playtest report in the tools. On the web: Copy (clipboard) and Save .txt (download). The report names the browser and, in the tools, the simulated viewport. Nothing is sent anywhere.

## Start over (play Floor 15 again)

Settings > Testing (adults) > Start over (clear progress), then press again to confirm. The game opens fresh, at "Press DOOR OPEN to wake", and stays fresh after a reload. Nothing is deleted (learning history is append-only): the device's learner moves to a new id (`learner-1-r2`, `-r3`, ...) and the old save stays in the browser's database, unread. Motion and sound settings carry over. Playtest builds only (this browser build, development builds, release builds made with `EXPO_PUBLIC_PLAYTEST=1`), never a production child build (D143). To clear the whole browser save instead, use the developer tools' "Wipe this browser save".

## Input

Mouse clicks and touchscreens both work through the same press handlers. Nothing in the game needs hover. Drag works with a mouse. Developer tools use plain buttons.

## Known limitations

- Not a performance, touch-latency, audio, or display-quality check. Fire and iPad devices decide those.
- Skia renders through CanvasKit (WebGL) in the browser. Text and shapes can differ slightly from native.
- react-native-web prints deprecation warnings for some style props (shadow, textShadow, pointerEvents). Harmless in this build.
- The Device Lab's storage probe does not run in the browser.
- Modals cover the whole page, not just the simulated frame.
- `adjustsFontSizeToFit` is native-only. Since M7 Lifty's text size is chosen up front to fit the bubble (`fitLine`, tested for every line of a full playthrough at every size), so lines no longer end in "…" in the browser. The estimate uses an average glyph width: a device font that runs wider than the estimate is caught by the native shrink, the browser has no such fallback.
- In the narrowest windows (Split View 1/3, Slide Over) the cargo bay shows about one row of crates per side and scrolls. During cargo there, Lifty's band sits at the top of the cabin, over the indicator (the one documented exception, DECISIONS D112). Usable, cramped. Watch it on a real iPad in Split View.
- One playing tab per browser profile: the newest (D146).
- The developer tools are only in the web playtest build and development builds. Production child builds contain none of it (`npm run check:bundle`).
