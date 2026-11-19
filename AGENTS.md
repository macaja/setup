# setup

This repo holds my dotfiles and the bootstrap for a new Mac. `./install.sh`
sets up a new Mac from start to end. You can run it again at any time: it is
idempotent, so a step that is already done does nothing.

The installer links every file. It does not copy them. The files in this repo
are the live configuration: edit them here, commit, and the change is live.

## Structure

```
setup/
├── install.sh          # machine bootstrap: homebrew, ghostty, gh, oh-my-zsh, links
├── CLAUDE.md           # points to this file
├── AGENTS.md
├── bin/                # each script linked into ~/.local/bin (on PATH through zshrc): create-wt, clean-wt, collapse-orca-hooks
├── zsh/
│   └── zshrc           # linked to ~/.zshrc
├── git/                # gitconfig + gitconfig-work, linked to ~/.gitconfig and ~/.gitconfig-work
├── ghostty/config      # linked to ~/.config/ghostty/config
├── yazi/               # linked into ~/.config/yazi
└── claude/             # global Claude Code configuration
    ├── CLAUDE.md       # linked to ~/.claude/CLAUDE.md (communication rules)
    ├── settings.json   # linked to ~/.claude/settings.json (model, permissions, hooks, plugins)
    ├── statusline.sh   # statusline: folder + branch + model + context, one color per session
    ├── skills/         # each subfolder linked into ~/.claude/skills/
    ├── agents/         # each file linked into ~/.claude/agents/ (subagent definitions)
    ├── hooks/          # each file linked into ~/.claude/hooks/ (empty at the moment)
    ├── workflows/      # each .js linked into ~/.claude/workflows/ (plan-feature, review-plan, build-feature, review-pr, review-loop)
    └── commands/       # each file linked into ~/.claude/commands/ (slash commands: handoff)
```

## Conventions

- Install with brew. Use curl only for what brew cannot install: homebrew
  itself and oh-my-zsh.
- Make each step in install.sh check before it acts (`command -v`,
  `brew list`, `[ -d ]`, `ln -sfn`). Then a second run changes nothing.
- Put new global Claude configuration (a skill, a script, a bin command)
  under `claude/`, and add a matching link line to install.sh.
