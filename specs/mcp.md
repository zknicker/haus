---
summary: Normative product contract for Server-owned remote MCP connections, credentials, discovery, and Agent access through the runner's execute tool, plus agent-browser relayed from the Agent's machine behind execute. User-configured local MCP servers are descoped.
read_when:
  - changing Connections settings or Agent Tools
  - changing MCP storage, auth, client lifecycle, or invocation
  - changing execute, its catalog, or its limits
  - changing agent-browser for Agents, or proposing local or stdio MCP servers
---

# MCP connections

## Product model

- A connection identifies one remote HTTP MCP server account on one Haus Server.
- Haus Server owns its endpoint, credentials, OAuth state, discovered tools, client sessions,
  and invocation.
- Connections support no auth, secret headers, or MCP OAuth. Remote endpoints require HTTPS and
  block private, loopback, link-local, CGNAT, and unspecified-range targets by default, checked
  against both the literal host and every DNS-resolved address, with redirects re-checked on each
  hop. `HAUS_MCP_ALLOW_PRIVATE_NETWORKS` is an operator-only env var that lifts this for
  self-hosted or local-dev Servers.
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
- Explore connections lists only presets with no existing account, connected or disconnected. Additional
  accounts are added from a connection's detail; deleting the last account restores its preset.
- Disconnect clears the active identity, tokens, inventory, and Agent grants. It preserves
  reusable client registration and operator-approved authorization origins. All connections,
  including preset accounts, may be deleted; deletion also removes their stored secrets and grants.
  Disconnect and deletion are the only paths that remove grants. Signing in again, replacing
  headers or a preset token, and reconnecting Skool keep every grant, including when the new
  credentials belong to a different upstream account: grants follow the connection, and the Owner
  or Admin who signs in chooses the account. Starting an OAuth sign-in changes nothing until its
  callback completes; an abandoned sign-in leaves the connection working on its old tokens.
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
- An Owner or Admin changes grants in the App. An Agent changes them only when an Owner or Admin
  made it a connection admin (`agents.connection_admin`, human-set only); it may then grant or
  revoke any Agent's access, its own included, through `haus connection`, and nothing else about
  connections. Both paths share one transactional grant write and differ only in authorization;
  each Agent-made change is logged by id.
- Tool discovery changes the read-only tool list; it does not create a second grant layer.
- Server rechecks the connection grant before every upstream call.
- The runner receives only safe names, descriptions, and input schemas for granted tools.
- The runner sends invocation through the run's scoped Server credential. MCP credentials and
  upstream sessions never enter the runner, a Computer, Agent prompts, or tool arguments.
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
  health. Request failures do not disconnect an account or erase grants. The exception is lost
  identity: an OAuth connection whose discovery or invocation needs reauthorization and whose
  stored tokens are gone (the provider rejected the refresh) becomes `connected: false` and shows
  Sign in required. Its grants stay stored, contribute no tools while it is signed out, and apply
  again when sign-in completes.

## Agent execution

The runner registers one fixed `execute` tool in every new Agent session, including Agents with
no MCP grants ([runtime-drivers.md](runtime-drivers.md#execute)). Headless Executor
(`@executor-js/runtime-quickjs`) runs its JavaScript in a disposable QuickJS child process on the
runner. Haus supplies `tools.search({query})`, `tools.describe({name})`, and
`tools.call({name,args})`; each must be awaited. Search and schema lookup read current Server
grants, and invocation uses the run's Server credential, the same authority as ordinary MCP
calls. Each `tools.call` is a dispatch with its own id, recorded as accepted on the runner and on
the Server before upstream is called, and never sent upstream twice
([runtime-drivers.md](runtime-drivers.md#mcp-calls)). The harness schema and description never contain the changing connection inventory.

Only humans add MCP servers. An Agent's MCP access is exactly the Server connections an Owner or
Admin granted it, reached through `execute`. Neither harness reads MCP configuration the Agent can
edit:

- The Claude Agent SDK runs with `strictMcpConfig` and the in-process `haus` server as its only
  MCP server, and loads no settings source, so no user, project, plugin, or agent-frontmatter MCP
  config exists for it.
- Pi Durable has no MCP client. Its only tools are the ones Haus registers.
- The Agent's machine runs no harness, so `claude mcp add`, `.mcp.json`, and similar files there
  configure nothing for the Agent.

Workers run native harnesses on machines, and the Workers contract (W1) owns what MCP they load.

Server is the MCP client, so it picks one form of every tool result instead of forwarding both. A
result carrying `structuredContent` reaches the Agent without the text block that duplicates it as
serialized JSON; non-text content blocks and `isError` results arrive exactly as the upstream sent
them, so an error keeps its message.

Grants, revocations, new tools, and temporary outages do not change the harness catalog or reset
its session. Search returns up to 50 matches plus the total; the Agent narrows its query when needed.
Generated JavaScript has no run credential, MCP credentials, host environment, network,
filesystem, or persistent state. The runner bundles the worker and WASM; no Executor Cloud,
additional service, database, or dashboard is required.

Each execution is limited to 60 seconds, 50 dispatches, 64 KiB of code, 1 MiB per protocol message,
64 MiB of QuickJS memory, and five seconds of uninterrupted CPU work. The runner also bounds
Server response bodies to 1 MiB. Stop kills the child and explicitly requests cancellation of
pending MCP operations and open invocations through Server. Network loss may prevent
acknowledgment, and cancellation cannot undo upstream work already performed. Cancelling one
request does not retire the shared MCP client used by another Agent.

R3 moves `execute` from the Computer to the runner, and R4 deletes the Computer's copy. The
release check that runs the embedded worker and a round-trip host call moves to the runner
artifact. The tool's name, schema, and description stay the same, and R4's cutover starts every
Agent on a fresh runner session ([runtime-drivers.md](runtime-drivers.md#cutover)).

## Agent browser

agent-browser is built in and managed by Haus. It runs on the Agent's machine against the Chrome
that the Computer's Browser settings select, and the Agent reaches it through `execute` as the
built-in `browser` tool. `browser` appears in `tools.search` and `tools.describe` beside the
granted MCP tools and needs no grant.

- Its input is today's: `{ args: string[] }`, an agent-browser page command such as
  `["tab","new","https://example.com"]`, `["snapshot","-i"]`, or `["click","@e1"]`.
- The Computer checks the same command allowlist before running it. Connection overrides and
  browser-wide lifecycle commands are refused.
- Each call is one invocation of kind `browser`
  ([runtime-drivers.md](runtime-drivers.md#invocations)), with the invocation's id, ledger,
  outcomes, and 60-second timeout. An offline machine answers `offline` at once, and the
  `tools.call` promise rejects with that outcome.
- A Computer runs one browser command at a time across its Agents, as its command queue does
  today. Agents share the signed-in browser and keep to their own tabs.
- A screenshot or PDF is written on the machine, and the result names its path. The Agent views
  it with its edit tool's `view` or `view_image`.

The separate `browser` host tool and the Computer's host-tool MCP server are deleted in R4.
Browser settings stay a Computer setting carried by `browser-request` and `browser-result`.

agent-desktop is the second built-in, `desktop`, relayed the same way as a `desktop` invocation
and gated by the Device's Computer use setting and a per-chat approval
([Computer use](computer-use.md)).

## Local MCP

User-configured local MCP servers are descoped
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 11).
Haus runs no stdio or local MCP server for an Agent, and the Agent cannot add one. If they
return, they follow Capy: a launch recipe in Project settings, run on the working machine as an
invocation, with availability shown per Computer.
