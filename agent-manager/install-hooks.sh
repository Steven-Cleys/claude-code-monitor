#!/bin/bash
# Install agent-manager hooks into Claude Code settings.
# Idempotent: safe to run multiple times.
#
# Usage:
#   ./agent-manager/install-hooks.sh
#   ./agent-manager/install-hooks.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_HOOK="${SCRIPT_DIR}/hooks/send-hook.sh"
HOOK_DIR="${HOME}/.claude/hooks"
# The hook is copied out of the repo and registered from ~/.claude. If the repo lives under a
# TCC-protected folder (~/Documents, ~/Desktop, ~/Downloads), macOS intermittently denies exec
# there with EPERM, which silently kills all hook telemetry for the affected session.
HOOK_SCRIPT="${HOOK_DIR}/send-hook.sh"
SETTINGS_FILE="${HOME}/.claude/settings.json"

if [[ ! -f "$SRC_HOOK" ]]; then
  echo "Error: Hook script not found at ${SRC_HOOK}"
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

HOOK_ENTRY="{\"type\": \"command\", \"command\": \"${HOOK_SCRIPT}\", \"timeout\": 5}"
HOOK_WRAPPER="{\"hooks\": [${HOOK_ENTRY}]}"

EVENTS=(
  "SessionStart"
  "SessionEnd"
  "UserPromptSubmit"
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

# remove_hook_entries <command> <settings-copy>
remove_hook_entries() {
  local cmd="$1" file="$2" event
  for event in "${EVENTS[@]}"; do
    jq --arg cmd "$cmd" --arg event "$event" '
      if .hooks[$event] then
        .hooks[$event] |= map(
          .hooks |= map(select(.command != $cmd))
          | select(.hooks | length > 0)
        )
        | if .hooks[$event] | length == 0 then del(.hooks[$event]) else . end
      else . end
    ' "$file" > "${file}.new" && mv "${file}.new" "$file"
  done
}

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Removing agent-manager hooks from ${SETTINGS_FILE}..."

  tmp=$(mktemp)
  cp "$SETTINGS_FILE" "$tmp"

  remove_hook_entries "$HOOK_SCRIPT" "$tmp"
  remove_hook_entries "$SRC_HOOK" "$tmp"

  cp "$tmp" "$SETTINGS_FILE"
  rm -f "$tmp" "$HOOK_SCRIPT"
  echo "Done. Agent-manager hooks removed."
  exit 0
fi

echo "Installing agent-manager hooks into ${SETTINGS_FILE}..."
echo "Hook script: ${HOOK_SCRIPT} (from ${SRC_HOOK})"

mkdir -p "$HOOK_DIR"
install -m 0755 "$SRC_HOOK" "$HOOK_SCRIPT"

tmp=$(mktemp)
cp "$SETTINGS_FILE" "$tmp"

# Migrate installs that still register the in-repo path.
remove_hook_entries "$SRC_HOOK" "$tmp"

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
