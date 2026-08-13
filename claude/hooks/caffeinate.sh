#!/usr/bin/env bash
# Keeps the Mac awake only while Claude Code is actively working.
#
#   caffeinate.sh acquire   ensure a hold is alive with a full TTL (lazily renewed)
#   caffeinate.sh release   shrink the hold down to a short grace window
#   caffeinate.sh stop      drop the hold now
#
# The hold always carries both -t (self-expiry) and -w (dies with the claude
# process), so a session that never fires SessionEnd can leak at most TTL
# seconds of wakefulness instead of holding the machine awake indefinitely.
#
# Hook JSON arrives on stdin; only session_id is read from it.

set -u

TTL="${CLAUDE_CAFFEINATE_TTL:-600}"
GRACE="${CLAUDE_CAFFEINATE_GRACE:-300}"

action="${1:-}"
dir="${TMPDIR:-/tmp}/claude-caffeinate"
mkdir -p "$dir"

session_id=$(cat | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)
pidfile="$dir/${session_id}.pid"

# Walk up the process tree to the claude process that invoked this hook.
find_claude_pid() {
  local pid=$$ parent comm
  while [ "$pid" -gt 1 ]; do
    parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    [ -n "$parent" ] || return 1
    comm=$(ps -o comm= -p "$parent" 2>/dev/null)
    case "$comm" in
      *claude*)
        echo "$parent"
        return 0
        ;;
    esac
    pid="$parent"
  done
  return 1
}

cur_pid=""
cur_born=0
cur_ttl=0

read_state() {
  cur_pid=""
  cur_born=0
  cur_ttl=0
  [ -f "$pidfile" ] || return 1
  read -r cur_pid cur_born cur_ttl <"$pidfile" 2>/dev/null || return 1
  [ -n "$cur_pid" ] || return 1
  kill -0 "$cur_pid" 2>/dev/null || return 1
  return 0
}

drop() {
  [ -n "$cur_pid" ] && kill "$cur_pid" 2>/dev/null
  rm -f "$pidfile"
}

hold() {
  local secs="$1" claude_pid
  claude_pid=$(find_claude_pid || true)
  if [ -n "${claude_pid:-}" ]; then
    caffeinate -dimsu -t "$secs" -w "$claude_pid" >/dev/null 2>&1 &
  else
    caffeinate -dimsu -t "$secs" >/dev/null 2>&1 &
  fi
  printf '%s %s %s\n' "$!" "$(date +%s)" "$secs" >"$pidfile"
}

case "$action" in
  acquire|start)
    if read_state; then
      # Renew only once the hold is more than halfway through its window, so
      # a per-tool-call hook does not respawn a process on every invocation.
      elapsed=$(( $(date +%s) - cur_born ))
      if [ "$cur_ttl" -ge "$TTL" ] && [ "$elapsed" -lt $(( cur_ttl / 2 )) ]; then
        exit 0
      fi
      drop
    fi
    hold "$TTL"
    ;;
  release)
    # Only ever shrinks an existing hold; never creates one.
    read_state || exit 0
    remaining=$(( cur_born + cur_ttl - $(date +%s) ))
    # Already inside the grace window: leave it alone rather than extending it.
    [ "$remaining" -le "$GRACE" ] && exit 0
    drop
    hold "$GRACE"
    ;;
  stop)
    read_state || true
    drop
    ;;
esac

exit 0
