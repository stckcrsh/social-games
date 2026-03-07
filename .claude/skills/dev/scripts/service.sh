#!/usr/bin/env bash
# social-games dev service manager (bash 3.2 compatible)
# Usage: service.sh <start|stop|restart|status|logs> [service|all]

set -eo pipefail

WORKSPACE=/Users/tawneypauling/Documents/git/social-games
PID_DIR=/tmp/social-games
LOG_DIR=/tmp/social-games
mkdir -p "$PID_DIR"

SERVICE_ORDER=(meta-service dungeon-service game proxy)

# ── Service definitions ───────────────────────────────────────────────────────
# Returns "nx-project:nx-target:port:env-prefix" for a given service name

get_def() {
  case "$1" in
    meta-service)    echo "meta-service:serve:3000:JWT_SECRET=my-dev-secret-1234" ;;
    dungeon-service) echo "dungeon-service:serve:3001:" ;;
    game)            echo "game:serve:4200:" ;;
    proxy)             echo "proxy:serve:8080:" ;;
    *)                 echo "" ;;
  esac
}

is_valid_service() {
  case "$1" in
    meta-service|dungeon-service|game|proxy) return 0 ;;
    *) return 1 ;;
  esac
}

# Expand short aliases to full names
expand_name() {
  case "$1" in
    ms)  echo "meta-service" ;;
    ds)  echo "dungeon-service" ;;
    g)   echo "game" ;;
    *)   echo "$1" ;;
  esac
}

# ── Helpers ───────────────────────────────────────────────────────────────────

pid_file() { echo "$PID_DIR/$1.pid"; }
log_file()  { echo "$LOG_DIR/$1.log"; }

is_running() {
  local pf; pf=$(pid_file "$1")
  [ -f "$pf" ] && kill -0 "$(cat "$pf")" 2>/dev/null
}

# ── Operations ────────────────────────────────────────────────────────────────

# Recursively send SIGTERM to a process and all its descendants (children first)
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

do_start() {
  local svc=$1
  local def project target port env_prefix
  def=$(get_def "$svc")
  IFS=: read -r project target port env_prefix <<< "$def"

  if is_running "$svc"; then
    echo "  ↳ $svc already running (PID $(cat "$(pid_file "$svc")"))"
    return
  fi

  local log; log=$(log_file "$svc")
  printf "  starting %-22s → " "$svc"

  local cmd="pnpm nx $target $project"
  [ -n "$env_prefix" ] && cmd="$env_prefix $cmd"

  # Launch in background; disown so the process outlives this shell invocation
  (cd "$WORKSPACE" && eval "$cmd" >> "$log" 2>&1) &
  local bgpid=$!
  disown "$bgpid"
  echo "$bgpid" > "$(pid_file "$svc")"

  sleep 2
  if kill -0 "$bgpid" 2>/dev/null; then
    echo "✓ PID $bgpid  (log: $log)"
  else
    echo "✗ crashed — last 20 lines:"
    rm -f "$(pid_file "$svc")"
    tail -20 "$log" | sed 's/^/    /'
  fi
}

do_stop() {
  local svc=$1
  local pf; pf=$(pid_file "$svc")
  printf "  stopping %-22s → " "$svc"

  local pid=""
  if is_running "$svc"; then
    pid=$(cat "$pf")
    # Kill the wrapper PID and its entire child tree (catches node spawned by nx/pnpm)
    kill_tree "$pid"

    local i=0
    while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do
      sleep 0.5; i=$(( i + 1 ))
    done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    rm -f "$pf"
  fi

  # Fallback: kill any process still holding the service port (catches orphans)
  local def port
  def=$(get_def "$svc")
  IFS=: read -r _ _ port _ <<< "$def"
  if [ -n "$port" ]; then
    local port_pid
    port_pid=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$port_pid" ]; then
      kill -KILL $port_pid 2>/dev/null || true
    fi
  fi

  if [ -n "$pid" ]; then
    echo "✓ stopped (was PID $pid)"
  else
    echo "not running"
  fi
}

do_restart() {
  do_stop "$1"
  sleep 1
  do_start "$1"
}

do_status() {
  printf "\n%-24s %-6s %-10s %s\n" "SERVICE" "PORT" "STATUS" "PID"
  printf "%-24s %-6s %-10s %s\n" "-------" "----" "------" "---"

  local svc def port
  for svc in "${SERVICE_ORDER[@]}"; do
    def=$(get_def "$svc")
    IFS=: read -r _ _ port _ <<< "$def"

    if is_running "$svc"; then
      local pid; pid=$(cat "$(pid_file "$svc")")
      printf "%-24s %-6s %-10s %s\n" "$svc" "$port" "✓ running" "$pid"
    else
      printf "%-24s %-6s %-10s\n" "$svc" "$port" "✗ stopped"
    fi
  done
  echo ""
}

do_logs() {
  local svc=$1
  local log; log=$(log_file "$svc")
  if [ -f "$log" ]; then
    echo "=== last 50 lines: $log ==="
    tail -50 "$log"
  else
    echo "No log found at $log"
  fi
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

OP="${1:-status}"
SVC=$(expand_name "${2:-}")

if [ "$SVC" = "all" ] || [ -z "$SVC" ]; then
  TARGETS=("${SERVICE_ORDER[@]}")
else
  if ! is_valid_service "$SVC"; then
    echo "Unknown service: $SVC"
    echo "Valid: ${SERVICE_ORDER[*]}"
    echo "Aliases: ms, ds, g, proxy"
    exit 1
  fi
  TARGETS=("$SVC")
fi

case "$OP" in
  start)
    echo "Starting: ${TARGETS[*]}"
    for svc in "${TARGETS[@]}"; do do_start "$svc"; done ;;
  stop)
    echo "Stopping: ${TARGETS[*]}"
    for svc in "${TARGETS[@]}"; do do_stop "$svc"; done ;;
  restart)
    echo "Restarting: ${TARGETS[*]}"
    for svc in "${TARGETS[@]}"; do do_restart "$svc"; done ;;
  status)
    do_status ;;
  logs)
    [ "${#TARGETS[@]}" -ne 1 ] && { echo "logs requires a specific service name"; exit 1; }
    do_logs "${TARGETS[0]}" ;;
  *)
    echo "Unknown operation: $OP"
    echo "Usage: service.sh <start|stop|restart|status|logs> [service|all]"
    exit 1 ;;
esac
