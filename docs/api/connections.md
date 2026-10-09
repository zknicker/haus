---
summary: Server tRPC and runner contracts for remote MCP connections and connection-level Agent access.
read_when:
  - changing MCP Server tRPC procedures
  - changing connection, secret, discovery, runner, or grant schemas
---

# Connections API

The App uses the Haus Server `mcp` tRPC router:

- `mcp.add`
- `mcp.addPresetAccount`
- `mcp.list`
- `mcp.startOAuth`
- `mcp.refresh`
- `mcp.replaceHeaders`
- `mcp.replacePresetToken`
- `mcp.disconnect`
- `mcp.delete`
- `mcp.setGrant`

`mcp.add` accepts one HTTPS remote endpoint plus no auth, secret headers, or MCP OAuth
configuration. Public connection reads expose header names and discovered tool names, never secret
values. Preset creation resolves immutable Server-owned coordinates; every preset creates an `oauth`
connection. `google-calendar` and `github` present a configured Server OAuth client
(`HAUS_GOOGLE_OAUTH_CLIENT_*`, `HAUS_GITHUB_OAUTH_CLIENT_*`) because their authorization servers
offer no dynamic client registration; without it, `mcp.startOAuth` fails with the client reported
unavailable. Server reads that client from its environment on every use and never stores it on the
connection, so a rotated secret reaches existing connections.

`mcp.addPresetAccount` is a union keyed by `preset`: an OAuth preset accepts no token, and a
bearer-token preset (`x`) requires `bearerToken`, a single header-safe token. Server stores it as an
`Authorization: Bearer` secret header and connects immediately; the token is never returned.
`mcp.replacePresetToken` swaps that token and clears grants; `mcp.replaceHeaders` rejects
bearer-token presets.

`mcp.startOAuth` creates Server-held PKCE and routing state. On a loopback Server the App sends the
callback as `http://127.0.0.1:<port>/mcp/oauth/callback`, never `localhost`, because providers such
as GitHub accept an arbitrary port only for the IP literal (RFC 8252 §7.3). The hosted callback validates state;
Server exchanges the code, persists tokens and client registration, and performs refresh. Computer
does not participate.

`mcp.setGrant` stores one `(Server, Agent, connection)` grant. Enabling it makes every current tool
on the connection available to that Agent.

Computer exposes a fixed `execute` tool. Its search, schema lookup, and invocation call scoped
Server endpoints through the current per-run loopback proxy:

```txt
GET  /api/agent/mcp/tools
POST /api/agent/mcp/invoke
POST /api/agent/mcp/cancel
```

Discovery and invocation carry a fresh UUID in `x-haus-mcp-request-id`. Cancellation posts
`{requestId}` using the same runner credential; ids and credentials never enter generated code.
Server matches both credential and request id, so a revoked runner may cancel its own already
registered work but cannot start work or cancel another runner. A valid runner may cancel before
dispatch; Server retains that cancellation for up to 65 seconds in a bounded registry. Cancellation
is best effort across network loss, and upstream deadlines still apply.

Discovery with `?query=keywords` returns up to 50 matching tool summaries and the total match count,
without input schemas. Search includes the connection name. `?name=exact-tool-name` returns only
that tool's full schema; an unfiltered request returns the full granted catalog.
Invocation resolves the tool, rechecks the grant, and invokes the upstream MCP from
Server. Computer never receives MCP secrets, OAuth tokens, or upstream session state.

MCP `2026-07-28` servers (GitHub's among them) can mark tool arguments with `x-mcp-header`, and
reject a `tools/call` that lacks the matching `Mcp-Param-*` header with JSON-RPC `-32020`.
`@ai-sdk/mcp` derives those headers only from a `tools/list` on the same client, so Server lists a
client's tools once before its first call (`callMcpTool` in
`apps/server/src/server-mcp/tool-catalog.ts`). Discovery on that client counts; a rebuilt client
lists again.

Invocation returns the upstream tool result. When that result carries `structuredContent`, Server
drops the text block holding the same JSON, because a server that returns structured output also
serializes it for text-only clients and Haus reads the structured form. Non-text content blocks and
`isError` results are returned untouched.

Discovery runs concurrently with a five-second deadline for each granted connection. Unavailable
connections contribute no tools to that search; healthy connections remain available. Invocation
has a 30-second upstream deadline. Client cancellation interrupts the request through Computer
and Server without closing other Agents' healthy shared client operations.

Server keeps one shared MCP client per connection and retires it only when a failure proves the
session broken (`apps/server/src/server-mcp/client-failure.ts`). A per-call deadline, caller
cancellation, JSON-RPC error, or non-session HTTP status cancels only that request; the client and
its concurrent calls continue. A closed transport, network failure, HTTP 404 (expired session),
401/403 or OAuth failure, or initialize failure retires the client: new calls build a fresh one,
calls already in flight on the old client run to completion, and the old client closes when they
finish. Disconnecting the connection or stopping Server still aborts every in-flight call.

Runner failures are JSON `{code, message, retryable?}` with stable codes:

- `MCP_DENIED` (403) — the connection grant or requested tool is absent or revoked
- `MCP_AUTH_REQUIRED` (424) — the upstream account must be reconnected, including a 401/403,
  an OAuth refresh failure, or a grant that needs a new browser flow
- `MCP_TIMEOUT` (424) — the bounded upstream operation expired
- `MCP_UNAVAILABLE` (424) — another upstream or Server MCP failure

Upstream failures use 424 Failed Dependency, never 5xx: the production edge replaces origin 5xx
bodies with an HTML page, which would erase the typed error. `MCP_UNAVAILABLE` messages name a
safe upstream reason: the HTTP status, or the JSON-RPC code plus a short sanitized copy of the
upstream message (single line, at most 200 characters, URLs and credential-shaped text redacted).
Response bodies and URLs never leave Server (`apps/server/src/server-mcp/upstream-failure.ts`).
Computer turns any unreadable, non-JSON, or mis-shaped Server response into `MCP_UNAVAILABLE`
naming the HTTP status (`apps/computer/src/server-mcp-response.ts`), and its loopback proxy answers
an unreadable or over-1-MiB Server body with a typed JSON error.

`connected` describes retained connection identity, not momentary upstream health. These transient
failures do not disconnect the account or erase its connection-level Agent grants.

`accountLabel` is the upstream `serverInfo.name` unless a preset resolves the signed-in identity
over its own authenticated MCP client: the GitHub preset calls the server's `get_me` tool and uses
the returned `login`. Any failure there falls back to `serverInfo.name`; a label never fails
discovery.

## Connection Icons

`icon` on a connection is `{ light, dark }`, each an inline `data:` image URI or `null`, or the
whole field is `null`. It is identity-derived state: Haus Server resolves it during discovery
beside `accountLabel`, and clears it wherever identity is cleared.

Resolution order is the MCP server's advertised `serverInfo.icons` (SEP-973), then `/favicon.ico`
on the site behind its host, then the icon `<link>`s (`icon`, `shortcut icon`, `apple-touch-icon`)
in that site's home page `<head>` — the step that covers SPAs whose `/favicon.ico` is the HTML
shell. Page links are ranked like advertised icons (smallest declared size of at least 64px first;
an unsized `apple-touch-icon` counts as 180px), must share the page's origin, and at most three are
tried. The page itself must be `text/html` and is read up to 256 KiB. Server fetches and inlines the bytes, so the contract never carries a
remote URL — an `img` pointed at a connection's own host would report the viewer's IP and page
views back to that operator on every render.

Constraints the Server enforces before storing: HTTPS only, no redirects, PNG/JPEG/WebP/ICO only,
at most 64 KiB per variant enforced against the response stream, declared media type must match the
bytes, an advertised icon URL must share the connection URL's origin, and a page-linked icon must
share the site's origin. That last rule is what
keeps a remote server from steering Server-side fetches at arbitrary hosts.

SVG is refused outright. It is the one image format that can carry script or pull subresources, and
screening it safely needs a parser rather than a token blocklist; at icon scale it buys nothing, so
a server advertising only SVG falls through to its favicon.

One icon serving both themes is stored in `light` alone and the App falls back to it, so a
connection never carries the same bytes twice on a query that returns every row inline.

A preset connection always reads its bundled mark (`mcpPresetIcons` in `@haus/api`), because
Haus curates it at full resolution while discovery often finds only a small favicon. Server applies
that at the read boundary, so the stored row stays the discovery result and every client gets the
same mark; the App draws the same
bundled marks on Recommended presets before they exist. A custom connection has no fallback.

Icons refresh on connect and refresh, exactly like `accountLabel`. A connection created before this
shipped reads `icon: null` until its next refresh; there is no backfill.

## Connection Summary

`summary` is the server's own one-line description, or `null`. Like `icon` it is identity-derived:
Server takes it during discovery from the `instructions` the server returns at initialize, and
clears it wherever identity is cleared.

Those instructions are written for a model, not a reader — a real server returns thousands of
characters cataloguing every tool it offers. Server keeps only the opening line, trimmed and capped
at 200 characters, because that is the part that reads as a description. A connection whose server
sends no instructions has `summary: null`, and the App falls back to showing the endpoint.
