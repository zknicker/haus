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
- `mcp.disconnect`
- `mcp.delete`
- `mcp.setGrant`

`mcp.add` accepts one HTTPS remote endpoint plus no auth, secret headers, or MCP OAuth
configuration. Public connection reads expose header names and discovered tool names, never secret
values. Preset creation resolves immutable Server-owned coordinates.

`mcp.startOAuth` creates Server-held PKCE and routing state. The hosted callback validates state;
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

Invocation returns the upstream tool result. When that result carries `structuredContent`, Server
drops the text block holding the same JSON, because a server that returns structured output also
serializes it for text-only clients and Haus reads the structured form. Non-text content blocks and
`isError` results are returned untouched.

Discovery runs concurrently with a five-second deadline for each granted connection. Unavailable
connections contribute no tools to that search; healthy connections remain available. Invocation
has a 30-second upstream deadline. Client cancellation interrupts the request through Computer
and Server without closing other Agents' healthy shared client operations.

Runner failures use stable codes:

- `MCP_DENIED` — the connection grant or requested tool is absent or revoked
- `MCP_AUTH_REQUIRED` — the upstream account must be reconnected
- `MCP_TIMEOUT` — the bounded upstream operation expired
- `MCP_UNAVAILABLE` — another upstream or Server MCP failure

`connected` describes retained connection identity, not momentary upstream health. These transient
failures do not disconnect the account or erase its connection-level Agent grants.

## Connection Icons

`icon` on a connection is `{ light, dark }`, each an inline `data:` image URI or `null`, or the
whole field is `null`. It is identity-derived state: Haus Server resolves it during discovery
beside `accountLabel`, and clears it wherever identity is cleared.

Resolution order is the MCP server's advertised `serverInfo.icons` (SEP-973), then the favicon of
the site behind its host. Server fetches and inlines the bytes, so the contract never carries a
remote URL — an `img` pointed at a connection's own host would report the viewer's IP and page
views back to that operator on every render.

Constraints the Server enforces before storing: HTTPS only, no redirects, PNG/JPEG/WebP/ICO only,
at most 64 KiB per variant enforced against the response stream, declared media type must match the
bytes, and an advertised icon URL must share the connection URL's origin. That last rule is what
keeps a remote server from steering Server-side fetches at arbitrary hosts.

SVG is refused outright. It is the one image format that can carry script or pull subresources, and
screening it safely needs a parser rather than a token blocklist; at icon scale it buys nothing, so
a server advertising only SVG falls through to its favicon.

One icon serving both themes is stored in `light` alone and the App falls back to it, so a
connection never carries the same bytes twice on a query that returns every row inline.

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
