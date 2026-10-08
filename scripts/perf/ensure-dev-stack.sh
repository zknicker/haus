#!/usr/bin/env bash
# Starts (or confirms) a dedicated perf dev stack that survives agent sessions.
# Agent sandboxes reap background processes after ~6-7 minutes, so run this
# UNSANDBOXED; the stack is launched detached with nohup and its own state root
# (HAUS_DEV_STACK_ID keeps the Postgres socket path short and separate from the
# worktree's normal stack). Kill it yourself when done.
#
# Usage: scripts/perf/ensure-dev-stack.sh [port-base]   (default 39540)
#   Website = port-base, Server = port-base + 3. Log: .perf/dev-stack.log.
#   Point the tools at it: HAUS_PERF_BASE=http://localhost:39540 bun run perf:web
# Env: HAUS_DEV_STACK_ID (default perf), VARLOCK_WRAPPER (see build-prod-bundle.sh).
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
port_base="${1:-39540}"
stack_id="${HAUS_DEV_STACK_ID:-perf}"
url="http://localhost:$port_base"
log="$repo_root/.perf/dev-stack.log"

status() { curl -s -o /dev/null -w '%{http_code}' "$url" || true; }
if [ "$(status)" = 200 ]; then
    echo "perf stack already up at $url"
    exit 0
fi

wrapper="${VARLOCK_WRAPPER-}"
if [ -z "${VARLOCK_WRAPPER+set}" ] && command -v agent-varlock >/dev/null 2>&1; then
    wrapper="agent-varlock --"
elif [ -z "${VARLOCK_WRAPPER+set}" ] && [ -x "$HOME/.local/bin/agent-varlock" ]; then
    wrapper="$HOME/.local/bin/agent-varlock --"
fi

mkdir -p "$repo_root/.perf"
cd "$repo_root"
# Only this checkout's stale stack; sibling worktrees run their own.
pkill -f "$repo_root.*run-dev-stack" || true
sleep 2
# shellcheck disable=SC2086 # wrapper is an intentional word-split command prefix
HAUS_DEV_STACK_ID="$stack_id" HAUS_DEV_PORT_BASE="$port_base" nohup $wrapper \
    ./node_modules/.bin/varlock run -- node scripts/run-dev-stack.mjs web >"$log" 2>&1 &
for _ in $(seq 1 90); do
    [ "$(status)" = 200 ] && break
    sleep 2
done
if [ "$(status)" != 200 ]; then
    echo "perf stack did not come up at $url; see $log" >&2
    exit 1
fi
# First boot seeds the demo Server and warms Vite's optimized deps.
sleep 15
echo "perf stack up at $url (log $log)"
