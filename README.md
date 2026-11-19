# setup

This repo holds the configuration of my personal machine: zsh, git, Ghostty,
yazi and Claude Code. One command installs all of it.

## Set up a new machine

Run these two commands:

```sh
git clone git@github.com:macaja/setup.git ~/setup
~/setup/install.sh
```

You can run the installer again at any time. It is idempotent: a step that is
already done does nothing. The installer does these steps:

1. It installs homebrew if it is missing. Then it installs the brew packages
   `ghostty`, `gh`, `yazi` and `git-delta`.
2. It installs oh-my-zsh if it is missing.
3. It clones the custom zsh plugins that `zshrc` uses:
   `zsh-autosuggestions` and `zsh-syntax-highlighting`. The `git` and `z`
   plugins come with oh-my-zsh.
4. It links `~/.zshrc` to `zsh/zshrc`.
5. It links `~/.gitconfig` to `git/gitconfig`, and `~/.gitconfig-work` to
   `git/gitconfig-work`.
6. It links `~/.config/ghostty/config` to `ghostty/config`.
7. It links the yazi configuration into `~/.config/yazi`. Then it installs
   the yazi plugins again from `yazi/package.toml` (`ya pkg install`).
8. It links every script in `bin/` into `~/.local/bin`. `zshrc` puts that
   folder on the PATH.
9. It links the global Claude Code configuration into `~/.claude`:
   `CLAUDE.md`, `settings.json`, `statusline.sh`, and each entry under
   `claude/skills/`, `claude/agents/`, `claude/hooks/`, `claude/workflows/`
   and `claude/commands/`.
10. It runs `collapse-orca-hooks`. Orca writes eleven hooks into
    `settings.json`, and each one is a one-line blob of about 2.5 KB. The
    script makes each hook one readable line.

Claude Code installs its plugins again by itself, from `enabledPlugins` in
`claude/settings.json`.

Each time Orca updates, it writes its long hook blobs into `settings.json`
again. After an Orca update, run `collapse-orca-hooks` to make them short
again.

## Layout

```
install.sh            one-command machine setup
zsh/zshrc             shell configuration (oh-my-zsh, plugins, PATH, aliases)
git/
  gitconfig           delta pager, prdiff alias, personal identity
  gitconfig-work      work identity, included from gitconfig on a condition
ghostty/config        terminal configuration (theme, transparency, splits, keybinds)
yazi/                 file manager configuration (pane ratio, keymap, theme, plugins)
bin/                  → ~/.local/bin
  create-wt           pull main, create .worktrees/<type>/<name>
  clean-wt            remove worktrees whose branch is merged into main
  collapse-orca-hooks make Orca's long hook blobs in settings.json short
claude/               → ~/.claude
  CLAUDE.md           global instructions (communication rules, language)
  settings.json       statusline, theme, permissions, hooks
  statusline.sh       worktree + model + context + usage
  skills/             portable skills (work skills stay local, out of this repo)
  agents/             subagent definitions (empty; parked ones are in agents-disabled/)
  hooks/              scripts that settings.json points to (see below)
  workflows/          multi-agent workflow scripts (see below)
  commands/           slash commands (see below)
```

### Hooks

A hook is a shell script or a text that `settings.json` connects to a Claude
Code event. At the moment, only the hooks of Orca are connected, and
`claude/hooks/` is empty.

Put a rule that must apply to a full session in `CLAUDE.md`, not in a hook
that runs on each prompt. A hook adds its text again on every message.

### Workflows

These scripts are for `/workflows`. Each one sends work out to a group of
subagents:

- `plan-feature.js` writes an implementation plan for a feature branch. Then
  it gives the plan to `review-plan`.
- `review-plan.js` compares a plan with the tech design and the real code.
  It fixes the problems that block the work.
- `build-feature.js` builds an agreed plan on a worktree branch and reviews
  the diff. Then it opens the PR, sorts and fixes the CodeRabbit review, and
  watches CI.
- `review-pr.js` reviews a PR that is already open. It treats each open
  human comment as a blocking problem, and it pushes the fixes.
- `review-loop.js` is the shared loop of review, fix and review again. The
  other two review workflows use it.

### Commands

These slash commands are available in every session:

- `/handoff` gives work from the current conversation to a different Orca
  worktree. It writes a brief that a reader understands without other
  context to `~/.claude/plans/<slug>.md`. Then it starts a Claude session in
  that worktree and points it at the brief.

## Change the configuration

Edit the files in this repo, then commit and push. `~/.claude`, `~/.zshrc`,
`~/.gitconfig` and the `~/.config` entries are links into this repo, so an
edit here changes the live configuration.
