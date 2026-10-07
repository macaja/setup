---
name: worktree-creation
description: Creates a new git worktree for a branch by running the `create-wt` script, which enforces conventional-commit branch names (`feat/...`, `fix/...`) and puts the checkout under `.worktrees/`, and names a branch that delivers an epic row or an issue after it (`feat/epic-1086-s1-...`). Use whenever the user asks for a new worktree, a new branch to work on, or a handoff to a worktree that does not exist yet. Not for switching to an existing worktree or for Orca terminal management.
---

# Worktree creation

Always create worktrees with the `create-wt` script. Never run `git worktree add`
directly and never run `orca worktree create` — Orca names the branch after the
GitHub username (`macaja/...`), which is wrong for this repo.

## Branch name

`<type>/<kebab-case-name>` where `<type>` is a conventional-commit type:
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style`, `test`. Pick the type from the kind of change, the same way you would
pick the commit prefix. Never prefix with a username.

Examples: `fix/model-list-unknown-horizon`, `feat/mcp-run-inputs-tool`,
`chore/bump-vitest`.

### Work that belongs to an epic or an issue

When the branch delivers a row of an epic's sequencing list, name it
`<type>/epic-<epic number>-<row id>-<kebab-case-name>`, with the row id in
lowercase. When it delivers a standalone GitHub issue, name it
`<type>/issue-<issue number>-<kebab-case-name>`. The type still follows the
kind of change.

Examples: `feat/epic-1086-s1-storage-location-rename` (row S1 of epic #1086),
`fix/issue-1042-duplicate-run-rows` (issue #1042).

If the user names the epic but not the row, look the row up in the epic's
issue body (`gh issue view <number>`) instead of guessing it.

## Steps

1. Run from the main checkout's root (the script pulls `origin main` there first,
   so a dirty main checkout makes it fail — report that instead of stashing):

   ```bash
   command create-wt <type>/<name>
   ```

   `command` skips the zsh wrapper that `cd`s into the result. The script prints
   the absolute path of the new worktree on stdout; everything else goes to
   stderr.

2. Use the printed path for any follow-up work (`git -C <path> ...`, tests,
   editing).

3. If Orca is in use (an Orca terminal, or a handoff), it discovers the new
   `.worktrees/<branch>` checkout on its own. Get its id with
   `orca worktree list --json` and match the entry whose `path` equals the
   printed path; the `id` is `<repoId>::<path>`.

## Limits

The script always branches from freshly pulled `origin/main`. If the user wants
the branch stacked on another branch, say the script cannot do that and ask
before falling back to `git worktree add <path> -b <type>/<name> <base>`.
