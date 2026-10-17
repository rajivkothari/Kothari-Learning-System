# CLAUDE.md

<!-- Claude Code reads AGENTS.md only through the import below. Do not remove it. -->
@AGENTS.md

## Claude only

- Claude is the primary implementation engineer. Roles and the shared design-issue protocol: docs/AI_WORKFLOW.md.
- Rules in `.claude/rules/` load when you work in matching files and are as binding as this file.
- Saved procedures live in docs/ai/PLAYBOOKS.md. Run one only when the owner asks for it by number or name.
- After each response, give the owner the steps to update the game: fetch, check out and pull the branch that holds the change, `npm install`, `npm run web:playtest`, and the scenario URL to open.
