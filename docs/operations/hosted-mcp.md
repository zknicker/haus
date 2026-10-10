---
summary: Run the isolated Skool MCP prototype, provision private accounts, and verify Agent access.
read_when:
  - running or extending Haus-hosted MCP services
  - provisioning a private Skool account
  - changing hosted MCP worker limits or account isolation
---

# Hosted MCP prototype

`apps/hosted-mcp` is an independent Python service incubated in this repository.
Haus Server reaches its standard Streamable HTTP endpoint through the existing
Connections credential broker and Agent grants. Computer receives schemas and
results through Server, never the bearer token or native Skool session.

Each connection authenticates one Skool account, not a community. The account's
joined and owned communities are discovered through `skool_list_communities`.
Other tools accept a `community_slug` and recheck current account membership on
every read. A community such as Merch Mastermind is content within an account,
never an integration preset or connection identity.

The MVP exposes nine read-only Skool tools for communities, posts, search, comments,
classroom, courses, calendar, and available native video captions. It excludes writes, direct
messages, raw requests, vault access, and self-update. Catknows is pinned to commit
`3a4c3f0aad3d66f9f3e5721505766a8d731c4cc1`; Python dependencies have a frozen `uv.lock`.
No paid transcript API is configured. External YouTube embeds are unsupported.
Caption availability still needs a live video fixture.

## Local trial

Prerequisites: repository Bun version, `uv`, Python 3.12 installed through uv,
and the existing Haus development environment. Run from the repository root:

```bash
bun run hosted-mcp setup
bun run hosted-mcp browser
bun run hosted-mcp test

# Reserve the second port in this checkout's dev-port group.
skool_port=$(dev-port 1)
bun run hosted-mcp login --key skool \
  --profile "$HOME/.local/share/haus-hosted-mcp/skool-profile" --port "$skool_port"
bun run hosted-mcp serve --port "$skool_port"
```

Login opens Chromium for the operator to sign in. A previously authenticated
profile can use `--headless`. The service itself never launches Chromium; workers
load the saved native HTTP session. Expired sessions require operator reconnection.

For desktop onboarding, no operator login command is required. Start the service
first, then the desktop dev stack in another terminal:

```bash
bun run dev-app
```

Open Settings → Connections → Recommended → Skool → Sign in to Skool.
The app opens an isolated, temporary browser tab at Skool's login page. Credentials
are entered directly into Skool. After sign-in, the main process reads Skool's
HttpOnly session cookie and WAF token. The authenticated App sends that session
once to Server; Server checks Owner/Admin permission and provisions a fresh account
through the service's control-authenticated `/accounts` endpoint. Provisioning
verifies a community read before issuing an internal connection token. Only Server
stores that token. Success closes the login tab and returns to Connections. Closing
the tab cancels; login times out after three minutes. On web, setup only displays
a notice to use the desktop app. No session is captured from other browser tabs.

Choose the Agent in Server Settings → Connections → Skool → Agent Access.
The hosted connection remains usable without the desktop app running. Session
expiry requires desktop reconnection; background renewal is not implemented.
Email/password sign-in is the baseline; Google/Apple SSO in the embedded browser
needs live verification and may be blocked by the identity provider.

Operator-provisioned accounts remain useful for explicit live smoke and Agent tests:

```bash
bun run hosted-mcp smoke "$HOME/.local/share/haus-hosted-mcp/skool-connection.json"
bunx varlock run -- bun run test:agents --only hosted-skool-lookup --include-opt-in --lanes 1
```

Ask it to list your communities, read a recent post with a source link, or search a
chosen community. The opt-in test discovers a readable community and post from
the connected account, creates a disposable Agent,
grants a temporary connection, verifies an exact private post title and URL plus
a service invocation, and removes its test Agent and connection. Live smoke
accepts `--community <slug>` to select a particular joined community for its read
checks; the slug is a test input, not connection configuration.

The preset endpoint is Server-owned `HAUS_SKOOL_MCP_URL`; the dev stack derives it
from the worktree's second port. Production leaves it unset until the HTTPS service
is deployed. Clicking Skool does not create a connection until sign-in succeeds.
The control token lives in a separate private file and authenticates provisioning,
not Agent reads. Local service startup creates it; the dev stack reads it at boot.

For scripted operator setup, `bun run hosted-mcp:connect` adds a custom connection
without going through the built-in setup experience. Provision another account with
another `--key` and a separate `--profile`. Pass
that account's credential file to `bun run hosted-mcp:connect /absolute/file.json`.
The command records connection IDs by Haus Server in that private file, so two
Skool accounts using the same endpoint do not replace each other's credentials.

The operator credential file contains the HTTP URL and Authorization header.
It can also be entered through the existing custom MCP connection form. Do not
paste it into a chat. Files live outside Git under
`~/.local/share/haus-hosted-mcp`, with account and credential files mode `0600`.
Native sessions live in `accounts/<key>.json`, separate from connection tokens.
Use `--root /absolute/private/path` on login, serve, or revoke for another store.
The Skool browser profile is also sensitive and must remain outside the repository.

To revoke service credentials and stop account workers:

```bash
bun run hosted-mcp revoke --key skool
```

Revocation rejects new requests immediately and kills active workers within five
seconds. Revoke, then run login and the connect command to reconnect. Removing
the connection or its grants in Haus stops Agent access; it does not delete the
service's native session or browser profile. Delete those separately when retiring
the account permanently.

## Resource and isolation contract

Discovery authenticates and lists static schemas without starting a worker.
The default pool holds at most two workers across all provisioned accounts, with
one active call per account. Calls reuse a worker for that account; idle workers
expire after 60 seconds or are evicted for another account when capacity is full.
Busy accounts and a fully busy pool return retryable tool errors without a queue.
`--workers` and `--idle-seconds` tune these limits.

Calls have a 25-second deadline, requests a 64 KiB body limit, and results a
400,000-byte limit, leaving room for MCP text-block escaping beneath Computer's
1 MiB result limit. Timeout, cancellation, revocation, malformed output, and service
shutdown reap the worker process group. A worker never switches account credentials.
The bearer token selects the account; tools cannot supply another account.
Community selection is limited to current account membership. Post and course
reads also check membership in the selected community.

Authenticated `GET /status` returns aggregate pool counts, call counts, and starts.
Public `GET /healthz` returns readiness only. Diagnostics discard worker stderr;
HTTP access logging is disabled. Live smoke output prints counts, not private content.
The Agent test report contains the requested private post summary, so keep its
ignored `.context/agent-tests` artifacts private.

These are process and request limits, not hard RAM or CPU limits. Workers share
the service's Unix identity and are not a sandbox for hostile connector code.
Use container memory/CPU limits and pinned audited connector images for a hosted
deployment. Runtime memory depends on response size and the connector.

## Before a public rollout

This service binds loopback for a local trial. A remote Haus Server cannot reach
your laptop's loopback. Deployment needs a private HTTPS endpoint accessible to
Server, a supervised service, secure credential storage and rotation, and host
resource limits. Production integration secrets must follow the existing
[environment policy](environment.md), not this local credential-file prototype.

Desktop provisioning follows existing Server Owner/Admin connection rules, with
one fresh account per completed sign-in. Personal member-owned connections,
automatic service-side session deletion on Haus disconnect, production credential
encryption, and background renewal remain rollout work. The service supports distinct
accounts with the same tools and endpoint; this is still a local MVP.
Upstream upgrades are deliberate pin changes followed by the deterministic suite,
live private read smoke, and opt-in Agent test.
