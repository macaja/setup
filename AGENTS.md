# setup

Dotfiles and machine bootstrap. `./install.sh` sets up a new Mac end to end and is idempotent — safe to re-run anytime.

Everything is symlinked, not copied: the files in this repo are the live config. Edit here, commit, done.

## Structure

```
setup/
├── install.sh          # machine bootstrap: homebrew, ghostty, gh, oh-my-zsh, symlinks
├── CLAUDE.md           # points here
├── AGENTS.md
├── bin/                # each script symlinked into ~/.local/bin (on PATH via zshrc): create-wt, clean-wt, collapse-orca-hooks
├── zsh/
│   └── zshrc           # symlinked to ~/.zshrc
├── git/                # gitconfig + gitconfig-work, symlinked to ~/.gitconfig and ~/.gitconfig-work
├── ghostty/config      # symlinked to ~/.config/ghostty/config
├── yazi/               # symlinked into ~/.config/yazi
├── media/              # docker compose stack for the movie/series setup (see media/README.md)
└── claude/             # global Claude Code config
    ├── CLAUDE.md       # symlinked to ~/.claude/CLAUDE.md (communication rules)
    ├── settings.json   # symlinked to ~/.claude/settings.json (model, permissions, hooks, plugins)
    ├── statusline.sh   # statusline: dir + branch + model + context, per-session color
    ├── skills/         # each subdir symlinked into ~/.claude/skills/
    ├── agents/         # each file symlinked into ~/.claude/agents/ (subagent definitions)
    ├── hooks/          # each file symlinked into ~/.claude/hooks/: caffeinate.sh, communication-rules.md
    ├── workflows/      # each .js symlinked into ~/.claude/workflows/ (plan-feature, review-plan, build-feature, review-pr, review-loop)
    └── commands/       # each file symlinked into ~/.claude/commands/ (slash commands: handoff)
```

## Conventions

- brew is the default installer. curl bootstraps only what brew can't install: homebrew itself and oh-my-zsh.
- Every install.sh step checks before it acts (`command -v`, `brew list`, `[ -d ]`, `ln -sfn`) so re-runs are no-ops.
- New global Claude config (a skill, a script, a bin command) goes under `claude/` plus a matching symlink line in install.sh.
