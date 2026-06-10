#!/bin/bash
# Install agent-manager hooks into Claude Code settings.
# Idempotent — safe to run multiple times.
#
# Usage:
#   ./agent-manager/install-hooks.sh
#   ./agent-manager/install-hooks.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/hooks/send-hook.sh"
SETTINGS_FILE="${HOME}/.claude/settings.json"

if [[ ! -f "$HOOK_SCRIPT" ]]; then
  echo "Error: Hook script not found at ${HOOK_SCRIPT}"
  exit 1
fi

if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo "Error: Claude Code settings not found at ${SETTINGS_FILE}"
  echo "Make sure Claude Code is installed and has been run at least once."
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

chmod +x "$HOOK_SCRIPT"

HOOK_ENTRY="{\"type\": \"command\", \"command\": \"${HOOK_SCRIPT}\", \"timeout\": 5}"
HOOK_WRAPPER="{\"hooks\": [${HOOK_ENTRY}]}"

EVENTS=(
  "SessionStart"
  "SessionEnd"
  "PreToolUse"
  "PostToolUse"
  "PostToolUseFailure"
  "Stop"
  "StopFailure"
  "SubagentStart"
  "SubagentStop"
  "Notification"
  "PreCompact"
  "PostCompact"
  "PermissionRequest"
  "PermissionDenied"
  "TaskCreated"
  "TaskCompleted"
  "TeammateIdle"
)

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Removing agent-manager hooks from ${SETTINGS_FILE}..."

  tmp=$(mktemp)
  cp "$SETTINGS_FILE" "$tmp"

  for event in "${EVENTS[@]}"; do
    jq --arg cmd "$HOOK_SCRIPT" --arg event "$event" '
      if .hooks[$event] then
        .hooks[$event] |= map(
          .hooks |= map(select(.command != $cmd))
          | select(.hooks | length > 0)
        )
        | if .hooks[$event] | length == 0 then del(.hooks[$event]) else . end
      else . end
    ' "$tmp" > "${tmp}.new" && mv "${tmp}.new" "$tmp"
  done

  cp "$tmp" "$SETTINGS_FILE"
  rm -f "$tmp"
  echo "Done. Agent-manager hooks removed."
  exit 0
fi

echo "Installing agent-manager hooks into ${SETTINGS_FILE}..."
echo "Hook script: ${HOOK_SCRIPT}"

tmp=$(mktemp)
cp "$SETTINGS_FILE" "$tmp"

for event in "${EVENTS[@]}"; do
  already_installed=$(jq --arg cmd "$HOOK_SCRIPT" --arg event "$event" '
    [.hooks[$event][]?.hooks[]? | select(.command == $cmd)] | length
  ' "$tmp" 2>/dev/null || echo "0")

  if [[ "$already_installed" != "0" ]]; then
    echo "  ${event}: already installed, skipping"
    continue
  fi

  jq --arg event "$event" --argjson hook "$HOOK_WRAPPER" '
    .hooks[$event] = (.hooks[$event] // []) + [$hook]
  ' "$tmp" > "${tmp}.new" && mv "${tmp}.new" "$tmp"

  echo "  ${event}: installed"
done

cp "$tmp" "$SETTINGS_FILE"
rm -f "$tmp"

echo ""
echo "Done. Restart Claude Code for hooks to take effect."
echo "To uninstall: $0 --uninstall"
