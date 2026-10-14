#!/usr/bin/env bash
# Fleet-owned: copied from zknicker/agents templates/cloud-agent by
# bin/port-cloud-agent. Edit it there, not in a product repo.
#
# Downloads the zknicker/agents fleet bundle into ~/.agents/fleet for a cloud
# agent platform adapter to seed. The read key resolves from 1Password through
# cloud-agent/fleet/.env.schema. CLOUD_AGENTS_FLEET_REF selects a branch to
# trial unmerged fleet changes; it defaults to main. Prints the fleet root on
# stdout; logs go to stderr.
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
fleet_root="$HOME/.agents/fleet"
fleet_ref="${CLOUD_AGENTS_FLEET_REF:-main}"

read_token="$(cd "$root" && bunx varlock@1.16.1 printenv FLEET_GITHUB_READ_TOKEN -p cloud-agent/fleet)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
printf 'header = "Authorization: Bearer %s"\n' "$read_token" |
  curl --fail --silent --show-error --config - --max-time 60 \
    "https://raw.githubusercontent.com/zknicker/agents/${fleet_ref}/claude/cloud/fleet.tar.gz" \
    -o "$scratch/fleet.tar.gz"
unset read_token
tar -xzf "$scratch/fleet.tar.gz" -C "$scratch"
test -f "$scratch/agents/agents/AGENTS.md"

mkdir -p "$HOME/.agents"
rm -rf "$fleet_root"
mv "$scratch/agents" "$fleet_root"
printf '%s\n' "$fleet_root"
