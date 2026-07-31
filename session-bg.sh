#!/bin/bash
# Random dark background tint per Claude session (OSC 11, ghostty).
# Called from SessionStart hook; "end" arg (SessionEnd) resets to default (OSC 111).
# Hook processes have no controlling terminal (/dev/tty fails), so walk up the
# process tree until an ancestor (the claude TUI) reports a real tty.

find_tty() {
  local p=$$ t
  for _ in 1 2 3 4 5 6 7 8; do
    t=$(ps -o tty= -p "$p" 2>/dev/null | tr -d ' ')
    if [ -n "$t" ] && [ "$t" != "??" ]; then
      echo "/dev/$t"
      return 0
    fi
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
    [ -z "$p" ] || [ "$p" -le 1 ] && return 1
  done
  return 1
}

tty_dev=$(find_tty) || exit 0

if [ "$1" = "end" ]; then
  printf '\033]111\007' > "$tty_dev" 2>/dev/null
  exit 0
fi

colors=('#16161e' '#1a1a2e' '#0f2027' '#1b2d26' '#251b2e' '#2b1c1c' '#1b2436' '#232616')
c=${colors[RANDOM % ${#colors[@]}]}
printf '\033]11;%s\007' "$c" > "$tty_dev" 2>/dev/null
exit 0
