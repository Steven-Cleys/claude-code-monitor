# Claude Code Monitoring Stack

Local monitoring stack for Claude Code metrics using OTEL, Prometheus, and Grafana.

## Quick Start

```bash
# Start the stack
docker compose up -d

# Stop the stack
docker compose down

# View logs
docker compose logs -f

# Reset all data
docker compose down -v && docker compose up -d
```

## Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Loki | http://localhost:3100 | - |
| OTEL Collector | localhost:4317 (gRPC) | - |
| Agent Manager UI | http://localhost:3002 | - |
| Agent Manager API | http://localhost:3001 | - |
| Postgres | localhost:5433 | agent_manager / agent_manager |

## Dashboards

Multiple pre-built Grafana dashboards are available:

| Dashboard | URL | Description |
|-----------|-----|-------------|
| **Overview** | [localhost:3000/d/claude-overview](http://localhost:3000/d/claude-overview) | Key stats at a glance (cost, sessions, time, tokens) |
| **Costs** | [localhost:3000/d/claude-costs](http://localhost:3000/d/claude-costs) | Cost deep-dive (by model, over time, per session) |
| **Usage** | [localhost:3000/d/claude-usage](http://localhost:3000/d/claude-usage) | Token usage (by type, by model, trends) |
| **Activity** | [localhost:3000/d/claude-activity](http://localhost:3000/d/claude-activity) | Dev activity (commits, PRs, lines changed) |
| **Full** | [localhost:3000/d/claude-code-monitor](http://localhost:3000/d/claude-code-monitor) | Comprehensive dashboard with all panels |

Choose based on your needs:
- Use **focused dashboards** for specific analysis
- Use **Full dashboard** for a single comprehensive view

## Claude Code Configuration

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317"
  }
}
```

Optional: To include actual prompt text in logs, add:
```json
"OTEL_LOG_USER_PROMPTS": "1"
```

Restart Claude Code after making changes.

### Auto-start Hook (Optional)

Add a SessionStart hook to auto-start the stack when Claude begins:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "docker info >/dev/null 2>&1 && docker compose -f /path/to/claude-code-monitor/docker-compose.yml up -d >/dev/null 2>&1 || true",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Metrics

All metrics from [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code/monitoring-usage#available-metrics-and-events):

| Metric (Prometheus name) | Description | Unit |
|--------------------------|-------------|------|
| `claude_code_session_count_total` | Count of CLI sessions started | count |
| `claude_code_lines_of_code_count_total` | Lines of code modified | count |
| `claude_code_pull_request_count_total` | Pull requests created | count |
| `claude_code_commit_count_total` | Git commits created | count |
| `claude_code_cost_usage_USD_total` | Cost per session | USD |
| `claude_code_token_usage_tokens_total` | Tokens used | tokens |
| `claude_code_code_edit_tool_decision_total` | Tool permission decisions | count |
| `claude_code_active_time_seconds_total` | Active time | seconds |

Note: Some metrics only appear when relevant events occur (e.g., commits, PRs).

## Events (Logs)

In addition to metrics, Claude Code exports events via OTEL logs (stored in Loki):

| Event | Description |
|-------|-------------|
| `user_prompt` | Every prompt submitted (length, timestamp, optionally full text) |
| `tool_result` | Tool executions (name, success/fail, duration, accept/reject) |
| `api_request` | API calls to Claude |

Query events in Grafana using the Loki datasource with LogQL:

```logql
{service_name="claude-code"} | json
```

## Metric Labels

All metrics include these labels for filtering and grouping:

| Label | Description | Example |
|-------|-------------|---------|
| `session_id` | Unique session identifier | `1c87297f-992d-...` |
| `model` | Claude model used | `claude-opus-4-5-20251101` |
| `terminal_type` | Terminal/IDE | `vscode`, `cursor`, `iterm` |
| `organization_id` | Anthropic org ID | `1a19c759-a7c7-...` |
| `user_email` | User email | `user@example.com` |
| `user_account_uuid` | User account ID | `adee8414-e2b3-...` |
| `os_type` | Operating system | `darwin`, `linux`, `windows` |
| `os_version` | OS version | `25.1.0` |
| `host_arch` | CPU architecture | `arm64`, `x86_64` |
| `service_version` | Claude Code version | `2.1.7` |

Token metrics also have:

| Label | Description | Example |
|-------|-------------|---------|
| `token_type` | Type of tokens | `input`, `output`, `cacheRead`, `cacheCreation` |

Example queries using labels:

```promql
# Cost by model
sum by (model) (claude_code_cost_usage_USD_total)

# Tokens by type
sum by (token_type) (claude_code_token_usage_tokens_total)

# Filter to specific model
claude_code_cost_usage_USD_total{model=~".*opus.*"}

# Usage by terminal
sum by (terminal_type) (claude_code_active_time_seconds_total)
```

## Verification

```bash
# Check containers are running
docker compose ps

# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[].health'

# List available metrics
curl -s http://localhost:9090/api/v1/label/__name__/values | jq '.data[]' | grep claude

# Check OTEL Collector metrics endpoint
curl -s http://localhost:8889/metrics | grep claude_code
```

## Agent Manager (Real-Time Dashboard)

The Agent Manager provides a real-time view of active Claude Code sessions with a live tool call timeline. It complements Grafana (which is better for historical cost/usage analysis) with an operational, live view.

### Setup

**Prerequisites:** Docker, jq (`brew install jq`)

```bash
# 1. Clone and start the stack
git clone <repo-url> claude-code-monitor
cd claude-code-monitor
docker compose up -d

# 2. Install hooks into Claude Code
./agent-manager/install-hooks.sh

# 3. Restart Claude Code for hooks to take effect

# 4. Open the dashboard
open http://localhost:3002
```

That's it. Every Claude Code session will now send events to the dashboard.

### What You See

- **Agent cards** — each active session with model name, working directory, status (active/idle/ended), and event count
- **Live timeline** — real-time feed of tool calls (Read, Edit, Bash, Grep, etc.) with timestamps and details
- **Session filtering** — click an agent card to filter the timeline to that session
- **Time range** — adjust from last 1h to 24h

### Architecture

```
Claude Code hooks ──stdin──▶ send-hook.sh ──POST──▶ Bun Server (:3001) ──WebSocket──▶ Vue UI (:3002)
                                                      │
                                                      ├── Postgres (event storage)
                                                      ├── Loki (model enrichment)
                                                      └── Prometheus (token metrics)
```

### Data Sources

Hooks are the **primary data source** — they provide the real-time event stream and session tracking. OTEL/Loki/Prometheus are **enrichment layers** that add data the hooks don't carry.

| Data | Source | Mechanism |
|------|--------|-----------|
| Sessions (id, cwd, permission_mode, status) | Hooks | Upserted on every hook event via `POST /api/hooks` |
| Events (tool calls, session lifecycle) | Hooks | `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, etc. |
| Model name | Both | Hooks may include `model` field; Loki poller backfills from OTEL logs (every 15s) |
| Token counts (input, output, cacheRead, cacheCreation) | Prometheus | Poller queries `claude_code_token_usage_tokens_total` (every 30s) |

### Uninstall Hooks

```bash
./agent-manager/install-hooks.sh --uninstall
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/sessions?hours=4` | Active sessions in time range |
| `GET /api/sessions/:id/events` | Events for a specific session |
| `GET /api/events?since=ISO&limit=100` | Recent events across all sessions |
| `ws://localhost:3001/ws` | Live event stream (WebSocket) |

## Troubleshooting

**Metrics not appearing:**
- Claude Code won't crash if collector is down - metrics are dropped silently
- Check OTEL collector logs: `docker compose logs otel-collector`
- Verify Claude Code config in `~/.claude/settings.json`

**Agent Manager not receiving events:**
- Verify hooks are installed: check `~/.claude/settings.json` for `send-hook.sh` entries
- Check server logs: `docker compose logs agent-manager-server`
- Test manually: `echo '{"session_id":"test","hook_event_name":"Test","cwd":"/tmp"}' | ./agent-manager/hooks/send-hook.sh`
- Verify server is up: `curl http://localhost:3001/api/health`

