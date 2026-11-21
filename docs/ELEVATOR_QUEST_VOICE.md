# Elevator Quest: voice and story (plan)

The owner asked for storytelling and high-quality voice-overs in Elevator Quest (2026-11-20). This is what a read-only survey found, the direction chosen, and the order of work. The code the recording drops into and the script for steps 2 and 3 are built (D210, "What is built" below); no audio is recorded. The audio standard is in CLAUDE.md ("How the owner wants to work") and DECISIONS.md D209: audition by ear first, newest speech model, written direction, several takes a line, a listening page per batch.

## What exists today (surveyed 2026-11-20 on the `audit/2026-10-23` line)

- **Almost nothing is spoken.** The only voice is Word Golf's spelling words: 38 clips (`assets/themes/elevator-quest/audio/narration-v1/`, `w01` to `w39`), each "word, a sentence, the word", 1,659 characters, 136 s. Made with `eleven_multilingual_v2` and a library voice, one take a line, approved by transcript and meter; the pack record says nobody has listened. 36 newer words (w40 to w75) have no recording. The owner judged this kind of take poor.
- Lifty, the mission, the landings, the hub and the other mini-games are text only. Text a child reads lives in `content/themes/elevator-quest/`: `floor15.json` (about 300 lines: job, hub, praise, mistakes, help, test-run, replay), `landings.json` (34 first-touch lines, 68 notes, 34 Engineer Log facts, 3 secrets, the Tower Book card), `reading.json`, `objectives.json`, and `minigames/*.json` (Word Golf, Cargo Commander, Tower Rescue, Elevator Express, Strike Lab, host).
- **How speech plays:** `minigames/wordGolf/controller.ts` asks for `word.<id>`; `minigames/hostSound.ts` → `audio/narration.ts` → `audio/audioEngine.ts` `say(key)` → `audio/packs.ts`, `runtime.json`, `audio/assets.ts`. Narration is wired only to the mini-game host (`session.ts`); the director has `onAudio(cues)` for effects and no speech hook. One voice at a time; a new `say` fades the last out in 50 ms; nothing is queued; a missing clip is silent. Settings: Sound Normal, Quiet or Mute scale narration gain; there is no narration switch, voice volume or pace, and no ducking under speech. Guard tests: `audio/narration.test.ts` (pins narration to Word Golf words), `audioEngine.test.tsx`, `soundPack.test.ts`, `runtimeManifest.test.ts`.
- **Story that exists:** the power is down on Floor 15 and the repair crew needs the lift; the child wakes the lift, runs 14 jobs fetching a kit, a toolbox and parts and meeting the crew, then restores power and earns Engineer Rank 1. Lifty is "a compact maintenance robot", "warm, specific, never babyish"; the name is marked temporary and the docs do not agree on a pronoun; the lift is "she". The tower is unnamed, with 20 named floors and B1 BOWLING. No named people. Hooks already written: a lost toy robot whose tag says TIN, the far door that opens "when that part of the tower is ready", drawings of "places we have not been yet", a bin marked MYSTERY PARTS.
- **Sound design:** 44 semantic slots (`audio/profile.ts`). Every build plays `ELEVENLABS_V1` (39 files, Sound Effects v2, chosen by measurement, never heard). Gaps an elevator lover would notice: no sound as each floor passes (`floorPassed` maps to nothing), no spoken floor announcement, one arrival chime for both directions, silent deceleration, the overload tone reuses the wrong-answer note, no hall-call bell, one machine-room bed for every floor, no music beyond stingers, and three mini-games borrow other games' sounds.
- **The learner-engineer** (docs/LEARNER_PROFILES.md): reading may sit well above math, so "narration is optional rather than primary"; interests are elevators, engineering, machines, robots, systems, how things work; never require speech; predictable structure, low clutter; quiet mode, no surprise loud sounds.

## Rules that bind this work

Speech is never required to progress, and sound is never the only carrier of information. Tap feedback is immediate. No sudden loud audio. Nothing queued behind play: "a late sound is worse than none". The ride is part of the reward (docs/GAME_DESIGN.md), so Lifty and the crew sit on beats, not over the ride; the Elevator's own announcements and the floor tick play on every ride, free rides included (D210 changed "free rides are silent" for them). A story line still speaking when the car departs fades out there and its caption stays readable for the ride; departure never waits for speech (D213). Reading-job passages are NOT read aloud (reading is the measured skill, docs/ACCESSIBILITY.md); changing that needs its own decision. Copy lives in content files and must pass the validators (`validateMissionCopy` rejects keys outside the contract in `content/floor15.ts`). No live AI content; no real names.

## Direction: three voices that live in the tower

No storybook narrator. Everything spoken comes from inside the world.

1. **The Elevator**: the lift's own announcer. "Floor fifteen. Primary Power." "Going up." "Doors closing."
2. **Lifty**: the maintenance robot who rides along. Warm, a little dry-witted, a fellow engineer. A character voice, robot by performance and not by heavy effects. Lifty keeps the name and is referred to by name in copy; the lift stays "she".
3. **The Repair Crew**, over the radio: one practical, friendly engineer, through the existing radio-static slot. The crew gives the 14 jobs a reason and a human face.

## Order of work (each step: audition, owner's ear, then record)

1. **Casting**, one audition per role (four announcer voices, five for Lifty, three for the crew, on `eleven_v4`, two takes each). In flight as of the last update.
2. **Arrival announcements for all 21 stops**, a floor-pass tick, distinct up and down chimes, a hall-call bell. The smallest script and the biggest delight for this child. About 30 lines, 800 characters.
3. **The story arc**: a short cold open at the child-paced intro, hall calls as radio calls, three or four crew beats across the 14 jobs, the Floor 15 restoration, the rank. New copy; about 35 lines, 2,500 characters.
4. **Landing discoveries**: the 34 first-touch lines, 68 notes, 3 secrets and the Tower Book, in Lifty's voice. Child-initiated, already written, and they carry the engineering facts. 108 lines, 6,650 characters.
5. **Word Golf to the new standard**: all 74 words, unhurried, plus hole intros. About 104 lines, 4,850 characters.

Left unvoiced in the first pass: reading-job passages (a decision, not a default) and the number-templated job, help and test-run lines (about 200 templates that need enumeration or stitching).

Size: roughly 275 lines and 15,000 characters; at three takes a line about 45,000 characters of generation. The kingdom draws on the same monthly pool.

## Code this needs

- Lines need an identity: the director's `say(line, mood)` takes a finished string, so `view.lifty` needs a voice key, and `session.ts` needs a speech hook beside `onAudio`.
- Story beats must wait for speech: the completion sequence runs on fixed 1.8 s and 2.8 s timers and an aside restores the job line after 3.6 s, which would cut a voiced line off.
- Ducking of effects and ambience under speech; an announcer-then-Lifty sequence.
- Narration on or off and a voice volume in settings.
- New sound slots (floor tick, up chime, down chime, hall bell) in `SOUND_SLOTS`, `SLOT_SPECS` and both profiles.
- New copy keys in the contract and the landings schema; a script file with direction per line; a test that each clip's text equals its copy; `narration.test.ts` loosened.
- Ship as a new pack with status pending, so only the browser build plays it until the owner approves by ear.

## What is built (D210, 2026-11-20)

All of "Code this needs" above, without audio (docs/ELEVATOR_QUEST.md "Voice" has the mechanics):

- The script: `content/themes/elevator-quest/voice.json`, 47 lines (the Elevator 28 lines, 609 characters; Lifty 9, 533; the crew 10, 671; 1,813 characters in all), each with its words, a performance direction and its moment, validated by `src/themes/elevator-quest/content/voice.ts`. Arrivals name every stop exactly as its sign does; the eight Lifty lines that already existed as copy keep their exact words; the crew's and Lifty's new words are captioned while they play.
- Voice keys on Lifty's lines, the speech hook in `session.ts`, sequences with an end report, beats that wait for their line (capped at 9 s), ducking, the Voices switch and voice volume, the four ride slots, and the pending pack `elevenlabs-voice-v1` with no assets.

Waits for casting and recording:

- The owner picks the three voices by ear (step 1), then each line is generated to the audio standard (newest speech model, the line's direction, several takes, a listening page) and the owner chooses takes.
- Sounds for `floorTick`, `arrivalChimeUp`, `arrivalChimeDown`, `hallCallBell` from the sound-effects audition, chosen by ear.
- Steps 4 and 5 (landing discoveries, Word Golf) are hooks only: the aside already waits for a voiced line; their lines are not in the script yet.
- Approval: the pack stays pending (browser playtest build only) until the owner approves it by ear; then `"status": "approved"` and `node scripts/generate-elevator-audio.js --sources`.

Dropping a recording in: save `assets/themes/elevator-quest/audio/voice-v1/<line id>.mp3` (mono MP3, 44.1 kHz, 64 kbps, like the Word Golf words; true peak at or under -3 dBTP), add a manifest asset `{ "file": "voice-v1/<line id>.mp3", "pack": "elevenlabs-voice-v1", "narrationKey": "voice.<line id>", "text": <the line's words>, "durationMs": <measured>, "loop": false, "source", "license", "loudness" }`, then `node scripts/generate-elevator-audio.js --sources` (require lists and runtime.json). `audio/narration.test.ts` fails if the text is not the line's words. A recording plays to its own end: the line is over when its player reports that the file has finished (expo-audio's `didJustFinish`), never at a time counted from the request. Until 2026-11-21 the end was timed from `durationMs` at the request, which cut the time a fresh player takes to start off the end of every recording (79 to 101 ms of the Word Golf word `w01` in desktop Chromium, whose last sound ends 96 ms before its file does; a review finding, fixed). `durationMs` is still needed and must be the measured length after processing: it arms the engine's fallback for a player that never reports (`durationMs` + 2 s, `SPEECH_END_MARGIN_MS`, then a 50 ms fade) and it sizes how long a story beat waits for a sequence. Do not trim a recording tight: leave about 100 ms of quiet at each end (crew lines after their radio processing too), so the first and last sounds are never at the file's edge, where a decoder or an output device starting up can lose a few milliseconds. The size of that loss on a Fire tablet is not measured (docs/DEVICE_LAB.md, the narration row).

