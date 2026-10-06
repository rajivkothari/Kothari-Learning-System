# Game Design

How the shared engine becomes two different games. Learning rules live in [LEARNING_MODEL.md](LEARNING_MODEL.md), rewards in [REWARDS.md](REWARDS.md).

## Core loop

```
Hub (world) -> pick mission from board -> mission beats (activities in the world)
  -> mission complete (unlock, progress) -> back to hub with something changed
```

- Missions: 5-10 minutes, 3-6 beats, steps visible up front.
- Arcs: 4-8 missions that build toward one Mastery Encounter.
- The hub visibly changes as the child progresses (restored floors, new rooms, decorations placed).

## Design rule: the learning action does something

Every correct action has a world consequence. Bad: a worksheet question framed by elevator art. Good: "The car is on Floor 8 and must go up 7 floors." The child presses 15 on the panel and the car moves. A wrong press also does something informative (the car goes to the wrong floor, the floor sign shows where it ended up), never a red X.

## Elevator Quest (learner-engineer)

Fantasy: cinematic engineering adventure in a futuristic tower with labs, service tunnels, mechanical rooms, control systems. The elevator is a machine to operate, repair, understand, navigate with, and later design and optimize.

Recurring diegetic surfaces: call panels, floor indicators, control terminals, maintenance notes, repair manuals, wiring diagrams, building maps, work orders, robot helper dialogue.

Maturity ladder (same world, deeper thinking):

| Stage | Example activities |
|---|---|
| Early | count floors, add/subtract floors, follow a work order, identify simple machines (pulley, lever), read a short maintenance note |
| Intermediate | multi-stop routing, capacity limits, fractions of a trip, measuring cable lengths, geometry of shafts, technical reading with diagrams |
| Older | ratios (counterweight), algebra (unknown floor), statistics (wait-time logs), physics (forces, energy), diagnosing faults from evidence, comparing two repair plans and justifying the choice |

Signature encounter example: Blackout. Read the maintenance log, compute load, trace the circuit, route crews, decide which breaker to restore first. Several attempts expected. Success restores lights floor by floor.

Earthquake content belongs here as engineering (seismic sensors, safe stops, building sway), never as disaster fear.

Art direction: steel, concrete, glass, brushed metal, deep blues, charcoal, amber indicator lighting, illuminated panels. Cool and technical, never frightening (no dark horror corridors, no falling-elevator peril).

## Magic Tower (learner-storyteller)

Fantasy: cinematic illustrated storybook. A whimsical elevator is a portal. Floors open into worlds: Ice Palace, magical forest, Mermaid Lagoon, Puppy Palace, Dragon Castle, enchanted library, shops, fantasy rooms.

Recurring diegetic surfaces: signs, spellbooks, letters, shop labels, character speech, magic word doors, recipe cards, maps.

Literacy actions cause story consequences:
- A puppy needs a hat: `H _ T`. The learner chooses A. The hat appears.
- A door opens only when the learner builds the magic word from letter tiles.
- Tracing a letter draws a glowing path the dragon follows.
- Sequencing story cards repairs a torn page in the enchanted library.

Writing ladder: trace -> copy -> construct (tiles) -> independently write (later).

More story-driven and character-driven than Elevator Quest. Characters remember what the learner did. Creative customization (rooms, outfits, pets) is a bigger part of the reward loop.

Art direction: expressive environments, magical lighting, icy blues, lavender, warm golds, pinks, emeralds, forests, castles, animals. Storybook cinematic, not generic princess clip art. Must hold up as the learner reaches Grades 3-5.

Signature encounter example: Royal Quest to restore the frozen Ice Palace. Read the scroll, sequence events, build words to unlock gates, count and sort crystals. Success thaws the palace room by room.

## Shared presentation rules

- 2.5D: layered parallax scenes, strong lighting baked into art, light dynamic effects (glows, particles) used sparingly.
- Clean HUD: mission steps, hint, settings, exit. Nothing else persistent.
- Feedback is thematic and proportional (see REWARDS.md presentation scale).
- No worksheets, no chalkboards, no giant red X, no "Question 4 of 10" as the main frame.
- Neither world is babyish. Each must mature with the child.

## Orientation and layout

- Landscape is the primary design target: wide scenes, two-handed hold, room for a side panel plus scene, wider handwriting lines.
- iPadOS 26 deprecated `UIRequiresFullScreen`, and Apple says apps should support all orientations and resizable windows (TN3192, revised 2026-08-13). So the layout must survive portrait and resized windows without breaking.
- The experience prefers landscape. The application tolerates portrait, landscape, iPad multitasking (Split View, Slide Over, Stage Manager windows), and arbitrary resizes without breaking.
- Game coordinates are logical stage units (the Device Lab uses a 1600 x 1000 stage), never device pixels or a fixed resolution. A pure layout function maps the current window and safe-area insets to a scale and offset. Scenes are composed so their important content sits in a safe core that fits both 16:10 (Fire) and 4:3 (iPad), with extra environment art filling the rest.
- HUD and controls are laid out with flexbox against window edges and safe areas, not inside the scaled stage, so they keep a physical touch size at any scale.
- Portrait reflows controls below the scene. A vertical tower suits portrait, so this is an opportunity, not only a cost.
- Below a minimum usable size (very narrow Slide Over windows) gameplay may show a graceful "make the window bigger / best in landscape" treatment. That treatment is a layout state, not a crash path.
- Every resize re-runs layout. Nothing caches dimensions at startup.

## Interaction types (reusable renderers)

Build only what the current slice needs. Candidates in rough order: multiple choice on world objects, tap-a-panel (number pad / floor buttons), drag-and-drop, ordering/sequencing, word construction (letter tiles), tracing, matching, sorting, number line, interactive diagram, multi-stage encounter host, free drawing.

Each renderer is theme-agnostic. A theme binding supplies art, sounds, and copy.
