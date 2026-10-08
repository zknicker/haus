#!/usr/bin/env bash
# Full interaction sweep: prod bundle at CPU x1 and x4 (the numbers that matter),
# optionally dev too, then a markdown summary. Needs a running dev stack and a
# prod bundle (build-prod-bundle.sh). Run unsandboxed (installed Chrome).
#
# Usage: scripts/perf/sweep.sh <label> [dist-dir]
#   Writes .perf/<label>/results-{prod-cpu1,prod-cpu4[,dev-cpu1]}.json + summary.md.
#   Env: REPS (default 5), BASE (default: harness default), DEV=1 adds a dev cpu1 run.
# Compare two sweeps:
#   node scripts/perf/compare.mjs .perf/before/results-prod-cpu1.json \
#     .perf/after/results-prod-cpu1.json .perf/before/results-prod-cpu4.json \
#     .perf/after/results-prod-cpu4.json
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
label="${1:?usage: sweep.sh <label> [dist-dir]}"
dist="${2:-$repo_root/.perf/dist-prod}"
out="$repo_root/.perf/$label"
reps="${REPS:-5}"
harness=(node "$repo_root/scripts/perf/interaction-harness.mjs" --reps "$reps" --quiet)
if [ -n "${BASE:-}" ]; then harness+=(--base "$BASE"); fi

mkdir -p "$out"
"${harness[@]}" --serve-dist "$dist" --cpu 1 --out "$out/results-prod-cpu1.json"
"${harness[@]}" --serve-dist "$dist" --cpu 4 --out "$out/results-prod-cpu4.json"
if [ "${DEV:-}" = 1 ]; then
    "${harness[@]}" --cpu 1 --out "$out/results-dev-cpu1.json"
fi
node "$repo_root/scripts/perf/summarize.mjs" "$out"/results-*.json >"$out/summary.md"
echo "wrote $out/summary.md"
