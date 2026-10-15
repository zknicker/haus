---
summary: Run and verify Server-owned hosted MCP connectors, including Skool desktop provisioning and the stateless Linear connector.
read_when:
  - running or extending Haus-hosted MCP connectors
  - changing the Linear connector, its tools, or its per-request `_meta`
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

Skool lists ten read-only tools without starting an account worker. Its pool starts
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
bun test --cwd apps/hosted-mcp-linear
node scripts/package-hosted-mcp.mjs linear .context/hosted-mcp/linear
```

Skool packaging verifies imports, readiness, all ten tool schemas through the actual MCP
client, and authenticated provisioning validation without contacting Skool. The
supervisor suite checks crash recovery, partial-startup cleanup, and shutdown.
A real desktop sign-in and authorized private read remain the live-account proof.

The Linear suite runs every tool against recorded GraphQL fixtures, with no token.
Linear packaging compiles the binary, starts it under real supervision, and checks
discovery of every contract tool through the MCP client. It also checks that a call
without actor `_meta` is refused. Live calls for every tool against the Haus Dev app
remain the live proof.

## Linear

`apps/hosted-mcp-linear` is the Linear connector ([Linear app](../../specs/linear-app.md)):
a TypeScript package compiled with `bun build --compile` into one binary at
`share/haus-server/hosted-mcp/linear/bin/hosted-mcp-linear`. It is a stateless executor.
It keeps no storage, credentials, refresh logic, or per-connection state, and it never
chooses an actor. It serves stateless MCP Streamable HTTP with JSON responses on the
private socket, plus `/healthz`.

Every `tools/call` carries `_meta["chat.haus/linear"]`, validated by
`linearCallMetaSchema` (`@haus/api/linear-actor-meta`). It holds the chosen actor's
access token, the actor and its attribution, the ledger request id and `idSeed`, the
deadline, and the tool's extras (`delegation`, `session`, `upload`, `self`). A call
without valid `_meta` is refused before Linear, and the refusal never echoes it. The
connector logs nothing. Its result `_meta` reports each mutation for the write ledger,
and the Server strips it before Computer sees the result.

Creates pass `id = linearClientEntityId(idSeed, opIndex)`. A resend with the same request
id derives the same ids, so Linear's "already exists" counts as success after the entity
is read back. Errors lead with the spec's codes. A Linear `401` is `linear_token_rejected`,
which the Server answers with one forced refresh and an idempotent resend. The deadline
aborts in-flight requests and reports the mutations that already landed.

`upload_image` fetches the frozen artifact revision from the Server's signed
`/api/linear/artifact/:token` route. It runs Linear's `fileUpload`, `PUT`s the bytes
server-side, and embeds the asset in a comment. The Server's
`apps/server/src/linear/signed-urls.ts` checks the artifact and mints that URL, along
with the avatar URL behind `displayIconUrl`.

## Classroom lessons

Use `skool_get_classroom` to discover a course, `skool_get_course` for its tree,
then `skool_get_lesson` with the course id and a module's lesson id. A classroom
folder is a `set`, not a course id. The lesson reader rechecks community, course,
lesson, and parent-folder access. It returns lesson text, resource file/link
metadata, and available native-video captions with timestamped cues. Resource
file ids are metadata, not download URLs; the reader does not download files.

Course trees omit playback details. The reader fetches the selected lesson page
for a fresh signed Mux playback token, then reads the subtitle playlist and WebVTT
segments using Skool's Referer. Playback tokens and raw page/account records never
enter results. `transcript_status` is `available`, `no_captions`, `external_video`,
or `no_video`. Missing/mismatched playback details and failed caption reads remain
errors; they do not mean captions are absent. External video transcription is
unsupported. `skool_get_video_transcript` remains the community-post reader.

The standalone `hosted-mcp login`, `serve`, `smoke`, and `revoke` commands remain
operator tools for isolated connector trials. Their loopback ports and private token
files do not configure the built-in Haus connection.
