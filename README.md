# claude-config

Portable global Claude Code config, tracked from inside `~/.claude` with a
whitelist `.gitignore` (everything else in the directory is local state).

## Tracked

- `settings.json` — hooks, statusline, enabled plugins, theme, permissions
- `statusline.sh` — statusline: dir (session-colored) + worktree + branch + model + context
- `session-bg.sh` — random dark terminal background per session (SessionStart/SessionEnd hooks)
- `bin/new-wt` — pull main, create `.worktrees/<type>/<name>` worktree, launch Claude in it
- `skills/` — global skills (real content, no work symlinks; pipelabs skills stay local-only)
- `zshrc` — shell config; `~/.zshrc` is a symlink to it

## Setup on a new machine

```sh
cd ~/.claude && git init && git remote add origin git@github.com:macaja/claude-config.git
git fetch && git checkout -f main
ln -sf ~/.claude/zshrc ~/.zshrc
```

Plugins reinstall automatically from `enabledPlugins` in `settings.json`.
