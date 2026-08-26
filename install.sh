#!/usr/bin/env bash
# Sets up a new machine from this repo: homebrew + basics (ghostty, gh),
# oh-my-zsh + plugins, zshrc, and Claude Code global config.
# Idempotent — safe to re-run. brew is the default installer; curl only
# bootstraps what brew can't install (homebrew itself, oh-my-zsh).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> homebrew"
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
# brew lives outside the default PATH (/opt/homebrew on apple silicon);
# load it for the rest of this script and persist it for future shells.
BREW_BIN="$([ -x /opt/homebrew/bin/brew ] && echo /opt/homebrew/bin/brew || echo /usr/local/bin/brew)"
eval "$("$BREW_BIN" shellenv)"
grep -qs 'brew shellenv' "$HOME/.zprofile" || echo "eval \"\$($BREW_BIN shellenv zsh)\"" >> "$HOME/.zprofile"

echo "==> brew packages (ghostty, gh, yazi, git-delta)"
brew list --cask ghostty >/dev/null 2>&1 || brew install --cask ghostty
brew list gh >/dev/null 2>&1 || brew install gh
brew list yazi >/dev/null 2>&1 || brew install yazi
brew list git-delta >/dev/null 2>&1 || brew install git-delta

echo "==> oh-my-zsh"
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended --keep-zshrc
fi

echo "==> zsh plugins (zsh-autosuggestions, zsh-syntax-highlighting; git and z ship with oh-my-zsh)"
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
[ -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ] || \
  git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
[ -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ] || \
  git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"

echo "==> zshrc"
ln -sfn "$REPO_DIR/zsh/zshrc" "$HOME/.zshrc"

echo "==> git config (delta pager, prdiff alias, work/personal identity)"
ln -sfn "$REPO_DIR/git/gitconfig" "$HOME/.gitconfig"
ln -sfn "$REPO_DIR/git/gitconfig-work" "$HOME/.gitconfig-work"

echo "==> ghostty config"
mkdir -p "$HOME/.config/ghostty"
ln -sfn "$REPO_DIR/ghostty/config" "$HOME/.config/ghostty/config"

echo "==> yazi config"
mkdir -p "$HOME/.config/yazi"
ln -sfn "$REPO_DIR/yazi/yazi.toml" "$HOME/.config/yazi/yazi.toml"
ln -sfn "$REPO_DIR/yazi/keymap.toml" "$HOME/.config/yazi/keymap.toml"
ln -sfn "$REPO_DIR/yazi/package.toml" "$HOME/.config/yazi/package.toml"
ln -sfn "$REPO_DIR/yazi/theme.toml" "$HOME/.config/yazi/theme.toml"
# reinstall plugins listed in package.toml
ya pkg install

echo "==> claude config"
mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents" "$HOME/.claude/hooks" "$HOME/.claude/workflows" "$HOME/.claude/commands"
ln -sfn "$REPO_DIR/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -sfn "$REPO_DIR/claude/settings.json" "$HOME/.claude/settings.json"
ln -sfn "$REPO_DIR/claude/statusline.sh" "$HOME/.claude/statusline.sh"
mkdir -p "$HOME/.local/bin"
for script in "$REPO_DIR"/bin/*; do
  ln -sfn "$script" "$HOME/.local/bin/$(basename "$script")"
done
for skill in "$REPO_DIR"/claude/skills/*/; do
  ln -sfn "${skill%/}" "$HOME/.claude/skills/$(basename "$skill")"
done
for agent in "$REPO_DIR"/claude/agents/*.md; do
  ln -sfn "$agent" "$HOME/.claude/agents/$(basename "$agent")"
done
for hook in "$REPO_DIR"/claude/hooks/*; do
  ln -sfn "$hook" "$HOME/.claude/hooks/$(basename "$hook")"
done
for workflow in "$REPO_DIR"/claude/workflows/*.js; do
  ln -sfn "$workflow" "$HOME/.claude/workflows/$(basename "$workflow")"
done
for command in "$REPO_DIR"/claude/commands/*.md; do
  ln -sfn "$command" "$HOME/.claude/commands/$(basename "$command")"
done

echo "done — open a new terminal (or: source ~/.zshrc)"
