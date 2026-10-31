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
- GitHub, Google Calendar, MerchBase, MerchBase Atlas, MerchBase Fulfillment, Trademark Terminal, RankWrangler, Factory, Kittl, X, and CoinGecko presets populate immutable URL and auth
  defaults, then use the same storage, discovery, OAuth, grant, and invocation path as custom
  connections.
- CoinGecko uses `https://mcp.api.coingecko.com/sse` with no authentication. Adding it
  discovers tools immediately, requires no API key, and uses the upstream shared free rate limits.
  It uses the vendor-supported SSE transport because the current HTTP client loses its session
  when CoinGecko rejects the optional inbound event stream. Return to `/mcp` after HTTP discovery
  and repeated tool calls preserve the session with the shipped client.
- Kittl uses `https://mcp.kittl.com/mcp` with MCP OAuth discovery and dynamic client
  registration, without packaged client credentials or preset scopes.
- Each preset has one auth kind. OAuth presets sign in through MCP OAuth. Bearer-token presets (Factory, X)
  take the Server Owner's own static token at creation; Server stores it as an
  `Authorization: Bearer` secret header. Only `mcp.replacePresetToken` changes it; generic header
  edits are rejected so the header shape stays Server-owned. Disconnect clears the token.
- Multiple connections may target the same MCP server or preset.
- Service branding is independent of account identity. Presets resolve their icons before sign-in
  through the same policy used after adding an account. Disconnect and sign-in preserve branding;
  failed artwork refreshes retain the last valid image. Icons resolve at write time; connection
  reads never fetch. Existing presets with missing icons recover branding through a background
  repair after Server startup.
- Recommended lists only presets with no existing account, connected or disconnected. Additional
  accounts are added from a connection's detail; deleting the last account restores its preset.
- Disconnect clears the active identity, tokens, inventory, and Agent grants. It preserves
  reusable client registration and operator-approved authorization origins. All connections,
  including preset accounts, may be deleted; deletion also removes their stored secrets and grants.
  Deleting a GitHub connection first tombstones its installations and degrades their Triggers in
  the same transaction ([removal](github-app-connection.md#removal-and-deletion)).

## Agent access

RankWrangler also supplies App product previews through a narrow, member-authorized
Server read API. This invokes only product `get` at its fixed hosted
endpoint. It does not expose generic MCP invocation to humans or grant an Agent
access. A connected account gates previews; each request rechecks membership and
connection state before reading the account-scoped cache.

- A grant is `(server_id, agent_id, connection_id)` and enables every tool currently exposed by
  that connection, including tools added later.
- Tool discovery changes the read-only tool list; it does not create a second grant layer.
- Server rechecks the connection grant before every upstream call.
- Computer receives only safe names, descriptions, and input schemas for granted tools.
- Computer sends invocation through its scoped per-run Server credential. MCP credentials and
  upstream sessions never enter Computer, Agent prompts, or tool arguments.
- Server owns discovery independently of Agent activity and grants. Startup loads connected
  accounts, notifications refresh changed catalogs, and a jittered five-minute reconciliation
  recovers missing notifications and legacy servers. Failures back off up to fifteen minutes.
- A successful full discovery replaces the catalog, including removed tools and empty lists.
  Failed discovery retains the last successful catalog. Changes publish the connection event.
- Agent searches read current grants and Server's discovered definitions without contacting MCP.
  An unavailable connection cannot hold Agent startup open; undiscovered connections contribute
  no tools, and known definitions remain available during an outage.
- Server resolves invocation from upstream definitions, never from the saved display names, and
  rechecks the grant after discovery immediately before dispatch, with a 30-second deadline.
- Runner errors preserve whether access was denied or revoked, the upstream account needs
  reauthorization, the upstream timed out, or the upstream is unavailable.

## OAuth and secrets

- PostgreSQL stores MCP secrets in a Server-only table that is never returned by tRPC.
- OAuth uses protected-resource and authorization-server metadata, PKCE, refresh tokens, and DCR
  through the official MCP TypeScript client SDK. Custom connections may use pre-registered client credentials and scopes.
- Server creates and retains PKCE state, handles the hosted callback, exchanges the code, refreshes
  tokens, and persists authorization-server trust.
- A different authorization-server origin requires explicit operator confirmation.
- Google Calendar and GitHub use configured Server environment credentials because neither offers
  DCR. GitHub's client is the Haus GitHub App's ([ADR 0045](../docs/adr/0045-github-is-a-built-in-connection.md))
  with the haus.chat callback. It sends no scope, because a GitHub App has permissions instead,
  and issues expiring user tokens that Server refreshes with the client secret. GitHub is the one
  built-in connection: beyond this MCP path it binds App installations and feeds `github`
  Triggers ([GitHub App connection](github-app-connection.md)). MerchBase, MerchBase Atlas, and MerchBase Fulfillment use Cloudflare Access OAuth dynamic client registration.
  Atlas uses `https://atlas.merchbase.co/mcp` with `openid profile email` scopes.
  Fulfillment uses `https://fulfillment.merchbase.co/mcp/printful` with the identity scopes
  `openid profile email`; Printful store linking is a separate upstream tool flow.
- X's hosted MCP (`https://api.x.com/mcp`) offers no OAuth discovery. Its preset uses an app-only
  Bearer token from the owner's X developer app: read-only, billed to that app's credits. Haus
  ships no X app or credentials of its own.
- Factory (`https://factory.merchbase.co/mcp`) issues no keys. Under MerchBase Auth, each caller
  authenticates with the owner's Merchbase API Key, created in the Account Center at
  `https://merchbase.co/account/api-keys` and sent as `Authorization: Bearer <key>` over
  Streamable HTTP. Factory records the agent under that key; Haus stores only the header.
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

Only humans add MCP servers. An Agent's MCP access is exactly the Server connections an Owner or
Admin granted it, reached through `execute`; runtime-local MCP configuration is ignored, so an Agent
cannot give itself servers by editing its execution runtime's config (`claude mcp add`,
`codex mcp add`, `grok mcp add`, `.mcp.json`, and the like). Each runtime enforces this at launch,
outside any file the Agent can edit:

- Claude Code runs with `strictMcpConfig` (Haus's harness bridge patch): only the servers Haus
  passes load, never user, project, plugin, or agent-frontmatter MCP config. The Agent home keeps its
  own Claude Code state file, never a link to the operator's `~/.claude.json`
  ([Context Management](../docs/features/context-management.md)).
- Codex: Haus's codex-acp patch disables, per thread and title thread, every server Codex's config
  layers declare (`$CODEX_HOME/config.toml`, project `.codex/config.toml`). Launch config also sets
  `features.apps = false` and `features.plugins = false`, so ChatGPT apps (the operator's
  connectors, served as `codex_apps`) and plugin MCP servers never load. Codex merges same-named
  server entries field by field, so an Agent that declares Haus's reserved server name
  (`ai-sdk-harness-tools`) in its Codex config can break its own Codex session.
- Pi loads no filesystem extensions, so it has no MCP source besides Haus.
- Grok Build launches with its Claude Code, Cursor, Codex, and xAI-managed MCP sources off. Known
  gap: the Grok CLI has no per-process switch for its own `$GROK_HOME/config.toml`, trusted
  project, or plugin MCP servers, so a server an Agent adds there loads in its next Grok session.

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
