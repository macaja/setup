#!/bin/bash
# Claude Code statusline: dir + worktree + branch + dirty mark, caveman badge,
# model name, context window usage. Reads Claude's JSON payload on stdin.

input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)
[ -z "$dir" ] && dir="$PWD"
model=$(printf '%s' "$input" | jq -r '.model.display_name // empty' 2>/dev/null)
effort=$(printf '%s' "$input" | jq -r '.effort.level // empty' 2>/dev/null)
used_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)

cd "$dir" 2>/dev/null

# Current directory basename, colored per session: the session id hashes to one
# of these bright 256-colors, so each session keeps its own stable color.
palette=(81 114 141 150 180 203 208 213 220 226)
if [ -n "$sid" ]; then
  hash=$(printf '%s' "$sid" | cksum | cut -d' ' -f1)
  dir_color=${palette[hash % ${#palette[@]}]}
else
  dir_color=75
fi
dir_name=$(basename "$dir")
printf '\033[38;5;%sm%s\033[0m' "$dir_color" "$dir_name"

# Worktree = repo root folder name (each worktree has its own root dir).
root=$(git --no-optional-locks rev-parse --show-toplevel 2>/dev/null)
if [ -n "$root" ]; then
  worktree="${root##*/}"
  branch=$(git --no-optional-locks branch --show-current 2>/dev/null)
  # Dirty mark: * if uncommitted changes, else a check.
  if [ -n "$(git --no-optional-locks status --porcelain 2>/dev/null)" ]; then
    mark='*'
  else
    mark='✔'
  fi
  printf '  \033[38;5;51m%s\033[0m \033[38;5;220m%s\033[0m \033[38;5;244m%s\033[0m' "$worktree" "$branch" "$mark"
fi

# Append caveman badge (mode + savings) if the plugin script exists.
CAVEMAN="/Users/macaja/.claude/plugins/cache/caveman/caveman/25d22f864ad6/src/hooks/caveman-statusline.sh"
if [ -f "$CAVEMAN" ]; then
  badge=$(bash "$CAVEMAN" 2>/dev/null)
  [ -n "$badge" ] && printf '  %s' "$badge"
fi

# Append model display name and reasoning effort, if any.
[ -n "$model" ] && printf '  \033[38;5;140m%s\033[0m' "$model"
[ -n "$effort" ] && printf ' \033[38;5;140m(%s)\033[0m' "$effort"

# Append context window usage percentage.
if [ -n "$used_pct" ]; then
  used_fmt=$(printf '%.0f' "$used_pct")
  printf '  \033[38;5;208m%s%% ctx\033[0m' "$used_fmt"
fi
