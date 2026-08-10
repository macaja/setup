#!/usr/bin/env bash
# Keeps the Mac awake while Claude Code is actively working.
# Usage: caffeinate.sh start|stop   (hook JSON arrives on stdin)

set -u

action="${1:-}"
dir="${TMPDIR:-/tmp}/claude-caffeinate"
mkdir -p "$dir"

session_id=$(cat | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)
pidfile="$dir/${session_id}.pid"

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

case "$action" in
  start)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      exit 0
    fi
    claude_pid=$(find_claude_pid || true)
    if [ -n "${claude_pid:-}" ]; then
      caffeinate -dimsu -w "$claude_pid" >/dev/null 2>&1 &
    else
      caffeinate -dimsu >/dev/null 2>&1 &
    fi
    echo $! >"$pidfile"
    ;;
  stop)
    if [ -f "$pidfile" ]; then
      kill "$(cat "$pidfile")" 2>/dev/null || true
      rm -f "$pidfile"
    fi
    ;;
esac

exit 0
