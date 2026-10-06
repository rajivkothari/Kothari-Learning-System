# Product

## What we are building

One reusable, offline educational adventure-game engine. Each child gets a themed experience that feels like a different game, built on shared systems.

First two experiences:
- Elevator Quest (learner-engineer archetype): cinematic engineering adventure. The elevator is a machine.
- Magic Tower (learner-storyteller archetype): cinematic storybook fantasy. The elevator is a portal.

Archetypes and the profile model: [LEARNER_PROFILES.md](LEARNER_PROFILES.md). Real learner data never enters the repository.

Shared across every experience: learning engine, curriculum and skill graph, adaptive challenge, mastery tracking, progression, rewards, activity framework, persistence, parent tools, accessibility, content schemas, save system.

Different per experience: world, art, audio, narrative, characters, rewards presentation, mission framing, which skills are emphasized.

Adding another learner means adding a theme pack and content, not cloning the app.

## Scope of learning

Pre-K through roughly Grade 8. Grade level is metadata only. Progression runs on skills, prerequisites, mastery evidence, application, and rising cognitive complexity. Nothing in the data model may assume a Grade 3 ceiling.

As a child ages, the world should get intellectually richer (diagnosing failures, comparing solutions, justifying with evidence), not just show bigger numbers in the same activities.

## Platforms

- Apple iPad and Amazon Fire tablets. Tablet-first, touch-first.
- Distribution later: Apple App Store and Amazon Appstore.
- Core gameplay is fully offline. No accounts, no cloud, no Google Play Services, no live AI, no server-side question generation.
- Fire hardware is the performance floor.

## Product principles

1. Game first, learning underneath. The learning action changes the world (press the right floor and the car moves, pick the right letter and the puppy gets its hat).
2. Information lives in the world: panels, terminals, maps, manuals, signs, books, letters, dialogue. Avoid worksheet framing such as "Question 4 of 10".
3. Reward learning, not repetition. Mastered easy content yields little or no progression.
4. Difficult but fair. Some activities are meant to be hard. Failure costs effort, never earned rewards.
5. Accessibility and challenge are separate dials.
6. Deterministic, reviewed, validated content. Children never receive live-generated questions.
7. Build vertically. A few excellent activities beat hundreds of mediocre ones. Test with the children often.

## Explicit non-goals

No ads, paid currency, loot boxes, battle passes, pay-to-win, artificial scarcity, FOMO, daily-login pressure, streak punishment, grinding loops, public leaderboards, lives, game-over screens, token loss for academic mistakes, forced speech, mandatory internet, live generative AI choosing children's content, or comparison between learners.

This is a niche, high-quality family learning game. Depth and educational impact beat mass-market engagement metrics.

## Future concepts (not scheduled)

- Adventure Book (Magic Tower): completed adventures produce simple storybook pages built from words and characters the learner practiced.
- Shared multi-learner missions: each learner contributes age-appropriate work to a common event. Scores never compared.
- Adult-only AI-assisted content authoring. Output goes through the same validation pipeline as hand-written content before it becomes playable.
- Optional sync or backup. See the cloud boundary in [ARCHITECTURE.md](ARCHITECTURE.md).
