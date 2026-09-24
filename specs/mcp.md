---
summary: Normative product contract for Server-owned remote MCP connections, credentials, discovery, and Agent access.
read_when:
  - changing Connections settings or Agent Tools
  - changing MCP storage, auth, client lifecycle, or invocation
---

# MCP connections

## Product model

- A connection identifies one remote HTTP MCP server account on one Haus Server.
- Haus Server owns its endpoint, credentials, OAuth state, discovered tools, client sessions,
  and invocation.
- Connections support no auth, secret headers, or MCP OAuth. Remote endpoints require HTTPS;
  loopback HTTP exists only for development.
- Haus does not support local or stdio MCP connections.
- Google Calendar, MerchBase, and RankWrangler presets populate immutable URL and auth defaults, then use the
  same storage, discovery, OAuth, grant, and invocation path as custom connections.
- Multiple connections may target the same MCP server or preset.
- Recommended lists only presets with no existing account, connected or disconnected. Additional
  accounts are added from a connection's detail; deleting the last account restores its preset.
- Disconnect clears the active identity, tokens, inventory, and Agent grants. It preserves
  reusable client registration and operator-approved authorization origins. All connections,
  including preset accounts, may be deleted; deletion also removes their stored secrets and grants.

## Agent access

RankWrangler also supplies App product previews through a narrow, member-authorized
Server read API. This invokes only product `get` at its fixed hosted
endpoint. It does not expose generic MCP invocation to humans or grant an Agent
access. A connected account gates previews; each request rechecks membership and
connection state before reading the account-scoped cache.

- A grant is `(server_id, agent_id, connection_id)` and enables every tool currently exposed by
  that connection.
- Tool discovery changes the read-only tool list; it does not create a second grant layer.
- Server rechecks the connection grant before every upstream call.
- Computer receives only safe names, descriptions, and input schemas for granted tools.
- Computer sends invocation through its scoped per-run Server credential. MCP credentials and
  upstream sessions never enter Computer, Agent prompts, or tool arguments.
- An unavailable MCP connection does not prevent an Agent from starting. Its tools are omitted
  until Server can rediscover the connection.
- Server discovers granted connections concurrently with a five-second deadline per connection.
  One slow or unavailable connection cannot hide healthy connections or hold Agent startup open.
- Server resolves invocation authority from the current grant and cached inventory before making
  one upstream call with a 30-second deadline.
- Runner errors preserve whether access was denied or revoked, the upstream account needs
  reauthorization, the upstream timed out, or the upstream is unavailable.

## OAuth and secrets

- PostgreSQL stores MCP secrets in a Server-only table that is never returned by tRPC.
- OAuth uses protected-resource and authorization-server metadata, PKCE, refresh tokens, and DCR
  through AI SDK. Custom connections may use pre-registered client credentials and scopes.
- Server creates and retains PKCE state, handles the hosted callback, exchanges the code, refreshes
  tokens, and persists authorization-server trust.
- A different authorization-server origin requires explicit operator confirmation.
- Google Calendar uses configured Server environment credentials because Google does not offer
  DCR. MerchBase uses Clerk DCR.
- Public reads expose header names, never values.

## Operations

- MCP uses bounded pagination, rejects cursor cycles, and caps discovery at 1,000 tools.
- Clients are pooled by connection and closed on identity, credential, disconnect, or Server
  lifecycle changes.
- Invocation is authorized by the scoped runner identity plus the current Server grant.
- `connected` means the Server retains an active connection identity; it is not transient upstream
  health. Request failures do not disconnect an account or erase grants.

## Agent execution

Computer registers one fixed `execute` tool in every new Agent session, including Agents with no
MCP grants. Headless Executor (`@executor-js/runtime-quickjs`) runs its JavaScript in a disposable
QuickJS child process. Haus supplies `tools.search({query})`, `tools.describe({name})`, and
`tools.call({name,args})`; each must be awaited. Search and schema lookup read current Server grants,
and invocation uses the same authenticated Server authority as ordinary MCP calls. The harness
schema and description never contain the changing connection inventory.

Server is the MCP client, so it picks one form of every tool result instead of forwarding both. A
result carrying `structuredContent` reaches the Agent without the text block that duplicates it as
serialized JSON; non-text content blocks and `isError` results arrive exactly as the upstream sent
them, so an error keeps its message.

Grants, revocations, new tools, and temporary outages do not change the harness catalog or reset
its session. Search returns up to 50 matches plus the total; the Agent narrows its query when needed.
Generated JavaScript has no runner token, MCP credentials, host environment, network, filesystem,
or persistent state. Computer embeds the worker and WASM in its standalone executable; no Executor
Cloud, additional service, database, or dashboard is required.

Each execution is limited to 60 seconds, 50 dispatches, 64 KiB of code, 1 MiB per protocol message,
64 MiB of QuickJS memory, and five seconds of uninterrupted CPU work. Computer also bounds Server
response bodies to 1 MiB. Stop kills the child and explicitly requests cancellation of pending MCP
operations through Server. Network loss may prevent acknowledgment, and cancellation cannot undo
upstream work already performed. Cancelling one request does not retire the shared MCP client used
by another Agent.

Protocol 20 requires the fixed Executor tool and cancellable MCP request contract. Publish and verify
the compatible Computer before Server promotion; older Computers remain in update-required mode. Deployment requires a one-time operator reset of existing Agent sessions to install `execute`.
Computer does not silently reset or attempt to migrate old tool catalogs. Subsequent MCP access
changes require no reset. The Computer release check runs the embedded worker and a round-trip
host call before the artifact can ship.
