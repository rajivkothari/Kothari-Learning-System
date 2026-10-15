# AI workflow

How the coding agents divide the work and how they are prompted. Permanent rules are in CLAUDE.md; where the project stands is in PROJECT_STATE.md.

## Roles

| Who | Role |
|---|---|
| Project owner | Sets product scope and priorities, approves policy changes and production art and audio decisions, and accepts or rejects audit findings. |
| ChatGPT / Work | Product, game and creative direction; maintains the shared design thread and helps the owner resolve product tradeoffs. Work handles files and assets as needed. |
| Claude | Primary implementation engineer. Writes, tests and commits production code, docs and decisions on the branch the task names. Reviews other agents' work before any of it is integrated. |
| Argon | Optional independent challenger for design and code review. Findings go to the shared issue for triage; Claude implements accepted fixes. |
| Codex | Specialist backup, second auditor or isolated prototyper when explicitly useful; not a required workflow step. |

Agents do not redefine these roles themselves.

## Shared design issue

Use one GitHub issue per substantial product change or unresolved design decision. Start with `.github/ISSUE_TEMPLATE/design.md`; small fixes within settled intent do not need a new design issue. Link an existing issue instead of opening duplicates.

First shared thread: [Word Golf readability, course identity and wind flight (#1)](https://github.com/rajivkothari/Kothari-Learning-System/issues/1). Read the issue for its decisions and status.

1. Read CLAUDE.md, PROJECT_STATE.md, the linked issue and all its comments, then inspect the relevant implementation. If substantial work has no linked issue, find the matching issue or create a short draft before building. Record the target branch. Do not invent owner approval.
2. ChatGPT develops the product proposal with the owner. Claude posts a concise **Engineering response** when a constraint materially affects the desired experience, scope, learning evidence, saves, accessibility or delivery: constraint with source, practical options and tradeoffs, recommended option, and the exact decision needed. If none exists, a brief acknowledgment and implementation plan is enough.
3. Resolve routine engineering choices within the approved scope. Escalate only genuine owner choices: changed player experience, policy, scope, approved assets or another tradeoff the owner must accept. Pause only the affected work; continue independent approved work. Never silently substitute a different design.
4. Record the owner's explicit decision in the issue, with a link to its source comment (or identify the owner's direct instruction being transcribed). A proposal or label alone is not approval. Partial approval must name what can proceed and what remains deferred. Re-read new comments before building and reporting completion.
5. Claude implements the approved scope. Link the issue in the commit or PR. Post **Implementation** back to the issue: branch, full commit SHA/PR link, behavior delivered, commands actually run and their results, failures and untested areas. Say browser only / not checked on a device where applicable. Approval to build does not override CLAUDE.md's push rules.
6. Reviewers post findings against the exact implementation SHA in **Review**. Claude fixes accepted findings and reports the new SHA and checks. The owner accepts product/playtest outcomes; agents do not claim that acceptance for them.

Keep the issue as the design/decision conversation, not a second project dashboard. PROJECT_STATE.md remains the single source of current project status; ROADMAP.md remains future work; DECISIONS.md remains append-only durable history. Link between them only when needed. Keep updates short and use comments for engineering responses, owner decisions, implementation and review rather than overwriting conversation history. Do not post private learner/family information.

### Labels

Use `design` plus only the status labels that reflect the issue's remaining scope. Remove stale status labels; preserve unrelated labels. For partial approval, explain the approved and deferred slices in the issue rather than treating the whole issue as approved.

| Label | Meaning |
|---|---|
| `design` | Shared product/design thread |
| `needs-engineering-input` | Waiting for Claude's constraints/options or feasibility response |
| `needs-owner-decision` | A specific material choice is waiting for the owner |
| `approved-for-build` | Explicit owner approval is recorded for the named scope |
| `implemented` | Named scope has an implementation SHA and test report; not acceptance |
| `needs-review` | A specific implementation SHA is ready for review |

No polling bot or automatic agent dispatch is part of this setup. Start or resume the relevant agent with the issue link; read and respond in that issue. If GitHub access is unavailable, report the blocker and prepare a clearly marked unsent response rather than claiming it was posted.

The template is committed on the working branch. GitHub's template chooser requires it on the default branch; until then, copy the template from this branch. Source: [GitHub issue-template documentation](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository), checked 2026-10-15; page version/date unclear. Do not change the default branch solely for this workflow.

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
- An external reviewer gets its context as a review bundle (docs/AI_REVIEW_BUNDLES.md): an area bundle, or a change bundle for one task's commits.

## Prototypes

- A Codex prototype is not automatically production architecture. Claude reviews it before integration: what to keep, rewrite or discard, and the risks.
- Integration is selective (copy or cherry-pick the kept parts onto the working branch). A wholesale merge needs review and the owner's explicit approval. Another agent's branch history is never rewritten.
- Integrated work meets CLAUDE.md, including non-negotiable 14.
