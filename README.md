# Kothari Learning System

An offline, tablet-first educational adventure-game engine for iPad and Amazon Fire. One shared learning engine powers separately themed games for each learner.

Status (M7): one playable mission, "Floor 15" in Elevator Quest, built in software on a pure TypeScript learning engine with SQLite persistence: a 20-floor elevator panel as the answer interface, help, Concept Rescue, a cargo encounter, success replays, and 20 distinct landings. It runs as an iPad or Fire build and as a browser playtest build (`npm run web:playtest`). Not yet done: runs on physical devices and the first child playtest, so performance and sound on devices are unverified. A developer-only Device Lab and developer tools are included and stay out of production child builds.

There is no CI. `npm run verify` is the gate before every commit.

Start with [CLAUDE.md](CLAUDE.md) for the doc map and project rules.
