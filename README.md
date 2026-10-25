# Claude Code Monitor

A self-hosted observability stack for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It answers two different questions:

- **What is happening right now?** The Agent Manager is a live dashboard of every running session and subagent, with each tool call streamed in as it happens.
- **What did it cost over time?** Grafana dashboards on top of Claude Code's OpenTelemetry metrics show cost, tokens and activity by model, session and day.

Everything runs locally with one `docker compose up`. No data leaves your machine.

## Features

**Agent Manager (live)**

- Agent cards per session with model, working directory, status, a generated session title and running token cost
- Subagent tree per session, plus a swim-lane chart of when each subagent was active
- Live, searchable event timeline grouped into turns, filterable by hook event type
- Transcript viewer for any session or subagent, which keeps streaming while the session is live
- "Needs attention" badge and optional desktop notification when a session is waiting on a permission prompt or your input
- Context-window fill per session

**Metrics stack (historical)**

- Five provisioned Grafana dashboards: Overview, Costs, Usage, Activity and a combined Full view
- Prometheus retention of two years, so you can look back across months
- Claude Code events (prompts, tool results, API requests) stored in Loki and queryable with LogQL

## Architecture

```
Claude Code
 ├─ OpenTelemetry ─▶ OTEL Collector (:4317) ─┬─▶ Prometheus (:9090) ─▶ Grafana (:3000)
 │                                           └─▶ Loki (:3100)
 └─ Hooks ─▶ send-hook.sh ─POST─▶ Agent Manager server (:3001) ─WebSocket─▶ Agent Manager UI (:3002)
                                    ├─ Postgres (sessions and events)
                                    ├─ ~/.claude/projects transcripts (read-only: tokens, model, titles)
                                    └─ Prometheus (context-window fill)
```

The two halves use different sources on purpose. OTEL metrics are aggregates, which suits cost trends but says little about a single tool call. Hooks deliver every event in real time but carry no billing data. Session transcripts on disk fill that gap: the server re-reads them for exact token counts, the model and the session title.

| Part | Tech |
|------|------|
| Agent Manager server | Bun, Hono, TypeScript, postgres.js, WebSockets |
| Agent Manager UI | Vue 3, TypeScript, Vite, Tailwind CSS v4, served by nginx |
| Storage | PostgreSQL 17 (JSONB event payloads, SQL migrations) |
| Metrics | OpenTelemetry Collector, Prometheus, Loki, Grafana |
| Infra | Docker Compose |

## Quick start

**Prerequisites:** Docker and `jq`.

```bash
git clone https://github.com/Steven-Cleys/claude-code-monitor.git
cd claude-code-monitor
docker compose up -d
```

### 1. Send metrics to the collector

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

Add `"OTEL_LOG_USER_PROMPTS": "1"` if you also want the prompt text in Loki.

### 2. Install the hooks for the Agent Manager

```bash
./agent-manager/install-hooks.sh
```

This copies `send-hook.sh` to `~/.claude/hooks/` and registers it in `~/.claude/settings.json` for the session, prompt, tool, subagent, notification and compaction hook events. Remove it again with `./agent-manager/install-hooks.sh --uninstall`.

### 3. Restart Claude Code and open the dashboards

| Service | URL |
|---------|-----|
| Agent Manager | http://localhost:3002 |
| Grafana | http://localhost:3000 (admin / admin) |
| Prometheus | http://localhost:9090 |

Every port is bound to `127.0.0.1`, so only your own machine can reach the stack. The Agent Manager API has no authentication and serves full session transcripts, and the default credentials are meant for local use, so keep it that way unless you add authentication in front.

## Agent Manager

### Data sources

| Data | Source | How |
|------|--------|-----|
| Sessions (id, cwd, permission mode, status) | Hooks | Upserted on every `POST /api/hooks` |
| Events (tool calls, session lifecycle) | Hooks | `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `SubagentStop`, ... |
| Token counts and model | Transcripts | Active sessions re-read every 10s, deduplicated by message id, plus a final read at turn and session end |
| Session title | Transcripts | Latest title Claude Code writes into the transcript |
| Context-window fill | Prometheus | Polled every 20s |

### API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `POST /api/hooks` | Hook event receiver |
| `GET /api/sessions?hours=4` | Active and recent sessions |
| `GET /api/sessions/:id/events` | Events for one session |
| `GET /api/sessions/:id/turns` | Events grouped into turns, with tokens per turn |
| `POST /api/sessions/:id/dismiss-attention` | Clear the "needs attention" flag |
| `GET /api/events?since=ISO&limit=100` | Recent events across all sessions |
| `GET /api/transcripts/session/:sessionId` | Parsed transcript of a session |
| `GET /api/transcripts/:agentId` | Parsed transcript of a subagent |
| `ws://localhost:3001/ws` | Live event and session stream |
| `ws://localhost:3001/ws/transcript` | Live transcript updates |

### Development

```bash
cd agent-manager/server && bun install && bun test
cd agent-manager/ui && bun install && bun run build

./scripts/health-check.sh            # check every service and endpoint
./scripts/restart.sh server --rebuild # rebuild and restart one service
```

## Metrics stack

### Dashboards

| Dashboard | Shows |
|-----------|-------|
| [Overview](http://localhost:3000/d/claude-overview) | Cost, sessions, active time and tokens at a glance |
| [Costs](http://localhost:3000/d/claude-costs) | Cost by model, over time and per session |
| [Usage](http://localhost:3000/d/claude-usage) | Tokens by type and model, trends |
| [Activity](http://localhost:3000/d/claude-activity) | Commits, pull requests and lines changed |
| [Full](http://localhost:3000/d/claude-code-monitor) | All panels in one view |

### Metrics

From the [Claude Code monitoring docs](https://docs.anthropic.com/en/docs/claude-code/monitoring-usage#available-metrics-and-events):

| Prometheus name | Description |
|-----------------|-------------|
| `claude_code_session_count_total` | CLI sessions started |
| `claude_code_cost_usage_USD_total` | Cost in USD |
| `claude_code_token_usage_tokens_total` | Tokens, split by `token_type` (input, output, cacheRead, cacheCreation) |
| `claude_code_active_time_seconds_total` | Active time |
| `claude_code_lines_of_code_count_total` | Lines of code modified |
| `claude_code_commit_count_total` | Git commits created |
| `claude_code_pull_request_count_total` | Pull requests created |
| `claude_code_code_edit_tool_decision_total` | Edit permission decisions |

Every metric carries labels such as `session_id`, `model`, `terminal_type`, `os_type` and `service_version`. Some metrics only appear once the matching event has happened.

```promql
# Cost by model
sum by (model) (claude_code_cost_usage_USD_total)

# Tokens by type
sum by (token_type) (claude_code_token_usage_tokens_total)
```

Events land in Loki and can be queried from Grafana:

```logql
{service_name="claude-code"} | json
```

## Troubleshooting

**No metrics in Grafana**

- Claude Code drops metrics silently when the collector is down, so check `docker compose logs otel-collector`.
- Confirm the `env` block in `~/.claude/settings.json` and restart Claude Code.
- `curl -s http://localhost:8889/metrics | grep claude_code` shows what the collector has received.

**Agent Manager shows no sessions**

- Check that `~/.claude/settings.json` contains `send-hook.sh` entries.
- `curl http://localhost:3001/api/health` should return `{"status":"ok"}`.
- Send a test event: `echo '{"session_id":"test","hook_event_name":"Test","cwd":"/tmp"}' | ~/.claude/hooks/send-hook.sh`
- Check `docker compose logs agent-manager-server`.
