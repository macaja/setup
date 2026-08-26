# setup

Personal machine config: zsh, git, Ghostty, yazi and Claude Code, with a
one-command installer.

## New machine

```sh
git clone git@github.com:macaja/setup.git ~/setup
~/setup/install.sh
```

The installer is idempotent. It:

1. Installs homebrew if missing, then the brew packages: `ghostty`, `gh`,
   `yazi`, `git-delta`.
2. Installs oh-my-zsh if missing.
3. Clones the custom zsh plugins from `zshrc`: `zsh-autosuggestions`,
   `zsh-syntax-highlighting` (`git` and `z` ship with oh-my-zsh).
4. Symlinks `~/.zshrc` → `zsh/zshrc`.
5. Symlinks `~/.gitconfig` → `git/gitconfig` and `~/.gitconfig-work` →
   `git/gitconfig-work`.
6. Symlinks `~/.config/ghostty/config` → `ghostty/config`.
7. Symlinks yazi config into `~/.config/yazi` and reinstalls its
   plugins from `yazi/package.toml` (`ya pkg install`).
8. Symlinks every script in `bin/` into `~/.local/bin` (on PATH via `zshrc`).
9. Symlinks Claude Code global config into `~/.claude`: `CLAUDE.md`,
   `settings.json`, `statusline.sh`, and each entry under `claude/skills/`,
   `claude/agents/`, `claude/hooks/`, `claude/workflows/` and
   `claude/commands/`.

Claude Code plugins reinstall themselves from `enabledPlugins` in
`claude/settings.json`.

## Layout

```
install.sh            one-command machine setup
zsh/zshrc             shell config (oh-my-zsh, plugins, PATH, aliases)
git/
  gitconfig           delta pager, prdiff alias, personal identity
  gitconfig-work      work identity, included conditionally from gitconfig
ghostty/config        terminal config (theme, transparency, splits, keybinds)
yazi/                 file-manager config (pane ratio, keymap, theme, plugins)
media/                docker compose stack for the movie/series setup (see media/README.md)
bin/                  → ~/.local/bin
  create-wt           pull main, create .worktrees/<type>/<name>
  clean-wt            remove worktrees whose branch is merged into main
claude/               → ~/.claude
  CLAUDE.md           global instructions (communication rules, language)
  settings.json       statusline, plugins, theme, permissions, hooks
  statusline.sh       worktree + caveman badge + model + context + usage
  skills/             portable skills (work skills stay local, out of this repo)
  agents/             subagent definitions (doc-auditor)
  hooks/              scripts settings.json points at (see below)
  workflows/          multi-agent workflow scripts (see below)
  commands/           slash commands (see below)
```

### Hooks

Shell scripts and text that `settings.json` wires into Claude Code events.

- `caffeinate.sh` — keeps the Mac awake only while a session is working.
  `acquire` (PreToolUse, SubagentStop) holds a `caffeinate` with a TTL and
  renews it lazily; `release` (Stop) shrinks the hold to a grace window;
  `stop` drops it. The TTL means a session that dies without releasing
  costs at most one window of wakefulness instead of holding the machine
  awake forever. Tunable with `CLAUDE_CAFFEINATE_TTL` and
  `CLAUDE_CAFFEINATE_GRACE`.
- `communication-rules.md` — injected on every prompt so the standing
  answer-style preferences survive a long session.

### Workflows

Scripts for `/workflows`, each one a fan-out of subagents:

- `plan-feature.js` — writes an implementation plan for a feature branch,
  then hands it to `review-plan`.
- `review-plan.js` — reviews a plan against the tech design and the real
  codebase, fixes what is blocking.
- `build-feature.js` — builds an agreed plan on a worktree branch, reviews
  the diff, opens the PR, watches CI.
- `review-pr.js` — reviews a submitted PR, treating unresolved human
  comments as blocking, and pushes the fixes.
- `review-loop.js` — the shared review→fix→re-review loop the other two
  review workflows call.

### Commands

Slash commands available in every session:

- `/handoff` — hands a piece of work from the current conversation to
  another Orca worktree: writes a self-contained brief to
  `~/.claude/plans/<slug>.md` and starts a Claude session there pointed at
  it.

## Updating

Edit files here (`~/.claude`, `~/.zshrc`, `~/.gitconfig` and the
`~/.config` entries are symlinks into this repo), then commit and push.
