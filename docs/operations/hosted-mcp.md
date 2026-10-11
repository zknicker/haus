---
summary: Run and verify Server-owned hosted MCP connectors, including Skool desktop provisioning.
read_when:
  - running or extending Haus-hosted MCP connectors
  - provisioning a private Skool account
  - changing hosted MCP worker limits or account isolation
  - packaging hosted MCPs in a Server release
---

# Server-hosted MCPs

Haus Server owns connector startup, private transport, supervision, credentials,
and shutdown. Connectors have independent language packages and processes but
ship in the Server release. The process contract lives in
[ADR 0042](../adr/0042-server-owns-hosted-mcp-processes.md).

Skool's Python package is `apps/hosted-mcp`; Server supervision is under
`apps/server/src/hosted-mcp`. `bun run dev` prepares the frozen Python runtime
and starts Skool through Haus Server. No separate service command, endpoint,
or provisioning token is needed for desktop onboarding.

## Sign in

Open desktop Settings → Connections → Skool. Credentials go directly into Skool
in an isolated temporary browser tab. Haus captures only that tab's native session.
The authenticated App sends the session to Server, which checks Owner/Admin access
and provisions an account over the private connector socket. The connector verifies
an account community read before issuing its connection bearer token. Server stores
that token; App, Computer, and Agents never receive it.

Each connection represents an account. Joined and owned communities are content
inside that account, selected by `community_slug` and rechecked on each read.
After sign-in, choose Agent access in the connection settings. Hosted reads work
while desktop is closed. Closing the login tab cancels; login expires after three
minutes. Web setup requires desktop. Email/password is the baseline; embedded
Google/Apple SSO still requires provider-specific live verification.

Native Skool sessions expire and require desktop reconnection. Removing a Haus
connection removes its grants and Server credential; connector-side native account
retention and automatic renewal remain separate work.

## Process and storage

Production bundles CPython 3.12.12 and the `uv.lock` dependencies beside connector
source in `share/haus-server/hosted-mcp/skool`. Server publication runs on Apple
Silicon macOS and validates the relocated runtime with private MCP discovery and
provisioning. Hosts install no Python or dependencies at startup.

Persistent account records live under `HAUS_ATTACHMENT_ROOT/.hosted-mcp/skool/accounts`,
outside immutable releases. They use mode 0600 in mode-0700 directories. The existing
Server storage backup must include this private subtree. Socket directories and
per-process control credentials are temporary; restarting or updating Server retains
account sessions and bearer-token hashes.

Initial connector readiness is required before Server listens. Server probes every
five seconds with a two-second deadline. Exit or failed health restarts only that
connector, with delay growing from one to thirty seconds. `/healthz` exposes
`hostedMcps` readiness and restart counts and reports degraded status during recovery.
Startup logs identify ready connectors; Server telemetry carries lifecycle and
request outcomes without credentials or bodies.

Skool lists nine read-only tools without starting an account worker. Its pool starts
workers on demand, holds at most two, serializes calls per account, and evicts idle
workers after sixty seconds. Busy capacity returns a retryable error rather than
queuing. Calls have a 25-second deadline, requests a 64-KiB limit, and results a
400,000-byte limit. Timeout, cancellation, revocation, and shutdown reap workers and
their descendants. These are process/request bounds, not an OS memory sandbox.

## Verification

```sh
bun run hosted-mcp test
node scripts/package-hosted-mcp.mjs .context/hosted-mcp/skool
bun test apps/server/src/hosted-mcp/supervisor.test.ts
```

Packaging verifies imports, readiness, all nine tool schemas through the actual MCP
client, and authenticated provisioning validation without contacting Skool. The
supervisor suite checks crash recovery, partial-startup cleanup, and shutdown.
A real desktop sign-in and authorized private read remain the live-account proof.

The standalone `hosted-mcp login`, `serve`, `smoke`, and `revoke` commands remain
operator tools for isolated connector trials. Their loopback ports and private token
files do not configure the built-in Haus connection.
