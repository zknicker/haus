---
summary: Authentication boundaries for humans, Computer attachments, managed Agents, and providers.
read_when:
  - changing Cloudflare Access identity, Server authorization, Computer credentials, or Agent runner access
  - changing secret custody or provider-session behavior
  - changing the browser or native sign-in flow
  - changing how App WebSockets authenticate, refresh, or close
---

# Auth

| Boundary | Credential and authority |
| --- | --- |
| Human App → Server | Short-lived opaque Haus session plus Server membership and role checks |
| Sign-in → Haus session | Fresh Cloudflare Access assertion for the exact Haus identity |
| Computer management → Server | Machine-local Computer login session; setup authority only |
| Computer attachment → Server | Revocable credential scoped to one Server Computer |
| Computer runner → Server | Per-launch Agent runner credential, held behind the localhost proxy |
| Managed Agent → Computer | Per-launch local proxy token file; never valid at Server |
| Computer → provider | Native Codex, Claude Code, Grok Build, or Pi login owned by that runtime |

Cloudflare Access protects only `/auth/complete` and `/auth/session` on
`haus.chat`. Haus Server verifies the signed assertion against the configured
issuer and audience, resolves its exact subject and verified-email alias to a
canonical Haus User, then mints opaque session credentials. The assertion is
never sent to tRPC, Computer, Agent, or provider routes. The application uses
Haus access tokens after admission; every Server operation still applies its
own membership and role checks.

Haus stores SHA-256 hashes of access and resume tokens. Access lasts at most 60
seconds and is capped at the assertion expiry. The resume credential lasts at
most 14 days, but it has no independent authority: every resume needs a fresh
Cloudflare assertion for the same external subject and canonical Haus User.
The Haus session id stays stable while access rotates. Local sign-out revokes
that session immediately and closes its tracked WebSocket and SSE connections;
access expiry closes them without an extra grace period.

## Browser flow

`GET /auth/start` creates a one-use server intent and a short-lived HttpOnly
state cookie, then redirects to `/auth/complete`. The state cookie uses
`SameSite=Lax` so the browser sends it on Cloudflare's top-level return. The
completion route verifies the state, a fresh Access assertion, and the stored
intent before setting the HttpOnly resume cookie and redirecting to the safe
local return route.

The browser obtains `AppSession` with `GET /auth/session`. The request includes
the resume cookie, a fresh Access assertion, `X-Haus-Session-Request: 1`, and
same-origin provenance. The Server rejects missing markers, cross-origin
requests, and cross-site fetches. Responses are `no-store`. `POST /auth/logout`
uses the same provenance check, revokes the session, and clears the cookie.

Production cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`, with the
`__Host-` prefix. Development uses HTTP-compatible cookie names scoped by the
Server port so parallel worktrees do not replace one another's cookies.

## Native flow

`GET /auth/config` returns the Cloudflare issuer, public client id, resource,
and broker callback. Native clients own a PKCE S256 verifier and state. They
call `GET /auth/start` with the client, exact callback URI, state, and challenge.
Native callers may also send `switchAccount=true`; it does not change the
stored callback or PKCE binding. The Server stores the intent and redirects to
Cloudflare's Managed OAuth authorization endpoint. `/auth/callback` consumes the server state once and
forwards only the authorization code and the originally stored native state to
the exact stored callback.

The native client exchanges the code directly with Cloudflare using the
original verifier and broker callback URI. It keeps Cloudflare access and
refresh credentials in `safeStorage` or Keychain. It sends a fresh Cloudflare
assertion to `POST /auth/session`, which returns `NativeAppSession`; the
Cloudflare credential and Haus resume token never enter a renderer. Native
sign-out revokes the Haus session through `/auth/logout` and clears its
protected credential store. The native request includes
`X-Haus-Session-Request: 1`; the Server also rejects a mismatched `Origin` or a
`Sec-Fetch-Site` value other than `same-origin` or `none`.

## App sessions and realtime

The App sends its opaque Haus access token as `Authorization: Bearer` for HTTP
and `sessionToken` in WebSocket connection params. The first authenticated
operation binds a socket to that canonical Haus User and Haus session id.
`session.refresh` accepts a rotated access token only for that same user and
session. The Server checks the current access token at each operation start,
closes sockets and SSE streams at expiry, and rechecks membership at each
realtime delivery.

The desktop main process may share an `AppSession` between its own windows for
fast startup. Cloudflare credentials and the Haus resume token stay in native
storage and never enter renderer state. Browser and native caches are scoped by
canonical `user.id`; signing out clears the session, scoped cache, and live
connections.

## Other credentials

Server stores Computer, runner, MCP, and hosted OAuth secrets. Computer stores
attachment credentials and local proxy tokens in private files. Operators
authenticate through each execution runtime's native flow; provider
credentials never reach Haus Server or App.

A Computer Secrets 1Password service account token is the one secret the App
hands to a Computer. The desktop App creates it, Server relays it once in
memory to the Owner's chosen Computer without persisting or logging it, and
the Computer keeps it only in the login macOS Keychain
([Computer Secrets](../features/computer-secrets.md)).

Claude's isolated Agent home cannot read the host's macOS Keychain login
directly. At each native start, Computer resolves the current host-owned login
and supplies its access token only in the Claude bridge process environment.
It never writes the token into Agent files or persisted bridge turn settings,
and it leaves explicit native environment authentication intact. Missing native
credentials fail with a sign-in instruction. Other runtimes reference their
native credential files while preserving separate Agent homes and sessions.

Do not place secrets in Messages, prompts, logs, execution reports, E2E
fixtures, checked-in env files, or App cache.
