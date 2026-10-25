# Claude Code Monitor

A self-hosted observability stack for [Claude Code](https://code.claude.com/docs). It answers two different questions:

- **What is happening right now?** The Agent Manager is a live dashboard of every running session and subagent, with each tool call streamed in as it happens.
- **What did it cost over time?** Grafana dashboards on top of Claude Code's OpenTelemetry metrics show cost, tokens and activity by model, session and day.

Everything runs locally with one `docker compose up`. No data leaves your machine.

## Features

**Agent Manager (live)**

- Agent cards per session with model, working directory, status, a generated session title and running cost
- Subagent tree per session, plus a swim-lane chart of when each subagent was active
- Live, searchable event timeline grouped into turns, filterable by hook event type
- Transcript viewer for any session or subagent, which keeps streaming while the session is live
- "Needs attention" badge and optional desktop notification when a session is waiting on a permission prompt or your input
- Context-window fill per session

**Metrics stack (historical)**

- Five provisioned Grafana dashboards: Overview, Costs, Usage, Activity and Claude Code Monitoring, which has every panel in one view
- Prometheus retention of two years, so you can look back across months
- Claude Code events (API requests, tool results and, if you enable them, prompts) stored in Loki and queryable with LogQL

## Architecture

```
Claude Code
 ├─ OpenTelemetry ─▶ OTEL Collector (:4317) ─┬─▶ Prometheus (:9090) ─▶ Grafana (:3000)
 │                                           └─▶ Loki (:3100)
 └─ Hooks ─▶ send-hook.sh ─POST─▶ Agent Manager server (:3001) ─WebSocket─▶ Agent Manager UI (:3002)
                                    ├─ Postgres (sessions and events)
                                    ├─ ~/.claude/projects transcripts (read-only: tokens, model, titles, context fill)
                                    └─ Loki (session cost)
```

The two halves use different sources on purpose. OTEL metrics are aggregates, which suits cost trends but says little about a single tool call. Hooks deliver every event in real time but carry no billing data. Session transcripts on disk fill that gap: the server re-reads them for exact token counts, the model, the session title and the context-window fill. For cost the server sums the per-request costs Claude Code logs to Loki.

| Part | Tech |
|------|------|
| Agent Manager server | Bun, Hono, TypeScript, postgres.js, WebSockets |
| Agent Manager UI | Vue 3, TypeScript, Vite, Tailwind CSS v4, served by nginx |
| Storage | PostgreSQL 17 (JSONB event payloads, SQL migrations) |
| Metrics | OpenTelemetry Collector, Prometheus, Loki, Grafana |
| Infra | Docker Compose |

## Quick start

**Prerequisites:** macOS or Linux with Claude Code, Docker, `jq`, `bash` and `curl`.

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

Leave `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` unset. Claude Code then sends deltas, which the collector turns into running totals (see [How the counters are stored](#how-the-counters-are-stored)).

### 2. Install the hooks for the Agent Manager

```bash
./agent-manager/install-hooks.sh
```

This copies `send-hook.sh` to `~/.claude/hooks/` and registers it in `~/.claude/settings.json` for all 18 hook events the Agent Manager uses: session, prompt, tool, stop, subagent, notification, permission, compaction, task and teammate events. Running it again is safe and updates the copied script.

The hook posts to `http://localhost:3001`. If you move the server to another port, set `AGENT_MANAGER_URL` in the environment Claude Code starts from.

### 3. Restart Claude Code and open the dashboards

| Service | URL |
|---------|-----|
| Agent Manager | http://localhost:3002 |
| Grafana | http://localhost:3000 (admin / admin) |
| Prometheus | http://localhost:9090 |

Every port is bound to `127.0.0.1`, so only your own machine can reach the stack. The Agent Manager API has no authentication and serves full session transcripts, and the default credentials are meant for local use, so keep it that way unless you add authentication in front.

The API only answers requests addressed to `localhost` or `127.0.0.1`, which blocks DNS rebinding, so a custom `AGENT_MANAGER_URL` for the hooks must use one of those two hosts.

### Upgrade

```bash
git pull
docker compose up -d --build
./agent-manager/install-hooks.sh
```

`--build` matters: the Agent Manager server and UI are built from this checkout, so a plain `docker compose up -d` keeps running the old images. Database migrations run when the server starts. The last line picks up changes to the hook script.

### Uninstall

1. `./agent-manager/install-hooks.sh --uninstall` removes the hook entries and `~/.claude/hooks/send-hook.sh`.
2. Remove `CLAUDE_CODE_ENABLE_TELEMETRY` and the `OTEL_*` keys from the `env` block in `~/.claude/settings.json`. Otherwise Claude Code keeps exporting to a collector that no longer runs.
3. `docker compose down -v` stops the stack and deletes its volumes, and with them all stored data.

### Data and privacy

Everything stays in four Docker volumes on your machine. Only Prometheus deletes old data on its own.

| Volume | Holds | Kept for |
|--------|-------|----------|
| `postgres_data` | Every hook event, including prompts and full tool inputs and outputs, plus sessions, subagent metadata and session cost | Until you delete the volume |
| `loki_data` | Claude Code's log events: API requests with cost, tool results and, if enabled, prompts | Until you delete the volume (retention is off) |
| `prometheus_data` | The metrics, labelled with your account email, account id and organization id | Two years |
| `grafana_data` | Grafana's own settings and users | Until you delete the volume |

The server also reads the transcripts in `~/.claude/projects` through a read-only mount and stores nothing from them except token counts, model, title and tool-call counts.

## Agent Manager

### Data sources

| Data | Source | How |
|------|--------|-----|
| Sessions (id, cwd, permission mode, status) | Hooks | Upserted on every `POST /api/hooks` |
| Events (tool calls, session lifecycle) | Hooks | `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `SubagentStop`, ... |
| Token counts and model | Transcripts | Active sessions re-read every 10s, deduplicated by message id, plus a final read at turn and session end |
| Session title | Transcripts | Latest title Claude Code writes into the transcript |
| Context-window fill | Transcripts | Latest assistant usage in the transcript tail, polled every 20s |
| Session cost | Loki | `cost_usd` of every `claude_code.api_request` event, summed per session, polled every 30s and stored in Postgres |

#### Session cost

Cards and the header total show the cost Claude Code itself reports. Claude Code logs a `claude_code.api_request` event with the exact cost of every API call, including subagents and background calls such as session titles, and the collector stores these events in Loki. The server sums them per session and UTC day, re-reads today every 30s and stores the session total in Postgres, so it survives page reloads and Loki downtime. On startup it backfills every day since your oldest session.

A session without reported cost shows an estimate instead, marked with `≈`: its transcript tokens times the list prices in `agent-manager/ui/src/utils/pricing.ts`. That happens when telemetry or `OTEL_LOGS_EXPORTER` is off, when Loki is unreachable or `LOKI_URL` is unset, and for sessions older than your Loki data. Subagent rows always show estimates, because the events do not say which subagent made a call.

Known limitation: spend while the stack was down is missing. Claude Code drops events it cannot deliver, and Loki rejects events older than a week, so that gap cannot be filled later. Such a session shows a reported cost lower than its transcript suggests.

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
| `GET /api/events/:id` | One event's tool response, which the event lists leave out |
| `GET /api/transcripts/session/:sessionId` | Parsed transcript of a session |
| `GET /api/transcripts/:agentId` | Parsed transcript of a subagent |
| `ws://localhost:3001/ws` | Live event and session stream |
| `ws://localhost:3001/ws/transcript` | Live transcript updates |

### Development

Requires [Bun](https://bun.sh).

```bash
(cd agent-manager/server && bun install && bun test && bun run typecheck)
(cd agent-manager/ui && bun install && bun test && bun run build)

./scripts/health-check.sh            # check every service's health endpoint
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
| [Claude Code Monitoring](http://localhost:3000/d/claude-code-monitor) | All panels in one view |

### Metrics

The metrics these dashboards use. The [Claude Code monitoring docs](https://code.claude.com/docs/en/monitoring-usage#available-metrics-and-events) list every metric and event.

| Prometheus name | Description |
|-----------------|-------------|
| `claude_code_session_count_total` | CLI sessions started |
| `claude_code_cost_usage_USD_total` | Cost in USD |
| `claude_code_token_usage_tokens_total` | Tokens, split by `type` (input, output, cacheRead, cacheCreation) |
| `claude_code_active_time_seconds_total` | Active time |
| `claude_code_lines_of_code_count_total` | Lines of code modified |
| `claude_code_commit_count_total` | Git commits created |
| `claude_code_pull_request_count_total` | Pull requests created |
| `claude_code_code_edit_tool_decision_total` | Edit permission decisions |

Every metric carries labels such as `session_id`, `model`, `terminal_type`, `os_type` and `service_version`. Some metrics only appear once the matching event has happened.

Read the counters with `increase()` over a range and sum the result. Never sum the raw values: a series starts again from 0 after a collector restart, and the raw value then no longer says anything about the range you look at.

```promql
# Cost by model over the last 7 days
sum by (model) (increase(claude_code_cost_usage_USD_total[7d] anchored))

# Tokens by type over the last 24 hours
sum by (type) (increase(claude_code_token_usage_tokens_total[24h] anchored))
```

The `anchored` modifier makes `increase()` the exact difference between the last sample and the sample at the start of the range, without extrapolation at the edges. The dashboards use it everywhere.

### How the counters are stored

Claude Code exports its counters as deltas: each export holds only what happened since the previous one. Prometheus needs running totals, so the collector converts them:

1. The `deltatocumulative` processor adds every delta to a running total per series and keeps that total in memory. A series without new data for 24 hours (`max_stale`) is dropped from memory.
2. The `prometheus` exporter serves those totals on `:8889` for 25 hours after their last update (`metric_expiration`). That is longer than `max_stale`, so a series never disappears from Prometheus while the collector still holds its total.
3. Each total carries the time its series started. Prometheus runs with `--enable-feature=created-timestamp-zero-ingestion`, which stores that start as a sample with value 0. Without it, `increase()` would miss the first value of every series, and short sessions would count as nothing.
4. Prometheus also runs with `--enable-feature=promql-extended-range-selectors`, which provides the `anchored` modifier.

Why deltas and not `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative`? Claude Code's metrics carry no label that identifies the process. Two processes on the same session (for example `claude --resume` in two terminals) would then write competing totals into one series, and every switch between them looks like a reset to Prometheus. With deltas the collector simply adds up what both processes report. The exporter alone cannot do this conversion reliably: it only adds a delta that starts exactly where the previous one ended, which Claude Code does not guarantee after a quiet export interval, so it used to overwrite the total instead.

### Known limitations

- **Collector restart.** The running totals live in the collector's memory. After a restart every series starts again from 0. `increase()` treats that as a counter reset and counts correctly, but anything Claude Code sent while the collector was down is lost.
- **Sessions idle for more than 24 hours.** The collector forgets the total and the series starts again from 0 on the next export. `increase()` handles this as a reset as well.
- **Concurrent processes on one session.** The processor drops a delta that arrives with an older timestamp than the last one it accepted for that series. Two processes exporting at nearly the same moment can therefore lose an occasional delta.
- **Data from older versions of this stack.** If you ran a version from before the `deltatocumulative` processor, samples from that time hold overwritten deltas instead of totals, so panels undercount those ranges. The `claude_code.api_request` events in Loki carry the exact cost of every request and are the better source for that period.

Events land in Loki and can be queried from Grafana. Their fields (`event_name`, `cost_usd`, `model`, `session_id`, ...) are structured metadata, so filter on them directly instead of parsing the line with `| json`:

```logql
{service_name="claude-code"} | event_name="api_request"
```

## Troubleshooting

**No metrics in Grafana**

- Claude Code drops metrics silently when the collector is down, so check `docker compose logs otel-collector`.
- Confirm the `env` block in `~/.claude/settings.json` and restart Claude Code.
- `curl -s http://localhost:8889/metrics | grep claude_code` shows what the collector has received.

**Agent Manager shows no sessions**

- Check that `~/.claude/settings.json` contains `send-hook.sh` entries.
- `curl http://localhost:3001/api/health` should return `{"status":"ok"}`.
- Send a test event and check the status code, `201` means it was stored: `curl -sS -w ' %{http_code}\n' -X POST http://localhost:3001/api/hooks -H 'Content-Type: application/json' -d '{"session_id":"test","hook_event_name":"Test","cwd":"/tmp"}'`. It adds a session named `test` to the dashboard, which stays there until it falls out of the selected time range.
- Check `docker compose logs agent-manager-server`.

**`docker compose up` fails with "port is already allocated"**

- Another program already uses one of the stack's ports: 3000, 3001, 3002, 3100, 4317, 4318, 5433, 8889 or 9090. Stop it, or change the host side of that port in `docker-compose.yml`. If you move the server off 3001, also set `AGENT_MANAGER_URL` for the hook.
