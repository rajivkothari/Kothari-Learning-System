# Phase 2 validation record

All selected production candidates are **PENDING OWNER APPROVAL**. Browser-only review; no physical-device or in-engine art validation.

- Candidate checker: 19 files matched saved dimensions and SHA-256; all 18 isolated sprites had real transparent pixels. Every selected master matched its original generator output byte-for-byte. Approval remained pending on every candidate.
- Chromium composition review: six Fire layout/state combinations (landscape/portrait × repair/powered/delivery), all images decoded, 19 contact-sheet tiles, review controls worked, no page errors. Export canvases are 960 × 600 and 600 × 960. Contact-sheet canvas is 1300 × 1819. Saved outputs were visually inspected.
- Source preservation: `git diff` against baseline `169c8b9aaf27303a17dcec36c4e86e1c504f10b5` was empty for `src/`, `content/`, `assets/themes/`, `package.json` and `package-lock.json`. No production art/audio manifest, approved media, learning or gameplay changed.
- `npm run verify`: typecheck and lint passed. Jest ran 155 suites / 2,021 tests: **153 suites / 2,019 tests passed; two runtime-manifest freshness tests failed**. The chained command therefore exited 1 before its Fire scan.
- Freshness diagnosis: both committed runtime JSON files exactly match the current generator output. Their working copies match after CRLF→LF normalisation; the working bytes alone differ. Local `core.autocrlf` returned `true`. These are checkout-format failures; production manifests were not rewritten to clear them. The checker records the per-file comparisons in `asset-validation.json`.
- `npm run check:fire` was run separately and passed: no prohibited Google/Play dependencies found.
- Initial sandbox attempts: Chromium's localhost navigation was denied and Jest could not resolve the sandbox temporary-cache path. Both were rerun outside that restriction. The final browser review completed; the final full verification reached the two format failures described above.

Reproduce the review with `node review/tower-rescue/phase2-v01/serve-review.cjs`, then `node review/tower-rescue/phase2-v01/capture-review.cjs`. `validate-pack.cjs` checks the exported pack without changing production sources. `export-assets.cjs` preserves existing exports and refuses to overwrite them.

Evidence: `review/tower-rescue/phase2-v01/browser-review.json`, `asset-validation.json`, candidate `manifest.json`, and exact generation prompts. The local full verification log remains in ignored `.expo/tower-phase2-verify.log`.
