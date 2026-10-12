# Tower Rescue — Phase 2 integration note

**APPROVED BY OWNER — all 19 selected Phase 2 assets.** Following the direction approval, the owner explicitly approved the completed pack on 2026-10-12. See [the approval record](OWNER-APPROVAL.md). The readability, isolation, portrait-safety and procedural-effects constraints remain. Nothing is registered or integrated into gameplay.

Pack: `assets/candidates/tower-rescue/v01/`. Each tablet PNG has an unchanged generated master under `masters/`; `manifest.json` records actual dimensions, alpha, bounds, bytes and SHA-256. Exact selected prompts and generation ancestry are in `phase2-generation.json`. Built-in OpenAI image_gen generated the art; the tool did not return a model identifier. Export preparation only uniformly resamples and pads the original canvas using the installed jimp-compact 0.16.1. It does not repaint, extract, mirror or flatten pieces.

## Exact intended draw order

Back to front, within the existing machine-room bounds:

1. Quiet room back wall, uniformly cover-fit; crop the unimportant wall edges as needed.
2. Static shaft or fan housing; use tall versions in landscape and compact versions in portrait. Fit uniformly. Keep native label/status zones above the moving hardware.
3. Native roof monitor, relays, cable and power riser. These remain secondary; do not paint their current state into the wall.
4. Independent motor gear and fan rotor, positioned on their fixed mounts.
5. Lift-car shell and dark interior, translated together along the shaft.
6. Robot inside the car, invisible until the existing door/delivery steps allow it.
7. Independent left and right door leaves, clipped to the car opening. Translate horizontally; never stretch the leaf.
8. Native floor indicators, clue/selection outline, system names and status plates. Readability wins over any painted bezel.

Back to front, inside the existing control panel:

1. Native panel, stage chips, meter track/fill, guide background and buttons.
2. Guide head/bust clipped inside its existing 52 × 44 slot.
3. Fixed power-bay socket; then seated cell; then independent clamp leaves; then breaker lever.
4. Native cell values, meter readings, guide/prompt words and control labels. Keep these above artwork.
5. Existing bounded feedback outline/particles, only during their existing feedback window.

No new foreground frame or FX texture is needed. The quiet wall already supplies framing; another overlay would consume the prompt/label margins.

## Registration and pivots

Coordinates below belong to the **exported full canvas**, including transparent margins; do not auto-trim them.

| Part | Pixel pivot/anchor | Normalised | Integration |
|---|---:|---:|---|
| Fan, 256 × 256 | (127, 127) | (0.496094, 0.496094) | Rotate around amber hub |
| Gear, 128 × 128 | (63.5, 63.5) | (0.496094, 0.496094) | Rotate around clear axle opening |
| Breaker, 96 × 96 | (47.5, 71.5) | (0.494792, 0.744792) | Rotate around lower hinge, not canvas centre |
| Lift car, 256 × 256 | (128, 230) | (0.5, 0.898438) | Bottom-centre chassis anchor |
| Robot poses, 384 × 384 | (192, 371) | (0.5, 0.966146) | Shared floor anchor; visible soles differ by at most one export pixel |

Fan/gear/breaker pivots were checked against the coloured hub or clear hole on the exported pixels. Shaft motor mount is approximately (128, 119) on the tall frame and (128, 71) on the compact frame; fan opening is approximately (128, 437) on the tall bay and (127, 205) on the compact bay. These housing locations are visual registration guides, not rotation pivots.

Door leaves share a 256 × 256 car canvas. Alpha-32 bounds are left [57,49,129,207], right [127,49,197,207]; the two-pixel overlap at the centre prevents a clear seam. Review clips the leaves to x=21–79%, y=20–81%. Final masking should follow the existing car opening, not the alpha silhouette. Both clamps translate on X; align their amber noses to the socket and preserve their own aspect ratios. Their differing generated margins must not change the travel distance.

## Code responsibilities and small-screen limits

- Reuse `power-cell-idle.png` for idle, lifted and refused states. Keep the native value plate label. Lift/arc/seat/eject, shadow, refusal desaturation and temporary outline are code states; duplicate paintings would risk registration drift.
- Keep clamp translation, breaker trip, fan/gear rotation, car travel, door opening and robot visibility/pose changes in the existing choreography. Do not infer academic evidence or hit areas from pixels.
- Keep monitor bars, relay/floor lamps, meter count/fill, power riser, bounded sparks and final light sweep procedural. No effect images were generated.
- Off/on appearance uses restrained opacity/tint over the same room and hardware. The compact fan bay's one steady warm work light is ambient, not a power-status indicator. Native words and indicator shapes carry state.
- Preserve Reduced Motion: existing still-state transitions, no ambient rotation, travelling particles, shake or flashing. Art must not introduce its own timeline.
- **Simplify at small sizes:** the clamps' pistons disappear at the current 8-point width; use the existing solid native clamp silhouette there. The breaker still reads as a lever at 22 points, but its hinge ring can become a plain disc. Robot fingers/knees disappear below roughly 60 points; keep the face/package silhouette, and use the existing guide face fallback if the cropped portrait loses clarity. These thresholds are visual review recommendations, not device measurements.
- Portrait uses the compact housings with larger, separately placed cars. Never squeeze the tall frames sideways. Labels remain at least 16 points and stay outside hardware; back/test controls keep their existing touch bounds.

## Delivery dimensions and review

| Group | Tablet canvas |
|---|---|
| Quiet wall | 768 × 896 |
| Tall shaft / fan bay | 256 × 768 each |
| Compact shaft / fan bay | 256 × 384 each |
| Cell / socket / car / door leaves / rotor | 256 × 256 each |
| Clamps | 64 × 192 each |
| Breaker | 96 × 96 |
| Gear | 128 × 128 |
| Four robot poses | 384 × 384 each |

The 19 exports occupy 2,093,997 bytes; their combined RGBA decode footprint is 9,244,672 bytes if all unique canvases were loaded together. This is a file-based calculation, not a measured runtime allocation. Tall/compact alternatives and mutually exclusive poses need not all load at once. Masters are review/source files and must stay out of the production bundle.

Review page: `review/tower-rescue/phase2-v01/index.html`. Contact sheet: `contact-sheet.png`. Final-pieces mockups: `mockup-fire-landscape.png` (960 × 600) and `mockup-fire-portrait.png` (600 × 960); matching repair/delivery stills are alongside them. The HTML composition uses the inspected game's bay order, landscape/portrait arrangement and example readings. It is not an exact in-engine registration or a new rendering framework. Claude should map the pieces to existing layout boxes during a separately approved integration.

Browser capture exercised six orientation/state combinations, checked image decoding, counted all 19 contact tiles and exercised the review controls with no page errors. Pixel hashes, dimensions, transparency and visual composition were inspected. Physical Fire/iPad quality, decode time, memory, touch response and integrated gameplay remain untested. All production manifests, approved art/audio, learning code and gameplay remain unchanged.
