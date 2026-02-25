---
name: restart-stack
description: Restart or rebuild docker compose services. Automatically health-checks after restart. Use when services need to be restarted or rebuilt after code changes.
---

# Restart Stack

## Arguments

- Service names (optional) — Space-separated. Use short aliases: `server`, `ui`, `collector`, or full names like `prometheus`, `grafana`, `loki`, `postgres`. No args = all services.
- `rebuild` (optional) — Rebuild Docker images before restarting (needed after code changes).

## Examples

- `/restart-stack` — restart all services
- `/restart-stack server` — restart just the backend
- `/restart-stack server ui rebuild` — rebuild and restart server + UI
- `/restart-stack all rebuild` — rebuild everything

## Instructions

1. **Parse arguments:** Identify which services to restart and whether `rebuild` was requested.

2. **Run the restart script:**
   ```bash
   ./scripts/restart.sh [services...] [--rebuild]
   ```
   Map user arguments to script arguments. If user said `rebuild`, pass `--rebuild` flag.

3. **Show the script output** to the user (which services were restarted, docker compose ps status).

4. **The script automatically runs health-check.** Review its JSON output:
   - If all healthy (`"status": "healthy"`): report success
   - If still failing: check `docker compose logs --tail=30 <failing-service>` for each still-failing service
   - Diagnose: did the restart not help? Is it a code/config issue needing a fix?
   - If a plain restart did not help and `--rebuild` was not used: suggest trying with `rebuild`
   - If rebuild did not help: diagnose from logs and suggest what code/config to fix

5. **Summary:** Report what was restarted, health status after, any remaining issues.
