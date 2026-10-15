# AI review bundles

Plain Markdown files an external AI reviewer can read directly, with no archive to unpack. Developer tooling only: `scripts/build-review-bundle.mjs` has no dependencies, is never imported by the app, and writes only to `.ai-review/` (gitignored). The generator and its config (`scripts/review-bundles.json`) are committed; the bundles never are.

## Make one

```bash
npm run review:project            # rules, product, architecture, learning model, design, roadmap, every decision
npm run review:learning-engine    # src/engine, src/runtime, src/persistence, packs, missions, their tests and docs
npm run review:elevator-quest     # the theme and the shared mini-game framework, content, tests (mini-games left out)
npm run review:word-golf          # Word Golf source, tests, content, spelling pack, its doc section and decisions
npm run review:bundle -- change --base <sha> --head <sha>   # a change review (head defaults to HEAD)
npm run review:bundle -- --list
```

Options: `--out <dir>`, `--max-part-bytes <n>` (default 900000; a bundle larger than that is split into `<name>.partN-of-M.md`, never splitting a file). Written to work the same on Windows, macOS and Linux with Node 18 or later and git on the PATH: no shell, forward-slash repository paths, `\n` output whatever the checkout's line endings. Checked on Node 22 on Linux, including a clone with Windows line endings (`core.autocrlf=true`), which gave a byte-identical bundle; not yet run on Windows itself.

## What is in a bundle

- A header: bundle, description, branch, SHA (and base, for a change), whether the working tree was clean, the generation time (UTC), file count and size, parts.
- A manifest: every file with its kind (rules, source, test, content, doc, config, diff, extract), lines, bytes and part, and a "Left out" table naming anything asked for but excluded, with the reason.
- Each file between `FILE: <path>` and `END FILE: <path>`, in a fenced block. A path in [brackets] is generated for the bundle (a diff, a summary, or an extract such as one section of ELEVATOR_QUEST.md or the decisions behind a game).

A change bundle reads git's objects, so it is exactly `<base>..<head>` whatever is uncommitted: the commits and diff stat, the text diff, the project rules (CLAUDE.md, AI_WORKFLOW.md, PROJECT_STATE.md), every changed text file in full as it is at the head (a changed doc over 60 KB is left to the diff), and up to 40 unchanged tests that cover the changed files (same name, or importing them by relative path). An area bundle reads the working tree and says when it was dirty.

## What is never in a bundle

Only git-tracked text files are read, so dependencies, builds, screenshots and anything gitignored never enter. The config also excludes art and audio (`assets/`), lockfiles, Jest snapshots, generated runtime manifests, recordings lists, `.env` files and `private/` (CLAUDE.md non-negotiable 14). Check a bundle before sending it outside the project like any other file.

## Changing the bundles

Edit `scripts/review-bundles.json`: each bundle has a description, `include` and `exclude` globs (`*` within a folder, `**` at any depth) and optional `extracts` (`heading` for one section of a document, `paragraphs` for the paragraphs that start with a pattern).
