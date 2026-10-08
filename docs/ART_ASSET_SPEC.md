# Art asset spec (Elevator Quest)

How to make production art that drops into the game. Written for an illustrator or an image-generation workflow followed by a human cleanup pass. Read [ART_DIRECTION.md](ART_DIRECTION.md) for the look; this file is about canvases, layers, anchors, files and rights.

Status (2026-10-08): the pipeline is built and tested. **Approved production art (D145)**: the cabin (back wall, ceiling, floor, both side walls, three frame strips, both door leaves) and Lifty's neutral pose, approved by the project owner after reviewing them. **Approved in M8.1 (D158)**, by the owner's instruction after an agent audit of each file (no person looked at each file in that round, and the rights records say so): Lifty's other five poses (Quiet, Success, Help, Concerned, Thinking); the landing backgrounds for Floors 1, 2, 5, 6, 7, 9, 11, 13, 15 (dormant base and restored scene), 17, 18 and 20; and the transparent props a touch moves: the Floor 20 golf ball, the Floor 2 toolbox closed and open, and the Floor 18 telescope (approved together with the Floor 18 background, which is painted with an empty fork). **Approved in M8.2 (D164)**, the same way and recorded the same way: the landing backgrounds for the last eight floors (3, 4, 8, 10, 12, 14, 16, 19) and two props, the Floor 14 hanging lamp (`landing.14.lamp`) and the Floor 19 turbine rotor (`landing.19.rotor`), each approved together with its background, which is painted without it. All twenty landings are illustrated. Production draws all of it. Nothing is pending now (`src/devtools/artReviewSources.ts` is empty); the only other record is the rejected procedural Quiet (`lifty.quiet-rejected`, D142), which fills no slot. Mission objects and floor icons still draw as code-drawn vectors, and every vector stays the fallback. The Floor 5 fans and the round things of Floors 3, 4, 10 and 12 turn as discs of the background, so they have no prop. Decode time and memory on a Fire tablet are not measured yet (DEVICE_LAB.md sections E and G).

The concept pack and both asset sheets are references only (see "Rights"); nothing is cropped out of them for production. Development calibration patterns (`assets/dev/art/`, made by `scripts/generate-art-calibration.js`) prove the placement, crops, pivots and fallbacks in the browser build; they are test patterns, not game art, and never ship.

## Rules that do not bend

- Never bake important text into art: floor numbers, place names, objectives, Lifty's words, labels, explanations, NEXT JOB, logos. The game draws those natively, in the same place on every floor.
- On an illustrated landing the floor number is on the live sign beside the name ("15 · PRIMARY POWER", D136); the indicator above the doors shows it too. No big number is painted over the scene, so the middle of the doorway belongs to the art.
- Leave the reserved zones as specified below: a blank sign plate, and clear floor where mission objects stand.
- Uniform scale only. The game never stretches an image unevenly; it crops (cover) or fits (contain).
- Every layer is optional. A missing or broken image shows the vector drawing for that part; the game keeps working.
- Touch areas are data, never pixels. A landing's touchable thing has an explicit box: its object `box` in `landings.json` (M8), or the manifest's `hit` where it has none.
- No franchise look-alikes: no Mario, Nintendo, question blocks, power-ups, warp pipes, Minecraft, Mojang, creepers, Zelda, Link, Hylian or Triforce marks, copied temples, logos or music. Broad genre only. `content/ipGuard.ts` checks names in metadata; a person checks the pictures.
- Red is for genuine danger only. No candy gradients, no glow blur, no confetti.

## Formats and sizes

- Delivery: WebP. Opaque backgrounds lossy at quality 85; anything with transparency lossless WebP or WebP with alpha. PNG is accepted for transparent pieces when WebP shows artefacts.
- Verified 2026-10-07: Metro bundles `.webp` and `.png`; the installed Skia native libraries include a WebP decoder; the browser build decoded the calibration WebP (Floor 20). Not yet verified on a physical Fire tablet or iPad.
- Masters: draw at twice the runtime size, export down. Keep masters outside the app bundle (they are not loaded at runtime).
- Colour: sRGB, 8 bits per channel. No embedded ICC profiles beyond sRGB.
- Memory (decoded, 4 bytes a pixel), provisional and **not measured on a Fire tablet**: one landing at most 8 MB in any state, the whole cabin at most 16 MB, a Lifty pose 1.25 MB, a mission object 1 MB. The game holds the current landing and the destination (two). `npm run validate:content` refuses an art pack over these numbers. The Device Lab hardware gate was to measure real memory before more than the proof floors got art; all twenty landings have art since M8.2 and the gate has not run (DEVICE_LAB.md sections E and G).

| Asset | Runtime size (px) | Alpha | Decoded |
|---|---|---|---|
| Landing background | 1024 x 1024 | no | 4.0 MB |
| Landing midground / foreground / moving piece | trimmed to the piece | yes | as small as possible |
| Landing light overlay | 512 x 512 (stretched uniformly to the canvas) | yes | 1.0 MB |
| Cabin backing | 1280 x 1280 (square) | no | 6.25 MB |
| Cabin door leaf (each) | 384 x 768 | no | 1.1 MB |
| Cabin side wall (each) | 192 x 1152 | no | 0.8 MB |
| Cabin ceiling | 1536 x 96 | no | 0.6 MB |
| Cabin floor | 1536 x 192 | no | 1.1 MB |
| Cabin floor inlay | 768 x 192 | yes | 0.6 MB |
| Cabin frame top / sides | 1792 x 56 / 56 x 1792 (32:1 strips) | no | 0.38 MB each |
| Cabin light overlay | 768 x 576 | yes | 1.7 MB |
| Whole cabin (all twelve) | | | about 15.3 MB |
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
| Place sign | 0.198 to 0.802 | 0.102 to 0.243 | the floor number and place name, live text ("20 · ROOFTOP GOLF") | paint a plain sign plate here, wide enough for the longest line; no emblem or text on it; set `signInk` to `light` or `dark`, and declare the plate's flat face as `sign` (D150): the name then centres on the face at every doorway shape, so the plate need not fill the whole zone |
| Mission object | 0.274 to 0.726 | 0.584 to 0.788 | repair kit, toolbox, crew, dock... | a readable floor surface the objects can stand on; objects draw in front of the art |

So the composition is: the hero of the place in the middle of the doorway (the big reveal when the doors open), a blank sign plate high centre, a floor surface in front for objects, and atmosphere around the edges that may be cropped. No moving piece may cover the sign zone (the validator refuses it). Vector landings (no art yet) keep the painted number in the middle, as before.

**Layers** (back to front; each optional except the background):

| Layer | File | Notes |
|---|---|---|
| background | `landings/<floor>/background.webp` | opaque, full canvas; declares `safe` if it differs, `signInk`, and `sign` (the plate's flat face, inside the safe core; measured on the exported file) |
| midground | `landings/<floor>/midground.webp` | trimmed; `rect` says where it sits in the canvas; parallax depth 0.5 |
| moving | `landings/<floor>/<piece>.webp` | one per moving piece; trimmed; `rect`, `motion` (see below); must sit inside the safe core |
| foreground | `landings/<floor>/foreground.webp` | trimmed; parallax depth 1; keep the object zone clear |
| light | `landings/<floor>/light.webp` | transparent glow or shade, 512 x 512 |

Floor 15 has two states. Paint the base layers once (state `any`) and add a state overlay: `light-dormant.webp` (state `dormant`: the dark, unpowered look) and `light-restored.webp` (state `restored`: the powered glow). The base plus the overlay must stay inside the 8 MB landing budget. Made that way instead (D150): the base background is the dormant scene and `background-restored.webp` (layer `background`, state `restored`) is the whole powered scene, an edit of the same composition that covers the base once restored. Two 1024 backgrounds are exactly the 8 MB budget, so this floor takes no other layer.

**Touchable things** (M8, D156): every thing a child can touch on a landing is a named object in `landings.json` with its own `box` in canvas fractions (the same space as the manifest's `hit`), inside the safe core, covering the thing as painted. The game widens the touch to at least 64 pt, so a small thing (a golf ball) still gets a full-size touch. Boxes are measured on the exported art, one per object, once the art is final; until then the object carries `provisional: true`. Every floor has objects since M8.2 (twelve in M8: 1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20; then 3, 4, 8, 10, 12, 14, 16, 19; the canonical ids are listed in ELEVATOR_QUEST.md "Exploration and landing play"). What a touch moves must sit inside its thing's box: a disc's centre, and a hoist's rope and load lowered to the end of its drop (`ref.disc`, `ref.hoist`, M8.2), so measure the box to take in the whole moving part (the Floor 13 crane's box reaches its jib tip). Painted things that reach past the safe core get a box that stops at its edge, or none (Floor 12's tool board and parts trolley; Floor 16's herb shelf and water tank are not objects). Reading jobs use the same objects as answers, so every object a note names should be clearly visible, separate from its neighbours, and inside the safe core (Floor 1's plant and bench are painted outside it, so their notes fall back to cards). Boxes may overlap (a toolbox on its workbench); the smaller thing sits in front. A manifest `hit` is still needed on a floor where a spot's object has no box of its own (today only Floor 15's core). The words (object name, Lifty's line, the fact) stay in `landings.json`.

## Moving pieces

Fan blades, the motor wheel, a drawer, the telescope tube, the golf flag, turbine blades, a floating platform, the crane hook. No physics, no loops: one reaction.

- `motion.kind`: `spin` (turns about the pivot; `amount` in turns, ends where it started), `tilt` (rocks and returns; `amount` in radians, about 0.1 to 0.3), `slide` (moves sideways and returns; `amount` in doorway widths, about 0.03 to 0.08).
- `motion.pivot`: in the piece's own image (0 to 1). Spin and tilt turn about it. Draw the piece so the pivot is where the real hinge or axle is: a flag at the bottom of its pole, a hook at the top of its cable, blades at their hub.
- `motion.trigger`: `touch` (plays with the landing's reaction when the child touches the hero) or `arrival` (plays once while the doors open).
- Placement: a moving piece sits inside the safe core and never over the sign zone (the validator refuses it). Touch areas may cross it; they are invisible.
- Rest pose: the image as drawn. Under Reduced Motion the piece stays at rest; parallax is off too.

### Props a touch moves (M8, D156)

A thing that travels or changes state when touched is its own transparent layer, moved by its exploration spot (`prop`, and `openProp` for an open state, in `landings.json`), not by a manifest `motion`: the golf ball (`landing.20.ball`), the toolbox closed and open (`landing.2.toolbox`, `landing.2.toolbox-open`), the telescope tube (`landing.18.telescope`), and since M8.2 the Floor 14 hanging lamp (`landing.14.lamp`, tilts about the top of its chain; the background paints an empty bracket arm; the prop starts just under the sign zone so it never covers the place sign) and the Floor 19 turbine rotor (`landing.19.rotor`, two turns about its hub; the background paints an empty ring). A background painted without its prop is approved together with it or not at all (Floors 14, 18 and 19). A round thing with no prop turns as a disc of the background (the spot's `disc`); a reaction with nothing to move glows. The validator lets such a piece go without a `motion`.

- Paint the background without the moving part (keep the fixed parts: a fan's housing, a telescope's mount, the hole on the green), so nothing ghosts when it moves. A thing with two states (the toolbox) has one file per state, registered so the box sits in the same place in both.
- A round thing that only turns (a gear, a hub) can instead turn as a disc of the background about its own centre (`disc` in `landings.json`, with `linked` discs for a gear train): no prop and no ghost. Use this only for round things. A linked disc may also be another round part that turns with it, as the Floor 3 valve turns the gauge face so its needle sweeps; use that only where the part looks the same at every angle except its needle or pointer. Where wall shows between spokes, paint a plain plate behind them (Floor 12's pulley wheel), or the wall turns too.
- A spring stretches up from its base and a crane's rope pays out over the background: the moved copy covers the painted original.
- Transparent, trimmed to the piece, `rect` inside the safe core and off the sign zone; real transparency with clear edges and no colour fringe.
- A prop that is missing or fails to decode makes the thing glow instead, so a touch always shows something; that is a fallback, not a look to design for.
- Under Reduced Motion nothing turns or travels: the glow holds still, the toolbox changes state at once, the ball goes straight to the cup.

## Cabin

The cabin is the car's inside, around the doorway. The layout changes with the window, so the cabin is split into parts that each go in their own box (`cabinArtBoxes()` in `art/fit.ts`):

| Layer | Placement | Notes |
|---|---|---|
| backing | covers the visible back wall: between the side walls, from the ceiling down to the floor, which are drawn over it (D144); the image point (0.5, 0.56), or the entry's `anchor`, is pinned to the doorway's centre | the back wall: panels, lamps, light columns. Square, because the back wall is close to square in landscape. Never paint a door, doorway or door frame: the game's doorway is smaller and lower than a painted one would be (the indicator and Lifty's band sit above it), and its own frame and doors go over the middle. Measured in image fractions on iPad, Fire, portrait and narrow (D144): landscape shows x 0.03 to 0.97 (iPad 0.08 to 0.92); the game's frame and doors cover x 0.18 to 0.82 from y 0.33 down (portrait 0.26 to 0.74); Lifty and his words float across y 0.12 to 0.42; the indicator sits at x 0.33 to 0.67, y 0.01 to 0.16; portrait shows only y 0 to 0.77. So put the lamps and light columns in the two strips x 0.08 to 0.18 and 0.82 to 0.92, between y 0.40 and 0.75, and keep the band behind Lifty's words and the top centre plain panelling. |
| ceiling | covers the ceiling strip | light panels may be painted; the light overlay handles power |
| floor | covers the floor band, clipped to the floor shape | |
| inlay | fits under the doorway on the floor (contain, top-aligned) | the compass inlay |
| wall-left, wall-right | cover the angled side walls, clipped to their shape, anchored at the inner edge | the handrails stay vector on top |
| frame-top, frame-left, frame-right | wrap the doorway, 20 pt thick (D142) | long strips (32:1) with the same cross-section all along: the game fits the strip's thickness exactly and crops only its length, so the outline, lip and highlight edge always show. Derived from one front-on frame image (see "Deriving the frame strips") |
| door-left, door-right | each covers its half of the doorway, anchored at the meeting edge, and moves with the doors | flat sliding leaves seen straight on (never hinged, never in perspective); leave a plain dark vertical band at x 0.76 to 0.89 of the left leaf and 0.11 to 0.24 of the right leaf: the vision panels onto the shaft draw there |
| light | covers the cabin, under the indicator and the UI; its opacity follows the power | soft cyan and warm pools; transparent elsewhere |

Required for any cabin art to show, in Review and in Production: the backing, the three frame strips and both door leaves (`CABIN_REQUIRED`, D142). Until all six are present the whole vector cabin draws: an illustrated wall inside a vector frame and doors reads as unfinished, and comparing it with the vectors says nothing. The developer tools' "Inspect cabin pieces" toggle (`&inspect=cabin`) is the one way to see a piece on its own. Everything native stays on top: the indicator digits, Lifty's words, the help button, NEXT JOB, the panel.

### Deriving the frame strips

Image tools draw a whole frame far better than a 32:1 strip, so the frame is generated as one front-on image and the three strips are a technical export from it, reviewed before they enter the manifest:

1. Generate the whole frame (ART_PROMPTS.md), with the opening transparent or one flat colour, and review it as a picture first.
2. Cut a straight run of the lintel and of each jamb, away from the corners, square to the profile.
3. Scale each run so the profile is 56 px thick (112 in the master), and extend it to 1792 px by repeating the run. The repeat length is the bolt spacing, so the pattern stays even; check the seam at full size.
4. Record the source image, the three crop rectangles and the repeat length in each strip's rights record (`modifications`), then look at all six cabin pieces together in Review.

The corners are not used: the lintel covers the top corners and the game crops the strips' ends.

## Lifty

The production Lifty is the screen-face robot of asset sheet B (D137). Locked traits: a white and orange mechanical body; a dark screen for a face, with the expression drawn on the screen in cyan (no physical cartoon eyes); a small antenna; clear mechanical joints; a compact, readable silhouette; expressive without looking preschool or babyish. He hovers (D133), so no legs or feet: a hover jet under the body.

Lifty is drawn in a square of 132 pt on an 11-inch iPad in landscape, 123 pt in portrait, 120 pt on a Fire HD 8, 117 pt in Split View 1/3 and 98 pt in Slide Over (D142; it was 88 pt and 69 pt). He grows into the spare height above the door frame, so the doorway did not shrink for him. The robot fills about 90% of the canvas height, so about 119, 111, 108, 105 and 88 pt of him is visible. The screen expression has to read at those sizes without zooming: bold, simple cyan shapes, nothing thinner than about 1/60 of the canvas. The layout keeps the right 88% of the square clear and lets the empty left 12% hang behind him, so keep the whole robot, arms included, inside x 0.15 to 0.85 in the master pose; a pointing or cheering hand may reach x 0.12 to 0.88 (D147).

Neutral is the master pose: it fixes the body, head and screen proportions, the antenna, the arm construction and joints, the hover assembly, the colours, the line weight and the highlights. Neutral is approved (D145). The other five are edits of that image, changing only the arms, a small body or head tilt and the cyan screen expression; colours, materials and line weight stay identical. The production plan is in ART_PROMPTS.md; all five were made that way (D147) and approved in M8.1 (D158), so a production build draws each pose for its mood. The rejected Quiet candidate (99be216, owner decision D142) is not a reference for any pose.

Six still poses, each its own file:

| Pose | File | When the game shows it |
|---|---|---|
| Neutral | `lifty/neutral.png` | default, a calm job line |
| Pointing / Help | `lifty/help.png` | help and clues; points toward the panel, which is to the right |
| Thinking | `lifty/thinking.png` | working something out with the learner |
| Success | `lifty/success.png` | the job is done: a happy face on the screen, no check glyph, no confetti |
| Concerned / Problem solving | `lifty/concerned.png` | a wrong floor or a rescue: a puzzled cyan face with a thin warm amber line at the screen's edge (D147, as D137 had it), never red |
| Quiet / Travel | `lifty/quiet.png` | announcements (hall calls, repositioning) and rides where Lifty says nothing |

`liftyArtPose()` in `ui/liftyPose.ts` maps the director's moods onto these. 512 x 512, transparent, facing slightly right, registered to the approved neutral master: screen 146 px wide (bezel to bezel along the eye row), hover jet centred at x 0.515 with its bottom at y 0.823, the whole figure inside the canvas with clear edges (ART_PROMPTS.md "Lifty's other poses"). The game draws the pose standing on the bottom of Lifty's figure box. No Rive or Lottie. A pose without art uses the neutral image, and so does a pose that is still loading or fails to decode (D147). Lifty art shows only once the neutral image exists: without it every pose stays vector, so Lifty never changes from one robot to another between a ride and an arrival (D141). The developer tools' pose picker still shows a lone pose for review. The game adds the hover (2.5 s cycle, at most 3 pt, off under Reduced Motion); do not paint motion blur.

## Mission objects

Repair kit, toolbox, spare parts, crew, beacon, loading dock. Transparent, standing on a baseline at y 0.95, centred. 512 x 320 (crew and loading dock 768 x 320). The game fits the image into the object slot on the landing floor (contain, bottom-aligned); the touch area is the slot, not the pixels. Collected objects slide toward the car and fade. Cargo crates are native views today: a crate art slot is not wired yet.

## Files and the manifest

```
assets/themes/elevator-quest/art/
  cabin/      backing.webp ceiling.webp floor.webp inlay.webp wall-left.webp wall-right.webp
              frame-top.webp frame-left.webp frame-right.webp door-left.webp door-right.webp light.webp
  lifty/      neutral.webp help.webp thinking.webp success.webp concerned.webp quiet.webp
  landings/<floor>/  background.webp [midground.webp] [<piece>.webp] [foreground.webp] [light*.webp]
  objects/    repair-kit.webp toolbox.webp spare-parts.webp crew.webp beacon.webp loading-dock.webp
  icons/      floor-<n>.webp   (optional, for the directory)
```

Lower case, hyphens, no spaces. WebP or PNG: the approved cabin and Lifty files are PNG (D144, D145). To add an image:

1. Put the file in its folder.
2. Add its entry to `content/themes/elevator-quest/art/manifest.json`: `id` (for example `landing.15.background`), `kind`, `file`, `width`, `height`, `alpha`, `provenance` (provider, AI-generated, human-reviewed, license), and the kind's keys (`layer`, `floor`, `state`, `rect`, `safe`, `signInk`, `depth`, `motion`, `hit`, `pose`, `visual`).
3. Add its record to `content/themes/elevator-quest/art/rights.json` (below).
4. While it is pending, add one static `require` line to `src/devtools/artReviewSources.ts` (developer Review mode only). After it is approved, move that line to `src/themes/elevator-quest/art/sources.ts`. The art tests check that every approved file is required from `sources.ts`, every pending file only from the review list, and a rejected file from neither.
5. Run `npm run validate:content`: the art tests decode every file in the art folder and check it against its entry (size, transparency), and refuse a damaged file or one with no entry. Then look at it in the browser build with the developer tools' Art section (Review, the overlays on) on iPad landscape, Fire, portrait and the narrow window.

Commit the image file exactly as the tool exported it. Moving a binary through a text channel (pasting, copying it as text, an editor that converts line endings) damages it: three files in 99be216 lost bytes that way, passed every other gate, and drew as half a wall over black and a Lifty with only his antenna.

Production shows an image only when its rights record says `approved` and human reviewed, and it is bundled. Until then the vector shows. Normally a person reviews each file before approving it (D145). In M8.1 the owner approved the whole pending set by instruction after an agent audit (D158); those records say so in `approvedBy`. The instruction covered that set only.

## Rights

Every production image has a record in `rights.json`: asset id, source, tool or artist (a role, never a private person's details), date, AI-generated yes or no, human-reviewed yes or no, license, modifications, approval (`pending`, `approved`, `rejected`), and who approved it (a role). Approval requires a human review (`humanReviewed: true`; for the M8.1 set the owner's instruction after an agent audit stands in for it, and `approvedBy` says so, D158). Third-party reference images are not used. Eight references are recorded under `references`, each with approval `reference-only`, human review required, and not stored in the repository: the concept pack, asset sheets A to F and the first back wall (its file is in git history at 0a29d1f), all made for this project with OpenAI image generation via ChatGPT, for visual concept, production reference or style reference. They can never be assets (the validator refuses one that tries), and production pieces are not cropped out of them: each production file is generated or drawn on its own at the sizes here.

## Generating with an image model

The first asset sheets (two 1536 x 1024 composite images, received 2026-10-07) set the look but are references only: each landing is about 240 x 200 px, wide rather than square, with labels and "Safe Area" marks painted in; sheet B has a painted checkerboard instead of transparency; sheet A's cut-outs are never fully opaque; NEXT JOB and a panel number are painted text; the directory icons repeat numbers and do not match the floors. Four more sheets (received later the same day) repeat the pattern: contact sheets with labels, painted checkerboards on two, perspective door leaves on two, a painted indicator on the door frame, digits on panel buttons, and Floor 7 and 13 look-alikes. Sheet 3 (recorded as sheet E) has the white and orange Lifty that best matches D137 and is the Lifty reference. Do not crop production files out of any sheet. Generate each file on its own, with the prompts in [ART_PROMPTS.md](ART_PROMPTS.md):

- One asset per image, at the runtime size or larger (the master size is better), square for landings, with generous bleed past the safe core. No contact sheets, labels, file names, guides, floor numbers, place names, logos or any other text.
- Transparent pieces on a real transparent background, with every intended pixel fully opaque and no checkerboard. If the tool cannot do that, use one flat colour that appears nowhere in the art (pure magenta), and say so: the cut-out is then made by hand and reviewed.
- Landings: the hero in the middle, a blank sign plate high centre, a floor surface in front for objects, the moving piece painted separately on transparent, at rest.
- Same light, line weight and palette across the set: generate the cabin first, then use it as the style reference for each landing and for Lifty.

### Per-floor briefs (originality, D138)

Production art moves further from recognisable franchise visuals than the sheets did. Broad genre only.

- **Floor 7 PLATFORM HEIGHTS**: an original industrial aerial platform playground. Keep colourful vertical platforms, pipes, lifts, mechanical obstacles and playful platform-game energy. Avoid question-style blocks, familiar green-pipe proportions and colours, coin rows and any other franchise-coded object.
- **Floor 9 WIND RUINS**: the strongest reveal in the tower. Huge open sky, ancient mechanical architecture, floating ruins, massive wind turbines (one is the moving piece), suspended bridges, fabric moving in the wind, clouds below parts of the scene. No temple symbols or emblems borrowed from any game.
- **Floor 13 BLOCK BUILDER**: an original futuristic modular construction world. Keep voxel and block construction, cranes (the hook is the moving piece), carts, modular building and a cubic landscape. Avoid grass-topped dirt-block textures, blocky trees, a familiar minecart look and familiar block palettes.
- **Floor 15 PRIMARY POWER**: one base scene plus a dormant overlay (dark, unpowered) and a restored overlay (the warm powered glow); the core is the touchable moving piece.
- **Floor 20 ROOFTOP GOLF**: the top floor, and it should feel special. A rooftop course with the skyline below, dramatic height, a putting green right outside the lift, a flagstick (the moving piece), playful golf obstacles, the course continuing around the tower. There is no Floor 21.

### Review checklist (before approval in rights.json)

Size and format as specified; real transparency where asked and fully opaque elsewhere; no text, numbers, guides or logos; illustrated to the concept pack's level (line work, two or three value bands, readable materials), since flat shapes at the vector's level of detail add file weight and nothing else; the sign plate blank; nothing over the sign zone; the hero inside the safe core; the style matches the cabin; the per-floor brief kept; checked in the browser build on iPad landscape, Fire, portrait and the narrow window with the overlays on.

## What to supply, in order

The minimum for the first visual pass (the "proof floors"), in this order, so each step can be checked in the game before the next:

1. Cabin: the 12 cabin files above (backing and both leaves first).
2. Lifty: neutral first, alone (no Lifty art shows without it), then the other five once neutral is approved.
3. Floor 15 PRIMARY POWER: background (with `hit` on the core piece), `core.webp` (moving, tilt or no motion, trigger touch), `light-dormant.webp`, `light-restored.webp`.
4. Floor 9 WIND RUINS: background, `turbine.webp` (spin, arrival).
5. Floor 20 ROOFTOP GOLF: background, `flag.webp` (tilt, arrival).
6. Floor 13 BLOCK BUILDER: background, `hook.webp` (tilt, arrival).
7. Floor 7 PLATFORM HEIGHTS: background, `platform.webp` (slide, arrival).
8. Mission objects: the 6 object files.

That is 12 + 6 + 4 + 2 + 2 + 2 + 2 + 6 = 36 files. Optional after that: midground and foreground layers for the proof floors, directory icons, then the other floors one at a time after the Fire memory measurement. (What happened: the landings were made as backgrounds plus a few props rather than this layer list, and all twenty were made (D150, D157, D164) and approved (D158, D164) before the Fire measurement; the mission objects are still to make.)
