#!/bin/bash
# PreToolUse gate: when Claude is about to run `gh pr create`, force a
# permission prompt so the user can review the branch diff (git prdiff)
# before the PR goes out. Silent no-op for every other Bash command.
command=$(jq -r '.tool_input.command // ""')
if echo "$command" | grep -q 'gh pr create'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"PR about to be created. Review the full branch diff first: run `git prdiff` in another terminal (git diff main...HEAD via delta), then approve or deny here."}}
EOF
fi
