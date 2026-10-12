# Tower Rescue — hero direction V01

**PHASE 1 · VISUAL DIRECTION APPROVED — REFERENCE ONLY.** The owner approved this direction for Phase 2 on 2026-10-12, subject to readability, separated moving parts, portrait safety, calm lighting and procedural effects. The separate Phase 2 pieces remain PENDING OWNER APPROVAL. One generated hero direction, a tablet-sized review mockup, and the unchanged game's layout reference. No gameplay, learning, persistence, audio, rendering code, or production manifest is changed.

Creative branch: `codex/tower-rescue-art`. Source baseline: `169c8b9aaf27303a17dcec36c4e86e1c504f10b5`, the D193 documentation commit above the game-feel implementation. The reference was captured by playing the existing developer scenario in Chromium, not by inventing a different game. It diagnosed the freight lift, showed HAS 8 / NEEDS 15, installed +7, and reached the powered state before RUN TEST. The example values are a captured instance, not proposed fixed gameplay content.

## Direction

Treat the room as serviceable equipment. Deep shafts, broad rails, visible motor housings, thick lift-door edges and a recessed receiving socket give the player something tangible to repair. Warm overhead work lights establish depth; cyan is reserved for service hardware and mint for the powered state. The repair console stays calm. Its seated cell and amber RUN TEST body carry the strongest interaction silhouettes.

The robot follows the existing project's white-and-orange mechanical, screen-face language. The full-power hero keeps both lift cars grounded and their doors closed. The lift ride and robot delivery remain the payoff after RUN TEST; showing the package outside beforehand would contradict the sequence.

The illustration is a direction study, with softer light transitions than the repository's strict two/three-band shading guidance. That is a proposed treatment for owner review, not a change to the shared art rules. Production should retain strong value separation and avoid runtime blur stacks.

## Proposed palette

| Role | Proposed swatch |
|---|---|
| Deep room / console recess | Midnight navy `#152537` |
| Structural shadow | Graphite `#283743` |
| Machinery body | Blue-grey steel `#6D8191` |
| Robot shell / light surfaces | Warm porcelain `#DEE4DD` |
| Primary physical action / working light | Amber `#FFB33B` |
| Service / clue accents | Cyan `#61C9D8` |
| Powered state | Mint `#83D9B1` |

These are art-direction suggestions, not edits to design tokens or measured dominant image colours. Words, shapes and the existing state logic must continue to carry meaning alongside colour.

## Original Phase 1 production proposal

Sizes below are provisional delivery canvases, chosen for the inspected tablet layout. They require final registration with Claude. Shared assets are instantiated twice for the two lift shafts; variants are generated only where an actual state needs them.

| Piece / state | Proposed canvas | Alpha / alignment |
|---|---|---|
| `machine-room-back.webp`, off and powered | 768 × 896 each | Opaque; quiet back wall only |
| `shaft-frame.webp` | 256 × 768 | Transparent; same origin for both shafts |
| `fan-bay.webp` | 256 × 768 | Transparent; leave rotor absent |
| `foreground-frame.webp` | 768 × 896 | Transparent; safe around live labels |
| `power-cell-idle.webp`, `power-cell-lifted.webp`, `power-cell-refused.webp` | 256 × 256 each | Transparent; same registration and silhouette; blank value plate |
| `power-bay.webp` | 256 × 256 | Transparent; fixed receiving socket, blank centre |
| `power-bay-clamp-left.webp`, `power-bay-clamp-right.webp` | 64 × 192 each | Transparent; sliding axes supplied in metadata |
| `power-bay-breaker.webp` | 96 × 96 | Transparent; hinge pivot supplied |
| `power-bay-light.webp` | 256 × 256 | Transparent; one overlay tinted/dimmed by renderer |
| `lift-car.webp` | 256 × 256 | Transparent; bottom-centre anchor, clearance around doors |
| `lift-door-left.webp`, `lift-door-right.webp` | 128 × 256 each | Transparent; horizontal slide, common car canvas |
| `robot-neutral.webp`, `robot-ready.webp`, `robot-success.webp`, `robot-delivery.webp` | 384 × 384 each | Transparent; identical body registration; package only in delivery pose |
| `fan.webp` | 256 × 256 | Transparent; centre pivot; fixed housing remains separate |
| `motor-gear.webp` | 128 × 128 | Transparent; centre pivot; motor casing remains static |

Do not crop sprites out of this hero. Generate each separable production candidate on its own after the direction is approved, then record dimensions, transparency, pivots, hashes and approval. The existing art registry is not edited at this stage. Proposed integration location is the existing theme art tree under a dedicated Tower Rescue mini-game directory, subject to Claude's review of its manifest schema.

Keep the monitor trace, relay changes, breaker refusal, meter fill, small sparks, power-line pulse and final light sweep procedural. They already have timing and Reduced Motion behavior in D193. No large pre-rendered FX library is proposed.

## Geometry and integration constraints

- The actual landscape screen puts the machine room and console side by side; portrait stacks them. This flattened landscape concept cannot be used as a portrait background. Supply the room, bays, moving objects and console hardware separately.
- The generated room split drifts toward roughly 53% of the width, compared with about 50% in the reference. Treat it as composition guidance. Register the eventual pieces to the existing layout; do not move learning controls to fit the painting.
- The generated nameplates and status lamps are too short/narrow for the existing label sizes. The Fire review adds separate native-style label plates at 16 px. Final art must reserve the existing name/status zones, and labels stay native.
- The concept enlarges the guide portrait. Its final sprite must fit the current guide slot or be cropped to a head/bust without covering the message. Enlarging the game slot would be implementation work and needs a separate decision.
- The back bezel is shorter than the current 64-point control, and a back glyph was generated despite the blank-control instruction. Production art must remove that glyph and fit the existing back-button bounds. Hit areas come from code, never from painted pixels.
- The closed cars, centre seams and parked positions fit the pre-test state. Deliver door leaves, cable channels, motor and fan rotors independently so the existing choreography remains possible.
- No floor numbers, power values, instructions, button words or status labels belong in production images. The review mockup is a browser screenshot with HTML text layered over the generated PNG; it is not a production texture.

## Review files and verification

- Hero: `assets/concepts/tower-rescue/hero-v01.png`, 1586 × 992, RGB, opaque; copied unchanged from the built-in OpenAI image generator.
- Fire review mockup: `assets/concepts/tower-rescue/hero-v01-fire-mockup.png`, 960 × 600. The separate HTML overlay supplies the labels and captured values.
- Current-layout reference: `assets/concepts/tower-rescue/layout-reference-powered.png`, 958 × 598, captured from the unchanged D193 game.
- Interactive review: `review/tower-rescue/hero-v01/index.html`. Toggle mockup, text-free artwork and current game reference. Exact generation prompt and image provenance are beside the hero.

The unchanged browser source exported successfully. The reference scenario reached diagnose, repair, powered and delivery states with zero page errors. The review's three modes were exercised in Chromium, its 960 × 600 mockup was captured, and the output was inspected visually. Image dimensions, opacity and hashes were checked on the saved files. This is browser-only art review; no physical Fire/iPad inspection, in-engine art integration, performance measurement or production asset approval is claimed. No full gameplay regression was run for this art-only, uncommitted Phase 1 delivery.

The first attempt to serve the worktree root with the existing export server failed because that helper requires a root `index.html`. A local art-only review server was used instead; the final review modes loaded without page errors. No game file was changed to address that helper limitation.

The original Phase 1 stop was observed. The owner subsequently approved the visual direction and authorised Phase 2. See [the Phase 2 integration note](PHASE2-INTEGRATION.md) for the selected pieces and current approval scope; this hero remains a concept reference and cannot be used as production sprites.
