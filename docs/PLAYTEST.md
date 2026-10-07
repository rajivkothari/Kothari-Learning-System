# Child Playtest: Floor 15

How to run a short observation session with a child and what to write down. This is a parent observation, not a survey. Watch more than you ask.

> Open learning question, record it every session: in Concept Rescue the final "where does the lift stop?" may be too easy, because the child has just counted to that floor. Do not change it yet. Watch whether the child then solves the REAL job on the next try without help. If they answer the test run but still miss the real job, the rescue probably needs a stronger final transfer check.

> Reading skill levels after a session: one clean run of Floor 15 version 2 (every job right first time) brings `math.add.within20` and `math.sub.within20` to Proficient (7 of 7 scored each) and marks transfer demonstrated for both, and leaves `math.mult.equalGroups.within20` at Practicing (1 of 1: a run has one express job). Measured headless on 2026-10-07 with the current thresholds, which are deliberately unchanged (DECISIONS D115, D148). The run has eleven jobs: note when the child's attention drops, and which job it was. A single session is thin evidence: write down what the child did, and do not read "Proficient" as settled.

> Corrections (D149): after each miss on a practice job, note whether the child looked at the shaft map's bracket or the landing before pressing LET'S COUNT, whether they counted on the board or tapped ahead, and whether the next job ("New job.") went right first try. The playtest report lists the last one for every correction. A child who rushes LET'S COUNT and taps randomly on the board is the signal the correction needs a slower start.

Adult rehearsal before a child session: play it yourself in the browser build first (WEB_PLAYTEST.md). The browser is for flow, wording and layout. It is not the device: a child session happens on the iPad or Fire.

## Before

- Release build on the tablet (see DEVICE_LAB.md, "Running Floor 15"). Sound on, normal motion, unless the child usually needs quiet or reduced motion.
- Browser rehearsal (adult only): `npm run web:playtest`, ELEVATOR QUEST to play as a child would, DEVELOPER TOOLS to jump to states and reset test learners.
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
- [ ] Noticed the button click
- [ ] The arrival chime drew attention
- [ ] Sounds felt like a real lift
- [ ] A sound was irritating, startling, or repetitive (which: ____ )
- [ ] Imitated or talked about lift sounds

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
