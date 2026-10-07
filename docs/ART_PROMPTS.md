# Art prompts (Elevator Quest production files)

One prompt per file, for an image-generation tool, then a person reviews the result against the checklist in [ART_ASSET_SPEC.md](ART_ASSET_SPEC.md). Asking for a whole set in one image returns a contact sheet (labels, a painted checkerboard, thumbnails), which cannot be used. Six such sheets have been received so far and all are references only (D138).

## How to use

1. Start a fresh image request for each file. Paste the style block, the never block, then the file's prompt.
2. Attach the style references named in the file's prompt. Once the cabin backing is approved, attach it to every later request so light, line weight and palette match.
3. Ask for the largest size the tool offers at the aspect given. The runtime sizes are in ART_ASSET_SPEC.md; files are exported down to them in the repository.
4. Name the file as listed and send it as its own file, not a screenshot. Commit the exported file untouched: a binary that passes through a text channel loses bytes (99be216), and the art tests refuse it.
5. Strips with extreme proportions (ceiling, floor, side walls) are generated at an ordinary aspect; the runtime strip is cut from the middle when the file is added. The frame is generated whole and its three strips are derived from it (ART_ASSET_SPEC.md "Deriving the frame strips"). Say nothing about strips in the prompt.
6. Only image-generation or illustration output is a production candidate. Shapes drawn by a script (Pillow, SVG, Skia rectangles), calibration patterns and crops from a contact sheet are not, whatever they look like (D141, D142).

## Style block (paste first, every time)

```
Premium animated-adventure game art for a children's educational elevator game (ages 7 and up, not preschool). Cel-shaded 2D with a 2.5D sense of depth: strong, clean dark outlines; two or three flat value bands per surface; a crisp highlight edge and a darker dimensional lip on every metal edge; warm brass and gold metal, deep navy panels, cool cyan light, small warm orange accents. Dimensional, not flat. Colourful but controlled, readable at tablet size, calm, no visual noise. Original design.
```

## Never block (paste second, every time)

```
Do not include: any text, letters, numbers, digits, labels, signs, arrows, file names, captions, logos, watermarks, guides, safe-area marks, grids, a checkerboard pattern, a contact sheet or several items in one image, borders around the image. No characters or objects from existing games or films. No red except for genuine danger.
```

## This batch: the cabin and Lifty's master pose (D142)

Five pieces, in this order, each its own request: `cabin/backing`, the cabin frame, `cabin/door-left`, `cabin/door-right`, `lifty/neutral`. Nothing else until these are reviewed: the cabin shows in the game only when the backing, the three frame strips and both doors are all present (CABIN_REQUIRED), and Lifty art only when neutral is.

Style references: the first back wall (recorded under `references`; the file is in git history at 0a29d1f, `git show 0a29d1f:assets/themes/elevator-quest/art/cabin/backing.webp`) for materials and light, until the new backing is approved; from then on, the approved backing. Asset sheet E for Lifty. Never the rejected Quiet (99be216) or the damaged files.

- `cabin/backing` (square 1:1, opaque, 1280 x 1280 runtime): "The back wall of a lift car, seen flat and straight on from inside, symmetric, like an elevation drawing. Rich brass-framed deep navy wall panels with visible construction: brass mullions with bevelled edges and dark lips, recessed panel insets with two or three value bands, a few tasteful rivets. Two warm brass wall lamps and two cool cyan light columns, placed in two narrow vertical bays, one on each side, about one tenth to one fifth of the width in from each side edge, in the middle height of the wall. Keep the whole middle of the wall, from 18 to 82 percent across, as calm, plain navy panelling with soft cyan light falling on it. Do not draw any door, doorway, door frame, opening, indicator or display: the game places its own frame and doors over the middle. No side walls, ceiling or floor in perspective. Fill the whole image edge to edge."
- `cabin/frame` (4:3 landscape, the opening transparent or one flat pure-magenta fill): "A heavy lift door portal seen straight on and flat, not in perspective: a top lintel and two side jambs of the same thick profile, warm brass over deep navy, with visible thickness: a bright bevelled outer edge, a darker recessed lip on the inner edge toward the opening, and a small even row of brass bolts along the middle of each side. The profile is exactly the same all along each side (no ornaments, no panels, no changes along the length) so it reads as one solid machined frame. Simple square corners. Nothing on the frame: no indicator, no arrows, no lights, no buttons. Even, neutral light from straight above, no glow." The three runtime strips (frame-top, frame-left, frame-right) are cut and extended from this one image, as ART_ASSET_SPEC.md describes.
- `cabin/door-left` (1:2 portrait, opaque, 384 x 768 runtime): "One flat sliding lift door leaf, seen straight on, not hinged and not in perspective, as if it slides sideways: brushed deep navy metal with strong cel-shaded bands, a warm brass trim along its edges, and a restrained geometric brass line motif in the lower half. Along the right-hand (meeting) edge, a plain dark vertical strip from about 76 to 89 percent of the width, from top to bottom, with nothing drawn on it. Even light from straight above, so the leaf can be mirrored. Fill the image edge to edge."
- `cabin/door-right` (1:2 portrait, opaque): attach the approved `door-left` and ask for "the matching right-hand leaf of the same sliding pair: identical materials, trim and motif, mirrored, with the plain dark vertical strip along the left-hand (meeting) edge from about 11 to 24 percent of the width". If the tool cannot match it, a horizontal mirror of the approved left leaf is an acceptable technical export (recorded in its rights record), because the light comes from straight above.
- `lifty/neutral` (square 1:1, real transparency, 512 x 512 runtime, the master pose): "Lifty, a compact floating maintenance robot and a small technical companion, not a toy and not a baby. White and orange mechanical body with panel seams, a rounded but not oversized head, a dark glass screen for a face showing a gentle cyan smile and two calm cyan eyes drawn as bold, simple glowing shapes on the screen (no physical eyes), a small antenna with a round tip, arms built from segments with visible shoulder, elbow and wrist joints, no legs and no feet: under the body a compact hover assembly with a small cyan jet glow. Calm, competent and ready to help, arms relaxed at the sides. Facing slightly to the right, whole figure visible and centred, kept inside the middle 70 percent of the image width; the antenna tip near the top edge and the hover glow near the bottom edge, so the robot fills about 90 percent of the image height. Strong clean outline, the same cel shading as the cabin. Alone on a real transparent background." The game draws him 98 to 132 pt square (ART_ASSET_SPEC.md "Lifty"): check the face at those sizes, not zoomed in.

## Later cabin files (after the batch above is approved)

- `cabin/ceiling` (16:9 landscape, opaque): "The ceiling of the same lift car seen from below and slightly ahead: a brass-rimmed round light panel in the middle, navy panels, fill the image edge to edge."
- `cabin/floor` (16:9 landscape, opaque): "The floor of the same lift car seen from standing height, looking toward the doors: dark navy tiles with brass seams, fill the image edge to edge. No compass, no inlay."
- `cabin/inlay` (4:1 landscape, transparent): "A brass compass-rose inlay set in the floor, seen in the same low perspective as a floor, alone on a transparent background."
- `cabin/wall-left` and `cabin/wall-right` (2:3 portrait, opaque): "The left (right) side wall of the same lift car, seen at a steep angle from inside: navy panels with brass trim and one warm wall lamp, fill the image edge to edge. No handrail."
- `cabin/light` (4:3, transparent): "Soft light only, no objects: two pools of cool cyan light falling from the top of the image, fading to fully transparent. No hard edges, no glow rings."

## Lifty's other poses: production plan (D145, D147)

Status (2026-10-07): all five made from the master this way and pending the owner's review (D147). The character board is `node scripts/lifty-board.js` (web-screenshots/lifty-character-board.png).

The approved `lifty/neutral` (`assets/themes/elevator-quest/art/lifty/neutral.png`, 512 x 512) is the character master. Every other pose is an edit of that image, never a new drawing of "a robot like Lifty". Until a pose is approved the game shows the neutral image for it, so a weak pose costs nothing to reject.

### What never changes (reject on any drift)

- Head: the rounded white shell with the orange stripe over the crown, the orange ear discs with dark centres on both sides, the same size against the body.
- Screen: the dark glass rounded rectangle with its thin dark bezel and the small gloss at the top right, the same shape and size. Measured on the master: 146 px wide at 512, from bezel to bezel along the eye row (the board script measures it).
- Antenna: one thin dark stalk from the upper left of the head with an orange ball tip.
- Neck and body: the dark collar with its cyan strip; the white body with the orange chest plate, orange lower side panels, two small dark bolts and the panel seams.
- Arms and hands: orange shoulder pads on dark ball joints, white and orange segments, dark elbow and wrist joints, dark three-fingered hands with a thumb. Same segment count and lengths.
- Hover assembly: the dark waist, the orange ring and the cyan jet under it. Measured on the master: jet centred at x 0.515, its bottom at y 0.823 (99th percentile of its cyan pixels). No legs, no feet.
- Colours, materials, outline weight and cel shading: identical to the master. The screen expression stays cyan in every pose. One exception, by the owner's decision (D147, restoring D137): Concerned carries a thin, restrained warm amber line at the screen's edge, like a status light that says "let's work this out"; never the whole face, never red. No other new colour anywhere.

### What may change

The arms, a body or head tilt of at most about 5 degrees, and the cyan shapes on the screen. Nothing is added: no props, no symbols, no motion lines, no sparkles, no text.

### The five poses

| Pose | Game moment (`liftyArtPose()`) | Arms and tilt | Screen |
|---|---|---|---|
| Quiet | every ride where Lifty says nothing, hall calls, repositioning | both arms tucked in close to the body, hands resting near the hover ring, upright | two thick, gently curved closed-eye lines and a small calm mouth: resting, not asleep |
| Success | the job is done (each arrival) | both forearms raised to about head height in a small, contained cheer, hands open, upright | eyes as two upturned arcs, a wider smile. No check glyph: the face is Lifty's, the check stays the vector fallback's |
| Help | help offers and clues; he points toward the panel, on the right of the screen | the arm on the right of the image bent at the elbow, forearm angled up and to the right, one finger pointing; the other arm relaxed; leaning a touch toward the point | the two ovals shifted toward the pointing side, attentive, small open smile |
| Concerned | a wrong floor or a Concept Rescue | leaning in about 5 degrees, one hand raised loosely in front of the chest, the other relaxed | smaller, rounder cyan eyes and a short flat or slightly wavy mouth: puzzled and ready to work it out, never sad or scared; a thin warm amber line along the inside of the bezel (D147), never red |
| Thinking | working something out with the learner | one hand raised to just under the screen, as if at the chin; head tilted about 4 degrees | the ovals shifted up and to one side, a small flat mouth |

Make them in that order: Quiet and Success first, because the game shows them on every ride and every job; then Help, Concerned, Thinking. Every hand stays inside the canvas with clear edges, within x 0.12 to 0.88 (Lifty's figure box lets the left 12% hang behind him): that is why Help points up and to the right with a bent arm instead of a straight arm sideways, and why Success keeps its hands near head height. Help's finger reaches x 0.88 and Success's hands x 0.16 to 0.86 (D147).

### Making each file

1. Upload the master to the image tool as a reference (Canva: `create-upload-url` with `lifty/neutral.png`, then `generate-image` with that media as `imageReferences`). Text-only generation is not allowed for poses: it redraws the robot.
2. Prompt: the style block, the never block, then: "Edit the attached robot. Keep his head, screen, antenna, body, joints, hands, hover ring, colours and line weight exactly as they are. Change only his pose: <arms and tilt from the table>. His screen shows <screen from the table>, in the same cyan. Same size and position in the frame, alone on a plain white background."
3. Make three or four candidates and keep the closest to the master. Never repaint, recolour or patch a candidate in code: if a candidate drifts, generate again (D141, D142).
4. Cut-out: Canva background removal, then export the page with a transparent background (Canva Pro, D147). The white-and-magenta recovery used for the master (D144) gives exactly the same alpha (checked on Quiet: no pixel differs) and stays the fallback without Pro. Record each step in the rights record.
5. Registration, so swapping poses never makes him jump or change size: Canva keeps the frame of the edited image, so use the master's own 1024-to-512 scale (0.4989) and move the pose so its hover jet sits on the master's (x 0.515, bottom y 0.823). Then check the screen width stays within 3% of the master's 146 px and the whole figure stays inside the canvas with clear edges (the art test checks the jet and the edges). Scaling each pose to its bounding box instead would shrink Lifty whenever his arms go up.
6. Add the file as `lifty/<pose>.png` (512 x 512, RGBA): a manifest entry (kind `lifty`, the pose, alpha true), a pending rights record, a line in `src/devtools/artReviewSources.ts`. The rejected procedural Quiet stays on record as `lifty.quiet-rejected` (`lifty/quiet-rejected.png`): a rejected asset fills no slot, so the new candidate takes `lifty.quiet` (D147).

### Review and approval

- Automatic: `npm run verify` (the art file check decodes it and checks size, transparency, clear edges, no colour fringe and the hover-jet registration), `npm run validate:content`.
- Side by side with the master at 512 px and at the game's sizes (about 105 to 132 pt): head, screen, antenna, hands, ring and colours must match by eye, piece by piece.
- In the game: `?open=devtools&art=review&liftyPose=<pose>` on iPad, Fire, narrow and Slide Over (`npm run web:screenshots -- --only pose-` captures each pose in its moment: a ride, the Success Replay, a clue, a wrong floor, a Concept Rescue mis-count), checking the expression reads without zooming and nothing covers the controls or mission objects.
- The owner approves, revises or rejects each pose on its own. Approval moves its line to `art/sources.ts`, as for the first eleven files (D145).

## Landings (square 1:1, opaque unless noted)

Every background: "The view through an open lift door into a place, seen straight on at standing height. The main feature of the place in the middle. A blank flat sign plate high in the centre (plain, nothing on it). A clear, readable floor surface across the lower middle where small objects can stand. Atmosphere around the edges. Fill the image edge to edge."

- `landings/15/background`: "PRIMARY POWER: a large engine room with a big power core machine in the middle behind a railing walkway, pipes and gauges at the sides, the machine at rest (no glow inside it)." Then `landings/15/core` (transparent): "The power core's central glowing cell alone, at rest, on a transparent background." `landings/15/light-dormant` (transparent): "A dark navy shadow wash with soft edges, alone, for an unpowered room." `landings/15/light-restored` (transparent): "Warm golden light radiating from the centre, fading to transparent, for a room powering up."
- `landings/9/background`: "WIND RUINS: huge open sky, ancient mechanical architecture, floating stone ruins, a suspended bridge, fabric banners blowing in the wind, clouds below parts of the scene, giant wind turbines in the distance. A strong sense of height." Then `landings/9/turbine` (transparent): "One large three-bladed wind turbine rotor, front on, at rest, alone on a transparent background."
- `landings/20/background`: "ROOFTOP GOLF: a rooftop golf course at the top of a tall tower, a city skyline far below, dramatic height, a putting green right in front of the lift, playful course obstacles, the course continuing around the tower." Then `landings/20/flag` (transparent): "A golf flagstick with a small pennant, upright, at rest, alone on a transparent background."
- `landings/13/background`: "BLOCK BUILDER: an original futuristic modular construction world: clean geometric blocks in teal, white and amber, construction cranes, rails with small carts, a cubic landscape being assembled. No grass-topped dirt blocks, no blocky trees." Then `landings/13/hook` (transparent): "A crane hook hanging from a short cable, at rest, alone on a transparent background."
- `landings/7/background`: "PLATFORM HEIGHTS: an original industrial aerial platform playground high in the sky: colourful vertical platforms at different heights, steel pipes and lifts, mechanical obstacles, playful energy. No question-mark style blocks, no green warp pipes, no coins." Then `landings/7/platform` (transparent): "One small colourful floating industrial platform, side on, alone on a transparent background."

## Mission objects (transparent, 3:2 landscape, standing on the bottom)

Each: "alone on a transparent background, seen from the front and a little above, standing on the bottom of the image, centred, no shadow on the ground."

- `objects/repair-kit`: "A sturdy portable repair kit case, bright orange with a white wrench emblem shape (no text)."
- `objects/toolbox`: "A metal toolbox with a handle, steel blue and brass."
- `objects/spare-parts`: "A small neat pile of machine parts: gears, a bolt, a spring, a bracket."
- `objects/crew` (wide, 2:1): "Three friendly maintenance workers side by side in safety vests and hard hats, varied, cartoon style, waving or ready to work."
- `objects/beacon`: "A small floor beacon light on a striped base, glowing cyan at the top (not red)."
- `objects/loading-dock` (wide, 2:1): "A low loading dock platform with a ramp and a couple of stacked crates."

## After generating

Send each file as itself. It gets checked against the review checklist (ART_ASSET_SPEC.md), exported to its runtime size, entered in the manifest and the rights record (pending until a person approves it), and looked at in the browser build with the art overlays on.
