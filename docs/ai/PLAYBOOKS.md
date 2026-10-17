# Playbooks

Saved procedures, copied word for word from the owner's Operator SOP (AI Development OS, 17 October 2026, Section 3). Not loaded in normal sessions: open this file only when the owner asks for a prompt by number or name.

In this repository the integration branch named in AGENTS.md plays the role the prompts call main.

## How saved prompts should work

When I say Run and a prompt number or name, use that prompt. Take the task from my message or the current conversation. Ask only for what is missing, then wait. Don't ask again when the task is already clear. Never make me reopen this guide to replace fields.

A full prompt starts at MODEL and ends before the next P heading. Copy the whole prompt, including its safeguards. Supply the task naturally before or after it. A tool label doesn't move a conversation or grant access to project files.

| ID | Use it for | Tool |
|---|---|---|
| P01 | Clean up instructions and set up | Claude Code |
| P05 | Build a normal change | Claude Code |
| P06 | Make a small change | Claude Code |
| P07 | Find the cause before fixing it | Claude Code |
| P08 | Prepare a decision brief | Claude Code |
| P17 | Check the project or a PR | Claude Code |
| P09 | Think through the options | ChatGPT, not stored here: SOP Section 4 |
| P10 | Challenge the idea | Gemini, not stored here: SOP Section 4 |
| P11 | Sort the feedback | ChatGPT, not stored here: SOP Section 4 |
| P13 | Get an independent PR review | Codex, not stored here: SOP Section 4 |

## P01 Clean up instructions and set up

```text
MODEL: CLAUDE CODE

This is the first setup and cleanup pass for this project. Do not start by adding instructions. Do not append this system to an existing CLAUDE.md. Look at what is already there, then keep only what will make future sessions better.

If I have not told you which project to work on, ask me before continuing. Use the project named in my message or the current conversation. Do not ask again when it is clear. This setup pass is the task; I do not need to supply another one.

First look without changing anything

Before creating or changing files, find the sources of AI instructions and project context that may affect Claude Code. Check at least:

- CLAUDE.md and AGENTS.md

- nested CLAUDE.md or AGENTS.md files

- .claude/rules/

- .claude/commands/ and any other saved commands or playbooks

- docs/ai/ and other instruction files in the project

- architecture, roadmap, decision, status, and handoff documents

- imported or linked guidance and other instructions visible in this session

Follow references where you can. Separate rules for the whole project, rules for one area, procedures used only when requested, and reference documents. Say which guidance you can confirm is active and which files merely exist. Flag anything you cannot access or whose loading behavior is unclear. Do not claim you found everything if access is incomplete. Do not change personal or organization instructions outside this project.

Look closely at CLAUDE.md. Check whether its instructions are accurate, useful, repeated, conflicting, too broad, or unnecessarily rigid. A short file can still be bad. The goal is useful context, not the smallest word count.

Give each instruction or section one of these destinations. Flag conflicts separately even when you also recommend a destination.

KEEP

Essential instructions Claude needs in most normal sessions.

MOVE TO AGENTS.md

Shared rules that should apply to both Claude Code and Codex.

MOVE TO PLAYBOOKS.md

Steps needed only when I ask for that workflow.

MOVE TO A SCOPED RULE

Rules needed only for one folder, service, language, or part of the project.

MOVE TO PROJECT DOCS

Architecture, current product state, decisions, plans, and reference material that do not belong in instructions loaded for every session.

DELETE

Stale or repeated instructions, obvious project facts, old one-off fixes, motivational text, and explanation that does not improve behavior. Keep useful project records and decision history. Mark an old decision as replaced or archive it appropriately rather than erasing why it was made.

CONFLICT

Instructions that disagree with the current project, another instruction, or an explicit user preference. Show the disagreement. Do not silently pick a side or weaken a safeguard.

For every recommendation, quote the exact instruction or section, give its file and line range or section name, and explain the destination or deletion in one short sentence. Hide secret values. Check factual claims against current files, configuration, and actual checks. Old prose is something to verify, not proof.

Keep what protects the project

Do not remove safety rules, destructive-action gates, deployment pauses, secret-handling rules, testing requirements, branch rules, or explicit user preferences just to save words. Show where each retained safeguard will live and how it will still apply. A safety rule needed for every task must not become an optional playbook.

Do not keep text just because it is already there. Link to one source instead of repeating it. Keep rules for one area close to that area. Put occasional procedures in saved playbooks. Let the code supply facts Claude can inspect directly. Keep essential, non-obvious rules even when they take space.

Persistent context is expensive. Put something in CLAUDE.md only if Claude benefits from seeing it on most coding sessions.

Show me the plan before making changes

Before changing an instruction file or creating the new structure, show me:

1. What you found, with paths and any uncertainty about where the rules apply.

2. What to keep and why it helps normal sessions.

3. What to move, where it will go, and how its scope stays intact.

4. What to delete, with exact source references and reasons.

5. Conflicts, stale or overly rigid instructions, and open questions.

6. The proposed file structure and final instruction text or a clear before-and-after comparison. Show that the safeguards are still covered.

7. Rough before-and-after sizes and how you estimated them.

Measure CLAUDE.md separately from all the guidance expected to load in a normal session, including imported shared rules and rules for the area being worked on. Moving text into AGENTS.md saves no context if it still loads. Count repeated loaded text where relevant. Label token estimates and assumptions about loading; use measured word or character counts if no tokenizer is available. Do not invent a reduction target or claim you measured a runtime improvement. Safety rules and user preferences come before a size target.

STOP AND WAIT FOR MY APPROVAL. Present the plan in this conversation. During this first phase, do not create, rewrite, delete, or move instruction files, fill playbooks, or change other project files. Approval must cover the actual proposed changes. If a new conflict or a change in scope makes that plan unsuitable, stop and get approval for the revised plan.

After I approve the plan

1. Check the branch and unfinished local work. Preserve that work, safely bring the branch up to date with main, and use a separate setup branch and PR. Stop if that cannot be done safely.

2. Keep a recoverable copy of the starting point. Make only the approved instruction changes. Create AGENTS.md if needed for shared engineering rules. Make CLAUDE.md import or reference those rules in a way supported by the verified setup. Leave only useful Claude-specific persistent guidance there. Remove repeats and check that references work.

3. Create or improve docs/ai/PLAYBOOKS.md. Add the approved starter prompts P05, P06, P07, P08, and P17 from Section 3, plus their invocation rules and engineering safeguards. Include P01 so I can run this cleanup again. Add other project prompts only as approved. Keep routing references for P09-P11 and P13 to Section 4. Every full prompt starts with its exact MODEL label. No bracketed task fields or shortened prompt summaries.

4. Keep useful project docs and link to them instead of duplicating them. Create or improve docs/CURRENT_STATE.md, docs/ARCHITECTURE.md, docs/ENVIRONMENT.md, docs/ROADMAP.md, docs/ICEBOX.md, docs/decisions/, docs/specs/, and docs/archive/ only where the approved plan needs them. Do not invent product intent, promote unapproved ideas, or rewrite decision history. Keep the CURRENT_STATE.md rule below.

5. If approved, create or improve .github/pull_request_template.md with scope, tests, docs, risks, screenshots or a preview for visual work, and deployment notes. Put the real lint, typecheck, build, and test commands in AGENTS.md. Say when a command does not exist; do not invent one.

6. Do not change production code or app behavior in this setup pass. Do not change production configuration, permissions, deployments, database state, login, or billing. Keep secrets out of files and review material. Use environment-variable names only.

7. Check the final instruction structure, references, scope, repeated or conflicting rules, retained safeguards, model labels, and natural commands. Run checks appropriate to these documentation changes. Say what you did and did not verify. Measure size again using the same method, flag remaining uncertainty, and explain the approved changes in the PR.

8. Stop before merge and show me the setup PR. Approval to clean up instructions is not approval to merge or deploy.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```

## P05 Build a normal change

```text
MODEL: CLAUDE CODE

If I have not already given you the specific task or subject for this request, ask me what I want you to work on before continuing. Do not begin the workflow until the task is clear. Use the invocation and current conversation first. Do not ask again when the subject is already clear. Ask only for missing information needed by this workflow; do not request fields I have already supplied.

Implement the requested task using the project's existing conventions.

Before editing:

- inspect the relevant code and project instructions

- tell me only if the approach is unsafe, repeats work already done, or is much messier than a clear alternative

Then:

1. Work on a dedicated task branch, never main.

2. Implement the smallest clean solution that satisfies the requirement.

3. Add/update tests appropriate to the change. For a bug fix, add a regression test when practical.

4. Run the project's actual check commands.

5. Self-review the diff for accidental scope growth, dead code, regressions, and unnecessary complexity.

6. Update lasting project notes/decision records only when the completed change actually alters them.

7. Push the branch and open/update the PR with check results and risks.

8. Stop before production deployment. Follow the project's merge policy.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```

## P06 Make a small change

```text
MODEL: CLAUDE CODE

If I have not already given you the specific task or subject for this request, ask me what I want you to work on before continuing. Do not begin the workflow until the task is clear. Use the invocation and current conversation first. Do not ask again when the subject is already clear. Ask only for missing information needed by this workflow; do not request fields I have already supplied.

Make the requested contained change.

Use the existing pattern. Do not redesign adjacent code unless the requested change cannot be completed cleanly without it.

Work on the task branch, run the relevant checks, update the PR, and tell me if the scope expanded beyond what I asked.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```

## P07 Find the cause before fixing it

```text
MODEL: CLAUDE CODE

If I have not already given you the specific task or subject for this request, ask me what I want you to work on before continuing. Do not begin the workflow until the task is clear. Use the invocation and current conversation first. Do not ask again when the subject is already clear. Ask only for missing information needed by this workflow; do not request fields I have already supplied.

Investigate the reported bug or observed behavior before changing code.

1. Reproduce or trace the failure if possible.

2. Identify the likely root cause with evidence from files or the running app.

3. Tell me whether the issue is code, data, environment/configuration, external service behavior, or still uncertain.

4. Propose the smallest safe fix and the regression test that should fail before the fix.

5. Do not edit until the diagnosis is clear enough to justify the change, unless I have explicitly asked you to proceed automatically.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```

## P08 Prepare a decision brief

```text
MODEL: CLAUDE CODE

If I have not already given you the specific task or subject for this request, ask me what I want you to work on before continuing. Do not begin the workflow until the task is clear. Use the invocation and current conversation first. Do not ask again when the subject is already clear. Ask only for missing information needed by this workflow; do not request fields I have already supplied.

Do not implement anything.

Prepare a self-contained Decision Brief for the requested decision, feature, or problem.

Include only what an outside reasoning model needs:

- goal and desired user outcome

- current behavior

- relevant architecture/data flow

- exact files, interfaces, schema, APIs, or constraints that affect the decision

- known environment/runtime constraints

- 2-3 technically viable options if more than one exists

- engineering cost/complexity of each option

- migration/compatibility with existing behavior concerns

- what is uncertain

Do not choose the product decision for me. Do not dump the entire project. Save the brief under docs/specs/ or provide it as a clean standalone file.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```

## P17 Check the project or a PR

```text
MODEL: CLAUDE CODE

Use the invocation and current conversation to resolve the audit target. If an explicit PR is supplied, such as Run P17 on PR #142, scope this read-only health audit to that PR, its affected areas, and relevant project context. If no narrower subject is supplied and the current project is unambiguous, audit that project without asking for a task. If neither repo nor scope is clear, ask only for the missing target. A scoped health audit does not replace P13 independent PR review.

Perform a read-only project health audit. Do not modify code or docs yet.

Check:

1. CURRENT_STATE.md vs actual active implementation

2. ARCHITECTURE.md vs current system shape

3. ROADMAP.md vs active specs/issues

4. Decision records for superseded decisions that were never marked

5. Stale open PRs/branches/specs

6. Dead code, duplicate abstractions, unused dependencies, and obvious simplification opportunities

7. automatic checks/test blind spots

8. Secret/configuration/documentation risks

9. AGENTS.md / CLAUDE.md for stale or contradictory instructions

Prioritize findings:

P0 unsafe/wrong in a way that matters

P1 repeated failure/staleness

P2 meaningful simplification

P3 optional polish

Do not manufacture work. Return evidence and recommended next actions.

Check the evidence

Check the current AGENTS.md, CLAUDE.md where it applies, and the relevant project files before acting. Trust current code, observed app behavior, and checks over chats, memory, or old docs. Do not invent files, APIs, behavior, commands, results, or claims that something is built. Point to the file, test, or observed behavior behind each finding. Say what is uncertain or was not checked.

Keep the work safe

Keep each task on its own branch and PR. Never commit directly to main. Check the branch and unfinished local changes first. Before starting or resuming edits, bring the branch up to date with the latest main using the project's rules. Preserve local work. If that cannot be done safely, or conflicts cannot be resolved safely, stop and explain. Never bypass main protection, required checks, or required reviews. Put actual check results and anything not verified in the PR. Do not merge while required checks are failing or still running. Follow the project's merge rules and stop points.

Protect secrets and project notes

Never commit secret values or raw chat exports that have not had private information removed. Use environment-variable names and the proper secret stores. Keep unapproved ideas in ICEBOX.md and leave it out of normal coding context. Leave docs/CURRENT_STATE.md alone for routine fixes, refactors, copy changes, and ordinary improvements. Change it only when a major capability changes status or is removed or replaced. Check conflicting status claims against current evidence; do not overwrite another branch's work.

Pause before anything goes live

Stop before production deployment. First check whether merging would put the change live; if it would, pause before merge. Get my explicit approval unless a deliberately configured deployment or incident policy permits that exact action. Pause for explicit approval before production database or billing changes. For login or permissions changes, get a fresh independent review, check who can access what, and get approval before changing production access. Keep the backups, recovery steps, staging or sandbox checks, regression tests, and rollback plan the risk calls for. Important changes and large refactors need an independent review; reviewing your own work does not count.
```
