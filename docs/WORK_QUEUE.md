# Work queue

What is being worked on now and what comes next, so a session that starts cold (or a helper that takes over) knows where to pick up. Update it when a round starts or ends, and push. Standing instructions are in CLAUDE.md ("How the owner wants to work"); decisions are in docs/DECISIONS.md.

Last update: 2026-11-20.

## In progress

1. **Rebuild the Magical Kingdom games** (lost with an unpushed branch, D208). The full design and a status list are in `docs/magical-kingdom/REBUILD_SPEC.md`. Order: content and game logic, assets (letter sounds, pictures, icons, effects, typeface), then the screens and castle, then the browser checks and the child playtest harness.
2. **Voice casting for the kingdom** (D209): six library voices read four directed pieces on the newest speech model, two takes each, plus a letter-sound side test. Output: a listening page for the owner, who picks the voice. Nothing is recorded in bulk before that.
3. **Survey of Elevator Quest's voice and story** (read-only): what is spoken, what is only read, what story exists, where voiced story moments fit, which sounds are placeholders.

## Next, in order

4. Record the kingdom in the chosen voice: the 61 game lines (each story as one passage, then cut), three to five takes a line, a listening page per batch. Then the older castle and Word Garden narration, and the letter sounds in the same voice if the side test works.
5. Custom sound effects for the kingdom (generated for each game) in place of the free pack, by audition.
6. Bring `claude/floor15-plan-before-press` (D201) into the working branch with an ordinary merge, so both games move together.
7. Elevator Quest: propose a story and voice direction from the survey, cast its voices by audition, then write and record it.
8. More kingdom content (words, rhymes, stories) so a week of play does not repeat.
9. Robustness: a continuous-integration check on every push; a child playtest harness for Elevator Quest; a code review pass over the rebuilt kingdom; the rest of the kingdom for a pre-reader (the ice bridge, dress-up, the Word Garden's own flow).
10. Art: painted scenes for the games and reward pictures, once image generation is re-authorized and quoted.

## Waiting on the owner

- Pick the kingdom's voice from the casting page (about ten minutes).
- Make `main` the default branch from the current integration line (five minutes on GitHub; needs the owner's yes because it is not reversible by a session).
- Re-authorize the image-generation connector, and reconnect ElevenLabs with usage access if a session should see the balance itself.
- A few minutes of each child playing, now and then: where they got stuck, what they chose to do again, what they said.
- Say when the weekly allowance of the top model is nearly used, or apply a reset.
