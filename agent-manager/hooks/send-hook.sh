#!/bin/bash
# Sends Claude Code hook events to the agent-manager server.
# Reads JSON payload from stdin, POSTs to the server endpoint.
# Always exits 0 to never block Claude Code.

AGENT_MANAGER_URL="${AGENT_MANAGER_URL:-http://localhost:3001}"

# Fire-and-forget: background the POST so the hook returns immediately
# instead of blocking Claude Code on network round-trip (~50ms per tool call).
payload=$(cat)
(
  curl -sf --max-time 3 -X POST "${AGENT_MANAGER_URL}/api/hooks" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    >/dev/null 2>&1 || true
) &

exit 0
