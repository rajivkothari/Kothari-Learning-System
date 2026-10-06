# Child Playtest: Floor 15

How to run a short observation session with a child and what to write down. This is a parent observation, not a survey. Watch more than you ask.

> Open learning question, record it every session: in Concept Rescue the final "where does the lift stop?" may be too easy, because the child has just counted to that floor. Do not change it yet. Watch whether the child then solves the REAL job on the next try without help. If they answer the test run but still miss the real job, the rescue probably needs a stronger final transfer check.

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
- [ ] Commented on or pointed at Lifty
- [ ] Read Lifty's display (dots, arrow, check) as Lifty "doing something"
- [ ] Something on screen looked confusing or distracting (what: ____ )
- [ ] Found the cabin dull / about right / too busy (circle)

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
