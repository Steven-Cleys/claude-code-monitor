#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Service configurations: "name:port:health_url" (empty health_url means no endpoint)
SERVICES=(
  "otel-collector:4317:"
  "prometheus:9090:http://localhost:9090/-/healthy"
  "grafana:3000:http://localhost:3000/api/health"
  "loki:3100:http://localhost:3100/ready"
  "postgres:5433:"
  "agent-manager-server:3001:http://localhost:3001/api/health"
  "agent-manager-ui:3002:"
)

check_running() {
  local service="$1"
  local status
  status="$(docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps --format '{{.State}}' "$service" 2>/dev/null || true)"
  [[ "$status" == "running" ]]
}

check_port() {
  local port="$1"
  nc -z -w 2 localhost "$port" &>/dev/null
}

check_health_endpoint() {
  local url="$1"
  local http_code
  http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")"
  [[ "$http_code" =~ ^2 ]]
}

json_bool() {
  if "$@"; then echo "true"; else echo "false"; fi
}

compose_available=true
if ! docker compose -f "$PROJECT_ROOT/docker-compose.yml" ps --format '{{.Name}}' &>/dev/null; then
  compose_available=false
fi

overall_status="healthy"
services_json=""
failed_json=""

for entry in "${SERVICES[@]}"; do
  IFS=':' read -r service port health_url <<< "$entry"

  if $compose_available; then
    running=$(json_bool check_running "$service")
  else
    running="false"
  fi

  port_ok=$(json_bool check_port "$port")

  if [[ -n "$health_url" ]]; then
    health_ok=$(json_bool check_health_endpoint "$health_url")
  else
    health_ok="null"
  fi

  is_failed=false
  if [[ "$running" == "false" ]] || [[ "$port_ok" == "false" ]] || [[ "$health_ok" == "false" ]]; then
    is_failed=true
    overall_status="degraded"
  fi

  services_json+="\"$service\":{\"running\":$running,\"port\":$port_ok,\"health_endpoint\":$health_ok},"

  if $is_failed; then
    failed_json+="\"$service\","
  fi
done

# Strip trailing commas
services_json="{${services_json%,}}"
failed_json="[${failed_json%,}]"

cat <<EOF
{
  "status": "$overall_status",
  "services": $services_json,
  "failed": $failed_json
}
EOF

if [[ "$overall_status" != "healthy" ]]; then
  exit 1
fi
