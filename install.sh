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

echo "==> brew packages (ghostty, gh)"
brew list --cask ghostty >/dev/null 2>&1 || brew install --cask ghostty
brew list gh >/dev/null 2>&1 || brew install gh

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

echo "==> claude config"
mkdir -p "$HOME/.claude/skills"
ln -sfn "$REPO_DIR/claude/settings.json" "$HOME/.claude/settings.json"
ln -sfn "$REPO_DIR/claude/statusline.sh" "$HOME/.claude/statusline.sh"
ln -sfn "$REPO_DIR/claude/session-bg.sh" "$HOME/.claude/session-bg.sh"
ln -sfn "$REPO_DIR/claude/bin" "$HOME/.claude/bin"
for skill in "$REPO_DIR"/claude/skills/*/; do
  ln -sfn "${skill%/}" "$HOME/.claude/skills/$(basename "$skill")"
done

echo "done — open a new terminal (or: source ~/.zshrc)"
