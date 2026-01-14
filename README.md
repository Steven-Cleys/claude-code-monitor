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
| OTEL Collector | localhost:4317 (gRPC) | - |

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
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317"
  }
}
```

Restart Claude Code after making changes.

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

## Troubleshooting

**Metrics not appearing:**
- Claude Code won't crash if collector is down - metrics are dropped silently
- Check OTEL collector logs: `docker compose logs otel-collector`
- Verify Claude Code config in `~/.claude/settings.json`

