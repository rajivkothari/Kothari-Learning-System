# Work queue

What is being worked on now and what comes next, so a session that starts cold (or a helper that takes over) knows where to pick up. Update it when a round starts or ends, and push. Standing instructions are in CLAUDE.md ("How the owner wants to work"); decisions are in docs/DECISIONS.md.

Last update: 2026-11-20.

## Starting cold (a new session)

1. Work on branch `claude/kingdom-reading-games` and push every commit to it (CLAUDE.md, "Git" and "How the owner wants to work"). The repository's default branch is older and has none of this.
2. Read `CLAUDE.md`, then this file, then `docs/magical-kingdom/REBUILD_SPEC.md` (its status list at the end says what of the kingdom rebuild exists).
3. `npm ci`, then `npm run verify` to see the state of the tree. Recent commits titled "checkpoint of helpers' work in progress" are unfinished states saved on purpose; the tree may not pass until the step they belong to is finished.
4. Things that are NOT in the repository and die with a session: helpers that were still running, and audition takes not yet published as a listening page. The "In progress" list below says what was in flight; redo any item whose result is not on the branch.

## Owner's casting decision for the kingdom (2026-11-20)

The owner listened to the casting page and chose **Jo M. on `eleven_v4` with written direction** (voice id `jemqINv7N9LKUclcLQnU`; the record of the takes is `docs/magical-kingdom/casting/kingdom-voice-casting.json`). No second choice. So the earlier problem was the recipe, not the voice. In the letter-sound side test the owner marked as right: m written phonetically, m spelled out, s spelled out, b spelled out. So the spelled-out form is the recipe to try for all 16 letter sounds in this voice, by audition.

The top model's five-hour allowance ran out at this point; work continues on the next model down, as the owner instructed.

## In progress

State at the last update (2026-11-20, evening): the kingdom is rebuilt on this branch. Content, game logic, screens, castle and games room, letter sounds, pictures, icons, effects, typeface and docs are in, and the gates pass with the narration wired in (verify 2,324 tests, five kingdom browser checks, content validation, the bundle check). `claude/floor15-plan-before-press` (D201) is merged in.

1. **Kingdom narration, batch one** (the owner's chosen voice on `eleven_v4`): 70 clips, three takes each, default takes registered in `audio/games.ts` from `assets/themes/magical-kingdom/audio/games-v2/` (manifest with every take's ids). `humanReviewed` is false: the owner has a listening page and will flag takes to swap or redo. 48 letter-sound candidates in the same voice sit in the review folder beside the library sounds in use.
2. **Child playtest harness and break-it pass** for the kingdom: a tester is writing `scripts/kingdom-child-playtest.js` and reporting defects. Fix what it finds, then rerun the gates.
3. **Elevator Quest voice**: the direction is in `docs/ELEVATOR_QUEST_VOICE.md`. An engineer is building the plumbing and writing the script (`content/themes/elevator-quest/voice.json`), with no audio. The casting audition (twelve voices, three roles) is on a listening page; the record is `docs/elevator-quest-casting/elevator-quest-voice-casting.json`.
4. **Sound effects audition** for both games (57 candidates, 19 slots): record in `docs/audio/sfx-audition-2026-11.json`, two listening pages with the owner. Effects cost about 3.3 credits a second.

Rule learned the hard way: every generated take's flow id, generation id AND run session id go into its manifest as it is made. A take can be fetched again from ElevenLabs only when the session id is known.

Credits this month (pool 60,444, resets on the 7th): 13,386 used as of this update.

## Next, in order

4. After the owner's pass on batch one: swap and redo the flagged takes, mark the batch heard, then record the older castle and Word Garden narration in the same voice, and adopt letter sounds the owner picks.
5. Custom sound effects for the kingdom (generated for each game) in place of the free pack, by audition.
6. (done) `claude/floor15-plan-before-press` (D201) is merged into the working branch.
7. Elevator Quest: after the owner picks its three voices, build in the order in `docs/ELEVATOR_QUEST_VOICE.md` (announcements and elevator sounds first, then the story arc, landings, Word Golf), with the code changes it lists.
8. More kingdom content (words, rhymes, stories) so a week of play does not repeat.
9. Robustness: a continuous-integration check on every push; a child playtest harness for Elevator Quest; a code review pass over the rebuilt kingdom; the rest of the kingdom for a pre-reader (the ice bridge, dress-up, the Word Garden's own flow).
10. Art: painted scenes for the games and reward pictures, once image generation is re-authorized and quoted.

## Waiting on the owner

- Listen to four pages: kingdom narration batch one, Elevator Quest voice casting, kingdom sound effects, Elevator Quest sounds.
- Make `main` the default branch from the current integration line (five minutes on GitHub; needs the owner's yes because it is not reversible by a session).
- Re-authorize the image-generation connector, and reconnect ElevenLabs with usage access if a session should see the balance itself.
- A few minutes of each child playing, now and then: where they got stuck, what they chose to do again, what they said.
- Say when the weekly allowance of the top model is nearly used, or apply a reset.
