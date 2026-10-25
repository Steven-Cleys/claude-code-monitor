#!/bin/bash
# Sends Claude Code hook events to the agent-manager server.
# Reads JSON payload from stdin, POSTs to the server endpoint.
# Always exits 0 to never block Claude Code.

AGENT_MANAGER_URL="${AGENT_MANAGER_URL:-http://localhost:3001}"

payload=$(cat)

# Fire-and-forget: background the POST and detach ALL stdio on the group.
# Claude Code waits for EOF on the hook's stdout pipe, so an fd left open in
# the subshell would block the hook for up to --max-time seconds. The payload
# is fed via stdin (--data-binary @-) because a multi-MB tool_response as a
# curl argv element exceeds ARG_MAX and silently drops the event.
(
  printf '%s' "$payload" | curl -sf --max-time 3 -X POST "${AGENT_MANAGER_URL}/api/hooks" \
    -H 'Content-Type: application/json' \
    --data-binary @- || true
) >/dev/null 2>&1 </dev/null &

exit 0
