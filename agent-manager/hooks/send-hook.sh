#!/bin/bash
# Sends Claude Code hook events to the agent-manager server.
# Reads JSON payload from stdin, POSTs to the server endpoint.
# Always exits 0 to never block Claude Code.

AGENT_MANAGER_URL="${AGENT_MANAGER_URL:-http://localhost:3001}"

payload=$(cat)
curl -sf -X POST "${AGENT_MANAGER_URL}/api/hooks" \
  -H 'Content-Type: application/json' \
  -d "$payload" \
  >/dev/null 2>&1 || true

exit 0
