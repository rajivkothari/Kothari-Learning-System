# Art Direction

How the game looks and moves, across every world. Read this before drawing anything, adding a world, or touching `src/presentation/design/`. Learning rules live in LEARNING_MODEL.md. Nothing visual may change what a learner is asked or how it is scored.

Worlds are named by concept, never by a learner: Engineer World (Elevator Quest, archetype learner-engineer) and Story World (Magic Tower, archetype learner-storyteller).

## Identity

2D and 2.5D, cel-shaded, like a hand-made animated adventure. Not a worksheet with stickers, and not a realistic 3D render.

- Flat value bands, two or three per material: shadow, base, light. Hard edges between bands. No soft gradients doing the shading.
- Selective dark edges: an outline only where a shape needs separating from its neighbour (a door seam, the bottom of a panel), never a uniform stroke around everything.
- Graphic highlights: a single pale stripe or band toward the key light. Never a glossy blur.
- Depth by layering, not by perspective math: background, midground, gameplay plane, foreground.
- The place matters. The Floor 15 cabin is a room with walls, lights and labels, so the learner is somewhere, not looking at a menu.

Implementation: `src/presentation/design/tokens.ts` (`celBands(material)` returns the three bands plus an edge color), drawn with plain Skia rectangles and paths. No textures, particles, blur stacks or video.

## Hierarchy and attention

Every screen has one attention order, set by size, light and position. For Floor 15:

1. mission status (small, top left: what we are doing)
2. the floor indicator (top center, the brightest amber on screen)
3. the doors and the landing (center: the consequence of the last action)
4. the panel (the hero object, beside the cabin)

Lifty stands in the scene at eye level, between the indicator and the door frame, with the line in a speech bubble beside it (M7). It explains, it does not compete, and it never covers the panel, the indicator, the doorway or a representation the learner is using. During a Concept Rescue the test-run board takes the stage under Lifty and everything else dims.

## Shape language

- Engineer World: rectangles with modest radii, bolts, seams, plates, labels in a condensed face. Machines look serviceable: you can see where a panel opens.
- Story World: rounder silhouettes, arches, hand-lettered display text, warmer edges.
- Interactive objects look like real objects of the world (a lift button, a lever, a book), not like app chips.

## Color philosophy

Roles, not raw colors. Components read `palette.accentPrimary`, `surface[2]`, `state.selected.ring`, never a hex.

Engineer World:
- base: charcoal, graphite, steel, deep navy (`void`, `surface[0..3]`, `metal`, `paint`)
- accents: amber and warm orange (indicators, selected calls), cyan (help, clues, the test run), cool white (working light)
- yellow (`warning`) and red (`danger`) only for genuine warnings. Overload is a warning. A wrong answer is not. Red is unused in Floor 15.

Contrast rules are tested (`src/presentation/design/design.test.ts`): body text 4.5:1 on every surface, accents and state colors 3:1, button labels 7:1 on their faces.

## Typography

Three roles, each a token (`type.display`, `type.ui`, `type.reading`):

| Role | Use | Engineer World |
|---|---|---|
| DISPLAY | titles, mission complete, power online | condensed heavy, uppercase |
| UI | buttons, labels, the checklist header | system sans, extra bold, uppercase, tracked |
| READING | Lifty's lines, the test-run captions | system sans, semibold, 20 pt, 27 pt line height, sentence case |

Lines stay short (under about 60 characters per line where the layout allows), large and high contrast. Story World swaps the DISPLAY face only (`STORY_WORLD` in tokens.ts proves the swap with a serif) and keeps READING and UI identical. System faces only for now: a bundled typeface needs a font asset, a license check and a Fire run.

## Interaction states

Floor buttons are hardware: steel bezel, recessed face, engraved number, lamp ring. Pure state logic in `ui/buttonLook.ts`, tested.

| State | Look |
|---|---|
| idle | dark face, white engraved number |
| finger down | face drops 3 px and scales to 95% on the UI thread, at once |
| selected (call registered) | amber lamp ring, warm face, pale amber number |
| current floor | small cool-white position lamp above the number, brighter rim. Never amber, so it cannot be mistaken for selected |
| clue | cyan ring outside the bezel. It points, it never fills |
| disabled | dimmed to 38%, muted number, no lamp, no clue |
| serviced | not a state but a transition: the lamp fades over the light ramp (450 ms, 150 ms reduced) instead of snapping off |

## Animation

Animation communicates cause, state, consequence or accomplishment. Nothing moves for decoration.

- cause: the button drops when pressed (immediate)
- state: doors, the indicator, the lamp ring
- consequence: the ride itself, the landing wall that appears when the doors open
- accomplishment: three sizes in tokens (`accomplishment.small/medium/large`). A right floor is small, a finished step medium, the power coming back large (an 1800 ms light ramp)

Parallax is subtle and earned by travel only. While the car moves, the shaft wall scrolls past the narrow vision panels in the doors (depth 1) and reflection streaks slide along the side walls (depth 0.35). It is a seamless sawtooth (`parallaxOffset`), so it never jumps. Lifty never idles or bounces. The only looping motion is the slow system-check scan line and the help pulse (scale and ring opacity, never a shadow glow), both 0.5 Hz.

## Reduced motion

Every motion token has a reduced equivalent (`motion.reduced`), never slower than normal. Under Reduced Motion:
- parallax is zero, so the vision panels and reflections stand still
- doors, rides and light ramps run the same sequence, shorter
- touch feedback stays immediate (it is feedback, not decoration)
- the help cue is static (thick border, ring and badge, no pulse), the scan line still
- Lifty moves to a new place instantly, the success replay shows all its steps at once

## Accessibility

ACCESSIBILITY.md is the rule set. Visual specifics:
- touch targets at least 64 pt (`minTouchTarget`), tested in layouts
- no flashing above 3 Hz, no sudden full-screen light changes. The power-restore ramp is one slow rise
- information never rides on color alone: selected has a lamp, current has a position lamp, clue has a ring
- painted signs drawn as vectors (the landing floor number) carry an accessibility label

## Performance

Cheap by construction: flat fills, a few paths, no blur masks in the cabin, no offscreen layers. A landing is at most 90 flat shapes (tested). The two frame callbacks (shaft map, cabin travel) run only while the car travels; until M7 they were registered for the whole session and returned early, which still cost a callback per frame. Reanimated transforms move the doors and parallax layers without React renders. None of this is measured on a Fire tablet yet. Renderer acceptance stays provisional until a Device Lab run exists.

## Engineer World

A working building. Graphite and steel structure, deep navy painted panels, amber indicators, cyan service lights, cool white working light. Maintenance labels, bolts, seams, an inspection plate. Machines are honest about how they work: the indicator counts floor by floor, the doors have a seam and a vision panel, the load meter has a red line.

Lifty is the Engineer World companion: a compact maintenance robot with a boxy body, a small digital display for a face, one articulated arm with a pointer tip, a tool clip, two status lamps and treads. No big eyes, no baby proportions, no constant bouncing. Six states, each a display glyph plus an arm pose (`ui/liftyPose.ts`): neutral (two bars), thinking (three dots), helping (arrow, arm raised toward the panel), concerned (a level line in amber, never red), satisfied (check mark), system check (scan line).

## Story World

Placeholder until designed. Direction: lantern-lit stone and paper, warm amber and soft sky blue, rooms that change as words are learned, narration first. The display face changes (storybook serif or hand lettering), the reading face does not. Do not ship `STORY_WORLD` tokens as designed: only the type swap is real.

## Portals

A portal is a door between worlds, drawn in the language of the world you stand in (a service door in Engineer World, a bookcase in Story World) with a glimpse of the destination's palette through it. Portals are never ranked, never "harder" or "easier", and never locked behind a purchase. The world decides the fantasy, the learner profile decides the challenge. See GAME_DESIGN.md.

## Themed floors

A floor is a small world inside a world. Each of Floor 15's 20 landings is data (`content/themes/elevator-quest/landings.json`, M7): a wall swatch, a light, a wall pattern, a sign with the place name and an emblem, a back doorway, one big room silhouette, a window, a few props. Swatches and lights are token roles (`places` in the tokens), kept away from the colors that carry meaning: indicator amber, help cyan, success green, warning and danger. Every floor has its own wall paint, silhouette and emblem, and any two floors differ in at least four features, so a floor reads before its number. Nothing drawn behind the painted floor number may make it hard to read (tested). The cabin stays the same; only the landing layer and its light spill change. Future themed floors reuse the cabin and add catalog entries, never components.

## Mistake and hint language

- No red X, no buzzer, no failure screen, no shake. The world shows the consequence: the car really goes to the floor you chose, the doors open on that floor's painted number.
- Then attention moves to helpful information: Lifty's display shows a level line in amber, the line names the givens, and the counting-convention marker may light the first floor after the start.
- Hints are visual and in-world: a cyan ring on a given (clue), the shaft map as a number line (visual tool), counting marks for the first two floors only (strategy). The answer itself is never ringed, except in the demonstrated step.

## Concept Rescue presentation

Calm mode. The cabin dims to 45%, the panel locks and dims, Lifty's display shows the help arrow. One board, one accent (cyan), one task: count a different example cell by cell. The start cell is dashed and labelled START, counted cells fill navy with a cyan edge and a MOVE n badge, the stop gets a calm green edge when confirmed. The board is titled TEST RUN, an engineering word, never "practice" or "lesson". No failure language anywhere.

## Mastery and bosses (future)

Mastery shows as the world changing, not as a score: a floor's lights come back, a machine starts working, a shortcut opens. Bosses are voluntary, announced, and remember earlier attempts (the world shows what was repaired last time). Presentation only: eligibility and evidence stay in the engine.

## Secrets and collectibles (future)

Secrets reward curiosity, not grinding: a hidden maintenance hatch on a floor you visit often, a label that reads differently after a mission. Collectibles are knowledge objects (a museum exhibit about how counterweights work), never random drops, never purchasable.

## Asset modularity

- Layers are separate: landing, back wall, gameplay plane, foreground. A new floor replaces the landing layer. A new lift model replaces the gameplay plane and the sound profile.
- Materials come from tokens (`celBands(metal)`), so a palette change restyles every material.
- Signs and numbers are vector stencils (`stencilDigits.ts`), so they render the same on every platform without a font lookup.

## AI-assisted art constraints

AI tools may help explore silhouettes or palettes. They may not:
- produce final art that imitates a protected franchise, character or style signature
- generate children's content at runtime (non-negotiable 4)
- introduce assets without a recorded source and license

Anything shipped is redrawn or reviewed by a person, matches these tokens, and is listed with its source.
