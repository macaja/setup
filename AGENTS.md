# setup

Dotfiles and machine bootstrap. `./install.sh` sets up a new Mac end to end and is idempotent — safe to re-run anytime.

Everything is symlinked, not copied: the files in this repo are the live config. Edit here, commit, done.

## Structure

```
setup/
├── install.sh          # machine bootstrap: homebrew, ghostty, gh, oh-my-zsh, symlinks
├── CLAUDE.md           # points here
├── AGENTS.md
├── bin/                # each script symlinked into ~/.local/bin (on PATH via zshrc): create-wt, clean-wt
├── zsh/
│   └── zshrc           # symlinked to ~/.zshrc
└── claude/             # global Claude Code config
    ├── settings.json   # symlinked to ~/.claude/settings.json (statusline, plugins)
    ├── statusline.sh   # statusline: dir + branch + model + context, per-session color
    └── skills/         # each subdir symlinked into ~/.claude/skills/
```

## Conventions

- brew is the default installer. curl bootstraps only what brew can't install: homebrew itself and oh-my-zsh.
- Every install.sh step checks before it acts (`command -v`, `brew list`, `[ -d ]`, `ln -sfn`) so re-runs are no-ops.
- New global Claude config (a skill, a script, a bin command) goes under `claude/` plus a matching symlink line in install.sh.
