# private/

Local-only folder for family-specific information. Everything here is gitignored except this README and `*.example.*` templates.

| File | Tracked | Purpose |
|---|---|---|
| `README.md` | yes | this note |
| `learners.example.json` | yes | shape of a local learner seed, with fake data |
| `learners.local.json` | no | real seed values for local development builds (optional) |
| `LEARNERS.local.md` | no | real design notes about each child |

Rules:
- Real names, ages, diagnoses, and family details live only here or in the app's on-device storage.
- Tracked code and docs refer to learner archetypes (`learner-engineer`, `learner-storyteller`) and product requirements, never to a real child.
- The shipped app creates profiles at runtime (first-run setup, later Parent Mode) and stores them in on-device SQLite. Nothing here is bundled into the app today.
- Cloud coding sessions clone the repo fresh, so they will not see these files. Paste relevant notes into a session when a task needs them.
