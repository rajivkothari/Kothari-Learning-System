# Tower Rescue expansion stations — integration note

**PENDING OWNER APPROVAL — all nine new exports and their masters.** Creative branch `codex/tower-rescue-expansion-art`, engineering baseline `bd5390e` (D196). Pack: `assets/candidates/tower-rescue-expansion/v01/`. No production registration, gameplay, animation, learning, persistence, evidence or approved-art changes.

The pack extends the approved D195 steel machinery: orthographic faces, dimensional bevels, navy/graphite surfaces, warm upper-left lighting. Built-in OpenAI image_gen made one isolated asset per call. The tool did not return a model identifier. Exact prompts and reference roles are recoverable in `generation.json`; the candidate manifest records bytes, SHA-256, transparency and unchanged masters. Tablet preparation uniformly resamples the full source canvas with jimp-compact 0.16.1; no repainting, trimming or extraction from a sheet. Masters are source/review files, not bundle files. Tool-generated master sizes are listed in that manifest; no additional large versions were generated.

## Delivery and dynamic zones

Coordinates below are **export canvas pixels**, including transparent margins, measured from its top-left. Rectangles are conservative authoring guides checked against the final exported faces, not production hit areas. Use uniform fit and apply its offset/scale to these coordinates. Never stretch or auto-trim.

| Export | Canvas | Dynamic content / reserved interior |
|---|---|---|
| fan-control-face.png | 512 × 256 | Sequence/title: x54–327, y90–172. Dial socket centre approximately (410,135); knob separate. Status well x403–450, y66–80. |
| fan-control-knob.png | 128 × 128 | Pointer is integral to knob; no text. Approximate visual axis (64,64), normalised (0.5,0.5). |
| gearbox-housing.png | 512 × 256 | Gear mounts approximately (244,120) and (397,121). Native annotation plate x188–436, y192–211; one 16 px line only. |
| gear-large.png | 256 × 256 | Axle pivot (130,129), normalised (0.5078125,0.50390625). |
| gear-small.png | 128 × 128 | Axle pivot (63.5,64), normalised (0.49609375,0.5). |
| sensor-panel.png | 512 × 384 | Dark reading face x88–426, y92–244; bottom status/scroll-cue well x135–375, y276–290. |
| safety-clipboard.png | 512 × 384 | Ivory paper x80–434, y112–310. Keep content below the steel clip. |
| inspection-board.png | 512 × 384 | Light display x89–425, y101–280; bottom neutral well x172–342, y316–329. |
| routing-display.png | 512 × 384 | Dark display x92–425, y104–280. Current/target/direction/progress are native. |

Both gear pivots come from the alpha-under-32 connected axle-hole bounds: large [106,106,154,152], small [53,54,74,74]. The knob has no transparent hole; its axis is a visual registration recommendation. Housing socket centres are measured visual guides. Check registration after mapping to live boxes. The gears have eight visible teeth: **tooth count does not encode the ten-floor or one-floor rule**.

The generated scenes contain passive cyan/amber metal accents and steady warm work lights. These do not signify a correct answer or a powered sensor. Code supplies explicit state lamps, text and selection shapes; no additional powered/unpowered paintings are needed. The gearbox's dark mounting openings sit behind the separate gears' transparent axle holes.

## Exact layering and code responsibilities

Back to front:

1. Existing approved room wall, with existing machine housings and their current moving pieces.
2. Station mounting face: fan-control face, gearbox housing, sensor panel, clipboard, inspection board or routing monitor. Each appears only for its existing station step.
3. Independent fan knob and big/small gears, aligned to the fixed mounts above. In the overview composition the knob uses a 112 px canvas; gear canvases use 116 px and 74 px.
4. Native values, sequence gaps, reports, questions, floors, move quantities and help markup, inside the safe interiors. Keep answers and HINT controls outside artwork or in an explicitly reserved live area.
5. Native status lamps, selected outlines and still-state feedback, over the station face but below its text where overlap would obscure reading.

Rotate the knob/pointer as one sprite. Rotate gears around the measured axle pivots, independently of their housing. All state changes, route progress, movement arrows, highlighted checklist items, reading scroll/cue and any future approved rotation belong in code. No animation code is supplied. Preserve existing Reduced Motion handling and avoid movement before a system's state is known.

**Preserve D196 mechanics.** `DialStation` renders a linear sequence with one missing setting and separate choices; its five positions belong on the broad face, not around a radial dial. The knob may reinforce selection without becoming a new rotary input or revealing the missing answer. `FloorStation` keeps its tens/ones move descriptions, folded floor scale and floor choices; the gearbox must not imply that teeth should be counted or its two separated drives should mesh. Route art frames the same moves and floor scale, not a new map puzzle. `ReadStation` retains its existing passage/question and choice tiles: sensor readings remain the authored log, not a new table interaction. Safety and inspection remain different reading objects.

At a 500 px landscape reading canvas, the sensor has less passage height than the existing cream report card. Keep 22 px standard reading type, reuse the existing scroll/more-below affordance, and let long reports scroll; do not hide the question or shrink type to fit a bezel. The final reading mockups place the question visibly below the instrument and above its native choices, keeping the report on the face. A vertically repeated/stretched image is not allowed. When a long live report requires more room, keep native report flow beside the instrument instead of squeezing all text inside it. Choices retain native touch bounds. The overview is a **station design display**, not a simultaneous game-screen redesign.

## Known layout issues — hand back to Claude

| Issue supplied in brief / D195 | Source inspected | Recommendation |
|---|---|---|
| iPad landscape: about 100 pt wall above tall housings | `towerArt.ts` `housing()` selects the nearer aspect, then `contain(...,'bottom')` width-limits the tall asset. | **Code adjustment; no new art.** Centre the housings vertically or allocate a better-proportioned bay/label region. The empty wall is a fit/layout consequence, not transparent source padding. Do not stretch or chop hardware to fill it. |
| Fire portrait: delivery robot about 35 pt tall; package weak | D195 report; `carPlacement()`, `robotPlacement()` and full-body source registration in `towerArt.ts`. | **Code adjustment; no new art.** Enlarge the existing car/doorway and robot presentation together, preserving package/floor anchor and masking. A body crop would remove the delivery pose/package; a guide-head crop cannot substitute for delivery. Aim for at least roughly 60 pt visible robot height as an art recommendation, then verify on device. |
| 90 pt power cell: two digits near plate bevel | `CellFace()` derives its value box from `piece.entry.plate`; `cellSide()` is bounded 90–124 pt. | **Code adjustment; no new art.** Inset the native value box farther inside the flat plate and allocate enough cell width for +two digits; preserve the label-size floor. Cropping the cell cannot widen its plate. |

No compact variant or crop of approved assets was generated. The new control/gearbox faces are already wide and shallow; the new reading boards use landscape 4:3 even in portrait, keeping large content zones. For smaller views, simplify peripheral fasteners by size/visibility; do not reduce the primary displays or label sizes. These recommendations come from code and image review plus the supplied D195 findings; their quoted physical sizes were **not remeasured in a live game this task**.

## Lifty Quiet

**Rejected pose unused / safe to remain rejected.** `content/themes/elevator-quest/art/rights.json` keeps `lifty.quiet-rejected` rejected; `src/themes/elevator-quest/art/sources.ts` has no source for that id. `productionArt()` admits approved, human-reviewed records with a source only. Live `liftyArtPose()` requests `quiet` for system checks/silent travel, but that resolves to the separate approved `lifty.quiet` entry and `lifty/quiet.png`. Do not confuse the mood with the rejected file. No replacement made.

## Audio handoff

No audio generated or modified. Dedicated sounds would improve a selected detent (dial click), completed gear-drive movement (gear clunk), and sensor scan/confirmation (sensor beep). Each needs a separately approved semantic slot and asset; do not infer approval from this art pack.

Source compatibility check only: the screen currently uses `floorButtonPress` for touch and `chooseSounds()` for station outcomes (`answerRight`, `answerWrong`, `coreHum`). Existing approved profile mappings also include `gaugeTick` and `cratePlace`; the former is a possible temporary soft detent and the latter a possible temporary mechanical seating cue, subject to engineer review. They are not dedicated dial/gear/sensor slots. No compatibility listening or device audio test was performed.

## Inspected sources

`CLAUDE.md`, `docs/AI_WORKFLOW.md`, `PROJECT_STATE.md` at `bd5390e`, decisions D193–D196, `ART_DIRECTION.md`, `ART_ASSET_SPEC.md`, `ART_PROMPTS.md`, current Tower Rescue section in `ELEVATOR_QUEST.md`, original approved pack integration/approval records, approved production room/fan/gear/shaft images, `TowerRescueScreen.tsx` (`DialStation`, `FloorStation`, `ReadStation`, `CellFace`), `towerArt.ts`, `feel.ts`, `towerRescue.json`, Lifty pose/source/rights selection, and audio profile. No production sources changed.
