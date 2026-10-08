#!/usr/bin/env bash
# Builds the production website bundle for the perf tools (--serve-dist).
# Same code as the shipped hosted app: HAUS_HOSTED_APP=1 gives an absolute
# base ('/') so deep links resolve when the bundle is served on the dev origin.
# See browser-session.mjs for why it must be served there.
#
# Usage: scripts/perf/build-prod-bundle.sh [out-dir]   (default .perf/dist-prod)
# Build once per code state you want to measure (e.g. .perf/dist-before from the
# baseline commit, .perf/dist-prod from the change) and keep the dirs side by side.
# Env: VARLOCK_WRAPPER overrides the env loader prefix. Default: agent-varlock when
# installed (non-interactive 1Password identity for agent sessions), else none.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
out_dir="${1:-$repo_root/.perf/dist-prod}"
case "$out_dir" in /*) ;; *) out_dir="$PWD/$out_dir" ;; esac

wrapper="${VARLOCK_WRAPPER-}"
if [ -z "${VARLOCK_WRAPPER+set}" ] && command -v agent-varlock >/dev/null 2>&1; then
    wrapper="agent-varlock --"
elif [ -z "${VARLOCK_WRAPPER+set}" ] && [ -x "$HOME/.local/bin/agent-varlock" ]; then
    wrapper="$HOME/.local/bin/agent-varlock --"
fi

cd "$repo_root"
# shellcheck disable=SC2086 # wrapper is an intentional word-split command prefix
HAUS_HOSTED_APP=1 $wrapper ./node_modules/.bin/varlock run -- \
    bash -c "cd apps/website && ./node_modules/.bin/vite build --outDir '$out_dir' --emptyOutDir"
echo "built $out_dir"
