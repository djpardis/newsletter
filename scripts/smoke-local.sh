#!/usr/bin/env bash
# Runs the documented local setup with .dev.vars.example and fails on any
# Worker error. Uses a temporary D1 state directory and leaves .dev.vars alone.
set -euo pipefail
set -m

port="${SMOKE_PORT:-8799}"
state="$(mktemp -d)"
log="$state/dev.log"

fail() {
  echo "smoke: $1" >&2
  echo "--- wrangler dev log ---" >&2
  cat "$log" >&2
  exit 1
}

npx wrangler d1 migrations apply newsletter --local --persist-to "$state" >/dev/null
npx wrangler dev --env-file .dev.vars.example --persist-to "$state" --port "$port" >"$log" 2>&1 &
pid=$!
trap 'kill -- -"$pid" 2>/dev/null || true; rm -rf "$state"' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://localhost:$port/health" >/dev/null && break
  sleep 1
done
curl -sf "http://localhost:$port/health" >/dev/null || fail "health check did not respond"

status="$(curl -s -o "$state/body" -w '%{http_code}' -X POST "http://localhost:$port/api/subscribe" \
  -H "Origin: http://localhost:8080" -H "content-type: application/json" \
  -d '{"email":"smoke@example.com"}')"
[ "$status" = "200" ] || fail "subscribe returned $status: $(cat "$state/body")"

sleep 1
grep -q "Local preview" "$log" || fail "confirmation email preview was not logged"
if grep -q "ERROR" "$log"; then fail "wrangler dev logged an error"; fi

echo "smoke: local signup works with .dev.vars.example"
