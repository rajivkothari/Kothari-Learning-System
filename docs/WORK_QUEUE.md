# Work queue

What is being worked on now and what comes next, so a session that starts cold (or a helper that takes over) knows where to pick up. Update it when a round starts or ends, and push. Standing instructions are in CLAUDE.md ("How the owner wants to work"); decisions are in docs/DECISIONS.md.

Last update: 2026-11-21.

## Starting cold (a new session)

1. Work on branch `claude/kingdom-reading-games` and push every commit to it (CLAUDE.md, "Git" and "How the owner wants to work"). The repository's default branch is older and has none of this.
2. Read `CLAUDE.md`, then this file, then `docs/magical-kingdom/REBUILD_SPEC.md` (its status list at the end says what of the kingdom rebuild exists).
3. `npm ci`, then `npm run verify` to see the state of the tree. Recent commits titled "checkpoint of helpers' work in progress" are unfinished states saved on purpose; the tree may not pass until the step they belong to is finished.
4. Things that are NOT in the repository and die with a session: helpers that were still running, and audition takes not yet published as a listening page. The "In progress" list below says what was in flight; redo any item whose result is not on the branch.

## Owner's casting decision for the kingdom (2026-11-20)

The owner listened to the casting page and chose **Jo M. on `eleven_v4` with written direction** (voice id `jemqINv7N9LKUclcLQnU`; the record of the takes is `docs/magical-kingdom/casting/kingdom-voice-casting.json`). No second choice. So the earlier problem was the recipe, not the voice. In the letter-sound side test the owner marked as right: m written phonetically, m spelled out, s spelled out, b spelled out. So the spelled-out form is the recipe to try for all 16 letter sounds in this voice, by audition.

## In progress

State at the last update (2026-11-21, 13:10 UTC). `main` exists on GitHub and is at `e4e6a1b`: on a clean checkout of that commit `npm run verify` passed (2,445 tests), `validate:content` passed, the bundle check passed, and the browser suite passed 28 of 29 in one run with the 29th passing three times alone (its only miss was a 250 ms reaction budget under machine load). Browser only; nothing here has been seen on a device. `main` is moved forward only to a commit that has passed those gates on a clean checkout; the working branch takes every step.

Done since 2026-11-20 and on the branch:

- **Kingdom fix round** from the scripted child playtest and a code review (17 items): one press of Help is one rung; the listening hold covers only the story and question, the how-to line is an interruptible tail; with Sound off no royal game is offered (D212); a clip that fails is not counted as heard; an ask cut by the app going away is retold; guards against double taps; print and sound agree. Harness: `npm run web:kingdom-playtest`.
- **The older kingdom rooms by ear** (D211): Word Garden, Ice Palace, Dress-up, castle hall; launch order and gift fixes.
- **Elevator Quest voice** built with no audio (D210), then ten review findings fixed (D213 to D215): a recording plays to its own end (this fixed Word Golf's words being clipped), story lines fade when the car departs, beats wait for their whole sequence, captions leave with their voice, every voiced line fits Lifty's bubble on the two landscape tablets.
- **Elevator Quest child playtest harness**: `npm run web:elevator-playtest` (three personas, about 11 minutes).

Running now (helpers; redo any whose result is not on the branch):

1. **Kingdom round two**: a told story is a picture book and the book tells it again (D216, in), the how-to line stops after two interruptions, Help shows it is speaking, a clearer Sound off room, and the word list for the next recording batch in `content/themes/magical-kingdom/recordings-pending.json` (replacements for the star and rabbit pictures that clash with controls, the letter sound f, the counting words, the reworded bridge lines).
2. **Elevator Quest defects from its child playtest**: a door reopened mid-ride is taken for the arrival and can strand a child on a landing with nothing to press; a second B1 press loses the job's words; a double tap on NEXT JOB records a clue nobody asked for or opens a game; a double DOOR CLOSE counts one wrong cargo load twice; six smaller items. The harness's guesser persona exits 1 until these are fixed.

Rule learned the hard way: every generated take's flow id, generation id AND run session id go into its manifest as it is made. A take can be fetched again from ElevenLabs only when the session id is known.

Usage: the five-hour limit covers both models and four helpers at once use it in about three and a half hours. Helpers cut off by it are resumed by message when it resets; their work in progress is saved in commits titled "Checkpoint".

Credits this month (pool 60,444, resets on the 7th): 13,386 used as of this update; nothing generated since 2026-11-20.

## Owner's casting decision for Elevator Quest (2026-11-21)

By ear from the casting page: the Elevator is **Ava**, Lifty is **Sigma Centauri**, the Repair Crew is **Jamie** (voice ids in `docs/elevator-quest-casting/elevator-quest-voice-casting.json`, `owner_decision`). The Elevator's 28 lines and Lifty's 9 can be recorded now; the crew's 10 wait until their final words are settled (next item 3).

## Next, in order

1. After the two running rounds: the full gates on a clean checkout, then move `main` forward.
2. **Recording batch two** in the kingdom's chosen voice (three takes a line, a listening page): everything in `recordings-pending.json`, about 2,000 credits before the picture-clash replacements are counted. Then the small content swap for the star and rabbit words.
3. **A radio caption strip for Elevator Quest**, so the Repair Crew's lines can be full sentences again. D215 cut them hard to fit Lifty's bubble (1,813 to 1,593 characters); restore the fuller lines before anything is recorded.
4. Make the browser suite's 250 ms reaction budget reliable on a loaded machine without loosening what it protects on a tablet (it has missed three times under load and never on a rerun).
5. After the owner's pass on batch one: swap and redo the flagged takes, mark the batch heard, then record the older castle and Word Garden narration in the same voice, and adopt letter sounds the owner picks.
6. Custom sound effects for both games from the audition picks (trim, level, wire in; fill the four Elevator Quest ride slots).
7. Elevator Quest: after the owner picks its three voices, record the script, then the landings (108 lines) and Word Golf (74 words; 36 have no recording today, so those words are never said).
8. More kingdom content (words, rhymes, stories) so a week of play does not repeat.
9. Robustness: a continuous-integration check on every push; a look at both games on a device.
10. Art: painted scenes for the games and reward pictures, once image generation is re-authorized and quoted.

## Waiting on the owner

- Listen to three pages: kingdom narration batch one, kingdom sound effects, Elevator Quest sounds (Elevator Quest voice casting is decided).
- Decide: the Ice Palace bridge gives exactly as many crystals as the goal, so emptying the tray is always right and is recorded as counting. Recommended: two or three spare crystals. It changes what that evidence means, so it waits for a yes.
- Decide: the Elevator Quest cargo encounter never shows the answer (12 wrong loads got one test run), and SHOW ME on practice jobs comes at the eighth miss. Recommended: show the answer after a set number of misses, recorded as help, and bring SHOW ME in around the fifth.
- Make `main` the default branch on GitHub (Settings, Branches; a session cannot do it).
- Re-authorize the image-generation connector, and reconnect ElevenLabs with usage access if a session should see the balance itself.
- A few minutes of each child playing, now and then: where they got stuck, what they chose to do again, what they said.
- Say when the weekly allowance of the top model is nearly used, or apply a reset.
