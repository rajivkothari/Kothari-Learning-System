# AI workflow

How the coding agents divide the work and how they are prompted. Permanent rules are in CLAUDE.md; where the project stands is in PROJECT_STATE.md.

## Roles

| Who | Role |
|---|---|
| Project owner | Sets product scope and priorities, approves policy changes and production art and audio decisions, and accepts or rejects audit findings. |
| Claude | Primary implementation engineer. Writes, tests and commits production code, docs and decisions on the branch the task names. Reviews other agents' work before any of it is integrated. |
| Codex | Primary independent auditor. Secondary creative and prototyping agent. |

Claude and Codex do not redefine these roles themselves.

## Prompting

- Claude prompts: minimum sufficient context and a narrow execution scope. CLAUDE.md and PROJECT_STATE.md carry the standing context, so a prompt states only the task, its limits and what to report.
- Engineering work: short, surgical prompts (the defect or change, the area, the acceptance check).
- Later game-quality work may carry deeper creative context, but still one experience or objective at a time.
- Codex audit prompts may be intentionally exhaustive.

## Audits

- An audit names the branch and SHA it covers and gives a verdict.
- Accepted milestone audits are stored in `docs/audits/`. They are reference documents, read on demand, not reread on every task.
- Claude fixes the accepted findings and records the decisions. PROJECT_STATE.md names the latest accepted audit and whether a re-audit after the fixes is pending.
- Claude does not independently redo a Codex audit unless asked.

## Prototypes

- A Codex prototype is not automatically production architecture. Claude reviews it before integration: what to keep, rewrite or discard, and the risks.
- Integration is selective (copy or cherry-pick the kept parts onto the working branch). A wholesale merge needs review and the owner's explicit approval. Another agent's branch history is never rewritten.
- Integrated work meets CLAUDE.md, including non-negotiable 14.
