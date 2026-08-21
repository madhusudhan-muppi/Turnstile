#!/usr/bin/env bash
# Starts the backend TWICE, as two separate OS processes on different ports,
# both pointed at the same SQLite file — this is the "simulate two+ server
# processes hitting the same DB at once" setup the task calls for. Then runs
# the concurrency proof script against both, and tears the servers down.
set -euo pipefail

cd "$(dirname "$0")/.."
BACKEND_DIR="$(pwd)/backend"
DB_PATH="./data/concurrency-proof.db"

rm -f "$BACKEND_DIR/data/concurrency-proof.db" "$BACKEND_DIR/data/concurrency-proof.db-shm" "$BACKEND_DIR/data/concurrency-proof.db-wal"

echo "Starting backend #1 on port 4001..."
(cd "$BACKEND_DIR" && PORT=4001 DB_PATH="$DB_PATH" JWT_SECRET=proof-secret npx tsx src/index.ts > /tmp/turnstile-proof-4001.log 2>&1) &
PID1=$!

echo "Starting backend #2 on port 4002 (same DB file)..."
(cd "$BACKEND_DIR" && PORT=4002 DB_PATH="$DB_PATH" JWT_SECRET=proof-secret npx tsx src/index.ts > /tmp/turnstile-proof-4002.log 2>&1) &
PID2=$!

cleanup() {
  echo "Stopping backend processes ($PID1, $PID2)..."
  kill "$PID1" "$PID2" 2>/dev/null || true
  wait "$PID1" "$PID2" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for both backends to become healthy..."
for port in 4001 4002; do
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$port/api/health" > /dev/null 2>&1; then
      echo "  port $port is up"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "  port $port never came up — see /tmp/turnstile-proof-$port.log"
      exit 1
    fi
    sleep 0.5
  done
done

echo ""
node "$(pwd)/scripts/concurrency-proof.mjs"
