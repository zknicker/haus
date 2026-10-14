#!/usr/bin/env bash
# Fleet-owned: copied from zknicker/agents templates/cloud-agent by
# bin/port-cloud-agent. Edit it there, not in a product repo.
#
# Claude Code SessionStart adapter for the cloud-agent contract. Claude cloud
# sessions only (CLAUDE_CODE_REMOTE=true): load the fleet, then run the repo's
# cloud-agent/ scripts. Only the hook JSON goes to stdout.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

export PATH="$HOME/.local/bin:$PATH"
if [ -f cloud-agent/env.sh ]; then
  . cloud-agent/env.sh
fi

context="The zknicker/agents fleet did not load this session; fleet skills such as poteto-mode are unavailable."
if fleet_root="$(bash cloud-agent/fetch-fleet.sh)" &&
  fleet_context="$(bash "$fleet_root/claude/cloud/start.sh")"; then
  context="$fleet_context"
else
  echo "[cloud-agent] Skipping fleet agents (fetch or start failed)." >&2
fi

bash cloud-agent/install.sh >&2
if [ -f cloud-agent/session.sh ]; then
  bash cloud-agent/session.sh >&2
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
  if [ -f cloud-agent/env.sh ]; then
    printf '. %q\n' "$root/cloud-agent/env.sh" >> "$CLAUDE_ENV_FILE"
  fi
fi

if [ -f cloud-agent/context.md ]; then
  context="$context $(tr '\n' ' ' < cloud-agent/context.md)"
fi
node -e 'process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", reloadSkills: true, additionalContext: process.argv[1].trim() } })}\n`)' "$context"
