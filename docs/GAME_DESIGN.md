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

Operating the elevator is the fun. Learning gives reasons to operate it. The real panel is the answer interface, and a wrong floor is a real ride to that floor. The first slice, "Floor 15", its simulation, sound system, and recovery rules are in [ELEVATOR_QUEST.md](ELEVATOR_QUEST.md). The maintenance companion is called Lifty (temporary name): warm, specific, never babyish.

## The building is the game (M7.1 exploration pass)

Principle: make the building the game. Missions are the jobs the building needs. After Floor 15 the child should want to know what is on the other floors.

Built in software (browser and headless tests only; no child has played it yet):

- Free-ride exploration loop. After Floor 15 the lift is free: choose a floor, ride, see a distinct place, touch the thing in it, watch it react, read one line from Lifty, and the game remembers the discovery. Five floors have something to touch: 5 Ventilation (fan), 7 Machine Room (traction motor wheel), 15 Primary Power (power core), 17 Archive (plan cabinet), 18 Observatory (telescope). The other fifteen keep their identity and nothing to touch yet.
- Interactive landing pattern. The object itself is the button (no INSPECT button). Its touch area is at least 64 pt even where the drawing is small. A dashed ring marks it until inspected; then a quiet ring and a check. Each touch plays one short, cheap reaction (spin, tilt, slide, pulse, reveal; about 1 s, 0.9 s and still under reduced motion). The first touch is a discovery: Lifty says one line and the place goes into the Engineer Log. Later touches only react.
- Discovery is not learning. A discovery is a world-memory key (`eq.discovery.floor-7`) in its own append-only table. It is never an attempt, evidence, mastery, independence, retention, transfer, progression value, unlock, token or currency. There are no repeat rewards, daily discoveries, streaks or drops. Tests hold this (`director/exploration.test.ts`, `runtime/worldMemory.test.ts`).
- Engineer Log. A maintenance clipboard in the cabin, earned with the Maintenance access at Floor 15. One row per inspectable place: floor, name, emblem, INSPECTED or NOT INSPECTED YET, the fact found there (never shown before it is found), and Floor 15's power state. No percentages, counts, grades or scores. RUN FLOOR 15 AGAIN lives at its bottom.
- Hall calls. Between jobs the next job's floor calls the lift ("We've got a call on Floor 8. Press 8 to pick it up."). The calling button shows a dashed ring, a CALL tab and a slow breath (still under reduced motion). Only that floor can light. It is a ride the child operates, never an answer: no answer window opens until the doors open at the calling floor. Rides back from a test run stay automatic.
- In-world completion. No card. The final ride reaches Floor 15, the landing comes back to life and its core wakes, the panel lamps sweep once bottom to top, Lifty says so, then names Engineer Rank 1 and the clipboard, and the controls are free. Reopening a finished mission goes straight to free ride at Floor 15.
- Quieter rides. Answer rides keep the job on screen instead of "Heading to Floor 12". Free rides are silent; arriving at a floor with something undiscovered, Lifty names the thing to touch after a short beat (nothing waits on it).
- DOOR CLOSE tip. Once per learner, after a few rides, while the doors wait: "Operator trick: DOOR CLOSE gets us moving sooner." Never shown to someone who already uses it. Not academic, never required.

Foundation for later secrets, not built: a floor can hold up to three spots, each with its own discovery key, so later content can add hidden spots, multi-state places and cross-floor clues as data. There is no quest system, and B1 is not built or revealed (the Archive only says some drawings show places we have not been).

### Future directions (documented only, nothing built)

- Dark Tower. Missions restore building systems over time (power, air, comms), and floors come back as their systems do. Do not show nineteen dead floors before the content for them exists: an unbuilt floor stays an ordinary, lit landing.
- Teach Lifty. Lifty makes a mistake on a parallel problem (never the learner's own item) and the learner corrects it. It needs its own evidence semantics before it can count as anything; until then it would be presentation only.
- Engineer Tools. Representations become tools the learner carries: Shaft Map (the existing shaft map/number line), Load Gauge (the load meter), Ruler, Scratchpad, Blueprint Viewer, Trip Counter. Only the names are recorded; no tool system exists.

## Learning that accomplishes something (correction round)

Four rules, recorded as DECISIONS D122 to D124:
- Success reinforcement is learner-paced. The animation may finish by itself; the explanation stays until the learner presses NEXT JOB. NEXT JOB is a game action, never "Submit" or "Next question". After the mission there is no NEXT JOB: free ride is free.
- Concrete noun, concrete world representation. If a job asks the learner to find, fetch, reach or meet a thing, the thing is physically there when the doors open at the right floor (ELEVATOR_QUEST.md "Mission objects"), and missing at a wrong floor.
- Arrival validates reasoning. The landing is the first cue that the reasoning worked: the doors open on the object with nothing in front of it for a beat, then Lifty speaks.
- World acknowledgement and learning reinforcement are separate jobs. "There it is: the repair kit." says the world agrees; "One quick way: 8 → 10 → 15." says why. Routine successes get exactly those two; stretch, a changed plan and the success after a test run add one specific line. Generic praise is gone.

The loop: need something, work out where it is, operate the lift, arrive, see the thing, (optionally load it), the replay says why the floor was right, NEXT JOB.

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

## Worlds and portals

The world catalog (`content/worlds/catalog.json`, schema in `src/themes/catalog/worldCatalog.ts`) describes every world and floor, playable or not. Only Elevator Quest is playable. The other entries are non-playable architecture examples: Magic Tower (planned), Wind Adventure Ruins, Builder Bay, Flight Lab, Coding Studio, Golf Works, Holiday Grand Hotel, Emotion Control Center, Rollercoaster World, Magical Academy, Pop Spirit Stage and Talking Animal Neighborhood.

Each entry carries: id, display name, status, theme family, art identity (palette, one-line identity, lighting), preferred interactions, curriculum affinities (skill-id prefixes), learner affinity tags (archetypes and interests, never names), unlock requirements, portal availability and source worlds, association (primary for one archetype, or shared), and presentation hints (reading load, visual busyness, narration first).

Portal principle: the world decides the fantasy, the learner profile decides the challenge.
- A world has no difficulty field. The schema rejects `difficulty`, `level`, `gradeLevel` and `ageRange`.
- There is no "easy world" or "hard world". The same learner meets the same challenge level in Builder Bay and in Magical Academy.
- Curriculum affinities steer activity SELECTION (which skills a world tells good stories about). They never change scoring, thresholds or evidence.
- Presentation hints change how a world looks and sounds (reading load, narration first, calm visuals). They never change the task. Access settings stay separate dials (ACCESSIBILITY.md).
- Portals are never purchasable and never ranked. Unlocks are missions completed, worlds visited, or a parent switching a world on.
- No protected franchise names in content. A test scans every content JSON against a denylist.

Validation (`worldCatalog.test.ts`): unique ids, known portal sources and unlock references, palettes that exist in the design system, playable worlds need a theme pack, missions, a palette and only implemented interactions, and concept worlds may not claim missions.

## Future engagement systems (recorded, not built)

Ideas to keep the game rich as the learner grows. None is built. Each must pass the non-negotiables (no streaks, no comparison, no loot boxes, no FOMO, no penalty for mistakes) before it is designed.

| System | One line |
|---|---|
| Capability trees | Visible, branching "what I can do" maps per world, grown by evidence, never bought |
| Teach the companion | The learner explains a step to Lifty, who tries it and asks questions. Evidence of understanding, not speed |
| Unlockable strategy tools | Number line, tens frame, counting cards become tools the learner earns and chooses to use |
| Secret floors | Hidden places found through curiosity (a hatch, a label), not grinding. The exploration pass leaves room for them in the landing catalog; none exists |
| World-changing mastery | Mastery restores, repairs or opens part of the world permanently |
| Learner-selected challenge | "Warm me up / Challenge me / Something hard" modes that pick within the learner's real range |
| Voluntary bosses | Mastery Encounters the learner chooses to start, never forced, retry anytime |
| Bosses that remember | The encounter shows what was repaired or learned last time |
| Cross-subject problems | A repair that needs reading a manual and measuring, in one job |
| Off-screen quests | Optional real-world tasks a parent confirms (count stairs at home). No data leaves the device |
| Knowledge museums | Rooms that display what the learner has learned as exhibits |
| Adventure Book | A personal log of missions, discoveries and strategies, in the learner's own choices |
| Skill combos | Jobs that combine two mastered skills for a bigger effect |
| Multiple valid solutions | Tasks with more than one right route, each recognised |
| Strategic "Come Back Later" | Parking a hard job is a valid move, and the world remembers it |
| Portal crossover missions | A story that starts in one world and finishes in another |
| Seasonal events without FOMO | Seasonal decorations and jobs that never expire and never lock content behind a date |
| Growth replay | Replaying an early mission to see how much easier it feels, with no score to beat |
