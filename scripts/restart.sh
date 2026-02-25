#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [service...] [--rebuild]

Restart services in the monitoring stack.

  $(basename "$0")                     Restart all services
  $(basename "$0") server ui           Restart specific services
  $(basename "$0") --rebuild           Rebuild and restart all services
  $(basename "$0") server --rebuild    Rebuild and restart specific service

Service aliases:
  server    → agent-manager-server
  ui        → agent-manager-ui
  collector → otel-collector

Options:
  --rebuild   Rebuild images before restarting (docker compose up -d --build)
  -h, --help  Show this help
EOF
}

resolve_alias() {
  local name="$1"
  case "$name" in
    server)    echo "agent-manager-server" ;;
    ui)        echo "agent-manager-ui" ;;
    collector) echo "otel-collector" ;;
    *)         echo "$name" ;;
  esac
}

rebuild=false
services=()

for arg in "$@"; do
  case "$arg" in
    --rebuild)
      rebuild=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
    *)
      services+=("$(resolve_alias "$arg")")
      ;;
  esac
done

if $rebuild; then
  if [[ ${#services[@]} -gt 0 ]]; then
    echo "Rebuilding and restarting: ${services[*]}"
    docker compose -f "$COMPOSE_FILE" up -d --build "${services[@]}"
  else
    echo "Rebuilding and restarting all services"
    docker compose -f "$COMPOSE_FILE" up -d --build
  fi
else
  if [[ ${#services[@]} -gt 0 ]]; then
    echo "Restarting: ${services[*]}"
    docker compose -f "$COMPOSE_FILE" restart "${services[@]}"
  else
    echo "Restarting all services"
    docker compose -f "$COMPOSE_FILE" restart
  fi
fi

echo ""
echo "=== Service Status ==="
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Health Check ==="
"$PROJECT_ROOT/scripts/health-check.sh" || true
