# setup

Personal machine config: zsh, Ghostty + Claude Code, with a one-command
installer.

## New machine

```sh
git clone git@github.com:macaja/setup.git ~/setup
~/setup/install.sh
```

The installer is idempotent. It:

1. Installs oh-my-zsh if missing.
2. Clones the custom zsh plugins from `zshrc`: `zsh-autosuggestions`,
   `zsh-syntax-highlighting` (`git` and `z` ship with oh-my-zsh).
3. Symlinks `~/.zshrc` → `zsh/zshrc`.
4. Symlinks `~/.config/ghostty/config` → `ghostty/config`.
5. Symlinks yazi config into `~/.config/yazi` and reinstalls its
   plugins from `yazi/package.toml` (`ya pkg install`).
6. Symlinks Claude Code global config into `~/.claude`:
   `settings.json`, `statusline.sh`, `bin/`, and each
   skill in `claude/skills/`.

Claude Code plugins reinstall themselves from `enabledPlugins` in
`claude/settings.json`.

## Layout

```
install.sh            one-command machine setup
zsh/zshrc             shell config (oh-my-zsh, plugins, PATH, aliases)
ghostty/config        terminal config (theme, transparency, splits, keybinds)
yazi/                 file-manager config (pane ratio, keymap, plugin list)
bin/
  create-wt           pull main, create .worktrees/<type>/<name>
  clean-wt            remove .worktrees/<type>/<name> worktree + delete branch
claude/
  settings.json       statusline, plugins, theme, permissions
  statusline.sh       dir (session-colored) + worktree + branch + model + ctx
  skills/             portable skills (work skills stay local, out of this repo)
```

## Updating

Edit files here (`~/.claude` and `~/.zshrc` are symlinks into this repo),
then commit and push.
