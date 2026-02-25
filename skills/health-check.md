---
name: health-check
description: Check health of all docker compose services, diagnose failures, and suggest fixes. Use when you want to verify the monitoring stack is running correctly.
---

# Health Check

## Instructions

1. Run the health check script from the project root:

   ```bash
   ./scripts/health-check.sh
   ```

2. Parse the JSON output. If `status` is `"healthy"`, report all services are up with a brief summary table showing each service and its status.

3. If `status` is `"degraded"`, for each service in the `failed` array:
   - Run `docker compose logs --tail=30 <service>` to get recent logs
   - Diagnose the likely cause:
     - Container not running → check if image exists, look for crash loops in logs
     - Port not open → container may be starting up, check logs for bind errors or port conflicts
     - Health endpoint failing → service started but unhealthy, check application logs for errors
   - Suggest a specific fix:
     - Crash/OOM → `/restart-stack <service> rebuild`
     - Dependency not ready → restart the dependency first, then the failed service
     - Config error → point to the specific config file that needs attention
   - Offer to run the fix if the user approves

4. Always end with a summary line: `N/7 services healthy.`
