#!/usr/bin/env bash
# Claude Code SessionStart adapter. Local sessions refresh the worktree. Claude
# cloud sessions (CLAUDE_CODE_REMOTE=true) fetch the zknicker/agents fleet, run
# its Claude start script, then the shared cloud agent install. Only the hook
# JSON goes to stdout. Environment setup: AGENTS.md.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

if [ "${CLAUDE_CODE_REMOTE:-}" != true ]; then
  bun run setup:worktree >&2
  exit 0
fi

fleet_context="The zknicker/agents fleet did not load this session; fleet skills such as poteto-mode are unavailable."
if fleet_root="$(bash scripts/fetch-fleet.sh)" && context="$(bash "$fleet_root/claude/cloud/start.sh")"; then
  fleet_context="$context"
else
  echo "[session-start] Skipping fleet agents (fetch or start failed)." >&2
fi

pg_bin_dir=/usr/lib/postgresql/16/bin
export HAUS_POSTGRES_BIN="$pg_bin_dir"
bash scripts/cloud-agent-install.sh >&2

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' "export HAUS_POSTGRES_BIN=$pg_bin_dir" 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","reloadSkills":true,"additionalContext":"%s"}}\n' "$fleet_context"
