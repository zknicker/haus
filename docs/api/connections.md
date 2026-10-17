---
summary: Server tRPC and runner contracts for remote MCP connections, GitHub installations and the setup route, Linear workspace team membership, and connection-level Agent access.
read_when:
  - changing MCP Server tRPC procedures
  - changing connection, secret, discovery, runner, or grant schemas
  - changing the `github` tRPC router or `/github/setup`
  - changing `linear.workspaces` or `linear.identities` team fields, or Linear tool refusal codes
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
(`HAUS_GOOGLE_OAUTH_CLIENT_*`, and the Haus GitHub App's `HAUS_GITHUB_APP_CLIENT_*`) because their
authorization servers offer no dynamic client registration; without it, `mcp.startOAuth` fails
with the client reported unavailable. Server reads that client from its environment on every use
and never stores it on the connection, so a rotated secret reaches existing connections. The
GitHub App client sends no `scope` (a GitHub App has permissions, not scopes), and its preset
header asks the hosted MCP for `X-MCP-Toolsets: default,actions,code_security,dependabot`.

`mcp.delete` on a GitHub connection is GitHub-aware: in one transaction it marks every armed
`github` Trigger on the connection's installations `installation_removed` (one `trigger_problem`
notice each), tombstones the installations, and only then deletes the connection. The notified
Agents are woken after commit.

`cloudflare` creates an OAuth connection to `https://mcp.cloudflare.com/mcp` through MCP OAuth
discovery with no preset scope overrides or static credentials. Creating an account grants no
Agent access. `vercel` is not an accepted preset; previously saved Vercel accounts migrate to
custom connections (`preset: null`) without changing their configuration, secrets, or grants.

`merchbase-atlas` creates an OAuth connection to `https://atlas.merchbase.co/mcp`
with `openid profile email` scopes and Clerk dynamic client registration. It needs no
configured Server client or static token.

`handmade` creates an OAuth connection to `https://handmade.merchbase.co/mcp`
with `openid profile email` scopes and Clerk dynamic client registration. It needs no
configured Server client or static token. Etsy shop authorization remains upstream in Handmade.
Creating the connection grants no Agent access.

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
does not participate. The OAuth provider reads stored tokens on every request, so a refresh another
Server path performs (the GitHub user token, below) reaches live MCP clients at once.

`mcp.connectSkool` accepts the isolated desktop session and checks Server Owner/Admin
access. It provisions a verified account through the Server-owned Skool process and
stores an ordinary header-auth connection. Its stable logical URL is
`https://hosted-mcp.haus.invalid/skool/mcp`; only the Skool preset maps that identifier
to private transport. The connector endpoint and control credential never enter the
public API. No network route serves that logical URL.

`mcp.setGrant` stores one `(Server, Agent, connection)` grant. Enabling it makes every current tool
on the connection available to that Agent, including tools added later.

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

Server uses the official `@modelcontextprotocol/client` SDK. It negotiates modern HTTP MCP
with legacy fallback, aggregates paginated tool lists, caches responses per connection, and derives
`Mcp-Param-*` headers from `x-mcp-header` declarations. Invocation supplies the resolved tool
definition after rechecking the grant, so protocol recovery cannot silently retry a write call
with a later tool schema.

The Server inventory starts with Server, independently of Agent sessions, turns, and searches.
Tool-change notifications refresh it immediately, with SDK debouncing. Modern subscription streams
are renewed when they end. A jittered five-minute reconciliation covers legacy servers, missed
notifications, and reconnects; failed connections back off up to fifteen minutes. A successful
complete list replaces the saved names, including removals and an empty catalog. Failed discovery
retains the last successful inventory. Changed names publish `mcp.onUpdated`; the App invalidates
its React Query connection reads. Reading the App cache does not discover upstream tools.

`mcp.refresh` remains an Owner/Admin diagnostic API; ordinary operation needs no manual refresh.

Invocation returns the upstream tool result. When that result carries `structuredContent`, Server
drops the text block holding the same JSON, because a server that returns structured output also
serializes it for text-only clients and Haus reads the structured form. Non-text content blocks and
`isError` results are returned untouched.

Background discovery runs in batches of four with a five-second deadline per connection.
Agent searches read the last successful in-memory definitions and current grants without upstream
requests. Connections not yet successfully discovered contribute no tools. Invocation
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

## GitHub Installations

The built-in GitHub connection ([GitHub App connection](../../specs/github-app-connection.md)) adds
the `github` tRPC router. Schemas live in `@haus/api` `github.ts`; `installationId` is always the
Haus row (`ghi_…`) and `githubInstallationId` GitHub's number. Every procedure needs a configured
App (else `BAD_REQUEST github_app_unconfigured`) except `installations`, and refusal messages lead
with a stable reason (`github_owner_required: …`).

| Procedure | Who | Does |
| --- | --- | --- |
| `github.installations` | member | the connection's bound installations |
| `github.startInstall` | Owner or Admin | stores single-use state (32 bytes, 15 minutes, bound to Server, connection, and user) and returns `https://github.com/apps/<slug>/installations/new?state=…` |
| `github.installCandidates` | Owner or Admin | unbound installations from `GET /user/installations` that pass the owner check |
| `github.bindInstallation` | Owner or Admin | reruns the owner check and binds; `CONFLICT github_installation_already_bound` when another Server or connection holds it |
| `github.unbindInstallation` | Owner or Admin | degrades dependent Triggers and tombstones the installation |
| `github.repositories` | Owner or Admin | the picker: the connection user's accessible repositories (private names included), read live, refreshing the cache |

Owner authority is GitHub's: `GET /user/memberships/orgs/{org}` must answer `state: active`,
`role: admin`, or a user account's id must equal `GET /user`'s. Installation facts come only from
`GET /app/installations/{id}` with the App JWT. A GitHub outage is `BAD_GATEWAY github_unavailable`;
a missing or rejected user token is `BAD_REQUEST github_sign_in_required`.

`GET /github/setup` is GitHub's setup URL. It consumes the install state once, binds, and
redirects to `<app origin>/s/<slug>/settings/connections/<connectionId>?github_setup=<outcome>`,
where the outcome is `bound`, `requested` (a member asked an owner; nothing bound), or a refusal
reason. Missing, expired, or replayed state answers a `400` page and binds nothing. An update
redirect (`setup_action=update`, no state) only prompts reconciliation of a bound installation.
Install state is Server memory, like MCP OAuth state; a restart forgets it, and
`github.installCandidates` recovers.

Server-side GitHub reads use the connection's user token (`mcp_secrets`) and refresh it once on a
401 (`apps/server/src/github/user-token.ts`); a rejected refresh is `github_sign_in_required`.
Agents have no GitHub installation route; they reach repositories through GitHub's hosted MCP
tools and name a GitHub account on their Triggers ([Triggers API](triggers.md)).

## Linear Workspaces

The built-in Linear connection ([Linear app](../../specs/linear-app.md)) adds the `linear` tRPC
router; schemas live in `@haus/api` `linear.ts`. Each `linear.workspaces` row carries `teams`
(every team the Haus app reaches) and `memberTeamIds` (the subset the Haus app user is a member
of). Each `linear.identities` row carries the identity's own `memberTeamIds`, empty until it is
installed and synced. Both are as of the last team sync. Membership matters because a team's
settings (workflow states, team labels) change only through a member; an identity joins exactly
the teams the Haus app is a member of ([team scope](../../specs/linear-app.md#team-scope)).

An Agent with an active identity always writes as that identity and never falls back to the Haus
app. A write where a target team is outside the identity's effective access fails with
`linear_team_outside_access`, and a team settings write where the identity is not a member of
every target team fails with `linear_team_membership_required`; both messages name the Agent's
Linear app and the teams, and say where a workspace admin changes it under Linear → Settings →
Applications → the Agent → Team access. An Agent without an identity writes through the Haus app,
and its team settings write fails with `linear_team_membership_required` naming Haus when the Haus
app is not a member of every target team ([error codes](../../specs/linear-app.md#error-codes)).

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
Handmade, Cloudflare, MerchBase Atlas, and Fulfillment own their icons upstream. Recommended, preset creation,
Linear binding, the startup repair, and authenticated discovery share the Server's connection-branding resolver.
Preset fallback discovery prefers the homepage's advertised icon links over `/favicon.ico`,
regardless of sign-in state, so publisher-owned versioned assets replace cached legacy favicons.
Authenticated discovery first uses standard MCP icon metadata. Failed resolution retains the last
valid stored icon. `mcp.presetIcons` requires Server membership. Server shares anonymous lookups
in a bounded five-minute cache, including unavailable artwork; authenticated icon metadata bypasses
that cache. The App also caches the catalog for five minutes and makes no upstream image requests.
Missing artwork falls back to a monogram when no valid image has been resolved.

Icons resolve at write time and are stored on the connection; `mcp.list` is a pure PostgreSQL read
and never fetches. Preset creation stores branding before sign-in. Icons refresh on connect and
tool refresh. A Linear install resolves Linear's brand icon before its binding transaction (never
under the Server lock) and stores it on the new connection; a reconnect fills a missing icon. A
failed lookup stores `null` and never fails the install. Preset connections stored with a missing
or malformed icon, and no bundled mark, recover through a bounded background repair after Server
startup, which stores each resolved icon and announces `mcp.onUpdated` for its Server.
`mcp.presetIcons` (the Recommended catalog) still resolves on read behind the five-minute cache;
the App loads it beside the list and falls back to bundled marks or monograms until it arrives.

## Connection Summary

`summary` is the server's own one-line description, or `null`. It is account-derived:
Server takes it during discovery from the `instructions` the server returns at initialize, and
clears it wherever identity is cleared.

Those instructions are written for a model, not a reader — a real server returns thousands of
characters cataloguing every tool it offers. Server keeps only the opening line, trimmed and capped
at 200 characters, because that is the part that reads as a description. A connection whose server
sends no instructions has `summary: null`, and the App falls back to showing the endpoint.
