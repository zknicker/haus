---
summary: Build, install, supervise, back up locally, restore, cut over, and roll back the single-node Haus Server at haus.chat.
read_when:
  - deploying or operating the hosted Haus Server
  - changing haus.chat ingress, PostgreSQL roles, or the delivered Server environment
  - preparing a Haus Server release artifact
  - backing up or restoring the hosted Haus Server's database or runner volume
  - running or proving the Agent runner container and its network deny
  - shipping the Channels-and-Tasks release (migrations 0123–0128, the Thread migration verifier)
---

# Haus Server deployment

`haus.chat` is one Server on the Mac mini. Cloudflare provides DNS, TLS, and a
named Tunnel only. The Tunnel sends `https://haus.chat` to
`http://127.0.0.1:18791`; the Server serves Haus App, tRPC HTTP, WebSocket, and
`/healthz` from that origin. A Cloudflare Redirect Rule sends
`www.haus.chat/*` to the matching apex path and preserves the query string.
PostgreSQL, attachments, and jobs stay on the mini. There is no public inbound
port, managed database, object store in the request path, or Cloudflare compute
for the apex. Vercel remains the domain registrar only; no production request
or deployment uses Vercel.

The Server has no configured public origin. It derives the public
[Trigger](../api/triggers.md) URL it hands an Agent from `x-forwarded-host` or
`host` and `x-forwarded-proto` or the connection protocol, so any ingress in
front of the Server must forward the externally reachable host and scheme.
Cloudflare's Tunnel does. An ingress that does not would make Agents publish an
address outside callers cannot reach.

## Release artifact

The Server and web Haus App are one `server` target. Merging the release PR
starts one `Release` workflow; its Server job publishes the exact artifact and
source identity needed for deployment. The graph then calls `Deploy Haus
Server` automatically through the protected `production` Environment. The
reusable workflow resolves production credentials and rewrites the Server's
delivered environment. Manual dispatch remains available for recovery and
activation. GitHub's `production` Environment has no required reviewers and
accepts deployments only from `main`; reviewing and merging the release PR is
the sole human release gate. Verify those repository settings before merging a
Server release.

Neither a push to `main` nor a completed target job alone is deployment evidence.
The Release workflow's own public check is the proof of success: it confirms the
public Server and hosted App are at the release version, plus `/healthz`.

The self-hosted `Deploy Haus Server` workflow:

1. accepts the Release workflow's exact published Haus `vX.Y.Z`, Server artifact `X.Y.Z`, and
   source SHA, or those same exact values from a manual `deploy` or `activate`
2. rejects drafts, prereleases, lightweight tags, branches, and arbitrary SHAs
3. resolves the annotated tag to a full commit SHA through the authenticated
   GitHub API
4. in `deploy` mode, requires the exact Server archive and sidecar whose Server version and short
   SHA match that Haus release
5. verifies the existing private PostgreSQL service without mutating it
6. in `deploy` mode, downloads and checksum-verifies those two assets, extracts
   only the compiled deploy operation, and uses it to verify and install the
   immutable full-SHA release; both modes then use the unprivileged deployer to
   verify the installed release's contents and product/Server identities, while
   `activate` skips asset download and installation
7. renders `config/server.env` from the workflow revision's `.env.schema` under
   `varlock run`, mode `0600` plus one ACL entry granting `_haus_server` read,
   after proving the released Server's application names match the contract,
   also delivering the explicit native Bun startup flags, retrying a transient
   1Password failure up to three times because
   resolving is idempotent
8. runs the candidate's migration program under `varlock run`, with the
   migration credential resolved from 1Password, and records the exact
   successful migrations in the job summary
9. asks the narrow root-owned activation helper to switch `current`, bootstrap
   the exact root-owned Server plist when its label is not loaded, otherwise
   restart only `com.haus.server`, and prove local health; the helper accepts
   only a contained full-SHA release directory and does not reinterpret release
   metadata or component versions
10. reads the delivered environment back names-only and fails on a name outside
    the delivered set, or on a production-required name of that set arriving
    missing or empty
11. verifies public `/healthz`, the hosted Haus App shell, and the App's exact product version
12. rolls back to the exact previous SHA on failure; a failed first activation
    boots out the label it introduced before removing `current`

`productVersion` is the website version, `serverVersion` is the independently
versioned Server artifact, and `sourceRevision` is the full immutable tag
commit SHA. The release id is
`<serverVersion>+git.<first-12-sourceRevision>`, while the installation
directory is `releases/<full-sourceRevision>`. `release.json`, the artifact
checksum, deploy verification, and startup logs carry the product and Server
versions, full revision, and content digest. The narrow activation output carries
only the activated revision, and public `/healthz` carries no release identity.

The `Release` workflow builds the Server artifact once. Human sign-in uses
public Cloudflare Access configuration; no provider credential is embedded in
the Server or App artifact. The mini never installs Bun dependencies, resets
the deploy root, or rebuilds the Server. PostgreSQL and runtime secrets do not
enter the artifact, Actions inputs, or output — they resolve from 1Password
during deploy and land only in `config/server.env`. See
[environment.md](environment.md).

The Apple Silicon archive and SHA-256 file are built under
`apps/server/release/`, verified by the publisher, and attached to the GitHub
Release. The archive contains the compiled deploy operation, Server operations,
Haus App, PostgreSQL migration runner and files, two Haus launchd jobs, one
narrow activation sudoers rule, and shared Colima boot assets. It ships no
environment example of any kind: `config/server.env` is rendered from the
schema at deploy time. The mini verifies the
outer checksum before extracting or executing the deploy operation, which then
verifies the internal manifest and release identity before atomic installation.
A packaging guard rejects any compiled operation that is not an Apple Silicon
Mach-O executable, including a host-native Linux binary from an Ubuntu release runner.
A manual `activate` never downloads, rebuilds, or reinterprets an artifact.
Urgent production changes require a patch release.

The Server artifact also includes its hosted MCP packages and frozen native language
runtimes. Publication uses Apple Silicon macOS; packaging verifies the relocated
Skool runtime through private MCP discovery and provisioning validation. Server owns
connector startup and shutdown, and connector degradation changes `/healthz` to
`degraded`, causing release health verification to fail. No separate connector
service or public ingress is installed. See [Hosted MCPs](hosted-mcp.md).

## Where the contract comes from

The environment contract travels with the repository, not with the artifact.
The deploy job checks out its **own** revision — not the released one — with
full history, and renders `config/server.env` from that `.env.schema`.

That is not a convenience. The release being deployed may predate the contract
entirely: the first varlock deploy necessarily promotes a version built before
`.env.schema` existed, and so does every rollback to one. A job that took its
contract from the artifact could never run the first time.

The cost is that the two revisions can disagree, and a silent disagreement is
worse than a failed deploy: a Server that cannot find a required database or
auth setting can fall back to its defaults or fail after restart. So the render
step reads the released revision's own
`apps/server/src/config/env.ts` out of git history and refuses to render unless
the name sets match exactly, naming both sides of the drift when they do not.
Post-bootstrap the two revisions normally agree and the check is a no-op.

A release whose Server reads a different name set than the current contract
delivers cannot be deployed through this path. Cut a release from a revision
whose contract matches, or place `config/server.env` by hand before activating
that release.

## Host and container ownership

The checkout remains owned by `zknicker`; service identities receive only the
traversal and read/write access their job needs:

| Identity | Owns | May read |
| --- | --- | --- |
| `_haus_server` | `data/attachments` | `current`, `config/server.env` |
| `_haus_tunnel` | no application state | `config/cloudflared.yml`, Tunnel credential |

Host-only state lives under `/Users/zknicker/srv/haus`: `backups/`, `config/`,
`data/`, `logs/`, `releases/`, and `current`. Preserve `bin/`, `colima/`, and
`operations/` when present. Put these names in the deploy root's local
`.git/info/exclude`; do not commit them and never run `git clean`.

The deploy root must contain **no** `.env`. Varlock loads a checkout `.env`
above `.env.schema`, and a `$` in any of its values is parsed as an expression;
the deploy job refuses to run when one exists. `config/server.env` is written
by the deploy job at mode `0600`, owned by `zknicker`, with one ACL entry
granting `_haus_server` read — `config/` itself is `zknicker`-owned and
traversable so the service can reach it. The migration credential is not a
GitHub Actions secret and is not stored in the release or read by the Server: it
resolves from 1Password during the migration step only. Service identities
cannot write the deploy root, release, or activation-helper directories. The
Server and PostgreSQL listen only on loopback.

The only privileged executable is
`/usr/local/libexec/haus/activate-haus-server`. `/usr/local`,
`/usr/local/libexec`, `/usr/local/libexec/haus`, and the executable are
root-owned and not group- or world-writable. The helper refuses to run from any
other path or with insecure ownership. It accepts one full source SHA, proves
that its activation target is a real directory at the exact contained release
path, switches `current`, controls the system service, checks local health, and
rolls back on failure. Artifact identity, versions, checksums, installation,
configuration, and migrations remain the unprivileged deployer's responsibility.
This does not create another application root: checkout, releases,
configuration, data, and logs remain under `/Users/zknicker/srv/haus`.

PostgreSQL is the only Haus container the deploy job manages; the optional runner container is below. The canonical definition is the
repository's `apps/server/compose.yml`; the deploy job verifies the running
container and brings it up from that file under `varlock run` only when it is
absent or unhealthy, so the admin password is interpolated from 1Password and
no environment file is read or written. Compose project `haus` uses the pinned
PostgreSQL 16.14 Alpine digest, container
`haus-postgres`, named volume `haus_postgres_data`, and
`127.0.0.1:5438:5432`. Do not add the database to Tailscale Serve or Funnel.
Administration uses SSH and local loopback. The [local backup](#backups) runs
`pg_dump` and `pg_restore` inside `haus-postgres`, so its tools always match the
server version; do not enable a host PostgreSQL service.

## Agent runner container

The Agent runner is the second Haus container, in the same Compose project `haus`. Its service is
`haus-runner` in `apps/server/compose.yml`, behind the Compose profile `runner`, so the database
bring-up above never builds or starts it. Before migrations, the workflow exports the release's own
tree with `git archive` (its deploy tooling stays at the workflow revision) and builds
`apps/runner/Dockerfile` from it as `haus-runner:<release sha>`. A release that predates the runner
skips every runner step. After the Server proves its local and public health, the workflow
recreates the container from that image under `varlock run` like the database. By hand:

```bash
bunx varlock@1.16.1 run -- docker compose -f apps/server/compose.yml -p haus --profile runner up -d --build --force-recreate --wait haus-runner
```

The image tag comes from `HAUS_RUNNER_IMAGE_TAG` and defaults to `local` for a hand build. After a proven start the workflow removes every other `haus-runner:<sha>` image except the
previous one, which stays as the rollback target.

The token comes from the `Agent Runner - Haus` Production item. Model logins are not in the
container's environment: the runner reads them from the Server's connections (Settings → Models).
The Server must hold the same `HAUS_RUNNER_TOKEN` and listen on
an address the container reaches through `host.docker.internal`. `HAUS_RUNNER_SERVER_URL`
overrides the default `http://host.docker.internal:18791`.

The container starts as root with `CAP_NET_ADMIN`. Its entrypoint installs OUTPUT rules that
deny PostgreSQL ports 5432 and 5438, the RFC 1918, link-local, and CGNAT ranges, and on IPv6 the
unique local, link-local, site-local, local-use NAT64 (`64:ff9b:1::/48`), and IPv4-translated
(`::ffff:0:0:0/96`) ranges, except the one
Server `host:port` taken from `HAUS_SERVER_URL`. It then drops to the unprivileged `haus-runner`
user with no capabilities and no new privileges. It writes `/run/haus-runner-firewall-ready`
once the rules are in, and the service's healthcheck waits on that file, so `--wait` returns
only after the deny is installed. The entrypoint resolves the Server host once at
start, so restart the container after the host address changes.

The named volume `haus_runner_data` holds each Agent's harness session under `/data`. The [local backup](#backups)
archives it beside the database dump. `docker compose -p haus down` without `--volumes` preserves it. Losing it
costs every Agent its session context, not its Haus history.

Every deploy then proves the deny from inside the container, and fails if any check fails:

```bash
docker exec -u haus-runner haus-runner /app/apps/runner/container/prove-network-deny.sh
```

It prints one line per check and exits non-zero on any failure. When the start or the proof
fails, the workflow's last step removes the new container and, when the previous one ran a
`haus-runner:<sha>` image, brings that image back and proves it again. The Server stays on the new
release, and the `haus_runner_data` volume is kept. Its first check is that the Server
endpoint answers, which also proves the container reaches the Server at all. Development hosts
without Docker cannot run it.

## Fresh PostgreSQL authority

The operator creates three roles:

- `haus_bootstrap`: owns the database and its `public` schema, performs the
  one fresh bootstrap, and then acts as the deployment workflow's migration login.
  Each migration run reapplies privileges so new tables and sequences are
  immediately usable by `haus_runtime`.
- `haus_runtime`: login with `CONNECT`, schema `USAGE`, and table DML only.
- `haus_backup`: read-only login every migration re-grants. The nightly
  [local backup](#backups) dumps as this role.

Run bootstrap once against an empty, newly created production database:

```bash
HAUS_DATABASE_BOOTSTRAP_URL='postgres://haus_bootstrap:…@127.0.0.1:5438/haus_production' \
HAUS_DATABASE_BACKUP_ROLE=haus_backup \
HAUS_DATABASE_RUNTIME_ROLE=haus_runtime \
/Users/zknicker/srv/haus/current/bin/haus-server-bootstrap
```

Bootstrap and every migration grant `haus_backup` its required read access.
Both the migration URL and the runtime URL live in the `Postgres - Haus`
Production item and reach their consumer through `.env.schema`; neither is
stored on the host by hand. Startup
checks connectivity and never executes DDL. Before activation, the deployment
workflow runs the candidate release's compiled migration program against the
checked-in SQL under `apps/server/drizzle/postgres/`. A migration failure leaves
the previous release active and produces a failed Database entry in the workflow
summary.

Generate a migration whenever `apps/server/src/postgres/schema/` changes:

```bash
cd apps/server
bun run db:generate -- --name=<short-name>
bun run db:check
```

Review and commit the generated SQL and metadata. Never use `drizzle-kit push`
against production. Migrations are forward-only and must use expand/contract:
the old Server must remain valid after the migration because application
rollback does not reverse database changes. Destructive cleanup lands only in a
later release after every deployed Server version has stopped using the old
shape.

Haus 10.0.0 is an operator-approved exception: migration 0072 removes `chat_events` and
`servers.last_chat_event_cursor` with the protocol 9 cutover. Server 8.4.0 cannot run against
that migrated schema. Recovery after the drop requires a forward fix on the new schema;
automatic activation rollback restores only the binary and does not restore the old contract.
The migration keeps Chat messages and read markers. No database backup is created by this release.

The nightly-dreaming release (migrations 0076–0078, App protocol 10) is an operator-approved
forward-only release. Migration 0076 lets a dream run have no Chat: `chat_id` may be null on
`agent_inbox`, `agent_run_triggers`, and `agent_runner_credentials`, and
`agent_delivery.active_run_chat_id` may be null. The previous Server assumes every one is set, so
rolling back past this release first requires resetting any Agent with an active chatless dream
run and retiring every unfinished `dream` inbox row (set `state = 'seen'`). The schema change
itself is additive and safe to leave in place.

The Cloud Agent work links release (migrations 0079–0080, Computer protocol 29, App protocol 11,
ADR 0044) is an
operator-approved forward-only release. Migration `0079_cloud_agent_work_links` adds
`cloud_agent_work_links`, renames `cloud_agent_work.message_id` to `launch_message_id`, and drops
the work's unique key and foreign keys to its Message, Chat, and Computer. It also rewrites every launch
Message from `body_kind = 'cloud-agent-work'` to `text` and appends the work's link to its
content. Migration `0080_message-body-drop-cloud-agent-work` then narrows the `chat_messages`
body kind check to `text` and `agent-created`. The previous Server reads `message_id` and expects
`cloud-agent-work` bodies, so it cannot run against the migrated schema. Rolling back restores
only the binary: the rewritten content, the dropped constraints, and the renamed column stay.
Recovery is a forward fix on the new schema.

Haus 14.0.0 is an operator-approved exception (2026-10-13): migration `0087_artifact-paths` drops
`artifacts.name`, so Server 12.0.0 and earlier cannot run on the migrated schema and recovery is a
forward fix; losing existing Artifacts is acceptable at this stage of the product.

The board Tasks release (migrations 0119–0121, Computer protocol 36, ADR 0051) is an
operator-approved forward-only release. Migration `0119_rename-tasks-to-claims` renames
`message_tasks` to `message_claims` and `chats.last_task_number` to `last_claim_number`, and
rewrites queued `task_assignment` inbox and trigger rows. Migration `0120_task-boards` adds boards
and Tasks, moves `composed` and `converted` claims onto each Server's General board, deletes those
claim rows, and translates their queued wakes. Migration `0121_drop-claim-priority-labels` drops
`message_claims.priority` and `message_claim_labels`. The previous Server reads `message_tasks`, so
it cannot run on the migrated schema: automatic activation rollback restores only the binary, and
recovery is a forward fix. Take a fresh [local backup](#backups) right before merging the release
PR. Computer must publish and verify first, and any Computer below protocol
36 stays idle until upgraded, so upgrade the Mac mini right after the deploy.

### Shipping Channels and Tasks (ADR 0053)

The Channels-and-Tasks release ([ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md))
runs migrations 0123–0128 (production's ledger is at 0122) and raises Computer protocol to 38 and
App protocol to 13. Migration 0126 moves every Thread's Messages into inline replies on its anchor
and deletes the Threads; 0127 converts legacy Tasks, posts a "Tracking KEY-n: title" origin
Message in `#all` for each worked Task no Channel Message links, and drops boards; 0128 removes the
Thread schema. Production had about 257 Threads and 1,350 messages at rehearsal time. It is
forward-only: the previous Server cannot run on the migrated schema, and activation rollback
restores only the binary.

On a copy of production the migrations took about 2 seconds and a production `pg_dump` of about
280 MB took about 2 minutes, so expect 5–10 minutes of downtime from stopping the Computers to the
new Server serving. Run it in this order:

1. **Computer artifact first.** Publish and verify the protocol 38 Computer artifact before the
   Server release, as for any protocol raise ([Releases](releases.md#prerequisites)).
2. **iPhone build on TestFlight.** A protocol 13 iPhone build must be processed on TestFlight
   ([iOS TestFlight](ios-testflight.md)) before the Server is promoted, because the new Server
   refuses older App protocols.
3. **Check production before migrating.** Against production, with the migration credential, run
   the read-only verifier and keep its snapshot:

   ```sh
   varlock run --include-internal -- \
     sh -c 'bun apps/server/scripts/verify-thread-migration.ts --database-url "$HAUS_DATABASE_MIGRATION_URL" --before thread-migration-before.json'
   ```

   Resolve everything it flags before going on. A soft-deleted Thread aborts migration 0126
   (`a soft-deleted Thread needs an operator decision first`), as does a Thread with no anchor
   Message in its parent; decide each one with the operator first.
4. **Stop and drain.** Stop every Computer after its local inbox store has drained (no run in
   flight and no pending notice queued), then stop the Server, so no delivery names a Thread
   while the migration moves its Messages.
5. **Take a database dump.** Run a fresh [local backup](#backups) right before merging the
   release PR; the nightly one is up to a day old.
6. **Deploy Server and web App together.** They are one artifact; merging the release PR runs the
   migrations on activation.
7. **Clear App caches.** Desktop and web App caches hold Thread-shaped data; clear them (or sign
   out and back in) on every client after the deploy.
8. **Verify after.** Run the verifier against the snapshot from step 3:

   ```sh
   varlock run --include-internal -- \
     sh -c 'bun apps/server/scripts/verify-thread-migration.ts --database-url "$HAUS_DATABASE_MIGRATION_URL" --after thread-migration-before.json'
   ```

   It checks the structural invariants, that every Channel or DM that received moved Messages
   reads as read for everyone who can read it, that unread elsewhere is unchanged, and that no
   queued inbox item names a moved Message. It exits 1 on any failure. 0127's Tracking posts
   (nonce `task-origin:*`) are not part of the Thread move, so the verifier leaves them out of the
   message total and unread and says how many it left out. A correct run ends like this, with
   every invariant `ok` and the counts of the day:

   ```text
   ok   total message count unchanged: N → N
   ok   zero thread chats: 0
   ...
   excluded 8 0127 Tracking posts (nonce task-origin:*) from the message total and unread
   unread: … reader/chat pairs; … affected chats … → 0 unread; 0 unaffected pairs changed (… unread kept); 0 queued inbox items left
   OK
   ```
9. **Upgrade the Mac mini Computer** right after the deploy; a Computer below protocol 38 stays
   idle until upgraded.

`apps/server/scripts/reverse-thread-migration.ts` is a dev-only tool that replays 0126's audit
tables backwards on a development database and refuses once 0128 has run. It is not a
production rollback. A failure after the migration is fixed forward on the new schema.

Migration 0064 keeps the physical `agents.personality` column for rollback to Server 7.1.0.
The current Server maps its conversation-style field onto that same column, so both versions
read and write the same value. The product API uses conversation style.

The retired `chat_reads.done_sequence` column remains solely for rollback to Server 5.0.0.
Migration 0054 deliberately keeps it and its values. Remove it in a new migration only after
Server 5.0.0 is outside the production rollback window; never reinstate the Done feature.

## Supervision and health

Colima owns PostgreSQL recovery through Compose `restart: unless-stopped`.
Replace the preserved login-scoped Colima LaunchAgent with the reviewed shared
system LaunchDaemon:

```bash
sudo /Users/zknicker/srv/haus/current/operations/install-colima-boot
```

The daemon runs the existing `ensure-colima.sh` profile as `zknicker` at boot
and every minute. The check exits immediately while Colima is healthy and
restarts the existing profile if it stops. Installing it persistently disables
and unloads only the duplicate user job; it does not stop Colima or restart
containers. If installation fails, the operation removes its partial daemon,
re-enables the preserved user job, and reloads it when a GUI session exists.
Roll back this shared host change independently with:

```bash
sudo /Users/zknicker/srv/haus/current/operations/rollback-colima-boot
```

Rollback returns Colima to login-scoped recovery. Because automatic login is
disabled, a cold boot then needs an interactive `zknicker` login before the
preserved LaunchAgent can start Colima. Do not couple this host-level rollback
to an ordinary Haus release rollback. The no-reboot installation check proves
the daemon can run the existing healthy profile, but full no-login boot recovery
remains unproven until the separately approved reboot drill.

Install the two plists in `apps/server/launchd/` as system daemons. The Server
and application Tunnel use `RunAtLoad` and `KeepAlive`. The Tunnel runs by its
stable UUID, `401d3f59-5e0a-43e8-bd1a-b29237e9cc74`, so its display name can change
without interrupting ingress. Tunnel
metrics bind to `127.0.0.1:20242`; the shared existing tunnel already owns
`20241`. Neither plist carries environment of its own: `run-server`
shell-sources the rendered `config/server.env` and executes the Server binary
directly, because a launchd job that re-entered Varlock would resolve the schema
again at boot under the development lifecycle.

Installing the Server plist does not load it before the next boot. Run the
initial deployment before rebooting so the privileged activation helper owns
the first bootstrap after `current` points at a verified release. It accepts
only the exact root-owned
`/Library/LaunchDaemons/com.haus.server.plist`. If first-release health fails,
the helper boots out the label it introduced before removing `current`, leaving
no `KeepAlive` loop against a missing release. If the label was already loaded,
the helper leaves `current` intact on failure because it cannot claim ownership
of stopping that label. Later activations retain the exact previous-release
rollback.

Server `/healthz` reports reminder and hosted MCP health. Connector recovery returns
`degraded`; unavailable PostgreSQL returns HTTP 503 with the redacted
`postgres_unavailable` code.

## Backups

The Server host keeps a local backup. Off-machine backup does not exist yet: a
lost or wiped mini loses its backups with it. The retired `restic` design
(`com.haus.backup`, the `_haus_backup` account, the restic repository and
password) is host state to remove, not a fallback.

The `com.haus.local-backup` LaunchDaemon runs `current/operations/backup-haus`
as `zknicker` every night at 03:30. Each run:

1. runs `pg_dump --format custom` inside `haus-postgres` as `haus_backup`, over
   the container's local socket, so no credential is stored and the dump tool
   always matches the server version
2. checks the dump's table of contents with `pg_restore --list`
3. archives the runner's `haus_runner_data` volume read-only beside the dump
   when that volume exists, using the PostgreSQL image already on the host;
   until the runner ships it logs `runner=absent`
4. publishes `backups/nightly/<UTC stamp>/` atomically, and hard-links the first
   backup of each ISO week into `backups/weekly/<year>-W<week>/`
5. keeps the newest 14 nightlies and 4 weeklies and deletes the rest

`backups/` is `zknicker`-owned, mode `0700`, outside `releases/`. Success is one
`haus-backup ok …` line in `logs/backup.log`; a failure names its step in
`logs/backup.error.log` and leaves no partial backup. A leftover
`backups/.lock` from a killed run blocks later runs until removed. The dump and
the volume archive are taken seconds apart, not in one snapshot.

Verify the latest backup restores:

```bash
/Users/zknicker/srv/haus/current/operations/verify-haus-backup
```

It restores the dump into a throwaway `haus_restore_check` database on the
same cluster as `haus_admin`, compares the restored table count with the dump,
reports the migration count, lists the runner archive, and drops the database.
Pass a backup directory to check an older one.

### Restore

Restoring replaces production data, so it needs the operator's explicit
approval. Stop the Computers and the Server, then:

```bash
backup=/Users/zknicker/srv/haus/backups/nightly/<stamp>
sudo launchctl bootout system/com.haus.server
docker exec haus-postgres dropdb -U haus_admin haus_production
docker exec haus-postgres createdb -U haus_admin -O haus_bootstrap haus_production
docker exec -i haus-postgres pg_restore -U haus_admin -d haus_production \
  --role haus_bootstrap --no-owner --exit-on-error <"$backup/haus.dump"
```

The dump carries the runtime and backup grants. Start the Server again with
`sudo launchctl bootstrap system /Library/LaunchDaemons/com.haus.server.plist`
and check `/healthz`. When `runner-data.tar.gz` is present,
restore it into `haus_runner_data` with the runner stopped:

```bash
docker run --rm --network none -v haus_runner_data:/data \
  -v "$backup":/backup:ro --entrypoint sh \
  "$(docker inspect --format '{{.Config.Image}}' haus-postgres)" \
  -c 'rm -rf /data/* && tar -xzf /backup/runner-data.tar.gz -C /data'
```

### Installing the job

The release artifact ships the plist and operations; releases never install
privileged launchd jobs. Install once per plist change, as the operator:

```bash
sudo /Users/zknicker/srv/haus/current/operations/install-local-backup --dry-run
sudo /Users/zknicker/srv/haus/current/operations/install-local-backup
/Users/zknicker/srv/haus/current/operations/backup-haus
/Users/zknicker/srv/haus/current/operations/verify-haus-backup
```

The installer creates `backups/`, installs the plist root-owned, and bootstraps
it; it refuses to overwrite a different installed plist. Add `backups` to the
deploy root's `.git/info/exclude`. Remove the job with
`sudo launchctl bootout system/com.haus.local-backup` and deleting
`/Library/LaunchDaemons/com.haus.local-backup.plist`; the backups stay.

## Manual cutover

Resolve and record every exact path, identity, database, Tunnel id, DNS route,
secret source, and rollback release before changing the host.

1. Initialize or fetch the Haus repository in place at
   `/Users/zknicker/srv/haus`. Add every host-only root named above to
   `.git/info/exclude`; preserve existing files and never use `git clean`. The
   deploy root must hold no `.env`.
2. Confirm the self-hosted runner can read this repository and invoke the
   `Deploy Haus Server` workflow. Do not grant it general root authority.
3. Verify the artifact checksum, host architecture, free loopback ports, and
   current service inventory.
4. Install approved PostgreSQL client and cloudflared versions without enabling
   a host PostgreSQL service.
5. Install shared system-boot Colima supervision; confirm that existing
   containers and volumes were not restarted or replaced.
6. Bring PostgreSQL up from the repository's `apps/server/compose.yml` under
   `varlock run`; create only the `haus` Compose project and named database
   volume.
7. Create the dedicated identities, `config/`, `data/`, `logs/`, and
   `releases/` permissions, plus the attachment sentinel. Grant each service
   identity traverse-only access to `/Users/zknicker` and
   `/Users/zknicker/srv` and verify those ancestors are not group- or
   world-writable.
8. Create the fresh database and least-privilege roles; run bootstrap once,
   grant backup reads, and store the runtime URL, migration URL, and container
   admin password in the `Postgres - Haus` Production 1Password item.
9. Own `config/` as `zknicker`, mode `0755`, so the deploy job can write
   `config/server.env` and `_haus_server` can traverse to it. That file is
   rendered by the deploy job, never by hand. Keep a protected copy of the
   pre-auth-cutover `config/server.env` on the host until the Cloudflare sign-in
   flow is proven live; it contains the old runtime contract needed if the old
   Server artifact must be restored.
10. Build the approved release once, then install its
    `bin/activate-haus-server` as root-owned mode `0755` at
    `/usr/local/libexec/haus/activate-haus-server`. Verify every path
    component named above is root-owned and not writable by `zknicker` or the
    deploy runner. Validate and install
    `host-services/haus-server-activation.sudoers` as root-owned mode `0440`;
    it names only that exact executable; the helper enforces the full-SHA
    argument contract. This is the runner's only NOPASSWD command. Install
    reviewed launchd plists separately; ordinary release workflows never update
    these privileged assets. The helper owns only the contained path switch,
    system-service restart, health check, and rollback. Reinstall it through
    this operator gate only when that narrow activation contract changes.
11. Before migration 0102 on a nonempty database, validate and stage the
    protected identity receipt on the old schema. It contains `userId`,
    `legacySubject`, `subject`, and `verifiedEmails`. Then dispatch the exact
    published Haus `vX.Y.Z`, its Server artifact `X.Y.Z`, and the release source
    SHA in `deploy` mode. This seeds
    the first immutable release through the same download, verification,
    install, helper-owned Server bootstrap, health, and rollback path used by
    later published releases.
12. Inject the Tunnel credential.
13. Create the named `haus-production` Tunnel and confirm its config routes
   only to `127.0.0.1:18791`.
14. Verify the helper-loaded Server through the local App, `/healthz`,
    authenticated API, and WebSocket.
15. Load the Tunnel, approve the `haus.chat` DNS route, then verify canonical
    sign-in, Server creation, and reopen from a remote client.
16. Reboot once and prove PostgreSQL, Server, Tunnel, and the canonical flow
    recovered.

Each step needs the operator's explicit approval before the corresponding
material host or Cloudflare change. Do not delete old state or overwrite a
database.

## Human auth schema cutover

Migration 0102 replaces the legacy external subject with the Cloudflare Access
subject and converts Computer login owners to canonical Haus User ids. It
preserves Haus User ids, Computer login ids, credential hashes, refresh
families, and the Computer protocol. The migration fails and rolls back as one
unit if any User or Computer login owner is unmapped. The small
`haus_auth_rollback_recovery` table keeps the old subject mapping; this cutover
does not use a bulk database copy.

Before migration, check and stage the exact protected receipt with the
migration credential:

```sh
varlock run --include-internal -- \
  bun apps/server/scripts/stage-cloudflare-identity.mjs --check <protected-receipt.json>
varlock run --include-internal -- \
  bun apps/server/scripts/stage-cloudflare-identity.mjs --stage <protected-receipt.json>
```

The receipt must match the existing Haus User and legacy subject and contain
the exact Cloudflare subject and verified-email aliases. These commands are
for the authorized production cutover only; ordinary deploys and tests do not
run them against production.

The previous Server artifact expects the columns removed by migration 0102.
An automatic artifact rollback alone cannot restore that schema. If migration
completes but candidate activation or health fails, keep Tunnel ingress
stopped and do not activate the previous artifact yet. First run the candidate
artifact's recovery SQL at:

```text
current/share/haus-server/recovery/0102_restore_legacy_auth.sql
```

If `current` already points to the previous release, use the same file under
the failed candidate's immutable `releases/<full-source-sha>/share/haus-server/recovery/`
directory. Run it with the migration credential against the same database.
The SQL is transactional and stops if any User or Computer login owner has no
recovery mapping. It also removes only migration 0102's exact Drizzle history
marker in that transaction, and refuses to run if any later migration marker
exists. Verify the old subjects, stable Haus User ids, Computer owners, and
credential hashes; restore the protected pre-cutover
`config/server.env`; activate the previous full-SHA artifact; verify local
health; then restore Tunnel ingress. Keep the recovery SQL and mapping table
until browser, native, Computer, and MCP checks pass.

## Rollback

Keep the previous full-SHA release and all state untouched. Activation switches
`current` atomically and restarts only `com.haus.server`. Its automatic failure
path changes the artifact pointer; it does not restore `config/server.env` or
reverse a database migration. After migration 0102, the old artifact cannot
serve the restored schema until the recovery procedure above has run. For a
schema-compatible release, a manual rollback selects an already installed
published version in the Actions workflow and uses `activate`; it never
rebuilds. If a wider cutover fails, stop Tunnel ingress or restore its
previously recorded route without changing application state.
Stop the database with `docker compose -p haus down` without `--volumes`;
preserve `haus_postgres_data`. Never roll back PostgreSQL
by deleting or overwriting its data. Keep shared system Colima supervision in
place unless the operator separately decides to restore login-scoped recovery.
Capture redacted service status and logs before changing anything further.
When the first activation has no previous release, failure instead boots out
the Server label introduced by that attempt before removing `current`. A
bootout failure leaves `current` on the failed release for diagnosis and
requires operator intervention. If the label was already loaded, failure also
leaves `current` intact because the helper did not introduce that label. Neither
path claims rollback or creates a missing-`current` restart loop.
