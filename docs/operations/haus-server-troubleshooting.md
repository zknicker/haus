---
summary: Mac mini SSH access, scoped sudo grants, credential recovery, and hosted Haus incident diagnostics.
read_when:
  - investigating a hosted Haus outage, health failure, or stuck Server
  - installing troubleshooting permissions or recovering Mac mini SSH access
---

# Hosted Haus troubleshooting

The topology and deployment authority live in [Server deployment](haus-server-deploy.md).
Connect from the trusted operator MacBook:

```sh
ssh -i ~/.ssh/macmini_tailscale -o BatchMode=yes zknicker@100.117.221.78
```

The SSH account is `zknicker`, not root. Always use `sudo -n` from agents so a
missing grant fails promptly. `sudo -n -l` discovers actual installed grants.
The existing deployment-helper grant does not grant arbitrary sudo.

## Credential recovery

The existing key is backed up in the `Production` vault as the Document
`SSH Recovery - Mac Mini Operator`. Its bytes were verified against the working
local key on 2026-09-21. The local file remains the SSH working copy; the key was
not rotated. Document storage is a CLI fallback, not a native SSH-agent item.

On a trusted MacBook with the Keychain-backed `agent-op` identity, recover to a
new private directory without overwriting an existing key:

```sh
umask 077
recovery_dir=$(mktemp -d "$HOME/.ssh/haus-recovery.XXXXXX")
agent-op document get 'SSH Recovery - Mac Mini Operator' --vault Production \
  --out-file "$recovery_dir/macmini_tailscale" &&
chmod 600 "$recovery_dir/macmini_tailscale" &&
ssh -i "$recovery_dir/macmini_tailscale" -o BatchMode=yes zknicker@100.117.221.78 hostname
```

Keep key material out of tool output, chat, repository files, and command arguments.
The mini does not need a 1Password token. Native 1Password SSH-agent adoption is
a separate change; this recovery copy does not configure it.

## Install troubleshooting grants

Installed on the mini on 2026-09-21. Passwordless log reads, Server stack sampling,
and Server restart were verified; local and public health returned HTTP 200 after
the restart. Future sessions must still inspect actual grants with `sudo -n -l`.

The reviewed policy is
[`haus-troubleshooting.sudoers`](../../apps/server/operations/haus-troubleshooting.sudoers).
It grants exact commands for the four current Server/Tunnel logs, service state,
Haus sockets, a five-second Server stack sample, and Server/Tunnel restarts.
PostgreSQL inspection already works through the account's Docker access.
Shared Colima recovery, host reboot, arbitrary root shells, and deployment remain
separate operations. Extend the checked-in policy when an incident identifies a
missing command instead of granting wildcard sudo.

From the repository on the MacBook:

```sh
scp -i ~/.ssh/macmini_tailscale apps/server/operations/haus-troubleshooting.sudoers \
  zknicker@100.117.221.78:/Users/zknicker/haus-troubleshooting.sudoers
ssh -t -i ~/.ssh/macmini_tailscale zknicker@100.117.221.78 \
  'sudo /usr/sbin/visudo -cf /Users/zknicker/haus-troubleshooting.sudoers && sudo /usr/bin/install -o root -g wheel -m 0440 /Users/zknicker/haus-troubleshooting.sudoers /etc/sudoers.d/haus-troubleshooting && sudo /usr/sbin/visudo -c'
```

The operator enters the mini's admin password in their own terminal. Validate
with `sudo -n -l` and one log read below. A staged file or syntax check alone is
not proof the permissions are installed. Remove only
`/etc/sudoers.d/haus-troubleshooting` with authenticated sudo to revoke this policy;
preserve the separate activation policy.

## Incident checks

Run on the mini. Capture evidence before restarting:

```sh
curl -sS --max-time 10 http://127.0.0.1:18791/healthz
sudo -n /bin/launchctl print system/com.haus.server
sudo -n /usr/bin/tail -n 1000 /Users/zknicker/srv/haus/logs/server.log
sudo -n /usr/bin/tail -n 1000 /Users/zknicker/srv/haus/logs/server.error.log
sudo -n /usr/sbin/lsof -nP -iTCP:18791
sudo -n /usr/bin/sample haus-server 5 -file /dev/stdout
/opt/homebrew/bin/docker logs --since 15m --tail 100 haus-postgres
/opt/homebrew/bin/docker exec haus-postgres pg_isready
/opt/homebrew/bin/docker exec haus-postgres psql -U haus_admin -d haus_production -c \
  "SELECT pid, usename, state, wait_event_type, wait_event, now()-xact_start AS transaction_age, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity;"
```

For ingress, inspect `system/com.haus.tunnel`, `tunnel.log`, `tunnel.error.log`,
and port `20242` using the same exact command forms. Port `5438` inspects the
host's PostgreSQL listener. Review logs locally and summarize relevant failures;
SQL and application logs can include private content.

A `postgres_unavailable` response can mean the Server's client pool timed out
while PostgreSQL remained healthy. Compare active transactions, lock waits,
process lifetime, and connection activity before attributing it to a DB crash.
The health check shares product pools, so its timeout is not independent DB proof.

On Bun 1.3.5, check that `BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING=1`
reaches the delivered environment before process startup. Without it, concurrent
cached and uncached query shapes can misattribute results and permanently stall
reads on idle connections. Bun 1.4.2 includes the upstream fix; production keeps
the flag while older artifacts remain rollback targets. Production delivery
includes native flags separately from the application's typed env module.

When recovery is authorized, restart only the affected service:

```sh
sudo -n /bin/launchctl kickstart -k system/com.haus.server
# For a confirmed Tunnel failure:
sudo -n /bin/launchctl kickstart -k system/com.haus.tunnel
```

Recheck local and public `https://haus.chat/healthz`, then the affected product
operation. A restart restoring health proves recovery, not the original cause.
