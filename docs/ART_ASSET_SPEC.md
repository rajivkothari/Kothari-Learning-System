# Art asset spec (Elevator Quest)

How to make production art that drops into the game. Written for an illustrator or an image-generation workflow followed by a human cleanup pass. Read [ART_DIRECTION.md](ART_DIRECTION.md) for the look; this file is about canvases, layers, anchors, files and rights.

Status (2026-10-07): the pipeline is built and tested; **no production art exists yet**. The game draws its code-drawn vectors everywhere. The concept pack is a reference only (see "Rights"). Development calibration patterns (`assets/dev/art/`, made by `scripts/generate-art-calibration.js`) prove the placement, crops, pivots and fallbacks in the browser build; they are test patterns, not game art, and never ship.

## Rules that do not bend

- Never bake important text into art: floor numbers, place names, objectives, Lifty's words, labels, explanations, NEXT JOB. The game draws those natively, in the same place on every floor.
- Leave the reserved zones calm (plain wall, dark enough for white text at 3:1). The floor number, the place name and mission objects draw there.
- Uniform scale only. The game never stretches an image unevenly; it crops (cover) or fits (contain).
- Every layer is optional. A missing or broken image shows the vector drawing for that part; the game keeps working.
- Touch areas are data, never pixels. A landing's touchable thing has an explicit box in the manifest.
- No franchise look-alikes: no Mario, Nintendo, question blocks, power-ups, warp pipes, Minecraft, Mojang, creepers, Zelda, Link, Hylian or Triforce marks, copied temples, logos or music. Broad genre only. `content/ipGuard.ts` checks names in metadata; a person checks the pictures.
- Red is for genuine danger only. No candy gradients, no glow blur, no confetti.

## Formats and sizes

- Delivery: WebP. Opaque backgrounds lossy at quality 85; anything with transparency lossless WebP or WebP with alpha. PNG is accepted for transparent pieces when WebP shows artefacts.
- Verified 2026-10-07: Metro bundles `.webp` and `.png`; the installed Skia native libraries include a WebP decoder; the browser build decoded the calibration WebP (Floor 20). Not yet verified on a physical Fire tablet or iPad.
- Masters: draw at twice the runtime size, export down. Keep masters outside the app bundle (they are not loaded at runtime).
- Colour: sRGB, 8 bits per channel. No embedded ICC profiles beyond sRGB.
- Memory (decoded, 4 bytes a pixel), provisional and **not measured on a Fire tablet**: one landing at most 8 MB in any state, the whole cabin at most 16 MB, a Lifty pose 1.25 MB, a mission object 1 MB. The game holds the current landing and the destination (two). `npm run validate:content` refuses an art pack over these numbers. The Device Lab hardware gate measures real memory before more than the proof floors get art.

| Asset | Runtime size (px) | Alpha | Decoded |
|---|---|---|---|
| Landing background | 1024 x 1024 | no | 4.0 MB |
| Landing midground / foreground / moving piece | trimmed to the piece | yes | as small as possible |
| Landing light overlay | 512 x 512 (stretched uniformly to the canvas) | yes | 1.0 MB |
| Cabin backing | 1536 x 1152 | no | 6.75 MB |
| Cabin door leaf (each) | 384 x 768 | no | 1.1 MB |
| Cabin side wall (each) | 192 x 1152 | no | 0.8 MB |
| Cabin ceiling | 1536 x 96 | no | 0.6 MB |
| Cabin floor | 1536 x 192 | no | 1.1 MB |
| Cabin floor inlay | 768 x 192 | yes | 0.6 MB |
| Cabin frame top / sides | 768 x 48 / 48 x 768 | no | 0.14 MB each |
| Cabin light overlay | 768 x 576 | yes | 1.7 MB |
| Whole cabin (all twelve) | | | about 15 MB |
| Lifty pose (each) | 512 x 512 | yes | 1.0 MB |
| Mission object | 512 x 320 (crew and loading dock 768 x 320) | yes | 0.63 / 0.94 MB |
| Directory icon (optional) | 256 x 256 | yes | 0.25 MB |

## Coordinates

All placement numbers are fractions (0 to 1) of the image or canvas they describe, measured from the top-left corner. A pivot `{x: 0.5, y: 1}` is the bottom centre of that image.

## Landings (what you see through the open doors)

One square canvas per floor, 1024 x 1024 at runtime. The game covers the doorway with it, plus a 3% overscan on every side for a small parallax as the doors open. The doorway's shape (width / height) runs from 0.77 (tall iPad landscape) to 1.05 (Fire, iPad portrait); art is guaranteed for 0.72 to 1.12. Outside that (the iPad 2/3 split view, 0.52) the game draws the vector landing instead, rather than crop the art.

**Safe core**: x 0.16 to 0.84, y 0.08 to 0.92. Every supported doorway shows all of it (the largest region always visible is x 0.155 to 0.845, y 0.079 to 0.921). The hero object, the mission objective area, the landmark and any touchable thing go inside it. Outside it (left and right bands, top and bottom strips) is atmosphere that may be cropped.

**Reserved zones** (canvas fractions, from `reservedZone()` in `src/themes/elevator-quest/art/fit.ts`). The native overlays land here at some doorway shape:

| Zone | x | y | What draws there | Keep |
|---|---|---|---|---|
| Place sign | 0.198 to 0.802 | 0.102 to 0.243 | the place name (live text) | paint a plain sign plate here; an emblem may sit in its left end; set `signInk` to `light` or `dark` |
| Floor number | 0.302 to 0.698 | 0.251 to 0.605 | the big painted floor number (white) | plain wall, dark enough for white at 3:1 |
| Mission object | 0.274 to 0.726 | 0.584 to 0.788 | repair kit, toolbox, crew, dock... | clear floor, nothing tall in front |

So the composition is: sign high centre, number in the middle of the wall, the floor in front of the doorway clear for objects, and the place's character in the side bands of the safe core (x 0.16 to 0.30 and 0.70 to 0.84) and in the sky, ceiling and floor bands. The vector placeholders follow the same plan.

**Layers** (back to front; each optional except the background):

| Layer | File | Notes |
|---|---|---|
| background | `landings/<floor>/background.webp` | opaque, full canvas; declares `safe` if it differs, and `signInk` |
| midground | `landings/<floor>/midground.webp` | trimmed; `rect` says where it sits in the canvas; parallax depth 0.5 |
| moving | `landings/<floor>/<piece>.webp` | one per moving piece; trimmed; `rect`, `motion` (see below); must sit inside the safe core |
| foreground | `landings/<floor>/foreground.webp` | trimmed; parallax depth 1; keep the object zone clear |
| light | `landings/<floor>/light.webp` | transparent glow or shade, 512 x 512 |

Floor 15 has two states. Paint the base layers once (state `any`) and add a state overlay: `light-dormant.webp` (state `dormant`: the dark, unpowered look) and `light-restored.webp` (state `restored`: the powered glow). The base plus the overlay must stay inside the 8 MB landing budget.

**Touchable things** (explore floors 5, 6, 15, 17, 18): the art for that floor must carry a `hit` box in canvas fractions, inside the safe core, covering the thing a child would touch. The game widens it to at least 64 pt. The words (object name, Lifty's line, the fact) stay in `landings.json`.

## Moving pieces

Fan blades, the motor wheel, a drawer, the telescope tube, the golf flag, turbine blades, a floating platform, the crane hook. No physics, no loops: one reaction.

- `motion.kind`: `spin` (turns about the pivot; `amount` in turns, ends where it started), `tilt` (rocks and returns; `amount` in radians, about 0.1 to 0.3), `slide` (moves sideways and returns; `amount` in doorway widths, about 0.03 to 0.08).
- `motion.pivot`: in the piece's own image (0 to 1). Spin and tilt turn about it. Draw the piece so the pivot is where the real hinge or axle is: a flag at the bottom of its pole, a hook at the top of its cable, blades at their hub.
- `motion.trigger`: `touch` (plays with the landing's reaction when the child touches the hero) or `arrival` (plays once while the doors open).
- Rest pose: the image as drawn. Under Reduced Motion the piece stays at rest; parallax is off too.

## Cabin

The cabin is the car's inside, around the doorway. The layout changes with the window, so the cabin is split into parts that each go in their own box (`cabinArtBoxes()` in `art/fit.ts`):

| Layer | Placement | Notes |
|---|---|---|
| backing | covers the whole cabin; the image point (0.5, 0.56) is pinned to the doorway's centre | back wall, side panels, light columns. Paint the area behind the door frame as plain wall: the frame and doors cover it. Leave the top centre calm: the floor indicator (native) sits there. |
| ceiling | covers the ceiling strip | light panels may be painted; the light overlay handles power |
| floor | covers the floor band, clipped to the floor shape | |
| inlay | fits under the doorway on the floor (contain, top-aligned) | the compass inlay |
| wall-left, wall-right | cover the angled side walls, clipped to their shape, anchored at the inner edge | the handrails stay vector on top |
| frame-top, frame-left, frame-right | wrap the doorway | all three or none (else the vector frame draws) |
| door-left, door-right | each covers its half of the doorway, anchored at the meeting edge, and moves with the doors | leave a plain dark vertical band at x 0.76 to 0.89 of the left leaf and 0.11 to 0.24 of the right leaf: the vision panels onto the shaft draw there |
| light | covers the cabin, under the indicator and the UI; its opacity follows the power | soft cyan and warm pools; transparent elsewhere |

Required for any cabin art to show: backing and both door leaves. Everything native stays on top: the indicator digits, Lifty's words, the help button, NEXT JOB, the panel.

## Lifty

Still poses, one per mood: `neutral`, `helping` (pointing toward the panel, which is to the right), `thinking`, `satisfied` (the success), `concerned` (a wrong floor: warm amber, never red), `systemCheck` (quiet, scanning). 512 x 512, transparent, facing right, standing on a baseline at y 0.94, centred on x 0.5, the figure about 80% of the canvas height. The game draws the pose standing on the bottom of Lifty's figure box. No Rive or Lottie. A pose without art uses the neutral image, then the vector Lifty. The game adds the hover (2.5 s cycle, at most 3 pt, off under Reduced Motion); do not paint motion blur.

## Mission objects

Repair kit, toolbox, spare parts, crew, beacon, loading dock. Transparent, standing on a baseline at y 0.95, centred. 512 x 320 (crew and loading dock 768 x 320). The game fits the image into the object slot on the landing floor (contain, bottom-aligned); the touch area is the slot, not the pixels. Collected objects slide toward the car and fade. Cargo crates are native views today: a crate art slot is not wired yet.

## Files and the manifest

```
assets/themes/elevator-quest/art/
  cabin/      backing.webp ceiling.webp floor.webp inlay.webp wall-left.webp wall-right.webp
              frame-top.webp frame-left.webp frame-right.webp door-left.webp door-right.webp light.webp
  lifty/      neutral.webp helping.webp thinking.webp satisfied.webp concerned.webp system-check.webp
  landings/<floor>/  background.webp [midground.webp] [<piece>.webp] [foreground.webp] [light*.webp]
  objects/    repair-kit.webp toolbox.webp spare-parts.webp crew.webp beacon.webp loading-dock.webp
  icons/      floor-<n>.webp   (optional, for the directory)
```

Lower case, hyphens, no spaces. To add an image:

1. Put the file in its folder.
2. Add its entry to `content/themes/elevator-quest/art/manifest.json`: `id` (for example `landing.15.background`), `kind`, `file`, `width`, `height`, `alpha`, `provenance` (provider, AI-generated, human-reviewed, license), and the kind's keys (`layer`, `floor`, `state`, `rect`, `safe`, `signInk`, `depth`, `motion`, `hit`, `pose`, `visual`).
3. Add its record to `content/themes/elevator-quest/art/rights.json` (below).
4. Add one static `require` line to `src/themes/elevator-quest/art/sources.ts`.
5. Run `npm run validate:content`, then look at it in the browser build with the developer tools' Art section (Production art, the overlays on) on iPad landscape, Fire, portrait and the narrow window.

Production shows an image only when its rights record says `approved`, a person has reviewed it, and it is bundled. Until then the vector shows.

## Rights

Every production image has a record in `rights.json`: asset id, source, tool or artist (a role, never a private person's details), date, AI-generated yes or no, human-reviewed yes or no, license, modifications, approval (`pending`, `approved`, `rejected`), and who approved it (a role). Approval requires a human review. Third-party reference images are not used. The concept pack is recorded under `references` with approval `reference-only`; it can never be an asset, and the validator refuses one that tries.

## Generating with an image model

The first asset sheets (two 1536 x 1024 composite images, received 2026-10-07) set the look well but cannot be used as files: each landing is about 240 x 200 px (a quarter of the needed width), wide rather than square, with labels and "Safe Area" marks painted in; sheet 2 has a painted checkerboard instead of transparency; sheet 1's cut-outs are never fully opaque; NEXT JOB and a panel number are painted text; the directory icons repeat numbers and do not match the floors. Every landing also puts its hero in the middle of the doorway, where the floor number and the mission object slot are (see "Landings" above). Fix these in the next round:

- One asset per image, at the runtime size or larger, square for landings. No contact sheets, no labels, no file names, no guides painted in.
- Transparent pieces on a real transparent background. If the tool cannot do that, use one flat colour that appears nowhere in the art (pure magenta), and say so: the cut-out is then made by hand and reviewed.
- Landings: keep the middle of the wall calm and plain (the number goes there), paint a blank sign plate high centre, keep the floor in front of the doorway clear (objects stand there), and put the place's character in the left and right bands, the sky, the ceiling and the far floor. Paint the moving piece separately on transparent, at rest.
- No text anywhere: no NEXT JOB, no digits on buttons, no floor numbers, no names.
- Original designs only (Rules above). Floor 7 must not read as question blocks or warp pipes; Floor 13 must not read as grass-topped voxel dirt blocks and a mine cart; Floor 9 must not use sky-island temple marks.
- Same light, line weight and palette across the set: generate the cabin first, then use it as the style reference for each landing.

## What to supply, in order

The minimum for the first visual pass (the "proof floors"), in this order, so each step can be checked in the game before the next:

1. Cabin: the 12 cabin files above (backing and both leaves first).
2. Lifty: the 6 poses (neutral first).
3. Floor 15 PRIMARY POWER: background (with `hit` on the core piece), `core.webp` (moving, tilt or no motion, trigger touch), `light-dormant.webp`, `light-restored.webp`.
4. Floor 9 WIND RUINS: background, `turbine.webp` (spin, arrival).
5. Floor 20 ROOFTOP GOLF: background, `flag.webp` (tilt, arrival).
6. Floor 13 BLOCK BUILDER: background, `hook.webp` (tilt, arrival).
7. Floor 7 PLATFORM HEIGHTS: background, `platform.webp` (slide, arrival).
8. Mission objects: the 6 object files.

That is 12 + 6 + 4 + 2 + 2 + 2 + 2 + 6 = 36 files. Optional after that: midground and foreground layers for the proof floors, directory icons, then the other floors one at a time after the Fire memory measurement.
