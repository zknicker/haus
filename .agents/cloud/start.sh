#!/usr/bin/env bash
# Haus cloud agent session start, run by the fleet start after install.sh in
# every session. Credentials resolve here, per session, rather than in the
# install so no platform snapshot bakes in a login.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Codex runs the dev seed's Agents; sign it in with the Development OpenAI key.
if command -v codex >/dev/null 2>&1 && ! codex login status >/dev/null 2>&1; then
    echo "==> Signing Codex in with the Development OpenAI key"
    bunx varlock@1.16.1 printenv HAUS_OPENAI_API_KEY | codex login --with-api-key >/dev/null
fi
