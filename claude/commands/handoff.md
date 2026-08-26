---
description: Hand the plan from this conversation to another Orca worktree and start a Claude session there
argument-hint: <what to hand off> to <worktree name>
allowed-tools: Bash, Write, Read, Grep, Glob, AskUserQuestion
---

Hand off work from this conversation to another Orca worktree: write a self-contained
brief, then start a Claude session in that worktree pointed at it.

Request: $ARGUMENTS

Resolve the `orca` executable once: use `$ORCA_CLI_COMMAND` if set, else `orca-dev` when
`$ORCA_DEV_REPO_ROOT` is set, else `orca-ide` on Linux outside an Orca terminal, else
`orca`. Reuse that same executable for every command below. Pass `--json` throughout.

## 1. Check the current checkout is clean

Run `git status --short`.

If it reports nothing, continue.

If it reports changed files, stop and report to the user: list the files, and say the
handoff moves the conversation but not the working tree. Ask whether to stash the changes
across, leave them, or cancel. Do not proceed until they answer.

If they choose to move them: `git stash push -u -m "handoff: <slug>"` here, and after the
target worktree is resolved in step 2, `git -C <targetPath> stash pop`. Confirm the pop
succeeded before continuing; a conflict there is a blocker to report, not something to
resolve on their behalf.

## 2. Resolve the target worktree

Run `<orca> worktree list --json`. The repo comes from the current worktree, so no `--repo`
flag is needed when running inside an Orca-managed checkout.

Match the name in the request against `displayName`. Display name and folder path do not
always agree, so match on `displayName` — that is what the user sees on the card in Orca's
sidebar.

- Exactly one match: use it. Keep the full `id` value, which looks like
  `<repoId>::<absoluteWorktreePath>`. Both halves are needed later; a bare repo id is not a
  worktree id.
- Several plausible matches: ask which one, listing display name and path for each.
- No match: ask whether to create it. If yes, run
  `<orca> worktree create --name <name> --no-parent --json` and take `worktree.id` and
  `worktree.path` from the result. Use `--no-parent` unless the user asked for work stacked
  on the current branch.

Never hand off to the worktree the conversation is running in. If the resolved target is
the current one, stop and say so.

## 3. Write the brief

Write it to `~/.claude/plans/<slug>.md`, where `<slug>` is derived from the target
worktree's display name with slashes turned into dashes — `feat/foo-bar` becomes
`feat-foo-bar.md`. That matches the naming the existing plan files already use.

If a file with that name already exists, read it first and ask the user whether to replace
it or write to a new name. Do not silently overwrite a plan.

### Pick the scope before writing a word

The request names one piece of work. A conversation usually covered more than that. Decide
which part is being handed off and discard the rest — do not summarise the session.

If the request is vague about which thread it means and the conversation covered several
unrelated pieces of work, ask which one rather than handing over all of them.

### The compaction rule

Self-contained about intent, pointer-based about the repo.

The receiving agent cannot read this conversation, so every decision and constraint has to
be stated outright — no "as discussed", no references back. But it *can* read the
repository, so anything already in the code, in `AGENTS.md`, or in a document under `docs/`
gets a path, not a copy. Never paste existing code into the brief.

### What goes in

- What is being built or fixed, and why. One paragraph.
- The decisions already made. Reasoning only where reopening the question would cost the
  receiving agent real time — otherwise state the decision flat and move on.
- The files and directories involved, as repo-relative paths.
- The order of work, only if doing it out of order breaks something.
- What is out of scope, only where the receiving agent would plausibly wander into it.
- How to tell it is done: the commands to run, the behaviour to check.
- Anything still unresolved that the receiving agent must ask the user about rather than
  decide alone.

### What stays out

- The back-and-forth that produced the decisions, and alternatives that were rejected.
- Debugging detours, dead ends, and anything already finished.
- Other threads from the conversation that this handoff does not cover.
- Background the repository already carries — conventions, architecture, how a subsystem
  works. Point at where it lives instead.
- Anything about this conversation existing at all. The brief reads as if it was always the
  plan.

Aim for under sixty lines. Going well past that usually means conversation is riding along
with the plan; cut back to the decisions and the paths.

## 4. Start the session

Run `<orca> worktree ps --json` and look at the target worktree's `agents` array.

If a Claude agent is already live there, open a fresh tab rather than interrupting it:

```
<orca> terminal create --worktree id:<repoId>::<targetPath> --title <slug> --command "claude --permission-mode acceptEdits" --json
```

If nothing is running there, the same `terminal create` call applies.

Take the handle from the result. Then wait for the TUI to come up before typing into it,
otherwise the text is lost:

```
<orca> terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
```

Then send one short line — not the brief itself. Multi-line text typed into a TUI submits
on the first newline:

```
<orca> terminal send --terminal <handle> --text "Read ~/.claude/plans/<slug>.md and execute it in this worktree." --enter --json
```

If the handle comes back `terminal_handle_stale`, re-run `<orca> terminal list --worktree
id:<repoId>::<targetPath> --json` and use the replacement. Never send to both.

## 5. Report back

Tell the user, in one short block: which worktree it went to, the path of the brief, and
whether a stash moved across. Then stop — do not follow the work into the other worktree or
monitor it.
