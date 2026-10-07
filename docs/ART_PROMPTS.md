# Art prompts (Elevator Quest production files)

One prompt per file, for an image-generation tool, then a person reviews the result against the checklist in [ART_ASSET_SPEC.md](ART_ASSET_SPEC.md). Asking for a whole set in one image returns a contact sheet (labels, a painted checkerboard, thumbnails), which cannot be used. Six such sheets have been received so far and all are references only (D138).

## How to use

1. Start a fresh image request for each file. Paste the style block, the never block, then the file's prompt.
2. Attach the style references named in the file's prompt. Once the cabin backing is approved, attach it to every later request so light, line weight and palette match.
3. Ask for the largest size the tool offers at the aspect given. The runtime sizes are in ART_ASSET_SPEC.md; files are exported down to them in the repository.
4. Name the file as listed and send it as its own file, not a screenshot. Commit the exported file untouched: a binary that passes through a text channel loses bytes (99be216), and the art tests refuse it.
5. Strips with extreme proportions (ceiling, floor, side walls, frame) are generated at an ordinary aspect; the runtime strip is cut from the middle when the file is added. Say nothing about strips in the prompt.

## Style block (paste first, every time)

```
Premium 2D game art for a children's educational elevator game (ages 5 to 10). Cel-shaded illustration with clean dark line work, two or three flat value bands per surface, a crisp highlight edge and a darker lip, warm brass and gold metal with cool cyan light, deep navy panels. Readable at tablet size, calm, no visual noise. Original design.
```

## Never block (paste second, every time)

```
Do not include: any text, letters, numbers, labels, file names, captions, logos, watermarks, guides, safe-area marks, grids, a checkerboard pattern, a contact sheet or several items in one image, borders around the image. No characters or objects from existing games or films. No red except for genuine danger.
```

## Cabin (12 files, square or 4:3 unless noted)

Start with `cabin/backing` (the back wall) on its own. Once it is approved, attach it to every other cabin request, then to Lifty and the landings, so light and materials match. The first back wall received (2026-10-07) has the right materials and light, so it serves as the style reference (recorded under `references`; the file is in git history at 0a29d1f), but its painted doorway and 4:3 shape do not fit the game (D140). The second attempt (99be216) was drawn by a script, not an image tool: flat shapes at the vector's level of detail, lamps behind Lifty's words, and a damaged file (D141). Regenerate it with an image tool and the prompt below.

- `cabin/backing` (square 1:1, opaque): "The back wall of a lift car seen flat and straight on from inside, symmetric, like an elevation drawing: brass-framed navy wall panels, two warm wall lamps and two cool cyan light columns. Place the lamps and light columns in two narrow vertical strips, one on each side, between 15 and 24 percent of the width in from each side edge, and between 42 and 72 percent of the height down from the top. Keep the upper 40 percent of the wall plain panelling, and keep the middle half of the wall (from 24 to 76 percent across) plain, quiet panelling from top to bottom. Do not draw any door, doorway, door frame or opening (the game places its own door frame and doors over the middle). No side walls, ceiling or floor in perspective. Fill the whole image edge to edge."
- `cabin/ceiling` (16:9 landscape, opaque): "The ceiling of the same lift car seen from below and slightly ahead: a brass-rimmed round light panel in the middle, navy panels, fill the image edge to edge."
- `cabin/floor` (16:9 landscape, opaque): "The floor of the same lift car seen from standing height, looking toward the doors: dark navy tiles with brass seams, fill the image edge to edge. No compass, no inlay."
- `cabin/inlay` (4:1 landscape, transparent): "A brass compass-rose inlay set in the floor, seen in the same low perspective as a floor, alone on a transparent background."
- `cabin/wall-left` and `cabin/wall-right` (2:3 portrait, opaque): "The left (right) side wall of the same lift car, seen at a steep angle from inside: navy panels with brass trim and one warm wall lamp, fill the image edge to edge. No handrail."
- `cabin/frame` (4:3, transparent): "A brass and navy lift door frame seen straight on and flat: a top lintel and two side jambs of even thickness, the opening fully transparent. No indicator, arrows or lights on the frame." (cut into frame-top, frame-left and frame-right)
- `cabin/door-left` and `cabin/door-right` (1:2 portrait, opaque): "One sliding lift door leaf seen flat and straight on, not in perspective: brushed navy metal with a brass edge trim and a simple brass line motif. A plain dark vertical strip near the inner (meeting) edge, about one eighth of the leaf wide, with nothing drawn on it." For the left leaf the meeting edge is the right side; for the right leaf, the left side.
- `cabin/light` (4:3, transparent): "Soft light only, no objects: two pools of cool cyan light falling from the top of the image, fading to fully transparent. No hard edges, no glow rings."

## Lifty (6 files, square, transparent)

Attach asset sheet E (the white and orange hovering Lifty) as the character reference. Every pose: "Lifty, a compact maintenance robot: white and orange mechanical body with panel seams, a dark screen for a face with the expression drawn in bold, simple glowing cyan shapes on the screen (no physical eyes), a small antenna with a round tip, clear mechanical joints at the shoulders and elbows, no legs or feet: he hovers on a small cyan hover-jet glow under the body. Expressive, not babyish. Facing right, whole figure visible, centred, the hover glow at the bottom of the image with a little space above the antenna, alone on a transparent background." The game draws Lifty in a box about 88 points square, so the expression must read at that size.

Generate `lifty/neutral` first and review it in the game: no Lifty art shows until it exists (D141), and the other five poses must match it (same body, proportions, colours, screen shape and line weight; only arms, tilt and the screen expression change).

- `lifty/neutral`: "Calm, ready, arms relaxed, a gentle cyan smile on the screen."
- `lifty/help`: "Pointing clearly to the right with one arm, attentive cyan expression."
- `lifty/thinking`: "One hand at the chin, cyan expression looking up and to the side."
- `lifty/success`: "Both arms raised in a small cheer, happy cyan expression. No confetti, no sparkles."
- `lifty/concerned`: "Leaning in slightly, one hand at the chest, a puzzled cyan expression, warm amber accent light on the screen edge, never red."
- `lifty/quiet`: "Floating still with both arms tucked in close to the body (not spread), the screen showing two gently closed, thick cyan eye lines, calm."

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
