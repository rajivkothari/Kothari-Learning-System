# Child Playtest: Floor 15

How to run a short observation session with a child and what to write down. This is a parent observation, not a survey. Watch more than you ask.

> Open learning question, record it every session: in Concept Rescue the final "where does the lift stop?" may be too easy, because the child has just counted to that floor. Do not change it yet. Watch whether the child then solves the REAL job on the next try without help. If they answer the test run but still miss the real job, the rescue probably needs a stronger final transfer check.

> Reading skill levels after a session: one clean run of Floor 15 version 2 (every job right first time) brought `math.add.within20` and `math.sub.within20` to Proficient (7 of 7 scored each) and marked transfer demonstrated for both, and left `math.mult.equalGroups.within20` at Practicing (1 of 1: a run has one express job). Measured headless on 2026-10-07 with the current thresholds, which are deliberately unchanged (DECISIONS D115, D148). Version 3 (M8, D154) has not been measured that way yet; its pools spread a run over more skills (skip counting, a ten and some ones, comparing, and six reading skills). The run now has fourteen jobs (version 2 had eleven): note when the learner's attention drops, and which job it was. A single session is thin evidence: write down what the learner did, and do not read "Proficient" as settled.

> Corrections (D149): after each miss on a practice job, note whether the child looked at the shaft map's bracket or the landing before pressing LET'S COUNT, whether they counted on the board or tapped ahead, and whether the next job ("New job.") went right first try. The playtest report lists the last one for every correction. A child who rushes LET'S COUNT and taps randomly on the board is the signal the correction needs a slower start.

Adult rehearsal before a child session: play it yourself in the browser build first (WEB_PLAYTEST.md). The browser is for flow, wording and layout. It is not the device: a child session happens on the iPad or Fire.

## Before

- Release build on the tablet (see DEVICE_LAB.md, "Running Floor 15"). Sound on, normal motion, unless the child usually needs quiet or reduced motion.
- Browser rehearsal (adult only): `npm run web:playtest`, ELEVATOR QUEST to play as a child would, DEVELOPER TOOLS to jump to states and reset test learners.
- Reading jobs that are answered by touching a thing on the landing need the illustrated landing. Since M8.1 every landing that hosts such a job is approved art (D158; since M8.2 every landing is, D164), so a tablet build and the browser build both answer them on the landing; only the two lobby notes (the plant and the bench are not on the art), the iPad 2/3 split view and a failed image use cards. Write down if the learner saw cards.
- Sound (D162, D163): every build plays the generated pack (`?sound=placeholder` in the browser plays the old synthesized set). Nobody has listened to it with a learner yet: note any sound that startles, annoys or is too quiet. Write down which one the learner heard.
- To start fresh, clear the app's data (Fire: Settings > Apps > the app > Storage > Clear data, menu names vary by Fire OS version; iPad: delete and reinstall).
- Have paper ready. Do not explain the game beyond "This is an elevator game. Have a look."
- Do not help unless the child asks or is upset. Note every time you do help.

## During (5 to 10 minutes)

Let the child play to the end or until they stop. If they stop, note where and why, then stop the session.

The developer playtest report records the timing and choices. To open it: long-press the "POWER RESTORATION" checklist for 2 seconds, or use Settings > Playtest report. Development builds, and release builds made with `EXPO_PUBLIC_PLAYTEST=1`, only. Share it as text after the session. Nothing is uploaded.

To run Floor 15 again from the start (a new session, or after a finished one), an adult uses Settings > Testing (adults) > Start over, and presses again to confirm. It starts a fresh save; the earlier one is kept, unread (D143). Same builds only.

## Observation checklist

Mark what you saw. Leave blank what you did not see.

Elevator attraction
- [ ] Immediately wanted to press elevator buttons
- [ ] Explored the panel beyond what the task needed
- [ ] Watched the floor indicator during rides
- [ ] Reacted to the chime or the doors
- [ ] Seemed to enjoy operating the lift itself
- [ ] Tried DOOR OPEN / DOOR CLOSE
- [ ] Replayed rides or used "Ride the lift" just for fun

Learning
- [ ] Understood what the mission wanted
- [ ] Recognized that choosing a floor was solving the problem
- [ ] After a wrong floor, seeing where the lift stopped seemed to help
- [ ] Recovered and tried again after a mistake
- [ ] Asked for help (CLUE / SHAFT MAP / HOW TO COUNT)
- [ ] The help made the problem clearer

Challenge
- [ ] Some part was obviously too easy (which: ____ )
- [ ] Slowed down at: ____
- [ ] Showed real thought at: ____
- [ ] Gave up at: ____
- [ ] Came back after difficulty
- [ ] The cargo bay (final encounter) felt meaningfully harder

Pacing
- [ ] Rides felt too slow
- [ ] Rides felt too fast
- [ ] Watched rides / looked away during rides
- [ ] Doors felt slow
- [ ] Tapped repeatedly while the lift was moving

Audio
- [ ] Which sound set: tablet placeholders / browser generated pack / browser placeholders (circle)
- [ ] Noticed the button click
- [ ] The arrival chime drew attention
- [ ] Sounds felt like a real lift
- [ ] A sound was irritating, startling, or repetitive (which: ____ )
- [ ] Imitated or talked about lift sounds
- [ ] Reacted to the sound a landing thing made (the golf putt, the toolbox, the fan, the spring...) (which: ____ )
- [ ] Reacted to the right-answer sound / the gentle miss sound / the discovery sound (circle; how: ____ )
- [ ] The miss sound felt like being told off (what they did: ____ )
- [ ] A sound repeated too often or stacked up when tapping fast (which: ____ )

Reward
- [ ] Mission completion got a visible reaction
- [ ] The rank or the maintenance panel mattered to them
- [ ] Asked what happens next
- [ ] Asked to keep playing

Visual engagement
- [ ] First look landed on (circle): mission status / floor indicator / doors / panel / Lifty / something else: ____
- [ ] Looked at the landing's painted floor number after the doors opened
- [ ] Noticed the shaft moving past the door windows during a ride
- [ ] Could tell "the car is here" (position lamp) from "I pressed this" (amber lamp)
- [ ] Noticed the cyan clue ring when help was used
- [ ] Noticed the help button when help was offered (ring, badge, slow pulse), especially on Fire
- [ ] Commented on or pointed at Lifty
- [ ] Read Lifty's display (dots, arrow, check) as Lifty "doing something"
- [ ] Something on screen looked confusing or distracting (what: ____ )
- [ ] Found the cabin dull / about right / too busy (circle)

For the next three sections: do not interrogate the child. Mark only spontaneous behavior you saw or heard.

Floor identity
- [ ] Noticed that floors are different places (reacted, pointed, commented)
- [ ] Spontaneously mentioned a favorite floor (which: ____ )
- [ ] Wanted to visit a floor just to see it (free ride or otherwise)
- [ ] Remembered a place by how it looks rather than its number ("the green one", "the lobby again")
- [ ] Looked at the sign over the landing (the place name)
- [ ] Noticed Floor 15 was dark before the repair, and lit after it
- [ ] Two floors felt the same, or a place was confusing (which: ____ )
- [ ] The floor number was hard to read on some landing (which: ____ )

Lifty
- [ ] Looked at Lifty when a new line appeared
- [ ] Treated Lifty as part of the lift (talked to Lifty, pointed at Lifty in the cabin) rather than as a caption
- [ ] Read Lifty's line all the way, or stopped part way (circle)
- [ ] Lifty's move toward the panel or the shaft map drew their eyes there
- [ ] Lifty's move pulled attention away from the job (when: ____ )
- [ ] Lifty blocked something they wanted to see or press (what: ____ )
- [ ] Tapped Lifty or the speech bubble expecting something to happen
- [ ] Lines felt too long for the moment (which: ____ )

Success Replay (after a correct floor)
- [ ] Watched the replay (the green check on the indicator, the green path on the shaft map), or looked away (circle)
- [ ] Seemed to understand the path (traced it, pointed at the hops, said a number from it)
- [ ] Became impatient: tapped to move on, sighed, looked away (when: ____ )
- [ ] Used that way on a later job (counted to ten first, chunks of five, and so on)
- [ ] Repeated an explanation aloud ("eight, ten, fifteen")
- [ ] It felt rewarding (a smile, "yes!") or instructional (a pause, a frown) (circle, or describe: ____ )
- [ ] Tapped during the replay (did anything unexpected happen? ____ )
- [ ] After choosing a floor on the shaft map, noticed Lifty saying so

Success Replay, child-paced (correction round; watch, do not ask)
- [ ] Read the explanation when nothing hurried them (eyes on the words or the shaft map)
- [ ] Seconds from the replay settling to pressing NEXT JOB (a few samples): ____
- [ ] Pressed NEXT JOB at once without reading (how often: ____ )
- [ ] Pointed at or followed the replay on the shaft map
- [ ] Used the strategy later (counted on, bridged through ten) without prompting
- [ ] Waiting for a tap made the mission feel stop-start (what they did: ____ )

Physical objectives (correction round)
- [ ] Noticed the object when the doors opened (repair kit, toolbox, parts, crew, dock)
- [ ] Seemed to understand they had found what the job asked for
- [ ] Tapped the object without prompting (loaded the kit into the lift)
- [ ] The object made the floor feel like the reason for the sum (what they said: ____ )
- [ ] After a wrong floor, noticed the object was missing ("No repair kit here")

Reading jobs (M8; watch, do not read the note aloud unless the learner asks)
- [ ] Read the note before acting (eyes on the note, lips moving), or acted at once (circle)
- [ ] Folded the note away to see the landing, and opened it again when unsure ("Read the note")
- [ ] Touch jobs: looked for the thing on the landing; touched the right thing first try (which notes: ____ )
- [ ] Ride jobs: worked out the floor from the note (said a floor or a place aloud before pressing)
- [ ] Card jobs: read every card before choosing / chose the first card (circle)
- [ ] After a miss: noticed what the touched thing did, or where the ride went, before trying again
- [ ] Used CLUE; then read the lit sentence (yes / no)
- [ ] Used SHOW ME (on which note: ____ )
- [ ] Guessed through the options (touched one thing after another quickly)
- [ ] A fresh note after two misses: read it, or guessed again (circle)
- [ ] A word or sentence the learner could not read (which: ____ )
- [ ] Reading jobs felt like part of the building, or like an interruption (circle, or describe: ____ )
- [ ] If the cards showed instead of the landing (a build that draws vector landings shows cards for touch jobs), the learner understood the cards name things in the building

Building directory and reading (M8.1; watch, do not point at the DIRECTORY)
- [ ] Opened the DIRECTORY without being told (when: before / after Lifty's introduction / never) (circle)
- [ ] After Lifty's introduction ("Need to find a place? Check the DIRECTORY!"), looked for the button and opened it
- [ ] Used the directory to answer a ride note (found the place, then counted from its floor)
- [ ] Opened the directory just to look around (between jobs or in free ride)
- [ ] Expected to ride by tapping a floor in the directory (what they did: ____ )
- [ ] Found YOU ARE HERE and used it
- [ ] The introduction helped / was ignored / interrupted (circle)
- [ ] Read Lifty's words without leaning in or asking (yes / no; where not: ____ )
- [ ] Read the note and the cards without help (a word that stopped them: ____ )
- [ ] Noticed the bold words in a note, and used them (what they said: ____ )
- [ ] CLUE's words (the strategy Lifty says) helped them try a way, not just guess again
- [ ] Scrolled a box that said there was more below (Lifty's words, the note, the cards, the directory), or missed the rest (circle)

Harder math (M8)
- [ ] Very easy jobs still felt too easy (which: ____ )
- [ ] Lamp check (a pattern with one lamp out): counted by the step, or by ones (circle)
- [ ] Ten-floor express: counted the ten first, then the ones
- [ ] Calls in order: understood "which do we reach second?"
- [ ] A job that was too hard to start at all (which: ____ )

Landing play (M8; free ride and between jobs; let the learner lead)
- [ ] Touched a landing thing between jobs (during a hall call, or while NEXT JOB waited)
- [ ] That play pulled attention away from the job (when: ____ )
- [ ] Favourite thing to touch (golf ball, toolbox, fan, gears, spring, windmill, radio, crane, core, archive book, telescope): ____
- [ ] Putted the golf ball more than twice; tapped again while the ball was still moving
- [ ] Opened and shut the toolbox; read the archive book's page
- [ ] Rapid tapping made anything flicker or look broken (what: ____ )
- [ ] Expected a score or a reward for touching something (what they said: ____ )
- [ ] During a job (the answer on another floor), touched something on the landing and it responded (M8.1; which: ____ )
- [ ] Tapped the golf ball on Floor 20 during a job: it putted at once / it did nothing (circle)
- [ ] A landing thing did not respond to a touch (which floor and thing: ____ )
- [ ] Playing with a landing thing during a job helped them settle / pulled them off the job (circle; when: ____ )

The new floors (M8.2; free ride and between jobs; do not suggest floors or things)
- [ ] Explored the newly illustrated floors without being told (3 Utility, 4 Storage, 8 Test Lab, 10 Relay Room, 12 Engineering Bay, 14 High Service, 16 Hydroponics, 19 Sky Bridge) (which: ____ )
- [ ] Things touched there (valve wheel, toy robot, hose reel, storage bin, flasks, monitor, relay lamps, big dial, crane hook, pulley wheel, hanging lamp, grow lights, plants, far door, turbine): ____
- [ ] The toy robot on Utility caught their eye (touched it first / after the valve / after Lifty's hint / never) (circle); on the lost-toy ride note, reacted to finding it
- [ ] On the Sky Bridge, the far door caught their eye (touched the door first / the turbine first / neither) (circle); noticed the small turbine spin
- [ ] Noticed the gauge needle sweep when the valve turned (Utility)
- [ ] A new floor's thing was hard to find or did not seem to react (which: ____ )
- [ ] Read the place sign on a new floor (said the name aloud); on Fire, a sign without the number confused them (yes / no)
- [ ] Used the Engineer Log (twenty rows now) to pick a floor not inspected yet

Free ride and exploration (M7.1, after Floor 15 is restored; let the child lead, do not suggest floors)
- [ ] Chose another floor voluntarily after the restoration
- [ ] Touched a landing object without being prompted (before Lifty's "Try tapping ..." line / only after it)
- [ ] After a discovery, chose yet another floor
- [ ] Went back to a floor to make its object work again
- [ ] Opened the clipboard (Engineer Log) by themselves
- [ ] Looked at the NOT INSPECTED YET rows and then went to one of those floors
- [ ] Undiscovered floors seemed to create curiosity (what they said or did: ____ )
- [ ] Minutes of free ride before stopping: ____

Hall calls (M7.1)
- [ ] Hall calls felt more engaging than the old automatic ride (pressed eagerly / waited / ignored)
- [ ] Understood which button to press for a call without adult help
- [ ] Pressed a different floor first (which: ____ )

Completion (M7.1, no card)
- [ ] Noticed the restoration (the landing coming back, the core waking, the panel sweep)
- [ ] Touched something or rode somewhere right after the restoration
- [ ] Continued playing rather than stopping at the end of the mission (compare with an earlier session if there was one)

DOOR CLOSE (M7.1)
- [ ] Used DOOR CLOSE later without prompting, after the tip
- [ ] Used it before the tip appeared

Mini-games (M9; Word Golf on Floor 20, Cargo Commander on Floor 4; do not point at the PLAY button, and do not say the word or the total. The playtest report has no mini-game summary yet: note the times by hand)
- [ ] Found the PLAY button by themselves (on which floor, during free ride / between jobs / during a job: ____ )
- [ ] Came back with BACK TO ELEVATOR without help, and carried on with the elevator (or went straight back to the game)
- [ ] Minutes in Word Golf: ____ ; in Cargo Commander: ____ (the Word Golf estimate is 3.5 to 5 minutes; it has not been measured)
- [ ] Word Golf: read the sentence with the blank and the meaning clue (aloud / silently / asked an adult); used HEAR IT AGAIN (only if the word is spoken in this build)
- [ ] Word Golf: the words felt too easy / about right / too hard (which word: ____ ); used SOUND HINT, SHOW A PART, SHOW ME (circle)
- [ ] Word Golf: guessed letters quickly to get to the putt, rather than spelling (yes / no / unsure)
- [ ] Word Golf: putting was fun / frustrating; how many putts on the hardest hole: ____ ; used MOVE CLOSER when it came
- [ ] Word Golf: noticed the tile letters a and g look different from the ones they learned (yes / no)
- [ ] Cargo Commander: understood the job from the brief (which kind confused them: ____ )
- [ ] Cargo Commander: added sacks and boxes until the needle looked right and pressed WEIGH, rather than working it out (yes / no / unsure)
- [ ] Cargo Commander: after a miss, used "Too heavy" or "Not enough yet" to fix the load
- [ ] Cargo Commander: opened the ENGINEER'S TOOLKIT, and used the blocks / the number line / the work area (circle)
- [ ] Cargo Commander: used TENS AND ONES, JUMP IT, SHOW ME (circle); the freight run felt like a reward (watched it / looked away)
- [ ] Either game: anything felt like a test or a punishment (describe: ____ )

Hints
- [ ] Used help after the first miss, before it was offered
- [ ] Asked for a second help step without waiting (the gap fix)
- [ ] The visual tool (shaft map) changed what they did next
- [ ] HOW TO COUNT: started counting from the right floor afterwards
- [ ] Ignored offered help entirely
- [ ] Number of misses before the first help request: ____

Concept Rescue (if it happened)
- [ ] OPEN QUESTION: answered "where does it stop?" by reading the last counted floor, without thinking (yes / no / unsure)
- [ ] OPEN QUESTION: then solved the real job on the next try without help (yes / no)
- [ ] Noticed the switch to the TEST RUN board
- [ ] Understood it was a different example, not the real job
- [ ] Counted cells one at a time
- [ ] Tapped the start floor as move 1 (the classic slip)
- [ ] Answered the "where does it stop" question without help
- [ ] Back on the real job, solved it on the next try / needed more tries: ____
- [ ] Reaction: relieved / bored / annoyed / proud / no reaction (circle)
- [ ] Felt like a punishment or a failure screen (describe: ____ )
- [ ] Time spent in the rescue: ____ s

Spontaneous comments:

____________________________________________

____________________________________________

## After

Write down any help you gave, interruptions, the device, and whether audio was on. Keep the notes and the shared report in the gitignored `private/` folder if they mention the child. Never put names, ages, or other personal details in tracked files.
