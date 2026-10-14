#!/usr/bin/env bash
# Haus cloud agent install, the repo-owned part of the fleet cloud agent
# contract (zknicker/agents cloud-agent-setup skill). Cursor runs it as its
# snapshot install; Claude runs it from the fleet start each session.
# Must be idempotent: it can run repeatedly on top of prepared disk state.
#
# There is no .env step: the committed .env.schema is the environment contract
# and values resolve from 1Password through the fleet-wide Development identity
# each platform provides as CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BUN_VERSION="1.4.2"

echo "==> Ensuring Bun ${BUN_VERSION} is installed"
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version 2>/dev/null || true)" != "${BUN_VERSION}" ]; then
    curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi
export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
export PATH="${BUN_INSTALL}/bin:${PATH}"
sudo ln -sf "${BUN_INSTALL}/bin/bun" /usr/local/bin/bun
sudo ln -sf "${BUN_INSTALL}/bin/bunx" /usr/local/bin/bunx

echo "==> Ensuring PostgreSQL 16 is installed (required by the dev stack)"
if [ ! -x /usr/lib/postgresql/16/bin/postgres ]; then
    # Retry apt to tolerate transient mirror/CDN errors (e.g. sporadic 400s).
    for attempt in 1 2 3; do
        sudo DEBIAN_FRONTEND=noninteractive apt-get update || true
        if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
            -o Acquire::Retries=5 --fix-missing \
            postgresql-16 postgresql-client-16; then
            break
        fi
        echo "apt-get install attempt ${attempt} failed; retrying in 5s..."
        sleep 5
    done
    if [ ! -x /usr/lib/postgresql/16/bin/postgres ]; then
        echo "PostgreSQL 16 installation failed after retries." >&2
        exit 1
    fi
fi

# Expose the PostgreSQL 16 binaries on PATH. scripts/dev-postgres.mjs and the
# server test harness only auto-discover Homebrew paths (or bare PATH) for these
# tools, so without this any PostgreSQL-backed lane invoked from a plain shell
# (`bun run test:app`, `apps/server` tests, evals) fails to find them unless
# HAUS_POSTGRES_BIN is set by hand.
echo "==> Exposing PostgreSQL 16 binaries on PATH"
for pg_bin in postgres initdb pg_ctl pg_isready psql createdb; do
    if [ -x "/usr/lib/postgresql/16/bin/${pg_bin}" ]; then
        sudo ln -sf "/usr/lib/postgresql/16/bin/${pg_bin}" "/usr/local/bin/${pg_bin}"
    fi
done

echo "==> Installing project dependencies and HeroUI Pro artifacts"
# setup:worktree runs `bun install --frozen-lockfile` then downloads the pinned
# HeroUI Pro artifacts. Both licensed credentials it needs are @internal schema
# items, so `varlock run` deliberately does not export them; setup:worktree
# fetches them itself with `varlock printenv` under the install switch,
# resolving from the Development vault through CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN.
# No per-repo secret is involved.
bun run setup:worktree

# Agent turns need a runtime CLI on the host; the dev seed runs on Codex. Pinned
# with the Codex bridge in apps/computer/assets/harness-bridges/codex. Its login
# happens per session in start.sh so no snapshot bakes in a credential.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO=sudo
fi
CODEX_VERSION="0.159.0"
echo "==> Ensuring Codex CLI ${CODEX_VERSION} is installed"
if [ "$(codex --version 2>/dev/null || true)" != "codex-cli ${CODEX_VERSION}" ]; then
    ${SUDO} npm install -g "@openai/codex@${CODEX_VERSION}"
fi

# The agent Browser tool discovers Chromium on PATH and drives it through
# agent-browser. /usr/local/bin/google-chrome here is a wrapper script, which
# discovery skips, so expose the preinstalled Playwright Chromium binary.
AGENT_BROWSER_VERSION="0.38.2"
echo "==> Ensuring Chromium and agent-browser ${AGENT_BROWSER_VERSION} for the Browser tool"
if ! command -v chromium >/dev/null 2>&1 && [ -x /opt/pw-browsers/chromium ]; then
    ${SUDO} ln -sf /opt/pw-browsers/chromium /usr/local/bin/chromium
fi
if [ "$(agent-browser --version 2>/dev/null || true)" != "agent-browser ${AGENT_BROWSER_VERSION}" ]; then
    ${SUDO} npm install -g "agent-browser@${AGENT_BROWSER_VERSION}"
fi

echo "==> Install complete"
