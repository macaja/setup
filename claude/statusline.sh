#!/bin/bash
# Claude Code statusline: worktree, caveman badge, model name, context window
# usage, subscription usage. Reads Claude's JSON payload on stdin.

input=$(cat)
dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)
[ -z "$dir" ] && dir="$PWD"
model=$(printf '%s' "$input" | jq -r '.model.display_name // empty' 2>/dev/null)
effort=$(printf '%s' "$input" | jq -r '.effort.level // empty' 2>/dev/null)
used_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)
five_hour_pct=$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty' 2>/dev/null)
seven_day_pct=$(printf '%s' "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty' 2>/dev/null)

cd "$dir" 2>/dev/null

# Worktree = repo root folder name (each worktree has its own root dir).
root=$(git --no-optional-locks rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] && printf '\033[38;5;51m%s\033[0m' "${root##*/}"

# Append caveman badge (mode + savings) if the plugin script exists. The cache
# path carries a version directory that changes whenever the plugin updates, so
# glob over it and keep the newest match rather than pinning one version.
CAVEMAN=""
for candidate in "$HOME"/.claude/plugins/cache/caveman/caveman/*/src/hooks/caveman-statusline.sh; do
  [ -f "$candidate" ] || continue
  if [ -z "$CAVEMAN" ] || [ "$candidate" -nt "$CAVEMAN" ]; then
    CAVEMAN="$candidate"
  fi
done
if [ -n "$CAVEMAN" ]; then
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

# Subscription usage against the 5-hour and 7-day limits. Both are absent until
# the first API response of the session, and absent entirely without a
# Claude.ai subscription, so each segment prints only when its value arrives.
# Each window gets its own hue so the two are never the same color at a glance,
# and within a hue the ramp still reads calm under half, warmer approaching the
# cap, hottest once it is close.
print_usage_segment() {
  pct_fmt=$(printf '%.0f' "$1")
  if [ "$pct_fmt" -ge 80 ]; then
    usage_color="$5"
  elif [ "$pct_fmt" -ge 50 ]; then
    usage_color="$4"
  else
    usage_color="$3"
  fi
  printf '  \033[38;5;%sm%s %s%%\033[0m' "$usage_color" "$2" "$pct_fmt"
}

[ -n "$five_hour_pct" ] && print_usage_segment "$five_hour_pct" '5h' 114 220 196
[ -n "$seven_day_pct" ] && print_usage_segment "$seven_day_pct" '7d' 79 214 199
