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

- Free-ride exploration loop. After Floor 15 the lift is free: choose a floor, ride, see a distinct place, touch the thing in it, watch it react, read one line from Lifty, and the game remembers the discovery. Five floors have something to touch: 5 Ventilation (fan), 6 Machine Room (traction motor wheel; on Floor 7 until D130), 15 Primary Power (power core), 17 Archive (plan cabinet), 18 Observatory (telescope). The other fifteen keep their identity and nothing to touch yet.
- Interactive landing pattern. The object itself is the button (no INSPECT button). Its touch area is at least 64 pt even where the drawing is small. A dashed ring marks it until inspected; then a quiet ring and a check. Each touch plays one short, cheap reaction (spin, tilt, slide, pulse, reveal; about 1 s, 0.9 s and still under reduced motion). The first touch is a discovery: Lifty says one line and the place goes into the Engineer Log. Later touches only react.
- Discovery is not learning. A discovery is a world-memory key (`eq.discovery.floor-6`) in its own append-only table. It is never an attempt, evidence, mastery, independence, retention, transfer, progression value, unlock, token or currency. There are no repeat rewards, daily discoveries, streaks or drops. Tests hold this (`director/exploration.test.ts`, `runtime/worldMemory.test.ts`).
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

## Ride, discover, touch, read, operate, see the reaction (M8)

The owner's goal for M8, from what the owner saw: the learner loves riding and pressing buttons, engages with questions, finds very easy math too easy, and sometimes guesses confidently. So: more academic variety, more destinations, and more to do when the doors open. Not a bigger worksheet.

The loop: ride to a floor, discover the place, touch something there and watch it work, read a short note and act on it, operate the lift, see the world react, keep exploring. Built in software (D154 to D157); no child has played it yet.

- Every landing thing is the same kind of object, whatever the moment (D156). In free ride it is a toy: the golf ball putts into the hole, the toolbox opens, a fan and the gears turn, the spring bounces, the crane lowers a block, the radio lights up, the archive book opens a page to read. Between jobs it still reacts, quietly, so the learner can play while a hall call or NEXT JOB waits, without Lifty changing the subject or anything being remembered. During a read-and-touch job the same things are the answers. Twelve floors have something to touch (the Archive has two things, the others one; a floor may hold up to three).
- Touching is never learning evidence and never a reward. A discovery is remembered once (world memory) for the Engineer Log; there is no score, no counter, no streak, nothing to collect. Golf has no strokes and nothing to beat.
- Reading changes what the learner does (D155). A note from someone in the building ("Note from the Workshop crew") says what is needed in two or three sentences. The learner touches the thing on the landing ("Touch the thing that needs fixing."), rides to the floor the note means ("Ride to where the lights go."), or, for word meaning and sentences, picks a card. A wrong touch shows what was touched (the thing reacts if it has a reaction) and Lifty names it ("That is the drill.") with one cue; a wrong ride arrives somewhere else. CLUE lights the sentence that matters; SHOW ME shows the answer; a second miss brings a different note, so guessing through the options does not work. The counting board is for counting, so reading has no test run.
- Math gets wider, not easier (D154): skip counting from any start (lamps in a pattern, one out), a ten and some ones (the ten-floor express), comparing and ordering (calls on two or three floors: which do we reach second?), counting on and back through ten, doubles and near doubles in the cargo bay, two-part trips that keep going the same way, and bigger stretch jobs. Pools pick one job per step each run, so two runs are not the same, and the first cued move is now a single job.
- The run is fourteen jobs, four of them reading, spread between the math jobs. Version 2 had eleven: watch the run's length in the playtest, and note where attention drops.
- Read-and-touch needs the illustrated landing; where the landing draws as vectors, the same choice is offered as cards that name the things. Six more landings were illustrated in M8 (D157); since M8.1 every illustrated landing is approved (D158), so production answers on the landing.

## Every job answerable, readable and alive (M8.1)

M8.1 closes gaps found after M8: a reading job in the playtest that needed knowledge the game never showed ("two floors above the Archive"), a golf ball that did nothing when tapped while a job waited on the rooftop, and words smaller than a young reader should have to read (Lifty's could drop to 13 pt). Built in software (D158 to D162); no child has played it yet.

- The building directory is part of the job (D159). A DIRECTORY control beside the panel lists every floor; looking something up is normal task behaviour, never help and never evidence. Lifty introduces it once, the first time a job needs it ("Need to find a place? Check the DIRECTORY!"). The rule for content: a reading job never needs hidden knowledge. Every ride is answerable from its note plus the directory, and the validator proves it for each ride.
- CLUE teaches a way, not the answer: on a reading job Lifty says the note's own strategy ("Find the Archive in the directory. Then count two floors up.") while the key sentence lights. The few bold words in a note point at what matters (not, before, between) and never at the answer.
- Words big enough to read (D160): what to do is the biggest text on screen, Lifty's words are 20 to 24 pt, the note and the cards 20 to 24 pt, and nothing a child must read is under 16 pt. A box too small scrolls rather than shrinking its words.
- Landing things stay alive during a job (D161): while a job waits and its answer is on another floor (a math job, a ride or card note with the note folded, a hall call, a miss's pause, a success up to NEXT JOB), the things on the open landing react when touched: their motion and their sound, no Lifty line, nothing remembered, never an answer. So the learner can putt the golf ball while working out which call comes second. A read-and-touch job's own landing still offers only that job's choices, and nothing reacts while the note covers the landing.
- Each landing thing has its own sound, and a right answer, a gentle miss and a first discovery each get one short sound (D162). The generated pack plays in every build since the owner approved it (D163).
- All pending art is approved (D158): every illustrated landing and every Lifty pose now shows in a normal build.

## A mixed tower (decided 2026-10-07, D127)

Most floors are grounded engineering and building destinations. A few are surprising, highly themed adventure destinations behind an ordinary lift door. The contrast is the point: "How can THIS be behind an elevator door?"

Special floors (identity built in the visual production milestone, D130; illustrated landings approved in M8.1, D158, ART_ASSET_SPEC.md):
- Floor 7 PLATFORM HEIGHTS: an original industrial aerial platform playground (colourful vertical platforms, pipes, lifts, mechanical obstacles); no question-style blocks, familiar green pipes or coin rows (D138)
- Floor 9 WIND RUINS: the tower's biggest reveal when the doors open (huge open sky, ancient mechanical architecture, floating ruins, massive wind turbines, suspended bridges, fabric in the wind, clouds below parts of the scene)
- Floor 13 BLOCK BUILDER: an original futuristic modular construction world (voxel building, cranes, carts, a cubic landscape); no grass-topped dirt blocks, blocky trees or a familiar minecart
- Floor 20 ROOFTOP GOLF: the special top floor (a rooftop course with the skyline below, a putting green right outside the lift, a flagstick, playful obstacles, the course continuing around the tower); there is no Floor 21

These are destinations, never difficulty tiers. The academic challenge stays learner-specific underneath, as everywhere (portal principle above).

IP safety: production designs stay original. Keep the broad genre, never the property: no Nintendo/Mario characters, logos, blocks, music or assets; no Minecraft/Mojang branding or exact assets; no Zelda names, symbols, characters, music or copied temple designs. The existing content denylist test covers names in content; artwork needs a human review against the same rule.

Resolved (D130): the Machine Room moved to Floor 6, replacing MAINTENANCE. Its spot lists the old key `eq.discovery.floor-7` as a legacy key, so a learner who found the motor on Floor 7 still has it found; no world-memory row is rewritten. Since M8 each destination has something to touch: the platform spring, the windmill, the crane, the golf ball (D156).

The building directory (D128, built D134, rebuilt in M8.1, D159) lists every floor by number, emblem and name. A DIRECTORY control beside the panel opens it as a sheet; the car's floor says YOU ARE HERE. It answers "what is on the other floors?" and "which floor is the Archive?" without becoming a selector: its rows are text, and the numbered panel is the only way to ride.

## Learning that accomplishes something (correction round)

Four rules, recorded as DECISIONS D122 to D124:
- Success reinforcement is learner-paced. The animation may finish by itself; the explanation stays until the learner presses NEXT JOB. NEXT JOB is a game action, never "Submit" or "Next question". After the mission there is no NEXT JOB: free ride is free.
- Concrete noun, concrete world representation. If a job asks the learner to find, fetch, reach or meet a thing, the thing is physically there when the doors open at the right floor (ELEVATOR_QUEST.md "Mission objects"), and missing at a wrong floor.
- Arrival validates reasoning. The landing is the first cue that the reasoning worked: the doors open on the object with nothing in front of it for a beat, then Lifty speaks.
- World acknowledgement and learning reinforcement are separate jobs. "There it is: the repair kit." says the world agrees; "One quick way: 8 → 10 → 15." says why. Routine successes get exactly those two; stretch, a changed plan and the success after a test run add one specific line. Generic praise is gone.

The loop: need something, work out where it is, operate the lift, arrive, see the thing, (optionally load it), the replay says why the floor was right, NEXT JOB.

## Mistakes teach (D149)

The first playtest showed a child who loves operating the lift, likes the questions, and guesses confidently and wrongly, and seems to learn from the miss without the lesson being clear. So a miss on a practice job is now a short loop: the world shows what the answer did (the ride, and the move drawn on the shaft map against the job), Lifty gives one cue, LET'S COUNT starts a count of that same job on the board, the board's last line names the method, and a fresh job of the same kind follows. The correction is never scored as independent work; the fresh job tells us whether the method stuck. Corrections never loop: a miss on the fresh job gets the ordinary clues.

## More kinds of jobs (D148)

Version 2 of Floor 15 asked eleven jobs, each kind once per run, easier first (M8 replaced it with fourteen jobs from pools, see above): two moves named up, the shaft map (down), two orders to load together, a two-part trip, where the crew got on, the trip meter, the beacon (uncued), the express, and the two-stage encounter. Every answer is still something the building does: a floor the lift goes to, crates in the car, or a count the meter rides. A count is never typed or picked from a list in the world: the trip meter turns it into a ride, so a wrong count shows where it went, like a wrong floor. Multiplication enters as equal jumps (an express that stops every 2, 3 or 5 floors, the first two stops given), not as a times-table prompt. Every kind has its own clue words, mistake lines, test run and success replay. The orders name who the crates are for, not floors: a floor number beside an addend invites adding the wrong numbers, which at this level is a reading trap rather than the skill. Watch session length in the first playtest: if eleven jobs tire the child, the first lever is one cued move instead of two.

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

Build only what the current slice needs. Candidates in rough order: multiple choice on world objects (built in M8 as read-and-touch on landing objects, with cards as the fallback), tap-a-panel (number pad / floor buttons), drag-and-drop, ordering/sequencing, word construction (letter tiles), tracing, matching, sorting, number line, interactive diagram, multi-stage encounter host, free drawing.

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
