---
summary: Server tRPC and runner contracts for remote MCP connections and connection-level Agent access.
read_when:
  - changing MCP Server tRPC procedures
  - changing connection, secret, discovery, runner, or grant schemas
---

# Connections API

The App uses the Haus Server `mcp` tRPC router:

- `mcp.connectSkool`
- `mcp.add`
- `mcp.addPresetAccount`
- `mcp.list`
- `mcp.presetIcons`
- `mcp.startOAuth`
- `mcp.refresh`
- `mcp.replaceHeaders`
- `mcp.replacePresetToken`
- `mcp.disconnect`
- `mcp.delete`
- `mcp.setGrant`

`mcp.add` accepts one HTTPS remote endpoint plus no auth, secret headers, or MCP OAuth
configuration. Public connection reads expose header names and discovered tool names, never secret
values. Preset creation resolves immutable Server-owned coordinates; each preset fixes its authentication kind. CoinGecko creates a keyless `none`
connection to `https://mcp.api.coingecko.com/sse` and discovers tools immediately. `google-calendar` and `github` present a configured Server OAuth client
(`HAUS_GOOGLE_OAUTH_CLIENT_*`, `HAUS_GITHUB_OAUTH_CLIENT_*`) because their authorization servers
offer no dynamic client registration; without it, `mcp.startOAuth` fails with the client reported
unavailable. Server reads that client from its environment on every use and never stores it on the
connection, so a rotated secret reaches existing connections.

`cloudflare` and `vercel` create OAuth connections to `https://mcp.cloudflare.com/mcp`
and `https://mcp.vercel.com`, respectively. They use MCP OAuth discovery with no preset
scope overrides or static credentials. Creating either account grants no Agent access.

`merchbase-atlas` creates an OAuth connection to `https://atlas.merchbase.co/mcp`
with `openid profile email` scopes and Clerk dynamic client registration. It needs no
configured Server client or static token.

`merchbase-fulfillment` creates an OAuth connection to
`https://fulfillment.merchbase.co/mcp/printful` with `openid profile email` scopes.
It uses Clerk dynamic client registration, with no configured Server client or static token.
Printful store linking remains an upstream tool flow after MerchBase authentication.

`mcp.addPresetAccount` is a union keyed by `preset`: OAuth and keyless presets accept no token, and a
bearer-token preset (`x`) requires `bearerToken`, a single header-safe token. Server stores it as an
`Authorization: Bearer` secret header and connects immediately; the token is never returned.
`mcp.replacePresetToken` swaps that token and clears grants; `mcp.replaceHeaders` rejects
bearer-token presets.

`mcp.startOAuth` creates Server-held PKCE and routing state. On a loopback Server the App sends the
callback as `http://127.0.0.1:<port>/mcp/oauth/callback`, never `localhost`, because providers such
as GitHub accept an arbitrary port only for the IP literal (RFC 8252 §7.3). The hosted callback validates state;
Server exchanges the code, persists tokens and client registration, and performs refresh. Computer
does not participate.

`mcp.connectSkool` accepts the isolated desktop session and checks Server Owner/Admin
access. It provisions a verified account through the Server-owned Skool process and
stores an ordinary header-auth connection. Its stable logical URL is
`https://hosted-mcp.haus.invalid/skool/mcp`; only the Skool preset maps that identifier
to private transport. The connector endpoint and control credential never enter the
public API. No network route serves that logical URL.

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
whole field is `null`. It is service branding, independent of the signed-in account.
Disconnecting or starting a new sign-in clears account identity and grants while retaining the icon.

Custom resolution order is the MCP server's advertised `serverInfo.icons` (SEP-973), then `/favicon.ico`
on the site behind its host, then the icon `<link>`s (`icon`, `shortcut icon`, `apple-touch-icon`)
in that site's home page `<head>` — the step that covers SPAs whose `/favicon.ico` is the HTML
shell. Page links are ranked like advertised icons (smallest declared size of at least 64px first;
an unsized `apple-touch-icon` counts as 180px), must share the page's origin, and at most three are
tried. The page itself must be `text/html` and is read up to 256 KiB. Server fetches and inlines the bytes, so the contract never carries a
remote URL — an `img` pointed at a connection's own host would report the viewer's IP and page
views back to that operator on every render.

Constraints the Server enforces before storing: HTTPS only, PNG/JPEG/WebP/ICO only,
at most 64 KiB per variant enforced against the response stream, declared media type must match the
bytes except for PNG favicons served as ICO, which are stored as PNG. An advertised icon URL must
share the connection URL's origin, and a page-linked icon must
share the final homepage's origin. Requests follow at most three redirects, each restricted to
the initial hostname or its exact `www.` counterpart, with the same HTTPS port and no URL
credentials. Relative icon links resolve against the final homepage URL. Other hosts, plaintext
redirects, and longer chains fall back to the monogram, keeping remote servers from steering
Server-side fetches at arbitrary hosts.

SVG is refused outright. It is the one image format that can carry script or pull subresources, and
screening it safely needs a parser rather than a token blocklist; at icon scale it buys nothing, so
a server advertising only SVG falls through to its favicon.

One icon serving both themes is stored in `light` alone and the App falls back to it, so a
connection never carries the same bytes twice on a query that returns every row inline.

Legacy curated presets retain their bundled marks (`mcpPresetIcons` in `@haus/api`).
Cloudflare, Vercel, MerchBase Atlas, and Fulfillment own their icons upstream. Recommended, preset creation, legacy
connection reads, and authenticated discovery share the Server's connection-branding resolver.
Preset fallback discovery prefers the homepage's advertised icon links over `/favicon.ico`,
regardless of sign-in state, so publisher-owned versioned assets replace cached legacy favicons.
Authenticated discovery first uses standard MCP icon metadata. Failed resolution retains the last
valid stored icon. `mcp.presetIcons` requires Server membership. Server shares anonymous lookups
in a bounded five-minute cache, including unavailable artwork; authenticated icon metadata bypasses
that cache. The App also caches the catalog for five minutes and makes no upstream image requests.
Missing artwork falls back to a monogram when no valid image has been resolved.

Preset creation stores branding before sign-in. Icons refresh on connect and tool refresh.
Existing preset connections with missing or malformed icons resolve branding on authorized reads,
without requiring another sign-in. Those read-time fallbacks do not rewrite PostgreSQL records.

## Connection Summary

`summary` is the server's own one-line description, or `null`. It is account-derived:
Server takes it during discovery from the `instructions` the server returns at initialize, and
clears it wherever identity is cleared.

Those instructions are written for a model, not a reader — a real server returns thousands of
characters cataloguing every tool it offers. Server keeps only the opening line, trimmed and capped
at 200 characters, because that is the part that reads as a description. A connection whose server
sends no instructions has `summary: null`, and the App falls back to showing the endpoint.
