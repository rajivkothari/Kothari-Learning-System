# Tower Rescue expansion art — validation

**PENDING OWNER APPROVAL.** All nine new candidate exports and their nine generated masters await owner review. Contact sheet, composed mockups and reading views are review artifacts only. No new audio or compact replacements were generated.

## Results from this task

- Candidate inspection: nine PNG exports, all with real transparent pixels. Dimensions, alpha-under-32 axle pivots, alpha-32 visible bounds, bytes and SHA-256 are recorded in the candidate manifest. Their generated masters are retained byte-identically. No painted checkerboard is present; the contact sheet's checkerboard is HTML review chrome.
- Export total: **1,055,153 bytes**. All nine full runtime canvases decode to **4,587,520 bytes (4.375 MiB) RGBA**, calculated as width × height × 4. This is not measured runtime or device memory. Masters remain outside production registration.
- Browser review: Chromium, **16 orientation/state/contact checks**, nine contact tiles, every referenced image decoded, **zero page errors**. Captures use Fire-size logical viewports: 960 × 600 landscape and 600 × 960 portrait. Overview, neutral/powered sample state, four station reading/routing views and zone overlays were exercised. Native reading type stays 22 px; title/choice labels stay 16 px. Questions sit visibly below report instruments in the final reading compositions.
- Visual QA corrected a wrapping gearbox label and a sensor content box extending into its bezel. Reading zones clip/scroll within their faces; long content gets a visible more-below cue. The final gallery is an art review, not an executable game or proposed simultaneous station layout.
- Required `npm run verify`: typecheck and lint passed; **158 suites: 156 passed, two failed; 2,093 tests: 2,091 passed, two failed**. Both failures are runtime-manifest byte-freshness comparisons (`art/runtimeManifest.test.ts` and the audio runtime-manifest test).
- Line-ending diagnosis: `core.autocrlf=true`; both runtime JSON working files contain CRLF. Each **committed Git blob matches the generator's LF output exactly**, and each working file matches after CRLF-only normalisation. The machine-readable evidence is `line-endings-check.json`. No production manifest was rewritten to silence those checks.
- Separate `npm run check:fire` passed: 19 native Android modules scanned; no prohibited dependency found.
- Production source, content and approved art/audio diff remains empty against the engineering baseline. New tracked files belong only to `assets/candidates/tower-rescue-expansion/`, `docs/tower-rescue-expansion-art/` and `review/tower-rescue/expansion-v01/`.

## Limits

Browser only. No physical Fire HD 8 or iPad run, integrated new station art, device performance/memory/touch test, accessibility reader test, child playtest or audio listening test was performed. The D195 layout issue sizes in the handoff come from that inspected decision and the supplied brief, not a fresh live measurement.

The full verification command did **not** pass; the two checkout-line-ending failures above remain. No engineering fix is included in this creative task.

## Review files

- `review/tower-rescue/expansion-v01/contact-sheet.png`
- `mockup-fire-landscape.png`, `mockup-fire-portrait.png`, `mockup-powered.png`
- `sensor-fire-landscape.png`, `sensor-fire-portrait.png`
- `safety-fire-landscape.png`, `safety-fire-portrait.png`
- `inspection-fire-landscape.png`, `inspection-fire-portrait.png`
- `routing-fire-landscape.png`, `routing-fire-portrait.png`
- `review-check.json`: observed browser image/text dimensions and state-check results
- `index.html` and `review.js`: static composition review; no production imports or registration
