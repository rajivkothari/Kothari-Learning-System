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

Plain `http://` on a LAN IP is not a secure context, so: the second-tab guard (Web Locks) is skipped, and Copy in the report may be blocked (Save .txt still works). Each browser keeps its own save. A tablet browser is still not the native app: judge layout and flow there, not performance or audio.

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
- One tab at a time: a second tab is refused with a message (Web Locks, secure contexts only).
- The save belongs to that browser profile. Clearing site data deletes it. Nothing is uploaded.

Tested in Node with the same adapter and an in-memory store (`src/runtime/webPersistence.test.ts`): save and resume after a reload, history, unlocks, settings and completion across a reload, learner isolation, idempotent commands, append-only triggers, rollback, and failed saves. `npm run web:e2e` repeats the important parts with IndexedDB in a real Chromium.

## Developer tools

Open DEVELOPER TOOLS. The game runs on the left in a simulated device viewport, the tool panel is on the right ("Hide" collapses it). Everything acts on test learners only (`learner-test-a`, `learner-test-b`, `fresh-learner`). The default learner (`learner-1`, used by ELEVATOR QUEST) is never written by the tools.

Viewport simulator: Fire HD 8, iPad 10.9/11-inch, iPad mini, large iPad (12.9/13-inch), narrow window (Split View 1/3), half window (1/2), free resize, with LANDSCAPE / PORTRAIT where it applies. The game receives the simulated width and height and runs its real layout (`src/presentation/viewport.tsx`). Nothing is scaled with CSS. A preset larger than the browser window scrolls. The sizes are approximate logical sizes from specifications: confirm a device's real window with the Device Lab Diag screen. Settings and report sheets are modals and cover the whole page, not just the frame.

Panel sections:
- Learner: choose a test profile, Reset this learner, Fresh learner. A reset never deletes anything (learning history is append-only): the profile moves to a new empty id `<profile>-g<n>`. Inspect shows unlocks, settings, the placement assumption, skill levels, attempt and completion counts, and the last attempt (assistance, misses, after Concept Rescue or not).
- Mission: Start / resume, Reset current mission (a new instance), jumps to mission start, practice, shaft map, stretch, route to the dock, cargo bay, finale, and the completion state.
- Help: next help, misses up to the visual tool, misses up to Concept Rescue. Thresholds are read from the policy data.
- Concept Rescue: enter it (general explanation, or misconception-specific), count the test run, answer it, and a readout of the parallel example, its answer (shown to the developer only), the focus and the phase. Watch the return to the real job and the last-attempt record.
- Access and sound: Normal / Reduced motion, Normal / Quiet / Mute. These call the same settings path as the in-game sheet and persist for that learner.
- Visual review: one button per representative state (see Screenshots).
- Inspect: refresh, and Open playtest report.
- Browser save: wipe this browser's whole save (all learners, including the default one), then reload.

What the tools write, exactly:
- Jumps (`src/runtime/devSeed.ts`, `startMissionAt` in the engine) write a mission checkpoint only. No attempts, completions, progression or unlocks.
- Simulated misses go through `runtime.submit` like taps. A miss changes the checkpoint only. An attempt is written when the item is resolved, by whoever resolves it.
- The completion state switches to a fresh learner and presses 15 on the finale. That writes one real completion record and the rank unlocks, on that test learner.
- The free-ride scenarios (M7.1: exploration, Engineer Log, floor tour) do the same completion first, on a fresh test learner. The log scenarios then seed discoveries with `seedDiscoveries` (`devtools/floor15Tools.ts`): world-memory keys only, test learners only, with the game unmounted. Never a learning record.
- Tests: `src/themes/elevator-quest/devtools/devtools.test.ts` (real learners refused, zero learning events from jumps and misses, reset touches one profile, isolation).

Jumps open a mission mid-way, so Lifty greets with "Welcome back. We were in the middle of a job." That is the real resume line.

## Screenshots

```bash
npm run web:export
npm run web:screenshots       # -> web-screenshots/*.png (gitignored)
```

`scripts/web-screenshots.js` serves `dist-web`, opens a fresh browser context per capture (fresh save), drives the real game to a scenario through `?open=devtools&scenario=<id>&preset=<id>&orientation=<o>[&motion=reduced]`, waits for the panel to report `READY scenario:<id>`, and photographs the device frame. Captures: iPad landscape (start, selected, wrong floor, Concept Rescue, cargo, the in-world completion before / during / after, the CLUE state, eight landings, routine, stretch and cargo success replays, the five explorable landings before a touch / mid-reaction / inspected, the Engineer Log empty / partial / complete, a hall call offered and taken), iPad portrait (idle, Concept Rescue, cargo, replay, Floor 15, an inspected landing, the log), narrow window (idle, cargo, replay, a landing, an inspected landing, the log), Fire HD 8 landscape (the CLUE state, help offered, a landing, an explorable landing, the log, a hall call, after completion) and Fire HD 8 with Reduced Motion (wrong floor, help offered, replay, a still hall call). `--only <text>` filters, `--out <dir>` changes the folder. Without Chrome installed, point `CHROMIUM_PATH` at a Chromium binary (in the cloud container: `/opt/pw-browsers/chromium`).

Scenario ids: start, idle, selected, traveling, wrong-floor, clue, help-offered (M7: two misses, the offer showing), shaft-map, visual-scaffold, count-strategy, stretch, rescue-generic, rescue-misconception, rescue-counting, rescue-ask, rescue-return, cargo, overload, finale, completion, replay-routine, replay-stretch, replay-cargo (M7: a correct answer through the real director, photographed once every replay step shows), floor-1 to floor-20 (a free ride on a fresh test learner to that floor's landing; since M7.1 free ride exists only after Floor 15, so the scenario completes the mission first and Floor 15 shows restored), floor-15-dormant (completion, before: arrived at the dormant floor), completion (during: restored, panel sweep), completion-after (free ride, rank, clipboard), hall-call and hall-call-ride, explore-N, explore-N-reaction and explore-N-after for floors 5, 7, 15, 17 and 18, log-empty, log-partial and log-complete (M7.1). Same build and scenario give the same items (jumps use a fixed seed base).

Browser: playwright-core (a dev dependency, no browser download). It uses `$CHROMIUM_PATH`, else Playwright's browsers, else an installed Google Chrome or Edge.

This is visual QA, not pixel regression testing.

## Browser audio

Browsers block sound until the page receives a user gesture. The audio engine stays the same semantic engine: until the first click, tap or key press it drops one-shot sounds and remembers which loops should be running, then starts them. In practice the first tap (for example DOOR OPEN) unlocks sound, and that first tap's click may be silent. The playtest report notes when audio is still waiting. Native apps play immediately. Browser audio latency, mixing and loudness say nothing about the device: judge sound on iPad and Fire.

## Playtest report

Long-press POWER RESTORATION for 2 seconds, use Settings > Playtest report, or Inspect > Open playtest report in the tools. On the web: Copy (clipboard) and Save .txt (download). The report names the browser and, in the tools, the simulated viewport. Nothing is sent anywhere.

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
- One tab at a time per browser profile.
- The developer tools are only in the web playtest build and development builds. Production child builds contain none of it (`npm run check:bundle`).
