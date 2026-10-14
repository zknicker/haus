#!/usr/bin/env bash
# Claude Code SessionStart. Local sessions refresh the worktree. Claude cloud
# sessions (CLAUDE_CODE_REMOTE=true) also seed the zknicker/agents fleet, then
# run the same install Cursor cloud agents use. Only the final hook JSON goes
# to stdout. Environment setup: docs/operations/environment.md.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

if [ "${CLAUDE_CODE_REMOTE:-}" != true ]; then
  bun run setup:worktree >&2
  exit 0
fi

pg_bin_dir=/usr/lib/postgresql/16/bin
export HAUS_POSTGRES_BIN="$pg_bin_dir"
export PATH="$HOME/.local/bin:$PATH"

seed_fleet() {
  local read_token scratch
  read_token="$(bunx varlock@1.16.1 printenv CLAUDE_FLEET_GITHUB_READ_TOKEN -p .claude/cloud-bootstrap)" || return 1
  scratch="$(mktemp -d)"
  printf 'header = "Authorization: Bearer %s"\n' "$read_token" |
    curl --fail --silent --show-error --config - --max-time 60 \
      https://raw.githubusercontent.com/zknicker/agents/main/claude/cloud/fleet.tar.gz \
      -o "$scratch/agents.tar.gz" || { rm -rf "$scratch"; return 1; }
  tar -xzf "$scratch/agents.tar.gz" -C "$scratch"
  test -f "$scratch/agents/claude/cloud/seed.sh" || { rm -rf "$scratch"; return 1; }
  mkdir -p "$HOME/.agents"
  rm -rf "$HOME/.agents/claude-upstream"
  mv "$scratch/agents" "$HOME/.agents/claude-upstream"
  rm -rf "$scratch"
  bash "$HOME/.agents/claude-upstream/claude/cloud/seed.sh"
}

fleet_context="Claude cloud bootstrap loaded the current zknicker/agents fleet. Before work, read ~/.claude/CLAUDE.md and ~/.claude/rules/pstack-models.md. Use poteto-mode in this main chat. Fleet roles inherit the native Claude model."
if ! seed_fleet >&2; then
  echo "[session-start] Skipping fleet agents (seed failed)." >&2
  fleet_context="The zknicker/agents fleet did not load this session; fleet skills such as poteto-mode are unavailable."
fi

bash .cursor/install.sh >&2

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' \
    "export HAUS_POSTGRES_BIN=$pg_bin_dir" \
    'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","reloadSkills":true,"additionalContext":"%s"}}\n' "$fleet_context"
